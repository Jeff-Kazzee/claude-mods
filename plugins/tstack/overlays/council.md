## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin.

- When the user gives a target score, or says "climb" or "until they agree on
  X", use the `hill-climb` skill instead. It hides the target from the judges,
  which this skill does not.
- Default members: Claude Opus 5.5, GPT-6.1 Sol (`gpt-6.1-sol`), and a third
  provider when one is reachable. Gemini CLI is not installed, so Gemini Pro is
  `not run` until it is. Report a missing member, as above.
- Routes outside T3 Code, by parent runtime:
  - Sol: `codex -a never exec -s read-only -m gpt-6.1-sol -c
    'model_reasoning_effort="high"' -C <repo> -o <reply file> "<brief>"`.
  - Opus: in Claude Code, a subagent with `tools: Read, Glob, Grep` and a fresh
    context. Elsewhere, `claude -p --permission-mode plan --tools
    'Read,Grep,Glob' --model opus --add-dir <repo> "<brief>"`.
  - Third provider: in DeepSeek Harness, a `handoff` to the `reviewer` role
    with a `provider` and `model` override (for example `meta/muse-wonder` or
    a `cline-pass/*` model). Elsewhere, `cline --plan --auto-approve false
    --provider <id> --model <model> "<brief>"`. In Cline, `-p` means plan mode.
  - The `hill-climb` skill's `references/runtimes.md` has the full commands and
    the date each was checked.
- Give every delegate the same brief. Never show one delegate another's answer
  or an earlier round's scores.
- A finding about code counts only when you reproduce it with a command that
  fails on the current head.
