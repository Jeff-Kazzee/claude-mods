#!/usr/bin/env node
// Evidence and format checks for the pr-template skill.
//
//   node pr-body.mjs attach --task <id> [--public-ok] <file>...
//   node pr-body.mjs check <body.md>
//   node pr-body.mjs check --pr <number>
//
// attach stores files on refs/pr-evidence/<task> and prints Markdown for them.
// check asks GitHub to render the body and judges the HTML, so what it reads is what a reader
// sees. It exits 1 with one line per problem.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SECTIONS = ['ELI5', 'What Changed', 'Why', 'Linked Issue', 'Proof', 'Testing', 'Risk', 'AI Disclosure',
  'Review', 'Checklist']
const LABELS = ['Before', 'After', 'Mechanism', 'Level']
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const VIDEOS = new Set(['.mp4', '.webm', '.mov'])
const MAX_BYTES = 50 * 1024 * 1024
const PIN = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{40})\/([^?#]+)\?raw=true$/
const BROWSER_UPLOAD = /^https:\/\/(github\.com\/user-attachments\/|private-user-images\.githubusercontent\.com\/)/
const BOM = String.fromCharCode(0xfeff)
const EM_DASH = String.fromCharCode(0x2014)

function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

// Throws, so a cleanup in a finally block still runs. The catch at the bottom prints it.
function fail(message) {
  throw new Error(message)
}

function textOf(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function isBare(text) {
  return /^\W*(n\/?a|none)\W*$/i.test(text)
}

function hasContent(html) {
  const text = textOf(html)
  return /<img\b/.test(html) || (text !== '' && !isBare(text))
}

// Problems in a body, from GitHub's HTML for it. Rules about the source text read the raw body.
export function lintBody(html, raw, head) {
  const problems = []
  const sections = html.split(/(?=<h2[\s>])/).filter(part => part.startsWith('<h2')).map(part => {
    const [, title, rest] = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*)$/)
    const heading = textOf(title)
    return { heading: heading === 'Visual Proof' ? 'Proof' : heading, content: rest }
  })
  const known = sections.filter(section => SECTIONS.includes(section.heading))
  const found = known.map(section => section.heading)
  for (const { heading, content } of known) {
    if (!hasContent(content)) problems.push(`empty section: ${heading}`)
  }
  for (const section of SECTIONS) {
    if (!found.includes(section)) problems.push(`missing section: ${section}`)
  }
  const present = SECTIONS.filter(section => found.includes(section))
  if (found.join('|') !== present.join('|')) problems.push(`sections out of order: ${found.join(', ')}`)
  for (const label of LABELS) {
    const value = html.match(new RegExp(`<strong>${label}:</strong>([\\s\\S]*?)(?=</p>|</li>|<strong>[^<]*:</strong>)`))
    if (!value) problems.push(`missing **${label}:**`)
    else if (!hasContent(value[1])) problems.push(`empty **${label}:**`)
  }
  const prose = html.replace(/<code[\s>][\s\S]*?<\/code>/g, '')
  if (prose.includes('{{')) problems.push('unfilled {{field}}')
  if (raw.includes(EM_DASH)) problems.push('em dash')
  if (!/\n\s*Task: (\d+|none)\s*$/.test(raw)) problems.push('last line is not Task: <id or none>')
  if (head && !raw.includes(head.slice(0, 7))) problems.push(`body does not name the head ${head.slice(0, 7)}`)
  return problems
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&')
}

// Sorts what a reader will load: pins on this repo to look up, and problems found on sight.
export function classifyMedia(html, repo) {
  const wanted = repo.toLowerCase()
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(m => attribute(m[0], 'data-canonical-src') ?? attribute(m[0], 'src'))
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(m => attribute(m[0], 'href'))
    .filter(url => url?.match(PIN)?.[1].toLowerCase() === wanted)
  const pins = []
  const problems = []
  for (const url of new Set([...images, ...links])) {
    if (BROWSER_UPLOAD.test(url)) continue
    const pin = url?.match(PIN)
    if (pin?.[1].toLowerCase() === wanted) pins.push({ url, sha: pin[2], path: pin[3] })
    else problems.push(`not on an evidence ref: ${url}`)
  }
  return { pins, problems }
}

// A pin must be on a commit a refs/pr-evidence ref still holds. A contents lookup alone is not
// enough: GitHub answered one for a commit whose push was rejected.
function pinProblems(html, repo) {
  const { pins, problems } = classifyMedia(html, repo)
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

function signedIn() {
  try {
    run('gh', ['auth', 'status'])
    return true
  } catch {
    return false
  }
}

// GitHub renders for anyone, so a host with no login can check a body too.
export async function render(text, repo, online) {
  const request = JSON.stringify({ text, mode: 'gfm', context: repo })
  if (online) return run('gh', ['api', 'markdown', '--input', '-'], request)
  const response = await fetch('https://api.github.com/markdown', { method: 'POST', body: request })
    .catch(error => fail(`could not reach GitHub to render this body: ${error.message}`))
  if (!response.ok) fail(`GitHub would not render this body: HTTP ${response.status}`)
  return response.text()
}

function storedName(path) {
  return basename(path).replace(/[^\w.-]+/g, '-')
}

function previewName(path) {
  const name = storedName(path)
  return `${basename(name, extname(name))}.preview.gif`
}

function gifOf(video, dir) {
  const gif = join(dir, previewName(video))
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
    for (const name of VIDEOS.has(ext) ? [storedName(file), previewName(file)] : [storedName(file)]) {
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
      const name = storedName(path)
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

async function check(args) {
  const usage = 'usage: pr-body.mjs check <body.md> | --pr <number>'
  const prAt = args.indexOf('--pr')
  const online = signedIn()
  const repo = online ? originRepo() : undefined
  let body
  let head
  if (prAt >= 0) {
    if (!/^\d+$/.test(args[prAt + 1] ?? '')) fail(usage)
    if (!repo) fail('check --pr needs a signed-in gh, inside a checkout whose origin is on GitHub')
    const pr = JSON.parse(run('gh', ['pr', 'view', args[prAt + 1], '-R', repo, '--json', 'body,headRefOid']))
    body = pr.body
    head = pr.headRefOid
  } else if (args[0]) {
    if (!existsSync(args[0])) fail(`${args[0]}: no such file`)
    body = readFileSync(args[0], 'utf8')
  } else {
    fail(usage)
  }
  body = body.replace(BOM, '')
  if (!repo) console.error('no signed-in gh or GitHub origin here, so the image check was skipped')
  const html = await render(body, repo, online)
  const problems = [...lintBody(html, body, head), ...(repo ? pinProblems(html, repo) : [])]
  if (problems.length > 0) fail(problems.join('\n'))
  console.log(`ok: ${SECTIONS.length} sections${head ? `, head ${head.slice(0, 7)}` : ''}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'attach') attach(args)
    else if (command === 'check') await check(args)
    else fail('usage: pr-body.mjs attach|check')
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message)
    process.exitCode = 1
  }
}
