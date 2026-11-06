// The rules for a PR body, and the call that renders one. pr-body.mjs is the command line.

import { execFileSync } from 'node:child_process'
import { extname } from 'node:path'

export const SECTIONS = ['ELI5', 'What Changed', 'Why', 'Linked Issue', 'Proof', 'Testing', 'Risk', 'AI Disclosure',
  'Review', 'Checklist']
const LABELS = ['Before', 'After', 'Mechanism', 'Impact']
const LABEL_END = `</li>|<h[1-6][\\s>]|<strong>(?:${LABELS.join('|')}|Level):</strong>|$`
export const VIDEOS = new Set(['.mp4', '.webm', '.mov'])
const PIN = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/blob\/([0-9a-f]{40})\/([^?#]+)\?raw=true$/
const GITHUB_HOSTED = /^https:\/\/(github\.com\/user-attachments\/|github\.com\/[\w.-]+\/[\w.-]+\/assets\/|(private-)?user-images\.githubusercontent\.com\/|github\.githubassets\.com\/images\/icons\/emoji\/)/
const EM_DASH = String.fromCharCode(0x2014)

export function run(cmd, args, input) {
  return execFileSync(cmd, args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

// Throws, so a cleanup in a finally block still runs. The command line prints it.
export function fail(message) {
  throw new Error(message)
}

function textOf(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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
    const value = html.match(new RegExp(`<strong>${label}:</strong>([\\s\\S]*?)(?=${LABEL_END})`))
    if (!value) problems.push(`missing **${label}:**`)
    else if (!hasContent(value[1])) problems.push(`empty **${label}:**`)
  }
  const level = html.match(/<strong>Level:<\/strong>([\s\S]*?)(?=<\/p>|<\/li>)/)
  if (!level) problems.push('missing **Level:**')
  else if (!/\b(low|medium|high)\b/i.test(textOf(level[1]))) problems.push('**Level:** must say Low, Medium or High')
  const prose = html.replace(/<pre[\s>][\s\S]*?<\/pre>/g, '').replace(/<code[\s>][\s\S]*?<\/code>/g, '')
  if (textOf(prose).includes('{{')) problems.push('unfilled {{field}}')
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
    .filter(url => url?.match(PIN)?.[1].toLowerCase() === wanted && VIDEOS.has(extname(url.match(PIN)[3]).toLowerCase()))
  const pins = []
  const problems = []
  for (const url of new Set([...images, ...links])) {
    if (GITHUB_HOSTED.test(url)) continue
    const pin = url?.match(PIN)
    if (pin?.[1].toLowerCase() === wanted) pins.push({ url, sha: pin[2], path: pin[3] })
    else problems.push(`not on an evidence ref: ${url}`)
  }
  return { pins, problems }
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
