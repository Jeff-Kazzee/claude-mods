import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On, RenderElement } from 'claude-code'

import type { Delegate, ProcessRecord } from '../types'

const T0 = 1_800_000_000_000
const CWD = 'C:\\work'
const OUTPUT = 'C:\\tmp\\claude\\proj\\sess\\tasks\\a1.output'
const EMPTY: RenderElement = { type: 'Box' }
const PRESENTATION = { isFullscreen: true, columns: 160 }

type World = {
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  statuses: (string | undefined)[]
  fills: string[]
  agents: AgentInfo[]
  store: Map<string, unknown>
}

const world = (on: On, entries: Record<string, unknown> = {}): World => {
  const w: World = {
    clock: mock.clock(on, { now: T0 }),
    toasts: [],
    statuses: [],
    fills: [],
    agents: [],
    store: new Map(Object.entries(entries).map(([key, value]) => [key, structuredClone(value)])),
  }
  on('store.get', (_$, e) => ({ value: structuredClone(w.store.get(e.key)) }))
  on('store.set', (_$, e) => (w.store.set(e.key, structuredClone(e.value)), { value: undefined }))
  on('store.delete', (_$, e) => (w.store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...w.store.keys()] }))
  on('session.id', () => ({ value: 'S1' }))
  on('session.cwd', () => ({ value: CWD }))
  on('agent.list', () => ({ value: w.agents }))
  on('ui.status', (_$, e) => (w.statuses.push(e.text), { value: undefined }))
  on('ui.toast', (_$, e) => (w.toasts.push(e.text), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_$, e) => (w.fills.push(e.text), { isFilled: true }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-opus-5-5', agentId: e.tool_use_id.replace(/^t-/, '') }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', () => EMPTY)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  return w
}

const compose = async ($: Engine, traits: 'teammate'[] = []) =>
  (
    await $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces: ['terminal'],
      tools: [],
      outputStyle: null,
      traits,
    })
  ).sections

const begin = ($: Engine) => $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

const spawnAgent = async ($: Engine, agentId: string, prompt: string) => {
  await $.agent.spawn({
    tool_use_id: `t-${agentId}`,
    prompt,
    description: `Review ${agentId}`,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
}

// The kit has no store beneath session.append and refuses a test hook that
// answers a row without next, so the call always rejects after the plugin's
// hook has read the row.
const append = (row: Promise<unknown>) =>
  expect(row).rejects.toThrow('no implementation for session.append')

const notify = ($: Engine, id: string, status: string) =>
  append($.session.append({
    message: {
      type: 'user',
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<task-notification>\n<task-id>${id}</task-id>\n<output-file>${OUTPUT}</output-file>\n<status>${status}</status>\n</task-notification>`,
        },
      ],
    },
    door: 'prompt',
    origin: { kind: 'task-notification' },
    uuid: `u-${id}-${status}`,
  }))

const mine = (w: World): Delegate[] => {
  const own = [...w.store.entries()].find(([key]) => key.startsWith('proc:') && key !== 'proc:dead')
  return own === undefined ? [] : (own[1] as ProcessRecord).delegates
}

test('a background agent goes running, unread, nagged once, then used when its output is read', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'contents' }))
  await begin($)
  await spawnAgent($, 'a1', 'Review the PR per C:\\briefs\\review.md and report.')
  expect(mine(w)).toMatchObject([
    { id: 'a1', state: 'running', model: 'claude-opus-5-5', briefPath: 'C:\\briefs\\review.md', sessionId: 'S1' },
  ])
  expect(w.statuses.at(-1)).toBe('1 delegate running')

  await notify($, 'a1', 'completed')
  expect(mine(w)).toMatchObject([{ state: 'done-unread', outcome: 'completed', outputFile: OUTPUT }])
  expect(w.statuses.at(-1)).toBe('1 delegate result unread')

  await w.clock.advance(5 * 60_000)
  expect(w.toasts).toEqual(['Agent "Review a1" finished 5 minutes ago. Nobody has read its result.'])
  await w.clock.advance(5 * 60_000)
  expect(w.toasts).toHaveLength(1)

  await $.tool.call({ tool: 'Read', file_path: OUTPUT, tool_use_id: 'r1' })
  expect(mine(w)).toMatchObject([{ state: 'done-used', usedVia: 'cited by a Read call' }])
  expect(w.statuses.at(-1)).toBeUndefined()

})

test('a turn that answers a hand-back marks the result used', async ($, on) => {
  const w = world(on)
  await begin($)
  await spawnAgent($, 'a2', 'Explore the scheduler.')
  const handback = 'Another Claude session sent a message:\n<agent-message from="a2">\n[Subagent hand-back] The text below is the final report'
  await append(
    $.session.append({
      message: { type: 'user', role: 'user', isMeta: true, content: [{ type: 'text', text: handback }] },
      door: 'prompt',
      origin: { kind: 'peer' },
      uuid: 'u-a2',
    }),
  )
  expect(mine(w)).toMatchObject([{ state: 'done-unread' }])
  await $.turn.start({ text: handback, turnId: 'turn-9' })
  await $.turn.complete({ answer: 'The scheduler review found two bugs.', durationMs: 10, isAborted: false, turnId: 'turn-9', reason: 'answer' })
  expect(mine(w)).toMatchObject([{ state: 'done-used', usedVia: 'answered in the turn it started' }])
})

test('a background shell is recorded with its redacted command and fails on its notification', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b7' },
  }))
  await begin($)
  await $.tool.call({
    tool: 'Bash',
    command: 'API_TOKEN=abcd1234efgh5678 pnpm test',
    description: 'Run the test suite',
    run_in_background: true,
    tool_use_id: 'bash-1',
  })
  expect(mine(w)).toMatchObject([
    { id: 'b7', kind: 'shell', state: 'running', description: 'Run the test suite', brief: 'API_TOKEN=[redacted] pnpm test' },
  ])
  await notify($, 'b7', 'failed')
  expect(mine(w)).toMatchObject([{ state: 'done-unread', outcome: 'failed' }])
})

test('a foreground agent returns inline and counts as used', async ($, on) => {
  const w = world(on)
  on('tool.call', { tool: 'Agent' }, () => ({
    result: {
      status: 'completed',
      agentId: 'a3',
      content: [{ type: 'text', text: 'done' }],
      totalToolUseCount: 1,
      totalDurationMs: 5,
      totalTokens: 9,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        cache_creation: null,
      },
      prompt: 'Count the files.',
      resolvedModel: 'claude-haiku-5',
    },
  }))
  await begin($)
  await $.tool.call({ tool: 'Agent', description: 'Count files', prompt: 'Count the files.', tool_use_id: 'ag-1' })
  expect(mine(w)).toMatchObject([
    { id: 'a3', state: 'done-used', isBackground: false, usedVia: 'returned inline', model: 'claude-haiku-5' },
  ])
})

test('the tick reconciles a killed agent from the agent list', async ($, on) => {
  const w = world(on)
  await begin($)
  await spawnAgent($, 'a4', 'Work.')
  w.agents.push({ id: 'a4', description: 'Review a4', type: 'general-purpose', status: 'killed' })
  await w.clock.advance(60_000)
  expect(mine(w)).toMatchObject([{ state: 'done-unread', outcome: 'killed' }])
})

test('a reload does not orphan this process, an exit does', async ($, on) => {
  const w = world(on)
  await begin($)
  await spawnAgent($, 'a5', 'Work.')
  await begin($)
  expect(mine(w)).toMatchObject([{ state: 'running' }])
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'S1', resume: { id: 'S1' } })
  expect(mine(w)).toMatchObject([{ state: 'orphaned', isSettled: false }])
})

const STALE: ProcessRecord = {
  processId: 'dead',
  heartbeatAt: T0 - 10 * 60_000,
  delegates: [
    {
      id: 'a9',
      kind: 'agent',
      processId: 'dead',
      sessionId: 'S0',
      cwd: 'c:/work',
      description: 'Review PR 101',
      agentType: 'general-purpose',
      model: 'claude-opus-5-5',
      brief: 'Review PR 101 per C:\\briefs\\pr101.md.',
      briefPath: 'C:\\briefs\\pr101.md',
      isBackground: true,
      startedAt: T0 - 20 * 60_000,
      lastActivityAt: T0 - 12 * 60_000,
      state: 'running',
    },
  ],
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a restart orphans stale work and the band relaunches it on ${surface}`, async ($, on) => {
    const w = world(on, { 'proc:dead': STALE })
    await begin($)
    const swept = w.store.get('proc:dead') as ProcessRecord
    expect(swept.delegates).toMatchObject([{ id: 'a9', state: 'orphaned', isSettled: false }])

    const band = await $.ui.mount({
      plugin: 'delegate-ledger',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} },
    })
    expect((await band.find({ type: 'Text', text: /still running when an earlier session here ended/ }))?.text).toBeDefined()
    await band.press({ key: 'relaunch:a9' })
    expect(w.fills).toHaveLength(1)
    expect(w.fills[0]).toContain('Relaunch the subagent "Review PR 101".')
    expect(w.fills[0]).toContain('Its brief is C:\\briefs\\pr101.md.')
    expect((w.store.get('proc:dead') as ProcessRecord).delegates).toMatchObject([{ isSettled: true }])
    expect(await band.find({ key: 'relaunch:a9' })).toBeUndefined()
    await band.unmount()
  })

  test(`the pane lists rows newest first and marks one used by hand on ${surface}`, async ($, on) => {
    const w = world(on)
    await begin($)
    await spawnAgent($, 'old', 'First.')
    await notify($, 'old', 'completed')
    await spawnAgent($, 'new', 'Second.')
    const opened = await $.command.run({ command: 'delegates', args: '', origin: { kind: 'composer' }, presentation: PRESENTATION })
    expect(opened.text).toBe('Opened the delegate ledger.')
    const pane = await $.ui.mount({
      plugin: 'delegate-ledger',
      surface,
      component: 'Pane',
      requestId: 'delegates',
      props: { title: 'Delegates', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    const rows = await pane.findAll({ type: 'Text', text: /^Review / })
    expect(rows.map(r => r.text)).toEqual(['Review new', 'Review old'])
    await pane.press({ key: 'used:old' })
    expect((mine(w)).find(d => d.id === 'old')).toMatchObject({ state: 'done-used', usedVia: 'marked by hand' })
    expect(await pane.find({ key: 'used:old' })).toBeUndefined()
    await pane.unmount()
  })
}

const running = (id: string, fields: Partial<Delegate> = {}): Delegate =>
  ({
    id,
    kind: 'agent',
    processId: 'dead',
    sessionId: 'S0',
    cwd: 'c:/work',
    description: `Task ${id}`,
    brief: `Do ${id}.`,
    isBackground: true,
    startedAt: T0 - 20 * 60_000,
    lastActivityAt: T0 - 12 * 60_000,
    state: 'running',
    ...fields,
  }) as Delegate

const deadProcess = (...delegates: Delegate[]): ProcessRecord => ({ processId: 'dead', heartbeatAt: T0 - 10 * 60_000, delegates })

test('a restart puts the orphans in the system prompt, and the text holds for the session', async ($, on) => {
  const w = world(on, {
    'proc:dead': deadProcess(
      running('a9', { description: 'Review PR 101', briefPath: 'C:\briefs\pr101.md' }),
      running('b3', {
        kind: 'shell',
        description: 'Deploy with ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345',
        startedAt: T0 - 3 * 60 * 60_000,
      }),
      running('far', { cwd: 'C:/elsewhere' }),
      { ...running('settled'), state: 'orphaned', orphanedAt: T0 - 60_000, isSettled: true },
      { ...running('done'), state: 'done-unread', finishedAt: T0 - 60_000, outcome: 'completed', isNagged: false },
    ),
  })
  await begin($)
  const first = await compose($)

  expect(first.map(section => section.id)).toEqual(['intro', 'delegate-ledger:orphans'])
  const text = first.at(-1)?.text ?? ''
  expect(first.at(-1)?.scope).toBe('session')
  expect(text.split('\n').filter(line => line.startsWith('- '))).toEqual([
    '- Agent "Review PR 101", brief C:\briefs\pr101.md, started 20m ago.',
    '- Background command "Deploy with [redacted]", no brief path recorded, started 3h ago.',
  ])
  expect(text).toContain('Check what each one finished before you rely on it.')
  expect(text.includes(String.fromCharCode(0x2014)) || text.includes(';')).toBe(false)

  await w.clock.advance(2 * 60 * 60_000)
  await begin($)
  const band = await $.ui.mount({
    plugin: 'delegate-ledger',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} },
  })
  await band.press({ key: 'relaunch:a9' })
  await band.unmount()
  expect(w.fills).toHaveLength(1)
  expect((await compose($)).at(-1)?.text).toBe(text)
})

test('the orphans section stops at five, and is left out with no orphans or for a teammate', async ($, on) => {
  world(on, { 'proc:dead': deadProcess(...['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'].map(id => running(id))) })
  await begin($)

  const lines = ((await compose($)).at(-1)?.text ?? '').split('\n').filter(line => line.startsWith('- '))
  expect(lines).toHaveLength(5)
  expect((await compose($, ['teammate'])).map(section => section.id)).toEqual(['intro'])
})

test('a fresh start with no dead process adds no section', async ($, on) => {
  world(on)
  await begin($)
  expect((await compose($)).map(section => section.id)).toEqual(['intro'])
})
