# TEST · APP-045: Desktop Electron Dual Shell

> Test Plan · verify dual-shell coexistence, bridge correctness, and phased Electron parity. References PRD APP-045 and TECH APP-045.

## Test strategy

- **Unit / integration (Bun):** Desktop bridge detection, invoke routing mocks, unsupported-command errors, engine-specific branch helpers.
- **Shell smoke (manual + scripted where cheap):** Tauri and Electron each boot, ensure Server, load UI, `get_api_config`.
- **Regression:** Tauri `just dev-desktop` / build path must remain green whenever Electron scaffolding lands.
- **E2E (Playwright):** Limited — desktop shells are not the web harness target. Prefer bridge unit tests + manual desktop smoke. If a headless Electron smoke is added later, record under Coverage Status.
- **agent-browser:** Not primary (desktop-native). Optional only if testing hosted web fallback paths unrelated to shells.
- **Manual-only:** Multi-window, preview bounds, cookie import, AppShot permissions, updater channel isolation, dual-shell concurrent run.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Dual shells coexist | S1, S2 |
| M2 Shared UI artifact | S3 |
| M3 Shared Atmos Server | S4, S5 |
| M4 Desktop Bridge | S6, S7, S8 |
| M5 Tauri non-regression | S1, S9 |
| M6 Electron Phase-0 runnable | S2, S4, S6 |
| M7 Capability matrix / safe unsupported | S10 |
| M8 Separate release identity | S11 |
| M9 No Tauri under Electron | S12 |
| N2 Preview (when implemented) | S13, S14 |
| N3 Cookies (when implemented) | S15 |
| N4 AppShot (when implemented) | S16 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Manual / smoke | shell | `just dev-desktop` | prepared runtime | main window; Server up | planned |
| S2 | Manual / smoke | shell | `just dev-desktop-electron` | same runtime layout | main window; Server up | planned |
| S3 | Manual | shell | both shells load same `web/` hash or build id | one `prepare-desktop-runtime` | same UI build identity if exposed | planned |
| S4 | Bun + Manual | `bun test` + shell | bridge `get_api_config` | Server on loopback | `{host,port}` usable by web | planned |
| S5 | Manual | shell | quit Electron after ensure | runtime_manifest | Server stop policy matches TECH | planned |
| S6 | Bun | `bun test` | `desktop-bridge` unit tests | jsdom/window mocks | tauri vs electron vs none routing | planned |
| S7 | Bun | `bun test` | no raw tauri import lint optional | grep/CI later | bridge-only for new code | planned |
| S8 | Manual | shell | migrate one helper on Tauri | Tauri app | behavior unchanged | planned |
| S9 | Manual / CI | `just build-desktop` or scoped | existing desktop build | clean tree | build succeeds | planned |
| S10 | Bun + Manual | `bun test` + Electron | unsupported cmd | Electron Phase 0 | `DESKTOP_CMD_UNSUPPORTED` or clear error; no crash | planned |
| S11 | Manual / release review | docs + config | inspect updater endpoints | electron-builder / tauri conf | Electron ≠ prod Tauri feed | planned |
| S12 | Manual | process list | run Electron | Activity Monitor / `ps` | no Tauri/wry parent; Chromium + Server | planned |
| S13 | Manual | Electron | open desktop-native preview | Phase 2 | surface visible; navigate works | planned |
| S14 | Manual | Electron | open DevTools on preview | Phase 2 | Chrome DevTools UI | planned |
| S15 | Manual | Electron | cookie import | Phase 3 + browser profiles | authenticated page loads | planned |
| S16 | Manual | Electron | AppShot trigger | Phase 3 + permissions | capture pipeline works | planned |

## Scenarios

### S1 — Tauri still boots (regression)

- **Level**: Manual / smoke  
- **Given**: Repo with dual-shell work merged; runtime prepared.  
- **When**: Developer runs `just dev-desktop`.  
- **Then**: Main window shows Atmos UI; local Server is reachable; no startup error page.  
- **Signals**: Window visible; `get_api_config` port works; existing workbench loads.

### S2 — Electron Phase-0 boots

- **Level**: Manual / smoke  
- **Given**: `apps/desktop-electron` scaffolded; runtime prepared.  
- **When**: Developer runs `just dev-desktop-electron`.  
- **Then**: Chromium window loads desktop web UI; Server reachable.  
- **Signals**: `__ATMOS_DESKTOP__.shell === 'electron'`; API health OK.

### S3 — Shared UI artifact

- **Level**: Manual  
- **Given**: Single prepare produced one `web/` tree.  
- **When**: Both shells load that tree.  
- **Then**: Same app routes and asset build (no per-shell Next export).  
- **Signals**: Identical static files path or build id; feature flags match.

### S4 — `get_api_config` via bridge

- **Level**: Bun unit + Manual  
- **Given**: Mock or real shell adapters.  
- **When**: Web calls `desktopInvoke('get_api_config')`.  
- **Then**: Returns `{ host, port }` consistent with Server.  
- **Signals**: WS/HTTP to that port succeeds.

### S5 — Server lifecycle on Electron quit

- **Level**: Manual  
- **Given**: Electron started Server (or attached per supervisor rules).  
- **When**: User quits Electron.  
- **Then**: Behavior matches TECH ownership policy (document actual: stop vs leave running).  
- **Signals**: Port closed or still owned by manifest rules; no zombie without policy.

### S6 — Shell detection

- **Level**: Bun  
- **Given**: Window fixtures for none / tauri internals / `__ATMOS_DESKTOP__`.  
- **When**: `detectShell()` runs.  
- **Then**: Correct enum; `isDesktopRuntime` true only for tauri|electron.  
- **Signals**: Unit assertions.

### S7 — Bridge is the invoke path on Electron

- **Level**: Bun / Manual  
- **Given**: Electron preload installed.  
- **When**: Feature calls `desktopInvoke`.  
- **Then**: IPC hits main router; no dependency on `__TAURI_INTERNALS__`.  
- **Signals**: Handler log; `isTauriRuntime() === false`.

### S8 — Tauri path unchanged after bridge migration of one helper

- **Level**: Manual  
- **Given**: e.g. logger or api config uses bridge.  
- **When**: Use Tauri desktop normally.  
- **Then**: No regression in logging or API connection.  
- **Signals**: Same UX as before change.

### S9 — Tauri production build still works

- **Level**: Manual / CI  
- **Given**: Dual-shell files present.  
- **When**: `just build-desktop` (or project-standard desktop build).  
- **Then**: Build succeeds.  
- **Signals**: Exit 0; artifact produced.

### S10 — Unsupported Electron command fails safely

- **Level**: Bun + Manual  
- **Given**: Phase 0 Electron without preview commands.  
- **When**: UI or test invokes `preview_bridge_open`.  
- **Then**: Rejected with clear error; renderer does not white-screen.  
- **Signals**: Error code/message; optional UI degrade.

### S11 — Updater channel isolation

- **Level**: Manual / release review  
- **Given**: Electron packaging config exists (Phase 4) or is planned.  
- **When**: Inspect updater endpoints / publish tags.  
- **Then**: Electron does not publish to production Tauri `latest.json` feed.  
- **Signals**: Config review checklist.

### S12 — Electron process tree has no Tauri

- **Level**: Manual  
- **Given**: Electron app running.  
- **When**: Inspect processes.  
- **Then**: Chromium/Electron + Atmos Server (+ optional helper); no `tauri`/`Atmos` Tauri parent required for UI.  
- **Signals**: `ps` / Activity Monitor.

### S13 — Preview embedded (Phase 2)

- **Level**: Manual  
- **Given**: Phase 2 complete.  
- **When**: Open desktop-native preview URL in sidebar.  
- **Then**: Surface shows target page; bounds track panel.  
- **Signals**: Visible site; navigate works.

### S14 — Preview DevTools are Chromium (Phase 2)

- **Level**: Manual  
- **Given**: Preview open on Electron.  
- **When**: Trigger `preview_bridge_open_devtools`.  
- **Then**: Chrome DevTools opens (not Safari Web Inspector).  
- **Signals**: DevTools chrome UI.

### S15 — Cookie import (Phase 3)

- **Level**: Manual  
- **Given**: APP-041 flow on Electron.  
- **When**: Import cookies and open authenticated site in preview.  
- **Then**: Session applies to preview partition only.  
- **Signals**: Logged-in page; app shell cookies untouched.

### S16 — AppShot (Phase 3)

- **Level**: Manual  
- **Given**: Permissions granted; helper installed.  
- **When**: Trigger capture.  
- **Then**: Pending/accept flow works as on Tauri.  
- **Signals**: Record list entry / clipboard per product rules.

## Performance & load budgets

- Phase 0 cold start is not gated to Tauri size/RAM; record anecdotal numbers in Coverage Status for awareness only.
- Preview bounds updates should not drop input unusable lag (qualitative dogfood).

## Regression checklist

- [ ] `just dev-desktop` still starts after Electron files land.
- [ ] No new unconditional production release default to Electron.
- [ ] Bridge does not break hosted web (`shell === 'none'`).
- [ ] Preview partition never receives privileged preload.
- [ ] Dual-shell concurrent run documented; cookie/AppShot quirks known.
- [ ] CodeMirror/WebKit-only workarounds do not apply incorrectly on Electron (N7).
- [ ] APP-029 occlusion still invoked for desktop-native preview on both shells when preview exists.

## Exploratory agent-browser checks

Not required for desktop shell work. If validating pure web routes outside shells, follow `specs/references/agent-browser-setup.md` and record as optional.

## Acceptance criteria

### Phase 0 (merge-blocking for scaffold)

- [ ] S1 and S2 pass on maintainer machine (macOS at minimum).
- [ ] S4 / S6 unit coverage for bridge detection and invoke routing exists or is explicitly deferred with reason in Coverage Status.
- [ ] S10: unsupported commands do not crash Electron.
- [ ] S12: no Tauri UI framework required to run Electron shell.
- [ ] S9 or equivalent: Tauri build/dev path not broken.
- [ ] Capability matrix started in TECH Appendix A / PROGRESS.

### Before declaring Electron dogfood-default for team

- [ ] Phase 1 scenarios for multi-window chat/handoff pass.
- [ ] Known gaps listed in matrix (preview/cookies/AppShot).

### Before proposing production default switch (Phase 5)

- [ ] All Must Have production desktop capabilities `done` on Electron in matrix.
- [ ] S11 updater isolation reviewed.
- [ ] Explicit product sign-off (not automatic from this TEST file).

## Manual verification steps

1. Prepare runtime (`prepare-sidecar` / future `prepare-desktop-runtime`).
2. Run Tauri; open workbench; confirm Server.
3. Quit Tauri; run Electron; confirm workbench; confirm `shell === 'electron'`.
4. Optionally run both; note port/manifest behavior.
5. On Electron Phase 0, attempt a preview command if UI exposes it — expect safe failure.
6. After Phase 2+, re-run preview + DevTools checks (S13–S14).

## Non-coverage

- Full Playwright E2E of Tauri/Electron native windows (no harness yet).
- Performance parity vs Tauri.
- Pixel-perfect titlebar alignment.
- CEF-in-Tauri.
- Windows/Linux Electron until macOS path is stable (may be added later).

## Coverage Status

> Phase 0 foundation implemented 2026-07-27.

| Scenario | Status | Evidence |
|----------|--------|----------|
| S1 Tauri still boots | not_run (env/time); path intact | `justfile` `dev-desktop` / `build-desktop` / `release-desktop` unchanged; see implementer `tauri-release-path.txt` |
| S2 Electron Phase-0 boots | ✅ | Electron GUI probe: ensure Server + main window loaded (`electron-boot.log`) |
| S4 `get_api_config` | ✅ | `bun run smoke:boot` + bridge unit tests |
| S6 Shell detection | ✅ | `bun test apps/web/src/shared/lib/__tests__/desktop-bridge.test.ts` (11 pass) |
| S10 Unsupported command | ✅ | bridge tests + `smoke:router` / `smoke:boot` |
| S12 No Tauri under Electron | ✅ | `package.json` has no `@tauri-apps/*`; process is Electron + Atmos Server |

Commands:

```bash
bun test apps/web/src/shared/lib/__tests__/desktop-bridge.test.ts
cd apps/desktop-electron && bun run smoke:router && bun run smoke:boot
just dev-desktop-electron   # GUI dogfood
```

### Full dual-shell product paths (shipped after skeptic fixes)

| Contract | Test |
|----------|------|
| Bridge detect/invoke | `bun test apps/web/src/shared/lib/__tests__/desktop-bridge.test.ts` |
| Electron shell = desktop (cookie menu gate) | `bun test apps/web/src/shared/lib/__tests__/desktop-gates.test.ts` |
| Preview event remap + token (shipped `runtime-events.ts`) | `cd apps/desktop-electron && bun test src/preview/event-remap.test.ts` |
| AppShot `status.supported` + `list.record_dir` + detail shape | `bun test src/appshot/contract.test.ts` |
| Cookie helper list (real Keychain bin) | `bun test src/cookies/helper.test.ts` |
| 52 IPC commands + ensure Server | `bun run smoke:router` / `smoke:boot` |

Product gates: cookie UI + preview show/hide use **`isDesktopRuntime()`** (not Tauri-only). AppShot IPC matches web `AppshotStatus` / `AppshotRecordListItem` (`supported`, `macos`, `record_dir`).

```bash
cargo build -p browser-cookies --bin atmos-browser-cookies --release
bun test apps/web/src/shared/lib/__tests__/desktop-bridge.test.ts apps/web/src/shared/lib/__tests__/desktop-gates.test.ts
cd apps/desktop-electron && bun test && bun run smoke:router && bun run smoke:boot
```
