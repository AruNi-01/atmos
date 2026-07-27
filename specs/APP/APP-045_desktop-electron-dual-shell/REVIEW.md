# REVIEW · APP-045 Desktop Electron Dual Shell

> Post-implementation review notes for dual-shell ship.

## Review outcome (2026-07-27)

**Status:** no high-severity blockers for experimental dual-shell dogfood.

### Verified

- Shell-agnostic `desktop-bridge` routes Tauri + Electron; unit tests pass.
- Electron shell is TypeScript (`apps/desktop-electron/src`) with 52 registered IPC commands.
- Cookie list/extract uses Rust `atmos-browser-cookies` (browser-cookies crate + Keychain).
- Inject path into Electron `persist:atmos-preview` session implemented.
- Preview `WebContentsView`, tunnel CLI control, AppShot records/capture command surface present.
- Tauri `dev-desktop` / `build-desktop` / `release-desktop` unchanged as production default.
- Smokes: `bun test` bridge + electron router/cookies/appshot; `smoke-router` / `smoke-boot`.

### Residual gaps (non-blocking for dual-shell Must Haves)

1. **AppShot capture quality:** Electron uses macOS `screencapture`; Tauri Accessibility-tree capture is richer (APP-021 native path). Same command names; product-usable snapshots.
2. **Chromium import while browser running:** helper correctly returns `BrowserRunning` (same as Tauri).
3. **Production default:** still Tauri until explicit Phase-5 product sign-off (PRD/TECH).

### Severity

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Dual-shell happy path (boot, bridge, get_api_config, command catalog) | — | OK |
| Cookie Keychain via Rust helper | — | OK |
| AppShot AX parity | low | Accept screencapture on Electron; document |

## Follow-up review fixes (same session)

1. **Preview event remap** — `atmos-preview:*` → `desktop-preview:*` (Tauri contract).
2. **bridgeToken gate** — reject unknown session / bad token before emit; strip token from payload.
3. **openAgentChatWindow** — uses `desktopInvoke` for all desktop shells.

Automated: `bun test src/preview/event-remap.test.ts` + rebuild smokes.

## Skeptic panel fixes (required for shipped)

1. Cookie import menu: `Preview.tsx` uses `isDesktopRuntime()` (+ Mac UA).
2. Preview show/hide lifecycle: `use-preview-lifecycle-effects.ts` uses `isDesktopRuntime()`.
3. AppShot Electron DTOs: `supported`, `platform: macos`, `trigger`, `permissions[]`, `listRecords.record_dir`, `readRecords` detail shape.
4. Event remap tests import shipped `runtime-events.ts` (not a reimplementation).
5. Contract tests: `appshot/contract.test.ts`, `desktop-gates.test.ts`.
6. **snapshot_url** must be `data:image/png;base64,...` (not `file://`) so http-served UI can render history thumbnails — `dataUrlForPng` + contract test with real PNG fixture.
