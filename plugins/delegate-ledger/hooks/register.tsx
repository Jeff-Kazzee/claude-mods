import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Delegate, DelegateFacts, ProcessRecord } from '../types'
import {
  cite,
  dueForNag,
  finish,
  markNagged,
  markUsed,
  newestFirst,
  normalizeForMatch,
  orphanRunning,
  orphanStale,
  pendingOrphans,
  prune,
  reconcileAgents,
  reconcileInFlight,
  settle,
  start,
  touch,
  trim,
} from './ledger'
import {
  age,
  baseName,
  cap,
  describeCommand,
  findBriefPath,
  nagText,
  orphansSection,
  outcomeOfStatus,
  parseDeliveries,
  redact,
  relaunchPrompt,
  shortModel,
  statusText,
} from './text'

type Engine = EngineInterface
type Origin = Pick<DelegateFacts, 'processId' | 'sessionId' | 'cwd'>

const PANE = 'delegates'
const ORPHANS_SECTION = 'delegate-ledger:orphans'
const RECORD = 'proc:'
const TICK_MS = 60_000
const PANE_ROWS = 100
const BAND_ROWS = 4

const processIdAtom = atom({ plugin: 'delegate-ledger', key: 'processId' } as const, '')
const mineAtom = atom({ plugin: 'delegate-ledger', key: 'mine' } as const, [])
const othersAtom = atom({ plugin: 'delegate-ledger', key: 'others' } as const, [])
const orphansTextAtom = atom({ plugin: 'delegate-ledger', key: 'orphansText' } as const, '')

const STATES: ReadonlySet<string> = new Set(['running', 'done-unread', 'done-used', 'orphaned'])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDelegate = (value: unknown): value is Delegate =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.processId === 'string' &&
  typeof value.startedAt === 'number' &&
  typeof value.state === 'string' &&
  STATES.has(value.state)

const parseRecord = (value: unknown): ProcessRecord | undefined =>
  isObject(value) &&
  typeof value.processId === 'string' &&
  typeof value.heartbeatAt === 'number' &&
  Array.isArray(value.delegates)
    ? { processId: value.processId, heartbeatAt: value.heartbeatAt, delegates: value.delegates.filter(isDelegate) }
    : undefined

const EXITS: ReadonlySet<string> = new Set(['prompt_input_exit', 'logout', 'other'])

const deliveredBy = new Map<string, string[]>()
let writing: Promise<void> | undefined
let isDirty = false

const safely = async ($: Engine, work: () => Promise<void>): Promise<void> => {
  try {
    await work()
  } catch (error) {
    $.ui.log(error instanceof Error ? error.message : String(error), { to: 'debug' })
  }
}

const writeRecord = async ($: Engine): Promise<void> => {
  const processId = await read($, processIdAtom)
  const mine = await read($, mineAtom)
  if (processId === '') return
  if (mine.length === 0) return $.store.delete(RECORD + processId)
  const record: ProcessRecord = { processId, heartbeatAt: await $.clock.now(), delegates: trim(mine) }
  await $.store.set(RECORD + processId, record)
}

// One writer per process. A burst of changes coalesces, and the last write
// always reads the newest ledger. `writing` clears in the same step as the
// final dirty check, so a change can never ride a drain that has finished.
const drain = async ($: Engine): Promise<void> => {
  try {
    while (isDirty) {
      isDirty = false
      await writeRecord($)
    }
  } finally {
    writing = undefined
  }
}

const persist = ($: Engine): Promise<void> => {
  isDirty = true
  writing ??= drain($)
  return writing
}

const mutate = async ($: Engine, change: (list: Delegate[]) => Delegate[]): Promise<void> => {
  const before = await read($, mineAtom)
  if (change(before) === before) return
  const after = await update($, mineAtom, change)
  $.ui.status(statusText(after))
  await persist($)
}

const originOf = async ($: Engine): Promise<Origin> => ({
  processId: await read($, processIdAtom),
  sessionId: await $.session.id(),
  cwd: await $.session.cwd(),
})

const sweep = async ($: Engine): Promise<void> => {
  const now = await $.clock.now()
  const own = RECORD + (await read($, processIdAtom))
  const keys = (await $.store.keys()).filter(key => key.startsWith(RECORD) && key !== own)
  const loaded = await Promise.all(keys.map(async key => ({ key, record: parseRecord(await $.store.get(key)) })))
  const unreadable = loaded.flatMap(({ key, record }) => (record === undefined ? [key] : []))
  const records = loaded.flatMap(({ record }) => (record === undefined ? [] : [record]))
  const { keep, drop } = prune(records, now)
  const swept = keep.map(record => orphanStale(record, now))
  await Promise.all([
    ...unreadable.map(key => $.store.delete(key)),
    ...drop.map(record => $.store.delete(RECORD + record.processId)),
    ...swept.flatMap((record, i) => (record === keep[i] ? [] : [$.store.set(RECORD + record.processId, record)])),
  ])
  await update($, othersAtom, () => newestFirst(swept.flatMap(record => record.delegates)))
}

const settleOrphan = async ($: Engine, orphan: Delegate): Promise<void> => {
  await update($, othersAtom, list => settle(list, orphan.id))
  const key = RECORD + orphan.processId
  const record = parseRecord(await $.store.get(key))
  if (record === undefined) return
  const delegates = settle(record.delegates, orphan.id)
  if (delegates !== record.delegates) await $.store.set(key, { ...record, delegates })
}

const relaunch = async ($: Engine, orphan: Delegate): Promise<void> => {
  const text = relaunchPrompt(orphan)
  const box = await $.prompt.read()
  const filled = await $.prompt.fill(
    box.text.trim() === '' ? { text, mode: 'replace' } : { text: `\n\n${text}`, mode: 'append' },
  )
  if (filled.isFilled) await settleOrphan($, orphan)
  else $.ui.toast('The prompt box could not take the relaunch prompt. Close any open dialog and try again.')
}

const markUsedByHand = async ($: Engine, id: string): Promise<void> => {
  const at = await $.clock.now()
  await mutate($, list => markUsed(list, [id], at, 'marked by hand'))
}

const tick = async ($: Engine): Promise<void> => {
  const now = await $.clock.now()
  if ((await read($, mineAtom)).some(d => d.state === 'running' && d.kind === 'agent')) {
    const agents = (await $.agent.list()).map(agent => ({ id: agent.id, outcome: outcomeOfStatus(agent.status) }))
    await mutate($, list => reconcileAgents(list, agents, now))
  }
  const due = dueForNag(await read($, mineAtom), now)
  if (due.length > 0) {
    $.ui.toast(nagText(due), { timeoutMs: 8000 })
    await mutate($, list => markNagged(list, due.map(d => d.id)))
  }
  if ((await read($, mineAtom)).some(d => d.state === 'running')) await persist($)
}

const recordShell = async (
  $: Engine,
  call: { tool_use_id: string; agentId?: string; command: string; description?: string },
  taskId: string | undefined,
  at: number,
): Promise<void> => {
  if (taskId === undefined) return
  const origin = await originOf($)
  const brief = redact(call.command)
  await mutate($, list =>
    start(list, {
      ...origin,
      id: taskId,
      kind: 'shell',
      toolUseId: call.tool_use_id,
      description: describeCommand(call.command, call.description),
      brief: cap(brief),
      briefPath: findBriefPath(brief),
      parentId: call.agentId,
      isBackground: true,
      startedAt: at,
      lastActivityAt: at,
    }),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await safely($, async () => {
      await $.command.register({
        name: 'delegates',
        description: 'List the subagents and background shells this session started',
      })
      if ((await read($, processIdAtom)) === '') {
        await update($, processIdAtom, () => crypto.randomUUID())
        await sweep($)
        const orphans = pendingOrphans(await read($, othersAtom), await $.session.cwd())
        const text = orphansSection(orphans, await $.clock.now())
        await update($, orphansTextAtom, () => text)
      }
      $.ui.status(statusText(await read($, mineAtom)))
      $.clock.every(TICK_MS, () => void safely($, () => tick($)))
    })
    return next(e)
  })

  // A subagent's own system prompt replaces the session's, so the section reaches the main loop and its forks.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const text = e.traits.includes('teammate') ? '' : await read($, orphansTextAtom)
    if (text === '') return composed
    return { sections: [...composed.sections, { id: ORPHANS_SECTION, scope: 'session' as const, text }] }
  })

  on('session.end', async ($, e, next) => {
    if (EXITS.has(e.reason)) {
      await safely($, async () => {
        const at = await $.clock.now()
        await mutate($, list => orphanRunning(list, at))
      })
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    const agentId = ran.agentId
    if (agentId !== undefined) {
      await safely($, async () => {
        const at = await $.clock.now()
        const origin = await originOf($)
        const brief = redact(e.prompt)
        await mutate($, list =>
          start(list, {
            ...origin,
            id: agentId,
            kind: 'agent',
            toolUseId: e.tool_use_id,
            description: redact(e.description),
            agentType: e.subagentType,
            model: ran.model,
            brief: cap(brief),
            briefPath: findBriefPath(brief),
            parentId: e.parentAgentId,
            isBackground: e.background,
            startedAt: at,
            lastActivityAt: at,
          }),
        )
      })
    }
    return ran
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const at = await $.clock.now()
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const result = ran.result
    if (!('status' in result)) return ran
    await safely($, async () => {
      const origin = await originOf($)
      const brief = redact(e.prompt)
      const facts = {
        ...origin,
        kind: 'agent' as const,
        toolUseId: e.tool_use_id,
        description: redact(e.description),
        agentType: e.subagent_type,
        brief: cap(brief),
        briefPath: findBriefPath(brief),
        parentId: e.agentId,
        startedAt: at,
        lastActivityAt: at,
      }
      if (result.status === 'async_launched') {
        await mutate($, list =>
          start(list, {
            ...facts,
            id: result.agentId,
            model: result.resolvedModel,
            outputFile: result.outputFile,
            isBackground: true,
          }),
        )
      } else if (result.status === 'remote_launched') {
        await mutate($, list =>
          start(list, { ...facts, id: result.taskId, outputFile: result.outputFile, isBackground: true }),
        )
      } else {
        const now = await $.clock.now()
        const id = result.agentId
        await mutate($, list =>
          markUsed(
            finish(start(list, { ...facts, id, model: result.resolvedModel, isBackground: false }), id, now, 'completed'),
            [id],
            now,
            'returned inline',
          ),
        )
      }
    })
    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const at = await $.clock.now()
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const taskId = ran.result.backgroundTaskId
      await safely($, () => recordShell($, e, taskId, at))
    }
    return ran
  })

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const at = await $.clock.now()
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      const taskId = ran.result.backgroundTaskId
      await safely($, () => recordShell($, e, taskId, at))
    }
    return ran
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    const id = e.task_id ?? e.shell_id
    if (ran.deny === undefined && ran.isError !== true && id !== undefined) {
      await safely($, async () => {
        const at = await $.clock.now()
        await mutate($, list => finish(list, id, at, 'killed'))
      })
    }
    return ran
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      await safely($, async () => {
        const at = await $.clock.now()
        const haystack = normalizeForMatch(JSON.stringify(e))
        await mutate($, list => touch(cite(list, haystack, at, `cited by a ${e.tool} call`), e.agentId, at))
      })
    }
    return ran
  })

  on('session.append', async ($, e, next) => {
    const text = e.message.content
      .flatMap(block => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
      .join('\n')
    const deliveries = parseDeliveries(text)
    if (deliveries.length > 0) {
      await safely($, async () => {
        const at = await $.clock.now()
        await mutate($, list =>
          deliveries.reduce(
            (acc, d) => (d.outcome === undefined ? acc : finish(acc, d.id, at, d.outcome, d.outputFile)),
            list,
          ),
        )
      })
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    const ids = parseDeliveries(e.text).map(d => d.id)
    if (ids.length > 0) deliveredBy.set(e.turnId, ids)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const answered = e.agentId === undefined && e.reason === 'answer' ? deliveredBy.get(e.turnId) ?? [] : []
    deliveredBy.delete(e.turnId)
    await safely($, async () => {
      const at = await $.clock.now()
      const agentId = e.agentId
      const outcome = e.reason === 'answer' ? 'completed' : e.reason === 'aborted' ? 'killed' : 'failed'
      await mutate($, list => {
        const finished = agentId === undefined ? list : finish(list, agentId, at, outcome)
        const cited = cite(finished, normalizeForMatch(e.answer), at, 'cited in a reply', agentId)
        return markUsed(cited, answered, at, 'answered in the turn it started')
      })
    })
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await safely($, async () => {
      const at = await $.clock.now()
      await mutate($, list => finish(list, e.agent_id, at, 'ended'))
    })
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    const tasks = e.background_tasks
    if (tasks !== undefined && e.agent_id === undefined) {
      await safely($, async () => {
        const now = await $.clock.now()
        const inFlight = new Set(tasks.map(task => task.id))
        await mutate($, list => reconcileInFlight(list, inFlight, now))
      })
    }
    return next(e)
  })

  on('command.run', { command: 'delegates' }, async $ => {
    await safely($, () => sweep($))
    await $.ui.open({ id: PANE, title: 'Delegates' })
    return { text: 'Opened the delegate ledger.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const processId = await read($, processIdAtom)
    const mine = await read($, mineAtom)
    const rows = newestFirst([...mine, ...(await read($, othersAtom))]).slice(0, PANE_ROWS)
    const now = await $.clock.now()
    const summary = statusText(mine) ?? 'Nothing running or unread in this session.'

    const stateOf = (d: Delegate): { label: string; color?: string; isDim: boolean } => {
      switch (d.state) {
        case 'running':
          return { label: 'running', color: 'cyan', isDim: false }
        case 'done-unread':
          return { label: d.outcome === 'failed' ? 'failed' : 'unread', color: d.outcome === 'failed' ? 'red' : 'yellow', isDim: false }
        case 'done-used':
          return { label: 'used', isDim: true }
        case 'orphaned':
          return d.isSettled ? { label: 'orphaned', isDim: true } : { label: 'orphaned', color: 'red', isDim: false }
      }
    }

    const detailsOf = (d: Delegate): string =>
      [
        d.kind === 'agent' ? d.agentType : 'shell',
        d.kind === 'agent' && !d.isBackground ? 'foreground' : undefined,
        shortModel(d.model),
        d.briefPath === undefined ? undefined : `brief ${baseName(d.briefPath)}`,
        d.state === 'done-unread' || d.state === 'done-used' ? `ran ${age(d.finishedAt - d.startedAt)}` : undefined,
        d.state === 'done-used' ? d.usedVia : undefined,
        d.processId === processId ? undefined : 'earlier session',
      ]
        .filter((part): part is string => part !== undefined && part !== '')
        .join(', ')

    return (
      <Box flexDirection="column">
        <Text dimColor>{summary}</Text>
        {rows.length === 0 && <Text dimColor>No subagents or background shells yet.</Text>}
        {rows.map(d => {
          const state = stateOf(d)
          return (
            <Box key={`row:${d.id}`} flexDirection="column" marginTop={1}>
              <Box flexDirection="row" gap={1}>
                <Box width={9} flexShrink={0}>
                  <Text color={state.color} dimColor={state.isDim}>
                    {state.label}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text wrap="truncate-end" dimColor={state.isDim}>
                    {d.description}
                  </Text>
                </Box>
                <Text dimColor>{age(now - d.startedAt)}</Text>
                {d.state === 'done-unread' && d.processId === processId && (
                  <Button key={`used:${d.id}`} label="Mark used" dimColor onPress={() => void markUsedByHand($, d.id)} />
                )}
                {d.state === 'orphaned' && !d.isSettled && (
                  <Button key={`relaunch:${d.id}`} label="Relaunch" onPress={() => void relaunch($, d)} />
                )}
              </Box>
              <Text dimColor wrap="truncate-end">
                {'          '}
                {detailsOf(d)}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const orphans = pendingOrphans(await read($, othersAtom), await $.session.cwd())
    if (orphans.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const below = await next(e)
    const shown = orphans.slice(0, BAND_ROWS)
    const headline =
      orphans.length === 1
        ? 'A delegate was still running when an earlier session here ended.'
        : `${orphans.length} delegates were still running when an earlier session here ended.`
    return (
      <Box flexDirection="column">
        <Text color="yellow">{headline}</Text>
        {shown.map(d => (
          <Box key={`orphan:${d.id}`} flexDirection="row" gap={1}>
            <Box flexGrow={1}>
              <Text wrap="truncate-end">
                {d.kind === 'agent' ? 'Agent' : 'Shell'} "{d.description}", started {age(now - d.startedAt)} ago
              </Text>
            </Box>
            <Button key={`relaunch:${d.id}`} label="Relaunch" onPress={() => void relaunch($, d)} />
          </Box>
        ))}
        {orphans.length > shown.length && (
          <Text dimColor>{orphans.length - shown.length} more are listed in /delegates.</Text>
        )}
        <Box flexDirection="row">
          <Button
            key="dismiss"
            label="Dismiss"
            role="dismiss"
            dimColor
            onPress={() => void Promise.all(orphans.map(d => settleOrphan($, d)))}
          />
        </Box>
        {below}
      </Box>
    )
  })
}
