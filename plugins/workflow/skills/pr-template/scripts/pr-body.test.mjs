import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { lintBody } from './pr-body.mjs'

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
