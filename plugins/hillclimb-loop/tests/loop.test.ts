import { expect, test } from 'claude-code/testing'

import { LEDGER, makeWorld, SAMPLE_RUBRIC, sha } from './world'

const MARKER = /^\[climb [0-9a-f]{8} round (\d+)\]/

test('a climb keeps a gain, reverts an inconclusive round and a guard regression, then stops on no gain', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)

  expect(await w.climb($, 'start lint-climb/rubric.json')).toContain('Measuring the baseline of lint-climb')
  expect(w.judged).toEqual(['haiku'])
  expect(w.prompts.length).toBe(1)
  expect(w.prompts[0]?.match(MARKER)?.[1]).toBe('1')
  expect(w.prompts[0]).toContain('The weakest criterion is slop, at 0.0 of 10 (raw 22, lower is better)')
  expect(w.prompts[0]).toContain('End your reply with one line that starts with HYPOTHESIS:')
  expect(w.statuses.at(-1)).toBe('climb r1 3.1 (best 3.1)')
  const baselineLedger = w.files.get(LEDGER)?.split('\n') ?? []
  expect(baselineLedger[0]).toBe('round\ttime\thypothesis\tslop\twords\tclarity\tweighted\toutcome\tcommit\tnote')
  expect(baselineLedger[1]?.split('\t').slice(3, 8)).toEqual(['22', '111', '6', '3.06', 'baseline'])

  await w.round(
    $,
    () => {
      w.repo.dirty = true
      w.metrics.slop = 10
    },
    'I cut the hype words.\nHYPOTHESIS: Removing marketing words lowers slop without hurting clarity.',
  )
  expect(w.repo.commits.length).toBe(1)
  expect(w.repo.commits[0]?.message).toContain('climb lint-climb round 1: 5.56 (was 3.06)')
  expect(w.repo.commits[0]?.message).toContain('Scores: slop 10, words 111, clarity 6')
  expect(w.repo.commits[0]?.message).toContain('Hypothesis: Removing marketing words lowers slop without hurting clarity.')
  expect(w.statuses.at(-1)).toBe('climb r2 5.6 (best 5.6)')
  expect(w.prompts.length).toBe(2)
  expect(w.prompts[1]?.match(MARKER)?.[1]).toBe('2')
  expect(w.prompts[1]).toContain('- Round 1 kept at 5.56. Tried Removing marketing words lowers slop without hurting clarity.')

  await w.round(
    $,
    () => {
      w.repo.dirty = true
      w.metrics.isBroken = true
    },
    'HYPOTHESIS: Shorter sentences read better.',
  )
  expect(w.repo.commits.length).toBe(1)
  expect(w.gitLines()).toContain(`reset --hard ${sha(1)}`)
  expect(w.judged.length).toBe(2)
  const inconclusive = w.files.get(LEDGER)?.trim().split('\n').at(-1)?.split('\t') ?? []
  expect(inconclusive.slice(3, 8)).toEqual(['fail', '', '', '', 'inconclusive'])
  expect(inconclusive[9]).toContain('slop failed: the output did not match')

  await w.round(
    $,
    () => {
      w.metrics.isBroken = false
      w.repo.dirty = true
      w.metrics.slop = 2
      w.metrics.clarity = 4
    },
    'HYPOTHESIS: Deleting the second paragraph removes most slop.',
  )
  expect(w.repo.commits.length).toBe(1)
  const guarded = w.files.get(LEDGER)?.trim().split('\n').at(-1)?.split('\t') ?? []
  expect(guarded[7]).toBe('reverted')
  expect(guarded[9]).toBe('Guard clarity got worse: 6 to 4.')

  await w.round($, () => undefined, 'HYPOTHESIS: Nothing needed changing.')
  const ledger = w.files.get(LEDGER)?.trim().split('\n') ?? []
  expect(ledger.length).toBe(6)
  expect(ledger.at(-1)?.split('\t')[9]).toBe('No change in the workdir.')
  expect(w.prompts.length).toBe(4)
  expect(w.statuses.at(-1)).toBe(undefined)
  expect(w.toasts.at(-1)).toBe(`Climb lint-climb stopped. No gain in 3 rounds in a row. Best 5.56 at ${sha(1).slice(0, 7)}.`)

  expect(w.gitLines().some(line => line.startsWith('clean') || line.startsWith('push'))).toBe(false)
  expect(w.gitLines().filter(line => line.startsWith('reset')).every(line => line === `reset --hard ${sha(1)}`)).toBe(true)
  expect(await w.climb($, 'status')).toContain('lint-climb is stopped. No gain in 3 rounds in a row.')
})

test('pause waits for the round, resume queues the next, an interrupted turn reverts and pauses, stop ends it', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  await w.climb($, 'start lint-climb/rubric.json')

  expect(await w.climb($, 'pause')).toBe('The climb pauses after round 1.')
  await w.round(
    $,
    () => {
      w.repo.dirty = true
      w.metrics.slop = 10
    },
    'HYPOTHESIS: Fewer hype words.',
  )
  expect(w.repo.commits.length).toBe(1)
  expect(w.prompts.length).toBe(1)
  expect(w.statuses.at(-1)).toBe('climb r1 5.6 (best 5.6) paused')
  expect(w.toasts.at(-1)).toBe('Climb lint-climb paused. Paused by /climb pause.')

  expect(await w.climb($, 'resume')).toBe('Round 2 is queued.')
  expect(w.prompts.length).toBe(2)
  expect(w.prompts[1]?.match(MARKER)?.[1]).toBe('2')

  await w.round(
    $,
    () => {
      w.repo.dirty = true
      w.metrics.slop = 1
    },
    'Half done.',
    'aborted',
  )
  expect(w.repo.commits.length).toBe(1)
  expect(w.repo.dirty).toBe(false)
  expect(w.prompts.length).toBe(2)
  expect(w.toasts.at(-1)).toBe("Climb lint-climb paused. The round's turn was interrupted. /climb resume goes on.")
  const interrupted = w.files.get(LEDGER)?.trim().split('\n').at(-1)?.split('\t') ?? []
  expect(interrupted[2]).toBe('(the turn gave no HYPOTHESIS line)')
  expect(interrupted[7]).toBe('inconclusive')

  expect(await w.climb($, 'stop')).toBe('The climb has stopped.')
  expect(w.statuses.at(-1)).toBe(undefined)
  expect(await w.climb($, 'resume')).toContain('The climb has stopped.')
})

test('start refuses a dirty workdir, a nested workdir, a judge on the session model, a zero no-gain limit, and a second climb', async ($, on) => {
  const dirty = makeWorld(on)
  await dirty.boot($)
  dirty.repo.dirty = true
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('has uncommitted or untracked files')
  expect(dirty.prompts.length).toBe(0)

  dirty.repo.dirty = false
  dirty.repo.toplevel = 'C:/climbs'
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('must be the top of its git worktree')

  dirty.repo.toplevel = 'C:/climbs/lint-climb/work'
  dirty.files.set('C:/climbs/lint-climb/rubric.json', SAMPLE_RUBRIC.replace('"stopAfterNoGain": 3', '"stopAfterNoGain": 0'))
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('stopAfterNoGain: cannot be 0')

  dirty.files.set('C:/climbs/lint-climb/rubric.json', SAMPLE_RUBRIC.replace('"model": "haiku"', '"model": "opus"'))
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('the same model as this session')

  dirty.files.set('C:/climbs/lint-climb/rubric.json', SAMPLE_RUBRIC)
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('Measuring the baseline')
  expect(await dirty.climb($, 'start lint-climb/rubric.json')).toContain('/climb stop ends it before another starts')
  expect(await dirty.climb($, 'start')).toContain('/climb stop ends it')
  expect(await dirty.climb($, 'dance')).toContain('Use /climb start <path to rubric.json>')
})

test('a reload while a round is measured evaluates it once', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  await w.climb($, 'start lint-climb/rubric.json')
  await $.turn.start({ text: w.prompts.at(-1) ?? '', turnId: 'turn-x' })
  w.repo.dirty = true
  w.metrics.slop = 10
  await $.turn.complete({ answer: 'HYPOTHESIS: Fewer hype words.', durationMs: 1, isAborted: false, turnId: 'turn-x', reason: 'answer' })
  await w.boot($)
  await w.clock.advance(10)
  expect(w.repo.commits.length).toBe(1)
  expect(w.files.get(LEDGER)?.trim().split('\n').length).toBe(3)
  expect(w.prompts.length).toBe(2)
})

test('turns that are not the round, and subagent turns, leave the loop alone', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  await w.climb($, 'start lint-climb/rubric.json')
  await $.turn.start({ text: 'what time is it', turnId: 'other' })
  await $.turn.complete({ answer: 'HYPOTHESIS: nope', durationMs: 1, isAborted: false, turnId: 'other', reason: 'answer' })
  await $.turn.start({ text: w.prompts.at(-1) ?? '', turnId: 'round' })
  await $.turn.complete({ answer: 'HYPOTHESIS: sub', durationMs: 1, isAborted: false, turnId: 'round', agentId: 'agent-1', reason: 'answer' })
  await w.clock.advance(10)
  expect(w.argvs.length).toBe(5)
  expect(w.statuses.at(-1)).toBe('climb r1 3.1 (best 3.1)')
})

test('the pane shows sparklines, the weakest criterion, history, and working buttons on every input surface', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  await w.climb($, 'start lint-climb/rubric.json')
  await w.round(
    $,
    () => {
      w.repo.dirty = true
      w.metrics.slop = 10
    },
    'HYPOTHESIS: Fewer hype words.',
  )
  const props = {
    title: 'Climb',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'hillclimb-loop', surface, component: 'Pane', requestId: 'climb', props })
    expect(await ui.find({ type: 'Text', text: 'lint-climb is waiting to start round 2.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^slop\s+▁▅\s+5\.0\s+raw 10\s+weakest$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^clarity\s+▅▅\s+6\.0\s+raw 6\s+guard$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^r1 kept\s+5\.56  Fewer hype words\. Score rose from 3\.06 to 5\.56\.$/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'resume' })).toBeUndefined()

    await ui.press({ key: 'pause' })
    expect(w.toasts.at(-1)).toBe('The climb pauses after round 2.')
    expect(await ui.find({ type: 'Button', key: 'pause' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /It will pause after this round\./ })).toBeDefined()

    await ui.press({ key: 'resume' })
    expect(w.toasts.at(-1)).toBe('The climb goes on after round 2.')
    expect(await ui.find({ type: 'Button', key: 'pause' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'hillclimb-loop', surface: 'terminal', component: 'Pane', requestId: 'climb', props })
  await ui.press({ key: 'stop' })
  expect(w.toasts.at(-1)).toBe('The climb stops after round 2 is measured.')
  expect(await ui.find({ type: 'Button', key: 'stop' })).toBeUndefined()
  await ui.unmount()
})

test('a failing baseline starts nothing and says why', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  w.metrics.isBroken = true
  await w.climb($, 'start lint-climb/rubric.json')
  expect(w.prompts.length).toBe(0)
  expect(w.judged.length).toBe(0)
  expect(w.toasts.at(-1)).toContain('The baseline of lint-climb failed, so the climb did not start. slop failed')
  expect(await w.climb($, 'status')).toContain('No climb is running.')
  expect(w.files.has(LEDGER)).toBe(false)
})

test('a dropped round prompt pauses the climb, and resume sends it again', async ($, on) => {
  const w = makeWorld(on)
  await w.boot($)
  w.flags.dropNextPrompt = true
  await w.climb($, 'start lint-climb/rubric.json')
  expect(w.prompts.length).toBe(0)
  expect(w.toasts.at(-1)).toBe('Climb lint-climb paused. The round 1 prompt was dropped. Another hook held the prompt.')
  expect(await w.climb($, 'resume')).toBe('Round 1 is queued.')
  expect(w.prompts[0]?.match(MARKER)?.[1]).toBe('1')
})
