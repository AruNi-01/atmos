# TEST · APP-083: Mobile Token usage UI fixes

> Test Plan · how we verify APP-083. References PRD APP-083 and TECH APP-083.

## Test strategy

Pure layout/geometry, glyph keys, switch seed, and source contracts run as bun tests in `apps/mobile`. Expo UI Host frames, glass capsules, heatmap overlap, and large-title scroll are iOS-simulator visual checks. This environment has no iOS simulator; those rows stay 未运行.

No Playwright. Token usage is Expo native, not web DOM. agent-browser does not cover these controls.

## Coverage map

| PRD item | Scenario IDs |
| -------- | ------------ |
| M1       | S1           |
| M2       | S1           |
| M3       | S1, S2       |
| M4       | S3           |
| M5       | S4           |
| M6       | S5           |
| M7       | S6           |
| M8       | S7           |
| M9       | S8           |
| M10      | S9           |
| N1       | S4           |

## Execution map

| Scenario | Level    | Expected tool | Target command / method                                                          | Fixture / data                        | Signals                                                                       | Status  |
| -------- | -------- | ------------- | -------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| S1       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/publish-sheet.test.ts`      | `ShareSheet.tsx` source               | No outer publish card; GlassPanel + pill fields; stacked stretch Host buttons | planned |
| S2       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/publish-form.test.ts`       | existing publish fixtures             | Primary label Publish/Update; disabled when unchanged                         | planned |
| S3       | Bun test | `bun test`    | `cd apps/mobile && bun test src/ui/primitives/native-switch-tint.test.ts`        | theme color tokens                    | Switch seed is green, not label                                               | planned |
| S4       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/heatmap-layout.test.ts`     | `TokenUsageScreen.tsx` / `charts.tsx` | No card LinearTransition; reserved plot height; empty heatmap keeps height    | planned |
| S5       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/terminal/agent-glyph-tint.test.ts`      | cursor/codex/droid + colorScheme      | `glyphSurfaceKey` changes with scheme; Image uses it                          | planned |
| S6       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/chart-popover-mark.test.ts` | `charts.tsx` source + helper          | Popover agent mark passes series `tintColor`                                  | planned |
| S7       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/chart-press.test.ts`        | bar vs growth open mode               | Bar opens on tap and persists; growth still hold                              | planned |
| S8       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/chart-geometry.test.ts`     | overlay band + first-label gutter     | Overlay leaves x-label band open; crop at plot origin still clips; no inset   | planned |
| S9       | Bun test | `bun test`    | `cd apps/mobile && bun test src/features/token-usage/usage-scroll-reset.test.ts` | `TokenUsageScreen.tsx` source         | No `scrollTo(y:0)`; keep previous overview; reset selectedDate                | planned |
| S10      | Manual   | iOS simulator | Token usage + Share Publish, both themes                                         | two computers, light and dark         | Visual acceptance for M1–M10                                                  | planned |
| S11      | Lint     | oxlint/oxfmt  | `bunx oxlint --fix` and `bunx oxfmt` on touched files; `bun lint` cap 455        | changed paths                         | lint/format clean                                                             | planned |

## Scenarios

### S1 — Publish sheet structure

- **Level**: Bun test (source contract)
- **Given**: `ShareSheet.tsx` Publish pane
- **When**: inspect the source
- **Then**: there is no wrapping `styles.publishCard` GlassPanel; `PrefixedField` uses `GlassPanel` and `radii.pill`; primary and Turn off use `expoUiButtonHostStyle` and `expoUiButtonStretchModifiers`; Turn off is rendered after the primary, not in a `space-between` row; `NativeSwitch` appears once
- **Signals**: `publish-sheet.test.ts`

### S2 — Publish disable rules unchanged

- **Level**: Bun test
- **Given**: APP-082 publish fixtures
- **When**: unchanged live page vs dirty draft
- **Then**: primary disabled / Update vs Publish labels still match `publish-form.ts`
- **Signals**: `publish-form.test.ts`

### S3 — Switch seed

- **Level**: Bun test
- **Given**: light and dark color tokens
- **When**: resolve NativeSwitch seed
- **Then**: seed is `green`, not `label`
- **Signals**: `native-switch-tint.test.ts`

### S4 — Heatmap does not steal the stat grid

- **Level**: Bun test (source + height helper)
- **Given**: heatmap card on Token usage
- **When**: Computer scope changes and values are empty
- **Then**: card has no `LinearTransition`; plot height is reserved; empty heatmap still reports that height
- **Signals**: `heatmap-layout.test.ts`. Simulator overlap is S10.

### S5 — Glyphs follow color scheme

- **Level**: Bun test
- **Given**: Cursor / Codex / Droid light glyphs
- **When**: color scheme goes dark → light
- **Then**: `glyphSurfaceKey` changes; `MobileAgentIcon` passes it to `Image` `key`
- **Signals**: `agent-glyph-tint.test.ts`

### S6 — Popover uses series color

- **Level**: Bun test
- **Given**: stacked chart popover mark helper
- **When**: series color is `#0284C7`
- **Then**: agent mark tint is that color, not `#ffffff`
- **Signals**: `chart-popover-mark.test.ts`

### S7 — Bar tap opens tip

- **Level**: Bun test
- **Given**: growth vs stacked press policy
- **When**: tap vs long-press-end
- **Then**: stacked tap opens and persists; growth tap does not persist; stacked source includes `Gesture.Tap`
- **Signals**: `chart-press.test.ts`

### S8 — First x-axis label band

- **Level**: Bun test
- **Given**: a centred month label at the y-axis overlay edge
- **When**: the overlay covers the label band vs leaves it open
- **Then**: covering clips the label; leaving the band open keeps a 24px-wide centred `"Nov"` fully visible unless the slice is cropped at the plot origin; `placeEnd` of a fitting series is offset 0, not `+inset`
- **Signals**: `chart-geometry.test.ts`

### S9 — Large title on All

- **Level**: Bun test (source contract)
- **Given**: Token usage screen
- **When**: Computer / All identity changes
- **Then**: `selectedDate` clears; the screen does not `scrollTo({ y: 0 })`; the overview hook keeps the previous payload while the next query is pending
- **Signals**: `usage-scroll-reset.test.ts`, `usage-displayed-overview.test.ts`. Simulator large-title is S10.

### S10 — iOS simulator (manual)

- **Level**: Manual
- **Given**: iOS simulator, light and dark, at least two computers
- **When**: exercise Publish, Computer switch, theme switch, bar tap, x-axis, All
- **Then**: M1–M10 hold visually
- **Signals**: 未运行 in this environment

### S11 — Regression gate

- **Level**: Lint / bun test
- **Then**: oxlint cap stays 455; oxfmt on touched files; `cd apps/mobile && bun test` green for new files

## Performance & load budgets

Not a hot path. Heatmap reserved height is one extra empty `View` when a year has no days.

## Regression checklist

- [ ] Share tab (non-Publish) still uses glass social chips.
- [ ] Growth chart still opens its tip on hold and clears on release.
- [ ] Legend glyphs still use page theme, not `onDark`, except the popover.
- [ ] `NativeTextInput` default `framed` remains true outside Publish.
- [ ] oxlint `--max-warnings=455` unchanged.
- [ ] No screenshots or `EVIDENCE_PUSH` in the commit.

## Exploratory agent-browser checks

Not applicable. Native Expo UI. Status: 未运行.

## Acceptance criteria

- [ ] Every Must Have has a scenario.
- [ ] S1–S9 bun tests pass.
- [ ] S10 recorded as 未运行 when no simulator.
- [ ] No new REST / `WsAction`.
- [ ] Touched JS/TS run oxlint + oxfmt.

## Manual verification steps

1. Light mode: Token usage → change Computer / All → heatmap stays below Estimated cost and Total tokens.
2. Share → Publish: no outer card; glass pill fields; full-width Update/Publish; Turn off below when live; Public switch readable in both themes.
3. Dark → light: Cursor / Codex / Droid in legend and top list invert without changing Computer.
4. Tap a bar: popover + vertical line; icons use series colors.
5. Line and bar x-axis: first month fully visible.
6. Dark mode → All: large title is not under the header buttons.

This environment: 未运行.

## Non-coverage

- Real Hub publish round-trip.
- Android device pixels.
- iOS URLSession / SwiftUI Host raster (Host stretch is a source contract plus simulator).

## Coverage Status

- S1 — ✅ `cd apps/mobile && bun test src/features/token-usage/publish-sheet.test.ts`
- S2 — ✅ `cd apps/mobile && bun test src/features/token-usage/publish-form.test.ts`
- S3 — ✅ `cd apps/mobile && bun test src/ui/primitives/native-switch-tint.test.ts`
- S4 — ✅ `cd apps/mobile && bun test src/features/token-usage/heatmap-layout.test.ts`
- S5 — ✅ `cd apps/mobile && bun test src/features/terminal/agent-glyph-tint.test.ts`
- S6 — ✅ `cd apps/mobile && bun test src/features/token-usage/chart-popover-mark.test.ts`
- S7 — ✅ `cd apps/mobile && bun test src/features/token-usage/chart-press.test.ts`
- S8 — ✅ `cd apps/mobile && bun test src/features/token-usage/chart-geometry.test.ts`
- S9 — ✅ `cd apps/mobile && bun test src/features/token-usage/usage-scroll-reset.test.ts src/features/token-usage/usage-displayed-overview.test.ts`
- S10 — 未运行 (this environment has no iOS simulator)
- S11 — ✅ `bunx oxlint --fix` + `bunx oxfmt` on touched paths; `cd apps/mobile && bun test src/features/token-usage src/features/terminal/agent-glyph-tint.test.ts src/ui/primitives/native-switch-tint.test.ts src/ui/primitives/expo-ui-button-modifiers.test.ts` (97 pass)

Regression: `cd apps/mobile && bun test src/features/token-usage` green. iOS simulator visual acceptance remains 未运行.
