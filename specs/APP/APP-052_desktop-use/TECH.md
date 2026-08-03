# TECH · APP-052：Desktop Use

## 1. Principles

1. **Control plane owned by Atmos** (Rust crate + CLI + Desktop IPC + Settings).
2. **Execution surface** is Atmos Desktop Use (library + optional engine binary under `~/.atmos/desktop-use/`). Process isolation preferred for any optional third-party control binary.
3. **No MCP.** Agents use `atmos desktop-use` (and/or skills that wrap it).
4. **No public vendor names** in UI, help, or default errors. Internal adapter modules may call a pinned external binary; that name never surfaces.
5. **Orthogonal to APP-016**: Desktop Use is a *capability on a machine*, not a Computer identity. Do not nest under `atmos computer`.

## 2. Layout

```
crates/desktop-use/
  capture.rs                 # screenshot + window identity
  inspect/                   # accessibility UI tree (AX) — primary agent context
  control.rs                 # optional control engine drive
  manager.rs                 # lifecycle
apps/cli/… desktop_use.rs    # atmos desktop-use {status,driver,capture,inspect,drive}
apps/desktop-electron/
  src/desktop-use/
    capture.ts               # in-process screenshot (TCC on Atmos Desktop)
    inspect.ts               # UI tree via CLI inspect (Rust AX)
    context.ts               # context.md composition
    client.ts                # CLI spawn for status/driver/inspect
  src/appshot/               # business only: records, protocol, pending UI
apps/web/
  features/settings/…DesktopUseSettingsSection
  features/appshot/… permissions panel (reusable, embedded in Settings)
```

Data dir:

```
~/.atmos/desktop-use/
  bin/                 # optional control engine binary
  manifest.json        # cached engine manifest
  state.json           # lifecycle snapshot
  logs/
```

## 3. State machine (control engine only)

Driver lifecycle is independent of capture:

```text
NotInstalled
  → Downloading { progress }
  → Ready | Installed
  → Stopped
  → Failed { error }
```

Notes:

- **Capture** on macOS does **not** require the control engine; status reports `capture.available` separately from `driver.*`.
- **Drive** click/type require the engine; screenshot may reuse Capture.
- Offline: `ensure` fails clearly without faking success when no package is published.
- Settings: ensure CTA may soft-fail with “package not available” until artifacts ship.

## 4. Capture API (stable JSON)

```json
{
  "ok": true,
  "app_name": "Safari",
  "window_title": "…",
  "bundle_id": null,
  "process_id": 1234,
  "bounds": { "x": 0, "y": 0, "width": 800, "height": 600 },
  "png_base64": "…",   // or png_path when --out used
  "context_markdown": "…",
  "quality": "window|display_fallback",
  "warnings": []
}
```

### Capture execution identity (M1 lock)

| Path | Implementation | TCC principal |
|------|----------------|---------------|
| **AppShot hot path** | `apps/desktop-electron/src/desktop-use/capture.ts` **in-process** (same Electron app) | **Atmos Desktop** app identity |
| **CLI / agents** | `crates/desktop-use` via `atmos desktop-use capture` | CLI / helper binary (may need separate grants; documented) |

Rules:

1. **One full PNG capture per AppShot trigger.** Animation preflight uses **metadata-only** frontmost read (no screenshot).
2. AppShot modules under `appshot/` must not call `osascript`/`screencapture` directly.
3. Prefer structured fields; AppShot owns `# Appshot Context` markdown for records.
4. CLI capture remains available for agents; not the Desktop hot path.

## 5. Control / drive

CLI:

```bash
atmos desktop-use status
atmos desktop-use driver ensure [--force]
atmos desktop-use driver status
atmos desktop-use driver stop
atmos desktop-use capture [--out path] [--json]
atmos desktop-use inspect --pid <n> [--app-name …]   # accessibility tree (primary agent text)
atmos desktop-use drive screenshot [--out path]
atmos desktop-use drive click --x <n> --y <n>
atmos desktop-use drive type --text "…"
```

### Inspect (accessibility tree)

- **Why separate from Capture:** AppShot’s main agent value is structured UI text (`context.md`), not only pixels. Capture owns Screen Recording; Inspect owns Accessibility; Control owns input.
- **Implementation:** `crates/desktop-use/src/inspect/` ports the AppShot Tauri AX walker (`AXUIElement` compact tree, depth/node/byte caps, secure-field redaction).
- **AppShot flow:** one Capture (PNG) + one Inspect (tree) → compose `context.md` with quality `screenshot_and_accessibility` when both succeed.


Drive adapter:

- Prefer optional pinned engine binary when present under managed bin path.
- When absent: return structured error (`control_engine_not_installed`) with ensure hint — except pure screenshot may reuse Capture.
- Never print vendor names.

Manifest ensure mirrors `local-model-runtime`: platform URL + sha256 when artifacts exist; unit tests use fixtures / temp dirs without network.

## 6. Settings UI

- New section id: `desktop-use` in `SettingsModalTab` + `SETTINGS_GROUPS` (system-integration).
- `DesktopUseSettingsSection`:
  - Status badge (capture / driver).
  - Ensure / Stop / Refresh for control engine.
  - **PermissionsPanel**: extract reusable body from `AppshotPermissionsWindow` (grant/refresh/status); embed here.
- Permission recovery CTAs from AppShot history/preview call **open Settings → desktop-use** (`activeSettingTab=desktop-use`) instead of `appshot_show_permissions_window` as primary.
- `appshot_show_permissions_window` / `/appshot-permissions` page: redirect to Settings Desktop Use or show the same panel with a note — not the preferred path.

## 7. Desktop Electron IPC (optional but useful)

```
desktop_use_status
desktop_use_driver_ensure
desktop_use_driver_stop
desktop_use_capture   # pixels
desktop_use_inspect   # accessibility tree (pid + optional app_name)
```

Handlers invoke the same crate logic via CLI subprocess or embedded binary path resolution (prefer resolving workspace/release `atmos` or bundled helper).

## 8. Security / TCC

- **M1 AppShot capture** runs in the Electron main process Desktop Use module so Screen Recording + Accessibility stay on **Atmos Desktop**.
- CLI capture is a separate identity; Settings permissions UI still opens system panes for the Desktop app.
- Doctor/status reuses AppShot permission fields for the Desktop app.
- No silent elevation; ensure is user-triggered from Settings or CLI.

## 9. Rollout

| Slice | Deliverable |
|-------|-------------|
| S0 | Specs locked |
| S1 | `crates/desktop-use` + unit tests (state, paths, capture parse, brand scrub) |
| S2 | CLI `atmos desktop-use` |
| S3 | Electron capture rewire |
| S4 | Settings + permissions reuse + primary path redirect |
| S5 | PR + CI |

## 10. Testing strategy

- Pure Rust unit tests: state transitions, manifest parse, user-facing string filter (no vendor tokens), capture JSON schema, CLI clap structure.
- Electron/Bun: frontmost client unit tests with mocked spawn; Settings section presence tests if cheap.
- No gating on live TCC in CI.

## 11. Risks

| Risk | Mitigation |
|------|------------|
| TCC identity for naked binaries | M1 capture via host-spawned Atmos tools; document helper identity follow-up |
| Engine download unavailable | First-class not_installed / failed; capture still works |
| CLI spawn latency for AppShot | Acceptable M1; can embed helper later |
