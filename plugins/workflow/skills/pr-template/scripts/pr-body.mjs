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
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SECTIONS = ['ELI5', 'What Changed', 'Why', 'Linked Issue', 'Proof', 'Testing', 'Risk', 'AI Disclosure',
  'Review', 'Checklist']
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const VIDEOS = new Set(['.mp4', '.webm', '.mov'])
const MAX_BYTES = 50 * 1024 * 1024
const EVIDENCE_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{40})\/([^?\s)"']+)\?raw=true/g
const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b[^>]*\bsrc=["']?([^"'\s>]+)/gi
const BROWSER_UPLOAD = /^https:\/\/(github\.com\/user-attachments\/|private-user-images\.githubusercontent\.com\/)/
const BOM = String.fromCharCode(0xfeff)

function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

// Hides what renders as code or nothing from the prose rules. Code stays as a marker, because
// it counts as content. A fence left open runs to the end of the body, as it does on GitHub.
function maskCode(text) {
  const kept = []
  let fence
  for (const line of text.split('\n')) {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = undefined
      continue
    }
    const open = line.match(/^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/)
    if (open) {
      fence = open[1]
      kept.push('CODE')
    } else {
      kept.push(line)
    }
  }
  return kept.join('\n').replace(/`[^`\n]*`/g, 'CODE').replace(/<!--[\s\S]*?(-->|$)/g, '')
}

function isBare(text) {
  return /^[*_\s]*n\/?a[*_\s.:]*$/i.test(text)
}

function labelFilled(prose, label) {
  const value = prose.slice(prose.indexOf(label) + label.length).split('\n')[0].trim()
  return value !== '' && !isBare(value)
}

// Problems a body has on its face, with no network. Pure, so tests can reach every rule.
export function lintBody(raw, head) {
  const problems = []
  const text = raw.replace(BOM, '')
  const prose = maskCode(text)
  const parts = prose.split(/^ {0,3}##[ \t]+/m).slice(1).map(part => {
    const [title, ...rest] = part.split('\n')
    const heading = title.replace(/\s+#+\s*$/, '').trim()
    return { heading: heading === 'Visual Proof' ? 'Proof' : heading, content: rest.join('\n').trim() }
  })
  const known = parts.filter(part => SECTIONS.includes(part.heading))
  const found = known.map(part => part.heading)
  for (const { heading, content } of known) {
    if (content === '' || isBare(content)) problems.push(`empty section: ${heading}`)
  }
  for (const section of SECTIONS) {
    if (!found.includes(section)) problems.push(`missing section: ${section}`)
  }
  const present = SECTIONS.filter(s => found.includes(s))
  if (found.join('|') !== present.join('|')) problems.push(`sections out of order: ${found.join(', ')}`)
  for (const label of ['**Before:**', '**After:**', '**Mechanism:**', '**Level:**']) {
    if (!prose.includes(label)) problems.push(`missing ${label}`)
    else if (!labelFilled(prose, label)) problems.push(`empty ${label}`)
  }
  if (prose.includes('{{')) problems.push('unfilled {{field}}')
  if (text.includes('\u2014')) problems.push('em dash')
  if (!/\n\s*Task: (\d+|none)\s*$/.test(text)) problems.push('last line is not Task: <id or none>')
  if (head && !text.includes(head.slice(0, 7))) problems.push(`body does not name the head ${head.slice(0, 7)}`)
  return problems
}

// Sorts every image and evidence link: pins on this repo to look up, and problems found on sight.
export function classifyMedia(text, repo) {
  const masked = maskCode(text)
  const images = [...masked.matchAll(IMAGE)].map(m => m[1] ?? m[2])
  const links = [...text.matchAll(EVIDENCE_URL)].filter(m => m[1].toLowerCase() === repo.toLowerCase()).map(m => m[0])
  const pins = []
  const problems = []
  for (const url of new Set([...images, ...links])) {
    if (BROWSER_UPLOAD.test(url)) continue
    const pin = [...url.matchAll(EVIDENCE_URL)][0]
    if (pin && pin[0] === url && pin[1].toLowerCase() === repo.toLowerCase()) pins.push({ url, sha: pin[2], path: pin[3] })
    else problems.push(`not on an evidence ref: ${url}`)
  }
  return { pins, problems }
}

// A pin must be on a commit a refs/pr-evidence ref still holds. A contents lookup alone is not
// enough: GitHub answered one for a commit whose push was rejected.
function pinProblems(text, repo) {
  const { pins, problems } = classifyMedia(text, repo)
  if (pins.length === 0) return problems
  const refs = JSON.parse(run('gh', ['api', `repos/${repo}/git/matching-refs/pr-evidence/`]))
  const tips = refs.map(r => r.object.sha)
  for (const { url, sha, path } of pins) {
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
  try {
    return run('git', ['remote', 'get-url', 'origin']).match(/github\.com[:/](.+?\/.+?)(?:\.git)?\/?$/)?.[1]
  } catch {
    return undefined
  }
}

function cleanName(path) {
  return basename(path).replace(/[^\w.-]+/g, '-')
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
  const files = []
  let task
  let publicOk = false
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--task') task = args[(i += 1)]
    else if (args[i] === '--public-ok') publicOk = true
    else if (args[i].startsWith('--')) fail(`unknown option ${args[i]}. A file with that name is ./${args[i]}`)
    else files.push(args[i])
  }
  if (!task || !/^\w[\w-]*$/.test(task) || files.length === 0) {
    fail('usage: pr-body.mjs attach --task <id> [--public-ok] <file>...')
  }
  const names = new Map()
  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!IMAGES.has(ext) && !VIDEOS.has(ext)) fail(`${file}: paste logs and text into the body, attach only media`)
    if (!existsSync(file)) fail(`${file}: no such file`)
    if (statSync(file).size > MAX_BYTES) fail(`${file}: over 50 MiB, trim it first`)
    const stored = [cleanName(file)]
    if (VIDEOS.has(ext)) stored.push(`${basename(cleanName(file), ext)}.preview.gif`)
    for (const name of stored) {
      if (names.has(name)) fail(`${names.get(name)} and ${file} would both be stored as ${name}. Rename one.`)
      names.set(name, file)
    }
  }

  const repo = originRepo()
  if (!repo) fail('run attach inside a checkout whose origin is on GitHub')
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
      const name = cleanName(path)
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

function signedIn() {
  try {
    run('gh', ['auth', 'status'])
    return true
  } catch {
    return false
  }
}

function check(args) {
  const prAt = args.indexOf('--pr')
  const online = signedIn()
  const repo = online ? originRepo() : undefined
  let body
  let head
  if (prAt >= 0) {
    if (!/^\d+$/.test(args[prAt + 1] ?? '')) fail('usage: pr-body.mjs check <body.md> | --pr <number>')
    if (!repo) fail('check --pr needs a signed-in gh, inside a checkout whose origin is on GitHub')
    const pr = JSON.parse(run('gh', ['pr', 'view', args[prAt + 1], '-R', repo, '--json', 'body,headRefOid']))
    body = pr.body
    head = pr.headRefOid
  } else if (args[0]) {
    if (!existsSync(args[0])) fail(`${args[0]}: no such file`)
    body = readFileSync(args[0], 'utf8')
  } else {
    fail('usage: pr-body.mjs check <body.md> | --pr <number>')
  }
  if (!repo) console.error('no signed-in gh or GitHub origin here, so the image check was skipped')
  const problems = [...lintBody(body, head), ...(repo ? pinProblems(body, repo) : [])]
  if (problems.length > 0) fail(problems.join('\n'))
  console.log(`ok: ${SECTIONS.length} sections${head ? `, head ${head.slice(0, 7)}` : ''}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'attach') attach(args)
    else if (command === 'check') check(args)
    else fail('usage: pr-body.mjs attach|check')
  } catch (error) {
    fail(error.stderr?.toString().trim() || error.message.split('\n')[0])
  }
}
