#!/usr/bin/env node
// Checks a README against the readme skill's limits.
//
//   node readme-check.mjs README.md                     rules that need no network
//   node readme-check.mjs README.md --online            also every link, image and badge
//   node readme-check.mjs README.md --clone <repo>      also runs the quick start on a fresh clone
//
// Exits 1 with one line per problem.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORDER = ['features', 'quick start', 'examples', 'documentation', 'contributing', 'license']
const FIRST_SCREEN_LINES = 40
const HYPE = /\b(blazing|revolutionary|world-class|seamless(?:ly)?|powerful|robust|cutting-edge|best-in-class|game-changing|effortless(?:ly)?|next-generation|stunning)\b/i
const UNBACKED = /\b(trusted by|used by|loved by|thousands of|millions of|hundreds of)\b/i
const COUNTED = /\b\d[\d,.]*\s*(?:k|m|\+)?\s*(?:%|percent|stars?|users?|downloads?|companies|customers|contributors|teams|developers|installs?|x faster|times faster)/i
const SOURCED = /<!--\s*source:\s*\S+\s*-->/
const BADGE = /img\.shields\.io|badge\.fury\.io|\/badge\.svg|badgen\.net|codecov\.io\/.*\/badge/i
const BROKEN_BADGE = />\s*(invalid|not found|repo not found|inaccessible|no status|unknown|error)\s*</i
const SHELL = /^(sh|bash|shell|console)$/i
const GIT_BASH = 'C:/Program Files/Git/bin/bash.exe'

const withoutCode = text => text.replace(/^```[\s\S]*?^```\s*$/gm, match => match.replace(/[^\n]/g, ''))
const withoutComments = text => text.replace(/<!--[\s\S]*?-->/g, '')
const strip = text => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export function sections(text) {
  const lines = withoutCode(text).split('\n')
  const raw = text.split('\n')
  const found = []
  lines.forEach((line, index) => {
    const heading = /^## +(.+?)\s*$/.exec(line)
    if (heading) found.push({ name: heading[1].toLowerCase(), start: index + 1 })
  })
  return found.map((section, i) => {
    const end = found[i + 1] ? found[i + 1].start - 1 : raw.length
    return { ...section, body: raw.slice(section.start, end).join('\n') }
  })
}

export function urls(text) {
  const plain = withoutComments(withoutCode(text))
  const links = [...plain.matchAll(/\]\(\s*<?([^)\s>]+)/g), ...plain.matchAll(/\bhref="([^"]+)"/g)].map(m => m[1])
  const images = [...plain.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g), ...plain.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1])
  return { links, images }
}

export function quickStartCommands(text) {
  const section = sections(text).find(s => s.name === 'quick start')
  if (!section) return []
  return [...section.body.matchAll(/^```(\w*)[^\n]*\n([\s\S]*?)^```\s*$/gm)]
    .filter(block => SHELL.test(block[1]))
    .flatMap(block => block[2].split('\n'))
    .map(line => line.trim().replace(/^\$\s+/, ''))
    .filter(line => line && !line.startsWith('#'))
}

export function lint(text, dir) {
  const problems = []
  const plain = withoutComments(withoutCode(text))

  if (text.includes('{{')) problems.push('an unfilled {{field}} remains')
  const titleAt = plain.split('\n').findIndex(line => /^#\s+\S/.test(line) || /<h1\b/.test(line))
  if (titleAt < 0) problems.push('no project name as an h1')
  const firstSection = plain.search(/^## /m)
  const top = plain.slice(0, firstSection < 0 ? plain.length : firstSection)
  const screen = top.split('\n').slice(0, FIRST_SCREEN_LINES).join('\n')

  const topLines = top.split('\n').slice(titleAt + 1)
    .filter(line => !/<img\b|!\[|<a\b|<h3|<\/?(div|p|br|h3)\b[^>]*>\s*$|<span/.test(line) || /<(strong|p)\b[^>]*>[^<]+/.test(line))
    .map(strip).filter(Boolean)
  if (topLines.length === 0) problems.push('no one-line description under the name')
  for (const line of topLines.slice(0, 2)) {
    if (line.split(' ').length > 10) problems.push(`the line "${line.slice(0, 40)}" is over 10 words`)
  }

  const shown = urls(screen).images
  const badges = urls(top).images.filter(src => BADGE.test(src))
  if (badges.length < 3 || badges.length > 5) problems.push(`${badges.length} badges, the limit is 3 to 5`)
  const hasFence = /^```/m.test(screen)
  if (!shown.some(src => !BADGE.test(src)) && !hasFence) {
    problems.push(`no visual in the first ${FIRST_SCREEN_LINES} lines`)
  }

  const found = sections(text)
  const names = found.map(s => s.name)
  for (const name of ORDER) {
    const section = found.find(s => s.name === name)
    if (!section) problems.push(`no "${name}" section`)
    else if (!strip(section.body)) problems.push(`the "${name}" section is empty`)
  }
  const present = names.filter(name => ORDER.includes(name))
  if (present.join() !== ORDER.filter(name => present.includes(name)).join()) {
    problems.push('sections are out of order')
  }

  const features = found.find(s => s.name === 'features')
  if (features) {
    const bullets = features.body.split('\n').filter(line => /^[-*] /.test(line))
    if (bullets.length < 4 || bullets.length > 7) problems.push(`${bullets.length} features, the limit is 4 to 7`)
  }
  const steps = quickStartCommands(text)
  if (found.some(s => s.name === 'quick start') && (steps.length < 1 || steps.length > 5)) {
    problems.push(`${steps.length} quick start commands, the limit is 1 to 5`)
  }
  const examples = found.find(s => s.name === 'examples')
  if (examples) {
    const count = (examples.body.match(/^### /gm) ?? []).length
    if (count < 2 || count > 3) problems.push(`${count} examples, the limit is 2 or 3`)
  }
  const docs = found.find(s => s.name === 'documentation')
  if (docs && !/\]\(|href=/.test(docs.body)) problems.push('the documentation section has no link')
  const architecture = found.find(s => s.name === 'architecture')
  if (architecture && strip(architecture.body).split(' ').length > 25) {
    problems.push('architecture belongs in ARCHITECTURE.md, with one link here')
  }
  if (dir && !['LICENSE', 'LICENSE.md', 'LICENSE.txt'].some(name => existsSync(join(dir, name)))) {
    problems.push('no LICENSE file')
  }

  const prose = withoutCode(text).split('\n')
  prose.forEach((line, index) => {
    const at = `line ${index + 1}`
    const bare = withoutComments(line)
    if (/^\s*[-*] +\p{Extended_Pictographic}/u.test(bare)) problems.push(`${at}: emoji bullet`)
    if (bare.includes('—')) problems.push(`${at}: em dash`)
    const words = bare.replace(/`[^`]*`/g, '').replace(/<[^>]+>/g, '').replace(/\]\([^)]*\)/g, ']').replace(/&[a-z#0-9]+;/gi, '')
    if (words.includes(';')) problems.push(`${at}: semicolon in prose`)
    const hype = HYPE.exec(words)
    if (hype) problems.push(`${at}: marketing word "${hype[0]}"`)
    if (/README Generator/i.test(words)) problems.push(`${at}: names the README Generator`)
    const claim = UNBACKED.exec(words) ?? COUNTED.exec(words)
    if (claim && !SOURCED.test(line)) problems.push(`${at}: "${claim[0]}" has no <!-- source: url -->`)
  })
  return problems
}

const anchor = heading => heading.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-')

async function reach(url, isBadge) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': 'readme-check' },
    })
    if (response.status >= 400) return `HTTP ${response.status}`
    if (!isBadge) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return `not an image, ${type || 'no content type'}`
    if (type.includes('svg') && BROKEN_BADGE.test(await response.text())) return 'the badge reports an error'
    return null
  } catch (error) {
    return error.cause?.code ?? error.name
  }
}

export async function online(text, dir) {
  const problems = []
  const { links, images } = urls(text)
  const headings = new Set(withoutCode(text).split('\n').flatMap(line => {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    return heading ? [anchor(heading[1])] : []
  }))
  for (const url of new Set([...links, ...images])) {
    if (url.startsWith('#')) {
      if (!headings.has(url.slice(1))) problems.push(`broken anchor ${url}`)
    } else if (/^https?:/i.test(url)) {
      const failure = await reach(url, images.includes(url) && BADGE.test(url))
      if (failure) problems.push(`${url}: ${failure}`)
    } else if (!/^(mailto:|tel:)/i.test(url)) {
      if (!existsSync(join(dir, url.split(/[#?]/)[0]))) problems.push(`missing file ${url}`)
    }
  }
  return problems
}

export function runQuickStart(text, source, timeoutMs = 300000) {
  const commands = quickStartCommands(text)
  const dir = mkdtempSync(join(tmpdir(), 'readme-clone-'))
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', source, dir], { stdio: 'pipe' })
    const script = ['set -e', ...commands].join('\n')
    const shell = existsSync(GIT_BASH) ? GIT_BASH : 'bash'
    const run = spawnSync(shell, ['-c', script], { cwd: dir, stdio: 'pipe', timeout: timeoutMs, encoding: 'utf8' })
    if (run.status === 0) return []
    return [`quick start failed on a fresh clone, exit ${run.status}: ${(run.stderr || run.stdout || '').trim().split('\n').at(-1)}`]
  } catch (error) {
    return [`could not clone ${source}: ${error.message.split('\n')[0]}`]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const file = args.find(arg => !arg.startsWith('--'))
  if (!file || (args.includes('--clone') && args.at(-1) === '--clone')) {
    console.error('usage: readme-check.mjs README.md [--online] [--clone <repo>]')
    process.exit(2)
  }
  const path = resolve(file)
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const dir = dirname(path)
  const problems = lint(text, dir)
  if (args.includes('--online')) problems.push(...await online(text, dir))
  if (args.includes('--clone') && problems.length === 0) {
    problems.push(...runQuickStart(text, args[args.indexOf('--clone') + 1]))
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`ok: ${file}, ${quickStartCommands(text).length} quick start commands`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
