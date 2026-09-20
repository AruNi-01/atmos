# TEST · APP-077: Mobile Terminal Main Path

> Test Plan · flatten/sort rules, overlay split, and remaining main-path screens.

## Test strategy

- **Unit**: flatten/sort and candidate merge (do not collapse distinct ids).
- **Typecheck**: `bun --filter @atmos/mobile typecheck`.
- **Existing mobile tests**: keep computer-selection, create-workspace-readiness, workspace-picker-groups, terminal shortcuts/batcher/WS clients; drop git/import/settings suites deleted with those screens.
- **Manual / simulator**: overlay split and keyboard shortcut bar cannot be fully proven in bun tests.

## Coverage map

| PRD | Scenario |
|-----|----------|
| M1 | S1 |
| M2 | S2 |
| M3 | S3 |
| M4 | S4 |
| M5 | S5 |
| M6, M7 | S6 |
| M8 | S7 |
| M9 | S8 |
| M10, M12 | S9 |
| M11 | S10 |
| M13 | S11 |
| M14 | S12 |

## Execution map

| ID | Level | Command / method | Status |
|----|-------|------------------|--------|
| S6 | unit | `bun --filter @atmos/mobile test src/features/terminal/terminal-selection.test.ts` | pass |
| S1–S5, S7–S12 | typecheck + remaining bun tests | `bun --filter @atmos/mobile typecheck` / `bun --filter @atmos/mobile test` | pass (unit/typecheck); overlay split still manual |
| Overlay split | manual | iOS: group = BottomSheet; Ctrl/workspace = `expo-ios-popover` | pending |

## Scenarios

### S1 Homepage kept

Given a connected session, When the user opens the app, Then the welcome homepage with recent workspaces is shown (not a settings stack).

### S2 Auth kept

Given no device credential, When the user opens home, Then scan/OAuth connect UI is shown. Sign-in sheet still pairs via QR/OAuth.

### S3 Computers

Given credentials, When the user opens Computer Connect, Then online Computers can be selected and create a mobile client session.

### S4 Workspaces

Given an open session, When the user browses workspaces, Then projects group workspaces, opening one pushes `/workspace/:id`, and New Workspace remains.

### S5 Deleted surfaces

Given the rebuilt app, When navigating routes, Then `/settings`, `/import-project`, `/onboarding`, Changes, and Overview are gone.

### S6 Flattened tabs

Given candidates with distinct ids (including two windows under one tab), When merge/sort runs, Then both appear as siblings ordered by tmux index then label. Distinct ids are not collapsed by shared window name.

### S7 Create terminal

Given a workspace terminal, When plus is pressed, Then a new local entry is appended and selected.

### S8 Group drawer

Given several terminals, When the group button is pressed, Then an Expo `BottomSheet` lists the same order and selecting a row switches the renderer.

### S9 Popovers

Given workspace chrome or shortcut Ctrl/Move/Agent, When the trigger is pressed, Then a popover (not a BottomSheet) lists actions. Workspace switcher lists workspaces and can jump.

### S10 Shortcut bar

Given the keyboard, When shortcuts fire, Then sequences reach `terminal_input` and Paste uses clipboard.

### S11 Sign out

Given the homepage account popover, When Sign out is confirmed, Then Hub device revoke runs and the user returns to auth home.

### S12 Disconnect

Given Relay/WS closed, Then input is refused and a disconnected banner/status is visible.

## Non-coverage

- Physical IME / Liquid Glass feel.
- Live Relay terminal stream against production.

## Coverage Status

- **S6** flatten/sort: `bun --filter @atmos/mobile test src/features/terminal/terminal-selection.test.ts` — pass (distinct ids kept; sort by index/label/id; new locals append).
- **S1–S5, S7–S12** remaining bun tests + typecheck: `bun --filter @atmos/mobile typecheck` pass; `bun --filter @atmos/mobile test` 52 pass / 0 fail (git/import/settings suites removed with those screens).
- **Overlay split**: pending simulator — group list is `ExpoDrawer` (`@expo/ui` BottomSheet); account / workspace / Ctrl / Move / Agent are `IosPopover` (`expo-ios-popover` on iOS, RN modal on Android).
