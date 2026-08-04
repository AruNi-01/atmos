# REVIEW · APP-052: Desktop Use - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, and readiness for acceptance testing. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-04  
**Review scope**: functional review + quality review (branch readiness for testing)  
**Related code**: `crates/desktop-use/`, `apps/cli/src/commands/desktop_use.rs`, `apps/desktop-electron/src/desktop-use/`, `apps/desktop-electron/src/appshot/frontmost.ts`, `apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx`, `apps/web/src/features/appshot/components/AppshotPermissionsPanel.tsx`  
**Branch / PR**: `feat/app-052-control-engine-cua` · [#202](https://github.com/AruNi-01/atmos/pull/202)

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review and findings need durable tracking. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-004**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Readiness summary (2026-08-04)

| Gate | Result |
|------|--------|
| PRD Must Have M1–M18 | **Implemented** on branch (Settings, CLI, capture migration, engine pin 0.17.0, host rebrand, AppShot host route when installed) |
| Automated unit tests | **Green** — `cargo test -p desktop-use` 26 passed; Electron host/frontmost tests 8 passed; web settings wiring 5 passed |
| CLI offline smoke | **Green** — `atmos desktop-use --help/status`; `drive click` → `control_engine_not_installed`; help vendor-free |
| CI on PR #202 | **Green** (backend format/clippy/test/build, web lint/typecheck/build, e2e smokes, desktop smoke, CodeQL) |
| Live TCC dual-shift / real ensure download | **Not automated** (explicit non-coverage in TEST.md) — **required for manual acceptance** |
| Ship / merge polish | Residual **P2/P3** items below; **not blockers for starting acceptance testing** |

**Verdict**: Implementation is complete enough to **enter manual / acceptance testing**. Do not treat unit CI alone as full product sign-off for host TCC + real engine download.

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P2 | docs | TECH §4/§8 still describe Electron as AppShot hot path | open |
| REV-002 | P2 | frontend | Host metadata-only frontmost does a full screenshot | open |
| REV-003 | P3 | test | TEST.md Coverage Status under-reports unit test count | open |
| REV-004 | P1 | backend | Vendor permissions grant hardcodes CuaDriver; Screen Recording never wakes | fixed |
| REV-005 | P1 | backend | Host app kept vendor Cua AppIcon | fixed |

---

## REV-001 · TECH §4/§8 still describe Electron as AppShot hot path

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | docs |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`TECH.md` §1.1 item 6 locks AppShot dual-shift capture to the host engine when installed, but §4 “Capture execution identity (M1 lock)” and §8 still say AppShot capture runs in-process under **Atmos Desktop** Electron identity. Readers (and test authors) cannot tell which rule is authoritative.

### Evidence

- `specs/APP/APP-052_desktop-use/TECH.md` — §1.1 items 6–7 vs §4 table / §8 bullets
- Implementation: `apps/desktop-electron/src/appshot/frontmost.ts` routes to `host-capture` when `driver.installed`

### Required fix

Rewrite §4 and §8 to match item 6: host-engine path after ensure; Electron `capture.ts` only as pre-ensure fallback.

### Acceptance

- [ ] TECH §4 table lists host engine as AppShot production path when installed
- [ ] §8 no longer claims M1 AppShot always uses Electron identity

### Fix log

- (none yet)

---

## REV-002 · Host metadata-only frontmost does a full screenshot

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review + CodeRabbit |
| **Owner** | unassigned |

### Finding

`readFrontmostWindow()` is documented as metadata-only, but on the host route it calls `captureFrontmostViaHostEngine()`, which always runs `desktopUseDriveScreenshot()` (full PNG + base64 + up to 45s CLI timeout). Animation/preflight paths that only need frontmost identity pay full capture cost and can feel slow.

### Evidence

- `apps/desktop-electron/src/appshot/frontmost.ts` — `readFrontmostWindow` host branch
- `apps/desktop-electron/src/desktop-use/host-capture.ts` — `captureFrontmostViaHostEngine` always screenshots first

### Required fix

Add a metadata-only host helper (`drive verify` / list windows → `pickFrontmostWindow`) and use it from `readFrontmostWindow`. Keep full screenshot only on `captureFrontmostWindow`. Optionally short-TTL cache for `resolveAppShotCaptureRoute()`.

### Acceptance

- [ ] Metadata-only read does not invoke screenshot drive
- [ ] Full dual-shift capture still returns PNG via host when installed
- [ ] Relevant Electron unit tests updated/pass

### Fix log

- (none yet)

---

## REV-003 · TEST.md Coverage Status under-reports unit test count

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P3 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`TEST.md` Coverage Status still says `cargo test -p desktop-use` → 12 passed. Branch now has 26 unit tests (protocol fixtures, install, host health parse, manager ensure, etc.). Execution map rows remain `pending` despite local/CI evidence.

### Evidence

- `specs/APP/APP-052_desktop-use/TEST.md` — Coverage Status / Execution map
- Local: `cargo test -p desktop-use` → 26 passed (2026-08-04)

### Required fix

Refresh Coverage Status and mark automated S* rows that are covered; leave live TCC as `not_run` / non-gating.

### Acceptance

- [ ] Coverage Status matches current test counts and commands
- [ ] Live TCC row remains explicit non-coverage

### Fix log

- (none yet)

---

## REV-004 · Vendor permissions grant hardcodes CuaDriver; Screen Recording never wakes

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | user dogfood |
| **Owner** | unassigned |

### Finding

`open_host_permission_grant` shelled upstream `permissions grant`, which always runs `open -a CuaDriver` and never attributes TCC to **Atmos Desktop Use**. Screen Recording therefore never registered / never opened Settings.

### Evidence

- Local: `atmos-desktop-control permissions grant` → “Check that `/Applications/CuaDriver.app` is installed”
- Doctor: `screen_recording: false` while Accessibility could still pass under host identity

### Required fix

Atmos-owned grant: open System Settings Privacy panes + host-identity capture probe. Never call vendor `permissions grant` after white-label.

### Acceptance

- [x] `driver grant-permissions` opens Privacy_ScreenCapture / Accessibility
- [x] Capture probe runs under host daemon identity
- [x] No CuaDriver.app dependency in grant path

### Fix log

- 2026-08-04 - Rewrote `host::open_host_permission_grant`; updated CLI hint; `cargo test -p desktop-use` 29 passed; local CLI reinstalled

---

## REV-005 · Host app kept vendor Cua AppIcon

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | user dogfood |
| **Owner** | unassigned |

### Finding

Install only rewrote plist name/bundle id; `Contents/Resources/AppIcon.icns` remained the vendor Cua logo (~687KB).

### Evidence

- Installed host AppIcon was Cua `ic12` 687131 bytes before fix

### Required fix

Replace AppIcon with Atmos product icns on install; re-apply idempotently without re-signing when already correct (avoid TCC identity churn).

### Acceptance

- [x] Host AppIcon bytes match `crates/desktop-use/assets/host-app-icon.icns`
- [x] Second ensure does not re-codesign when branding already applied

### Fix log

- 2026-08-04 - `include_bytes!` Atmos icon + `rebrand_existing_host_app` dirty-check; local host rebranded; ensure idempotent

---

## Non-blocking notes (not tracked as separate REV)

- Non-macOS `driver grant-permissions` reports `ok: true` with no-op flow — acceptable for macOS-first M1; harden if Linux/Windows productize.
- Some host-permission fallback copy still hardcodes English in AppShot permissions panel — polish for zh locale.
- `find_named_file` stops entire search on one unreadable dir — edge case during archive extract.
- Live network `driver ensure` + real TCC grants are the primary **manual** gate; not claimed green by CI.
