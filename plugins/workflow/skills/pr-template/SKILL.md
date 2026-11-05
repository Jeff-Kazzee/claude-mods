---
name: pr-template
description: Write every pull request description in Jeff's format (ELI5, before and after, proof, testing, risk, checklist) and attach screenshots, video, logs or other evidence of the work. Use whenever you open or update a PR in any repo, for any kind of change. This format replaces every other PR body format, for every agent on every host.
---

# PR template

Every PR gets this body: code, docs, config, skills, any repo. A reader who
stops after the ELI5 knows what changed, and a reader who goes to the end can
check every claim. `references/example.md` is the PR Jeff chose as the model.
Read it once per session before your first draft.

## 1. Capture evidence

Evidence comes from the PR's head commit, in this session. Pick the strongest
row that fits. A PR can use several.

| Change | Evidence |
|---|---|
| Anything visible | Before and after screenshots with identical state |
| A flow, animation or timing | A short video of the real app |
| CLI, script, service | Command and output, before and after |
| Bug fix | The regression check red on the base, green on the head |
| Performance | Baseline and final medians, with the command |
| Docs, config, a skill | The rendered result, or a run of the thing it instructs |

For a before capture, run the base commit with the same data. The only
difference between the two captures is the change, and the caption says so.

Open each capture and look at it. Crop or redo anything that shows a token, an
email address, customer data or an unrelated window.

Done when every changed behavior has a capture you observed on the head, or
Proof says `N/A:` with the reason.

## 2. Attach media

GitHub has no upload API for PR media, so `attach` stores files in the repo
under a `refs/pr-evidence/<task>` ref. That ref stays out of the branch list and
the PR diff, and it outlives the merge.

```sh
node <this skill's folder>/scripts/pr-body.mjs attach --task <id> before.png after.png demo.mp4
```

Run it inside a checkout of the repo, on a host with `gh` signed in. It prints
one Markdown line per file. Paste those lines into the body.

**No GitHub login on this host** (a Daytona sandbox, for one). Capture and write
`body.md` here, with each file's name where its image will go, and run
`check body.md`. Copy the media and `body.md` out to a host with `gh`, then run
`attach`, swap the names for the printed lines, and open the PR there. Keep GitHub
tokens out of sandboxes.

- **Video.** GitHub strips `<video>` tags and shows an `.mp4` URL as a plain
  link. `attach` makes a GIF of the first 30 seconds and prints it linked to the
  full file. Say so in the caption when the video runs longer. Without `ffmpeg`
  (Linveo has none) it prints the plain link and warns, so make the GIF on a host
  that has `ffmpeg`, or attach a GIF you made.
- **Public repos.** `attach` refuses a public repo until you pass `--public-ok`.
  A ref on a public repo publishes the file for good, so get Jeff's yes first.
- **Private repos.** Images load only for signed-in members. An anonymous fetch
  gets 404, which is the private boundary working.

Paste logs inline: a short one in a fenced block, a long one inside `<details>`.

## 3. Write the body

Write to a file, with every `{{field}}` filled. Keep every heading. A section
that does not apply says `N/A:` and why. If the repo has
`.github/pull_request_template.md`, keep its sections and boxes as well, each
in the closest section here.

````markdown
## ELI5

{{Two or three plain sentences: what the user hit, and what happens now. No file names.}}

## What Changed

**Before:** {{the old behavior, concrete enough to reproduce}}

**After:** {{the new behavior, and what deliberately stayed the same}}

**Mechanism:** {{the function and file that changed, and which callers reach it}}

## Why

{{Why this needed doing, and why this approach over the option you rejected.}}

## Linked Issue

{{"Fixes #123", or "None:" and the reason}}

## Visual Proof

{{The setup that makes the captures comparable.}}

| Before | After |
| --- | --- |
| {{before image}} | {{after image}} |

{{What each capture shows, how it was made, and the only difference between them.}}

## Testing

- [ ] I manually tested these changes locally
- [ ] Automated tests added or updated, or explained why not below

{{One line per test file: what it now asserts.}}

{{Exact check command and result, on head `abc1234`.}}

{{Manual run: the OS and what you did.}}

## Risk

**Level:** {{Low, Medium or High}}

- {{Who sees a change, and what they see}}
- {{Saved data, settings, protocols and older clients}}
- {{How to back it out}}

## AI Disclosure

Implemented with {{harness}} ({{model}}). {{Who reviewed it.}}

## Review

- [ ] Upstream boundary: this change copies no upstream source, or the copy is declared here

**Impact:** {{Security, cross-platform (Linux, Windows, Mac), remote SSH, mobile, backwards compatibility, performance. One short clause each: the impact, or why there is none.}}

## Checklist

- [ ] This PR is small and focused
- [ ] I explained what changed and why
- [ ] I stated the risk: what could break, for whom, and how to back it out
- [ ] Evidence is attached, or N/A with a reason
- [ ] Self-reviewed for correctness, security and performance
- [ ] Cross-platform, SSH and path impact considered, or N/A
- [ ] The repo's lint, typecheck, test and build pass, or CI will cover them

{{Attribution line}}

Task: {{task id or none}}
````

- **Proof without pictures.** Change the heading to `## Proof` and replace the
  table with before and after fenced output.
- **Boxes.** An `[x]` is a claim you can back with something from this session.
  Check `I manually tested` only when you ran the change yourself. Leave any
  other box empty and write why on the line below it.
- **AI Disclosure.** Name who actually reviewed it: a verifier session and its
  receipt, or "not yet reviewed by a person".
- **Attribution line.** Use the line your harness gives you. Claude Code gives
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Others write
  `Created with <model> in <harness>.`
- **Last line.** `Task: <id>` closes the body, after the attribution.

## 4. Check and open

```sh
node <this skill's folder>/scripts/pr-body.mjs check body.md
gh pr create --base dev --title "<title>" --body-file body.md
node <this skill's folder>/scripts/pr-body.mjs check --pr <number>
```

`file-pr` owns the title and the opening steps. `check` asks GitHub to render the
body and judges that HTML, so it reads what a reader sees. It fails on a missing,
empty or out-of-order section, an empty label, a bare `N/A`, an unfilled `{{field}}`,
an em dash, a missing `Task:` last line, and an image that is not on an evidence
ref or a GitHub `user-attachments` upload. `--pr` also fails when the body does not
name the current head, so after a push it fails until the proof is redone.

`check` needs to reach `api.github.com`. Without a signed-in `gh` and a GitHub
origin it still renders the body, warns that it skipped the image check, and
`check --pr` is not available. It is a format check, not a security gate.

Open the PR as a signed-in viewer and confirm each image draws. `check` proves
the bytes are on GitHub, not that they display. If no signed-in browser is
reachable, say that in your reply.

After every push, recapture what the push changed, update the head in Testing,
and rerun `check --pr`. When a verifier records a receipt, put its id in AI
Disclosure.

Done when `check --pr` passes on the head and you have seen the images draw.
