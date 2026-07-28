# REVIEW · APP-045 Desktop Electron Dual Shell

> Post-implementation review notes for dual-shell ship.

## Open issue · AppShot dual-shift global trigger (2026-07-28)

**Status:** **OPEN — not ship-ready for production Appshots gesture**  
**Symptom:** Left+Right Shift works **only while Atmos is frontmost**. When another app is frontmost (the real Appshots use case), the chord does not fire (or only captures Atmos).  
**Tauri baseline:** Works globally via in-process `CGEventTap` FlagsChanged on a dedicated Rust thread (`apps/desktop/src-tauri/src/appshot/macos/trigger.rs`).

### Root causes confirmed

| # | Finding | Evidence |
|---|---------|----------|
| 1 | `CGEventSourceKeyState` poll **cannot** see right Shift | Synthetic + live samples: both shifts collapse to keycode `0x38`; `0x3C` never true. Dual-shift via poll alone is impossible. |
| 2 | Pure koffi `CFRunLoopAddSource` with wrong `kCFRunLoopCommonModes` | Either **SIGBUS** in CoreFoundation `__AUTH_CONST` (bad symbol indirection) or silent no-events (self-built CFString is not the system sentinel). |
| 3 | In-process / GUI-process tap feels “in-app only” | Electron main process is throttled / App-Napped when backgrounded; edges/CHORDs appear while Atmos focused, disappear or never log when Safari/Finder focused. |
| 4 | Accessibility drops after ad-hoc reinstall | Logs: `AXIsProcessTrusted=false` after replace of `/Applications/Atmos.app`; user must re-grant Accessibility (+ Screen Recording). |
| 5 | Capture when self-focused is useless | `frontmost="Atmos"` + warning “focus another app”; `screencapture` can fail with `could not create image from display` without Screen Recording. |

### What we implemented (current tree)

- Native dylib: `apps/desktop-electron/native/appshot-shift/appshot_shift.c` → `resources/bin/libatmos_appshot_shift.dylib` (built in `prepare-package` / `scripts/build-appshot-shift-native.ts`).
- Chord state: `shift-chord.ts` (Tauri-parity Left then Right).
- Paths tried: poll → in-process koffi tap → in-process dylib thread + `powerSaveBlocker` → **helper process** (`ELECTRON_RUN_AS_NODE=1` same Atmos binary + `dist/shift-helper-main.js`, NDJSON over stdout).
- Logs: `~/.atmos/logs/desktop-main.log` (`main-log.ts`).
- Capture: frontmost via System Events + `screencapture`; preview via `appshot://preview`; force `app.focus({ steal: true })` after capture.

### Still broken / next investigation

1. **Prove helper receives FlagsChanged while a non-Atmos app is frontmost** — watch log for `helper READY` then `edge`/`CHORD (helper process)` without Atmos focused. If no edges: Accessibility/tap location/HID vs session; if edges but no capture: `triggerCapture` / frontmost / Screen Recording.
2. Prefer a **true native helper binary** in `Contents/MacOS/` (or reuse Tauri CGEventTap crate) if `ELECTRON_RUN_AS_NODE` still fails global delivery on macOS 26.
3. Do **not** reintroduce double-tap Left Shift or Cmd+Shift+A as product gesture (user rejected fallbacks).
4. Verify TCC: after each ad-hoc install, Accessibility + Screen Recording for **Atmos**.

### Reproduce

```bash
just build-desktop-electron   # or bun run package in apps/desktop-electron
# install release/mac-arm64/Atmos.app → /Applications
# grant Accessibility + Screen Recording, restart Atmos
tail -f ~/.atmos/logs/desktop-main.log
# Focus Safari → Left Shift + Right Shift
# Expect: edge left/right, CHORD, appshot-capture frontmost="Safari"
# Actual (open bug): no chord / only works with Atmos frontmost
```

## Product cutover note (2026-07-28)

**OBJECTIVE override:** Electron is now the **production default desktop** for maintainers (`just dev-desktop` / `just build-desktop` / `just release-desktop` → Electron). Tauri remains buildable (`just dev-desktop-tauri` / `release-desktop-tauri`) for non-regression. Shared on-disk contracts (AppShot `~/.atmos/appshots`, Server data `~/.atmos/desktop`, tunnel gateway + entry_token) are required; Electron is no longer an experimental-only sandbox.

## Review outcome (2026-07-27)

**Status:** no high-severity blockers for experimental dual-shell dogfood (historical).

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
