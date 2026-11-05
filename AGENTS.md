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

## Other hosts

Linux hosts get the `workflow` and `tstack` skills from `scripts/send-skills.sh`, which streams them over any command
that runs a shell on the host, so no GitHub login reaches that host. Nothing schedules it. After a skill change lands on
`dev`, rerun it from the canonical checkout:

```sh
git fetch origin
sh scripts/send-skills.sh origin/dev ssh linveo-16gb
```

Claude Code and Codex on the host load the links it makes. Hermes on Linveo reads the same folders through
`skills.external_dirs` in `~/.hermes/config.yaml`. A new Daytona sandbox runs the same command with the SSH command from
the Engineer's `dtn.py ssh <id>`. Prove a host with a fresh session asked to list its skills, not with a file listing.

## Checks

Run all three for every mod you change, from the repository root:

```sh
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
tsc -p plugins/<name>
```

`tsc -p` needs the engine-written types in `plugins/<name>/.claude-plugin/types/`, which appear after the engine has
loaded the mod once. They are not committed. A skill-only plugin (`checkable-jobs`, `workflow`, `tstack`) has no
hooks, so `claude plugin test` and `tsc` do not apply to it.

CI (`.github/workflows/ci.yml`) runs on every push to `dev` and every PR into `dev`: `node scripts/ci-check.mjs`
(manifests, skill frontmatter, no em dashes in authored Markdown), the tstack drift check against upstream at the
commit in `plugins/tstack/UPSTREAM.md`, and `pr-wait --help`. `agent-git promote` needs those checks green on the dev
head. Run `node scripts/ci-check.mjs` locally before you push.

Git Bash rewrites an argument that starts with `/` into a Windows path. Set `MSYS_NO_PATHCONV=1` before passing a slash
command to `claude -p`, or the prompt reaches the model.

## Git

- Follow the Git law in Jeff's `~/AGENTS.md` (2026-11-03). `prod` is the default branch and the finished product. All work happens on `dev`. Branch `task/<id>-<slug>` from `origin/dev`, open the PR into `dev`, never push or force-push `prod`, `main` or `dev`, and end every commit with `Task:`, `Agent:` and `Agent-Session:` trailers. `prod` changes only through a promotion PR from `dev`, and every merge waits for Jeff's approval.
