# claude-mods

Four Claude Code mods built on 2026-10-02 from the friction in Jeff's own sessions. Each one is a plugin of function
hooks, served from this repository as the local marketplace `jeff-mods`. The evidence behind them is in the shortlist
at https://claude.ai/artifact/9zmckwzzHEziGyKzwrXtFM.

## Install

```sh
claude plugin marketplace add C:/Users/jeffk/AIS-OS/projects/claude-mods
claude plugin install peanut-gallery@jeff-mods
claude plugin install delegate-ledger@jeff-mods
claude plugin install taste-fork@jeff-mods
claude plugin install hillclimb-loop@jeff-mods
```

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
