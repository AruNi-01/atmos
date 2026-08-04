# TEST · APP-053: Desktop Browser via Electron `<webview>`

## Test strategy

| Level | Why |
|-------|-----|
| Unit pure policy | attach allow/deny, forced prefs, preload file URL |
| Unit events | atmos-browser → desktop-browser remap + gate |
| Unit/web structural | host SelectionPopover for desktop; no occlusion module; rename grep |
| Quality | typecheck, bun test, lint |
| Evidence | desktop launch if possible else unavailability log |

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 webview | S1–S2 |
| M2 no APP-029 hide | S3 |
| M3 attach security | S5–S7 |
| M4 no reparent | S8 |
| M5 host selection | S9–S10 |
| M6 outside-dismiss | S11 |
| M7 pointer-events | S12 |
| M8 capabilities | S13–S18 |
| M9 rename | S19 |
| M10 compensation gone | S3, S20 |

## Execution map

| Id | Level | Target | Status |
|----|-------|--------|--------|
| S5–S7 | bun test | webview-attach-policy | pending |
| S9–S10 | structural/unit | BrowserViewport + inject showSelectionToolbar false | pending |
| S19 | grep | product trees | pending |
| S1 | structural | no addChildView WebContentsView in-panel | pending |
| S3/S20 | structural | occlusion deleted; no bounds sync path | pending |
| S13–S18 | unit/structural | matrix | pending |
| Q* | gates | typecheck / bun test / lint | pending |

## Scenarios (selected)

### S5 Allow attach
Given registered pending session + `persist:atmos-browser` + https src → evaluate allows.

### S6 Deny attach
Wrong partition / javascript src / empty registry → deny.

### S7 Forced prefs
nodeIntegration true → forced false + sandbox true.

### S9 Host selection
Desktop transport renders host SelectionPopover (not null solely because desktop).

### S10 No guest toolbar product path
Inject config `showSelectionToolbar: false` for desktop product.

### S19 Rename
No product paths with `run-preview`, `browser_bridge_`, `desktop-browser:`, `packages/shared/browser` (except historical specs).

## Acceptance

1. APP-053 four files complete with browser domain + host selection + no-compat.
2. Attach policy tests green; host selection structural pass; rename grep clean on product trees.
3. Quality gates green.
4. Capability gap → report not silent cut.

## Coverage Status

_To be appended after implementation._

## Coverage Status

Implemented (2026-08-04 agent run):

- Attach policy unit tests: `apps/desktop-electron/src/browser/webview-attach-policy.test.ts` (allow/deny/forced prefs/file URL) — pass
- Event remap unit tests: `apps/desktop-electron/src/browser/event-remap.test.ts` — pass
- Structural APP-053 tests: `apps/web/src/features/browser/lib/__tests__/app-053-browser-webview.structural.test.ts` — pass
- Host policy structural: `apps/web/src/features/browser/hooks/__tests__/webview-host-policy.test.ts` — pass
- Web typecheck (apps/web tsc7) — pass
- Desktop Electron full package `tsc` includes pre-existing failures outside browser module; browser unit tests green
- `smoke:router` fails in this environment loading Electron module exports under Bun without Electron runtime (pre-existing class of issue)
- Interactive desktop launch not validated here — see scratch `desktop-launch-unavailable.log`

Remaining gaps: full GUI Electron smoke on a developer machine; packaged preload `file://` verification in release build.
