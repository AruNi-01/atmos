# TECH · APP-045: Desktop Electron Dual Shell

> Technical Design · HOW. Implements PRD APP-045. Addresses **M1–M9**; Nice-to-haves **N1–N7** phased.

## Scope summary

This document defines a **dual-shell architecture**:

- **Tauri shell** remains at `apps/desktop` (production default).
- **Electron shell** is added at `apps/desktop-electron` (experimental / dogfood).
- **Shared**: `apps/web` desktop static export, Atmos Server runtime bundle, and a **Desktop Bridge protocol**.
- **Not in scope for first implementation PR**: deleting Tauri, flipping public release default, CEF-in-Tauri, Node rewrite of Atmos Server.

**Clarification (M9):** Keeping Rust does **not** mean keeping Tauri. Electron must not load Tauri. Rust continues as:

1. Atmos Server process (existing `runtime-manager` supervisor path), and  
2. Optional native helpers (e.g. AppShot) as plain binaries or N-API later — not as a second UI engine.

There is **one UI engine per running shell** (WKWebView under Tauri on macOS, Chromium under Electron). Multiple OS processes (Electron main/renderer + Server) are expected and are not “two desktop frameworks.”

## Architecture overview

```text
                 ┌──────────────────────────────────────┐
                 │ apps/web  (BUILD_TARGET=desktop)     │
                 │ desktop-bridge.ts  → invoke / listen │
                 └──────────────────┬───────────────────┘
                                    │  Desktop Bridge protocol
                 ┌──────────────────┴───────────────────┐
                 │                                      │
      ┌──────────▼──────────┐              ┌────────────▼────────────┐
      │ apps/desktop        │              │ apps/desktop-electron   │
      │ Tauri 2 + wry       │              │ Electron main/preload   │
      │ adapter: tauri      │              │ adapter: electron IPC   │
      │ (production)        │              │ (experimental)          │
      └──────────┬──────────┘              └────────────┬────────────┘
                 │                                      │
                 └──────────────────┬───────────────────┘
                                    │
                 ┌──────────────────▼───────────────────┐
                 │ Shared desktop runtime               │
                 │  bin/Atmos Server (+ cli as needed)  │
                 │  web/  (static export)               │
                 │  system-skills/                      │
                 │ ensure via runtime-manager           │
                 └──────────────────────────────────────┘
```

### Layers touched

| Layer | Role in this spec |
|-------|-------------------|
| `apps/web` | Bridge API, migrate call sites off raw Tauri imports |
| `apps/desktop` | Tauri adapter remains; minimal changes (compat with bridge) |
| `apps/desktop-electron` | **New** Electron shell |
| `scripts/desktop/*` | Shared prepare/layout runtime; new just recipes |
| `crates/runtime-manager` | Reuse as-is for ensure/stop server |
| `crates/*` AppShot / browser-cookies / tunnel | Prefer reuse from Electron via helper or in-process later; not rewritten in Phase 0 |
| `apps/api` | No protocol change required for Phase 0 |

### Explicit non-goals (architecture)

- Running Tauri and Electron **UI frameworks inside one process**.
- Bundling CEF inside Tauri as the dual-shell vehicle.
- Duplicating product features in a second Next.js app.

## Decisions (locked)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Dual shell directories, not replace-in-place | M1, M5 — Tauri stays shippable |
| D2 | Shared web static + shared Server runtime | M2, M3 — no product fork |
| D3 | Desktop Bridge is the only web→shell API | M4 — adapters hide Tauri/Electron |
| D4 | Command names v1 = existing Tauri command strings | Minimize web churn; Electron implements same names |
| D5 | Electron does not depend on Tauri crates/runtime | M9 |
| D6 | AppShot stays Rust-owned when ported | Avoid Node rewrite of Accessibility stack |
| D7 | Preview on Electron uses `WebContentsView` + `session.fromPartition` | Chromium analog of child webview + data store |
| D8 | Production updater / `release-desktop` remains Tauri until Phase 5 | M8 |
| D9 | Feature parity ≠ perfect behavior | PRD out of scope; document engine diffs |
| D10 | Child surface occlusion still required on Electron | APP-029 class problem remains |

## Module-by-module design

### 1. `apps/web` — Desktop Bridge

#### 1.1 New module

**Path (proposed):** `apps/web/src/shared/lib/desktop-bridge.ts`

Responsibilities:

- Detect shell: `'none' | 'tauri' | 'electron'`
- `isDesktopRuntime()`, keep `isTauriRuntime()` as thin wrapper for compat
- `desktopInvoke(cmd, args?)`, `desktopListen(event, handler)`, `desktopEmit` if needed
- Never import `@tauri-apps/*` outside the Tauri adapter branch inside this module (and temporary legacy shims during migration)

#### 1.2 Detection order

```ts
// Pseudocode
function detectShell(): DesktopShell {
  if (typeof window === 'undefined') return 'none';
  // Electron preload injects first-party marker (preferred)
  if (window.__ATMOS_DESKTOP__?.shell === 'electron') return 'electron';
  // Tauri injects internals
  if ('__TAURI_INTERNALS__' in window) return 'tauri';
  return 'none';
}
```

Electron preload **must** set:

```ts
contextBridge.exposeInMainWorld('__ATMOS_DESKTOP__', {
  shell: 'electron',
  invoke: (cmd, args) => ipcRenderer.invoke('atmos:desktop-invoke', { cmd, args }),
  // optional: on/off for events
});
```

#### 1.3 Migration of call sites

Existing hotspots (non-exhaustive):

| Area | Today | Target |
|------|-------|--------|
| `desktop-runtime.ts` | `isTauriRuntime`, `get_api_config` via invoke | bridge + shared config fetch |
| `desktop-preview-bridge.ts` | `@tauri-apps/api` invoke/listen | `desktopInvoke` / `desktopListen` |
| `features/appshot/lib/appshot-client.ts` | tauri invoke/listen | bridge |
| `desktop-directory-picker.ts` | plugin-dialog | bridge command or shell-specific adapter behind bridge |
| `notifications.ts` | tauri invoke | bridge |
| `standalone-window-handoff.ts` | tauri event/window | bridge events |
| CodeMirror `useDrawSelection: !isTauriRuntime()` | WebKit workaround | `detectShell() === 'tauri'` or `engine === 'webkit'` (**N7**) |

**Rule:** New desktop code must use bridge only. Legacy raw imports allowed only inside bridge adapters until deleted.

#### 1.4 Build target

Keep `BUILD_TARGET=desktop` / `NEXT_PUBLIC_BUILD_TARGET=desktop` for **both** shells.

Optional later: `NEXT_PUBLIC_DESKTOP_SHELL` only if a UI string must differ; default avoid forking UI.

### 2. `apps/desktop` — Tauri (production)

- Remain source of truth for production packaging.
- Phase 0 changes should be **minimal**:
  - Prefer web-side bridge that still calls existing Tauri `invoke` when shell is `tauri`.
  - No requirement to rewrite `commands.rs` names.
- Do not move production release scripts to Electron in this spec’s early phases.
- Continue using capabilities under `apps/desktop/src-tauri/capabilities/`.

### 3. `apps/desktop-electron` — Electron shell (new)

#### 3.1 Proposed layout

```text
apps/desktop-electron/
  package.json
  electron/
    main.ts                 # app ready, windows, lifecycle
    preload.ts              # __ATMOS_DESKTOP__
    ipc/
      router.ts             # cmd → handler
      handlers/
        runtime.ts          # get_api_config, ensure server
        windows.ts          # agent-chat, preview windows
        preview.ts          # WebContentsView bridge
        appshot.ts          # helper spawn / IPC
        cookies.ts
        tunnel.ts
        system.ts           # dialog, notification, log, opener
    runtime/
      ensure.ts             # call into shared layout + supervisor semantics
    preview/
      surface-manager.ts    # bounds, show/hide, navigate, partitions
    windows/
      main-window.ts
      agent-chat-window.ts
  resources/                # optional icons
  electron-builder.yml      # Phase 4
  README.md
  AGENTS.md
```

#### 3.2 Main process responsibilities

1. Resolve runtime directory (shared bundle).
2. `ensure` Atmos Server (same semantics as `apps/desktop/src-tauri/src/runtime.rs` / `runtime_manager::supervisor::ensure_running`).
3. Create main `BrowserWindow` with:
   - `titleBarStyle: 'hiddenInset'` on macOS (approximate Tauri Overlay titlebar)
   - `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `preload`
4. Load static UI from runtime `web/` (or dev file URL to `apps/web/out`).
5. Register `ipcMain.handle('atmos:desktop-invoke', …)`.
6. On quit: stop Atmos Server when Electron owns the session (mirror Tauri `RunEvent::Exit` behavior — desktop owns lifecycle for end users).

#### 3.3 Security (Electron)

- Preview / untrusted site content **must not** receive the privileged preload that exposes full desktop invoke.
- Use a **dedicated `session.fromPartition('persist:atmos-preview')`** (or per-session partitions) for target sites.
- Main app session is separate from preview partition (parity intent with APP-041 dedicated data store).
- IPC router **allowlists** commands; unknown cmd → error.
- Never enable `nodeIntegration` in renderer loading product UI or preview.

### 4. Shared runtime pipeline

#### 4.1 Today

`scripts/desktop/prepare-sidecar.sh` builds API, web static, layouts under:

`apps/desktop/src-tauri/binaries/runtime/current/`

#### 4.2 Dual-shell approach

**Phase 0 (acceptable shortcut):**

- Electron reads the **same** `apps/desktop/src-tauri/binaries/runtime/current` path for dogfood.
- Document that Electron depends on Tauri prepare output path only as a **build artifact location**, not on Tauri runtime.

**Phase 1+ (N1, preferred):**

- Extract `scripts/desktop/prepare-desktop-runtime.sh` (or extend layout script) to write:

```text
dist/desktop-runtime/current/
  bin/Atmos Server
  web/
  system-skills/
  version.txt
```

- Tauri bundle resources copy from that neutral path.
- Electron packages/resources point at the same path.

#### 4.3 Just recipes

```text
just prepare-desktop-runtime   # shared
just dev-desktop               # unchanged Tauri
just build-desktop             # unchanged Tauri
just release-desktop           # unchanged Tauri (production)

just dev-desktop-electron      # new
just build-desktop-electron    # later
```

Env reuse: `ATMOS_DESKTOP_SKIP_WEB_BUILD=1` applies to shared prepare.

### 5. Desktop Bridge protocol

#### 5.1 Invoke

```ts
// Renderer → shell
desktopInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
```

- **Tauri adapter:** `invoke(cmd, args)` from `@tauri-apps/api/core`
- **Electron adapter:** `ipcRenderer.invoke('atmos:desktop-invoke', { cmd, args })` → main router

#### 5.2 Events

Map Tauri `listen` / `emit` to Electron `webContents.send` / `ipcMain` as needed.

Event names for v1 should match existing Tauri event strings used by appshot and preview where possible.

#### 5.3 Command catalog (v1 contract)

Freeze **string command names** to current Tauri surface (from `commands.rs`, `browser_cookies`, `tunnel_connector`, appshot wrappers). Electron implements a growing subset.

##### Runtime / shell

| Command | Phase target | Notes |
|---------|--------------|-------|
| `get_api_config` | 0 | `{ host, port }` |
| `get_version_info` | 1 | |
| `list_desktop_releases` | 1 / 4 | may stay HTTP-only |
| `write_log` | 0 | |
| `clear_client_session_cmd` | 1 | |
| `get_local_computer_display_name` | 1 | |
| `send_notification` | 1 | |
| `open_in_external_editor` | 1 | |

##### Windows / handoff

| Command | Phase target | Notes |
|---------|--------------|-------|
| `open_agent_chat_window` | 1 | second BrowserWindow |
| `write_agent_chat_handoff` | 1 | userData fs |
| `read_agent_chat_handoff` | 1 | |
| `open_preview_browser_window` | 2 | |

##### Preview bridge

| Command | Phase target | Notes |
|---------|--------------|-------|
| `preview_bridge_open` | 2 | WebContentsView |
| `preview_bridge_update_bounds` | 2 | |
| `preview_bridge_set_detached` | 2 | |
| `preview_bridge_navigate` | 2 | |
| `preview_bridge_enter_pick_mode` | 2 | |
| `preview_bridge_clear_selection` | 2 | |
| `preview_bridge_clear_annotations` | 2 | |
| `preview_bridge_open_devtools` | 2 | **Chrome DevTools** |
| `preview_bridge_close` / `show` / `hide` | 2 | |
| `preview_bridge_event` | 2 | from preview → main → app |
| `preview_bridge_probe_url` | 2 | |

##### Cookies (APP-041)

| Command | Phase target | Notes |
|---------|--------------|-------|
| `list_importable_browsers` | 3 | reuse Rust crate via helper or port logic |
| `import_browser_cookies` | 3 | write into preview partition |
| `clear_browser_cache` | 3 | |
| `clear_browser_site_data` | 3 | |

##### AppShot (APP-021)

| Command | Phase target | Notes |
|---------|--------------|-------|
| `appshot_*` family | 3 | prefer Rust helper process |

##### Tunnel (APP-012)

| Command | Phase target | Notes |
|---------|--------------|-------|
| `tunnel_connector_*` | 3 | reuse manager; host lifecycle in Electron main |

**Unsupported command behavior:** return `Error` with stable code e.g. `DESKTOP_CMD_UNSUPPORTED` so UI can hide/disable.

### 6. Preview on Electron (Phase 2 detail)

Parity target for desktop-native transport:

| Tauri | Electron |
|-------|----------|
| `Window::add_child(WebviewBuilder)` | `WebContentsView` attached to main window content view |
| `data_store_identifier` | `session.fromPartition('persist:atmos-preview…')` |
| `initialization_script` | `session.registerPreloadScript` or `executeJavaScript` on dom-ready + navigation |
| `open_devtools` | `webContents.openDevTools()` |
| bounds update | `setBounds` in DIP/physical pixels with scale factor care |
| hide on occlusion | same web APP-029 hooks → `preview_bridge_hide` |

**Still required:** APP-029 occlusion manager in web — Electron does not fix native surface stacking.

Injection script can reuse `packages/shared/preview/preview-runtime.js` with invoke redirected to Electron bridge token path (mirror `desktop_bridge_script` in `preview_bridge/mod.rs`).

### 7. AppShot under Electron (Phase 3)

Recommended path:

```text
Electron main  --spawn/IPC-->  atmos-appshot-helper (Rust binary)
                              (logic extracted from apps/desktop/src-tauri/src/appshot
                               or shared crate)
```

- Permissions windows can be Electron BrowserWindows loading the same HTML routes.
- Do not block Phase 0–2 on AppShot.

### 8. Data directories & concurrent shells

| Concern | Guidance |
|---------|----------|
| Server port / manifest | `runtime-manager` already shared via `~/.atmos/runtime_manifest.json` |
| Both shells running | Allowed for dogfood; document “prefer one shell for preview cookie / AppShot permissions” |
| Electron userData | `app.getPath('userData')` for handoff files; do not collide with Tauri app config filenames carelessly — namespace `agent-chat-handoff` paths per shell if needed |
| ATMOS_DATA_DIR | Align with Server expectations; match Tauri desktop data dir policy where possible for dogfood continuity |

### 9. Packaging & updater (Phase 4 / M8)

| Channel | Artifact | Updater feed |
|---------|----------|--------------|
| Production | Tauri (`release-desktop`) | existing `latest.json` / desktop tags |
| Experimental | Electron (`desktop-electron-*` tag or internal only) | **separate** feed or disabled updater until parity |

Never point Electron builds at the production Tauri updater endpoint until Phase 5 decision.

### 10. Process model (what users / devs should expect)

```text
# Tauri dogfood/prod
Atmos.app (Tauri)
  └─ Atmos Server (Rust)

# Electron dogfood
Atmos Electron.app
  ├─ Electron Main (Node)
  ├─ Electron Renderer (Chromium)  ← only UI web engine
  ├─ (optional) GPU / utility processes
  └─ Atmos Server (Rust)
  └─ (optional) AppShot helper (Rust)
```

No Tauri process appears in the Electron tree.

## Security & permissions

- **Preview isolation:** separate session/partition; no privileged desktop IPC from target pages.
- **Cookie import:** local-only; same threat model as APP-041; Electron must not expose Keychain-touching commands to non-first-party renderers.
- **Capability parity:** document mapping from Tauri capabilities JSON to Electron allowlist in `ipc/router.ts`.
- **DevTools:** Electron may enable DevTools in dogfood builds; production policy TBD at Phase 5 (Tauri currently disables `open_devtools` in release).

## Rollout plan

Ordered, mergeable steps.

### Phase 0 — Scaffold (M1–M6, M9)

1. Add `desktop-bridge.ts` with tauri adapter + no-op/none.
2. Route 2–3 existing helpers through bridge (`get_api_config` path, logger) without behavior change on Tauri.
3. Create `apps/desktop-electron` minimal main/preload/window.
4. Wire ensure Server + load `web-out` / runtime web.
5. Implement `get_api_config`, `write_log` on Electron router.
6. Add `just dev-desktop-electron` (+ docs in `apps/desktop-electron/AGENTS.md`).
7. Verify `just dev-desktop` still works.

### Phase 1 — Desktop basics

8. Notifications, dialogs, external open, version info.
9. Agent chat window + handoff read/write.
10. macOS titlebar inset + traffic light padding reuse from web hooks.
11. Expand capability matrix statuses.

### Phase 2 — Preview

12. `WebContentsView` manager + partition.
13. Full `preview_bridge_*` command set.
14. Reuse APP-029 occlusion hide/show.
15. Chrome DevTools for preview.

### Phase 3 — Native-adjacent

16. Cookie import/clear into preview session.
17. Tunnel connector commands.
18. AppShot Rust helper integration.

### Phase 4 — Package dogfood

19. electron-builder / signing for internal builds.
20. Separate update channel or updater off.
21. Neutral runtime path (N1) if not done earlier.

### Phase 5 — Default shell decision (product)

22. Parity checklist sign-off (TEST.md acceptance).
23. Explicit proposal to flip `release-desktop` default — **out of band product decision**, not automatic.

## Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| Dual maintenance forever | Hard Phase 5 decision; matrix must not stay half-done without timeline review |
| Electron reads Tauri binary paths | Phase 0 only; move to `dist/desktop-runtime` (N1) |
| IPC security holes | contextIsolation, partition, allowlist, no nodeIntegration |
| Preview stacking still broken | Keep APP-029; do not claim Electron fixes it |
| AppShot delay | Explicit unsupported until Phase 3; UI degrades |
| Updater accident | Separate channels (M8) |
| Both shells fight Server lifecycle | Prefer single owner per session; on quit stop only if this shell started/owned the instance — align with supervisor semantics |

**Tradeoff:** Larger install and RAM on Electron accepted to gain Chromium consistency.

**Tradeoff:** Command-name freeze couples Electron to historical Tauri names — acceptable for migration; a clean rename can wait until single-shell world.

**Rollback:** Delete or ignore `apps/desktop-electron`; Tauri path untouched. Bridge can remain (tauri-only) with no harm.

## Dependencies & compatibility

- Depends on: existing desktop runtime layout, APP-009 shell concepts, APP-011 preview transport semantics, APP-029 occlusion (web), APP-041 cookie model (Phase 3), APP-021 AppShot (Phase 3), APP-012 tunnel (Phase 3).
- Does not require API/WS protocol changes for Phase 0–1.
- Minimum: macOS dogfood first is acceptable; Windows/Linux Electron can follow once main path is stable.

## Open questions

- [ ] Exact ownership when two shells call `ensure_running` then one quits — should quit always `stop_running` or only if refcount zero? (Prefer document current Tauri behavior and match Electron.)
- [ ] Whether to extract AppShot into `crates/appshot` vs keep under desktop-tauri until Phase 3.
- [ ] electron-builder vs forge for Phase 4.
- [ ] Windows WebView2 Tauri vs Electron priority for dogfood (likely Electron multi-platform later).

## Appendix A — Capability matrix template

Maintain this table in-repo (TECH or PROGRESS) during implementation:

| Command / capability | Tauri | Electron | Phase | Notes |
|----------------------|-------|----------|-------|-------|
| Main window + Server | done | | 0 | |
| `get_api_config` | done | | 0 | |
| `write_log` | done | | 0 | |
| Agent chat window | done | | 1 | |
| Preview embedded | done | | 2 | |
| Preview DevTools | Safari Inspector | Chrome DevTools | 2 | intentional engine diff |
| Cookie import | done | | 3 | |
| AppShot | done | | 3 | Rust helper |
| Tunnel | done | | 3 | |
| Production updater | done | unsupported | 4–5 | separate channel |

## Appendix B — “Perfect migration” stance

| Goal | Stance |
|------|--------|
| Feature / capability parity | **Yes — required before default switch** |
| Perfect behavioral identity | **No — not required** |
| Keep Tauri during experiment | **Yes** |
| Keep Rust Server | **Yes** |
| Keep Tauri UI framework under Electron | **No** |

## Appendix C — Mapping discussion → design

| Discussion conclusion | Where it lives |
|----------------------|----------------|
| Electron viable; Tauri not ideal for IDE-like tool | BRAINSTORM + PRD goals |
| Cannot one-click Tauri→Chromium; CEF experimental | BRAINSTORM Option C rejected for primary path |
| DevTools = engine-bound (Safari vs Chrome) | TECH preview + matrix |
| Keep Rust ≠ keep Tauri; not two UI engines | TECH Scope + process model |
| Dual shell + bridge for safe try | Architecture + Phase 0 |
| AppShot stay Rust | D6 + Phase 3 |
| Occlusion remains | D10 + Phase 2 |
