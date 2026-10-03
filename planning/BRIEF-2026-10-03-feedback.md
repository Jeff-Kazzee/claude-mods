# Brief: make the mods feed what they collect back into the agent, October 3, 2026

Jeff asked on 2026-10-03: "set them up so you're using the information you get from them." Today most mod output sits
in a pane or a store nobody opens. peanut-gallery holds 17 notes, all unread, and agents cannot read them. taste-fork
is the model to copy: its findings land in the tool result the agent sees. Your job is to make each mod that collects
something useful deliver it into the agent's context, and to say plainly where a mod has nothing to deliver.

Read first: `AGENTS.md` and `planning/HANDOFF-2026-10-02.md` in this repo, the plugin-authoring skill (find the newest
`bundled-skills\*\*\plugin-authoring\SKILL.md` under `C:\Users\jeffk\AppData\Local\Temp\claude\`, with its
`reference.md` and `types/claude-code.d.ts`; grep the types for every event and `$` noun you use, never guess an API),
and each plugin you change under `plugins/`.

## Work, in order of value

1. **taste-fork: stop two wrong finding classes.** Agents act on its findings, so wrong ones now cause harm. On #141 it
   told an agent to delete the required attribution line (`🤖 Generated with [Claude Code](https://claude.com/claude-code)`
   at the end of a PR body) and twice flagged parentheses as a dash substitute, which the writing law allows ("Use a
   period, a comma, or parentheses instead"). Add both to `plugins/taste-fork/taste.md` as dated "do not flag"
   entries, and add a test that the critic prompt carries them.
2. **peanut-gallery: a read path.**
   - The session prompt section lists up to five unread notes for the current project (match `project` to the session
     folder name the way the tool defaults it), newest criticism first, each with its id, kind, sting, and text, capped
     at about 2,000 characters. Main session only.
   - Frame them as unverified leads from earlier agents. A factual note (a bug, a reminder, a broken step) gets checked
     and then acted on. An opinion about process does not change behavior directly: the workspace law says process and
     skill changes come only through the experience loop, so the agent records it in the session's experience trace
     under `~/AIS-OS/Brain/experience/raw/` instead.
   - A new tool `resolve` (listed as `mcp__peanut-gallery__resolve`) takes a note id and one line on what was done
     (`acted`, `traced`, or `declined`, plus text up to 200 characters). It marks the note addressed, and `/gallery`
     shows that line to Jeff. An addressed note leaves the injected list.
   - Settle the open question from the 2026-10-02 handoff: does a `prompt.compose` section reach subagents, and does a
     plugin tool reach them? 10 of 17 notes came from subagents, so the tool does. Report what the types say.
   - This ends the original premise that agents never read notes. Jeff asked for it. Say so in the README.
3. **hookify: check whether its warning ever reached a model.** Its one rule
   (`C:\Users\jeffk\AIS-OS\.claude\hookify.inline-code-boundary.local.md`) uses `action: warn`, which emits a
   `systemMessage`. Read hookify's own source and README in
   `C:\Users\jeffk\.claude\plugins\cache\claude-plugins-official\hookify\` to learn what `warn` and `block` deliver and
   to whom, and check the one live firing: session transcript
   `C:\Users\jeffk\.claude\projects\C--Users-jeffk-AIS-OS\45876be0-8a70-44e8-9cee-219a332169a1.jsonl` near line 425 (did
   the next assistant turn react?). Do not read other parts of that transcript. If `warn` reaches only Jeff's screen,
   propose switching that rule to `block` (one rewrite on a false fire) and write the exact one-line change into your
   report. Do not edit the rule file yourself.
4. **delegate-ledger: the one signal the harness lacks.** The harness already notifies the agent when a subagent or
   background shell finishes, so the ledger's unread toasts duplicate it. The only thing it knows that the harness does
   not is work still marked `running` from a process that died. Add a session-start prompt section (main session only)
   listing those orphans with their description, brief path, and age, capped at five, and nothing else. If the API
   cannot do that cleanly, say so and recommend keeping the mod disabled.
5. **hillclimb-loop and next-steps: no change.** One is a command and the other suggests prompts to Jeff. Neither
   collects anything for an agent. Recommend they stay disabled.

## Rules

- Write only inside `C:\Users\jeffk\AIS-OS\projects\claude-mods\`. Never edit `~/.claude/settings.json`,
  `~/.claude/hooks/`, the hookify rule file, or the installed plugin cache. Never run `claude plugin install`,
  `update`, `enable`, `disable`, or `marketplace update`. Those change the live harness and are Jeff's to run. Do not
  push.
- Per mod: `claude plugin validate plugins/<name>`, `tsc -p` per the skill, and `claude plugin test plugins/<name>`
  with tests for each new behavior. Quote the summary lines.
- No mod posts, sends anything external, or touches credentials. Redact secret-shaped text before anything enters a
  prompt section.
- Writing law: no em dashes, no semicolons in prose, no marketing adjectives, plain UI text. Comments only for a
  non-obvious why.
- Commit in this repo with plain messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Checkpoint with the entire.io CLI as `AGENTS.md` says.

## Report

Write `planning/REPORT-2026-10-03-feedback.md`: what changed per mod, the events and `$` calls used, validate, type
check, and test output, the subagent answer, the hookify finding, what is built but not live until Jeff updates, and
the exact commands Jeff runs to make it live (marketplace update, then each `claude plugin update`, and a revised
disable line for whatever stays cut). Reply in at most ten lines.
