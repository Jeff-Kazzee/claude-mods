#!/usr/bin/env node
// Runs every row of acceptance.md against a target tree, with a plant for each row, and writes a receipt.

import { execFile, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const KEY = join(HERE, '..', 'acceptance.md')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const temps = []

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  temps.push(dir)
  return dir
}

function copyOf(target) {
  const dir = temp('verify-copy-')
  cpSync(target, dir, { recursive: true, filter: path => !/[\\/](\.git|node_modules)$/.test(path) })
  return dir
}

function run(command, args, options = {}) {
  const done = spawnSync(command, args, { encoding: 'utf8', timeout: 300000, ...options })
  return { ok: done.status === 0, status: done.status, output: `${done.stdout ?? ''}${done.stderr ?? ''}`.trim(), missing: done.error?.code === 'ENOENT' }
}

const tail = text => text.split('\n').slice(-3).join(' | ').slice(0, 400)

function suites(dir) {
  const yml = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8')
  return [...yml.matchAll(/run: node --test (.+)$/gm)].map(match => match[1].trim().split(/\s+/))
}

function textFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '.git' ? [] : textFiles(path)
    return /\.(md|mjs|json|sh|yml|tsx?)$/.test(entry.name) ? [path] : []
  })
}

function fixture(root) {
  const dir = join(root, 'fixture')
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'LICENSE'), 'MIT\n')
  writeFileSync(join(dir, 'docs/guide.md'), '# Guide\n')
  writeFileSync(join(dir, 'docs/demo.png'), PNG)
  return dir
}

const readme = (base, quick = 'test -f LICENSE') => `<h1 align="center">Sample</h1>

<div align="center">
  <strong>A small sample</strong>
</div>

<div align="center">
  <a href="${base}/ci"><img src="${base}/ok/badge.svg" alt="CI" /></a>
  <a href="${base}/release"><img src="${base}/version/badge.svg" alt="Version" /></a>
  <a href="LICENSE"><img src="${base}/license/badge.svg" alt="License" /></a>
</div>

<p align="center">
  <img src="docs/demo.png" alt="The sample running" width="320" />
</p>

## Features

- One
- Two
- Three
- Four

## Quick start

\`\`\`sh
${quick}
\`\`\`

## Examples

### First

Text.

### Second

Text.

## Documentation

See [the guide](docs/guide.md).

## Contributing

Open an issue.

## License

MIT. See [LICENSE](LICENSE).
`

async function readmeRow(dir) {
  const server = createServer((request, response) => {
    if (request.url.includes('gone')) return response.writeHead(404).end()
    if (request.url.includes('dead')) return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg"><text>repo or workflow not found</text></svg>')
    if (request.url.includes('badge.svg')) return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg"><text>passing</text></svg>')
    return response.writeHead(200).end('ok')
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const script = join(dir, 'plugins/github/skills/readme/scripts/readme-check.mjs')
  const root = temp('verify-readme-')
  const site = fixture(root)
  git(site, 'init', '-q')
  git(site, 'add', '.')
  git(site, '-c', 'user.name=v', '-c', 'user.email=v@example.test', 'commit', '-qm', 'fixture')
  const check = async (text, ...flags) => {
    writeFileSync(join(site, 'README.md'), text)
    try {
      await promisify(execFile)(process.execPath, [script, 'README.md', ...flags], { cwd: site })
      return 0
    } catch (error) {
      return error.code ?? 1
    }
  }
  const results = []
  try {
    const good = readme(base)
    results.push(['good', await check(good, '--online', '--clone', site), 0])
    results.push(['dead badge', await check(good.replace('/ok/badge.svg', '/dead/badge.svg'), '--online'), 1])
    results.push(['dead link', await check(good.replace(`${base}/ci`, `${base}/gone`), '--online'), 1])
    results.push(['invented number', await check(good.replace('- Four', '- Used by 5000 users')), 1])
    results.push(['failing quick start', await check(readme(base, 'test -f only-here.txt'), '--clone', site), 1])
    writeFileSync(join(site, 'forged.png'), Buffer.concat([PNG.subarray(0, 33), Buffer.from('IDATIEND')]))
    results.push(['forged PNG', await check(good.replace('docs/demo.png', 'forged.png'), '--online'), 1])
  } finally {
    server.close()
  }
  const wrong = results.filter(([, got, want]) => got !== want)
  return { ok: wrong.length === 0, output: results.map(([name, got]) => `${name}: exit ${got}`).join(', ') }
}

function git(cwd, ...args) {
  return run('git', args, { cwd })
}

const ROWS = {
  V1: {
    check: dir => run(process.execPath, ['scripts/ci-check.mjs'], { cwd: dir }),
    plant: dir => appendFileSync(join(dir, 'README.md'), '\nA plant — here.\n'),
  },
  V2: {
    check: dir => {
      const results = suites(dir).map(files => run(process.execPath, ['--test', ...files], { cwd: dir }))
      if (results.length === 0) return { ok: false, output: 'no node --test line in ci.yml' }
      return { ok: results.every(result => result.ok), output: results.map(result => tail(result.output)).join(' || ') }
    },
    plant: dir => appendFileSync(join(dir, suites(dir)[0][0]), "\nimport { test as planted } from 'node:test'\nplanted('plant', () => { throw new Error('plant') })\n"),
  },
  V3: {
    check: dir => {
      const names = ['workflow', 'tstack', 'checkable-jobs', 'github'].filter(name => existsSync(join(dir, 'plugins', name)))
      const results = names.map(name => run('claude', ['plugin', 'validate', `plugins/${name}`], { cwd: dir }))
      return { ok: results.every(result => result.ok), output: tail(results.map(result => result.output).join(' ')), unavailable: results.some(result => result.missing) }
    },
    plant: dir => writeFileSync(join(dir, 'plugins/workflow/.claude-plugin/plugin.json'), '{ not json'),
  },
  V4: {
    check: dir => {
      const commit = /[0-9a-f]{40}/.exec(readFileSync(join(dir, 'plugins/tstack/UPSTREAM.md'), 'utf8'))[0]
      const upstream = join(temp('verify-tstack-'), 'tstack')
      const cloned = run('git', ['clone', '--quiet', 'https://github.com/t3dotgg/tstack.git', upstream])
      if (!cloned.ok) return { ok: false, unavailable: true, output: tail(cloned.output) }
      git(upstream, 'checkout', '--quiet', commit)
      return run(process.execPath, ['plugins/tstack/sync.mjs', '--source', upstream, '--check'], { cwd: dir })
    },
    plant: dir => appendFileSync(join(dir, 'plugins/tstack/skills/council/SKILL.md'), '\nA hand edit.\n'),
  },
  V5: {
    needs: 'plugins/github',
    check: readmeRow,
    plant: dir => {
      const path = join(dir, 'plugins/github/skills/readme/scripts/readme-check.mjs')
      writeFileSync(path, readFileSync(path, 'utf8').replace('process.exit(1)', 'process.exit(0)'))
    },
  },
  V6: {
    needs: 'plugins/github',
    check: dir => {
      const home = temp('verify-home-')
      const done = run(process.execPath, ['scripts/link-skills.mjs', '--check'], { cwd: dir, env: { ...process.env, HOME: home, USERPROFILE: home } })
      const named = ['claude', 'codex', 'cline', 'opencode', 'dsh', 'linveo'].filter(name => !new RegExp(`FAIL\\s+${name}:`).test(done.output))
      const left = readdirSync(home)
      return { ok: done.status === 1 && named.length === 0 && left.length === 0, output: `exit ${done.status}, unnamed ${named}, home has ${left}` }
    },
    // Never plant a real repair here: it would run the installer's CLIs and write to Linveo.
    plant: dir => {
      const path = join(dir, 'scripts/link-skills.mjs')
      // After the shebang, because the script exits before reaching its last line.
      writeFileSync(path, readFileSync(path, 'utf8').replace('\n', "\nwriteFileSync(join(homedir(), 'written-by-check'), 'plant')\n"))
    },
  },
  V7: {
    needs: 'plugins/github',
    check: dir => {
      const hits = textFiles(dir).filter(path => !path.endsWith('link-skills.mjs') && !path.includes(join('.claude', 'skills', 'verify')) && readFileSync(path, 'utf8').includes('workflow:pr-template'))
      const moved = !existsSync(join(dir, 'plugins/workflow/skills/pr-template'))
      return { ok: moved && hits.length === 0, output: `old folder gone ${moved}, files naming it: ${hits.map(path => relative(dir, path))}` }
    },
    plant: dir => writeFileSync(join(dir, 'plugins/github/NOTES.md'), 'Use workflow:pr-template.\n'),
  },
}

function args() {
  const list = process.argv.slice(2)
  const read = name => (list.includes(name) ? list[list.indexOf(name) + 1] : undefined)
  return { doctor: list.includes('--doctor'), target: read('--target'), head: read('--head'), builder: read('--builder'), verifier: read('--verifier') }
}

function doctor() {
  const tools = [['node', ['--version']], ['git', ['--version']], ['claude', ['--version']], ['ssh', ['-V']]]
  const results = tools.map(([name, flags]) => [name, run(name, flags)])
  for (const [name, result] of results) console.log(`${result.missing ? 'MISSING' : 'ok'}  ${name}  ${tail(result.output)}`)
  return results.some(([, result]) => result.missing) ? 1 : 0
}

function treeHash(dir) {
  const hash = createHash('sha256')
  const walk = folder => readdirSync(folder).sort().forEach(name => {
    if (name === '.git' || name === 'node_modules') return
    const path = join(folder, name)
    if (statSync(path).isDirectory()) return walk(path)
    hash.update(relative(dir, path).replace(/\\/g, '/')).update(readFileSync(path))
  })
  walk(dir)
  return hash.digest('hex')
}

async function rowResult(id, row, target) {
  if (row.needs && !existsSync(join(target, row.needs))) return { id, state: 'NOTBUILT', output: `${row.needs} is not in this head` }
  const clean = await row.check(copyOf(target))
  if (clean.unavailable) return { id, state: 'UNAVAILABLE', output: tail(clean.output) }
  const planted = copyOf(target)
  await row.plant(planted)
  const broken = await row.check(planted)
  return {
    id,
    state: clean.ok && !broken.ok ? 'PASS' : clean.ok ? 'PLANT SURVIVED' : 'FAIL',
    output: tail(clean.output),
    plant: broken.ok ? 'not caught' : 'caught',
  }
}

async function main() {
  const options = args()
  if (options.doctor) return doctor()
  if (!options.target || !/^[0-9a-f]{40}$/.test(options.head ?? '') || !options.builder || !options.verifier) {
    console.error('usage: run-all.mjs --target <tree> --head <full sha> --builder <name> --verifier <name>')
    return 2
  }
  if (options.builder.toLowerCase() === options.verifier.toLowerCase()) {
    console.error('refused: the verifier must not be the builder')
    return 2
  }
  const target = resolve(options.target)
  if (existsSync(join(target, '.git'))) {
    const head = run('git', ['rev-parse', 'HEAD'], { cwd: target }).output
    if (head !== options.head) {
      console.error(`refused: target is at ${head}`)
      return 2
    }
  }
  const before = treeHash(target)
  const rows = []
  for (const [id, row] of Object.entries(ROWS)) {
    const result = await rowResult(id, row, target)
    rows.push(result)
    console.log(`${result.state.padEnd(14)} ${id}  ${result.output.slice(0, 120)}`)
  }
  const unchanged = treeHash(target) === before
  const bad = rows.some(row => row.state === 'FAIL' || row.state === 'PLANT SURVIVED') || !unchanged
  const result = bad ? 'fail' : rows.some(row => row.state === 'UNAVAILABLE') ? 'incomplete' : 'pass'
  const receipt = {
    repo: 'Jeff-Kazzee/claude-mods', head: options.head, treeSha256: before, keySha256: createHash('sha256').update(readFileSync(KEY)).digest('hex'),
    builder: options.builder, verifier: options.verifier, finishedAt: new Date().toISOString(), targetUnchanged: unchanged, result, rows,
  }
  const out = join(homedir(), 'Development/company-os-evidence', `claude-mods-${options.head.slice(0, 12)}`)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`VERIFY_RESULT=${result}\n${join(out, 'receipt.json')}`)
  return result === 'pass' ? 0 : 1
}

let code = 1
try {
  code = await main()
} finally {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
}
process.exit(code)
