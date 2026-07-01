# TEST · APP-028: Runtime Workbench i18n

> Test Plan · how we verify in-place workbench language switching. References PRD APP-028 and TECH APP-028.

## Test strategy

- Unit / integration: cover locale store/provider persistence and message selection.
- End-to-end: cover the visible Web workbench switch path.
- Desktop smoke: verify the shared web bundle behaves correctly in Tauri.
- Exploratory agent-browser: check visual stability and obvious console/network failures.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1 |
| M2 | S1, S2 |
| M3 | S3 |
| M4 | S4 |
| M5 | S5 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | E2E | Playwright | `just test-e2e-smoke` or spec test under `e2e/tests/specs/` | open workspace route with query params | UI copy changes; pathname/query unchanged | planned |
| S2 | E2E / agent-browser | Playwright + agent-browser | TBD by test-run | open workspace with visible sidebars | header, sidebars, center, footer remain visible | planned |
| S3 | Unit / E2E | `bun test` / Playwright | TBD by test-run | selected locale in local storage | reload restores selected language | planned |
| S4 | Manual/Desktop smoke | `just dev-desktop` | manual Desktop check | Tauri desktop app | no black/blank shell after language switch | planned |
| S5 | Static review / smoke | build + route smoke | TBD by test-run | Landing/Docs routes | Landing/Docs unaffected | planned |

## Scenarios

### S1 — Workbench language switch does not navigate

- **Level**: E2E
- **Given**: a workbench route such as `/workspace?id=...` is open.
- **When**: the user switches from English to Chinese in the header menu.
- **Then**: visible UI copy changes language and `window.location.pathname + search` stays unchanged.
- **Signals**: no route change, no lost query params, translated header/menu text visible.

### S2 — Shell remains mounted and visible

- **Level**: E2E / agent-browser
- **Given**: a workspace with left sidebar, center area, right sidebar, and footer visible.
- **When**: the language is switched repeatedly.
- **Then**: no black/blank app shell area appears and workspace context remains active.
- **Signals**: key shell landmarks remain visible; no unhandled console error.

### S3 — Locale persists across reload

- **Level**: Unit / E2E
- **Given**: the user selects Chinese.
- **When**: the workbench reloads.
- **Then**: Chinese is restored without requiring a locale-prefixed route.
- **Signals**: storage key is set; provider initializes with the stored locale.

### S4 — Desktop inherits web behavior

- **Level**: Manual/Desktop smoke
- **Given**: the Desktop app is running from the web bundle.
- **When**: the user switches language in a workspace.
- **Then**: Desktop updates copy in place and does not show the partial black-screen state.
- **Signals**: same workspace remains open; no full shell blanking.

### S5 — Landing and Docs remain unchanged

- **Level**: Smoke / static review
- **Given**: Landing and Docs are outside this workbench migration.
- **When**: the workbench runtime i18n changes land.
- **Then**: Landing and Docs i18n routing continues to build and render as before.
- **Signals**: build passes; no code changes required in `apps/landing` or `apps/docs`.

## Regression checklist

- [ ] Language switch does not call `router.replace`.
- [ ] WebSocket connection is not intentionally reset by language switch.
- [ ] Workspace/project query parameters are not rewritten.
- [ ] Desktop static build still passes.
- [ ] Landing and Docs remain untouched.

## Exploratory agent-browser checks

1. Open the local workbench route and switch language from the header.
2. Repeat switch several times and watch for black areas, clipped text, or missing shell regions.
3. Check console/network panels for obvious errors or reconnect churn.

## Acceptance criteria

- [ ] All Must Have PRD items have planned and executed coverage.
- [ ] Workbench language switch updates text without route navigation.
- [ ] Desktop no longer reproduces the black/blank shell state from language switching.
- [ ] `bun --filter web typecheck` passes.
- [ ] `BUILD_TARGET=desktop bun --filter web build` passes.

## Manual verification steps

1. Start the web workbench, open a workspace, switch language, and confirm route/query stability.
2. Start Desktop, open a workspace, switch language, and confirm the full shell stays visible.

## Non-coverage

- No mobile i18n coverage in this spec.
- No compatibility testing for old `/zh/workspace` links.

## Coverage Status

Not run yet. This spec only defines the plan.
