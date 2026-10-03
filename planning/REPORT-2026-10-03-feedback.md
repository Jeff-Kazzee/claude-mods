# Report: the mods feed what they collect back into the agent, October 3, 2026

Written by the subagent that ran `planning/BRIEF-2026-10-03-feedback.md` on 2026-10-03, saved and committed by the main
session, which reran validate and test for all three mods (18, 22, and 27 pass, 0 fail). The work is three commits on
`main`, not pushed: `51543cf` (taste-fork), `e62645f` (peanut-gallery), and `0ffbfe6` (delegate-ledger).

## What changed per mod

### taste-fork 0.2.0

- `taste.md` has a new `## Do not flag` section with two entries dated 2026-10-03 (PR #141). The first covers the
  attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end of a PR body. The second
  covers parentheses, which the writing law allows as a dash replacement.
- `claude plugin test` gives a test no file system, so no test can prove that the shipped `taste.md` reaches the
  critic. The two rules therefore also live in `hooks/taste.ts` as `DO_NOT_FLAG`. `criticSystem` always sends them in a
  `<do-not-flag>` block, after the writing floor and before the unslop, voice, and taste rules. Two tests check that
  block, once with `taste.md` read and once with it missing.
- Events and calls are unchanged.

### peanut-gallery 0.2.0

- `Note` gains `resolution?: { outcome: 'acted' | 'traced' | 'declined'; text; time; sessionId; author }`. Jeff's
  `status` stays separate, so a note an agent addressed is still unread for Jeff. Stored notes without the field still
  parse.
- At `session.start` the mod builds the open-notes section once and keeps it in `$.state`. It takes unread notes with
  no resolution whose `project` matches `folderName($.session.root())`, ignoring case, which is the note tool's default.
  Criticisms come first, each group newest first. At most five notes, stopping before about 2,000 characters, with
  whitespace collapsed and secret-shaped text redacted.
- The section frames the notes as unverified leads from earlier agents. The agent checks a factual note before it acts.
  An opinion about process does not change what it does. It goes into the session's experience trace under
  `~/AIS-OS/Brain/experience/raw/`. Then the agent calls `resolve`.
- `prompt.compose` appends the section as `peanut-gallery:notes`, scope `session`, and skips a `teammate` render. The
  text is fixed for the session, so the prompt cache holds and a note resolved mid-session leaves at the next start.
- The new tool `resolve` (`mcp__peanut-gallery__resolve`) takes `{ id, outcome, text }`, text up to 200 characters. It
  is registered only when the section lists a note. A second call replaces the line. An unknown id, a bad outcome, or
  long text is refused with the reason. The text is redacted before it is stored.
- `/gallery` shows `Addressed, <outcome> by <author>. <text>` under the note, and `/gallery export` writes it too.
- The note tool's description, the invite section, `plugin.json`, `marketplace.json`, and the README no longer say that
  only Jeff reads the notes. The README says the original premise ended at Jeff's request.

### delegate-ledger 0.2.0

- At the first `session.start` of a process, after the sweep, the mod builds a section of at most five lines, each
  `- Agent "<description>", brief <path>, started <age> ago.`, for delegates still marked running by a process that
  died. Nothing else. `prompt.compose` appends it as `delegate-ledger:orphans` and skips `teammate` renders.
  Descriptions and paths are redacted again on the way in.
- Nothing else changed. The unread toast stays. It tells Jeff, not the agent.

### hillclimb-loop and next-steps

No change. `hillclimb-loop` is a command Jeff starts. `next-steps` suggests prompts to Jeff. Neither collects anything
for an agent. Both should stay disabled.

## Checks

| Mod | `claude plugin validate` | `claude plugin test` | Type check |
| --- | --- | --- | --- |
| taste-fork | `✔ Validation passed` | `18 pass`, `0 fail` | exit 0 |
| peanut-gallery | `✔ Validation passed` | `22 pass`, `0 fail` | exit 0 |
| delegate-ledger | `✔ Validation passed` | `27 pass`, `0 fail` | exit 0 |

The baselines before this work were 16, 14, and 24 passing tests. `tsc -p plugins/<name>` cannot run in this checkout,
because the engine writes `.claude-plugin/types/` only when it loads a mod, so each mod was type checked with a
tsconfig kept outside the mod folder, using the compiler options from the header of the 2.1.288 `claude-code.d.ts`.

## Do prompt sections and plugin tools reach subagents?

- No for sections, yes for tools. `AgentSpec.prompt` says a subagent's system prompt replaces the session's, and
  `PromptComposeInput` carries no agent id. `AgentSpec.tools` says a left-out list gives every tool the parent has.
- The author ran as a `pstack:poteto-agent` subagent with peanut-gallery 0.1.0 installed. Its tool list held
  `mcp__peanut-gallery__note`. Its system prompt held no peanut-gallery section.
- A fork runs on the parent's system prompt and sees both sections. A teammate render carries the `teammate` trait,
  which both mods now skip.
- So the 10 subagent notes arrived through the tool description, and the open-notes list reaches the main session (and
  its forks) alone.

## The hookify finding

- `warn` delivers a `systemMessage` that reaches only Jeff's screen. Hookify's `core/rule_engine.py` returns
  `{"systemMessage": ...}` for a warning, and the engine documents `additionalContext` as the field handed to the model.
- The one live firing (transcript `45876be0`, lines 418 to 428) fired twice on one Bash call, at PreToolUse and
  PostToolUse. Neither attachment was rendered to the model, and the next assistant turn did not react. The firing was
  a false positive: the command used a raw string, which the rule recommends, and it succeeded.
- `block` delivers a bare refusal. A probe with a throwaway rule and `claude -p --model haiku` returned only
  `PreToolUse:Bash hook error: Blocked by hook` to the model. Hookify's block sets `permissionDecision: "deny"` with no
  reason, so the rule's text never reaches the model.
- So hookify cannot feed this rule to an agent in either mode. For the model to read the rule's text, the rule has to
  move into a function hook on `tool.call` that returns `{ deny: <text> }` (the shortlisted Law Engine mod, not built).
- If the rule stays, a tightened pattern stops raw strings from firing:
  `pattern: (python3?|py|node)\s+(-c|-e|-)\s[\s\S]*(?<![rR]["'])[A-Za-z]:\\[Uu]`. Hookify also checks only the Bash
  tool, never PowerShell, and loads the rule only in sessions started at the AIS-OS root.

## Built but not live

The installed copies are still 0.1.0. None of the new behavior has run in a live session. The engine's test kit ran it.

## Commands for Jeff

```sh
claude plugin marketplace update jeff-mods
claude plugin update taste-fork@jeff-mods
claude plugin update peanut-gallery@jeff-mods
claude plugin update delegate-ledger@jeff-mods
claude plugin disable -s user hillclimb-loop@jeff-mods
claude plugin disable -s user next-steps@claude-community
claude plugin disable -s user hookify@claude-plugins-official
```

Then restart Claude Code or run `/reload-plugins`.

- The main session adds the hookify disable, because neither of its modes delivers the rule's text to the model, and
  the same lesson already reaches every session start through the Brain pattern list
  (`inline-code-reparsed-at-the-boundary`).
- The marketplace is a directory source, so no push is needed before the update.
- The notes and the ledger survive the version bump. Each store file is keyed by the SHA-256 of `<name>@jeff-mods`, not
  by version.
- The 2026-10-02 handoff says taste-fork's unset options arrive empty after a reinstall. After the update, check its
  two options in `/config`.

## Still open

- A live check after the update. In a session started at the AIS-OS root, the context should show the
  `peanut-gallery:notes` section, and a `resolve` call should show its line in `/gallery`.
- The probe left its transcript in `~/.claude/projects/C--Users-jeffk-AIS-OS-projects-claude-mods--probe-hookify/`.
- The three code commits carry no entire.io checkpoint trailer, because the subagent session was not tracked.
