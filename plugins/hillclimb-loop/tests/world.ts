import type { On, ProcessRunResult } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

export const CWD = 'C:/climbs'
export const ENDEAVOUR = 'C:/climbs/lint-climb'
export const RUBRIC_PATH = `${ENDEAVOUR}/rubric.json`
export const WORKDIR = `${ENDEAVOUR}/work`
export const LEDGER = `${ENDEAVOUR}/climb-ledger.tsv`

export const SAMPLE_RUBRIC = `{
  "name": "lint-climb",
  "workdir": "./work",
  "criteria": [
    {
      "id": "slop",
      "weight": 3,
      "direction": "down",
      "scale": { "min": 0, "max": 20 },
      "measure": {
        "command": ["node", "{endeavour}/measure.mjs", "draft.md"],
        "parse": "slop=([0-9]+)",
        "timeoutMs": 20000
      }
    },
    {
      "id": "words",
      "weight": 1,
      "direction": "down",
      "scale": { "min": 60, "max": 200 },
      "measure": {
        "command": ["node", "{endeavour}/measure.mjs", "draft.md"],
        "parse": "words=([0-9]+)",
        "timeoutMs": 20000
      }
    },
    {
      "id": "clarity",
      "weight": 2,
      "direction": "up",
      "measure": {
        "judge": {
          "model": "haiku",
          "rubric": "Score how plainly and specifically the draft says what the tool does and who it is for. 10 means every sentence is concrete and checkable. 0 means vague claims and filler.",
          "files": ["draft.md"]
        }
      }
    }
  ],
  "guards": ["clarity"],
  "target": 8.5,
  "budget": { "maxRounds": 8, "maxMinutes": 30 },
  "stopAfterNoGain": 3
}
`

const PRESENTATION = { isFullscreen: true, columns: 160 }
const USAGE = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

export function sha(n: number): string {
  return (n + 10).toString(16).repeat(40).slice(0, 40)
}

export function makeWorld(on: On, options: { rubric?: string; sessionModel?: string; toplevel?: string } = {}) {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) })
  const slash = (path: string) => path.replace(/\\/g, '/')
  const files = new Map<string, string>([
    [RUBRIC_PATH, options.rubric ?? SAMPLE_RUBRIC],
    [`${WORKDIR}/draft.md`, 'Ledgerline is a truly powerful tool.'],
  ])
  const repo = {
    toplevel: options.toplevel ?? WORKDIR,
    head: sha(0),
    dirty: false,
    untracked: [] as string[],
    commits: [] as { sha: string; message: string }[],
  }
  const metrics = { slop: 22, words: 111, clarity: 6, isBroken: false }
  const flags = { dropNextPrompt: false }
  const argvs: string[][] = []
  const prompts: string[] = []
  const toasts: string[] = []
  const logs: string[] = []
  const statuses: (string | undefined)[] = []
  const judged: string[] = []

  const out = (stdout: string, exitCode = 0): ProcessRunResult => ({
    exitCode,
    stdout,
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  })
  const run = (argv: readonly string[]): ProcessRunResult => {
    const [program, ...args] = argv
    if (program === 'node') return out(metrics.isBroken ? 'measure.mjs crashed' : `slop=${metrics.slop}\nwords=${metrics.words}\n`)
    const line = args.join(' ')
    if (line === 'rev-parse --show-toplevel') return out(`${repo.toplevel}\n`)
    if (line === 'rev-parse HEAD') return out(`${repo.head}\n`)
    if (line === 'status --porcelain') {
      return out([...(repo.dirty ? [' M draft.md'] : []), ...repo.untracked.map(file => `?? ${file}`)].join('\n'))
    }
    if (line === 'status --porcelain --untracked-files=no') return out(repo.dirty ? ' M draft.md' : '')
    if (line === 'add -A') return out('')
    if (args[0] === 'commit' && args[1] === '-m') {
      const next = sha(repo.commits.length + 1)
      repo.commits.push({ sha: next, message: args[2] ?? '' })
      repo.head = next
      repo.dirty = false
      repo.untracked = []
      return out('')
    }
    if (args[0] === 'reset' && args[1] === '--hard' && args[2] !== undefined) {
      repo.head = args[2]
      repo.dirty = false
      return out('')
    }
    return { ...out('', 128), stderr: `fatal: the fake repo does not know git ${line}` }
  }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.model', () => ({ value: options.sessionModel ?? 'claude-opus-5-5' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', ($, e) => {
    const text = files.get(slash(e.path))
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.exists', ($, e) => ({ value: files.has(slash(e.path)) }))
  on('fs.write', ($, e) => {
    files.set(slash(e.path), e.text)
    return { value: undefined }
  })
  on('fs.stat', ($, e) => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: slash(e.path) } }))
  on('prompt.submit', ($, e) => {
    if (flags.dropNextPrompt) {
      flags.dropNextPrompt = false
      return { drop: 'Another hook held the prompt.' }
    }
    prompts.push(e.text)
    return { text: e.text }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.complete', ($, e) => {
    judged.push(e.model)
    return { value: { isAnswered: true, text: `Plain enough.\nSCORE: ${metrics.clarity}`, usage: USAGE } }
  })
  on('process.run', ($, e) => {
    argvs.push([...e.argv])
    return { value: run(e.argv) }
  })

  let turns = 0

  return {
    clock,
    files,
    repo,
    metrics,
    flags,
    argvs,
    prompts,
    toasts,
    logs,
    statuses,
    judged,
    async boot($: Engine) {
      await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
    },
    async climb($: Engine, args: string) {
      const result = await $.command.run({ command: 'climb', args, origin: { kind: 'composer' }, presentation: PRESENTATION })
      await clock.advance(10)
      return result.text ?? ''
    },
    async round($: Engine, work: () => void, answer: string, reason: 'answer' | 'aborted' | 'error' = 'answer') {
      const prompt = prompts.at(-1) ?? ''
      turns += 1
      const turnId = `turn-${turns}`
      await $.turn.start({ text: prompt, turnId })
      work()
      await $.turn.complete({ answer, durationMs: 1000, isAborted: reason === 'aborted', turnId, reason })
      await clock.advance(10)
    },
    gitLines() {
      return argvs.filter(argv => argv[0] === 'git').map(argv => argv.slice(1).join(' '))
    },
  }
}
