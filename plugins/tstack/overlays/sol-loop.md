## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin. Sol's model id here is
`gpt-6.1-sol`. Routes to it outside T3 Code:

- **Claude Code, Cline, or any shell.** Round 1:
  `codex -a never exec -s read-only -m gpt-6.1-sol -c
  'model_reasoning_effort="high"' -C <repo> --json -o <reply file> "<brief>"`.
  Keep the session id from the JSON events. Later rounds continue the same
  reviewer with `codex exec resume <session id> "<follow-up brief>"`. Read the
  reply from the `-o` file.
- **DeepSeek Harness.** A `handoff` to the `reviewer` role, which runs on
  `openai-codex/gpt-6.1-sol` and is read-only. Continue later rounds with
  `send_message` to the same agent id.
- **Codex.** A native subagent on `gpt-6.1-sol`. When Codex is also the
  builder, the review is same-family, so say so in the report.

Jeff's Git law applies to anything this loop pushes: the PR base is `dev`, and
commit trailers come from `agent-git claim`.
