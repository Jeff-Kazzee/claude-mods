import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { folderHash, hostProbe, listingHash, pluginEnabled, skillDirs, sweep, targets } from './link-skills.mjs'

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
  return (command, args, options) => {
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
    if (line.includes('send-skills')) {
      state.sent = true
      state.sentFrom = options?.cwd
    }
    if (command === 'ssh' && line.includes('commits/')) return { status: 0, stdout: 'abc\n', stderr: '' }
    if (command === 'ssh' && line.includes('contents/')) {
      const name = /skills\/([a-z-]+)\/SKILL/.exec(line)[1]
      const bytes = readFileSync(join(source(name), 'SKILL.md'))
      return { status: 0, stdout: `${createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}\n`, stderr: '' }
    }
    if (command === 'ssh' && line.includes('sha256sum')) {
      if (!state.sent) return { status: 1, stdout: '', stderr: '' }
      const name = /skills\/([a-z-]+)"/.exec(line)[1]
      return { status: 0, stdout: `${listingHash(source(name))}  -\n`, stderr: '' }
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
  ['a plugin turned off in Codex', 'codex', w => writeFileSync(join(w.home, '.codex/config.toml'), '[plugins."github@jeff-mods"]\nenabled = false\n')],
  ['a DeepSeek Harness line left only in a comment', 'dsh', w => writeFileSync(join(w.home, '.dsh/profiles/desktop/cordis.patch.yml'), `customSkillDirs: []\n# - ${w.root.replace(/\\/g, '/')}/plugins/github/skills\n`)],
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

test('the install runs send-skills from the checkout', () => {
  const w = world()
  const state = {}
  install(w, fakeRun(w, state))
  assert.equal(state.sentFrom, w.root)
})

test('pluginEnabled reads the table, not the name', () => {
  const plugin = 'a@b'
  assert.equal(pluginEnabled('[plugins."a@b"]\nenabled = true\n', plugin), true)
  assert.equal(pluginEnabled('[plugins."a@b"]\nenabled = false\n[plugins."c@d"]\nenabled = true\n', plugin), false)
  assert.equal(pluginEnabled('[plugins."c@d"]\nenabled = true\n', plugin), false)
})

test('skillDirs reads list entries and ignores comments and other keys', () => {
  const yaml = 'a:\n  customSkillDirs:\n    - !!js x\n      more\n    # - commented\n    - real/path\n  other:\n    - not-this\n'
  assert.deepEqual(skillDirs(yaml), ['!!js x', 'real/path'])
})

const bash = existsSync('C:/Program Files/Git/bin/bash.exe') ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'

function host() {
  const remote = mkdtempSync(join(tmpdir(), 'link-host-'))
  dirs.push(remote)
  const dir = join(remote, '.local/share/jeff-skills/plugins/github/skills/readme')
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '# readme\n')
  writeFileSync(join(dir, 'scripts/readme-check.mjs'), 'good\n')
  for (const runtime of ['.agents', '.claude']) {
    mkdirSync(join(remote, runtime, 'skills'), { recursive: true })
    symlinkSync(dir, join(remote, runtime, 'skills/readme'), 'junction')
  }
  const probe = () => spawnSync(bash, ['-c', hostProbe('readme')], { encoding: 'utf8', env: { ...process.env, HOME: remote } })
  return { remote, dir, probe }
}

test('the host probe prints the same hash this side computes', () => {
  const { dir, probe } = host()
  const found = probe()
  assert.equal(found.status, 0, found.stderr)
  assert.equal(found.stdout.slice(0, 64), listingHash(dir))
})

test('the host probe sees a changed helper', () => {
  const { dir, probe } = host()
  const want = listingHash(dir)
  writeFileSync(join(dir, 'scripts/readme-check.mjs'), 'broken\n')
  assert.notEqual(probe().stdout.slice(0, 64), want)
})

test('the host probe fails when a runtime link is gone', () => {
  const { remote, probe } = host()
  rmSync(join(remote, '.claude/skills/readme'), { force: true, recursive: true })
  assert.notEqual(probe().status, 0)
})

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
