#!/usr/bin/env node
// Renders every test case through GitHub and saves the HTML, so the tests run offline against
// real renderer output. Run it after changing cases.mjs or the template in SKILL.md.

import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { lintCases, mediaCases, repo } from './cases.mjs'
import { render } from './pr-body.mjs'

const golden = {}
for (const [name, { body }] of Object.entries({ ...lintCases, ...mediaCases })) {
  golden[name] = {
    sha256: createHash('sha256').update(body).digest('hex'),
    html: await render(body, repo, true),
  }
}
writeFileSync(new URL('./golden.json', import.meta.url), `${JSON.stringify(golden, null, 1)}\n`)
console.log(`rendered ${Object.keys(golden).length} cases`)
