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
  → keep previous overview on Computer / All change; do not scrollTo(y:0)

charts.tsx
  → y-axis overlay stops above the x-label band (bars)
  → growth y-axis sits beside the plot (`axisPlacement="start"`)
  → windowed slices keep the y-axis column (no -PLOT_X crop)
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
- Primary: `expoUiPrimaryStyle` + Host `style={expoUiButtonHostStyle}` (width 100%) + Button `modifiers={expoUiButtonStretchModifiersFor("filled")}` + iOS SwiftUI `Text` child with `expoUiButtonLabelStretchModifiers`. `variant="filled"`. Label `Publish` / `Update` / pending copy from APP-082. Full width, min height 52. Never `variant="text"` and never `matchContents` without a stretch frame. `frame.maxWidth` must be a JSON-safe finite number (`EXPO_UI_FRAME_INFINITY`); `Number.POSITIVE_INFINITY` becomes `null` on the RN bridge. A Button-level `frame(maxWidth:)` only sizes the Host slot; filled `borderedProminent` sizes chrome to the label, so Update/Publish stayed a short centered capsule while outlined Turn off already painted the slot. Frame the label (`Text` + `maxWidth`), put `fixedSize(horizontal: false)` then `buttonStyle` last, and do not pass `style.height` (Expo `FrameModifier` ignores `maxWidth` when `height` is set).
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
- Persist the tip on release (tap and long-press scrub). Clear it when Computer / All (`resetKey={usageScopeKey}`) or the series values change via `chartTipResetSignature`. Do not key the reset only on bar count / first-last labels / peak — two Computers can share that shape. Independent of persist-on-release.
- Horizontal scroll (`onScrollBeginDrag`) clears a persisted stacked tip so the indicator does not sit on a different bar.
- Keep `columnIndicatorLine` / `columnIndicatorColor` while the tip is open. Indicator x is the bar centre in host coordinates (`columnIndicatorHostX`), not the slot boundary between months.

### X-axis clip (M9)

Chart-kit x labels use `textAnchor: "middle"` at the data-point x (plot origin ≈ overlay right edge). Three things stacked to clip `"Nov"` / `"Feb"` to `"No"` / `"eb"`:

1. Label anchor / `textAlign` center at the first plot x.
2. Clipping container: the windowed growth slice used `left: span*gap + PLOT_X` and `marginLeft: -PLOT_X`, so the first label sat at wrapper x=0. iOS clips that overflow even with `overflow: "visible"`. The full-height y-axis overlay then painted over the remaining gutter.
3. Scroll content offset: `CHART_X_LABEL_INSET` plus `placeEnd(... + inset)` cancelled itself (fitting series lands at offset `+inset`, first label back on the overlay edge).

Bar charts keep that overlay (plot only). The growth chart cannot: `placeEnd` puts Nov/Dec under the y-axis while the visible polyline starts at January, so those labels sit in the open gutter (`"v"` / `"Dec"` left of Jan) and `edgeLabelPolicy="shift"` pulls them off their points.

Growth fix: pin the y-axis beside the plot (`axisPlacement="start"`), scroll only the plot (`yAxisLabelWidth={0}`, `edgeLabelPolicy="show"`), and mask the axis column's x-label band. `placeEnd` uses the plot viewport (`width - axisWidth`). Windowed slices still use `windowedSliceFrame` with no `-PLOT_X` crop.

Helpers live in `chart-geometry.ts` with bun tests.

### Large title (M10)

Switching Computer / All swaps `activeQuery`. `overview = activeQuery.data ?? null` flashes zeros and shrinks the page. `scrollTo({ y: 0 })` on that identity change is the compact-header origin under iOS large title + `contentInsetAdjustmentBehavior="automatic"`, so the large title collapses (~300pt).

On Computer / All identity change (`selectedKey`), reset `selectedDate` during render (previous-key state, not an effect). Do **not** `scrollTo({ y: 0 })`. Keep the previous overview for **display** while the next query is pending (`displayedOverview`). Drop that fallback when the active query fails. Pass only `publishOverview(activeQuery.data)` into `ShareSheet` so Publish cannot snapshot another Computer. Do not remount the `Stack.Screen` header while the sheet is closed. Pinch `onBegin` always calls `onRelease()` so a persisted stacked tip does not ride the zoom. `RefreshControl.refreshing` is only the explicit pull mutation (`usageRefreshControlRefreshing`); `isRefetching` / `isFetching` must not shove the page down on a Computer / All switch.

## Data model

No new types on the wire. Local helpers only:

```ts
function glyphSurfaceKey(colorScheme: string, tint: string | undefined): string;
function chartXFromGesture(eventX: number, offset: number): number;
function overlayPlotHeight(chartHeight: number, labelBand: number): number;
function windowedSliceFrame(
  spanStart: number,
  step: number,
  drawnWidth: number,
): { left: number; width: number };
function growthPointHostX(input: {
  axisWidth: number;
  index: number;
  offset: number;
  plotLeft: number;
  step: number;
}): number;
function usageRefreshControlRefreshing(input: { pullPending: boolean }): boolean;
function displayedOverview<T>(input: {
  active: T | null | undefined;
  failed: boolean;
  pending: boolean;
  previous: T | null;
}): T | null;
function publishOverview<T>(active: T | null | undefined): T | null;
function chartTipResetSignature(input: {
  labels: readonly string[];
  resetKey?: string;
  values: readonly number[];
}): string;
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

## Post-implementation update (M9 follow-up)

On `5a199bed` the growth chart still clipped the first month to `"n"`: chart-kit `textAnchor: "middle"` at the first point overflows left, and iOS UIView clips that overflow. Opening the bar overlay label band made `"Jan"` readable but parked it in the y-axis gutter; the first visible bar was February.

Follow-up: hide chart-kit x labels and draw them from `chart-geometry.ts`. Growth uses a dummy `yAxisLabelWidth` pad so the first centred label sits fully inside the plot (iOS UIView clips overflow). If that pad is missing, `growthLabelAlign(0)` falls back to start-align. Both charts use `axisPlacement="start"`. Bar labels use `barLabelX` = bar centre for every index, including 0.

## Post-implementation update · 2026-10-25 (M8 reversal)

`STACKED_CHART_TIP` is `"hold"`, the same policy as the growth chart. Press and hold opens the stacked popover and vertical line; releasing the press clears both. A tap does not leave the tip open. Scope and series-value resets via `chartTipResetSignature` stay.

## Post-implementation update · 2026-10-25 (M4 reversal)

`NativeSwitch` no longer sets `seedColor`. React Native switches no longer set `trackColor` or `thumbColor`. `colorScheme` on the Host stays, so the system switch uses its own light or dark appearance. The green-seed helper is gone.
