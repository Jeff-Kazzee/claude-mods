# Answer key for claude-mods

This is the source of truth for `verify`. The Reviewer reviews this file before any code it
judges. A row passes only when its check holds on the target and its plant makes the same
check fail on a copy. A check that a plant cannot break proves nothing.

`NOTBUILT` means the row's feature is not in that head. It does not count as a pass, and it does
not fail a head that never had the feature. A head with `plugins/github` must pass every row.

| ID | Requirement | Check | Plant on a copy |
| --- | --- | --- | --- |
| V1 | Manifests, skill frontmatter and the writing law hold | `node scripts/ci-check.mjs` exits 0 | An em dash in `README.md` |
| V2 | Every test suite CI names passes | Each `node --test` line in `.github/workflows/ci.yml` exits 0 | A test that throws, added to the first suite |
| V3 | Every skill-only plugin is valid | `claude plugin validate plugins/<name>` exits 0 for `workflow`, `tstack`, `checkable-jobs` and `github` if present | A broken `plugin.json` |
| V4 | Vendored tstack matches upstream | `node plugins/tstack/sync.mjs --source <clone> --check` exits 0 at the commit in `UPSTREAM.md` | An edited generated skill |
| V5 | The README check tells a good README from a bad one, through its real CLI | `readme-check.mjs --online --clone` exits 0 on a good fixture, and exits 1 on a dead badge, a forged PNG, a dead link, an invented number and a quick start that fails on a clone | The check's failure exit is removed, so a bad fixture exits 0 |
| V6 | `link-skills.mjs --check` writes nothing and reports every gap | In an empty home it exits 1, names `claude`, `codex`, `cline`, `opencode`, `dsh` and `linveo`, and the home stays empty | A line that writes a file into the home during `--check` |
| V7 | `pr-template` has one home, with no alias | `plugins/workflow/skills/pr-template` is absent, and no file outside `link-skills.mjs` names `workflow:pr-template` | A file naming `workflow:pr-template` |

## Outside this key

- The hook mods' `claude plugin test` and `tsc`. `AGENTS.md` requires those for a mod you change.
- A real install. Nothing here runs `link-skills.mjs` without `--check` on a real home.
- Real runtime sessions. Those are proved once, by hand, after an install.
