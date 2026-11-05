import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { lintCases, mediaCases, repo, template } from './cases.mjs'
import { classifyMedia, lintBody } from './pr-body.mjs'

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'))

function htmlOf(name, body) {
  const saved = golden[name]
  assert.ok(saved, `${name} has no golden HTML. Run node make-golden.mjs`)
  const sha256 = createHash('sha256').update(body).digest('hex')
  assert.equal(saved.sha256, sha256, `${name} changed. Run node make-golden.mjs`)
  return saved.html
}

for (const [name, { body, head, problems, has, hasPrefix }] of Object.entries(lintCases)) {
  test(`lint: ${name}`, () => {
    const found = lintBody(htmlOf(name, body), body, head)
    if (problems) assert.deepEqual(found, problems)
    for (const line of has ?? []) assert.ok(found.includes(line), line)
    if (hasPrefix) assert.ok(found.some(line => line.startsWith(hasPrefix)), hasPrefix)
  })
}

for (const [name, { body, pins, off, names }] of Object.entries(mediaCases)) {
  test(`media: ${name}`, () => {
    const found = classifyMedia(htmlOf(name, body), repo)
    assert.equal(found.pins.length, pins, 'pins')
    assert.equal(found.problems.length, off, 'refused on sight')
    if (names) assert.equal(found.problems[0], `not on an evidence ref: ${names}`)
  })
}

test('the skill template keeps its fields, so a filled copy means something', () => {
  assert.ok(template.includes('{{'))
})
