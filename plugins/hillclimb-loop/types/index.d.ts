export type Direction = 'up' | 'down'

export type CommandMeasure = {
  kind: 'command'
  argv: readonly string[]
  parse: string
  timeoutMs: number
}

export type JudgeMeasure = {
  kind: 'judge'
  model: string
  rubric: string
  files: readonly string[]
  timeoutMs: number
}

export type Measure = CommandMeasure | JudgeMeasure

export type Criterion = {
  id: string
  weight: number
  direction: Direction
  scale: { min: number; max: number }
  measure: Measure
}

export type Rubric = {
  name: string
  path: string
  endeavour: string
  workdir: string
  criteria: readonly Criterion[]
  guards: readonly string[]
  target: number
  budget: { maxRounds: number; maxMinutes: number }
  stopAfterNoGain: number
}

export type Score = { id: string; raw: number; score: number }

export type Failure = { id: string; error: string }

export type Measurement =
  | { isComplete: true; scores: readonly Score[]; weighted: number }
  | { isComplete: false; scores: readonly Score[]; failures: readonly Failure[] }

export type Outcome = 'baseline' | 'kept' | 'reverted' | 'inconclusive'

export type RoundRecord = {
  round: number
  at: number
  hypothesis: string
  measurement: Measurement | null
  outcome: Outcome
  commit: string
  note: string
}

export type Best = {
  round: number
  commit: string
  scores: readonly Score[]
  weighted: number
}

export type TurnEnd = 'answer' | 'aborted' | 'refusal' | 'error'

export type Phase =
  | { kind: 'queued'; round: number; marker: string }
  | { kind: 'running'; round: number; marker: string; turnId: string }
  | { kind: 'measuring'; round: number; hypothesis: string; turnEnd: TurnEnd; evalId: string }
  | { kind: 'paused'; reason: string }
  | { kind: 'stopped'; reason: string }

export type AfterRound = 'continue' | 'pause' | 'stop'

export type Climb = {
  id: string
  rubric: Rubric
  baseCommit: string
  activeMs: number
  activeSince: number | null
  best: Best
  rounds: readonly RoundRecord[]
  noGainStreak: number
  phase: Phase
  afterRound: AfterRound
}

export type Loop =
  | { kind: 'idle'; notice: string }
  | { kind: 'starting'; startId: string; name: string; rubricPath: string }
  | { kind: 'climbing'; climb: Climb }

declare module 'claude-code' {
  interface PluginState {
    'hillclimb-loop': { loop: Loop }
  }
}
