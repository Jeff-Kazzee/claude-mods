import { describe, expect, test } from 'claude-code/testing'

import type { Delegate, DelegateFacts, ProcessRecord } from '../types'
import {
  NAG_AFTER_MS,
  STALE_AFTER_MS,
  cite,
  dueForNag,
  finish,
  normalizeForMatch,
  orphanStale,
  pendingOrphans,
  prune,
  reconcileInFlight,
  start,
} from '../hooks/ledger'
import { findBriefPath, parseDeliveries, redact, relaunchPrompt, statusText } from '../hooks/text'

const OUTPUT = 'C:\\Users\\jeffk\\AppData\\Local\\Temp\\claude\\proj\\sess\\tasks\\abd1d5e5b56a0f458.output'

const facts = (id: string, more: Partial<DelegateFacts> = {}): DelegateFacts => ({
  id,
  kind: 'agent',
  processId: 'p1',
  sessionId: 's1',
  cwd: 'C:\\work',
  description: `task ${id}`,
  brief: 'Do the thing.',
  isBackground: true,
  startedAt: 1_000,
  lastActivityAt: 1_000,
  ...more,
})

describe('deliveries', () => {
  test('reads a task notification as the engine writes it', () => {
    const text = [
      '<task-notification>',
      '<task-id>abd1d5e5b56a0f458</task-id>',
      '<tool-use-id>toolu_01URDVAWtnoktnh8yLo2Sz94</tool-use-id>',
      `<output-file>${OUTPUT}</output-file>`,
      '<status>completed</status>',
      '<summary>Agent "Explore" completed</summary>',
      '</task-notification>',
      '<task-notification>',
      '<task-id>bni14gw3k</task-id>',
      '<status>stopped</status>',
      '</task-notification>',
    ].join('\n')
    expect(parseDeliveries(text)).toEqual([
      { id: 'abd1d5e5b56a0f458', outcome: 'completed', outputFile: OUTPUT },
      { id: 'bni14gw3k', outcome: 'killed', outputFile: undefined },
    ])
  })

  test('reads a subagent hand-back and ignores a plain agent message', () => {
    const handback =
      'Another Claude session sent a message:\n<agent-message from="abd1d5e5b56a0f458">\n[Subagent hand-back] The text below is the final report'
    const chat = '<agent-message from="a2">\nStill working on it.'
    expect(parseDeliveries(handback)).toEqual([
      { id: 'abd1d5e5b56a0f458', outcome: 'completed', outputFile: undefined },
    ])
    expect(parseDeliveries(chat)).toEqual([])
  })
})

describe('briefs', () => {
  test('finds the brief file a prompt names', () => {
    const prompt =
      'Build the mod per `C:\\Users\\jeffk\\Vivary-candidates\\mods-research\\build-brief.md`. See https://example.com/a.html too.'
    expect(findBriefPath(prompt)).toBe('C:\\Users\\jeffk\\Vivary-candidates\\mods-research\\build-brief.md')
    expect(findBriefPath('Fix the flaky test in the scheduler.')).toBeUndefined()
  })

  test('redacts secret-shaped text and keeps paths and ids', () => {
    const prompt = [
      'Use key sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx to call it.',
      'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'password: hunter2hunter2',
      'Authorization: Bearer abcdefghijklmnop.qrstuvwxyz123456',
      'Token Xy7Zq2Lm9Np4Rs6Tv8Wx0Yz1Ab3Cd5Ef7Gh9Ij2Kl in a log.',
      `Read ${OUTPUT} and session c2f0cbee-a04f-4ec6-9d4f-27d74376d302 at commit 0123456789abcdef0123456789abcdef01234567.`,
    ].join('\n')
    const out = redact(prompt)
    expect(out).not.toContain('sk-ant-api03')
    expect(out).not.toContain('ghp_abcdef')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('abcdefghijklmnop.qrst')
    expect(out).not.toContain('Xy7Zq2Lm9Np4')
    expect(out).toContain('password: [redacted]')
    expect(out).toContain(OUTPUT)
    expect(out).toContain('c2f0cbee-a04f-4ec6-9d4f-27d74376d302')
    expect(out).toContain('0123456789abcdef0123456789abcdef01234567')
  })

  test('a relaunch prompt carries the brief path and the saved prompt', () => {
    const orphan: Delegate = {
      ...facts('a1', { agentType: 'general-purpose', model: 'claude-opus-5-5', briefPath: 'C:\\b\\brief.md' }),
      state: 'orphaned',
      orphanedAt: 5_000,
      isSettled: false,
    }
    const text = relaunchPrompt(orphan)
    expect(text).toContain('Relaunch the subagent "task a1".')
    expect(text).toContain('It ran as general-purpose on claude-opus-5-5.')
    expect(text).toContain('Its brief is C:\\b\\brief.md.')
    expect(text).toEndWith('Do the thing.')
  })
})

describe('states', () => {
  test('a finished delegate is unread until a later call cites its output file', () => {
    const running = start([], facts('abd1d5e5b56a0f458', { outputFile: OUTPUT }))
    const unread = finish(running, 'abd1d5e5b56a0f458', 2_000, 'completed')
    expect(unread[0]).toMatchObject({ state: 'done-unread', outcome: 'completed', finishedAt: 2_000 })
    const read = JSON.stringify({ tool: 'Read', file_path: OUTPUT })
    const used = cite(unread, normalizeForMatch(read), 3_000, 'cited by a Read call')
    expect(used[0]).toMatchObject({ state: 'done-used', usedVia: 'cited by a Read call', usedAt: 3_000 })
  })

  test('a running delegate is not marked used by a citation', () => {
    const running = start([], facts('a1'))
    expect(cite(running, 'reading a1 now', 2_000, 'reply')).toBe(running)
  })

  test('finish is idempotent and only refines an unknown outcome', () => {
    const once = finish(start([], facts('a1')), 'a1', 2_000, 'ended')
    const refined = finish(once, 'a1', 2_500, 'failed', OUTPUT)
    expect(refined[0]).toMatchObject({ state: 'done-unread', outcome: 'failed', finishedAt: 2_000, outputFile: OUTPUT })
    expect(finish(refined, 'a1', 3_000, 'completed')).toBe(refined)
  })

  test('the nag is due five minutes after the finish', () => {
    const unread = finish(start([], facts('a1')), 'a1', 2_000, 'completed')
    expect(dueForNag(unread, 2_000 + NAG_AFTER_MS - 1)).toHaveLength(0)
    expect(dueForNag(unread, 2_000 + NAG_AFTER_MS)).toHaveLength(1)
  })

  test('the in-flight check ends shells only', () => {
    const list = start(start([], facts('a1')), facts('b1', { kind: 'shell' }))
    const out = reconcileInFlight(list, new Set(), 60_000)
    expect(out.find(d => d.id === 'b1')).toMatchObject({ state: 'done-unread', outcome: 'ended' })
    expect(out.find(d => d.id === 'a1')).toMatchObject({ state: 'running' })
  })

  test('the status line counts running and unread work', () => {
    const list = finish(start(start([], facts('a1')), facts('a2')), 'a1', 2_000, 'completed')
    expect(statusText(list)).toBe('1 delegate running, 1 unread')
    expect(statusText([])).toBeUndefined()
  })
})

describe('restarts', () => {
  const record = (heartbeatAt: number): ProcessRecord => ({
    processId: 'p0',
    heartbeatAt,
    delegates: start([], facts('a1', { processId: 'p0' })),
  })

  test('a record with a fresh heartbeat keeps its running work', () => {
    const live = record(100_000)
    expect(orphanStale(live, 100_000 + STALE_AFTER_MS - 1)).toBe(live)
  })

  test('a stale record orphans its running work, shown only in its own folder', () => {
    const swept = orphanStale(record(100_000), 100_000 + STALE_AFTER_MS)
    expect(swept.delegates[0]).toMatchObject({ state: 'orphaned', isSettled: false })
    expect(pendingOrphans(swept.delegates, 'c:/work')).toHaveLength(1)
    expect(pendingOrphans(swept.delegates, 'C:\\elsewhere')).toHaveLength(0)
  })

  test('prune drops records past the retention window', () => {
    const now = 40 * 24 * 60 * 60_000
    const { keep, drop } = prune([record(now - 1_000), { ...record(1_000), processId: 'old' }], now)
    expect(keep.map(r => r.processId)).toEqual(['p0'])
    expect(drop.map(r => r.processId)).toEqual(['old'])
  })
})
