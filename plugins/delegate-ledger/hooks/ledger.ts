import type {
  Delegate,
  DelegateFacts,
  DelegateOutcome,
  DelegateUnread,
  DelegateUsed,
  ProcessRecord,
} from '../types'

export const NAG_AFTER_MS = 5 * 60_000
export const STALE_AFTER_MS = 3 * 60_000
export const RETAIN_MS = 14 * 24 * 60 * 60_000
export const KEEP_ENTRIES = 400
export const RECORD_ENTRIES = 200
export const ACTIVITY_STEP_MS = 30_000
const SETTLE_MS = 5_000

const factsOf = (d: Delegate): DelegateFacts => ({
  id: d.id,
  kind: d.kind,
  processId: d.processId,
  sessionId: d.sessionId,
  cwd: d.cwd,
  toolUseId: d.toolUseId,
  description: d.description,
  agentType: d.agentType,
  model: d.model,
  brief: d.brief,
  briefPath: d.briefPath,
  outputFile: d.outputFile,
  parentId: d.parentId,
  isBackground: d.isBackground,
  startedAt: d.startedAt,
  lastActivityAt: d.lastActivityAt,
})

const toUnread = (d: Delegate, at: number, outcome: DelegateOutcome): DelegateUnread => ({
  ...factsOf(d),
  lastActivityAt: Math.max(d.lastActivityAt, at),
  state: 'done-unread',
  finishedAt: at,
  outcome,
  isNagged: false,
})

const toUsed = (d: DelegateUnread, at: number, via: string): DelegateUsed => ({
  ...factsOf(d),
  state: 'done-used',
  finishedAt: d.finishedAt,
  outcome: d.outcome,
  usedAt: at,
  usedVia: via,
})

// Returns the same array when nothing changed, so callers can skip a write.
const mapSome = (list: Delegate[], change: (d: Delegate) => Delegate): Delegate[] => {
  let isChanged = false
  const out = list.map(d => {
    const changed = change(d)
    if (changed !== d) isChanged = true
    return changed
  })
  return isChanged ? out : list
}

export const start = (list: Delegate[], facts: DelegateFacts): Delegate[] => {
  if (!list.some(d => d.id === facts.id)) return [{ ...facts, state: 'running' }, ...list]
  return mapSome(list, d => {
    if (d.id !== facts.id) return d
    const filled = {
      outputFile: d.outputFile ?? facts.outputFile,
      model: d.model ?? facts.model,
      toolUseId: d.toolUseId ?? facts.toolUseId,
      briefPath: d.briefPath ?? facts.briefPath,
    }
    const isSame =
      filled.outputFile === d.outputFile &&
      filled.model === d.model &&
      filled.toolUseId === d.toolUseId &&
      filled.briefPath === d.briefPath
    return isSame ? d : { ...d, ...filled }
  })
}

export const finish = (
  list: Delegate[],
  id: string,
  at: number,
  outcome: DelegateOutcome,
  outputFile?: string,
): Delegate[] =>
  mapSome(list, d => {
    if (d.id !== id) return d
    const file = d.outputFile ?? outputFile
    switch (d.state) {
      case 'running':
        return toUnread({ ...d, outputFile: file }, at, outcome)
      case 'done-unread':
      case 'done-used': {
        const isRefined = d.outcome === 'ended' && outcome !== 'ended'
        if (!isRefined && file === d.outputFile) return d
        return { ...d, outputFile: file, outcome: isRefined ? outcome : d.outcome }
      }
      case 'orphaned':
        return file === d.outputFile ? d : { ...d, outputFile: file }
    }
  })

export const touch = (list: Delegate[], id: string | undefined, at: number): Delegate[] =>
  id === undefined
    ? list
    : mapSome(list, d =>
        d.id === id && at - d.lastActivityAt >= ACTIVITY_STEP_MS ? { ...d, lastActivityAt: at } : d,
      )

export const normalizeForMatch = (text: string): string =>
  text.toLowerCase().replaceAll('\\\\', '/').replaceAll('\\', '/')

const needlesOf = (d: Delegate): string[] =>
  [d.id, d.outputFile]
    .filter((s): s is string => s !== undefined && s.length >= 6)
    .map(normalizeForMatch)

// `haystack` must already be normalized with normalizeForMatch.
export const cite = (
  list: Delegate[],
  haystack: string,
  at: number,
  via: string,
  exceptId?: string,
): Delegate[] =>
  mapSome(list, d =>
    d.state === 'done-unread' && d.id !== exceptId && needlesOf(d).some(n => haystack.includes(n))
      ? toUsed(d, at, via)
      : d,
  )

export const markUsed = (
  list: Delegate[],
  ids: readonly string[],
  at: number,
  via: string,
): Delegate[] =>
  ids.length === 0
    ? list
    : mapSome(list, d => (d.state === 'done-unread' && ids.includes(d.id) ? toUsed(d, at, via) : d))

export const dueForNag = (list: Delegate[], now: number): DelegateUnread[] =>
  list.filter(
    (d): d is DelegateUnread =>
      d.state === 'done-unread' && !d.isNagged && now - d.finishedAt >= NAG_AFTER_MS,
  )

export const markNagged = (list: Delegate[], ids: readonly string[]): Delegate[] =>
  mapSome(list, d =>
    d.state === 'done-unread' && !d.isNagged && ids.includes(d.id) ? { ...d, isNagged: true } : d,
  )

export const settle = (list: Delegate[], id: string): Delegate[] =>
  mapSome(list, d =>
    d.id === id && d.state === 'orphaned' && !d.isSettled ? { ...d, isSettled: true } : d,
  )

export const reconcileAgents = (
  list: Delegate[],
  agents: readonly { id: string; outcome: DelegateOutcome | undefined }[],
  at: number,
): Delegate[] =>
  agents.reduce(
    (acc, agent) => (agent.outcome === undefined ? acc : finish(acc, agent.id, at, agent.outcome)),
    list,
  )

// A shell missing from the engine's in-flight list has ended even if its
// notification never arrived. Agents are left to $.agent.list() because
// nothing documents that their in-flight id is their agentId.
export const reconcileInFlight = (
  list: Delegate[],
  inFlight: ReadonlySet<string>,
  now: number,
): Delegate[] =>
  list
    .filter(
      d =>
        d.state === 'running' &&
        d.kind === 'shell' &&
        now - d.startedAt >= SETTLE_MS &&
        !inFlight.has(d.id),
    )
    .reduce((acc, d) => finish(acc, d.id, now, 'ended'), list)

export const orphanRunning = (list: Delegate[], at: number): Delegate[] =>
  mapSome(list, d =>
    d.state === 'running' ? { ...factsOf(d), state: 'orphaned', orphanedAt: at, isSettled: false } : d,
  )

// A process that crashed never wrote its exit, so a heartbeat older than
// STALE_AFTER_MS stands in for it.
export const orphanStale = (record: ProcessRecord, now: number): ProcessRecord => {
  if (now - record.heartbeatAt < STALE_AFTER_MS) return record
  const delegates = orphanRunning(record.delegates, now)
  return delegates === record.delegates ? record : { ...record, delegates }
}

const newestAt = (record: ProcessRecord): number =>
  Math.max(record.heartbeatAt, ...record.delegates.map(d => d.lastActivityAt))

export const prune = (
  records: readonly ProcessRecord[],
  now: number,
): { keep: ProcessRecord[]; drop: ProcessRecord[] } => {
  const sorted = [...records].sort((a, b) => newestAt(b) - newestAt(a))
  const keep: ProcessRecord[] = []
  const drop: ProcessRecord[] = []
  let entries = 0
  for (const record of sorted) {
    const isFresh = now - newestAt(record) < RETAIN_MS
    const hasRoom = entries + record.delegates.length <= KEEP_ENTRIES
    if (isFresh && hasRoom && record.delegates.length > 0) {
      keep.push(record)
      entries += record.delegates.length
    } else {
      drop.push(record)
    }
  }
  return { keep, drop }
}

export const trim = (list: Delegate[]): Delegate[] =>
  list.length <= RECORD_ENTRIES ? list : newestFirst(list).slice(0, RECORD_ENTRIES)

export const newestFirst = (list: readonly Delegate[]): Delegate[] =>
  [...list].sort((a, b) => b.startedAt - a.startedAt)

export const pendingOrphans = (list: readonly Delegate[], cwd: string): Delegate[] =>
  list.filter(
    d =>
      d.state === 'orphaned' &&
      !d.isSettled &&
      normalizeForMatch(d.cwd) === normalizeForMatch(cwd),
  )
