# claude-mods

Jeff's Claude Code mods: plugins of function hooks, served as the local marketplace `jeff-mods`. Each mod lives in
`plugins/<name>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.tsx`, `types/index.d.ts`, and
its tests.

## Rules

- No mod posts, sends anything external, spends money, or touches credentials, settings, or security controls. A mod
  may read local files, run read-only host commands, and call `$.model`.
- No mod writes a secret into a store, a file, a toast, or a log.
- Work on `main`. Commit each mod change with its tests passing.
- The installed copy lives in `~/.claude/plugins/cache/jeff-mods/`. After a change, run
  `claude plugin marketplace update jeff-mods`, then `claude plugin update <name>@jeff-mods`, and restart Claude Code or
  run `/reload-plugins`. Bump `version` in the mod's `plugin.json` first, or `claude plugin update` keeps the old
  cached copy (seen 2026-11-01).
- To develop a mod live, load the source folder with `claude --plugin-dir plugins/<name>`, or ask Claude to load the
  `plugin-authoring` skill and copy the mod into that session's dev-mods folder for hot reload.

## Checks

Run all three for every mod you change, from the repository root:

```sh
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
tsc -p plugins/<name>
```

`tsc -p` needs the engine-written types in `plugins/<name>/.claude-plugin/types/`, which appear after the engine has
loaded the mod once. They are not committed.

Git Bash rewrites an argument that starts with `/` into a Windows path. Set `MSYS_NO_PATHCONV=1` before passing a slash
command to `claude -p`, or the prompt reaches the model.
