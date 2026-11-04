---
name: hill-climb
description: Hill climb a piece of work in scored rounds until a frozen check or a council of judges from other providers reaches a target the judges never see. Use for "hill climb", "council climb", or "put this through the council" with a target, any score-gated polish of a UI, prose, or tool descriptions, a bug or performance target, and turning repeated agent failures into an eval. A plain "council" review with no target stays with the tstack council skill.
---

# Hill climb

You are the worker. A scorer you do not control decides whether each round
helped. You keep a change only when the scorer says it helped and every guard
still holds. You never grade your own work, and you never move the target.

Method sources and the evidence behind each rule:
`C:/Users/jeffk/the-little-ai-company-OS/Brain/concepts/hill-climbing-with-judges.md`.

## Words

- **Scorer**: what produces the number. Use the strongest rung that can measure
  the property, in this order: proof (types, a model checker, a stated
  invariant), program (test, eval, benchmark, image diff, token count), live
  drive (the project verify skill on the real path), council (judges from
  different providers). Jeff wants formal checks wherever they fit. The council
  scores only what nothing above it can measure, such as taste.
- **Guard**: a condition that must stay true every round. Behavior checks,
  invariants, the verify skill, a correctness eval during a size climb.
- **Round**: one coherent change plus one full scoring pass. A pass after fixes
  is a new round.
- **Target**: the score that ends the climb. Only you hold it.
- **Reference**: a fixed artifact the judges score every round as an anchor.
- **Checkpoint**: the last commit whose round was kept.

## 1. Frame

Create the run folder outside the repo, so a judge with read access to the repo
never finds the target:
`C:/Users/jeffk/Development/company-os-evidence/hill-climb/<repo>/YYYY-MM-DD-<slug>/`.
Write `frame.md` there with these fields:

- **Brief**: the complaint, review, or bug report, pasted as given. Mark which
  parts are binding and which are loose notes.
- **Work**: the branch, screen, files, or tool descriptions in scope.
- **Judge brief**: the brief rewritten for judges. Strip every target, stop
  condition, earlier score, and model name from it. Keep the original brief
  for yourself only.
- **Scorer**: the rung and the exact command or judge list. For a program,
  also its direction (up or down), repeats (default 5, alternating baseline and
  candidate), aggregation (default median), and noise threshold (the run to run
  range at baseline).
- **Categories**: what gets scored. UI defaults are in `references/ui.md`.
- **Acceptance predicate**: the exact test that ends the climb, in Jeff's
  terms. "Overall 8 or more from every required judge" and "every category 9 or
  more from every required judge" are different predicates. Gating and stopping
  both use this one predicate.
- **Guards**: the checks that must stay green.
- **References**: paths, if any.
- **Budget**: default 4 rounds or 60 active minutes, whichever comes first, and
  no new paid service.
- **Attempt floor**: default 2 rounds, so one lucky round cannot end the climb.
- **Isolation**: the branch and worktree, plus its own port, data directory,
  and browser profile when the app runs.

Read the repo's `AGENTS.md`, its verify skill, and its feature map to fill what
the repo can answer. Ask Jeff only for a missing brief, a missing acceptance
predicate (never guess one), or a product decision. Done when every field holds a value.

## 2. Baseline and sensitivity

1. Reproduce the complaint on the real path at the exact revision. Record the
   revision, environment, command or action, and output in `baseline.md`.
2. Prove the scorer can see the failure:
   - Test: it goes red on the old revision for the stated reason, not a syntax
     or missing dependency error.
   - Benchmark: contrasting workloads separate, and it prints a work count and
     an error count.
   - Eval: it fails the known-bad version (`references/evals.md`).
   - Council: it ranks a known-weaker variant below the baseline, and below
     any reference (`references/council.md`).
3. Freeze the scorer. Record the SHA-256 of the evaluator, inputs, rubric, and
   capture script in `baseline.md`, with the model identifiers. A later change
   to any of them is a new scorer version, made in its own commit with the
   reason, and the baseline and references get rescored on it. Adding rubric
   categories counts: when Theo added four categories at round 10 of a climb,
   every judge dropped from 10 to 9 or 9.5.

Done when `baseline.md` holds the reproduction and the sensitivity proof. A
scorer that cannot tell bad from good gets fixed before round 1.

## 3. Rounds

Keep `ledger.tsv` in the run folder with the columns `round, hypothesis,
change, scorer_version, before, after, guards, verdict, note`. Read it before
each round. Log reverted rounds with the same care as kept ones.

Each round:

1. Name a hypothesis with a mechanism, aimed at the lowest category. "The
   branch label has the same weight as the title, so lowering it makes the title
   scannable."
2. Make one coherent change. Several files are fine when they serve one
   hypothesis.
3. Run the guards. A round that fails a guard never reaches the judges.
4. Capture fresh evidence yourself with the tool named in `frame.md`.
5. Score it. Programs: the protocol in `frame.md`. Council:
   `references/council.md`.
6. Keep or revert. Keep when the score moves past the noise threshold and every
   guard is green, then commit. Otherwise revert the change in full.
7. Write the ledger row.

When the score drops, write one line ("Score dropped from X to Y") and work the
next-lowest category under the same goal.

When Jeff adds a constraint mid-run, add it to `frame.md` and the next round's
brief, and continue.

When the ground moves (a merge lands, a dependency changes), re-read the
affected code before the next round.

When two rounds in a row keep nothing, you are on a local optimum. Score two or
three distinct directions in one blinded pass and continue from the winner.

## 4. Stop

Stop when one of these holds, and write which one in `ledger.tsv`:

- The acceptance predicate holds on the final head for every required judge or
  the program, and the attempt floor is reached. A gated judge that never
  scored the final head has not passed it.
- The budget is spent.
- The scorer is unstable: a reference moves more than the work, or repeats
  disagree by more than the gap you are chasing.
- Progress needs a product decision from Jeff.

A stretch target goes on a fork: a new worktree from the checkpoint. The
checkpoint branch stays mergeable and keeps its PR current. Theo's 9 to 9.5
took 10 rounds after 6 to 9 took 3, so decide before climbing whether the last
half point is worth it.

## 5. Two-stage climbs

When the work must be both correct and smaller, faster, or cheaper, run two
climbs with a commit between them. Climb correctness to the target and commit.
Then climb size with correctness as a guard every round. Never both targets in
one round. Detail is in `references/evals.md`.

## 6. Ship and report

Follow the repo's git law: a task branch, a PR into `dev`. The PR description
holds, in order:

1. The brief as given.
2. The guard and verify results on the final head.
3. The round table from `references/council.md`, with reference scores and
   every `not run` or `blocked` cell.
4. One line per kept change, per round.
5. For visual work, the before and after pair plus the annotated copy.

Finish the reply with the completion record:

```
Goal:
Final revision and build:
Environment and workload:
Checks run, with exact commands or actions:
Expected result:
Observed result:
Baseline and final measurements, with units and variation:
Evidence locations:
Review findings and what happened to each:
Decisions and assumptions the worker made:
What the checks did not cover:
Unverified conditions or blockers:
Shipping status and the action Jeff owns:
```

A score never authorizes a merge. Merges wait for the repo's verify gate on the
exact head, run by a session that did not build the change, and for Jeff.

## Guardrails

- Judges work read-only in a fresh context. They never learn the target or that
  one exists, and never see another judge's answer before giving their own.
- A round never passes on a judge from the worker's own provider alone.
- A missing, rate-limited, or erroring judge is `not run`. It is never a pass.
- A screenshot proves a visual claim only. Persistence, permissions,
  cancellation, and side effects need a behavior check.
- A review finding about code counts only when you reproduce it with a command
  that fails on the current head. Unreproduced findings go in the report as
  leads.
- The scorer stays outside your write scope. A round whose diff touches a test,
  the evaluator, the rubric, the fixtures, or the capture script reverts, unless
  it is the separate scorer-version commit from step 2.
- A judge's score changes only in a new round. When you dispute a finding, put
  the evidence (a 1:1 crop, a command and its output) in the next brief and mark
  the cell `rescored on evidence`. In Theo's first climb the worker argued Sol
  from 8.5 to 9 with no code change, which is exactly the move to make visible.
- Keep scope to the brief. A finding outside it becomes a follow-up line.

## References

- `references/council.md`: the judge roster, routes for each runtime, the judge
  brief, gating, blinding, the round table, and the jester. Read it for any
  council round.
- `references/ui.md`: states, capture settings, behavior checks, rubric, and
  reference points. Read it for interface work.
- `references/evals.md`: building an eval from failure history, held-out cases,
  and compression. Read it when the scorer does not exist yet.
- `references/runtimes.md`: how this skill is installed and how to call each
  CLI as a read-only judge from Claude Code, Codex, Cline, and DeepSeek
  Harness.
