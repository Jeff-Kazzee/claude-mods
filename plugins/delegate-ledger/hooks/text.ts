import type { Delegate, DelegateOutcome, DelegateUnread } from '../types'

export const BRIEF_LIMIT = 2000

export type Delivery = {
  id: string
  outcome: DelegateOutcome | undefined
  outputFile: string | undefined
}

const OUTCOMES: Readonly<Record<string, DelegateOutcome>> = {
  completed: 'completed',
  failed: 'failed',
  killed: 'killed',
  stopped: 'killed',
}

export const outcomeOfStatus = (status: string): DelegateOutcome | undefined =>
  OUTCOMES[status.trim().toLowerCase()]

const tag = (block: string, name: string): string | undefined =>
  block.match(new RegExp(`<${name}>([^<]+)</${name}>`))?.[1]?.trim()

const HANDBACK = /<agent-message from="([^"]+)">\s*\[Subagent hand-back\]/g

// The engine reports finished background work to the model in two ways, a
// <task-notification> block and a subagent's hand-back message.
export const parseDeliveries = (text: string): Delivery[] => {
  const notices = text.includes('<task-notification>')
    ? text
        .split('<task-notification>')
        .slice(1)
        .flatMap((block): Delivery[] => {
          const id = tag(block, 'task-id')
          const status = tag(block, 'status')
          if (id === undefined || status === undefined) return []
          return [{ id, outcome: outcomeOfStatus(status), outputFile: tag(block, 'output-file') }]
        })
    : []
  const handbacks = [...text.matchAll(HANDBACK)].flatMap((match): Delivery[] =>
    match[1] === undefined ? [] : [{ id: match[1], outcome: 'completed', outputFile: undefined }],
  )
  return [...notices, ...handbacks]
}

const PATH = /(?<=^|[\s"'`(])(?:[A-Za-z]:[\\/]|~[\\/]|\/(?=[A-Za-z]))[^\s"'`<>|*?]+\.[A-Za-z0-9]{1,8}/g

export const findBriefPath = (prompt: string): string | undefined => {
  const paths = [...prompt.matchAll(PATH)].map(match => match[0])
  return paths.find(p => /\.(md|txt)$/i.test(p)) ?? paths[0]
}

const SECRETS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
]

const ASSIGNED = /\b([A-Za-z_]*(?:api[_-]?key|token|secret|password|passwd|credential)[A-Za-z_]*)(\s*[:=]\s*)(["']?)[^\s"'&]{8,}\3/gi

const LONG = /[A-Za-z0-9_-]{32,}/g

const looksLikeToken = (word: string): boolean =>
  /[0-9]/.test(word) &&
  /[a-z]/.test(word) &&
  /[A-Z]/.test(word) &&
  (word.match(/-/g)?.length ?? 0) <= 2

export const redact = (text: string): string =>
  SECRETS.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), text)
    .replace(ASSIGNED, (_whole, name: string, joint: string) => `${name}${joint}[redacted]`)
    .replace(LONG, word => (looksLikeToken(word) ? '[redacted]' : word))

export const cap = (text: string): string =>
  text.length <= BRIEF_LIMIT
    ? text
    : `${text.slice(0, BRIEF_LIMIT)}\n[cut at ${BRIEF_LIMIT} characters]`

export const describeCommand = (command: string, description: string | undefined): string =>
  redact(description?.trim() || command.trim().split('\n')[0]?.slice(0, 80) || 'background command')

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`

export const statusText = (mine: readonly Delegate[]): string | undefined => {
  const running = mine.filter(d => d.state === 'running').length
  const unread = mine.filter(d => d.state === 'done-unread').length
  if (running === 0 && unread === 0) return undefined
  if (unread === 0) return `${plural(running, 'delegate', 'delegates')} running`
  if (running === 0) return `${plural(unread, 'delegate result', 'delegate results')} unread`
  return `${plural(running, 'delegate', 'delegates')} running, ${unread} unread`
}

const kindLabel = (d: Delegate): string => (d.kind === 'agent' ? 'Agent' : 'Background command')

export const nagText = (due: readonly DelegateUnread[]): string => {
  const [only] = due
  if (due.length === 1 && only !== undefined) {
    const verb = only.outcome === 'failed' ? 'failed' : only.outcome === 'killed' ? 'stopped' : 'finished'
    return `${kindLabel(only)} "${only.description}" ${verb} 5 minutes ago. Nobody has read its result.`
  }
  return `${due.length} delegate results have waited 5 minutes unread. Run /delegates to see them.`
}

export const relaunchPrompt = (d: Delegate): string => {
  const lines =
    d.kind === 'agent'
      ? [
          `Relaunch the subagent "${d.description}". It was still running when its session ended.`,
          d.agentType === undefined ? undefined : `It ran as ${d.agentType}${d.model === undefined ? '' : ` on ${d.model}`}.`,
          d.briefPath === undefined ? undefined : `Its brief is ${d.briefPath}.`,
          d.outputFile === undefined ? undefined : `Its partial transcript is ${d.outputFile}.`,
          'Check what it finished before starting over. Its original prompt follows.',
        ]
      : [
          `Rerun the background command "${d.description}". It was still running when its session ended.`,
          d.outputFile === undefined ? undefined : `Read its output so far in ${d.outputFile} first.`,
          'The command follows.',
        ]
  return [...lines.filter((line): line is string => line !== undefined), '', d.brief].join('\n')
}

export const age = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export const shortModel = (model: string | undefined): string =>
  model === undefined ? '' : model.replace(/^claude-/, '')

export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path
