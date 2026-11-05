#!/usr/bin/env node
// Evidence and format checks for the pr-template skill.
//
//   node pr-body.mjs attach --task <id> [--public-ok] <file>...
//   node pr-body.mjs check <body.md>
//   node pr-body.mjs check --pr <number>
//
// attach stores files on refs/pr-evidence/<task> and prints Markdown for them.
// check exits 1 with one line per problem.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SECTIONS = ['ELI5', 'What Changed', 'Why', 'Linked Issue', 'Proof', 'Testing', 'Risk', 'AI Disclosure',
  'Review', 'Checklist']
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const VIDEOS = new Set(['.mp4', '.webm', '.mov'])
const MAX_BYTES = 50 * 1024 * 1024
const EVIDENCE_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{40})\/([^?\s)"]+)\?raw=true/g

function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function stripCode(text) {
  return text.replace(/^(`{3,}|~{3,}).*\n[\s\S]*?^\1\s*$/gm, '').replace(/`[^`\n]*`/g, '')
}

// Problems a body has on its face, with no network. Pure, so tests can reach every rule.
export function lintBody(text, head) {
  const problems = []
  const prose = stripCode(text)
  const headings = [...prose.matchAll(/^## (.+?)\s*$/gm)].map(m => (m[1] === 'Visual Proof' ? 'Proof' : m[1]))
  const found = headings.filter(h => SECTIONS.includes(h))
  for (const section of SECTIONS) {
    if (!found.includes(section)) problems.push(`missing section: ${section}`)
  }
  const present = SECTIONS.filter(s => found.includes(s))
  if (found.join('|') !== present.join('|')) problems.push(`sections out of order: ${found.join(', ')}`)
  for (const label of ['**Before:**', '**After:**', '**Mechanism:**', '**Level:**']) {
    if (!prose.includes(label)) problems.push(`missing ${label}`)
  }
  if (prose.includes('{{')) problems.push('unfilled {{field}}')
  if (text.includes('\u2014')) problems.push('em dash')
  if (!/\n\s*Task: (\d+|none)\s*$/.test(text)) problems.push('last line is not Task: <id or none>')
  if (head && !text.includes(head.slice(0, 7))) problems.push(`body does not name the head ${head.slice(0, 7)}`)
  return problems
}

// Each evidence URL must point at a file on a commit a refs/pr-evidence ref still holds.
// A contents lookup alone is not enough: GitHub answered one for a commit whose push was rejected.
function pinProblems(text, repo) {
  const problems = []
  const pins = [...text.matchAll(EVIDENCE_URL)].filter(m => m[1] === repo)
  if (pins.length === 0) return problems
  const refs = JSON.parse(run('gh', ['api', `repos/${repo}/git/matching-refs/pr-evidence/`]))
  const tips = refs.map(r => r.object.sha)
  for (const [url, , sha, path] of pins) {
    const held = tips.some(tip => {
      try {
        const status = run('gh', ['api', `repos/${repo}/compare/${sha}...${tip}`, '--jq', '.status'])
        return status === 'identical' || status === 'ahead'
      } catch {
        return false
      }
    })
    if (!held) {
      problems.push(`not on an evidence ref: ${url}`)
      continue
    }
    try {
      run('gh', ['api', `repos/${repo}/contents/${path}?ref=${sha}`, '--jq', '.sha'])
    } catch {
      problems.push(`no such file on its commit: ${url}`)
    }
  }
  return problems
}

function originRepo() {
  const url = run('git', ['remote', 'get-url', 'origin'])
  const match = url.match(/github\.com[:/](.+?\/.+?)(?:\.git)?\/?$/)
  if (!match) fail(`origin is not a GitHub repo: ${url.replace(/\/\/[^@]*@/, '//')}`)
  return match[1]
}

function gifOf(video, dir) {
  const gif = join(dir, `${basename(video, extname(video))}.preview.gif`)
  const filter = 'fps=10,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-t', '30', '-i', video, '-vf', filter, gif], { stdio: 'pipe' })
  } catch (error) {
    if (error.code !== 'ENOENT') fail(`ffmpeg could not make a preview of ${video}: ${error.message.split('\n')[0]}`)
    console.error(`no ffmpeg here, so ${basename(video)} gets a plain link and no preview`)
    return undefined
  }
  return gif
}

function attach(args) {
  const taskAt = args.indexOf('--task')
  const task = taskAt >= 0 ? args[taskAt + 1] : undefined
  const publicOk = args.includes('--public-ok')
  const files = args.filter((arg, i) => !arg.startsWith('--') && i !== taskAt + 1)
  if (!task || !/^[\w-]+$/.test(task) || files.length === 0) {
    fail('usage: pr-body.mjs attach --task <id> [--public-ok] <file>...')
  }
  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!IMAGES.has(ext) && !VIDEOS.has(ext)) fail(`${file}: paste logs and text into the body, attach only media`)
    if (statSync(file).size > MAX_BYTES) fail(`${file}: over 50 MiB, trim it first`)
  }

  const repo = originRepo()
  const visibility = run('gh', ['repo', 'view', repo, '--json', 'visibility', '--jq', '.visibility'])
  if (visibility === 'PUBLIC' && !publicOk) {
    fail(`${repo} is public. A ref there publishes these files for good. Get Jeff's yes, then pass --public-ok.`)
  }

  const scratch = mkdtempSync(join(tmpdir(), 'pr-evidence-'))
  try {
    const entries = new Map()
    const ref = `refs/pr-evidence/${task}`
    const parent = run('git', ['ls-remote', 'origin', ref]).split(/\s/)[0]
    if (parent) {
      run('git', ['fetch', '-q', 'origin', ref])
      for (const line of run('git', ['ls-tree', parent]).split('\n')) {
        if (line) entries.set(line.split('\t')[1], line)
      }
    }
    const add = path => {
      const name = basename(path).replace(/[^\w.-]+/g, '-')
      entries.set(name, `100644 blob ${run('git', ['hash-object', '-w', path])}\t${name}`)
      return name
    }
    const items = files.map(file => {
      const video = VIDEOS.has(extname(file).toLowerCase())
      const gif = video ? gifOf(resolve(file), scratch) : undefined
      return { name: add(resolve(file)), video, preview: gif && add(gif) }
    })

    const tree = run('git', ['mktree'], `${[...entries.values()].join('\n')}\n`)
    const [id, login] = run('gh', ['api', 'user', '--jq', '"\\(.id) \\(.login)"']).split(' ')
    const email = `${id}+${login}@users.noreply.github.com`
    const parents = parent ? ['-p', parent] : []
    const commit = execFileSync('git', ['commit-tree', tree, ...parents, '-m', `PR evidence for task ${task}`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'pr-evidence',
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: 'pr-evidence',
        GIT_COMMITTER_EMAIL: email,
      },
    }).trim()
    run('git', ['push', '-q', 'origin', `${commit}:${ref}`])
    if (run('git', ['ls-remote', 'origin', ref]).split(/\s/)[0] !== commit) fail(`push did not land on ${ref}`)

    const url = name => `https://github.com/${repo}/blob/${commit}/${encodeURIComponent(name)}?raw=true`
    for (const { name, video, preview } of items) {
      if (preview) console.log(`[![${name}](${url(preview)})](${url(name)})`)
      else console.log(video ? `[${name}](${url(name)})` : `![${name}](${url(name)})`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function hasGh() {
  try {
    run('gh', ['--version'])
    return true
  } catch {
    return false
  }
}

function check(args) {
  const prAt = args.indexOf('--pr')
  const online = hasGh()
  if (prAt >= 0 && !online) fail('check --pr needs gh. Run it on a host with gh signed in.')
  if (!online) console.error('no gh here, so the image check was skipped')
  const repo = online ? originRepo() : undefined
  let body
  let head
  if (prAt >= 0) {
    const pr = JSON.parse(run('gh', ['pr', 'view', args[prAt + 1], '-R', repo, '--json', 'body,headRefOid']))
    body = pr.body
    head = pr.headRefOid
  } else if (args[0]) {
    body = readFileSync(args[0], 'utf8')
  } else {
    fail('usage: pr-body.mjs check <body.md> | --pr <number>')
  }
  body = body.replace(/\r\n/g, '\n')
  const problems = [...lintBody(body, head), ...(online ? pinProblems(body, repo) : [])]
  if (problems.length > 0) fail(problems.join('\n'))
  console.log(`ok: ${SECTIONS.length} sections${head ? `, head ${head.slice(0, 7)}` : ''}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'attach') attach(args)
  else if (command === 'check') check(args)
  else fail('usage: pr-body.mjs attach|check')
}
