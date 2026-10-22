# TECH · APP-083: Mobile Token usage UI fixes

> Technical Design · HOW. Implements PRD APP-083. Addresses M1–M10. N1 is best-effort.

## Scope summary

Mobile-only visual fixes on the Token usage screen and Share/Publish sheet. No Hub/Relay/API changes. No new `WsAction`.

```
apps/mobile/src/features/token-usage/*
apps/mobile/src/features/terminal/agent-glyph-tint.ts
apps/mobile/src/features/terminal/MobileAgentIcon.tsx
apps/mobile/src/ui/primitives/native-controls.tsx   # NativeSwitch seed only
```

## Architecture overview

```
ShareSheet PublishPane
  → GlassPanel capsules (fields)
  → NativeSwitch (green seed)
  → Host + Button stretch (primary, then danger)

TokenUsageScreen
  → reserved heatmap height, no card LinearTransition
  → scrollTo(0) on Computer / All change

charts.tsx
  → x-label inset in ChartViewport
  → bar tap + persist tip
  → popover tintColor = series color

MobileAgentIcon
  → remount Image when color scheme / tint changes
```

## Module-by-module design

### Publish (M1–M4)

`ShareSheet.tsx` `PublishPane`:

- Remove the wrapping `GlassPanel` (`styles.publishCard`). Pane children sit on the drawer sheet.
- `PrefixedField` wraps prefix + `NativeTextInput framed={false}` in `GlassPanel` with `borderRadius: radii.pill` and `shadow={false}`. Do not draw a second control border.
- Primary: `expoUiPrimaryStyle` + `expoUiButtonHostStyle` + `expoUiButtonStretchModifiers`. `variant="filled"`. Label `Publish` / `Update` / pending copy from APP-082. Full width, min height 52. Never `variant="text"` and never `matchContents` without a stretch frame.
- Turn off: only when live; **below** the primary; `expoUiDangerStyle` + the same stretch Host. Not a trailing compact control.
- `publishActions` is a vertical stack (`gap`, `width: "100%"`), not `space-between` row.
- Public `NativeSwitch` stays the only switch.

Root cause of the collapsed pill: review commit `ff71b646e` put Expo UI `Host` around `Button` with `matchContents={{ vertical: true }}` and `style={{ height: 40 }}` but no host width. SwiftUI Host then sized to an empty control. `variant="text"` Turn off often laid out with zero width. Disabled `seedColor={tertiaryLabel}` on that collapsed host read as a black/white block.

### Public switch (M4)

`NativeSwitch` today sets `seedColor={theme.colors.label}`. In dark mode that is `#f5f5f7`, so the on-track and thumb both go light.

Change the seed to `theme.colors.green` (iOS-like on-track). `colorScheme` on `Host` still drives off-track / thumb contrast. Optional helper `nativeSwitchSeedColor` if a unit test should lock the token.

### Heatmap overlap (M5)

`TokenUsageScreen` wraps the year card in `Animated.View` with `layout={LinearTransition}`. Switching Computer rebuilds `weeks` (and often drops the card to empty while the scoped query is pending). Reanimated keeps the previous transformed frame; in light mode that frame sits over the bottom stat cards and does not settle.

Fixes:

- Stop using `LinearTransition` on the heatmap **card**.
- Export `HEATMAP_PLOT_HEIGHT` from `charts.tsx` and give the card / plot a reserved min height so an empty year does not collapse.
- `UsageHeatmap` should render a sized empty slot instead of `return null` when there are no values.
- Reset `selectedDate` when Computer / All changes.

Keep day-detail `entering` / `exiting` (N1) if they stay on the detail panel only.

### Glyph theme (M6)

`glyphTint` already depends on `theme.isDark`. RN `Image` `tintColor` does not always apply when the source asset is unchanged.

Add `glyphSurfaceKey(colorScheme, tint)` and set it as the `Image` `key` in `MobileAgentIcon` so Cursor / Codex / Droid remount on theme change without waiting for a Computer switch.

### Popover colors (M7)

`seriesMark` currently uses `MobileAgentIcon onDark` with no `tintColor`, so light glyphs stay white on the dark bubble.

Pass `tintColor={seriesColor}` (the stacked series color). `UsageModelIcon` already takes `color`; keep that as the provider color. Do not force `#ffffff` for popover marks.

### Bar tap (M8)

`useHoldScroll` pan uses `activateAfterLongPress(260)`. That is correct for the growth chart (hold to preview, release to hide).

For `UsageStackedChart`:

- Add `Gesture.Tap()` (`maxDistance` small enough not to steal horizontal scroll).
- Persist the tip on release (tap and long-press scrub). Series change still clears it.
- Horizontal scroll (`onScrollBeginDrag`) clears a persisted stacked tip so the indicator does not sit on a different bar.
- Keep `columnIndicatorLine` / `columnIndicatorColor` while the tip is open.

### X-axis clip (M9)

`ChartViewport` pins a y-axis overlay of width `axisWidth` and shifts scroll content by `-axisWidth`. The first x label is centered on the first point at that edge; half of `"Nov"` / `"Feb"` is clipped (`"No"`, `"eb"`).

Inset scroll content by `CHART_X_LABEL_INSET` (~20pt): content `marginLeft = -(axisWidth - inset)` so the first label sits fully inside the scroll view. Hide y-axis labels on the **scrolling** growth chart (`showYAxisLabels={false}`) so ticks are not duplicated in the inset. Overlay width stays `axisWidth`. Gesture `chartX` subtracts the same inset so hit-testing still matches. `placeEnd` uses `scrollEndOffset` (`contentWidth - viewport + inset`) so the last point lands in the viewport.

Helpers live in a small `chart-geometry.ts` (or equivalent) with bun tests.

### Large title (M10)

Switching to All swaps `activeQuery`; `overview` becomes null then a taller page. iOS large title + `contentInsetAdjustmentBehavior="automatic"` can keep a stale offset so the title sits under `unstable_headerLeftItems`.

<!-- updated 2026-10-22: reset selectedDate during render to avoid setState-in-effect -->

On Computer / All identity change (`selectedKey`), reset `selectedDate` during render (previous-key state, not an effect) and `scrollTo({ y: 0, animated: false })` on `usageScrollRef`. Do not remount the `Stack.Screen` header while the sheet is closed.

## Data model

No new types on the wire. Local helpers only:

```ts
function glyphSurfaceKey(colorScheme: string, tint: string | undefined): string;
function chartXFromGesture(eventX: number, offset: number, labelInset: number): number;
function scrollContentShift(axisWidth: number, inset: number): number;
```

## Transport

None. Publish still uses `hubGetUsagePage` / `hubPutUsagePage` / `hubDeleteUsagePage`. Usage still uses `token_usage_overview_get`.

## Security & permissions

Unchanged. No new secrets. Do not commit screenshots that include handles or usage numbers.

## Rollout plan

1. Spec APP-083 + README inventory.
2. Publish sheet layout + NativeSwitch seed + bun source/unit tests.
3. Heatmap reserved height, drop card layout animation, reset selection/scroll.
4. Glyph remount key + popover series tint.
5. Bar tap persist + x-axis inset helpers.
6. Lint/format on touched files; mobile bun tests.

## Risks & tradeoffs

- **Risk**: disabled filled primary with `tertiaryLabel` seed is still low-contrast on device. Prefer the shared `expoUiPrimaryStyle(..., disabled)` rather than custom paint.
- **Tradeoff**: dropped heatmap card `LinearTransition` (M5) over keeping the expand animation (N1).
- **Tradeoff**: `NativeSwitch` green seed is app-wide (Create Workspace / model sheet included). Same iOS convention; call it out in the PR.
- **Rollback**: revert this branch; APP-082 data code is untouched.

## Dependencies & compatibility

- Depends on: APP-082.
- Blocks: none.
- Minimum Atmos version: current mobile main.
- External: none.

## Open questions

- None. iOS simulator sign-off is the user’s follow-up (未运行 here).
