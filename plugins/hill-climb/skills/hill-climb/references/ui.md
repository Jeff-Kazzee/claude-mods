# UI climbs

Read this when the work is an interface. The scorer for taste is the council
(`council.md`). The scorer for behavior is the project verify skill. A UI round
needs both.

## Pick the states before round 1

List 3 to 7 representative states from the project's feature map, not from
memory. Good defaults: a long list, a selected item with a long title and a long
identifier, an empty state, an error state, a busy or queued state, and the main
action. Confirm each state exists in the current build before you capture it.
Give each state one line naming the complaint it guards, as Theo's later design
eval does (t3code PR #25968). A state that guards nothing gets cut. Done when
every state has a name, the complaint it guards, a route to reach it, and
fixture data.

Use controlled fixture content. Real conversations, names, and keys stay out of
evidence that a judge or a PR can see.

## Capture settings, frozen for the whole climb

Hold these fixed across baseline, every round, and every reference:

- Window size: the real size Jeff uses, plus one narrow size. Theo found a
  narrow-screen defect only after the climb ended.
- Zoom: 100 percent and one increased zoom (150 percent).
- Theme: light and dark.
- Content: the same fixtures in the same order.
- Settle: wait for fonts, images, and layout to settle. Use a wait-for-state,
  not a sleep.
- Capture method: one tool, named in `frame.md` (the verify skill, browser
  tools, or computer use).

Label every file `<state>-<theme>-<size>-<zoom>-<build>.png`, for example
`thread-list-dark-1440x900-150-a1b2c3d.png`. Keep the clean captures.
Annotations go on copies.

## Behavior checks beside the screenshots

A screenshot supports a visual claim only. Each row below needs its own
evidence, and a failure here blocks the round before the council sees it.

| Concern | Evidence | Pass question |
|---|---|---|
| Hierarchy and density | Matched screenshots with long content | Can you find the task and its state without hunting? |
| Action clarity | Live use of primary and secondary actions | Does the intended action read as an action, and does it work? |
| Truncation | Long titles, names, identifiers | Does the visible part keep the meaningful end? |
| Readability and color | Light and dark captures, contrast numbers | Is text legible, and does meaning survive without color? |
| Keyboard and focus | A keyboard-only run, focus visible in captures | Can the flow finish and focus recover? |
| Layout resilience | Narrow size and 150 percent zoom | Do required controls stay reachable without overlap? |
| State preservation | Navigate, reload, restart | Do drafts, selection, and status behave as specified? |

## Rubric

Default categories, each scored 1 to 10 with one line of reasoning:
hierarchy, typography, iconography, color and contrast, consistency, action
clarity, overall. Give each category one sentence that says what a 9 looks like
in this product. A vague category gets a vague score.

Put Jeff's taste in observable terms. "Too grayscale" becomes "primary actions
and status use color, and meaning survives without it."

## Reference points

References are fixed screenshots of products Jeff considers good, usually
Claude Code and Codex. Theo's scores dropped from 9 to 7.4 the moment
references entered the panel, so add them on the second climb at the latest.

- Capture references once with the same settings and never recapture them
  mid-climb.
- Judges score references every round in the same pass as the work.
- Report reference scores in the round table. Unchanged references drifted up
  by about 0.3 to 0.8 points in Theo's run as the work improved, and two of them
  swapped order. The gap between
  work and reference is the signal. The absolute score is not.

## Exact-match work

When the goal is parity with a known design (a port, a regression, a pixel
spec), the scorer is an image diff against a frozen baseline, not a council. A
nonzero diff fails. Use pstack `visual-parity`.

## Make the change readable

After each kept round, produce a before and after pair from the same state and
settings, plus an annotated copy with one arrow and one line per change. Arrows
explain a difference. They do not prove it helps. Jeff's acceptance includes
using the changed flow himself.

## Search wider when rounds stall

Two rounds in a row with no kept gain means a local optimum. Generate two or
three distinct directions (a layout change, not another radius tweak), score
them in one blinded pass, and continue from the winner. A design sandbox that
produces real variants (Magic Patterns in Theo's video was a sponsor segment)
is one way to get them.
