import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { classifyMedia, lintBody } from './pr-body.mjs'

const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const template = skill.match(/^````markdown\n([\s\S]*?)^````$/m)[1]
const good = template.replace(/\{\{.*?\}\}/g, 'filled in abc1234').replace(/Task: filled in abc1234/, 'Task: 179')

test('the template in SKILL.md, once filled, passes', () => {
  assert.deepEqual(lintBody(good), [])
})

test('the unfilled template fails on its fields and nothing else', () => {
  const problems = lintBody(template).filter(p => !p.startsWith('last line'))
  assert.deepEqual(problems, ['unfilled {{field}}'])
})

test('Proof is an accepted spelling of Visual Proof', () => {
  assert.deepEqual(lintBody(good.replace('## Visual Proof', '## Proof')), [])
})

test('Task none is accepted', () => {
  assert.deepEqual(lintBody(good.replace('Task: 179', 'Task: none')), [])
})

test('a missing section fails', () => {
  assert.deepEqual(lintBody(good.replace('## Risk', '## Hazards')), ['missing section: Risk'])
})

test('sections out of order fail', () => {
  const swapped = good.replace('## ELI5', '## TEMP').replace('## Why', '## ELI5').replace('## TEMP', '## Why')
  assert.ok(lintBody(swapped).some(p => p.startsWith('sections out of order')))
})

test('a heading inside a code fence does not count', () => {
  const fenced = good.replace('## Risk', '```\n## Risk\n```')
  assert.deepEqual(lintBody(fenced), ['missing section: Risk'])
})

test('each required label fails when absent', () => {
  for (const label of ['**Before:**', '**After:**', '**Mechanism:**', '**Level:**']) {
    assert.deepEqual(lintBody(good.replace(label, 'Label')), [`missing ${label}`])
  }
})

test('headings and labels with nothing under them fail', () => {
  const hollow = `${[
    '## ELI5', '## What Changed', '**Before:**', '**After:**', '**Mechanism:**', '## Why', '## Linked Issue',
    '## Proof', '## Testing', '## Risk', '**Level:**', '## AI Disclosure', '## Review', '## Checklist',
  ].join('\n\n')}\n\nTask: 179\n`
  const problems = lintBody(hollow)
  for (const section of ['ELI5', 'Why', 'Linked Issue', 'Proof', 'Testing', 'AI Disclosure', 'Review']) {
    assert.ok(problems.includes(`empty section: ${section}`), section)
  }
  for (const label of ['**Before:**', '**After:**', '**Mechanism:**', '**Level:**']) {
    assert.ok(problems.includes(`empty ${label}`), label)
  }
})

test('a section with only a label stays caught by its label', () => {
  const body = good.replace('**Level:** filled in abc1234', '**Level:**').replace(/\n- filled in abc1234/g, '')
  assert.deepEqual(lintBody(body), ['empty **Level:**'])
})

test('a bare N/A fails and an N/A with a reason passes', () => {
  const swap = text => good.replace(/(## Linked Issue\n\n).*\n/, `$1${text}\n`)
  assert.deepEqual(lintBody(swap('N/A:')), ['empty section: Linked Issue'])
  assert.deepEqual(lintBody(swap('N/A')), ['empty section: Linked Issue'])
  assert.deepEqual(lintBody(swap('N/A: Jeff asked in chat')), [])
})

test('a section holding only a fenced block has content', () => {
  const fenced = good.replace(/(## Why\n\n).*\n/, '$1```text\noutput\n```\n')
  assert.deepEqual(lintBody(fenced), [])
})

test('a label filled only by a code span has content', () => {
  assert.deepEqual(lintBody(good.replace('**Mechanism:** filled in abc1234', '**Mechanism:** `f()`')), [])
})

test('a {{field}} inside a code span does not count', () => {
  const body = good.replace('filled in abc1234', '`{{ .Values.image }}`')
  assert.deepEqual(lintBody(body), [])
})

test('an em dash fails', () => {
  assert.deepEqual(lintBody(good.replace('filled in abc1234', 'filled \u2014 in')), ['em dash'])
})

test('a body that does not end on the Task line fails', () => {
  assert.deepEqual(lintBody(`${good}\nsignature\n`), ['last line is not Task: <id or none>'])
})

test('the head must appear when one is given', () => {
  assert.deepEqual(lintBody(good, 'abc1234fffffffffffffffffffffffffffffffff'), [])
  assert.deepEqual(lintBody(good, 'def5678fffffffffffffffffffffffffffffffff'), ['body does not name the head def5678'])
})

test('an unclosed fence hides what follows, as it does on GitHub', () => {
  for (const fence of ['```', '~~~']) {
    const problems = lintBody(good.replace('## Risk', `${fence}\nopen\n\n## Risk`))
    assert.ok(problems.includes('missing section: Risk'), fence)
    assert.ok(problems.includes('missing section: Checklist'), fence)
  }
})

test('a close fence may be longer than its open, and a shorter one does not close it', () => {
  assert.deepEqual(lintBody(good.replace('## Risk', '```\ncode\n`````\n\n## Risk')), [])
  const problems = lintBody(good.replace('## Risk', '````\n```\n\n## Risk'))
  assert.ok(problems.includes('missing section: Risk'))
})

test('an indented fence still hides its contents', () => {
  assert.ok(lintBody(good.replace('## Risk', '  ```\n## Risk\n  ```')).includes('missing section: Risk'))
})

test('a backtick line with backticks after it is inline code, not a fence', () => {
  assert.deepEqual(lintBody(good.replace('filled in abc1234', '```inline``` text')), [])
})

test('a heading inside an HTML comment does not count', () => {
  assert.ok(lintBody(good.replace('## Risk', '<!--\n## Risk\n-->')).includes('missing section: Risk'))
})

test('a section or label holding only a comment is empty', () => {
  const section = good.replace(/(## Why\n\n).*\n/, '$1<!-- later -->\n')
  assert.deepEqual(lintBody(section), ['empty section: Why'])
  const label = good.replace('**Before:** filled in abc1234', '**Before:** <!-- later -->')
  assert.deepEqual(lintBody(label), ['empty **Before:**'])
})

test('closing hashes and a small indent still make a heading', () => {
  assert.deepEqual(lintBody(good.replace('## Risk', '## Risk ##')), [])
  assert.deepEqual(lintBody(good.replace('## Risk', '   ## Risk')), [])
})

test('a byte order mark and CRLF change nothing', () => {
  assert.deepEqual(lintBody(String.fromCharCode(0xfeff) + good), [])
  assert.deepEqual(lintBody(good.replace(/\n/g, '\r\n')), [])
})

test('every spelling of a bare N/A is empty, in a section or a label', () => {
  for (const text of ['N/A.', '**N/A**', 'n/a', 'NA', '_N/A_']) {
    const body = good.replace(/(## Linked Issue\n\n).*\n/, `$1${text}\n`)
    assert.deepEqual(lintBody(body), ['empty section: Linked Issue'], text)
  }
  assert.deepEqual(lintBody(good.replace('**Before:** filled in abc1234', '**Before:** N/A')), ['empty **Before:**'])
  assert.deepEqual(lintBody(good.replace('**Level:** filled in abc1234', '**Level:** n/a.')), ['empty **Level:**'])
})

test('an N/A with a reason is content, in a label too', () => {
  assert.deepEqual(lintBody(good.replace('**Before:** filled in abc1234', '**Before:** N/A: new file')), [])
})

const repo = 'Jeff-Kazzee/claude-mods'
const sha = 'a'.repeat(40)
const pin = `https://github.com/${repo}/blob/${sha}/a.png?raw=true`

test('a pin on this repo is looked up, whatever the owner case', () => {
  assert.deepEqual(classifyMedia(`![a](${pin})`, repo), { pins: [{ url: pin, sha, path: 'a.png' }], problems: [] })
  assert.equal(classifyMedia(`![a](${pin})`, repo.toLowerCase()).pins.length, 1)
})

test('images that are not pins on this repo fail', () => {
  for (const url of [
    pin.replace('Jeff-Kazzee', 'someone'),
    pin.replace('claude-mods', 'other'),
    'https://example.com/a.png',
    pin.replace('?raw=true', ''),
    pin.replace('/blob/', '/raw/'),
    `https://raw.githubusercontent.com/${repo}/${sha}/a.png`,
    `https://github.com/${repo}/blob/dev/a.png?raw=true`,
  ]) {
    assert.deepEqual(classifyMedia(`![a](${url})`, repo), { pins: [], problems: [`not on an evidence ref: ${url}`] }, url)
  }
})

test('an img tag is checked like Markdown, and a linked video counts as a pin', () => {
  assert.equal(classifyMedia('<img src="https://example.com/a.png">', repo).problems.length, 1)
  const mp4 = pin.replace('a.png', 'a.mp4')
  assert.equal(classifyMedia(`[![a](${pin})](${mp4})`, repo).pins.length, 2)
})

test('browser uploads pass, and images in code do not count', () => {
  assert.deepEqual(classifyMedia('![a](https://github.com/user-attachments/assets/abc)', repo), { pins: [], problems: [] })
  assert.deepEqual(classifyMedia('```\n![a](https://example.com/a.png)\n```', repo), { pins: [], problems: [] })
})

test('a fence closes only on its own character', () => {
  const problems = lintBody(good.replace('## Risk', '```\ncode\n~~~\n\n## Risk'))
  assert.ok(problems.includes('missing section: Risk'))
})

test('a real pin inside another URL does not make that URL a pin', () => {
  const url = `https://example.com/?next=${pin}`
  assert.ok(classifyMedia(`![a](${url})`, repo).problems.includes(`not on an evidence ref: ${url}`))
})

test('CRLF bodies keep working for every rule', () => {
  const crlf = good.replace('## Risk', '```\n## Risk\n```').replace(/\n/g, '\r\n')
  assert.deepEqual(lintBody(crlf), ['missing section: Risk'])
  assert.deepEqual(lintBody(good.replace('**Level:** filled in abc1234', '**Level:**').replace(/\n/g, '\r\n')), ['empty **Level:**'])
})
