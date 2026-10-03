import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Note } from '../types'
import { ARCHIVED_KEPT, prune, redact } from '../hooks/gallery'

const TOOL = 'mcp__peanut-gallery__note'
const START = Date.UTC(2026, 9, 2, 12, 0)
const PANE_PROPS = {
  title: 'Peanut gallery',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
} as const

function world(on: On, seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed))
  const seen = {
    store,
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    logs: [] as string[],
    writes: [] as { path: string; text: string }[],
    copies: [] as string[],
    opened: [] as string[],
    tools: [] as { name: string; description: string }[],
    session: 'session-1',
  }
  const clock = mock.clock(on, { now: START })
  mock.env(on, { USERPROFILE: 'C:\\Users\\jeffk' })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', ($, e) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.id', () => ({ value: seen.session }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.root', () => ({ value: 'C:\\Users\\jeffk\\AIS-OS\\projects\\vivary' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('tool.register', ($, e) => (seen.tools.push(e), { value: { tool: `mcp__peanut-gallery__${e.name}` } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => (seen.statuses.push(e.text), { value: undefined }))
  on('ui.toast', ($, e) => (seen.toasts.push(e.text), { value: undefined }))
  on('ui.log', ($, e) => (seen.logs.push(e.text), { value: undefined }))
  on('ui.open', ($, e) => (seen.opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.copy', ($, e) => (seen.copies.push(e.text), { value: { isCopied: true } }))
  on('fs.write', ($, e) => (seen.writes.push({ path: e.path, text: e.text }), { value: undefined }))
  return { seen, clock }
}

const START_EVENT = { cwd: 'C:\\Users\\jeffk\\AIS-OS', surface: 'terminal', isInteractive: true } as const

function gallery(args: string) {
  return {
    command: 'gallery',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  } as const
}

const EM_DASH = String.fromCharCode(0x2014)

function breaksWritingFloor(text: string | undefined): boolean {
  return text === undefined || text.includes(EM_DASH) || text.includes(';')
}

function storedNotes(store: Map<string, unknown>): Note[] {
  return [...store.entries()].filter(([key]) => key.startsWith('note:')).map(([, value]) => value as Note)
}

describe('the note tool', () => {
  test('stores a redacted note, answers only Noted, and tells Jeff', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)

    const ran = await $.tool.call({
      tool: TOOL,
      kind: 'criticism',
      text: 'The plan skips tests. Also the key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx in the log.',
      sting: 3,
      about: 'PR #113',
    })

    expect(ran.result).toBe('Noted.')
    expect(seen.tools.map(tool => tool.name)).toEqual(['note'])
    expect(seen.tools[0]?.description).toContain('honest criticism')
    expect(breaksWritingFloor(seen.tools[0]?.description)).toBe(false)
    const [note, ...rest] = storedNotes(seen.store)
    expect(rest).toHaveLength(0)
    expect(note).toMatchObject({
      kind: 'criticism',
      sting: 3,
      about: 'PR #113',
      project: 'vivary',
      sessionId: 'session-1',
      status: 'unread',
      time: START,
      author: { kind: 'main', model: 'claude-opus-5-5' },
    })
    expect(note?.text).toContain('[redacted]')
    expect(note?.text).not.toContain('sk-ant')
    expect(seen.statuses.at(-1)).toBe('gallery 1')
    expect(seen.toasts).toEqual(['A sting 3 criticism landed. Run /gallery to read it.'])
  })

  test('a mild criticism or a comment lands without a toast', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)
    await $.tool.call({ tool: TOOL, kind: 'criticism', text: 'Mild point.' })
    await $.tool.call({ tool: TOOL, kind: 'comment', text: 'A comment.', project: 'Callout' })

    expect(seen.toasts).toHaveLength(0)
    const notes = storedNotes(seen.store)
    expect(notes.find(note => note.kind === 'criticism')).toMatchObject({ sting: 1 })
    expect(notes.find(note => note.kind === 'comment')).toMatchObject({ project: 'Callout' })
    expect(seen.statuses.at(-1)).toBe('gallery 2')
  })

  test('the same text in one session is kept once', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)
    await $.tool.call({ tool: TOOL, kind: 'reminder', text: 'Rotate the Zo key.' })
    const again = await $.tool.call({ tool: TOOL, kind: 'reminder', text: '  rotate the zo   key. ' })

    expect(again.result).toBe('Noted.')
    expect(storedNotes(seen.store)).toHaveLength(1)
  })

  test('an agent stops at five notes a session, and a new session starts over', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)
    for (const n of [1, 2, 3, 4, 5]) {
      expect((await $.tool.call({ tool: TOOL, kind: 'suggestion', text: `Idea ${n}.` })).result).toBe('Noted.')
    }
    const sixth = await $.tool.call({ tool: TOOL, kind: 'suggestion', text: 'Idea 6.' })

    expect(sixth.deny ?? sixth.text).toContain('5 notes per session')
    expect(storedNotes(seen.store)).toHaveLength(5)

    seen.session = 'session-2'
    expect((await $.tool.call({ tool: TOOL, kind: 'suggestion', text: 'Idea 6.' })).result).toBe('Noted.')
    expect(storedNotes(seen.store)).toHaveLength(6)
  })

  test('bad input is refused with the reason and nothing is stored', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)
    const long = await $.tool.call({ tool: TOOL, kind: 'comment', text: 'x'.repeat(401) })
    const kind = await $.tool.call({ tool: TOOL, kind: 'rant', text: 'Too much.' })
    const sting = await $.tool.call({ tool: TOOL, kind: 'criticism', text: 'Sharp.', sting: 5 })

    expect(long.deny ?? long.text).toContain('400')
    expect(kind.deny ?? kind.text).toContain('kind must be one of')
    expect(sting.deny ?? sting.text).toContain('sting must be 1, 2, or 3')
    expect(storedNotes(seen.store)).toHaveLength(0)
  })
})

describe('what the model is told', () => {
  test('the system prompt gains one session section, last', async ($, on) => {
    world(on)
    on('prompt.compose', () => ({
      sections: [
        { id: 'intro', text: 'You are Claude Code.', scope: 'shared' },
        { id: 'memory', text: 'Memory.', scope: 'session' },
      ],
    }))
    const { sections } = await $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces: ['terminal'],
      tools: ['Read', TOOL],
      outputStyle: null,
      traits: [],
    })

    expect(sections.map(section => section.id)).toEqual(['intro', 'memory', 'peanut-gallery:invite'])
    const invite = sections.at(-1)
    expect(invite?.scope).toBe('session')
    expect(invite?.text).toContain('mcp__peanut-gallery__note')
    expect(invite?.text).toContain('honest criticism')
    expect(breaksWritingFloor(invite?.text)).toBe(false)
  })

  test('the note tool is kept in front of ToolSearch so subagents read its description', async ($, on) => {
    world(on)
    on('tool.describe', ($, e) => ({ description: e.description, isDeferred: true }))
    const described = await $.tool.describe({
      tool: TOOL,
      description: 'Leaves Jeff a note.',
      isDeferred: true,
      provider: { plugin: 'peanut-gallery', tier: 'user' },
    })

    expect(described).toEqual({ description: 'Leaves Jeff a note.', isDeferred: false })
  })

  test('a spawned subagent is remembered with its model', async ($, on) => {
    world(on)
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'agent-7' }))
    const started = await $.agent.spawn({
      tool_use_id: 'toolu_1',
      prompt: 'Read the README.',
      description: 'Read the README',
      subagentType: 'Explore',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5-5',
      background: true,
      fork: false,
    })

    expect(started).toEqual({ model: 'claude-haiku-4-5', agentId: 'agent-7' })
  })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`on ${surface}, the pane lists notes newest first and its buttons act`, async ($, on) => {
    const { seen, clock } = world(on)
    await $.session.start(START_EVENT)
    await $.tool.call({ tool: TOOL, kind: 'comment', text: 'Older note.' })
    await clock.advance(5 * 60_000)
    await $.tool.call({ tool: TOOL, kind: 'criticism', text: 'Newer note.', sting: 2, project: 'Callout' })
    await clock.advance(60_000)

    const ui = await $.ui.mount({
      plugin: 'peanut-gallery',
      surface,
      component: 'Pane',
      requestId: 'peanut-gallery',
      props: PANE_PROPS,
    })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)
    expect(texts[0]).toBe('2 unread of 2 notes. 0 archived.')
    const newer = texts.findIndex(text => text === 'Newer note.')
    const older = texts.findIndex(text => text === 'Older note.')
    expect(newer).toBeGreaterThan(0)
    expect(older).toBeGreaterThan(newer)
    expect(texts).toContain('new · criticism, sting 2 · Callout · main session (claude-opus-5-5) · 1m ago')
    expect(texts).toContain('new · comment · vivary · main session (claude-opus-5-5) · 6m ago')

    const byText = (text: string) => storedNotes(seen.store).find(note => note.text === text)
    const olderId = byText('Older note.')?.id
    const newerId = byText('Newer note.')?.id

    await ui.press({ key: `read:${newerId}` })
    expect(byText('Newer note.')?.status).toBe('read')
    expect(seen.statuses.at(-1)).toBe('gallery 1')
    expect(await ui.find({ key: `read:${newerId}` })).toBeUndefined()

    await ui.press({ key: `copy:${newerId}` })
    expect(seen.copies).toEqual(['Newer note.'])

    await ui.press({ key: `archive:${olderId}` })
    expect(byText('Older note.')?.status).toBe('archived')
    expect(seen.statuses.at(-1)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Older note.' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /unread of/ }))?.text).toBe('0 unread of 1 note. 1 archived.')
    await ui.unmount()
  })
}

describe('Jeff reads and exports', () => {
  test('/gallery opens the pane and /gallery export writes the unarchived notes', async ($, on) => {
    const { seen } = world(on)
    await $.session.start(START_EVENT)
    await $.tool.call({ tool: TOOL, kind: 'reminder', text: 'Kept note.' })
    await $.tool.call({ tool: TOOL, kind: 'comment', text: 'Archived note.' })
    const archived = storedNotes(seen.store).find(note => note.text === 'Archived note.')
    const ui = await $.ui.mount({
      plugin: 'peanut-gallery',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'peanut-gallery',
      props: PANE_PROPS,
    })
    await ui.press({ key: `archive:${archived?.id}` })

    await $.command.run(gallery(''))
    expect(seen.opened).toEqual(['peanut-gallery'])

    await $.command.run(gallery('export'))
    expect(seen.writes).toHaveLength(1)
    const [write] = seen.writes
    expect(write?.path).toBe('C:\\Users\\jeffk\\.claude\\mod-data\\peanut-gallery\\notes.md')
    expect(write?.text).toContain('Kept note.')
    expect(write?.text).not.toContain('Archived note.')
    expect(write?.text).toContain('1 note, 1 unread.')
    expect(breaksWritingFloor(write?.text)).toBe(false)
    expect(seen.logs.at(-1)).toBe('Wrote 1 note to C:\\Users\\jeffk\\.claude\\mod-data\\peanut-gallery\\notes.md.')
    await ui.unmount()
  })

  test('a restart loads notes from the store and skips what does not parse', async ($, on) => {
    const kept: Note = {
      id: 'n1',
      time: START - 60_000,
      sessionId: 'old',
      kind: 'suggestion',
      text: 'From yesterday.',
      author: { kind: 'subagent', agentId: 'a1', agentType: 'Explore', model: 'claude-haiku-4-5' },
      status: 'unread',
    }
    const { seen } = world(on, { 'note:n1': kept, 'note:junk': { text: 'no shape' }, other: 1 })
    await $.session.start(START_EVENT)

    expect(seen.statuses.at(-1)).toBe('gallery 1')
    const ui = await $.ui.mount({
      plugin: 'peanut-gallery',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'peanut-gallery',
      props: PANE_PROPS,
    })
    expect(await ui.find({ type: 'Text', text: /subagent Explore \(claude-haiku-4-5\)/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('pure rules', () => {
  test('redact hides secret-shaped text and leaves prose alone', () => {
    const secrets = [
      'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
      'xoxb-1234567890-abcdefghij',
      'AKIAIOSFODNN7EXAMPLE',
      'AIzaSyA1234567890abcdefghijklmnopqrstuv',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      'Authorization: Bearer abc123def456ghi789',
      'API_KEY=hunter22hunter',
      '"password": "s3cretpass"',
      'https://jeff:pa55word@example.com/repo',
      'token Zx9Qw8Er7Ty6Ui5Op4As3Df2Gh1Jk0LmNbVc',
      '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
    ]
    for (const secret of secrets) {
      expect(redact(secret), secret).toContain('[redacted]')
    }
    const prose = [
      'Basic understanding of the plan is missing.',
      'The secret: nobody reads the plan.',
      'Commit 3f2a9c1e5b7d4a6f8e0c2b4d6f8a0c2e4b6d8f0a broke the build.',
      'See /c/Users/jeffk/AIS-OS/projects/vivary/src/main.ts line 40.',
      'The token budget is 5 notes per session.',
    ]
    for (const line of prose) {
      expect(redact(line), line).toBe(line)
    }
  })

  test('prune drops the oldest archived notes past the limit and never an unread one', () => {
    const make = (n: number, status: Note['status']): Note => ({
      id: `${status}-${n}`,
      time: n,
      sessionId: 's',
      kind: 'comment',
      text: `${status} ${n}`,
      author: { kind: 'main' },
      status,
    })
    const archived = Array.from({ length: ARCHIVED_KEPT + 2 }, (_, n) => make(n, 'archived'))
    const unread = [make(-1, 'unread')]
    const { kept, dropped } = prune([...archived, ...unread])

    expect(dropped.map(note => note.id)).toEqual(['archived-1', 'archived-0'])
    expect(kept).toHaveLength(ARCHIVED_KEPT + 1)
    expect(kept.some(note => note.id === 'unread--1')).toBe(true)
  })
})
