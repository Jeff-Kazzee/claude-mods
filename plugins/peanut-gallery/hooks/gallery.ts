import type { Note, NoteAuthor, NoteBody, NoteKind, NoteStatus, Sting } from '../types'

export const NOTE_TOOL = 'mcp__peanut-gallery__note'
export const PER_AGENT_CAP = 5
export const ARCHIVED_KEPT = 300
export const PANE_LIMIT = 50

const LIMITS = { text: 400, project: 80, about: 200 } as const
const KINDS: readonly NoteKind[] = ['comment', 'reminder', 'suggestion', 'criticism']
const STATUSES: readonly NoteStatus[] = ['unread', 'read', 'archived']
const REDACTED = '[redacted]'

export const TOOL_SPEC = {
  name: 'note',
  description: [
    'Leaves Jeff a short private note in the peanut gallery. Only Jeff reads it.',
    'No agent can list or read the notes, so write for him alone.',
    'He wants candid notes, and honest criticism most of all: of the project, the plan, the code, his decisions, or your own work.',
    'Use it sparingly, about three notes a session, more only when something is wrong.',
    'Never put a secret, token, or credential in a note. A note never replaces answering Jeff.',
    'The tool answers only "Noted."',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: KINDS,
        description: 'comment, reminder, suggestion, or criticism.',
      },
      text: {
        type: 'string',
        maxLength: LIMITS.text,
        description: `The note, at most ${LIMITS.text} characters.`,
      },
      project: {
        type: 'string',
        maxLength: LIMITS.project,
        description: 'The project it concerns. Left out, the session folder name.',
      },
      about: {
        type: 'string',
        maxLength: LIMITS.about,
        description: 'The file, issue, PR, or decision it refers to.',
      },
      sting: {
        type: 'integer',
        minimum: 1,
        maximum: 3,
        description: 'Used for a criticism only. 1 is mild and 3 is sharp. Left out, it is 1.',
      },
    },
    required: ['kind', 'text'],
    additionalProperties: false,
  },
}

export const INVITE_SECTION = {
  id: 'peanut-gallery:invite',
  scope: 'session',
  text: [
    '# Peanut gallery',
    '',
    `Jeff keeps a private back channel, the ${NOTE_TOOL} tool. Only Jeff reads it, and no agent can list or read what others wrote.`,
    'He wants candid notes, and honest criticism most of all: of the project, the plan, the code, his decisions, and your own work.',
    'A criticism that stings is welcome when it is true.',
    'Use it sparingly, about three notes a session, more only when something is wrong.',
    'Never put a secret, token, or credential in a note. A note never replaces answering Jeff, and you need not mention it in your reply.',
  ].join('\n'),
} as const

export type NoteDraft = NoteBody & { text: string; project?: string; about?: string }

export type Parsed = { isValid: true; draft: NoteDraft } | { isValid: false; error: string }

export type Admission = 'kept' | 'duplicate' | 'capped'

const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, REDACTED],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\b(Bearer|Basic)\s+(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${REDACTED}`],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
  [
    /\b([A-Za-z0-9_.-]*?(?:api[_-]?key|access[_-]?key|secret|token|passw(?:or)?d|pwd|credentials?))(["']?\s*[:=]\s*)(["']?)(?=[^\s"',;]*\d|[^\s"',;]{16,})[^\s"',;]{6,}\3/gi,
    `$1$2$3${REDACTED}$3`,
  ],
  [/\b(?=[A-Za-z0-9_+=-]*[A-Z])(?=[A-Za-z0-9_+=-]*[a-z])(?=[A-Za-z0-9_+=-]*\d)[A-Za-z0-9_+=-]{32,}/g, REDACTED],
]

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

function optionalText(value: unknown, field: 'project' | 'about'): string | undefined | { error: string } {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return { error: `${field} must be text.` }
  const trimmed = value.trim()
  if (trimmed.length > LIMITS[field]) return { error: `${field} is over ${LIMITS[field]} characters.` }
  return trimmed === '' ? undefined : trimmed
}

function isSting(value: unknown): value is Sting {
  return value === 1 || value === 2 || value === 3
}

function isKind(value: unknown): value is NoteKind {
  return KINDS.some(kind => kind === value)
}

function isStatus(value: unknown): value is NoteStatus {
  return STATUSES.some(status => status === value)
}

export function parseNote(input: Readonly<Record<string, unknown>>): Parsed {
  const { kind, text, sting } = input
  if (!isKind(kind)) {
    return { isValid: false, error: `kind must be one of ${KINDS.join(', ')}.` }
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return { isValid: false, error: 'text is required.' }
  }
  const trimmed = text.trim()
  if (trimmed.length > LIMITS.text) {
    return { isValid: false, error: `text is ${trimmed.length} characters. The limit is ${LIMITS.text}.` }
  }
  if (sting !== undefined && sting !== null && !isSting(sting)) {
    return { isValid: false, error: 'sting must be 1, 2, or 3.' }
  }
  const project = optionalText(input.project, 'project')
  if (typeof project === 'object') return { isValid: false, error: project.error }
  const about = optionalText(input.about, 'about')
  if (typeof about === 'object') return { isValid: false, error: about.error }

  const body: NoteBody = kind === 'criticism' ? { kind, sting: isSting(sting) ? sting : 1 } : { kind }
  return {
    isValid: true,
    draft: {
      ...body,
      text: redact(trimmed),
      ...(project === undefined ? {} : { project: redact(project) }),
      ...(about === undefined ? {} : { about: redact(about) }),
    },
  }
}

export function authorKey(author: NoteAuthor): string {
  return author.kind === 'main' ? 'main' : author.agentId
}

function sameText(a: string, b: string): boolean {
  const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return normal(a) === normal(b)
}

export function admit(notes: readonly Note[], candidate: Note): Admission {
  const sameSession = notes.filter(note => note.sessionId === candidate.sessionId)
  if (sameSession.some(note => sameText(note.text, candidate.text))) return 'duplicate'
  const key = authorKey(candidate.author)
  const byAuthor = sameSession.filter(note => authorKey(note.author) === key).length
  return byAuthor >= PER_AGENT_CAP ? 'capped' : 'kept'
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function unreadCount(notes: readonly Note[]): number {
  return notes.filter(note => note.status === 'unread').length
}

export function statusLine(notes: readonly Note[]): string | undefined {
  const unread = unreadCount(notes)
  return unread === 0 ? undefined : `gallery ${unread}`
}

export function newestFirst(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => b.time - a.time)
}

export function prune(notes: readonly Note[]): { kept: Note[]; dropped: Note[] } {
  const ordered = newestFirst(notes)
  const archived = ordered.filter(note => note.status === 'archived')
  const dropped = new Set(archived.slice(ARCHIVED_KEPT).map(note => note.id))
  return {
    kept: ordered.filter(note => !dropped.has(note.id)),
    dropped: ordered.filter(note => dropped.has(note.id)),
  }
}

export function noteKey(id: string): string {
  return `note:${id}`
}

export function isNoteKey(key: string): boolean {
  return key.startsWith('note:')
}

export function parseStoredNote(value: unknown): Note | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const note = value as Record<string, unknown>
  const author = note.author as Record<string, unknown> | undefined
  const isAuthor =
    typeof author === 'object' &&
    author !== null &&
    (author.kind === 'main' || (author.kind === 'subagent' && typeof author.agentId === 'string'))
  const isValid =
    typeof note.id === 'string' &&
    typeof note.time === 'number' &&
    typeof note.sessionId === 'string' &&
    typeof note.text === 'string' &&
    isKind(note.kind) &&
    isStatus(note.status) &&
    (note.kind !== 'criticism' || isSting(note.sting)) &&
    isAuthor
  return isValid ? (value as Note) : undefined
}

export function ageText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function kindText(note: NoteBody): string {
  return note.kind === 'criticism' ? `criticism, sting ${note.sting}` : note.kind
}

export function authorText(author: NoteAuthor): string {
  const who = author.kind === 'main' ? 'main session' : `subagent ${author.agentType ?? author.agentId}`
  return author.model === undefined ? who : `${who} (${author.model})`
}

export function headline(note: Note, now: number): string {
  return [kindText(note), note.project ?? 'no project', authorText(note.author), ageText(now - note.time)].join(' · ')
}

function utc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export function exportMarkdown(notes: readonly Note[], now: number): string {
  const open = newestFirst(notes).filter(note => note.status !== 'archived')
  const unread = unreadCount(open)
  const lines = ['# Peanut gallery', '', `Exported ${utc(now)}. ${plural(open.length, 'note')}, ${unread} unread.`]
  open.forEach((note, index) => {
    lines.push(
      '',
      `## ${index + 1}. ${kindText(note)}, ${note.status}`,
      '',
      `- When: ${utc(note.time)}`,
      `- Project: ${note.project ?? 'none given'}`,
      ...(note.about === undefined ? [] : [`- About: ${note.about}`]),
      `- From: ${authorText(note.author)}`,
      '',
      note.text,
    )
  })
  return `${lines.join('\n')}\n`
}

export function folderName(path: string): string | undefined {
  const parts = path.split(/[\\/]+/).filter(part => part !== '')
  return parts.at(-1)
}
