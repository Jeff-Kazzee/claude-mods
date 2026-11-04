---
name: flows
description: Route a task in one of Jeff's repos to its flow, the ordered skills and gates for that kind of work. Use at the start of any code task, and for "ship this", "fix this bug", "build this feature", "polish this UI", "review this", "revive this PR", "make this faster", "build an eval", "set up verification", "take this in", or "hand this off", or when asked "which flow" or "how do we do X here".
---

# Flows

A flow is the ordered list of skills and gates for one kind of task on Jeff's
machine. Pick the flow, then run its steps from `references/playbooks.md`. Each
step names the skill to call and the evidence that ends the step.

## 1. Pick the flow

Match the request to one row. Rows run from most specific to least, so when two
rows fit, take the higher one. `ship` is the fallback for a change that fits no
other row. Say which flow you picked, and why, in your first reply.

| Request | Flow | Ends at |
|---|---|---|
| Something is broken, even when the fix looks obvious | `bug` | `ship`, with a regression check that failed before the fix |
| A new capability, scope not yet clear | `feature` | Tickets, then `ship` per ticket |
| A screen looks wrong or hard to use | `ui` | `ship`, with a round table and before and after captures |
| Review a change someone made | `review` | Findings reproduced on the head, nothing pushed |
| An old or someone else's PR | `revive` | MODERNIZE, REWORK, or CLOSE, then `ship` if kept |
| Slower, bigger, or costlier than it should be | `perf` | `ship`, with baseline and final medians |
| Agents keep making the same mistake | `eval` | A committed eval, then a climb against it |
| A repo has no verify skill, or a stale one | `verify-setup` | A verify skill that ran end to end once |
| A transcript, paper, or research dump to learn from | `intake` | Brain pages with checked claims |
| Work moves to a fresh session or another agent | `handoff` | A handoff another agent can start from cold |
| Any other change in a repo, scope already clear | `ship` | A PR into `dev` waiting on Jeff's merge approval |

## 2. Set the risk tier

The tier sets how much review the change gets. Pick the highest that applies.

| Tier | Applies when | Review |
|---|---|---|
| Low | Docs, copy, config with no behavior change | One fresh-context self-check |
| Medium | Ordinary behavior change | `sol-loop` |
| High | Auth, permissions, money, data loss, migrations, concurrency, anything public | `council`, then `interrogate` on what survives |

Done when the flow and tier are stated.

## 3. Gates every flow keeps

These hold in every flow and every runtime. They come from `~/AGENTS.md`.

- **Git.** One task, one branch, one worktree, one writer.
  `agent-git claim <task id>` makes `task/<id>-<slug>` from `origin/dev`. PRs
  target `dev`. Merges go through `agent-git land` after Jeff approves the exact
  head. Never push `prod`, `main`, or `dev`.
- **Proof.** The repo's verify skill passes on the exact head, run by a session
  that did not build the change. A finding about code counts only when a
  command fails on the current head.
- **Approval.** Publishing, external messages, purchases, credential or
  security changes, and destructive actions wait for Jeff. Ask with the
  question tool, sized to a five-minute yes or no.
- **Writing.** No em dashes, no semicolons in prose, no marketing adjectives,
  in replies, commits, PRs, and comments.
- **Record.** Update the task row stage with `agent-git stage`. A failure, a
  surprise, or a correction from Jeff ends in one experience trace
  (`company_os.py trace`).

## 4. Calling skills from any runtime

Call a skill by name with the Skill tool, one skill per call. Names differ by
runtime: Claude Code prefixes plugin skills (`tstack:full-stop`,
`workflow:hill-climb`, `pstack:interrogate`), and the other runtimes use the
bare name.

Cline and DeepSeek Harness load `flows`, `hill-climb`, and the tstack skills,
but not pstack or Matt Pocock's skills. When a skill a flow names is not in
your catalog, read its SKILL.md from these folders and follow it:

- pstack: `C:/Users/jeffk/.claude/plugins/marketplaces/pstack-claude/plugins/pstack/skills/<name>/SKILL.md`
- Matt Pocock: `C:/Users/jeffk/.claude/plugins/marketplaces/mattpocock/skills/<group>/<name>/SKILL.md`,
  where `<group>` is `engineering` or `productivity`.

Every subagent a flow starts gets a fresh context and the handoff fields from
the `handoff` flow, never the chat history.

## References

- `references/playbooks.md`: the steps of each flow. Read only the section for
  the flow you picked.
- The `hill-climb` skill: scored rounds, council judging, and the per-runtime
  judge commands in its `references/runtimes.md`.
