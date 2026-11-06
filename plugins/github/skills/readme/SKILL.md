---
name: readme
description: Write or rewrite a repository README that shows the project on its first screen and proves every claim. Use when a repo needs a README, when one is stale, or before a repo goes public.
---

# README

A README takes a stranger from "what is this?" to "I'm using it". Every claim in it
holds up when someone checks. A number, a badge or a link that fails makes the
repo look worse than having none, so each one earns its place.

## 1. Gather the facts

Read the repo and run it. Write down what it does, who it is for, how it starts, and
its license. Each fact comes from a file, a command output or a page you opened in this
session.

Done when every planned claim has a source you saw. A fact you could not confirm stays
out, or stays as `[JEFF]` for the owner to fill.

## 2. Capture the visual

Pick the strongest one the project supports, from the real product:

| Project | Visual |
|---|---|
| Has a UI | A screenshot or short GIF of a real flow |
| CLI | A terminal recording, or the real output in a fenced block |
| Library | A short code sample and its real output |

Commit it under `docs/`. Open it and look at it. Crop or redo anything that shows a
token, an email address or customer data.

Done when the visual is in the repo and you have looked at it.

## 3. Write from the template

Copy [references/template.md](references/template.md) and fill every field. Its layout is
the one the check reads. Keep to these limits:

| Part | Limit |
|---|---|
| Name and line | A name and one line of at most 10 words |
| Badges | 3 to 5, each showing a real signal: CI, version, license |
| First screen | The name, the line, the badges and the visual, all in the first 40 lines |
| Features | 4 to 7 bullets, each a benefit a user gets. Plain bullets |
| Quick start | At most 5 commands, in one fenced `sh` block, that end at something working |
| Examples | 2 or 3, going from simple to real |
| Documentation | A link, or a pointer to the section that serves as the docs |
| Contributing | A link to `CONTRIBUTING.md`, or the steps |
| License | The name and a link to `LICENSE` |

Keep the README to one job. Architecture goes in `ARCHITECTURE.md`, with one link from
the README. API references and policies go in their own files too.

Write for someone who has never seen the project. Follow the Writing law. A number
about stars, users, downloads, speed or adoption carries its source on the same line, as
`<!-- source: <url> -->`. A library's API table belongs in the README only when it is
short.

Done when no `{{field}}` is left.

## 4. Check it

Run from the repo root:

```sh
node <this skill's folder>/scripts/readme-check.mjs README.md --online --clone <repo url or path>
```

The check fails on any of these:

- A missing, empty or out-of-order section, or a limit in the table above.
- A number with no source, or a claim such as "trusted by" that the repo cannot back.
- An emoji bullet, an em dash, a semicolon in prose, or a marketing adjective.
- With `--online`, a dead link, a missing local image, a broken anchor, or a badge that
  does not return a live image.
- With `--clone`, a quick start command that fails on a fresh clone.

`--clone` runs the quick start's commands on this machine. Use it on repos you own. For
anything else, run it inside the habitat sandbox or a Daytona sandbox.

Done when the full command exits 0 on the commit you will publish. A failure means the
README or the project is wrong. Fix whichever one lied.

## 5. Publish

Open the change as a normal PR with the `pr-template` skill. Put the check's output in
Proof. For a public repo, Jeff approves the text before it goes out, because it is
published in his name.

## Sources

[references/sources.md](references/sources.md) credits the work this skill adapts, and
lists what it left out and why.
