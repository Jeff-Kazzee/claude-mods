import type { ModelEffort } from 'claude-code'

import type { TasteOutcome, TasteReview, TasteTrigger } from '../types'

export const CRITIC_TIMEOUT_MS = 60_000
export const CRITIC_MAX_TOKENS = 2_000
export const CRITIC_EFFORT: ModelEffort = 'medium'
export const MAX_FINDINGS = 6
export const MAX_FILE_CHARS = 60_000
export const MAX_FAILURES_PER_FILE = 2

export const WRITING_FLOOR = [
  '- No em dashes. One em dash fails the file.',
  '- No semicolons in prose.',
  '- No marketing adjectives.',
  '- No tidy moral ending. A piece ends on its last fact or next action, not on a lesson, a summary, or what it all means.',
].join('\n')

/** Dated in taste.md. Kept here too so the critic holds them when taste.md is missing, and a test can prove it. */
export const DO_NOT_FLAG = [
  '- The attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end of a PR body. The workspace requires it.',
  '- Parentheses. The writing law replaces a dash with "a period, a comma, or parentheses", so a parenthetical is allowed, not a dash substitute.',
].join('\n')

export type CriticRules = { voice: string; unslop: string; taste: string }

export const toSlashes = (path: string): string => path.replace(/\\/g, '/')

export const isAbsolute = (path: string): boolean => /^(?:[A-Za-z]:)?[\\/]/.test(path)

export const baseName = (path: string): string => toSlashes(path).split('/').pop() ?? path

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of toSlashes(path).split('/')) {
    const last = parts[parts.length - 1]
    if (part === '.') continue
    if (part === '..' && parts.length > 1 && last !== '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

export type Target = { named: string; via: TasteTrigger }

/**
 * Reads the call as plain data: an MCP tool with its own `tool` argument
 * (Ahrefs `doc`) collapses a ToolCallInput variant, so `e.tool` does not type.
 */
export function targetOf(call: Readonly<Record<string, unknown>>): Target | undefined {
  const named = call.file_path
  if (typeof named !== 'string' || named === '') return undefined
  if (call.tool === 'Write' || call.tool === 'Edit') return { named, via: 'write' }
  const isPublish = call.tool === 'Artifact' && (call.action ?? 'publish') === 'publish' && call.asset !== true
  return isPublish ? { named, via: 'publish' } : undefined
}

export const usesVoice = (path: string): boolean =>
  /(?:^|\/)content\/(?:.*\/)?[^/]*\.(?:md|mdx|markdown|txt|html?)$/i.test(toSlashes(path))

export function splitGlobs(spec: string): string[] {
  const globs: string[] = []
  let depth = 0
  let current = ''
  for (const c of spec) {
    if (c === '{') depth += 1
    if (c === '}') depth = Math.max(0, depth - 1)
    if ((c === ',' || c === '\n') && depth === 0) {
      globs.push(current)
      current = ''
    } else {
      current += c
    }
  }
  globs.push(current)
  return globs.map(one => one.trim()).filter(one => one !== '')
}

export function globToRegExp(glob: string): RegExp {
  const g = toSlashes(glob.trim())
  let out = /^(?:\*\*\/|\/|[A-Za-z]:\/)/.test(g) ? '' : '(?:.*/)?'
  let depth = 0
  for (let i = 0; i < g.length; i++) {
    const c = g[i] ?? ''
    if (c === '*' && g[i + 1] === '*') {
      const isDirs = g[i + 2] === '/'
      out += isDirs ? '(?:.*/)?' : '.*'
      i += isDirs ? 2 : 1
    } else if (c === '*') {
      out += '[^/]*'
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '{') {
      depth += 1
      out += '(?:'
    } else if (c === '}' && depth > 0) {
      depth -= 1
      out += ')'
    } else if (c === ',' && depth > 0) {
      out += '|'
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`, 'i')
}

export const compileGlobs = (spec: string): RegExp[] => splitGlobs(spec).map(globToRegExp)

export const matchesAny = (path: string, globs: readonly RegExp[]): boolean =>
  globs.some(glob => glob.test(toSlashes(path)))

export const stripFrontmatter = (text: string): string =>
  text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number)
  const pb = b.split(/[.-]/).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const delta = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (Number.isFinite(delta) && delta !== 0) return delta
  }
  return 0
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function criticSystem(rules: CriticRules): string {
  const sections = [
    "You are a critic with Jeff Kazzee's taste. An agent just wrote the file below and Jeff has not seen it yet. Report what Jeff would reject. You only report. The rule files below say how to edit prose. Use them to judge, never to rewrite the file.",
    'For HTML, judge the visible text and what the markup shows about the design: placeholder or missing content, unfinished sections, facts shown as widgets instead of plain text.',
    `<writing-floor>\n${WRITING_FLOOR}\n</writing-floor>`,
    `<do-not-flag>\nThe critic got these wrong before. Never report them, whatever a rule below seems to say.\n${DO_NOT_FLAG}\n</do-not-flag>`,
    rules.unslop && `<unslop>\n${rules.unslop}\n</unslop>`,
    rules.voice && `<jeff-voice>\nThis file is content published as Jeff. Hold it to this voice.\n${rules.voice}\n</jeff-voice>`,
    rules.taste && `<past-rejections>\n${rules.taste}\n</past-rejections>`,
    [
      'Answer format:',
      `- A numbered list of at most ${MAX_FINDINGS} findings, worst first.`,
      '- Each finding quotes the exact words from the file in double quotes, names the rule it breaks, and gives the fix in one short sentence.',
      '- Report only what the file contains. No finding without a verbatim quote.',
      '- If Jeff would reject nothing, answer exactly: CLEAN',
      '- No preamble and no summary.',
    ].join('\n'),
  ]
  return sections.filter(Boolean).join('\n\n')
}

export function criticPrompt(path: string, text: string): string {
  const isCut = text.length > MAX_FILE_CHARS
  const body = isCut ? text.slice(0, MAX_FILE_CHARS) : text
  const note = isCut ? `\n(The file is cut at ${MAX_FILE_CHARS} characters.)` : ''
  return `File: ${toSlashes(path)}${note}\n\n<file>\n${body}\n</file>`
}

/** The findings, `[]` for a clean file, or undefined for a reply in neither form. */
export function parseFindings(reply: string): string[] | undefined {
  const plain = reply.replace(/[*_`]/g, '').trim()
  if (/^CLEAN\b/i.test(plain)) return []
  const items: string[] = []
  for (const line of reply.trim().split(/\r?\n/)) {
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      items.push(numbered[1] ?? '')
    } else if (items.length > 0 && line.trim() !== '') {
      items[items.length - 1] += ` ${line.trim()}`
    }
  }
  if (items.length > 0) return items.slice(0, MAX_FINDINGS)
  return /\bCLEAN\b/.test(plain) ? [] : undefined
}

export function contextNote(path: string, findings: readonly string[]): string {
  const list = findings.map((finding, i) => `${i + 1}. ${finding}`).join('\n')
  return [
    `taste-fork review of ${toSlashes(path)}. A critic with Jeff's taste read this file. Fix each finding before you show Jeff, or dismiss it with a reason in your reply. Edits to this file get no second review this session.`,
    list,
  ].join('\n')
}

export const withOutcome = (review: TasteReview, outcome: TasteOutcome): TasteReview => ({
  id: review.id,
  path: review.path,
  hash: review.hash,
  via: review.via,
  at: review.at,
  ...outcome,
})

export function hasHadPass(
  reviews: readonly TasteReview[],
  path: string,
  hash: string,
  via: TasteTrigger,
): boolean {
  const passes = reviews.filter(r => r.outcome !== 'failed')
  if (passes.some(r => r.hash === hash)) return true
  const failuresHere = reviews.filter(r => r.outcome === 'failed' && samePath(r.path, path)).length
  if (failuresHere >= MAX_FAILURES_PER_FILE) return true
  const passesHere = passes.filter(r => samePath(r.path, path))
  if (passesHere.length === 0) return false
  return via === 'write' || passesHere.some(r => r.via === 'publish')
}

export function statusText(reviews: readonly TasteReview[]): string | undefined {
  const pending = reviews.filter(r => r.outcome === 'pending')
  const latest = pending[pending.length - 1]
  if (latest) return `taste reviewing ${baseName(latest.path)}`
  const reviewed = reviews.filter(r => r.outcome === 'clean' || r.outcome === 'findings')
  const files = new Set(reviewed.map(r => r.path.toLowerCase())).size
  const failed = reviews.filter(r => r.outcome === 'failed').length
  if (files === 0 && failed === 0) return undefined
  const findings = reviews.reduce((sum, r) => sum + (r.outcome === 'findings' ? r.findings : 0), 0)
  const parts = [
    `taste ${findings} ${findings === 1 ? 'finding' : 'findings'}`,
    `${files} ${files === 1 ? 'file' : 'files'}`,
  ]
  if (failed > 0) parts.push(`${failed} failed`)
  return parts.join(', ')
}
