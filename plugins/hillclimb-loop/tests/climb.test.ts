import { expect, test } from 'claude-code/testing'

import { appendLedger, decide, normalize, parseHypothesis, redact, settleRound, sparkline } from '../hooks/climb'
import { parseRubric, resolvePath, sameModel } from '../hooks/rubric'
import type { Climb, Measurement, Rubric } from '../types'
import { RUBRIC_PATH, SAMPLE_RUBRIC, WORKDIR } from './world'

function sample(text = SAMPLE_RUBRIC): Rubric {
  const parsed = parseRubric(text, RUBRIC_PATH)
  if ('errors' in parsed) throw new Error(parsed.errors.join('\n'))
  return parsed.rubric
}

function complete(slop: number, words: number, clarity: number, weighted: number): Measurement {
  return {
    isComplete: true,
    scores: [
      { id: 'slop', raw: slop, score: 0 },
      { id: 'words', raw: words, score: 0 },
      { id: 'clarity', raw: clarity, score: clarity },
    ],
    weighted,
  }
}

function climbOf(rubric: Rubric, overrides: Partial<Climb> = {}): Climb {
  const best = { round: 0, commit: 'a'.repeat(40), scores: complete(22, 111, 6, 3).scores, weighted: 3 }
  return {
    id: 'abcd1234',
    rubric,
    baseCommit: best.commit,
    activeMs: 0,
    activeSince: 0,
    best,
    rounds: [{ round: 0, at: 0, hypothesis: 'baseline', measurement: complete(22, 111, 6, 3), outcome: 'baseline', commit: best.commit, note: '' }],
    noGainStreak: 0,
    phase: { kind: 'measuring', round: 1, hypothesis: 'h', turnEnd: 'answer', evalId: 'e' },
    afterRound: 'continue',
    ...overrides,
  }
}

test('the sample rubric parses and its workdir resolves beside it', () => {
  const rubric = sample()
  expect(rubric.workdir).toBe(WORKDIR)
  expect(rubric.criteria.map(criterion => criterion.measure.kind)).toEqual(['command', 'command', 'judge'])
  expect(rubric.stopAfterNoGain).toBe(3)
  expect(resolvePath('C:\\Users\\jeffk', '..\\climbs\\.\\r.json')).toBe('C:/Users/climbs/r.json')
})

test('a bad rubric names every problem', () => {
  const bad = JSON.stringify({
    name: 'x',
    workdir: 'w',
    criteria: [
      { id: 'a', weight: 1, direction: 'sideways', measure: { command: ['node'], parse: 'no group' } },
      { id: 'b', weight: 1, direction: 'up', measure: { judge: { model: 'haiku', rubric: 'r', files: ['../secret.txt'] } } },
    ],
    guards: ['zzz'],
    target: 11,
    budget: { maxRounds: 0, maxMinutes: 5 },
    stopAfterNoGain: 0,
  })
  const parsed = parseRubric(bad, RUBRIC_PATH)
  expect('errors' in parsed).toBe(true)
  const errors = 'errors' in parsed ? parsed.errors.join('\n') : ''
  expect(errors).toContain('criteria[0].direction')
  expect(errors).toContain('criteria[0].measure.parse')
  expect(errors).toContain('criteria[1].measure.judge.files')
  expect(errors).toContain('target')
  expect(errors).toContain('budget.maxRounds')
  expect(errors).toContain('stopAfterNoGain: cannot be 0')
  expect(parseRubric('{ nope', RUBRIC_PATH)).toMatchObject({ errors: [expect.stringContaining('not valid JSON')] })
})

test('scores map onto 0 to 10 in the right direction and clamp', () => {
  const [slop, words, clarity] = sample().criteria
  if (slop === undefined || words === undefined || clarity === undefined) throw new Error('sample changed')
  expect(normalize(slop, 22)).toBe(0)
  expect(normalize(slop, 10)).toBe(5)
  expect(normalize(slop, 0)).toBe(10)
  expect(normalize(words, 60)).toBe(10)
  expect(normalize(clarity, 7)).toBe(7)
  expect(normalize(clarity, 12)).toBe(10)
})

test('the verdict keeps only a measured gain with no guard worse', () => {
  const rubric = sample()
  const { best } = climbOf(rubric)
  expect(decide(rubric, best, 'answer', true, complete(10, 111, 6, 5)).outcome).toBe('kept')
  expect(decide(rubric, best, 'answer', true, complete(10, 111, 5, 5))).toEqual({ outcome: 'reverted', note: 'Guard clarity got worse: 6 to 5.' })
  expect(decide(rubric, best, 'answer', true, complete(22, 111, 6, 3)).outcome).toBe('reverted')
  expect(decide(rubric, best, 'answer', false, null)).toEqual({ outcome: 'reverted', note: 'No change in the workdir.' })
  expect(decide(rubric, best, 'aborted', true, null).outcome).toBe('inconclusive')
  expect(decide(rubric, best, 'answer', true, { isComplete: false, scores: [], failures: [{ id: 'slop', error: 'timed out.' }] })).toEqual({
    outcome: 'inconclusive',
    note: 'slop failed: timed out.',
  })
})

test('settling a round moves the loop to the next phase or a stop', () => {
  const rubric = sample()
  const kept = { outcome: 'kept' as const, note: 'up' }
  const base = { round: 1, at: 60_000, hypothesis: 'h', commit: 'b'.repeat(40), haltReason: undefined }
  const next = settleRound(climbOf(rubric), { ...base, measurement: complete(10, 111, 6, 5), verdict: kept })
  expect(next.phase).toEqual({ kind: 'queued', round: 2, marker: '[climb abcd1234 round 2]' })
  expect(next.best.weighted).toBe(5)
  expect(next.noGainStreak).toBe(0)

  const atTarget = settleRound(climbOf(rubric), { ...base, measurement: complete(0, 60, 9, 9), verdict: kept })
  expect(atTarget.phase).toEqual({ kind: 'stopped', reason: 'Reached the target: 9.00 of 8.50.' })
  expect(atTarget.activeSince).toBe(null)
  expect(atTarget.activeMs).toBe(60_000)

  const paused = settleRound(climbOf(rubric, { afterRound: 'pause' }), { ...base, measurement: complete(10, 111, 6, 5), verdict: kept })
  expect(paused.phase).toEqual({ kind: 'paused', reason: 'Paused by /climb pause.' })
  expect(paused.afterRound).toBe('continue')

  const reverted = { outcome: 'reverted' as const, note: 'flat' }
  const plateau = settleRound(climbOf(rubric, { noGainStreak: 2 }), { ...base, measurement: complete(22, 111, 6, 3), verdict: reverted, commit: 'a'.repeat(40) })
  expect(plateau.phase).toEqual({ kind: 'stopped', reason: 'No gain in 3 rounds in a row.' })

  const lastRound = climbOf(rubric, { rounds: [{ round: 7, at: 0, hypothesis: 'h', measurement: null, outcome: 'reverted', commit: 'a', note: '' }] })
  expect(settleRound(lastRound, { ...base, round: 8, measurement: null, verdict: reverted }).phase).toEqual({ kind: 'stopped', reason: 'Ran all 8 rounds.' })

  const slow = climbOf(rubric, { activeMs: 29 * 60_000 })
  expect(settleRound(slow, { ...base, measurement: null, verdict: reverted }).phase).toEqual({ kind: 'stopped', reason: 'Used the 30 minute budget.' })
})

test('hypotheses, secrets, sparklines, and the ledger read back plainly', () => {
  expect(parseHypothesis('Did it.\n**HYPOTHESIS:** Fewer\twords\nread faster.')).toBe('Fewer words')
  expect(parseHypothesis('no line here')).toBe('(the turn gave no HYPOTHESIS line)')
  expect(parseHypothesis('HYPOTHESIS: used token=sk-abcdefghijklmnopqrstuv1234')).toBe('used token=[redacted]')
  expect(redact('key ghp_abcdefghijklmnopqrstuvwxyz0123456789 here')).toBe('key [redacted] here')
  expect(redact('commit 0123456789abcdef0123456789abcdef01234567')).toBe('commit 0123456789abcdef0123456789abcdef01234567')
  expect(sparkline([0, 5, 10, undefined])).toBe('▁▅█·')

  const rubric = sample()
  const record = { round: 1, at: Date.UTC(2026, 9, 2), hypothesis: 'a\tb', measurement: complete(10, 100, 7, 5.5), outcome: 'kept' as const, commit: 'c'.repeat(40), note: 'ok' }
  const once = appendLedger('', rubric, [record])
  expect(once).toBe(
    'round\ttime\thypothesis\tslop\twords\tclarity\tweighted\toutcome\tcommit\tnote\n' +
      `1\t2026-10-02T00:00:00.000Z\ta b\t10\t100\t7\t5.50\tkept\t${'c'.repeat(12)}\tok\n`,
  )
  expect(appendLedger(once, rubric, [record]).split('\n').filter(line => line.startsWith('round\t')).length).toBe(1)
  expect(sameModel('claude-opus-5-5[1m]', 'opus')).toBe(true)
  expect(sameModel('haiku', 'claude-opus-5-5')).toBe(false)
})
