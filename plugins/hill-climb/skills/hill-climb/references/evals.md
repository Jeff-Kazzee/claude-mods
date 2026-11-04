# Evals from failure history, and compression

Read this when the scorer does not exist yet and the failures already happened:
agents picking the wrong tool, a skill that misroutes, a prompt that keeps
producing the same defect. This is Theo's MCP climb (Sonnet failed 28 of 88
cases, then the tool descriptions shrank 52 percent with tool search off and 78
percent with it on, at a perfect score) with the controls his video skipped.

## 1. Mine the cases

Read only the history relevant to the task. Session logs on this machine:

| Runtime | Where its sessions live |
|---|---|
| Claude Code | `~/.claude/projects/<encoded-cwd>/*.jsonl` |
| Codex | `~/.codex/sessions/` and `~/.codex/archived_sessions/` |
| DeepSeek Harness | `~/.dsh/storages/session_projcache/sessions/` |
| Cline | `~/.cline/tasks/` and `~/.cline/data/sessions/` |

Paths checked on 2026-11-03. Each runtime can move them in an update, so
confirm the folder exists before mining it.

Transcripts can hold secrets. Redact before a case leaves the machine or enters
a commit. Done when you hold at least 5 real failures. Theo started with 88, and
a small honest set beats a large invented one.

## 2. Write each case

One record per case, in `cases/<id>.json` or one JSONL file:

- `request`: the user's words.
- `state`: the starting state that matters (files, open threads, config).
- `tools`: the tool schemas available at that moment, pinned by hash.
- `expected`: the behavior that is correct, with the reason it is correct.
- `forbidden`: the behavior that counts as failure.
- `observed`: what the agent did, with the transcript pointer.
- `class`: one of `reasoning-or-routing`, `invalid-arguments`,
  `tool-execution`, `environment`, `wrong-final-state`.

Expected values come from the product contract or Jeff, never from what the
current code happens to do.

Theo's merged eval (t3code PR #24635) holds every case to four rules: it
reproduces a real failure, it fails before the fix, it has controls (cases where
the tool should not be called), and it contains no user data. Use the same
four. His harness replays synthetic threads, lets a cheap model play the shell,
and reads tool text from source so two branches compare directly. A full run
cost about $9, and CI does not call models.

## 3. Split and pin

- Put about 70 percent of cases in `dev` and hold out the rest. The worker
  optimizes against `dev` only. Held-out cases run at baseline and at the end.
- Pin the suite revision, model identifiers, generation settings, tool schemas,
  fixtures, and the evaluator. Write the pins into `frame.md`.
- Use routing checks (tool choice and arguments, cheap, many) and a few
  integration checks against the real service for side effects that matter.

Done when one command runs the suite and prints pass count, total, and error
count for each model.

## 4. Prove the eval sees the failure

Run the suite on the version that produced the failures. It must fail the cases
it was built from. A suite that passes the known-bad version measures nothing.

## 5. Run matched comparisons

- Declare repeats and aggregation before running. Default: 5 runs per side,
  alternating baseline and candidate, report median and range.
- Keep every run, including infrastructure failures. An errored run is not a
  pass.
- Never change the denominator silently. Theo's suite went from 88 cases to 85
  without a stated reason. Version the suite and rerun the baseline on the new
  version.

## 6. Maximize, commit, then minimize

Two climbs, two prompts, one commit between them.

1. Climb correctness until every model that matters passes every `dev` case.
   Commit, then run the held-out cases once. The commit becomes the accepted
   checkpoint only when the held-out pass rate meets the bar declared in
   `frame.md` (default: every held-out case passes). When it misses, the climb
   overfit `dev`. Report the failing held-out cases, move them into `dev`,
   collect fresh held-out cases, and climb again. Compression never starts from
   a commit that missed the held-out bar.
2. Start the second climb from the accepted checkpoint. The target is size (tokens), and
   correctness is now a guard that runs every round. A round that loses one
   case reverts.

Measure tokens with the provider's tokenizer or usage records. Character count
is not token count. Report initial context separately from total task tokens,
latency, retries, and tool errors. A shorter description that causes retries
can cost more per task. Measure tool search on and off as separate
configurations when both are supported.

Protect what prevents failures while cutting: preconditions, what an action
means, required arguments, side effects, and error recovery.

## 7. Keep the eval honest

- The candidate never sees the eval, the cases, or the words eval, judge, or
  score. Hardcoded example answers and recognizing the test are failures.
- An evaluator bug gets fixed in its own commit, with the reason, and both
  baseline and candidate rerun.
- A perfect score covers the tested cases on the tested runs. Say exactly that.
- Commit the eval to the repo so every later change runs against it.
