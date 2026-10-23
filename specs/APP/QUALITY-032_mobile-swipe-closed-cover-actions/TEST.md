# TEST · QUALITY-032: Mobile swipe closed cover

> Test Plan · how we verify a closed swipe row hides its action circles, and an open row still reveals them on the list fill. References TECH QUALITY-032. There is no PRD; M1–M4 are the Musts in TECH.

## Test strategy

The cover is a pure width on the mobile client, plus a source lock that `SessionSwipeRow` actually clips with it. Bun tests are enough. There is no web Playwright journey and no server change. The mobile app does not boot a signed-in workspace list in CI. `agent-browser` does not drive Expo. Simulator screenshots stay out of git and are not taken in this PR.

- Unit: `bun test` on `apps/mobile/src/ui/primitives/swipe-row-press.test.ts`.
- Service / WebSocket: none.
- End-to-end: none. No mobile list harness in CI.
- Exploratory agent-browser: not applicable (native app).
- Manual: the steps below are for a later Simulator pass. This environment does not run them.

## Coverage map

| TECH item                                          | Scenario IDs |
| -------------------------------------------------- | ------------ |
| M1 closed row covers trailing and leading actions  | S1, S3       |
| M2 open row still reveals circles on the list fill | S2, S4       |
| M3 tap versus pan unchanged                        | S5           |
| M4 lint cap, no evidence in git                    | S6           |

## Execution map

| Scenario | Level    | Expected tool | Target command / method                                 | Fixture / data                                 | Signals                                                                                                                                 | Status |
| -------- | -------- | ------------- | ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1       | Bun test | `bun test`    | `apps/mobile/src/ui/primitives/swipe-row-press.test.ts` | offset `0`, both edges, a positive bay         | both reveals are `0`                                                                                                                    | pass   |
| S2       | Bun test | `bun test`    | same file                                               | left and right offsets, bay wider and narrower | active reveal equals the positive card margin, capped at the bay; the other edge stays `0`                                              | pass   |
| S3       | Bun test | `bun test`    | same file                                               | epsilon boundary, `0` bay, `NaN` offset        | reveal stays `0`; open flag is false at the epsilon                                                                                     | pass   |
| S4       | Bun test | `bun test`    | same file, source read of `session-swipe-row.tsx`       | row source                                     | both bays call `swipeRowActionReveal`; clip is `overflow: "hidden"`; closed fill stays transparent; open fill and transparent well stay | pass   |
| S5       | Bun test | `bun test`    | same file, existing gesture and separator cases         | tap, pan, revealed tap, separator indexes      | `navigate` / `ignore` / `close` unchanged; adjacent separators still hide                                                               | pass   |
| S6       | Review   | `rg`          | root `package.json` script `lint`                       | this branch                                    | `oxlint --max-warnings=455`; no screenshot path added                                                                                   | pass   |

## Scenarios

### S1 — A closed row covers both action bays

- **Level**: Bun test
- **Given**: a row whose offset is `0`, with a positive leading bay and a positive trailing bay.
- **When**: the reveal width is resolved for `"leading"` and `"trailing"`.
- **Then**: both widths are `0`. The circles have no paintable width.
- **Signals**: `swipeRowActionReveal` returns `0` on each edge. `swipeRowIsOpen(0)` is false.

### S2 — An open gap reveals only that edge, on the list fill

- **Level**: Bun test
- **Given**: a left offset and a right offset, each past the closed epsilon, and bay widths both above and below the offset distance.
- **When**: the reveal and `swipeRowCardFrame` are resolved, and `swipeRowOpenChrome(true, colors)` is resolved for light and dark.
- **Then**: the trailing reveal equals `min(positive marginRight, bay)` and the leading reveal is `0` on a left swipe. A right swipe mirrors that. The open card fill is `secondaryBackground`, the well stays `"transparent"`, only the trailing corners are rounded for a left swipe, and `borderWidth` is `0`.
- **Signals**: `swipeRowActionReveal`, `swipeRowCardFrame`, `swipeRowOpenChrome`.

### S3 — A sliver, an empty bay, and a bad offset stay covered

- **Level**: Bun test
- **Given**: an offset at `SWIPE_ROW_CLOSED_EPSILON`, a bay width of `0` or negative, and a non-finite offset.
- **When**: the reveal is resolved.
- **Then**: the width is `0`. `swipeRowIsOpen` is false at the epsilon and true just above it, for both signs.
- **Signals**: `swipeRowActionReveal`, `swipeRowIsOpen`, `SWIPE_ROW_CLOSED_EPSILON`.

### S4 — The row source clips the bays and keeps the open chrome

- **Level**: Bun test
- **Given**: `session-swipe-row.tsx` and the closed chrome helper.
- **When**: the source and `swipeRowOpenChrome(false, lightColors)` are read.
- **Then**: the row calls `swipeRowActionReveal` for `"trailing"` and `"leading"`, the bay clip uses `overflow: "hidden"`, and the resting clip width and opacity are `0`. The closed card fill is `"transparent"` (not `cardElevated`, not the page `background`). The open path still reads `theme.colors.secondaryBackground`. The well is `"transparent"`. The source has no hex color.
- **Signals**: source text, `swipeRowOpenChrome(false)`.

### S5 — Tap versus pan and the separator hide do not move

- **Level**: Bun test
- **Given**: the existing gesture samples and separator indexes from QUALITY-026.
- **When**: those cases run again.
- **Then**: a stationary tap navigates, a pan does not, a tap on an open row only closes it, and an open index hides the separator before that row and the next one.
- **Signals**: `resolveSwipeRowTouch`, `hiddenSwipeSeparatorIndexes`.

### S6 — Lint cap and evidence stay put

- **Level**: Review
- **Given**: the root lint script and the diff.
- **When**: the script and the commit contents are checked.
- **Then**: `oxlint --max-warnings` is still `455`. The diff has no Simulator screenshot and no `EVIDENCE_PUSH`.
- **Signals**: `package.json` `lint` script, `git diff --stat`.

## Performance and load budgets

None. The clip width is one animated style per bay on the row under the finger. No extra network.

## Regression checklist

- [ ] Closed rows show no Archive, Delete, or Pin circle.
- [ ] Section outer corners stay rounded (closed card fill stays transparent).
- [ ] Open row fill is `secondaryBackground`, trailing corners only, well transparent.
- [ ] Separators above and below the open row hide, and come back when it closes.
- [ ] A pan still does not navigate. A tap on an open row only closes it.
- [ ] Root lint script is still `oxlint --max-warnings=455`.
- [ ] No screenshot committed under `apps/mobile` or `specs/`.

## Exploratory agent-browser checks

Not run. The surface is the Expo native app. `agent-browser` has no mobile workspace session here. Record `not_run` in Coverage Status.

## Acceptance criteria

- [x] S1–S5 have a passing bun test named in Coverage Status.
- [x] S6 stays `oxlint --max-warnings=455`, with no evidence files in the diff.
- [x] No new `WsAction` and no REST route.
- [x] `bun --filter @atmos/mobile typecheck` passes.
- [x] Screenshots are not in the commit.

## Manual verification steps

Not run in this PR. A later iOS Simulator pass (signed in, Computer connected) covers the pixels:

1. Open the Workspace tab. On the closed Recently list and a project group, confirm no orange or red circle on any row, and no blue Pin circle on the left. Section corners stay rounded.
2. Left-swipe one workspace row until it settles. Only that row shifts. Its fill is the secondary gray. Only its right corners are rounded. Archive and Delete are circles on the same fill as the rows above and below, not on a separate band. The hairlines directly above and below that row are gone.
3. Close it. The circles disappear and the hairlines return. Tap the closed row with no sideways movement. The workspace opens. Swipe and lift. It does not open.

## Non-coverage

- Pixel comparison against the Simulator (explicitly deferred; this PR does not shoot screenshots).
- A second painted well color. The bay stays unpainted.
- Changing how far the open card bleeds to the screen edge.

## Coverage Status

_Last run: 2026-10-23._

- S1 — ✅ `apps/mobile/src/ui/primitives/swipe-row-press.test.ts` `a closed row covers trailing and leading actions` (offset `0` reveals `0` on both edges; `swipeRowIsOpen(0)` is false).
- S2 — ✅ same file, `an open gap reveals only that edge and matches the card margin`, plus the existing `an open row uses a different fill and leaves the button bay on the list fill` (`secondaryBackground`, transparent well, trailing radius only).
- S3 — ✅ same closed-cover test: epsilon boundary, bay width `0` and negative, `NaN` and `Infinity` offsets all reveal `0`.
- S4 — ✅ same file, `the row source clips closed actions and keeps the open list-fill bay`. Closed `cardBackground` stays `"transparent"`. Source calls `swipeRowActionReveal` for both edges, clips with `overflow: "hidden"`, and rests at width `0` / opacity `0`. No `cardElevated` and no page `background` paint in the row.
- S5 — ✅ same file: `a stationary tap navigates`, `horizontal movement and a finished pan do not navigate`, `a tap on an open row only closes it`, `an open row hides the separators above and below it`.
- S6 — ✅ root `package.json` `lint` is `oxlint --max-warnings=455` (script not in the diff). No screenshot and no `EVIDENCE_PUSH` in the diff.
- Command: `bun test apps/mobile/src/ui/primitives/swipe-row-press.test.ts` — 11 pass, 0 fail, 146 expect() calls.
- `bunx oxlint` on `session-swipe-row.tsx`, `swipe-row-press.ts`, and `swipe-row-press.test.ts` — exit 0.
- `bun --filter @atmos/mobile typecheck` — exit 0.
- Exploratory agent-browser — not_run. Expo native screen; no mobile workspace session for agent-browser.
- iOS Simulator manual steps — not_run. This PR does not shoot screenshots. A later Simulator pass covers the pixels.
