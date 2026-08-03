# TEST · APP-052：Desktop Use

## Test strategy

| Level | Use for |
|-------|---------|
| Rust unit (`cargo test -p desktop-use`) | State machine, paths, capture DTO, brand scrub, ensure dry paths |
| CLI (`cargo test -p atmos` / manual `--help`) | Command surface, status JSON, vendor-free help |
| Bun unit (web/desktop-electron) | Settings section wiring, permissions panel reuse, frontmost no direct shell tools |
| Static grep | No osascript/screencapture in production appshot capture path; no public cua strings |

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1–M4 naming | S1, S2 |
| M5–M8 Settings + permissions | S3, S4 |
| M9–M11 Capture migration | S5, S6 |
| M12–M16 CLI | S7, S8 |
| M17–M18 lifecycle | S9, S10 |

## Execution map

| ID | Level | Command / method | Status |
|----|-------|------------------|--------|
| S1 | static | grep specs for Desktop Use / no MCP / no computer merge | pending |
| S2 | unit | desktop-use brand scrub + status serialization | pending |
| S3 | static/unit | Settings section id `desktop-use` + component | pending |
| S4 | static | show permissions → Settings desktop-use path | pending |
| S5 | static | appshot frontmost no osascript/screencapture | pending |
| S6 | unit | capture JSON schema / mock capture | pending |
| S7 | CLI | `atmos desktop-use --help` / `status` | pending |
| S8 | unit | CLI help strings no vendor | pending |
| S9 | unit | driver state NotInstalled → ensure dry | pending |
| S10 | unit | drive without engine → structured error | pending |

## Scenarios

### S1 — Spec lock
Given APP-052 four files exist, when reviewed, then they define Desktop Use naming, Settings, capture migration, CLI, no MCP, no public cua, no APP-016 collision.

### S2 — Brand scrub
Given user-facing strings from the crate/CLI, when scanned, then none contain `cua`, `Cua`, or `trycua`.

### S3 — Settings section
Given Settings modal data, when listed, then `desktop-use` section exists with lifecycle + permissions panel composition.

### S4 — Permissions primary path
Given AppShot history/preview permission CTA, when invoked, then it opens Settings Desktop Use (not standalone permissions as primary).

### S5 — Capture migration
Given production appshot capture modules, when grepped, then they do not shell `osascript`/`screencapture` directly; they call Desktop Use client.

### S6 — Capture contract
Given capture success DTO, when serialized, then required fields (`ok`, app/window identity, warnings) are present.

### S7 — CLI help/status
Given built CLI, when `atmos desktop-use --help` and `status` run, then commands exist and status returns structured state offline.

### S8 — CLI brand
Given CLI help output, when grepped, then no vendor tokens.

### S9 — Ensure dry
Given temp data dir and no network artifact, when ensure runs (or dry path), then state is not_installed or failed with clear error — never silent success without binary.

### S10 — Drive without engine
Given not installed control engine, when `drive click` runs, then error code/message indicates ensure required (no panic, no vendor name).

## Acceptance criteria

- [ ] Four spec files present and consistent
- [ ] Settings Desktop Use section + reused permissions UI
- [ ] AppShot capture not using direct osascript/screencapture
- [ ] `atmos desktop-use` status/driver/capture/drive surface
- [ ] Unit tests green for pure paths
- [ ] PR open and merge-ready (CI green or fixed)

## Non-coverage

- Live dual-shift capture under CI TCC
- Real third-party binary download success without network
- Remote Computer GUI drive

## Coverage Status

| Check | Result |
|-------|--------|
| `cargo test -p desktop-use` | 12 passed (state, brand scrub, ensure dry, drive without engine, capture parse) |
| `atmos desktop-use --help/status/drive click` | CLI surface works; vendor-free; click returns `control_engine_not_installed` |
| AppShot `frontmost.ts` | No direct `osascript`/`screencapture` production calls; uses Desktop Use client |
| Settings wiring unit tests | `desktop-use` section + AppshotPermissionsPanel embed + permission primary path |
| Electron client unit test | resolveAtmosCliPath vendor-free |
| Live TCC dual-shift | not_run (environment / non-gating) |
