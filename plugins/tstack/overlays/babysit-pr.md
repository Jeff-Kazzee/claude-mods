## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin and outranks the steps
above where they differ.

- Upstream `pr-wait` imports `fcntl`, which Windows lacks, so it exits with
  `ModuleNotFoundError` there. Run the wrapper beside it instead, with the same
  arguments: `python "<this skill's directory>/scripts/pr-wait-win.py" <pr>
  --repo <owner/name> --until ready`. It supplies the one lock `pr-wait` needs
  and runs the script unchanged.
- Read `main` above as `dev`. Task PRs target `dev`, and only a promotion PR
  targets `prod`.
- Merge only through `agent-git land` after Jeff approves the exact head. The
  `full-send` skill's "On Jeff's machine" section has the steps.
- Fix real findings and CI failures without asking. Every reply, dismissal note,
  or resolve comment follows the `leaving-pr-comments` skill's "On Jeff's
  machine" section: draft the text, batch the drafts into one question to Jeff,
  and post only what he approves. A finding waiting on an approved reply counts
  as open for the merge gate.
