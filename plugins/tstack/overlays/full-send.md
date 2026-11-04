## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin and outranks the steps
above where they differ. Jeff's Git law in `~/AGENTS.md` holds: every merge
waits for Jeff's approval of that exact head, after a receipt from a session
that did not build the change. "Full send" grants everything above except the
merge itself and the force-push limit below.

- Force-push only a branch this agent created in this task, with
  `--force-with-lease` against the head you last observed. When you resume a
  branch another agent or person created, push new commits without force, or
  move the work to a new branch from `agent-git claim`.

- Start the branch with `agent-git claim <task id> --repo <owner/name> --agent
  <role> --runtime <runtime> --session <id>`. It creates `task/<id>-<slug>` from
  `origin/dev`. Read "default branch" above as `dev`. Commits end with the
  `Task:`, `Agent:` and `Agent-Session:` trailers it prints.
- Proof includes the repo's verify skill run on the exact head.
- Step 3 runs Sol through the routes in the `sol-loop` skill's "On Jeff's
  machine" section.
- Step 6 changes. When the merge gate passes, a different session records the
  receipt (`agent-git receipt`). Then ask Jeff with the question tool: the PR
  link, the head SHA, the proof in one line, and "merge?". Merge only with
  `agent-git land <id> --head <sha> --approved-by-jeff "<his words and the
  date>"`. Never run `gh pr merge` directly.
- When no answer arrives, stop the way `full-stop` stops, and set the stage with
  `agent-git stage <id> "Waiting on Jeff" "<PR link> at <sha>"`.
