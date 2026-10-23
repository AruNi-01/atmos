# TECH · QUALITY-032: Mobile swipe closed cover

> Technical Design · HOW. Closed `SessionSwipeRow` rows must hide their circular actions until that row is swiped. No BRAINSTORM or PRD: the behavior is fixed by the follow-up to QUALITY-026 / #358.

## Spec id

`QUALITY-032`. `QUALITY-028` and `QUALITY-031` are already taken. This directory is the next free id.

## Scope summary

Addresses the closed-state leak left by [QUALITY-026](../QUALITY-026_mobile-workspace-swipe-rows/TECH.md) (shipped in #358).

On current `main`, every closed Workspace row paints orange Archive and red Delete circles on the right. A left swipe still opens that row (secondary fill, trailing corners, list-fill button bay), but the closed rows around it keep showing the same circles. Engineering confirmed that closed-state leak is the bug.

Musts:

- **M1.** A closed row covers trailing Archive and Delete, and the leading Pin. The list looks like a normal grouped list. No action circle is visible.
- **M2.** A left swipe still moves only that row. Archive and Delete are circular, on the section's existing list fill (the bay is not a painted well). The open row uses `secondaryBackground`, rounds only the trailing corners, and the separators directly above and below that row hide while it is open.
- **M3.** Tap versus pan, and one open row at a time, stay as they are unless a cover fix forces a change. This fix does not.
- **M4.** No new transport, no lint-cap change, no screenshot or `EVIDENCE_PUSH` in the repo.

Out of scope:

- Reworking the open trailing cap, the screen-edge bleed, or the gesture classifier.
- Web sidebar rows.
- iOS Simulator captures in this PR (a later pass shoots those).
- Highlights / pele, and any unrelated list refactor.

## Architecture

```
WorkspaceHomeList / WorkspaceEntryScreen / SessionRowList
  └─ Section clip={false}          overflow visible, borderRadius 24, fill cardElevated
       └─ SessionSwipeRow          overflow visible so the open card can meet the screen
            ├─ leading bay         clipped to swipeRowActionReveal(..., "leading")
            ├─ trailing bay        clipped to swipeRowActionReveal(..., "trailing")
            └─ card                 closed fill stays transparent; open fill secondaryBackground
```

No server, WebSocket, or store change. The same row primitive is what the Workspace home, the workspace session list, and the Session inbox mount.

## What is wrong

`session-swipe-row.tsx` draws the action circles in an absolute layer under the card. The card's closed `backgroundColor` is `"transparent"` (`swipeRowOpenChrome` sets `cardBackground: "transparent"`). `Row` does not paint its own fill, so the circles show wherever the title and avatar do not cover them. That is the right side of every row.

The parent is `overflow: "visible"` on purpose. `Section` passes `clip={false}` for the same reason: the open card's `marginLeft` goes to `-spacing.screenX` so the leading edge can sit on the screen. React Native 0.85 does not clip those children to the section's `borderRadius` while overflow is visible (`RCTView.clipsToBounds` is off; Fabric `getClipsContentToBounds()` is false when overflow is `Visible`).

## Decision

### D1. Clip the bays. Do not paint an opaque closed card.

An opaque closed fill of `cardElevated` would cover the circles, and it matches the section color in the middle of the card. It would also paint the section's outer corners square, because the closed card is a rectangle and the section does not clip. Light mode would show white squares on the page (`#f4f4f6`). Dark mode would show `#2c2c2e` squares on black. QUALITY-026 left the closed fill transparent so those corners stay the section's.

The closed fill stays `"transparent"`. Each action bay is a clip view:

- Trailing clip is anchored to the row's right edge. Its width is `swipeRowActionReveal(offset, trailingWidth, "trailing")`.
- Leading clip is anchored to the row's left edge. Its width is `swipeRowActionReveal(offset, leadingWidth, "leading")`.
- Both views set `overflow: "hidden"`. The button row inside is still the full bay width, anchored to the same edge, so a partial swipe uncovers the circles from that edge. That is the same gap `swipeRowCardFrame` opens (`marginRight` when it is positive, `marginLeft` when it is positive).
- Width and opacity start at `0`. Opacity stays `0` while the reveal width is `0`, so a clip miss at rest still hides the circles.
- Reveal is `0` when the opened distance is at or under `SWIPE_ROW_CLOSED_EPSILON` (`0.5`), when the bay width is not positive, or when `offset` is not finite. Above that, it is `min(openedDistance, bayWidth)`.
- `swipeRowIsOpen` uses the same epsilon for the open fill and for `onRevealedChange` (the separator hide). Gesture code does not read it.

The button bay still paints nothing (`wellBackground: "transparent"`). Open circles sit on the section's `cardElevated`, which is the list fill from #358, not a page-colored band and not a second well.

### D2. Gesture and open chrome stay

`resolveSwipeRowTouch`, `Gesture.Exclusive`, the snap targets, `hiddenSwipeSeparatorIndexes`, `secondaryBackground`, trailing-only radius, and `borderWidth: 0` are unchanged. `useOpenSwipeRows` is still what keeps the separator set. Full-swipe still does not fire the action.

## Files

| File                                                        | Change                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/mobile/src/ui/primitives/swipe-row-press.ts`          | `SWIPE_ROW_CLOSED_EPSILON`, `swipeRowIsOpen`, `swipeRowActionReveal` |
| `apps/mobile/src/ui/primitives/swipe-row-press.test.ts`     | Closed cover, gap invariant, source wiring                           |
| `apps/mobile/src/ui/primitives/session-swipe-row.tsx`       | Clip both bays; closed card fill stays transparent                   |
| `specs/APP/QUALITY-026_mobile-workspace-swipe-rows/TECH.md` | One follow-up line pointing here                                     |
| `specs/README.md`                                           | Index row                                                            |

No call-site change. `WorkspaceHomeList`, `WorkspaceEntryScreen`, and `session-row-list.tsx` already mount `SessionSwipeRow`.

## Data model

No schema, store, or DTO. The new helpers are pure and are worklets so the clip width tracks the finger on the UI thread:

```ts
const SWIPE_ROW_CLOSED_EPSILON = 0.5;

function swipeRowIsOpen(offset: number): boolean;

function swipeRowActionReveal(
  offset: number,
  bayWidth: number,
  edge: "leading" | "trailing",
): number;
```

## Transport

None. No new `WsAction`, REST route, or client request.

## Security and permissions

No new data. Action handlers are the existing archive, delete, and pin callbacks. A closed bay has `pointerEvents="none"` and is omitted from the accessibility tree, which was already true and stays true.

## Rollout

1. Land this spec and the README row.
2. Add the helpers and bun tests, then clip the two bays in `SessionSwipeRow`.
3. Run the swipe bun test and `bun --filter @atmos/mobile typecheck`. Leave `oxlint --max-warnings` at 455.
4. Do not capture or commit Simulator screenshots in this PR.

## Risks and tradeoffs

- **Tradeoff:** The closed card stays transparent instead of taking an opaque `cardElevated` fill. The opaque fill was the obvious cover, and it loses the section corner radius under `overflow: "visible"`. Clipping the bays covers the circles without that regression.
- **Risk:** A platform that ignores `overflow: "hidden"` could still paint a bay that has a non-zero width. At rest the width and the opacity are both `0`, so the closed list stays covered even then. The open slice still grows with `offset`.
- **Risk:** The reveal and the card gap share `0.5` px. A gap at or under that threshold shows list fill, not a circle. The open fill uses the same threshold, so the row does not turn secondary while the circles are still clipped.
- **Rollback:** Revert the mobile swipe commit. No migration.

## Dependencies and compatibility

- Depends on QUALITY-026's shared `SessionSwipeRow` and on `Section clip={false}`.
- Does not block another spec.
- iOS and Android share the row. This PR does not add the `ios-parity` label.

## Open questions

None. The cover is the clipped bay, not a new closed fill color.
