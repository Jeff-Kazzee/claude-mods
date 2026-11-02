---
name: checkable-jobs
description: Break work into a graph of small checkable jobs. Each job has one input, one output, and one pass or fail check, and jobs that do not depend on each other run in parallel. Measures a baseline first, passes a job only on evidence, and saves resume files. Use for any task with several steps or deliverables, for "checkable jobs", "graph this", or "autoresearch", and to resume a run that has a progress.md under wiki/runs/. For one code metric, use the pstack hillclimb playbook.
argument-hint: "<task> [output: <path>] [checks: <list>] [scope: <paths>] [limit: <budget>]"
---

# Checkable jobs

The idea: no job is done because the agent says so. Every job is small enough to check, and the check's evidence is saved. The prompt behind this is slash1s's autoresearch graph prompt, after Karpathy's autoresearch rules.

1. Read `C:/Users/jeffk/the-little-ai-company-OS/prompts/harness/checkable-jobs-graph.md` in full, workspace notes included. The blockquote under `## Prompt` is the run's instructions, verbatim and canonical. In that prompt a job is called a node. Done when you have read the whole file this session.
2. Fill the placeholders from the arguments:
   - `{{TASK}}`: the task text.
   - `{{OUTPUT}}`, `{{CHECKS}}`, `{{SCOPE}}`, `{{LIMIT}}`: from the labeled parts.
   - `{{SOURCES}}`: files or links the task names, else the owning project's records.
   - `{{SCOPE}}` unset: the current working directory.
   - `{{LIMIT}}` unset: three attempts per node and one session.
   - `{{CHECKS}}` unset: ask for it as the prompt's one question.

   Done when every placeholder holds a value or the one question is asked.
3. Pick the run folder: the owning project's `wiki/runs/YYYY-MM-DD-<slug>/`. When a `progress.md` for this task exists there, resume from its recorded next node.
4. Run the prompt from Phase 0, or from the resume point.
5. Phase 1 approval, Jeff's rule (2026-11-01): when `graph.md` has three nodes or fewer and no node publishes, sends, pays, deletes, or edits outside `{{SCOPE}}`, write `graph.md` and run without waiting. Record "approval skipped: small graph" in `progress.md`. Any larger or risky graph stops for approval as the prompt says.

Arguments: $ARGUMENTS
