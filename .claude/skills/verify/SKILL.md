---
name: verify
description: Verify a head of claude-mods, Jeff's plugin marketplace of skills and scripts, against the answer key. Runs the repo's real checks and CLIs, with a planted failure for each row, and writes a receipt. Use before any merge into dev or prod, from a session that did not build the change.
---

# Verify claude-mods

The surface is scripts and skills, with no server. `run-all.mjs` drives each one through its real
command, then breaks a copy to prove the check can fail. The rows are in
[acceptance.md](acceptance.md).

## Launch

There is nothing to start. You need Node 22 or later, `git`, the `claude` CLI and SSH to
`linveo-16gb`. Get the exact tree first. On the laptop, read a private branch through Linveo:

```sh
mkdir target
ssh linveo-16gb "gh api repos/Jeff-Kazzee/claude-mods/tarball/<full sha>" | tar -xz -C target --strip-components=1
```

## Doctor

```sh
node .claude/skills/verify/scripts/run-all.mjs --doctor
```

It prints each tool's version and exits 1 when one is missing.

## Drive

Run it from a checkout that holds this skill, naming the target tree:

```sh
node .claude/skills/verify/scripts/run-all.mjs --target target --head <full sha> --builder <who built it> --verifier <who you are>
```

It takes about 3 minutes. It refuses when the builder and verifier match, or when `--head` differs
from a target that has a `.git` folder. It works on copies in a temp folder and never changes the
target. V6 runs with `HOME` and `USERPROFILE` set to an empty folder, so a real home stays out of it.

## Evidence

The receipt is `~/Development/company-os-evidence/claude-mods-<first 12 of head>/receipt.json`. It holds
the head, the tree hash, the key hash, the builder, the verifier, the result and every row with its
output. `pass` needs every built row green, its plant caught, and no row `UNAVAILABLE`.

A row reads `UNAVAILABLE` when a tool or the network was missing. That gives the result `incomplete`,
which is not a pass. Fix the tool and rerun. Never edit a receipt or weaken a row to get a pass.

## Cleanup

Each run removes its temp folders in a `finally` block, and receipts stay. Delete `target` yourself.

## Helpers

- `scripts/run-all.mjs`: the driver above.
- `features/`: what each surface does and how to drive it by hand.
