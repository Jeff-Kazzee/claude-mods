---
name: autoresearch
description: Run a multi-session task as a graph of small checked nodes with a baseline, evidence gates, and resume files. Use for /autoresearch, "autoresearch this", or resuming a run that has a progress.md under wiki/runs/. For one code metric, use the pstack hillclimb playbook instead.
argument-hint: "<task> [output: <path>] [checks: <list>] [scope: <paths>] [limit: <budget>]"
---

# Autoresearch

1. Read `C:/Users/jeffk/the-little-ai-company-OS/prompts/harness/autoresearch-graph-loop.md` in full, workspace notes included. The blockquote under `## Prompt` is the run's instructions, verbatim and canonical. Done when you have read the whole file this session.
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

Arguments: $ARGUMENTS
