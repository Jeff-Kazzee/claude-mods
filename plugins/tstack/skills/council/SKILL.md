---
name: council
description: Trigger this if the user says 'council'.
---

# Council

Before an audit, address outstanding PR comments, fix known issues, and run
relevant checks. Give council the updated implementation; do not defer known
fixes until reviews return. If the user wants to discard the implementation
and explore new ideas, skip fixes to code being replaced.

Bring in three delegates to help with the user's request, usually for review
or feedback. Use one strong model from each of three different providers, at
high reasoning effort. If the user's instructions name council members, use
those. Otherwise pick the latest flagship model from each provider, for
example Claude Opus, GPT Sol, and Gemini Pro.

In T3 Code, use `orchestrator_capabilities` to resolve the models, then
`delegate_task` to start one delegate per model in parallel. Elsewhere, use
the harness's subagent tools. If you cannot reach three providers, or a named
member is unavailable, report it instead of substituting.

Give each delegate the request and relevant context. For review or feedback,
keep their work read-only. Collect their responses and summarize the useful
findings, disagreements, and recommended next steps.

For a code review, ask each delegate for a score out of 10.
Count each full review pass as one round.
A fresh review after fixes starts a new round.

If the work ends in a pull request, put the results in the PR description.
Put this section before the model and harness line at the end:

```markdown
## Council review

Rounds: 2

| Delegate | Round 1 | Round 2 |
| --- | --- | --- |
| Claude Opus | 7/10 | 9/10 |
| GPT Sol | 8/10 | 10/10 |
| Gemini Pro | 7/10 | 9/10 |
```

If a delegate gives no score, write `no score`. Do not invent one.
If the PR is open, edit the description. Do not post a comment for this.
If there is no PR, put the same results in the final reply only.

If you agree with their recommendations, make the changes and request a fresh
review after. Continue this process until all delegates are satisfied with the
outcome.

Do not let repeated reviews result in scope creep. It is your job to fight to
keep scope limited.

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
