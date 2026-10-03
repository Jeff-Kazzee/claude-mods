import type { Criterion, Measure, Rubric } from '../types'

export type Parsed = { rubric: Rubric } | { errors: readonly string[] }

const ID = /^[A-Za-z][\w-]{0,31}$/
const COMMAND_TIMEOUT_MS = 120_000
const JUDGE_TIMEOUT_MS = 90_000
const MAX_TIMEOUT_MS = 600_000

export function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
}

export function slashes(path: string): string {
  return path.replace(/\\/g, '/')
}

export function joinPath(base: string, rest: string): string {
  const parts: string[] = []
  for (const part of `${slashes(base)}/${slashes(rest)}`.split('/')) {
    if (part === '.' || (part === '' && parts.length > 0)) continue
    if (part === '..' && parts.length > 1) parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

export function resolvePath(base: string, path: string): string {
  return isAbsolutePath(path) ? joinPath(path, '.') : joinPath(base, path)
}

export function dirOf(path: string): string {
  const clean = slashes(path)
  const cut = clean.lastIndexOf('/')
  return cut <= 0 ? clean : clean.slice(0, cut)
}

export function samePath(a: string, b: string): boolean {
  const key = (path: string) => slashes(path).replace(/\/+$/, '').toLowerCase()
  return key(a) === key(b)
}

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const

export function sameModel(a: string, b: string): boolean {
  const key = (model: string) => {
    const plain = model.toLowerCase().replace(/\[.*?\]/g, '').trim()
    return FAMILIES.find(family => plain.includes(family)) ?? plain
  }
  return key(a) === key(b)
}

export function parseRubric(text: string, path: string): Parsed {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { errors: [`rubric.json is not valid JSON: ${String(error)}`] }
  }
  const errors: string[] = []
  const at = (field: string, problem: string) => errors.push(`${field}: ${problem}`)
  if (!isRecord(raw)) return { errors: ['rubric.json must hold one JSON object.'] }

  const endeavour = dirOf(path)
  const name = stringField(raw, 'name', at)
  const workdirText = stringField(raw, 'workdir', at)

  const criteria: Criterion[] = []
  if (!Array.isArray(raw.criteria) || raw.criteria.length === 0) {
    at('criteria', 'needs at least one criterion')
  } else if (raw.criteria.length > 12) {
    at('criteria', 'holds at most 12 criteria')
  } else {
    raw.criteria.forEach((entry: unknown, index: number) => {
      const criterion = parseCriterion(entry, `criteria[${index}]`, at)
      if (criterion === undefined) return
      if (criteria.some(other => other.id === criterion.id)) at(`criteria[${index}].id`, `"${criterion.id}" is used twice`)
      else criteria.push(criterion)
    })
    if (criteria.length > 0 && !criteria.some(criterion => criterion.weight > 0)) {
      at('criteria', 'at least one criterion needs a weight above 0')
    }
  }

  const guards: string[] = []
  if (raw.guards !== undefined) {
    if (!Array.isArray(raw.guards) || !raw.guards.every((guard: unknown) => typeof guard === 'string')) {
      at('guards', 'must be a list of criterion ids')
    } else {
      for (const guard of raw.guards as string[]) {
        if (!criteria.some(criterion => criterion.id === guard)) at('guards', `"${guard}" names no criterion`)
        else guards.push(guard)
      }
    }
  }

  const target = numberField(raw, 'target', at, { min: 0, max: 10 })

  let budget: Rubric['budget'] | undefined
  if (!isRecord(raw.budget)) {
    at('budget', 'needs maxRounds and maxMinutes')
  } else {
    const maxRounds = numberField(raw.budget, 'maxRounds', at, { min: 1, max: 500, isInteger: true }, 'budget.maxRounds')
    const maxMinutes = numberField(raw.budget, 'maxMinutes', at, { min: 1, max: 10_080 }, 'budget.maxMinutes')
    if (maxRounds !== undefined && maxMinutes !== undefined) budget = { maxRounds, maxMinutes }
  }

  let stopAfterNoGain = 3
  if (raw.stopAfterNoGain !== undefined) {
    if (raw.stopAfterNoGain === 0) at('stopAfterNoGain', 'cannot be 0, or the loop would never stop on a plateau')
    else {
      const value = numberField(raw, 'stopAfterNoGain', at, { min: 1, max: 100, isInteger: true })
      if (value !== undefined) stopAfterNoGain = value
    }
  }

  if (errors.length > 0 || name === undefined || workdirText === undefined || target === undefined || budget === undefined) {
    return { errors }
  }
  return {
    rubric: {
      name,
      path: slashes(path),
      endeavour,
      workdir: resolvePath(endeavour, workdirText),
      criteria,
      guards,
      target,
      budget,
      stopAfterNoGain,
    },
  }
}

type Report = (field: string, problem: string) => void

function parseCriterion(entry: unknown, field: string, at: Report): Criterion | undefined {
  if (!isRecord(entry)) {
    at(field, 'must be an object')
    return undefined
  }
  const id = stringField(entry, 'id', at, `${field}.id`)
  if (id !== undefined && !ID.test(id)) at(`${field}.id`, 'use letters, digits, - and _, starting with a letter, up to 32')
  const weight = numberField(entry, 'weight', at, { min: 0, max: 1000 }, `${field}.weight`)
  const direction = entry.direction
  if (direction !== 'up' && direction !== 'down') at(`${field}.direction`, 'must be "up" or "down"')

  let scale = { min: 0, max: 10 }
  if (entry.scale !== undefined) {
    const min = isRecord(entry.scale) ? entry.scale.min : undefined
    const max = isRecord(entry.scale) ? entry.scale.max : undefined
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      at(`${field}.scale`, 'needs numbers min and max with min below max')
    } else {
      scale = { min, max }
    }
  }

  const measure = parseMeasure(entry.measure, `${field}.measure`, at)
  if (id === undefined || !ID.test(id) || weight === undefined || (direction !== 'up' && direction !== 'down') || measure === undefined) {
    return undefined
  }
  return { id, weight, direction, scale, measure }
}

function parseMeasure(entry: unknown, field: string, at: Report): Measure | undefined {
  if (!isRecord(entry) || (entry.command === undefined) === (entry.judge === undefined)) {
    at(field, 'needs exactly one of command or judge')
    return undefined
  }
  if (entry.command !== undefined) {
    const argv = entry.command
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every((arg: unknown) => typeof arg === 'string' && arg !== '')) {
      at(`${field}.command`, 'must be a list of non-empty strings, the program first')
      return undefined
    }
    const parse = entry.parse
    if (typeof parse !== 'string' || !hasOneGroup(parse)) {
      at(`${field}.parse`, 'must be a regular expression with one capture group around the number')
      return undefined
    }
    const timeoutMs = timeoutField(entry, field, at, COMMAND_TIMEOUT_MS)
    return timeoutMs === undefined ? undefined : { kind: 'command', argv: argv as string[], parse, timeoutMs }
  }
  const judge = entry.judge
  if (!isRecord(judge)) {
    at(`${field}.judge`, 'must be an object with model, rubric and files')
    return undefined
  }
  const model = stringField(judge, 'model', at, `${field}.judge.model`)
  const rubric = stringField(judge, 'rubric', at, `${field}.judge.rubric`)
  const files = judge.files
  const isFileList =
    Array.isArray(files) &&
    files.length > 0 &&
    files.every((file: unknown) => typeof file === 'string' && file !== '' && !isAbsolutePath(file) && !slashes(file).split('/').includes('..'))
  if (!isFileList) at(`${field}.judge.files`, 'must list the files the judge reads, relative to the workdir and inside it')
  const timeoutMs = timeoutField(judge, `${field}.judge`, at, JUDGE_TIMEOUT_MS)
  if (model === undefined || rubric === undefined || !isFileList || timeoutMs === undefined) return undefined
  return { kind: 'judge', model, rubric, files: files as string[], timeoutMs }
}

function hasOneGroup(source: string): boolean {
  try {
    const groups = (new RegExp(`${source}|`).exec('')?.length ?? 1) - 1
    return groups >= 1
  } catch {
    return false
  }
}

function timeoutField(entry: Record<string, unknown>, field: string, at: Report, fallback: number): number | undefined {
  if (entry.timeoutMs === undefined) return fallback
  return numberField(entry, 'timeoutMs', at, { min: 1000, max: MAX_TIMEOUT_MS, isInteger: true }, `${field}.timeoutMs`)
}

function stringField(entry: Record<string, unknown>, key: string, at: Report, field = key): string | undefined {
  const value = entry[key]
  if (typeof value !== 'string' || value.trim() === '') {
    at(field, 'must be a non-empty string')
    return undefined
  }
  return value.trim()
}

function numberField(
  entry: Record<string, unknown>,
  key: string,
  at: Report,
  bounds: { min: number; max: number; isInteger?: boolean },
  field = key,
): number | undefined {
  const value = entry[key]
  const isValid =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= bounds.min &&
    value <= bounds.max &&
    (bounds.isInteger !== true || Number.isInteger(value))
  if (!isValid) {
    at(field, `must be ${bounds.isInteger === true ? 'a whole number' : 'a number'} from ${bounds.min} to ${bounds.max}`)
    return undefined
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
