import { describe, expect, mock, test } from 'claude-code/testing'
import type { ModelCompleteRequest, ModelCompleteResult, On, ToolCallResult } from 'claude-code'

import {
  compileGlobs,
  hasHadPass,
  matchesAny,
  normalizePath,
  parseFindings,
  statusText,
  usesVoice,
} from '../hooks/taste'
import type { TasteReview } from '../types'

const HOME = 'C:/Users/jeff'
const PSTACK = `${HOME}/.claude/plugins/cache/pstack-claude/pstack`
const DEFAULT_GLOBS =
  '**/content/**, **/pr-body*.md, **/issue-comment*.md, **/scratchpad/**/*.html, **/projects/**/*.html'
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const RULES: Record<string, string> = {
  [`${HOME}/.agents/skills/jeff-voice/SKILL.md`]: '---\nname: jeff-voice\n---\nVOICE RULES: a sharp friend.',
  [`${PSTACK}/0.9.10/skills/unslop/SKILL.md`]: '---\nname: unslop\n---\nUNSLOP 0.9.10 RULES',
  [`${PSTACK}/0.9.2/skills/unslop/SKILL.md`]: 'UNSLOP 0.9.2 RULES',
}

const answered = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: USAGE })

type World = {
  asks: ModelCompleteRequest[]
  statuses: (string | undefined)[]
  logs: string[]
  disk: Map<string, string>
  tool: { isError: boolean }
}

const keyOf = (path: string) => path.replace(/\\/g, '/').toLowerCase()

type Reply = ModelCompleteResult | { deny: string }

function world(
  on: On,
  reply: (ask: ModelCompleteRequest) => Reply | Promise<Reply>,
  { isTasteMissing = false } = {},
): World {
  mock.env(on, { USERPROFILE: 'C:\\Users\\jeff' })
  const w: World = { asks: [], statuses: [], logs: [], disk: new Map(), tool: { isError: false } }
  for (const [path, text] of Object.entries(RULES)) w.disk.set(keyOf(path), text)
  const dir = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })

  on('fs.read', ($, e) => {
    if (keyOf(e.path).endsWith('/taste.md')) {
      return isTasteMissing
        ? { deny: `ENOENT ${e.path}` }
        : { value: 'PAST REJECTIONS: crossbones that did not read as bones.' }
    }
    const text = w.disk.get(keyOf(e.path))
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.list', ($, e) => {
    const key = keyOf(e.path)
    if (key === keyOf(`${HOME}/.claude/plugins/cache`)) return { value: [dir('pstack-claude')] }
    if (key === keyOf(PSTACK)) return { value: [dir('0.9.2'), dir('0.9.10')] }
    return { deny: `ENOENT ${e.path}` }
  })
  on('session.cwd', () => ({ value: 'C:/work/scratch' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.status', ($, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    w.logs.push(e.text)
    return { value: undefined }
  })
  on('model.complete', async ($, e) => {
    w.asks.push(e)
    const r = await reply(e)
    return 'deny' in r ? { deny: r.deny } : { value: r }
  })
  on('tool.call', ($, e): ToolCallResult =>
    w.tool.isError ? { isError: true, result: 'failed', text: 'failed' } : { result: {}, text: 'tool ran' },
  )
  return w
}

const write = (file_path: string, content: string) => ({ tool: 'Write' as const, file_path, content })
const edit = (file_path: string) => ({ tool: 'Edit' as const, file_path, old_string: 'a', new_string: 'b' })

describe('globs', () => {
  test('the default globs pick deliverables and skip the rest', () => {
    const globs = compileGlobs(DEFAULT_GLOBS)
    const picked = [
      'C:\\Users\\jeffk\\AIS-OS\\content\\x\\drafts\\post.md',
      'C:/repo/pr-body-12.md',
      'C:/tmp/issue-comment.md',
      'C:/Users/jeffk/AppData/Local/Temp/claude/s/scratchpad/page.html',
      'C:/Users/jeffk/AppData/Local/Temp/claude/s/scratchpad/deep/page.html',
      'C:/Users/jeffk/AIS-OS/projects/site/index.html',
    ]
    const skipped = [
      'C:/Users/jeffk/AIS-OS/projects/site/main.ts',
      'C:/notes/page.html',
      'C:/repo/README.md',
      'C:/repo/contents.md',
    ]
    for (const path of picked) expect(matchesAny(path, globs)).toBe(true)
    for (const path of skipped) expect(matchesAny(path, globs)).toBe(false)
  })

  test('an unrooted glob matches at any depth and braces list alternatives', () => {
    const post = 'C:/Users/jeffk/AIS-OS/content/x/post.md'
    expect(matchesAny(post, compileGlobs('content/**'))).toBe(true)
    expect(matchesAny(post, compileGlobs('*.md'))).toBe(true)
    const braces = compileGlobs('**/*.{md,html}, **/notes/*.txt')
    expect(braces).toHaveLength(2)
    expect(matchesAny('C:/a/page.html', braces)).toBe(true)
    expect(matchesAny('C:/a/b/notes/n.txt', braces)).toBe(true)
    expect(matchesAny('C:/a/main.ts', braces)).toBe(false)
  })
})

describe('paths', () => {
  test('dot segments collapse and only prose under content/ gets the voice rules', () => {
    expect(normalizePath('C:\\work\\scratch\\.\\sub\\..\\report.html')).toBe('C:/work/scratch/report.html')
    expect(usesVoice('C:/Users/jeffk/AIS-OS/content/x/post.md')).toBe(true)
    expect(usesVoice('C:/site/src/content/config.ts')).toBe(false)
    expect(usesVoice('C:/repo/pr-body.md')).toBe(false)
  })
})

describe('parseFindings', () => {
  test('CLEAN, bold or after a remark, means no findings', () => {
    expect(parseFindings('CLEAN')).toEqual([])
    expect(parseFindings('  clean\n')).toEqual([])
    expect(parseFindings('**CLEAN**')).toEqual([])
    expect(parseFindings('No issues. CLEAN')).toEqual([])
  })

  test('a numbered list keeps its continuation lines and caps at six', () => {
    const reply = ['1. "a quote" breaks the floor.', '   Fix it.', '2) "b" hedges.', '3. c', '4. d', '5. e', '6. f', '7. g'].join('\n')
    const found = parseFindings(reply) ?? []
    expect(found).toHaveLength(6)
    expect(found[0]).toBe('"a quote" breaks the floor. Fix it.')
    expect(found[1]).toBe('"b" hedges.')
  })

  test('a reply that is neither a list nor CLEAN is unparsed', () => {
    expect(parseFindings('Here is a better version of the page.')).toBeUndefined()
  })
})

describe('passes', () => {
  const base = { path: 'C:/a/pr-body.md', hash: 'h', via: 'write' as const, at: 0 }

  test('status counts findings, distinct files and failures, and names a review in flight', () => {
    const done: TasteReview[] = [
      { ...base, id: '1', outcome: 'findings', findings: 3 },
      { ...base, id: '2', outcome: 'clean', path: 'C:/a/other.md' },
      { ...base, id: '3', outcome: 'clean', via: 'publish', hash: 'h2' },
      { ...base, id: '4', outcome: 'failed', reason: 'timed out', path: 'C:/a/third.md' },
    ]
    expect(statusText([])).toBeUndefined()
    expect(statusText(done)).toBe('taste 3 findings, 2 files, 1 failed')
    expect(statusText([...done, { ...base, id: '5', outcome: 'pending' }])).toBe('taste reviewing pr-body.md')
  })

  test('a file gets one write pass and one publish pass, and a failure does not use up the pass', () => {
    const wrote: TasteReview[] = [{ ...base, id: '1', outcome: 'findings', findings: 2 }]
    expect(hasHadPass(wrote, 'c:/A/PR-BODY.md', 'new', 'write')).toBe(true)
    expect(hasHadPass(wrote, 'C:/a/pr-body.md', 'new', 'publish')).toBe(false)
    expect(hasHadPass(wrote, 'C:/a/pr-body.md', 'h', 'publish')).toBe(true)
    const published: TasteReview[] = [...wrote, { ...base, id: '2', outcome: 'clean', via: 'publish', hash: 'h2' }]
    expect(hasHadPass(published, 'C:/a/pr-body.md', 'h3', 'publish')).toBe(true)
    const failedOnce: TasteReview[] = [{ ...base, id: '1', outcome: 'failed', reason: 'timed out' }]
    expect(hasHadPass(failedOnce, 'C:/a/pr-body.md', 'h', 'write')).toBe(false)
    const failedTwice: TasteReview[] = [...failedOnce, { ...base, id: '2', outcome: 'failed', reason: 'timed out' }]
    expect(hasHadPass(failedTwice, 'C:/a/pr-body.md', 'h9', 'write')).toBe(true)
  })
})

test('a Write under content/ hands the findings back to the model with the voice rules loaded', async ($, on) => {
  const w = world(on, () => answered('1. "a game-changer" is a marketing adjective. Say what it does.\n2. "In the end, we all learn" is a moral ending. Cut it.'))
  const path = 'C:\\Users\\jeffk\\AIS-OS\\content\\x\\drafts\\post.md'
  w.disk.set(keyOf(path), 'This tool is a game-changer. In the end, we all learn.')

  const ran = await $.tool.call(write(path, 'ignored'))

  expect(ran.deny).toBeUndefined()
  expect(ran.context).toHaveLength(1)
  const note = ran.context?.[0] ?? ''
  expect(note).toStartWith('taste-fork review of C:/Users/jeffk/AIS-OS/content/x/drafts/post.md.')
  expect(note).toContain('Fix each finding before you show Jeff')
  expect(note).toContain('1. "a game-changer" is a marketing adjective.')
  expect(note).toContain('2. "In the end, we all learn" is a moral ending.')

  expect(w.asks).toHaveLength(1)
  const ask = w.asks[0]
  expect(ask?.model).toBe('opus')
  expect(ask?.timeoutMs).toBe(60_000)
  expect(ask?.system).toContain('VOICE RULES')
  expect(ask?.system).toContain('UNSLOP 0.9.10 RULES')
  expect(ask?.system).not.toContain('name: unslop')
  expect(ask?.system).toContain('PAST REJECTIONS')
  expect(ask?.system).toContain('No tidy moral ending')
  expect(ask?.prompt).toContain('This tool is a game-changer.')
  expect(w.statuses).toContain('taste reviewing post.md')
  expect(w.statuses.at(-1)).toBe('taste 2 findings, 1 file')
})

for (const isTasteMissing of [false, true]) {
  test(`the critic prompt says never to flag the attribution line or parentheses, taste.md ${isTasteMissing ? 'missing' : 'read'}`, async ($, on) => {
    const w = world(on, () => answered('CLEAN'), { isTasteMissing })
    w.disk.set(keyOf('C:/repo/pr-body.md'), 'Fixes the leak (both of them).\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')

    await $.tool.call(write('C:/repo/pr-body.md', 'x'))

    const system = w.asks[0]?.system ?? ''
    const doNotFlag = /<do-not-flag>\n([\s\S]*?)\n<\/do-not-flag>/.exec(system)?.[1] ?? ''
    expect(doNotFlag).toContain('Never report them')
    expect(doNotFlag).toContain('`🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end of a PR body')
    expect(doNotFlag).toContain('"a period, a comma, or parentheses", so a parenthetical is allowed')
    expect(system.includes('PAST REJECTIONS')).toBe(!isTasteMissing)
  })
}

test('a file gets one write pass and one publish pass, and its text copied elsewhere gets none', async ($, on) => {
  const w = world(on, () => answered('1. "Maybe" hedges. Commit to the claim.'))
  const page = 'C:/repo/scratchpad/page.html'
  const copy = 'C:/repo/scratchpad/copy.html'
  w.disk.set(keyOf(page), 'Maybe this could possibly help.')
  w.disk.set(keyOf(copy), 'Maybe this could possibly help.')

  expect((await $.tool.call(edit(page))).context).toHaveLength(1)
  w.disk.set(keyOf(page), 'This fixes the leak.')
  expect((await $.tool.call(write(page, 'x'))).context).toBeUndefined()
  expect((await $.tool.call(write(copy, 'x'))).context).toBeUndefined()
  expect((await $.tool.call({ tool: 'Artifact', file_path: page })).context).toHaveLength(1)
  w.disk.set(keyOf(page), 'This fixes both leaks.')
  expect((await $.tool.call({ tool: 'Artifact', file_path: page })).context).toBeUndefined()

  expect(w.asks).toHaveLength(2)
  expect(w.asks[1]?.prompt).toContain('This fixes the leak.')
})

test('a Write outside the globs and a failed Write get no review', async ($, on) => {
  const w = world(on, () => answered('1. "x" is slop.'))
  w.disk.set(keyOf('C:/repo/src/main.ts'), 'export const a = 1')
  w.disk.set(keyOf('C:/repo/pr-body.md'), 'Body text.')

  expect((await $.tool.call(write('C:/repo/src/main.ts', 'x'))).context).toBeUndefined()
  w.tool.isError = true
  const failed = await $.tool.call(write('C:/repo/pr-body.md', 'x'))

  expect(failed.isError).toBe(true)
  expect(failed.context).toBeUndefined()
  expect(w.asks).toHaveLength(0)
})

test('an Artifact publish is reviewed from a path relative to the session, and an asset upload is not', async ($, on) => {
  const w = world(on, () => answered('CLEAN'))
  w.disk.set(keyOf('C:/work/scratch/report.html'), '<h1>Report</h1><p>Two leaks, both fixed.</p>')
  w.disk.set(keyOf('C:/work/scratch/logo.svg'), '<svg/>')

  const published = await $.tool.call({ tool: 'Artifact', file_path: 'report.html' })
  await $.tool.call({ tool: 'Artifact', file_path: 'logo.svg', asset: true, url: 'https://claude.ai/artifact/x' })
  await $.tool.call({ tool: 'Artifact', action: 'list' })

  expect(published.context).toBeUndefined()
  expect(w.asks).toHaveLength(1)
  expect(w.asks[0]?.prompt).toContain('File: C:/work/scratch/report.html')
  expect(w.asks[0]?.system).not.toContain('VOICE RULES')
  expect(w.statuses.at(-1)).toBe('taste 0 findings, 1 file')
})

test('a critic that times out leaves the result as it was, and the next write tries again', async ($, on) => {
  let calls = 0
  const w = world(on, () =>
    ++calls === 1 ? { isAnswered: false, reason: 'aborted', usage: USAGE } : answered('1. "Thanks for" is filler. Cut it.'),
  )
  w.disk.set(keyOf('C:/repo/issue-comment.md'), 'Thanks for the report.')

  const ran = await $.tool.call(write('C:/repo/issue-comment.md', 'x'))

  expect(ran.deny).toBeUndefined()
  expect(ran.context).toBeUndefined()
  expect(ran.text).toBe('tool ran')
  expect(w.logs).toContain('taste-fork: no review of issue-comment.md, timed out or interrupted.')
  expect(w.statuses.at(-1)).toBe('taste 0 findings, 0 files, 1 failed')

  expect((await $.tool.call(edit('C:/repo/issue-comment.md'))).context).toHaveLength(1)
  expect(w.statuses.at(-1)).toBe('taste 1 finding, 1 file, 1 failed')
})

test('an unparsed reply, a refused critic call and an unreadable file give the model nothing and log why', async ($, on) => {
  const replies: Reply[] = [answered('Here is a better version of the comment.'), { deny: 'model blocked' }]
  const w = world(on, () => replies.shift() ?? answered('CLEAN'))
  w.disk.set(keyOf('C:/repo/issue-comment.md'), 'Thanks.')
  w.disk.set(keyOf('C:/repo/pr-body.md'), 'Body.')

  const results = [
    await $.tool.call(write('C:/repo/issue-comment.md', 'x')),
    await $.tool.call(write('C:/repo/pr-body.md', 'x')),
    await $.tool.call(write('C:/repo/pr-body-2.md', 'x')),
  ]

  for (const ran of results) expect(ran.context).toBeUndefined()
  expect(w.logs[0]).toBe('taste-fork: no review of issue-comment.md, the critic answered with neither a list nor CLEAN.')
  expect(w.logs[1]).toStartWith('taste-fork: no review of pr-body.md, the critic call failed (')
  expect(w.logs[2]).toBe('taste-fork: could not read pr-body-2.md, so it got no review.')
})

test(
  'userConfig sets the globs and the critic model',
  { options: { globs: '**/notes/*.txt', criticModel: 'haiku' } },
  async ($, on) => {
    const w = world(on, () => answered('1. "y" is generic.'))
    w.disk.set(keyOf('C:/a/notes/n.txt'), 'Some notes.')
    w.disk.set(keyOf('C:/a/pr-body.md'), 'A body.')

    expect((await $.tool.call(write('C:/a/notes/n.txt', 'x'))).context).toHaveLength(1)
    expect((await $.tool.call(write('C:/a/pr-body.md', 'x'))).context).toBeUndefined()
    expect(w.asks.map(ask => ask.model)).toEqual(['haiku'])
  },
)

test('session.start turns a review left pending by a reload into a failed one', async ($, on) => {
  let during: string | undefined
  const w = world(on, async () => {
    await $.session.start({ cwd: 'C:/work/scratch', surface: null, isInteractive: false })
    during = w.statuses.at(-1)
    return answered('CLEAN')
  })
  w.disk.set(keyOf('C:/repo/pr-body.md'), 'A body.')

  await $.tool.call(write('C:/repo/pr-body.md', 'x'))

  expect(w.statuses).toContain('taste reviewing pr-body.md')
  expect(during).toBe('taste 0 findings, 0 files, 1 failed')
})
