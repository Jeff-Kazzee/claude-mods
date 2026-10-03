# lint-climb

A sample endeavour for `/climb`. The loop rewrites `work/draft.md` to cut slop and words while a judge guards
clarity.

## Files

- `rubric.json` names the workdir, three criteria, the guard, the target, and the budget.
- `measure.mjs` prints `slop=<n>` and `words=<n>` for one file. It lives outside the workdir, so a round cannot
  edit its own metric.
- `work/draft.md` is the deliberately sloppy starting text.
- `climb-ledger.tsv` appears here after the first run, with one row per round.

## Run it

1. Make `work` its own git repository once:

   ```sh
   git -C work init
   git -C work add -A
   git -C work commit -m "seed draft"
   ```

2. In Claude Code, run `/climb start <full path to this folder>/rubric.json`.
3. Watch it with `/climb`. Pause, resume, or stop from the pane, or with `/climb pause`, `/climb resume`, and
   `/climb stop`.

To reset the sample, run `git -C work reset --hard <seed commit>` and delete `climb-ledger.tsv`.

## Rubric fields

- `workdir` is absolute, or relative to the folder that holds `rubric.json`. It must be the top of a clean git
  worktree when the climb starts.
- `criteria[].measure.command` is the program and its arguments, run in the workdir with no shell. `{workdir}` and
  `{endeavour}` inside an argument become those folders. A Windows `.cmd` shim does not start without a shell, so
  name `node`, `bun`, or `git` directly, or use `["cmd", "/c", ...]`.
- `criteria[].measure.parse` is a regular expression with one capture group around the number. The loop searches
  standard output, then standard error. `[0-9]+` avoids JSON backslash escapes.
- `criteria[].measure.timeoutMs` bounds one measure. Commands default to 120000 and judges to 90000.
- `criteria[].measure.judge` takes `model`, `rubric`, and `files` (relative to the workdir). The judge scores 0 to
  10, and its model must differ from the session's.
- `criteria[].scale` maps the raw range onto 0 to 10. It defaults to `{ "min": 0, "max": 10 }`. With direction
  `down`, `min` maps to 10.
- `guards` lists criterion ids whose raw value must never get worse than the best commit's.
- `target` is the weighted score, from 0 to 10, that ends the climb.
- `budget` holds `maxRounds` and `maxMinutes` of active time. Paused time does not count, and the loop checks the
  budget between rounds.
- `stopAfterNoGain` is how many rounds in a row may pass without a kept gain before the climb stops. It defaults to
  3 and cannot be 0.
