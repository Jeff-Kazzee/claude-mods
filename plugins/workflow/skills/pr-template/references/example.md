# The model PR

Jeff's chosen example, kept as written. It shows the depth and the voice. Its
`Agent skill upstream boundary` box and its Notes line belong to that repo, and
the template generalizes them. Its images appear here as their alt text.

## ELI5

When you sort the sidebar manually and group by repo, Orca always forced each repo's primary checkout to the top, even after you dragged something above it. Now, in Manual sort, workspaces stay exactly where you put them. The other sort modes still keep the primary checkout first.

## What Changed

**Before:** With Group by repo + Manual sort, dragging a linked worktree above a primary checkout had no visible effect. Every primary checkout in the section was hoisted above every linked worktree. This was most noticeable when one project has primaries on several hosts.

**After:** In Manual sort, repo sections render in manual-rank order, so primaries and linked worktrees can be interleaved freely. Smart, Recent, Name and Repo sorts are unchanged and still put the primary checkout first.

**Mechanism:** `orderMainWorktreeFirst` (`src/shared/sidebar-list/section-order.ts`) now takes the active sort mode and returns the rows unchanged for `manual`. `planSidebarRows` receives `sortBy` and passes it through. Desktop sidebar, closed-sidebar Cmd+1-9 order, drag planning and the mobile list all reach the hoist through these two shared paths.

## Why

The hoist exists so that automatic sorts, which constantly re-rank rows, don't bury the primary checkout. In Manual sort the user's ranks are the order, and the hoist made the rendered order disagree with the ranks a drag writes. The issue proposed a separate "Keep primary checkouts first" setting. Making Manual sort the opt-out avoids adding a new setting and keeps the rendered order identical to the persisted rank order.

## Linked Issue

Fixes #33599

## Visual Proof

Group by repo + Manual sort. `fix-login` has a higher manual rank than the `main` primary checkout (`fix-login` 30, `main` 20, `docs-refresh` 10).

| Before | After |
| --- | --- |
| Image: main primary checkout forced above fix-login | Image: fix-login above main, following manual rank |

Before, the primary checkout is hoisted above `fix-login` regardless of rank, so dragging `fix-login` above it has no visible effect. After, the section follows the manual ranks. Both captures render the real `WorktreeList` through the component-fixture harness with identical store state. The only difference is the `sortBy === 'manual'` early return.

## Testing

- [x] I manually tested these changes locally
- [x] Automated tests added/updated, or explained why not below

`sidebar-feed-rows.test.ts`: under Manual, a repo section interleaves primaries by rank. Under Recent, the primary stays first.

`twin-reorder.test.ts`: dropping a primary between a non-primary and its twin lands in the dropped slot, with ranked rows and with unranked rows that get ranks assigned on the drop.

`mobile/.../workspace-list-sections.test.ts`: the same Manual interleaving on mobile.

Sidebar goldens regenerated: only the Manual-sort, group-by-repo snapshots change.

`pnpm check:changed` passes (29/29 checks).

Manually tested on macOS: running this build day-to-day with Group by repo + Manual sort. Linked worktrees and primary checkouts stay where they're dragged.

## Risk

**Level:** Low

- Visible change for existing Manual-sort users: primary checkouts that were never dragged no longer pin to the top. They sort by their stored rank, falling back to the legacy saved `sortOrder`, like any other row. That can also change which workspace Cmd+1-9 selects in Manual sort.
- No saved data, settings or protocol shapes change, so older paired phones and SSH servers are unaffected.
- Backing it out is a plain revert.

## AI Disclosure

Implemented with Claude Code (Claude Opus 5.5) and reviewed by the author.

## Review

- [x] Agent skill upstream boundary: Not applicable, or this change copies or mechanically translates no upstream skill-installer source, tests, fixtures, registry entries, path tables, comments, or documentation.

**Notes:** Ensure no issues in: Security, Cross-platform support (Linux, Windows, Mac), Remote SSH, Mobile, general backwards compatibility, performance

## Checklist

- [x] This PR is small and focused
- [x] I explained what changed and why (ELI5, the user-facing before/after, the mechanism, and why over the alternatives)
- [x] I stated the risk: what could break, for whom, and how to back it out
- [x] Before/after screenshots or videos attached for UI changes, or N/A with reason
- [x] Self-reviewed for correctness, security, and performance
- [x] Cross-platform, SSH/remote, and path/shortcut impact considered (or N/A)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass (or CI will cover, local preferred)

🤖 Generated with Claude Code
