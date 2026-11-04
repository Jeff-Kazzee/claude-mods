## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin and outranks the steps
above where they differ.

- Read `main` above as `dev`, the base of every task PR.
- Jeff's Git law forbids force-pushing a branch this session did not create.
  When the PR branch belongs to someone else, push the rebased series to a new
  branch from `agent-git claim` and open a replacement PR that links the
  original, as `takeover` describes. Use `--force-with-lease` only on a branch
  this session created.
