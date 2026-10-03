import type { Best, Climb, Criterion, Failure, Loop, Measurement, Outcome, Phase, RoundRecord, Rubric, Score, TurnEnd } from '../types'

export type Verdict = { outcome: Exclude<Outcome, 'baseline'>; note: string }

const EPSILON = 1e-9
const SPARKS = '▁▂▃▄▅▆▇█'
const KEPT_ROUNDS = 200

export function normalize(criterion: Criterion, raw: number): number {
  const { min, max } = criterion.scale
  const share = criterion.direction === 'up' ? (raw - min) / (max - min) : (max - raw) / (max - min)
  return Math.min(10, Math.max(0, share * 10))
}

export function measurementOf(criteria: readonly Criterion[], results: readonly (Score | Failure)[]): Measurement {
  const scores = results.filter((result): result is Score => 'raw' in result)
  const failures = results.filter((result): result is Failure => 'error' in result)
  if (failures.length > 0) return { isComplete: false, scores, failures }
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0)
  const weighted = criteria.reduce((sum, criterion) => {
    const score = scores.find(one => one.id === criterion.id)?.score ?? 0
    return sum + criterion.weight * score
  }, 0)
  return { isComplete: true, scores, weighted: weighted / total }
}

export function weakest(rubric: Rubric, scores: readonly Score[]): { criterion: Criterion; score: Score } | undefined {
  let found: { criterion: Criterion; score: Score } | undefined
  for (const criterion of rubric.criteria) {
    const score = scores.find(one => one.id === criterion.id)
    if (score === undefined || criterion.weight === 0) continue
    const isWeaker =
      found === undefined ||
      score.score < found.score.score - EPSILON ||
      (Math.abs(score.score - found.score.score) <= EPSILON && criterion.weight > found.criterion.weight)
    if (isWeaker) found = { criterion, score }
  }
  return found
}

export function isWorse(criterion: Criterion, now: number, before: number): boolean {
  return criterion.direction === 'up' ? now < before - EPSILON : now > before + EPSILON
}

const TURN_ENDS: Record<Exclude<TurnEnd, 'answer'>, string> = {
  aborted: "The round's turn was interrupted.",
  refusal: "The round's turn ended in a refusal.",
  error: "The round's turn ended on an API error.",
}

export function decide(rubric: Rubric, best: Best, turnEnd: TurnEnd, hasChange: boolean, measurement: Measurement | null): Verdict {
  if (turnEnd !== 'answer') return { outcome: 'inconclusive', note: TURN_ENDS[turnEnd] }
  if (!hasChange) return { outcome: 'reverted', note: 'No change in the workdir.' }
  if (measurement === null) return { outcome: 'inconclusive', note: 'Nothing was measured.' }
  if (!measurement.isComplete) {
    return { outcome: 'inconclusive', note: measurement.failures.map(failure => `${failure.id} failed: ${failure.error}`).join(' ') }
  }
  for (const id of rubric.guards) {
    const criterion = rubric.criteria.find(one => one.id === id)
    const now = measurement.scores.find(one => one.id === id)
    const before = best.scores.find(one => one.id === id)
    if (criterion !== undefined && now !== undefined && before !== undefined && isWorse(criterion, now.raw, before.raw)) {
      return { outcome: 'reverted', note: `Guard ${id} got worse: ${num(before.raw)} to ${num(now.raw)}.` }
    }
  }
  if (measurement.weighted <= best.weighted + EPSILON) {
    return { outcome: 'reverted', note: `Score did not rise: ${fixed(measurement.weighted)} against best ${fixed(best.weighted)}.` }
  }
  return { outcome: 'kept', note: `Score rose from ${fixed(best.weighted)} to ${fixed(measurement.weighted)}.` }
}

export function activeMinutes(climb: Climb, now: number): number {
  const running = climb.activeSince === null ? 0 : now - climb.activeSince
  return (climb.activeMs + running) / 60_000
}

export function stopReason(climb: Climb, now: number): string | undefined {
  const { rubric, best } = climb
  const round = lastRound(climb)
  if (best.weighted >= rubric.target - EPSILON) return `Reached the target: ${fixed(best.weighted)} of ${fixed(rubric.target)}.`
  if (round >= rubric.budget.maxRounds) return `Ran all ${rubric.budget.maxRounds} rounds.`
  if (climb.noGainStreak >= rubric.stopAfterNoGain) return `No gain in ${climb.noGainStreak} rounds in a row.`
  if (activeMinutes(climb, now) >= rubric.budget.maxMinutes) return `Used the ${rubric.budget.maxMinutes} minute budget.`
  return undefined
}

export function lastRound(climb: Climb): number {
  return climb.rounds.at(-1)?.round ?? 0
}

export function markerFor(climbId: string, round: number): string {
  return `[climb ${climbId} round ${round}]`
}

export function queuedPhase(climb: Climb): Phase {
  const round = lastRound(climb) + 1
  return { kind: 'queued', round, marker: markerFor(climb.id, round) }
}

export function halt(climb: Climb, phase: Phase, now: number): Climb {
  const activeMs = climb.activeSince === null ? climb.activeMs : climb.activeMs + (now - climb.activeSince)
  return { ...climb, phase, activeMs, activeSince: null }
}

export type Settled = {
  round: number
  at: number
  hypothesis: string
  measurement: Measurement | null
  verdict: Verdict
  commit: string
  haltReason: string | undefined
}

export function settleRound(climb: Climb, settled: Settled): Climb {
  const { verdict, measurement } = settled
  const record: RoundRecord = {
    round: settled.round,
    at: settled.at,
    hypothesis: settled.hypothesis,
    measurement,
    outcome: verdict.outcome,
    commit: settled.commit,
    note: verdict.note,
  }
  const isGain = verdict.outcome === 'kept' && measurement !== null && measurement.isComplete
  const best: Best = isGain
    ? { round: settled.round, commit: settled.commit, scores: measurement.scores, weighted: measurement.weighted }
    : climb.best
  const next: Climb = {
    ...climb,
    best,
    rounds: [...climb.rounds, record].slice(-KEPT_ROUNDS),
    noGainStreak: isGain ? 0 : climb.noGainStreak + 1,
  }
  const reason = stopReason(next, settled.at)
  if (reason !== undefined) return halt(next, { kind: 'stopped', reason }, settled.at)
  if (climb.afterRound === 'stop') return halt(next, { kind: 'stopped', reason: 'Stopped by /climb stop.' }, settled.at)
  if (settled.haltReason !== undefined) return halt({ ...next, afterRound: 'continue' }, { kind: 'paused', reason: settled.haltReason }, settled.at)
  if (climb.afterRound === 'pause') return halt({ ...next, afterRound: 'continue' }, { kind: 'paused', reason: 'Paused by /climb pause.' }, settled.at)
  return { ...next, phase: queuedPhase(next) }
}

export function parseHypothesis(answer: string): string {
  const lines = [...answer.matchAll(/^\s*\**HYPOTHESIS:?\**:?\s*(.+)$/gim)]
  const text = lines.at(-1)?.[1]?.trim() ?? ''
  return text === '' ? '(the turn gave no HYPOTHESIS line)' : oneLine(redact(text)).slice(0, 300)
}

const SECRETS: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted key]'],
  [/\b(api[_-]?key|token|secret|password|passwd|bearer)(\s*[:=]\s*|\s+)["']?[^\s"']{6,}/gi, '$1$2[redacted]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[redacted]'],
  [/\bxox[abpors]-[A-Za-z0-9-]{10,}/g, '[redacted]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted]'],
  [/(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{32,}/g, '[redacted]'],
]

export function redact(text: string): string {
  return SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

export function oneLine(text: string): string {
  return text.replace(/[\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}

export function fixed(value: number): string {
  return value.toFixed(2)
}

export function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

function scoreLine(rubric: Rubric, criterion: Criterion, score: Score | undefined): string {
  const facts = [
    score === undefined ? 'not measured' : `${score.score.toFixed(1)} (raw ${num(score.raw)})`,
    criterion.direction === 'up' ? 'higher is better' : 'lower is better',
    `weight ${num(criterion.weight)}`,
    ...(rubric.guards.includes(criterion.id) ? ['guard'] : []),
  ]
  return `- ${criterion.id} ${facts.join(', ')}`
}

export function describeMeasure(criterion: Criterion): string {
  const { measure } = criterion
  return measure.kind === 'command'
    ? `the command ${measure.argv.join(' ')}, read with /${measure.parse}/`
    : `a judge (${measure.model}) reading ${measure.files.join(', ')} against this rubric: ${oneLine(measure.rubric)}`
}

export function roundPrompt(climb: Climb, phase: Extract<Phase, { kind: 'queued' }>): string {
  const { rubric, best } = climb
  const low = weakest(rubric, best.scores)
  const recent = climb.rounds.slice(-5).map(record => {
    const score = record.measurement?.isComplete === true ? ` at ${fixed(record.measurement.weighted)}` : ''
    return `- Round ${record.round} ${record.outcome}${score}. Tried ${record.hypothesis.replace(/\.$/, '')}. ${record.note}`
  })
  return [
    `${phase.marker} Hillclimb round ${phase.round} of ${rubric.budget.maxRounds} for "${rubric.name}".`,
    `Work only inside ${rubric.workdir}. Make exactly one hypothesis and one change that tests it. Keep the change small. Do not commit, reset, or push. After this turn the loop measures every criterion. It commits the change if the weighted score rose and no guard got worse, and reverts it otherwise.`,
    '',
    low === undefined
      ? 'No criterion has a score yet.'
      : `The weakest criterion is ${low.criterion.id}, at ${low.score.score.toFixed(1)} of 10 (raw ${num(low.score.raw)}, ${low.criterion.direction === 'up' ? 'higher' : 'lower'} is better). It is measured by ${describeMeasure(low.criterion)}.`,
    `The best weighted score is ${fixed(best.weighted)}, from round ${best.round} (commit ${best.commit.slice(0, 7)}). The target is ${fixed(rubric.target)}.`,
    'Scores at the best commit, each from 0 to 10:',
    ...rubric.criteria.map(criterion => scoreLine(rubric, criterion, best.scores.find(one => one.id === criterion.id))),
    '',
    'Last rounds from the ledger:',
    ...recent,
    '',
    'End your reply with one line that starts with HYPOTHESIS: and says what you changed and why it should raise the score.',
  ].join('\n')
}

export function commitMessage(climb: Climb, round: number, measurement: Extract<Measurement, { isComplete: true }>, hypothesis: string): string {
  const scores = measurement.scores.map(score => `${score.id} ${num(score.raw)}`).join(', ')
  return [
    `climb ${climb.rubric.name} round ${round}: ${fixed(measurement.weighted)} (was ${fixed(climb.best.weighted)})`,
    '',
    `Scores: ${scores}`,
    `Hypothesis: ${hypothesis}`,
  ].join('\n')
}

export function ledgerHeader(rubric: Rubric): string {
  return ['round', 'time', 'hypothesis', ...rubric.criteria.map(criterion => criterion.id), 'weighted', 'outcome', 'commit', 'note'].join('\t')
}

export function ledgerRow(rubric: Rubric, record: RoundRecord): string {
  const cell = (id: string) => {
    if (record.measurement === null) return ''
    const score = record.measurement.scores.find(one => one.id === id)
    if (score !== undefined) return num(score.raw)
    return !record.measurement.isComplete && record.measurement.failures.some(failure => failure.id === id) ? 'fail' : ''
  }
  const weighted = record.measurement?.isComplete === true ? fixed(record.measurement.weighted) : ''
  return [
    String(record.round),
    new Date(record.at).toISOString(),
    oneLine(record.hypothesis),
    ...rubric.criteria.map(criterion => cell(criterion.id)),
    weighted,
    record.outcome,
    record.commit.slice(0, 12),
    oneLine(record.note),
  ].join('\t')
}

export function appendLedger(existing: string, rubric: Rubric, rows: readonly RoundRecord[]): string {
  const header = ledgerHeader(rubric)
  const lastHeader = existing.split('\n').filter(line => line.startsWith('round\t')).at(-1)
  const body = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
  const lines = [...(lastHeader === header ? [] : [header]), ...rows.map(row => ledgerRow(rubric, row))]
  return `${body}${lines.join('\n')}\n`
}

export function sparkline(values: readonly (number | undefined)[]): string {
  return values
    .map(value => (value === undefined ? '·' : SPARKS[Math.round((Math.min(10, Math.max(0, value)) / 10) * (SPARKS.length - 1))]))
    .join('')
}

export function lastComplete(climb: Climb): number | undefined {
  for (const record of [...climb.rounds].reverse()) {
    if (record.measurement?.isComplete === true) return record.measurement.weighted
  }
  return undefined
}

export function phaseWords(phase: Phase): string {
  switch (phase.kind) {
    case 'queued':
      return `waiting to start round ${phase.round}`
    case 'running':
      return `running round ${phase.round}`
    case 'measuring':
      return `measuring round ${phase.round}`
    case 'paused':
      return 'paused'
    case 'stopped':
      return 'stopped'
  }
}

export function statusLine(loop: Loop): string | undefined {
  if (loop.kind === 'idle') return undefined
  if (loop.kind === 'starting') return 'climb baseline'
  const { climb } = loop
  if (climb.phase.kind === 'stopped') return undefined
  const round = 'round' in climb.phase ? climb.phase.round : lastRound(climb)
  const last = lastComplete(climb)
  const suffix = climb.phase.kind === 'paused' ? ' paused' : climb.phase.kind === 'measuring' ? ' measuring' : ''
  return `climb r${round} ${last === undefined ? '--' : last.toFixed(1)} (best ${climb.best.weighted.toFixed(1)})${suffix}`
}

export function summary(loop: Loop): string {
  if (loop.kind === 'idle') {
    return [loop.notice, 'No climb is running. /climb start <path to rubric.json> begins one.'].filter(line => line !== '').join('\n')
  }
  if (loop.kind === 'starting') return `Measuring the baseline of ${loop.name}.`
  const { climb } = loop
  const { rubric, best, phase } = climb
  const low = weakest(rubric, best.scores)
  const pending = climb.afterRound === 'continue' ? '' : ` It will ${climb.afterRound} after this round.`
  const reason = phase.kind === 'paused' || phase.kind === 'stopped' ? ` ${phase.reason}` : ''
  return [
    `${rubric.name} is ${phaseWords(phase)}.${reason}${pending}`,
    `Best ${fixed(best.weighted)} from round ${best.round} (commit ${best.commit.slice(0, 7)}). Target ${fixed(rubric.target)}.`,
    low === undefined ? '' : `The weakest criterion is ${low.criterion.id} at ${low.score.score.toFixed(1)}.`,
    `Round ${lastRound(climb)} of ${rubric.budget.maxRounds}. No gain for ${climb.noGainStreak} of ${rubric.stopAfterNoGain} rounds.`,
    `The ledger is ${rubric.endeavour}/climb-ledger.tsv.`,
  ]
    .filter(line => line !== '')
    .join('\n')
}

export type PaneView = {
  title: string
  detail: string
  criteria: readonly string[]
  history: readonly string[]
  canPause: boolean
  canResume: boolean
  canStop: boolean
}

export function paneView(climb: Climb, columns: number): PaneView {
  const { rubric, best, phase } = climb
  const low = weakest(rubric, best.scores)
  const idWidth = Math.max(...rubric.criteria.map(criterion => criterion.id.length))
  const sparkWidth = Math.max(4, Math.min(40, columns - idWidth - 34))
  const shown = climb.rounds.slice(-sparkWidth)
  const criteria = rubric.criteria.map(criterion => {
    const series = shown.map(record => record.measurement?.scores.find(one => one.id === criterion.id)?.score)
    const now = best.scores.find(one => one.id === criterion.id)
    const marks = [
      ...(low?.criterion.id === criterion.id ? ['weakest'] : []),
      ...(rubric.guards.includes(criterion.id) ? ['guard'] : []),
    ]
    const value = now === undefined ? '  --' : now.score.toFixed(1).padStart(4)
    const raw = now === undefined ? '' : `  raw ${num(now.raw)}`
    return `${criterion.id.padEnd(idWidth)}  ${sparkline(series)}  ${value}${raw}${marks.length > 0 ? `  ${marks.join(', ')}` : ''}`
  })
  const history = [...climb.rounds]
    .reverse()
    .slice(0, 8)
    .map(record => {
      const score = record.measurement?.isComplete === true ? fixed(record.measurement.weighted) : '--'
      const words = record.outcome === 'baseline' ? record.note : `${record.hypothesis.replace(/\.$/, '')}. ${record.note}`
      return `r${record.round} ${record.outcome.padEnd(12)} ${score.padStart(5)}  ${words}`
    })
  const isActive = phase.kind === 'queued' || phase.kind === 'running' || phase.kind === 'measuring'
  const reason = phase.kind === 'paused' || phase.kind === 'stopped' ? ` ${phase.reason}` : ''
  const pending = isActive && climb.afterRound !== 'continue' ? ` It will ${climb.afterRound} after this round.` : ''
  return {
    title: `${rubric.name} is ${phaseWords(phase)}.${reason}${pending}`,
    detail: `Best ${fixed(best.weighted)} from round ${best.round} (${best.commit.slice(0, 7)}). Target ${fixed(rubric.target)}. Round ${lastRound(climb)} of ${rubric.budget.maxRounds}.`,
    criteria,
    history,
    canPause: isActive && climb.afterRound === 'continue',
    canResume: phase.kind === 'paused' || (isActive && climb.afterRound === 'pause'),
    canStop: phase.kind !== 'stopped' && climb.afterRound !== 'stop',
  }
}
