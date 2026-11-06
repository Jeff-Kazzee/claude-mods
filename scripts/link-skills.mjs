#!/usr/bin/env node
// Puts the github plugin's skills in front of every runtime from one source, this checkout.
//
//   node scripts/link-skills.mjs            make or repair every link, then check
//   node scripts/link-skills.mjs --check    change nothing, exit 1 on any gap
//
// Claude Code and Codex load the plugin from the jeff-mods marketplace and keep their own
// cache, which the check compares byte for byte. Cline and OpenCode get junctions. DeepSeek
// Harness reads the plugin's folder through customSkillDirs. Linveo gets a copy through
// send-skills.sh. A target that cannot be read counts as a gap, so no failure stays quiet.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILLS = ['pr-template', 'readme']
const PLUGIN = 'github@jeff-mods'
const REPO = 'Jeff-Kazzee/claude-mods'
const HOST = 'linveo-16gb'
const GIT_BASH = 'C:/Program Files/Git/bin/bash.exe'

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  }).sort()
}

export function folderHash(dir) {
  const hash = createHash('sha256')
  for (const file of files(dir)) hash.update(relative(dir, file).replace(/\\/g, '/')).update(readFileSync(file))
  return hash.digest('hex')
}

const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))

function linkState(path, want) {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    return 'missing'
  }
  if (!stat.isSymbolicLink()) return 'blocked'
  try {
    return realpathSync(path) === realpathSync(want) ? 'ok' : 'wrong'
  } catch {
    return 'wrong'
  }
}

function linkFolder(folder, label, source) {
  const links = SKILLS.map(skill => ({ path: join(folder, skill), want: source(skill) }))
  return {
    name: label,
    problems: () => links.flatMap(({ path, want }) => {
      const state = linkState(path, want)
      return state === 'ok' ? [] : [`${path} is ${state}`]
    }),
    fix: () => {
      mkdirSync(folder, { recursive: true })
      for (const { path, want } of links) {
        const state = linkState(path, want)
        if (state === 'ok' || state === 'blocked') continue
        if (state === 'wrong') unlinkSync(path)
        symlinkSync(want, path, 'junction')
      }
    },
  }
}

export function targets({ root, home, run }) {
  const source = skill => join(root, 'plugins', 'github', 'skills', skill)
  const version = name => json(join(root, 'plugins', name, '.claude-plugin', 'plugin.json')).version
  const same = (dir, skill) => existsSync(dir) && folderHash(dir) === folderHash(source(skill))
  const cacheProblems = (label, cached, workflow) => [
    ...SKILLS.filter(skill => !same(join(cached, skill), skill)).map(skill => `${label} cache of ${skill} differs from the source`),
    ...(existsSync(join(workflow, 'pr-template')) ? [`${label} still loads workflow:pr-template`] : []),
  ]
  const ask = (command, args, what) => {
    const result = run(command, args)
    if (result.status !== 0) throw new Error(`${what} failed: ${(result.stderr || result.stdout || '').trim().split('\n').at(-1)}`)
    return result.stdout.trim()
  }
  const remote = command => run('ssh', [HOST, command])

  const claudeInstalled = () => {
    const path = join(home, '.claude', 'plugins', 'installed_plugins.json')
    if (!existsSync(path)) return {}
    const data = json(path)
    return data.plugins ?? data
  }
  const claudePath = name => claudeInstalled()[name]?.[0]?.installPath
  const codexConfig = join(home, '.codex', 'config.toml')
  const codexCache = join(home, '.codex', 'plugins', 'cache', 'jeff-mods')
  const dshProfile = join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')
  const dshLine = `${root.replace(/\\/g, '/')}/plugins/github/skills`

  return [
    {
      name: 'source',
      problems: () => SKILLS.filter(skill => !existsSync(join(source(skill), 'SKILL.md'))).map(skill => `${skill} has no SKILL.md in ${root}`),
      fix: () => {},
    },
    {
      name: 'github',
      problems: () => {
        const head = run('git', ['-C', root, 'rev-parse', 'HEAD']).stdout.trim()
        const found = remote(`gh api repos/${REPO}/commits/${head} --jq .sha`)
        if (found.status !== 0 || found.stdout.trim() !== head) return [`this checkout's ${head.slice(0, 7)} is not on GitHub, or GitHub could not be read`]
        return SKILLS.flatMap(skill => {
          const path = `plugins/github/skills/${skill}/SKILL.md`
          const blob = remote(`gh api 'repos/${REPO}/contents/${path}?ref=${head}' --jq .sha`)
          return blob.status === 0 && blob.stdout.trim() === gitBlob(readFileSync(join(root, path))) ? [] : [`${skill} on GitHub differs from this checkout`]
        })
      },
      fix: () => {},
    },
    {
      name: 'laws',
      problems: () => ['.agents', '.claude'].flatMap(dir => SKILLS
        .filter(skill => existsSync(join(home, dir, 'skills', skill)))
        .map(skill => `~/${dir}/skills/${skill} breaks the Skills law`)),
      fix: () => {},
    },
    {
      name: 'claude',
      problems: () => {
        const settings = join(home, '.claude', 'settings.json')
        const enabled = existsSync(settings) && json(settings).enabledPlugins?.[PLUGIN] === true
        const github = claudePath(PLUGIN)
        const workflow = claudePath('workflow@jeff-mods')
        if (!enabled || !github) return [`${PLUGIN} is not installed and enabled`]
        return cacheProblems('claude', join(github, 'skills'), join(workflow ?? '', 'skills'))
      },
      fix: () => {
        ask('claude', ['plugin', 'marketplace', 'update', 'jeff-mods'], 'claude marketplace update')
        ask('claude', ['plugin', 'install', PLUGIN], 'claude plugin install')
        ask('claude', ['plugin', 'update', PLUGIN], 'claude plugin update')
        ask('claude', ['plugin', 'update', 'workflow@jeff-mods'], 'claude workflow update')
      },
    },
    {
      name: 'codex',
      problems: () => {
        const config = existsSync(codexConfig) ? readFileSync(codexConfig, 'utf8') : ''
        if (!config.includes(`[plugins."${PLUGIN}"]`)) return [`${PLUGIN} is not in config.toml`]
        return cacheProblems('codex', join(codexCache, 'github', version('github'), 'skills'), join(codexCache, 'workflow', version('workflow'), 'skills'))
      },
      fix: () => {
        // Codex keeps a copy per version, so only a remove and an add refresh it.
        for (const plugin of [PLUGIN, 'workflow@jeff-mods']) {
          run('codex', ['plugin', 'remove', plugin])
          ask('codex', ['plugin', 'add', plugin], `codex plugin add ${plugin}`)
        }
      },
    },
    linkFolder(join(home, '.cline', 'skills'), 'cline', source),
    linkFolder(join(home, '.config', 'opencode', 'skills'), 'opencode', source),
    {
      name: 'dsh',
      problems: () => (existsSync(dshProfile) && readFileSync(dshProfile, 'utf8').includes(`- ${dshLine}`) ? [] : [`${dshProfile} has no ${dshLine}`]),
      fix: () => {
        if (!existsSync(dshProfile)) return
        const text = readFileSync(dshProfile, 'utf8')
        if (text.includes(`- ${dshLine}`)) return
        const next = text.replace(/^( *- )\S*\/plugins\/workflow\/skills\r?$/m, line => `${line}\n${/^ */.exec(line)[0]}- ${dshLine}`)
        if (next === text) throw new Error('no workflow skills line in the DeepSeek Harness profile')
        writeFileSync(dshProfile, next)
      },
    },
    {
      name: 'linveo',
      problems: () => SKILLS.flatMap(skill => {
        const path = `.local/share/jeff-skills/plugins/github/skills/${skill}/SKILL.md`
        const found = remote(`sha256sum "$HOME/${path}"; test -e "$HOME/.agents/skills/${skill}/SKILL.md"`)
        const want = createHash('sha256').update(readFileSync(join(source(skill), 'SKILL.md'))).digest('hex')
        return found.status === 0 && found.stdout.startsWith(want) ? [] : [`${skill} on ${HOST} is missing or old`]
      }),
      fix: () => {
        const shell = existsSync(GIT_BASH) ? GIT_BASH : 'sh'
        ask(shell, [join(root, 'scripts', 'send-skills.sh'), 'HEAD', 'ssh', HOST], 'send-skills')
      },
    },
  ]
}

export function sweep(list, { fix }) {
  let failed = false
  const report = []
  for (const target of list) {
    let problems
    try {
      if (fix && target.problems().length > 0) target.fix()
      problems = target.problems()
    } catch (error) {
      problems = [error.message]
    }
    if (problems.length > 0) failed = true
    report.push(problems.length === 0 ? `ok    ${target.name}` : problems.map(problem => `FAIL  ${target.name}: ${problem}`).join('\n'))
  }
  return { failed, report }
}

function run(command, args) {
  // Plain names resolve through PATH, and Windows shims need a shell.
  const shell = process.platform === 'win32' && !/[\\/]|^(git|ssh)$/.test(command)
  const line = shell ? [command, ...args].join(' ') : command
  const result = spawnSync(line, shell ? [] : args, { cwd: homedir(), encoding: 'utf8', shell, timeout: 300000, windowsHide: true })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { failed, report } = sweep(targets({ root, home: homedir(), run }), { fix: !process.argv.includes('--check') })
  console.log(report.join('\n'))
  process.exit(failed ? 1 : 0)
}
