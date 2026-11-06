# README check

## Sub-features

Structure rules, invented numbers, links, images, badges, and the quick start on a fresh clone.

## How to get to it (user POV)

An agent runs it as step 4 of the `readme` skill, from the root of the repo it is writing for.

## Driving it with node

```sh
node plugins/github/skills/readme/scripts/readme-check.mjs README.md --online --clone <path>
```

Proof: exit 0 and `ok:` on a good README, exit 1 and one line per problem on a bad one.

## Gotchas

`--clone` runs the README's commands, so use it on owned repos or in a sandbox. A URL clones the default
branch, so pass a local path to test a branch. Only PNG pixels are decoded. Other image formats get a
structure check.
