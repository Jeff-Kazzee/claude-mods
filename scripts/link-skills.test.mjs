import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { folderHash, sweep, targets } from './link-skills.mjs'

const dirs = []
after(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function world() {
  const base = mkdtempSync(join(tmpdir(), 'link-skills-'))
  dirs.push(base)
  const root = join(base, 'repo')
  const home = join(base, 'home')
  for (const name of ['pr-template', 'readme']) {
    mkdirSync(join(root, 'plugins/github/skills', name), { recursive: true })
    writeFileSync(join(root, 'plugins/github/skills', name, 'SKILL.md'), `# ${name}\n`)
  }
  for (const [plugin, version] of [['github', '0.1.0'], ['workflow', '0.4.0']]) {
    mkdirSync(join(root, 'plugins', plugin, '.claude-plugin'), { recursive: true })
    writeFileSync(join(root, 'plugins', plugin, '.claude-plugin/plugin.json'), JSON.stringify({ version }))
  }
  mkdirSync(join(home, '.dsh/profiles/desktop'), { recursive: true })
  writeFileSync(join(home, '.dsh/profiles/desktop/cordis.patch.yml'), `          customSkillDirs:\n            - ${root.replace(/\\/g, '/')}/plugins/workflow/skills\n            - other\n`)
  return { root, home }
}

// A stand-in for the CLIs and for Linveo, with GitHub and the host as a real install would leave them.
function fakeRun({ root, home }, state = {}) {
  const source = name => join(root, 'plugins/github/skills', name)
  const install = (cache, workflow) => {
    mkdirSync(join(cache, 'skills'), { recursive: true })
    for (const name of ['pr-template', 'readme']) cpSync(source(name), join(cache, 'skills', name), { recursive: true })
    mkdirSync(join(workflow, 'skills', 'flows'), { recursive: true })
  }
  return (command, args) => {
    const line = [command, ...args].join(' ')
    if (state.down && command === 'ssh') return { status: 255, stdout: '', stderr: 'no route' }
    if (command === 'git') return { status: 0, stdout: 'abc\n', stderr: '' }
    if (line.startsWith('claude plugin install')) {
      const cache = join(home, '.claude/plugins/cache/github'), workflow = join(home, '.claude/plugins/cache/workflow')
      install(cache, workflow)
      mkdirSync(join(home, '.claude/plugins'), { recursive: true })
      writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({
        plugins: { 'github@jeff-mods': [{ installPath: cache }], 'workflow@jeff-mods': [{ installPath: workflow }] },
      }))
      writeFileSync(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'github@jeff-mods': true } }))
    }
    if (line.startsWith('codex plugin add github')) {
      install(join(home, '.codex/plugins/cache/jeff-mods/github/0.1.0'), join(home, '.codex/plugins/cache/jeff-mods/workflow/0.4.0'))
      mkdirSync(join(home, '.codex'), { recursive: true })
      writeFileSync(join(home, '.codex/config.toml'), '[plugins."github@jeff-mods"]\nenabled = true\n')
    }
    if (line.includes('send-skills')) state.sent = true
    if (command === 'ssh' && line.includes('commits/')) return { status: 0, stdout: 'abc\n', stderr: '' }
    if (command === 'ssh' && line.includes('contents/')) {
      const name = /skills\/([a-z-]+)\/SKILL/.exec(line)[1]
      const bytes = readFileSync(join(source(name), 'SKILL.md'))
      return { status: 0, stdout: `${createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}\n`, stderr: '' }
    }
    if (command === 'ssh' && line.includes('sha256sum')) {
      if (!state.sent) return { status: 1, stdout: '', stderr: '' }
      const name = /skills\/([a-z-]+)\/SKILL/.exec(line)[1]
      return { status: 0, stdout: `${createHash('sha256').update(readFileSync(join(source(name), 'SKILL.md'))).digest('hex')}  x\n`, stderr: '' }
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

const check = (w, run) => sweep(targets({ ...w, run }), { fix: false })
const install = (w, run) => sweep(targets({ ...w, run }), { fix: true })
const failures = result => result.report.filter(line => line.startsWith('FAIL')).join('\n')

test('a bare machine fails the check, and a run repairs it all', () => {
  const w = world()
  const run = fakeRun(w)
  assert.equal(check(w, run).failed, true)
  const done = install(w, run)
  assert.equal(failures(done), '')
  assert.equal(check(w, run).failed, false)
})

test('a second run changes nothing', () => {
  const w = world()
  const run = fakeRun(w)
  install(w, run)
  const profile = readFileSync(join(w.home, '.dsh/profiles/desktop/cordis.patch.yml'), 'utf8')
  assert.equal(install(w, run).failed, false)
  assert.equal(readFileSync(join(w.home, '.dsh/profiles/desktop/cordis.patch.yml'), 'utf8'), profile)
})

for (const [name, target, breakIt] of [
  ['a missing Cline link', 'cline', w => rmSync(join(w.home, '.cline/skills/readme'), { force: true, recursive: true })],
  ['a missing OpenCode link', 'opencode', w => rmSync(join(w.home, '.config/opencode/skills/pr-template'), { force: true, recursive: true })],
  ['a stale Claude cache', 'claude', w => writeFileSync(join(w.home, '.claude/plugins/cache/github/skills/readme/SKILL.md'), 'old')],
  ['a stale Codex cache', 'codex', w => writeFileSync(join(w.home, '.codex/plugins/cache/jeff-mods/github/0.1.0/skills/readme/SKILL.md'), 'old')],
  ['workflow still carrying pr-template in Codex', 'codex', w => mkdirSync(join(w.home, '.codex/plugins/cache/jeff-mods/workflow/0.4.0/skills/pr-template'))],
  ['a plugin turned off in Claude', 'claude', w => writeFileSync(join(w.home, '.claude/settings.json'), '{}')],
  ['a removed DeepSeek Harness line', 'dsh', w => writeFileSync(join(w.home, '.dsh/profiles/desktop/cordis.patch.yml'), 'nothing\n')],
  ['a skill in ~/.agents/skills', 'laws', w => mkdirSync(join(w.home, '.agents/skills/readme'), { recursive: true })],
  ['a source skill that is gone', 'source', w => rmSync(join(w.root, 'plugins/github/skills/readme/SKILL.md'))],
]) {
  test(`the check fails on ${name}`, () => {
    const w = world()
    const run = fakeRun(w)
    install(w, run)
    breakIt(w)
    const result = check(w, run)
    assert.equal(result.failed, true)
    assert.match(failures(result), new RegExp(`FAIL  ${target}:`))
  })
}

test('an unreachable host is a failure, never a skip', () => {
  const w = world()
  const state = {}
  const run = fakeRun(w, state)
  install(w, run)
  state.down = true
  const found = failures(check(w, run))
  assert.match(found, /FAIL {2}linveo:/)
  assert.match(found, /FAIL {2}github:/)
})

test('a folder a person made stays, and the check keeps failing', () => {
  const w = world()
  mkdirSync(join(w.home, '.cline/skills/readme'), { recursive: true })
  writeFileSync(join(w.home, '.cline/skills/readme/mine.txt'), 'keep')
  const result = install(w, fakeRun(w))
  assert.match(failures(result), /readme is blocked/)
  assert.equal(existsSync(join(w.home, '.cline/skills/readme/mine.txt')), true)
})

test('a link to the wrong place is repointed', () => {
  const w = world()
  mkdirSync(join(w.home, '.cline/skills'), { recursive: true })
  symlinkSync(join(w.root, 'plugins'), join(w.home, '.cline/skills/readme'), 'junction')
  install(w, fakeRun(w))
  assert.equal(existsSync(join(w.home, '.cline/skills/readme/SKILL.md')), true)
})

test('a failing CLI is reported and stops nothing else', () => {
  const w = world()
  const base = fakeRun(w)
  const run = (command, args) => (command === 'codex' ? { status: 1, stdout: '', stderr: 'boom' } : base(command, args))
  const result = install(w, run)
  assert.match(failures(result), /FAIL {2}codex: codex plugin add github@jeff-mods failed: boom/)
  assert.doesNotMatch(failures(result), /cline|opencode/)
})

test('folderHash sees a change in any file', () => {
  const w = world()
  const dir = join(w.root, 'plugins/github/skills/readme')
  const before = folderHash(dir)
  writeFileSync(join(dir, 'extra.md'), 'x')
  assert.notEqual(folderHash(dir), before)
})
