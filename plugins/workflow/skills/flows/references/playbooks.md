# Playbooks

One section per flow. Each step names the skill to call and ends on evidence
you can open. Skill names are bare. Claude Code adds the plugin prefix.

Every flow that changes a repo (`ship`, `bug`, `feature`, `ui`, `revive`,
`perf`, `eval`, `verify-setup`) starts with `ship` steps 1 and 2, claim and
read, before the first edit. When such a flow says "continue at `ship` step 4",
commit first with the trailers from the claim, so the proof and every review
bind to a real head.

## ship

A change whose scope is already clear, taken to a PR that waits on Jeff.

1. **Claim.** Find or create the task row, then `agent-git claim <id> --repo
   <owner/name> --agent <role> --runtime <runtime> --session <id>`. Make a
   worktree on the new branch. Done when `git status` in the worktree shows the
   task branch with a clean tree.
2. **Read the repo.** Its `AGENTS.md`, its verify skill, and the feature map
   entry for what you are changing. Done when you can name the verify command
   or journey that covers the change.
3. **Build.** The smallest change that does the job. Commit with the trailers
   from step 1.
4. **Prove.** Run the repo's checks and the verify skill on the head. For UI,
   run the app and capture the change. Done when every changed behavior has
   output or a capture you observed in this session.
5. **Review by tier.** Low: a fresh-context self-check of the diff. Medium:
   `sol-loop`. High: `council`, then `interrogate` on what survives. Fix only
   what you reproduce on the head.
6. **Check reach.** For a medium or high tier change, `blast-radius` on the
   diff. Done when the one fact that makes it safe was shown by running code.
7. **File.** `file-pr`, base `dev`. Then `babysit-pr` until checks are green
   and every bot finding is fixed or declined with a reason.
8. **Hand off.** `full-stop`. A session that did not build the change runs the
   verify skill on the head and records `agent-git receipt`. Stage
   `Waiting on Jeff`. End with "Merge PR <n> at <sha>?"

"Full send" from Jeff runs the same steps and, once he answers yes, lands with
`agent-git land`. "Full stop" ends at step 8.

## bug

Something is broken.

1. **Loop first.** `diagnosing-bugs`. Build one command that goes red on the
   user's exact symptom, runs without a human, and gives the same result each
   time. Done when that command ran and its red output is in the task notes. No
   loop, no theory.
2. **Minimize and hypothesize.** Cut the repro until every part matters. Write
   three to five falsifiable hypotheses and probe one variable at a time.
3. **Regression check at the right seam.** `tdd`. The test exercises the real
   failure through a public interface, with an expected value from the spec or
   a known-good literal. Done when it fails on the unfixed code for the stated
   reason.
4. **Fix.** The smallest fix. The regression check and the original loop both
   pass.
5. **Ship.** Commit, then continue at `ship` step 4, with the red and green
   outputs in the PR.

When the bug lives in a state machine, a permission rule, a queue, or a
cancellation path, add `create-formal-verification-skill` for that invariant
before step 4. Jeff prefers formal checks wherever they fit.

## feature

A new capability whose scope is not settled yet.

1. **Shared terms.** `grilling`. Ask the whole open frontier of questions in
   one numbered round, each with a recommended answer. Look up facts yourself.
   Done when Jeff confirms there is nothing left to decide.
2. **Spec with an answer key.** `to-spec`. End the spec with an acceptance
   table of user action and expected result, 10 to 15 rows. That table is the
   answer key the building agent does not write. Done when Jeff approves the
   spec.
3. **Formal where it pays.** When the feature carries an invariant (a state
   machine, permissions, money, ordering), `create-formal-verification-skill`
   for that invariant.
4. **Tickets.** `to-tickets`. Thin end-to-end slices, each demoable alone, each
   with its blockers. Work the frontier.
5. **Build each ticket.** `implement` with `tdd` at the agreed seams, then
   `ship` per ticket. Each acceptance row becomes a verify journey when its
   ticket lands.

## ui

A screen looks wrong or is hard to use.

1. **Brief.** Jeff's complaint, pasted as he said it. Done when the brief and
   the acceptance predicate are in `frame.md`.
2. **Climb.** `hill-climb` with its `references/ui.md`: fixed states and
   capture settings, behavior checks beside the screenshots, Sol every round,
   Opus once Sol is at target. Reference screenshots from the second climb on.
3. **Exact match work.** When the goal is parity with a known design, use an
   image diff against a frozen baseline instead of judges: the `poteto-mode`
   visual-parity playbook (pstack `skills/poteto-mode/playbooks/visual-parity.md`).
   A nonzero diff fails.
4. **Ship.** Each kept round is already a commit. Continue at `ship` step 4,
   with the round table, the before and after pair, and the annotated copy in
   the PR.

## review

Review a change someone made, without pushing anything.

1. **Pin the head.** Record the PR head SHA and diff command. Every finding
   names that SHA.
2. **Pick depth by tier.** Medium: `sol-loop` in review-only mode. High:
   `council`, then `interrogate` on the claims that survive. For two separate
   questions (does it follow the standards, does it match the spec), Matt
   Pocock's `code-review` runs one fresh reviewer per axis.
3. **Reproduce.** Run each finding's command on the head. Keep what fails.
   List the rest as dropped, with the reason.
4. **Report.** Findings with severity, the command, and its output, in your
   reply. Posting any of it as a PR comment goes through `leaving-pr-comments`,
   and Jeff approves the text first.

## revive

An old PR, a stalled branch, or someone else's work.

1. **Judge before rebasing.** `modernize`. Lead with MODERNIZE, REWORK, or
   CLOSE and the evidence.
2. **CLOSE** stops here and asks Jeff. **REWORK** describes the smallest
   rewrite and asks Jeff before building it.
3. **Someone else's work.** `takeover`: a replacement branch from
   `agent-git claim`, original commits imported, credit kept.
4. **Ship.** Commit, then continue at `ship` step 4.

## perf

Slower, bigger, or costlier than it should be.

1. **Frame the number.** Write the claim you expect to ship and the noise floor
   before running anything (`benchmark-checklist`).
2. **Climb.** The `poteto-mode` hillclimb playbook (pstack
   `skills/poteto-mode/playbooks/hillclimb.md`): one metric, a frozen harness
   that prints work and error counts, five runs per side alternating, keep or
   revert per hypothesis, every attempt in `decision.tsv`.
3. **Ship.** Each kept change is already a commit. Continue at `ship` step 4,
   with baseline and final medians and ranges.

## eval

Agents keep making the same mistake: the wrong tool, a misrouted skill, a
prompt that produces the same defect.

1. **Build the eval.** `hill-climb` with its `references/evals.md`: cases from
   real session logs, a held-out set, and proof the eval fails the current
   version. Done when the suite command prints the baseline per model.
2. **Commit the eval** through `ship`, so later changes run against it.
3. **Climb correctness, then size.** Two climbs with a commit between them.
   The held-out bar must pass before compression starts.

## verify-setup

A repo with no verify skill, or one that has drifted.

1. **Create.** `create-verification-skill`: launch from an empty data folder,
   a doctor check, driving the real path, evidence that survives cleanup, and a
   feature map. Done when it ran end to end once.
2. **Formal layer.** `create-formal-verification-skill` for the code where a
   bug costs the most and tests reach the least.
3. **Maintain.** `maintain-verification-skill` after features move. It sorts
   each problem into doc drift, harness gap, or product defect, and keeps
   product defects out of the skill fix.
4. **Ship** the skill as its own PR, as the Git law requires for a repo
   without one.

## intake

A transcript, paper, research dump, or another model's summary.

1. **Check claims.** `brain-intake`. Another model's summary is a lead. A claim
   enters `Brain/concepts/` only after you open the artifact it came from.
2. **Many parts.** When the material splits into several checkable jobs, run
   `checkable-jobs` with one check per node.
3. **Record.** Concept pages with a verification note. Proposals for this
   machine go to `Brain/notes/`, marked not adopted.

## handoff

Work moves to a fresh session or another agent.

1. **Write the packet.** Matt Pocock's `handoff`, holding these fields: the
   goal, the accepted commit, the branch and worktree, the instruction and
   verify skill paths, decisions already made, the scorer or eval version,
   evidence paths, failed approaches to avoid, and the next bounded action.
2. **Separate accepted from exploratory.** Say which checks the next revision
   still needs. An approval of an older head covers nothing newer.
3. **Record.** Stage the task row, and save the packet where the next agent
   reads first: the task row's artifact, or the run folder.
