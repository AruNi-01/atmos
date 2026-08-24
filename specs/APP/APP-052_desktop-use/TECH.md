# TECH · APP-052：Desktop Use

## 1. Principles

1. **Control plane owned by Atmos** (Rust crate + CLI + Desktop IPC + Settings).
2. **Execution surface** is Atmos Desktop Use (library + optional engine binary under `~/.atmos/desktop-use/`). Process isolation preferred for any optional third-party control binary.
3. **No MCP.** Agents use `atmos desktop-use` (and/or skills that wrap it).
4. **No public vendor names** in UI, help, or default errors. Internal adapter modules may call a pinned external binary; that name never surfaces.
5. **Orthogonal to APP-016**: Desktop Use is a *capability on a machine*, not a Computer identity. Do not nest under `atmos computer`.

### 1.1 Control-engine supply chain (locked)

| Choice | Decision |
|--------|----------|
| Source | **Pin official `cua-driver-rs-v*` release artifacts** (not monorepo compile-in-tree as default) |
| Pin | `0.19.2` / tag `cua-driver-rs-v0.19.2` in `crates/desktop-use/manifest/default.json` |
| Pin authority (Desktop) | **App Resources** `desktop-use/engine-manifest.json` via `ATMOS_DESKTOP_USE_MANIFEST` (Desktop injects pin; CLI binary is independent). Bare CLI falls back to embedded manifest. |
| Runner (Desktop) | **Sole** canonical CLI `~/.atmos/bin/atmos` (ADR-005). Engine pin: App Resources `desktop-use/engine-manifest.json`. **CLI floor:** App Resources `desktop-use/cli-requirement.json` (`min_cli_version`, staged from `apps/cli/Cargo.toml` at package time into a gitignored overlay — never overwrite the tracked `resources/desktop-use/` pin). Desktop Use prompts install/update only when CLI missing or **below that floor** — not when a newer unrelated CLI exists on the release channel (About still uses channel latest). Never bundle CLI binary into Desktop. |
| Install path | `atmos desktop-use driver ensure` downloads + sha256-verifies + extracts into `~/.atmos/desktop-use/` |
| Managed binary name | `atmos-desktop-control` (white-label; never teach users `cua-driver`) |
| macOS host identity | Rebrand extracted host app to **Atmos Desktop Use.app** (`com.atmos.desktop.use`) + ad-hoc/product codesign so TCC grants show **one** product name for AppShot + control |
| Rejected as primary | Separate **CuaDriver.app** grant UX; public MCP; user install from cua.ai |
| Offline / CI | `ATMOS_DESKTOP_USE_ENGINE_ARCHIVE` fixture tarball or `ATMOS_DESKTOP_USE_ENGINE_SOURCE` raw binary |

Daemon: managed socket `~/.atmos/desktop-use/engine.sock`.

**macOS TCC unification (locked):**

1. `ensure` installs rebranded **Atmos Desktop Use.app** (`com.atmos.desktop.use`) + `atmos-desktop-control` CLI shim binary.
2. `ensure_daemon` starts serve via **`open -n -g -a "…/Atmos Desktop Use.app" --args serve --socket …`** (LaunchServices), not a naked binary spawn — live process Identifier = `com.atmos.desktop.use`.
3. `doctor` / Settings permissions read **live host** TCC via `health_report` / `check_permissions` on that daemon (not Electron-only grants).
4. `driver grant-permissions` is **Atmos-owned**: open System Settings Privacy panes (Screen Recording + Accessibility) + host-identity capture probe so **Atmos Desktop Use** appears in the list. Do **not** call upstream `permissions grant` (hardcodes `CuaDriver.app`).
5. When engine is installed, AppShot permission panel uses Desktop Use doctor + host grant (one product identity).
6. When engine is installed, **AppShot dual-shift capture** also uses the host engine (`drive screenshot` / window list under Atmos Desktop Use.app), not Electron `osascript`/`screencapture`. Electron in-process capture is **only** the pre-ensure fallback.
7. **Screenshot wire (pinned 0.19.2):** `call --screenshot-out-file` + tool arg `screenshot_out_file`; parse MCP image `content[]` / `screenshot_file_path` only. Exit-0 plain-text engine errors are **Err** (not soft `ok:true`). Atmos injects `png_base64` / `png_path` into drive JSON for clients. Fixtures: `crates/desktop-use/tests/fixtures/engine_0_19_2/`.
8. **Host icon:** install rewrites `AppIcon.icns` with Atmos product icon (`crates/desktop-use/assets/host-app-icon.icns`); ensure re-applies branding without re-download.
9. Rejected: primary UX that asks users to grant **CuaDriver.app** / `com.trycua.driver`; rejected: relying on vendor `permissions grant` after white-label.

## 2. Layout

```
crates/desktop-use/          # state, config, capture, control adapter, manager, drive_tools
crates/browser-use/          # page CDP façade (CUA external + embedded stub)
apps/cli/… desktop_use.rs    # atmos desktop-use
apps/cli/… browser_use.rs    # atmos browser-use (not under Desktop Use branding)
apps/desktop-electron/
  src/desktop-use/           # spawn/IPC client to CLI or helper
  src/appshot/frontmost.ts   # thin client → desktop-use capture (no osascript)
  # APP-053 (PR #203, unmerged): browser webview + browser_bridge_* for future embedded backend
apps/web/
  features/settings/…DesktopUseSettingsSection
  features/appshot/… permissions panel (reusable, embedded in Settings)
skills/atmos-desktop-use/    # OS shell skill
skills/atmos-browser-use/    # page CDP skill (no MCP)
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

CLI (product lifecycle + desktop shell):

```bash
atmos desktop-use status
atmos desktop-use driver ensure [--force]
atmos desktop-use driver status
atmos desktop-use driver stop
atmos desktop-use capture [--out path] [--json]
atmos desktop-use drive screenshot|click|type|verify|window-state|…
```

Drive adapter:

- Prefer optional pinned engine binary when present under managed bin path.
- When absent: return structured error (`control_engine_not_installed`) with ensure hint — except pure screenshot may reuse Capture.
- Never print vendor names.
- **No MCP.** Agents use CLI/skills only.

Manifest ensure mirrors `local-model-runtime`: platform URL + sha256 when artifacts exist; unit tests use fixtures / temp dirs without network.

### 5.1 Desktop drive phases (product CLI, not 1:1 engine dump)

| Phase | Goal | `atmos desktop-use drive` (representative) |
|-------|------|-----------------------------------------------|
| **0 (shipped)** | Install + capture + basic click/type | `screenshot`, `click`, `type`, `verify`, `window-state`, `highlight`, `session-end` |
| **1** | Full computer shell for agents | `double-click`, `right-click`, `drag`, `scroll`, `hotkey`, `key`, `move`, `apps`, `launch`, `quit`, `clipboard get|set`, `screen`, `cursor`, `menu`, `ax-tree` |
| **2** | Explicit extras (never default steal focus) | `front` (bring_to_front), `set-value`, `window-frame`, `zoom`, `verify-state` |
| **3** | Page CDP — **not under Desktop Use** | See **§5.2 Browser Use** (`atmos browser-use`) |

Defaults: `delivery_mode=background`; optional session + operation border chrome; foreground only when requested.

### 5.2 Browser Use (page CDP) — separate from Desktop Use

**Product split (locked):**

| Surface | Object | CLI | Engine tools (external Chromium first) |
|---------|--------|-----|----------------------------------------|
| **Desktop Use** | OS windows, keys, AX, pixels | `atmos desktop-use` | `list_windows`, `click`, `type_text`, … |
| **Browser Use** | Bound browser **tabs / DOM** (engine **0.19.2+**) | `atmos browser-use` | `browser_prepare`, `get_browser_state` (`semantic_v2`), `browser_click`, `browser_type`, `browser_navigate`, `browser_pointer`, `browser_dialog`, `browser_download`, … |

Rules:

1. **No MCP** on either surface.
2. Browser Use is **not** branded Desktop Use; no operation-border chrome coupling.
3. **Backend trait (crate `browser-use`):**
   - **`ExternalBackend`** — system Chromium via managed desktop-use engine socket/`call` (pin **0.19.2** extension-free browser tools).
   - **`EmbeddedBackend`** — Atmos in-app browser via host control plane (APP-053).
4. Reuse model: page actions (prepare/state/click/type/navigate/pointer/dialog/download); **attach path** differs (external CDP vs Electron host). Do not force embedded tabs through “user Chrome prepare”.
5. Skill decision: page/DOM → Browser Use; window chrome / any App → Desktop Use.
6. **External prepare default** is `isolated_new` + `allow_launch` (driver-owned profile). `existing_profile` is opt-in and requires `--window-id`.
7. **State snapshot default** is `snapshot_format=semantic_v2` (bind mode omits format).

```bash
# prepare: pid required; default isolated_new (safe). existing_profile needs --window-id
atmos browser-use --json prepare --backend external --pid <chrome_pid>
atmos browser-use --json prepare --backend external --pid <pid> --window-id <wid> --strategy existing_profile
# state bind → mints target_id/tab_ids; snapshot defaults to semantic_v2
atmos browser-use --json state --backend external --pid <pid> --window-id <wid>
atmos browser-use --json state --backend external --target-id … --tab-id … --include-screenshot
atmos browser-use --json click --backend external --target-id … --tab-id … --ref …
atmos browser-use --json type --backend external --target-id … --tab-id … --ref … --text "…"
atmos browser-use --json navigate --backend external --target-id … --tab-id … --url https://…
atmos browser-use --json pointer --backend external --target-id … --tab-id … --action hover --ref …
atmos browser-use --json prepare --backend embedded
```

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
desktop_use_capture   # used by AppShot service
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
