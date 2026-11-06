# Repository checks

## Sub-features

Manifests, skill frontmatter, the writing law, the test suites and the tstack drift check.

## How to get to it (user POV)

These are what CI runs on every PR into `dev`.

## Driving it with node

Run `node scripts/ci-check.mjs` from the repo root, then each `node --test` line in
`.github/workflows/ci.yml`. For drift, clone upstream at the commit in `plugins/tstack/UPSTREAM.md` and run
`node plugins/tstack/sync.mjs --source <clone> --check`.

Proof: each exits 0, and `ci-check` prints its plugin and skill counts.

## Gotchas

Actions on this account was billing-locked in November 2026, so a red check with no steps is not a code
failure. The hook mods' own tests need the Claude Code CLI and are not in CI.
