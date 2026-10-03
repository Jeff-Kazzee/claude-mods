import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TasteOutcome, TasteReview, TasteTrigger } from '../types'
import {
  CRITIC_EFFORT,
  CRITIC_MAX_TOKENS,
  CRITIC_TIMEOUT_MS,
  baseName,
  compareVersions,
  compileGlobs,
  contextNote,
  criticPrompt,
  criticSystem,
  hasHadPass,
  isAbsolute,
  matchesAny,
  normalizePath,
  parseFindings,
  sha256Hex,
  statusText,
  stripFrontmatter,
  targetOf,
  toSlashes,
  usesVoice,
  withOutcome,
} from './taste'
import type { CriticRules } from './taste'

const reviews = atom({ plugin: 'taste-fork', key: 'reviews' } as const, [] as TasteReview[])

type Verdict = { findings: readonly string[]; outcome: TasteOutcome }

const readText = ($: EngineInterface, path: string): Promise<string> =>
  $.fs.read(path).then(stripFrontmatter, () => '')

async function findUnslop($: EngineInterface, home: string): Promise<string> {
  const cache = `${home}/.claude/plugins/cache`
  const markets = await $.fs.list(cache).catch(() => [])
  const versions: string[] = []
  for (const market of markets) {
    if (market.kind !== 'dir') continue
    const pstack = `${cache}/${market.name}/pstack`
    for (const version of await $.fs.list(pstack).catch(() => [])) {
      if (version.kind === 'dir') versions.push(`${pstack}/${version.name}`)
    }
  }
  versions.sort((a, b) => compareVersions(baseName(b), baseName(a)))
  for (const dir of versions) {
    const text = await readText($, `${dir}/skills/unslop/SKILL.md`)
    if (text !== '') return text
  }
  return ''
}

async function loadRules($: EngineInterface, isVoice: boolean): Promise<CriticRules> {
  const taste = await readText($, `${toSlashes($.plugin.root)}/taste.md`)
  const home = toSlashes((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '')
  if (home === '') return { voice: '', unslop: '', taste }
  const voice = isVoice ? await readText($, `${home}/.agents/skills/jeff-voice/SKILL.md`) : ''
  return { voice, unslop: await findUnslop($, home), taste }
}

async function judge(
  $: EngineInterface,
  path: string,
  text: string,
  model: string,
  signal: AbortSignal,
): Promise<Verdict> {
  const reply = await $.model.complete(
    {
      model,
      system: criticSystem(await loadRules($, usesVoice(path))),
      prompt: criticPrompt(path, text),
      maxTokens: CRITIC_MAX_TOKENS,
      effort: CRITIC_EFFORT,
      timeoutMs: CRITIC_TIMEOUT_MS,
    },
    { signal },
  )
  if (!reply.isAnswered) {
    const reason = reply.reason === 'aborted' ? 'timed out or interrupted' : reply.reason
    return { findings: [], outcome: { outcome: 'failed', reason } }
  }
  const findings = parseFindings(reply.text)
  if (findings === undefined) {
    return { findings: [], outcome: { outcome: 'failed', reason: 'the critic answered with neither a list nor CLEAN' } }
  }
  return {
    findings,
    outcome: findings.length === 0 ? { outcome: 'clean' } : { outcome: 'findings', findings: findings.length },
  }
}

async function review(
  $: EngineInterface,
  path: string,
  via: TasteTrigger,
  model: string,
  signal: AbortSignal,
): Promise<string[]> {
  const text = await $.fs.read(path).catch(() => undefined)
  if (text === undefined) {
    $.ui.log(`taste-fork: could not read ${baseName(path)}, so it got no review.`)
    return []
  }
  if (text.trim() === '') return []
  const hash = await sha256Hex(text)
  const claim: TasteReview = { id: crypto.randomUUID(), path, hash, via, at: Date.now(), outcome: 'pending' }
  const claimed = await update($, reviews, list => (hasHadPass(list, path, hash, via) ? list : [...list, claim]))
  if (!claimed.some(r => r.id === claim.id)) return []
  $.ui.status(statusText(claimed))

  let verdict: Verdict = {
    findings: [],
    outcome: { outcome: 'failed', reason: 'the critic did not run' },
  }
  try {
    verdict = await judge($, path, text, model, signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    verdict = { findings: [], outcome: { outcome: 'failed', reason: `the critic call failed (${message.slice(0, 120)})` } }
  } finally {
    const outcome = verdict.outcome
    const settled = await update($, reviews, list =>
      list.map(r => (r.id === claim.id ? withOutcome(r, outcome) : r)),
    )
    $.ui.status(statusText(settled))
  }
  if (verdict.outcome.outcome === 'failed') {
    $.ui.log(`taste-fork: no review of ${baseName(path)}, ${verdict.outcome.reason}.`)
  }
  return [...verdict.findings]
}

export const register: Register = (on, options) => {
  const globs = compileGlobs(String(options.globs ?? ''))
  const model = String(options.criticModel ?? 'opus')

  on('session.start', async ($, e, next) => {
    const list = await update($, reviews, all =>
      all.map(r => (r.outcome === 'pending' ? withOutcome(r, { outcome: 'failed', reason: 'interrupted' }) : r)),
    )
    $.ui.status(statusText(list))
    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit', 'Artifact'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const target = targetOf(e)
    if (target === undefined) return ran

    const { named, via } = target
    const path = normalizePath(isAbsolute(named) ? named : `${await $.session.cwd()}/${named}`)
    if (via === 'write' && !matchesAny(path, globs)) return ran

    const findings = await review($, path, via, model, next.signal)
    if (findings.length === 0) return ran
    return { ...ran, context: [...(ran.context ?? []), contextNote(path, findings)] }
  })
}
