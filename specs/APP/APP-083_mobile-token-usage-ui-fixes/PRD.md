# PRD · APP-083: Mobile Token usage UI fixes

> Product Requirements · WHAT and WHY. Repair Token usage visuals that APP-082 shipped on mobile.

## Context

- **Problem**: After APP-082, Publish controls are unusable, light-mode heatmap overlap does not recover after a Computer switch, some agent glyphs stay light after a dark→light theme change, bar popovers only open on long press, x-axis month labels clip, and switching to All in dark mode can slide the large title under the header buttons.
- **Why now**: These are regressions on `main` from `#349` (`1e253cc3`), found on the iOS simulator.
- **Related specs**: `APP-082_mobile-token-usage` (feature). This spec does not add Computer scope or new transports.

## Goals

1. Primary — a person can publish, read the year heatmap, and read charts in light and dark after changing Computer, All, or theme.
2. Secondary — APP-082 fetch/merge/publish rules stay as they are.

## Users & Scenarios

- **Primary persona**: someone already on mobile Token usage (APP-082).
- **Key scenarios**:
  - Open Share → Publish and turn a page on or off.
  - Switch Computer / All in light mode and still see Estimated cost / Total tokens.
  - Switch the app from dark to light and still read Cursor / Codex / Droid marks.
  - Tap a bar to read the stack; read the first month on the x-axis.

## User Stories

- As a workspace owner, I want Publish actions I can read and tap, so that I can update or turn off a public page.
- As a workspace owner, I want the year heatmap to stay below the stat cards after I change Computer, so that cost and token totals stay visible.
- As a workspace owner, I want agent marks to follow the current theme, so that the distribution list and legend stay readable.
- As a workspace owner, I want a tap on a bar to open the same popover as a long press, so that I can inspect a month without waiting.

## Functional Requirements

### Must Have

- **M1 Publish sheet chrome**: No outer rounded bordered card around Handle / Links / Public. Fields sit on the sheet background.
- **M2 Publish inputs**: Handle, X, and GitHub use the app glass primitive (`GlassPanel` / liquid glass) with capsule/pill corners in light and dark.
- **M3 Publish actions**: One full-width primary button labeled `Publish` or `Update`. It never looks like a switch or an empty pill. Disabled Update is greyed out but still readable. `Turn off` is a full-width secondary/danger control **below** the primary, visible whenever the page is live. Public is the only switch.
- **M4 Public switch**: Track and thumb stay distinct in both themes so on vs off is obvious.
- **M5 Heatmap overlap**: After switching Computer (All or a single computer) in light mode, the year heatmap must not overlap Estimated cost or Total tokens, and must recover without a remount of the app.
- **M6 Glyph theme**: Cursor, Codex, and Droid marks in the legend and the top distribution list follow the active color scheme immediately. They must not wait for a Computer switch.
- **M7 Chart popover marks**: Popover icons use each series / provider color. They are not all plain white.
- **M8 Bar tap**: A single tap on the stacked bar chart opens the popover and keeps the vertical indicator. Long-press scrub may remain.
- **M9 X-axis clip**: The first month label on the line chart and the bar chart is fully readable (not `"No"` / `"eb"`).
- **M10 Large title**: In dark mode, switching to All must not slide the `Token usage` title under the top header buttons.

### Nice to Have

- **N1** Keep the heatmap day-detail enter/exit animation if it does not reintroduce M5.

## Out of Scope

- **New transports** — no REST, no new `WsAction`.
- **Publish business rules** — handle charset, dirty/disabled logic, Hub put/delete stay APP-082.
- **i18n** — this screen stays hardcoded English.
- **Android pixel QA** — required behavior is shared; this environment does not run an Android device.
- **Share-tab screenshot layout** — unchanged except Publish.

## Success Metrics

- Leading: M1–M10 have bun tests where the rule is pure or a source contract; remaining items are listed as 未运行 when this environment cannot run the iOS simulator.
- Qualitative: Publish has one switch and two stacked full-width buttons a reviewer can name without zooming.

## Risks & Open Questions

- **Risk**: Expo UI `Host` without an explicit stretch frame collapses again. TECH must name the stretch helpers.
- **Risk**: Removing heatmap `LinearTransition` makes day-detail height jump (N1).
- **Open**: none blocking implementation.

## Milestones

- Phase 1 — M1–M4 Publish.
- Phase 2 — M5–M10 heatmap, glyphs, charts, scroll.

## Post-implementation update · 2026-10-25

M8 is reversed. The stacked bar chart matches the area chart: press and hold shows the popover and vertical line; releasing the press clears both. A tap does not leave the popover open.
