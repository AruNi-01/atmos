# PRD · APP-045: Desktop Electron Dual Shell

> Product Requirements · WHAT and WHY. Enable a second Chromium-based desktop shell alongside the existing Tauri shell without blocking production.

## Context

- **Problem**: Atmos Desktop on macOS renders in WKWebView. Developer-tool workflows suffer from Safari-class DevTools, engine-specific UI bugs, and native preview stacking limits. Evaluating Electron (full Chromium UI) is the most reliable way to validate whether a Chromium shell improves daily use.
- **Why now**: Tauri CEF is not a production switch; full Electron cutover is too risky without a parallel path. The product needs a **safe experiment** that does not interrupt Tauri releases.
- **Related specs**:
  - Builds on `APP-009_desktop-tauri` (current desktop shell)
  - Constrains / reimplements shell surfaces for `APP-011`, `APP-021`, `APP-029`, `APP-041`, `APP-012`
  - Does not replace Atmos Server / Computer runtime (`APP-016`, `APP-023`)

## Goals

1. **Primary** — Developers can run Atmos on **Electron** for dogfood while **Tauri remains the default production desktop**.
2. **Primary** — One product UI (`apps/web`) and one local Atmos Server runtime are shared; no long-lived feature fork between shells.
3. **Primary** — Shell differences are isolated behind a **Desktop Bridge** so web code is not littered with Tauri-only imports.
4. **Secondary** — Reach a documented **feature-parity** bar where Electron can become the default ship path later without a second rewrite.
5. **Secondary** — Improve macOS alignment with Chrome (DevTools, input, editor/terminal behavior) once Electron is in use.

## Users & Scenarios

- **Primary persona**: Atmos maintainers and internal dogfooders evaluating desktop quality.
- **Secondary persona**: End users on the production Tauri desktop (must not regress).
- **Key scenarios**:
  1. Maintainer runs `just dev-desktop` (Tauri) and `just dev-desktop-electron` in the same repo; both load the same web build and local server.
  2. Maintainer exercises main workbench, agent chat window, and (as implemented) preview on Electron without losing Tauri release ability.
  3. End user continues to install and auto-update **Tauri** builds until an explicit default-shell decision.

## User Stories

- As a maintainer, I want a Chromium desktop shell available for daily dogfood, so that I can judge engine-related UI and DevTools quality against Tauri.
- As a maintainer, I want Tauri production packaging and update channels unchanged, so that shipping is not blocked by the Electron experiment.
- As a product engineer, I want desktop capabilities invoked through one bridge API, so that new features are not implemented twice with divergent contracts.
- As an end user (post-parity), I want the same Atmos capabilities on the default shell, so that migration does not remove preview, cookies, AppShot, or tunnel control.

## Functional Requirements

### Must Have

- **M1 — Dual shells coexist**: Repository hosts Tauri (`apps/desktop`) and Electron (`apps/desktop-electron`) shells. Neither is required to delete the other for the experiment phase.
- **M2 — Shared UI artifact**: Both shells load the same desktop static export of `apps/web` (`BUILD_TARGET=desktop` / equivalent). Product pages are not forked per shell.
- **M3 — Shared Atmos Server runtime**: Both shells use the existing runtime layout / `runtime-manager` model (loopback Atmos Server). Business API/WS stays on Server, not reimplemented in Node.
- **M4 — Desktop Bridge**: Web code detects shell via a single bridge (`none` | `tauri` | `electron`) and invokes desktop commands through a stable protocol. Tauri keeps working while call sites migrate off raw `@tauri-apps/*`.
- **M5 — Tauri non-regression**: Existing `just dev-desktop`, `just build-desktop`, and production `release-desktop` paths remain valid defaults. Electron work must not break Tauri startup or release.
- **M6 — Electron Phase-0 runnable**: Electron shell can start, ensure/reuse local Atmos Server, load the web UI, and expose at least `get_api_config` (and logging) over the bridge.
- **M7 — Explicit capability matrix**: Every desktop command (windows, preview, cookies, AppShot, tunnel, updater, …) is listed with Tauri/Electron status (`done` / `partial` / `unsupported`). Unsupported Electron commands fail safely with clear errors; UI may degrade, not crash.
- **M8 — Separate release identity**: Electron packages must not overwrite Tauri auto-update feeds or confuse users into “upgrading” into an incomplete shell until parity is declared.
- **M9 — Keep Rust without keeping Tauri**: Electron shell must not embed Tauri. Rust continues as Atmos Server and optional native helpers (e.g. AppShot), not as a second UI framework.

### Nice to Have

- **N1**: Neutral shared runtime output directory (not under `src-tauri/binaries`) consumed by both shells.
- **N2**: Full preview bridge parity on Electron (`WebContentsView` + session partition + pick mode).
- **N3**: Cookie import / clear targeting Electron session partitions (semantic parity with APP-041).
- **N4**: AppShot via existing Rust helper under Electron.
- **N5**: Tunnel connector control parity on Electron.
- **N6**: Internal signed Electron builds for dogfood.
- **N7**: Engine-specific UI branches (e.g. WebKit-only editor workarounds) keyed by shell/engine, not by “any desktop”.

## Out of Scope

- **Deleting Tauri in this spec’s first delivery** — cutover is a later milestone gated on parity, not an initial requirement.
- **“Perfect” behavioral identity** — Chromium vs WKWebView will differ; acceptance is capability parity + documented differences.
- **Making native preview z-index magically work** — child/native surfaces still need APP-029-style occlusion (Electron included).
- **Official Tauri CEF production backend** — may be re-evaluated later; not the vehicle for this dual-shell experiment.
- **Rewriting Atmos Server or agent/tmux stack in Node**.
- **Mobile desktop shell**.
- **Package-size parity with Tauri** — Electron will be larger; accepted for the experiment.
- **Changing default public download to Electron** without an explicit follow-up decision and parity sign-off.

## Success Metrics

- **Leading**: Maintainers can dogfood Electron daily for main workbench flows without disabling Tauri CI/release.
- **Leading**: ≥95% of existing desktop bridge call sites go through the shared bridge (no new raw `@tauri-apps` imports outside the Tauri adapter).
- **Lagging**: Capability matrix reaches “done” for all Must Have production desktop capabilities before any default-shell switch proposal.
- **Qualitative**: Chrome DevTools usable on Electron for main window and (when implemented) preview; Tauri users report no regression from dual-shell work.
- **Aspirational**: Measurable reduction in macOS-only UI bugs on the Electron dogfood track (tracked in IMPROVEMENT later; not a hard gate for Phase 0).

## Risks & Open Questions

- **Risk**: Dual maintenance cost if Electron stalls at partial parity.
- **Risk**: Shared `~/.atmos` / runtime_manifest contention when both shells run at once.
- **Risk**: Security model drift (Tauri capabilities vs Electron IPC privileges).
- **Risk**: Updater/channel collision if packaging is careless.
- **Open (TECH)**: Exact IPC dispatch table and preview session isolation design.
- **Open (TECH)**: AppShot helper packaging under Electron.
- **Open (product)**: When to flip default shell — requires parity sign-off checklist in TECH/TEST.

## Milestones

| Phase | Outcome | PRD items |
|-------|---------|-----------|
| **Phase 0** | Bridge + Electron boots main UI + Server | M1–M6, M8–M9 (scaffolding) |
| **Phase 1** | Desktop basics: notifications, dialogs, multi-window chat/handoff, version | M4, M7 expansion |
| **Phase 2** | Preview bridge parity (embedded + detached) | N2, M7 |
| **Phase 3** | Cookies, tunnel, AppShot helpers | N3–N5, M7 |
| **Phase 4** | Packaging / internal dogfood channel | N6, M8 |
| **Phase 5 (decision)** | Parity review → optional default-shell switch proposal | not automatic |

**Status (2026-07-28):** Phase 5 product cutover applied — Electron is the production default desktop shell for maintainers and release entry points. Tauri remains buildable for non-regression. Shared data contracts are mandatory (not shell-forked).
