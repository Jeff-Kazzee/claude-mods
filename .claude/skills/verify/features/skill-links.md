# Skill links

## Sub-features

The install across Claude Code, Codex, Cline, OpenCode, DeepSeek Harness and Linveo, and its `--check`.

## How to get to it (user POV)

A person runs `node scripts/link-skills.mjs` from the main checkout. The nightly routine runs `--check`.

## Driving it with node

Only with `--check`, and only with `HOME` and `USERPROFILE` pointing at an empty folder:

```sh
HOME=<empty> USERPROFILE=<empty> node scripts/link-skills.mjs --check
```

Proof: exit 1, a `FAIL` line for each runtime, and the folder stays empty.

## Gotchas

Without `--check` it changes real runtime settings and writes to Linveo. Prove a real install with a fresh
session in each runtime, not with this check alone.
