# Council rounds

Read this before any round scored by judges. A council is a set of read-only
judges from different providers. Its scores are judgments and leads. They are
not proof of runtime behavior.

## The roster on this machine

Order judges by cost and availability. The first judge runs every round. Each
later judge joins when every earlier judge meets the acceptance predicate in
`frame.md`. "At target" below means exactly that predicate.

| Order | Judge | Provider | Role |
|---|---|---|---|
| 1 | GPT-6.1 Sol through Codex | OpenAI | Runs every round. The independent judge when the worker is Claude. |
| 2 | Claude Opus 5.5 through Claude Code | Anthropic | Joins when judge 1 is at target. The independent judge when the worker is Codex. |
| 3 | A third provider, when one is reachable | Meta, Moonshot, Zhipu, Alibaba, or DeepSeek | Joins last as a check. Probationary until calibrated (below). |
| Jester | Gemini CLI, when installed | Google | Optional. Same brief. Score ignored. |

Jeff's own names in a request override this table. Theo's private council named
Opus 5.5, Muse Wonderful, and Codex GPT-6.1. `references/runtimes.md` lists
the exact route to each judge from each parent runtime and which routes were
verified on what date.

Rules about the roster:

- A judge from the worker's own provider can run, and its findings count as
  leads. A round never passes on that judge alone. When Opus works, Sol must be
  at target. When Sol works, Opus must be at target.
- Two independent providers is the minimum. Theo said Opus and Sol alone are
  enough to run this on a real codebase.
- A judge that cannot be reached is `not run`. Report it. Never substitute a
  different model under the same name.
- A third-provider judge earns a vote after it passes the calibration pass. Until
  then its scores go in the table marked `probation`.
- A slow judge never runs every round. Bring it in once the faster judges are at
  target.

## Calibration pass, once per rubric

Before round 1 of a new rubric, give every judge the same blinded set: the
baseline, one deliberately weaker variant, and any references the climb uses.
A climb with no references calibrates on the baseline and the weaker variant
alone. Run each judge twice.

- A judge that does not rank the weaker variant lowest on both runs cannot
  score this rubric. Fix the rubric or drop the judge.
- The spread between a judge's two runs is its noise floor. A later round gain
  smaller than that floor is no difference. When a keep or revert decision sits
  inside the floor, run that judge twice more on the same brief and use the
  median of three.
- Optional and strongest: Jeff labels 10 artifacts pass or fail. A judge that
  disagrees with him on more than one of the 10 needs a sharper rubric before
  its scores steer anything.

Done when each judge has a recorded noise floor in `baseline.md`.

Model judges have measured biases. The brief and the procedure below counter
each one:

| Bias | Counter |
|---|---|
| Self-preference: a judge favors output it recognizes as its own family's | Same-family judges never decide a round alone |
| Position: the first or second item wins more often regardless of quality | Rotate label order. For a pairwise call, judge both orders, and a flip is a tie |
| Verbosity: longer answers win | For prose, compare length-matched variants or state the length budget in the rubric |
| Anchoring and target leakage | Hide the target, earlier scores, and other judges' answers |
| Drift on unchanged inputs | Score fixed references every round. A reference that moves more than the work voids the comparison |

## The judge brief

Every active judge gets the same brief in the same round. Build it from this
template and save the exact text as `round-<n>-brief.md`.

```
Review only. Do not edit, create, or delete files. Do not run commands that
change state, start subagents, or post anything.

Task the work serves: <the judge brief from frame.md, plus mid-run constraints>

Artifacts, by neutral label:
<A: path>   <B: path>   <C: path>
<For code: repo path, base SHA, head SHA, the diff command.>

Score every artifact on every category, 1 to 10, in one pass on one scale.
Categories, each with what a 9 means here:
<category: anchor sentence>

For each category give one line of reasoning tied to something you can point
at (a location in a file, a region of a screenshot). Then name the one change
that would raise the work's lowest category the most.

Separate confirmed defects, hypotheses, and taste. Say what you could not
inspect. Behavior cannot be inferred from appearance. If you cannot judge a
category from what you were given, score it "unknown". Read only the listed
paths.

Reply in exactly this shape:
SCORES
<label> | <category> | <score> | <reason>
TOP CHANGE: <one change>
DEFECTS: <file:line or region> <claim> <how to verify>
COULD NOT INSPECT: <list or none>
```

What stays out of the brief, every round:

- The target, and any hint that one exists. Sol gave exactly 9.5 in every
  category once "9.5" was in Theo's brief.
- Which label is the work, which is a reference, and which round this is.
- Other judges' scores, earlier rounds' scores, and the chat history.
- Model names in file paths or labels.

Rotate label order across rounds and across judges, and record the mapping in
`round-<n>-labels.md`, which judges never see.

## After the judges reply

1. Read each judge's full reply. When a score jumps or stalls, read what that
   judge was shown before trusting or dismissing the number.
2. Unblind with the label map. Fill the round table.
3. Check each defect claim yourself. A code defect needs a command that fails on
   the current head. Drop claims you cannot reproduce, and list them as dropped.
4. Report disagreements as disagreements. Never average judges who disagree.
5. Pick the next change from the verified findings, lowest category first.

## Gating

Theo gated judges to save scarce usage: Sol alone until Sol reached target, then
Opus, then Muse. Use the same order of cost. Two cautions from his run:

- The first judge's taste shapes the work before anyone else sees it. When the
  next judge joins and scores much lower (Opus came in at 7.1 after Sol gave 9),
  treat that as a real signal, not an outlier.
- Gating hides the late judges' trajectory. Record `not run` for every gated
  cell so the table shows it.
- The last round runs every required judge on the final head. In Theo's second
  PR, Muse stopped at 7.9 on a usage limit and never scored the final build.
  That is `not run`, not a pass.

## The round table

Keep it in `round-table.md` and copy it into the PR description.

```
## Council review

Rounds: <n>. Judges: <list with route and model id>. Target held by the worker.

| Round | Judge | Hierarchy | Typography | ... | Overall | Ref: Claude Code | Ref: Codex |
|---|---|---|---|---|---|---|---|
| 1 | Sol | 7 | 8 | ... | 7.4 | 8.3 | 8.6 |
| 1 | Opus | not run | not run | ... | not run | not run | not run |
```

A judge that gives no score gets `no score`. Never invent a number. Report
scores at the precision the judge gave, and never imply more precision than a
1 to 10 judgment supports.

## The jester

Theo ran Gemini as a jester: same brief, not told it is the jester, score
ignored, kept out of the PR. Its value is calibration. It shows what a confident
bad judge looks like, so you recognize the same pattern in a good judge on a bad
day. In Theo's run it scored a commit nobody asked about, invented line numbers
past the end of a file, and gave the highest score of any judge.

Run it only when it is free and installed. Its findings get the same
verification as any other judge's, and the ones that fail go under "Jester
flubs" in the final reply only.

## Code review rounds

For a code change, the council reviews a fixed head SHA and diff. Use the
severity scale `blocker` (the intended case is wrong), `should` (a real bug
callers will hit), and `nit` (everything else). A round passes when no judge has
an open blocker or should that you reproduced, plus the score target if one was
set. Approval of an older head does not cover a newer one.
