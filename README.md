# claude-mods

Four Claude Code mods built on 2026-10-02 from the friction in Jeff's own sessions. Each one is a plugin of function
hooks, served from this repository as the local marketplace `jeff-mods`. The evidence behind them is in the shortlist
at https://claude.ai/artifact/9zmckwzzHEziGyKzwrXtFM.

## Install

```sh
claude plugin marketplace add C:/Users/jeffk/Development/projects/claude-mods
claude plugin install peanut-gallery@jeff-mods
claude plugin install delegate-ledger@jeff-mods
claude plugin install taste-fork@jeff-mods
claude plugin install hillclimb-loop@jeff-mods
claude plugin install checkable-jobs@jeff-mods
claude plugin install workflow@jeff-mods
claude plugin install github@jeff-mods
claude plugin install tstack@jeff-mods
```

`workflow`, `github` and `tstack` are the mods other runtimes load too. Codex installs them with
`codex plugin marketplace add C:/Users/jeffk/Development/projects/claude-mods`, then
`codex plugin add workflow@jeff-mods`, `codex plugin add github@jeff-mods` and `codex plugin add tstack@jeff-mods`. Cline and DeepSeek Harness read their
skill folders directly. The wiring for all four is in `plugins/workflow/skills/hill-climb/references/runtimes.md`.

Installed plugins load in every new session. After you change a mod here, run
`claude plugin marketplace update jeff-mods` and `claude plugin update <name>@jeff-mods`.

## The mods

### peanut-gallery

Any agent, the main session or a subagent, can leave you a short note through the `note` tool: a comment, a reminder,
a suggestion, or a criticism with a sting from 1 to 3. The status line shows `gallery N` for unread notes, and a
criticism with sting 2 or more raises a toast. Run `/gallery` to read, mark read, archive, or copy notes.
`/gallery export` writes them to `~/.claude/mod-data/peanut-gallery/notes.md`.

Agents read the notes too. This ends the original premise that only you read them. You asked for it on 2026-10-03.
At session start, the main session's system prompt lists up to five of your unread notes for its project (the session
folder name), criticisms first, as unverified leads. The agent checks a factual note before it acts on it. An opinion
about process does not change its behavior directly. The agent records it in the session's experience trace under
`~/AIS-OS/Brain/experience/raw/`, because process changes come only through the experience loop. Then it calls the
`resolve` tool with the note id, `acted`, `traced`, or `declined`, and one line on what it did. `/gallery` shows that
line under the note, and the note leaves the list from the next session on. Subagents do not get the list, because a
subagent's system prompt replaces the session's.

### delegate-ledger

Keeps a row for every subagent and background shell, with its brief, model, state, and age, across restarts. The
status line shows running and unread counts. A result nobody reads for five minutes gets one toast. `/delegates` opens
the ledger. After a crash, the next session lists the work that was still running, and **Relaunch** fills a prompt
from the saved brief. It never sends the prompt.

The agent gets that list too. At session start, the main session's system prompt names up to five delegates an earlier
session in the same folder left running, each with its description, brief path, and age. The harness already tells
the agent when a delegate finishes, so this is the one fact the ledger adds for it.

### taste-fork

After a Write or Edit to a matching file, or an Artifact publish, a critic on another model reads the file once and
hands its findings back to the agent before you see the file. It judges against the writing floor, the unslop rules,
Jeff's voice for files under `content/`, and the dated rejections in `plugins/taste-fork/taste.md`. Add a rejection
there, then update the plugin. Change the reviewed files or the critic model in `/config`.

The critic never flags the PR attribution line or parentheses. It got both wrong on PR #141. Those two exceptions are
dated in `taste.md` and also live in `hooks/taste.ts`, so they hold even when `taste.md` cannot be read.

### hillclimb-loop

Climbs a rubric round after round. Each round aims one change at the weakest criterion, measures every criterion
fresh, keeps the change only when the weighted score rises and no guard drops, and reverts otherwise. It stops at the
target, the budget, or a run of rounds with no gain. Start with `/climb start <path to rubric.json>`. The template is
`plugins/hillclimb-loop/examples/lint-climb/`. It commits kept rounds in the workdir and never pushes.

### checkable-jobs

A skill, not a hook mod. It breaks work into a graph of small checkable jobs (nodes), each with one input, one output, and one check. It
records a baseline, gates risky edges on evidence in `checks.md`, and writes `graph.md` and `progress.md` so a fresh
session can resume. Start with `/checkable-jobs <task>`, or let Claude reach for it on any multi-step task. The prompt text is canonical in
`C:/Users/jeffk/the-little-ai-company-OS/prompts/harness/checkable-jobs-graph.md`, and the skill only points there.
Added on 2026-11-01 at Jeff's request as `autoresearch`, renamed the same day so the name says what it does. For one rubric score, use `hillclimb-loop` instead.

### workflow

Two skills with no Claude-only hooks, so Codex, Cline and DeepSeek Harness load them too. Added 2026-11-03 at Jeff's
request.

- `flows` routes each kind of task (ship, bug, feature, ui, review, revive, perf, eval, verify-setup, intake,
  handoff) to the ordered skills and gates for it, sets a review depth by risk, and keeps the Git, proof, approval
  and writing laws in every flow. Say "ship this", "fix this bug", or "which flow".
- `hill-climb` runs Jeff's improvement loop: frame the brief, prove the scorer can see the failure, change one thing
  per round, keep it only when a frozen check or a council of read-only judges from other providers says it helped,
  and stop at an acceptance predicate the judges never see. Say "hill climb" or "council climb". The method and its
  sources are in `C:/Users/jeffk/the-little-ai-company-OS/Brain/concepts/hill-climbing-with-judges.md`.
  `hillclimb-loop` stays the automated runner for a rubric with programmatic measures inside Claude Code.

### github

How Jeff's repos look on GitHub.

- `pr-template` sets the description every PR carries: ELI5, before and after, proof, testing, risk and checklist.
  Its `scripts/pr-body.mjs` stores screenshots and video on a `refs/pr-evidence/<task>` ref, and checks the body.
- `readme` writes a README from a fixed template. Its `scripts/readme-check.mjs` fails on a dead link, a dead badge, a
  number with no source, or a quick start that does not run on a fresh clone.

`node scripts/link-skills.mjs` installs both skills for Claude Code, Codex, Cline, OpenCode, DeepSeek Harness and
Linveo from this checkout. `--check` changes nothing and exits 1 on any gap, an unreachable host included. To rebuild
everything after losing this folder, run this one command in Jeff's own terminal:

```sh
gh repo clone Jeff-Kazzee/claude-mods ~/Development/projects/claude-mods -- -b dev && node ~/Development/projects/claude-mods/scripts/link-skills.mjs
```

### tstack

Theo's [tstack](https://github.com/t3dotgg/tstack) skills, vendored under its MIT license: council, sol-loop,
full-send, full-stop, file-pr, babysit-pr, takeover, modernize and leaving-pr-comments. `plugins/tstack/sync.mjs`
copies them from the checkout at `C:/Users/jeffk/Side Projects/tstack` and appends an "On Jeff's machine" section
from `plugins/tstack/overlays/` to each one. Those sections hold the local rules: merges go through `agent-git land`
after Jeff approves the head, the base branch is `dev`, Sol and Opus routes outside T3 Code, and `pr-wait` runs
under `python` on Windows. After `git -C "C:/Users/jeffk/Side Projects/tstack" pull`, run
`node plugins/tstack/sync.mjs` and bump the plugin version. `node plugins/tstack/sync.mjs --check` fails when a
generated file was edited by hand.
