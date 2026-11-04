## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin and outranks the steps
above where they differ. The `full-send` skill's own "On Jeff's machine"
section applies here too: `agent-git claim` for the branch, `dev` as the base,
the verify skill in the proof, and Sol through the local routes.

The force-push permission above covers only a branch this agent created in this
task. On a branch another agent or person created, push without force, or move
the work to a new branch from `agent-git claim`.

At the handoff, record the receipt from a session that did not build the
change (`agent-git receipt`), then run `agent-git stage <id> "Waiting on Jeff"
"<PR link> at <sha>"`. End the report with one line Jeff can answer in five
minutes: "Merge PR <n> at <sha>?"
