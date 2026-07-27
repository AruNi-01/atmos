# Brainstorm · APP-045: Desktop Electron Dual Shell

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos Desktop today is a **Tauri 2** shell around a static `apps/web` export plus a shared **Atmos Server** runtime (`runtime-manager`). Product logic lives mainly in web + Rust server; the shell owns windows, native bridges, embedded preview webviews, cookie stores, AppShot, updater, and macOS-specific UI behavior.

Pain that triggered this work:

- **macOS UI engine is WKWebView (Safari)**, not Chromium. DevTools are Safari Web Inspector. Input, selection, editor, and terminal behavior often diverge from Chrome.
- **Native child webview stacking** cannot participate in React z-index (see APP-029). Dialogs and popovers over desktop-native preview remain hard.
- Tauri’s default philosophy (system WebView, small binary) optimizes for package size. For an **IDE-like developer tool**, engine consistency and Chrome-class debugging matter more than install size.
- Official **Tauri CEF / Chromium** backends exist experimentally but are **not** production-ready as a one-line engine switch. They would not remove child-surface occlusion either.

Constraint from product owners: **try Electron without killing Tauri**. Both shells must coexist; production release stays Tauri until Electron reaches feature parity.

## Goals (draft)

1. **Primary** — Run Atmos UI on a Chromium shell (Electron) for evaluation and eventual migration, while Tauri remains the default ship path.
2. **Primary** — Share one `apps/web` and one Atmos Server runtime so product features are not forked.
3. **Secondary** — Isolate shell-specific code behind a stable Desktop Bridge so future engine changes do not rewrite the app.
4. **Non-goal (this brainstorm)** — “Perfect” bit-identical behavior across shells on day one.

## Options

### Option A — Hard cutover to Electron

Replace `apps/desktop` with Electron; drop Tauri.

**Pros**: Single shell; no dual maintenance long-term.  
**Cons**: High release risk; no easy rollback; blocks shipping while Electron is incomplete.  
**Unknown**: How long parity takes for preview / AppShot / cookies.

### Option B — Dual shell, shared UI + runtime, Desktop Bridge (recommended)

Keep `apps/desktop` (Tauri). Add `apps/desktop-electron`. Frontend talks only to a shell-agnostic bridge. Shared prepare-runtime pipeline.

**Pros**: Tauri stays green; Electron can lag features safely; clear ownership boundaries.  
**Cons**: Two shells to maintain until cutover; temporary dual test burden.  
**Unknown**: Exact AppShot packaging for Electron helper.

### Option C — Tauri CEF only (no Electron)

Vendor or enable experimental CEF backend for Tauri.

**Pros**: Stay in Tauri ecosystem; possibly keep more of today’s Rust command layer.  
**Cons**: Experimental; custom CLI/bundle; still not a config flip; heavy Chromium payload without Electron’s mature desktop ecosystem; high fork maintenance.  
**Unknown**: Parity of `add_child`, data stores, plugins with CEF.

### Option D — Hybrid: WKWebView main UI + Chromium only for preview

Keep Tauri main window; embed CEF/Chromium only for Atmos Browser preview.

**Pros**: Smaller blast radius; Chrome DevTools for preview only.  
**Cons**: Does not fix main-app WKWebView UI issues; two engines in one app; complex lifecycle.  
**Unknown**: Integration cost vs full Electron shell.

## Key forks in the road

- **Fork 1**: Hard cutover vs dual shell → **decide in PRD** (lean dual shell).
- **Fork 2**: Electron as second app vs CEF-inside-Tauri → **decide in PRD/TECH** (lean Electron dual shell for evaluation).
- **Fork 3**: Does “keep Rust” mean keep Tauri? → **No** — Rust Server / helpers without Tauri. Decide wording in TECH.
- **Fork 4**: When does default release switch from Tauri to Electron? → **decide in PRD milestones** (parity checklist, not calendar alone).
- **Fork 5**: AppShot — rewrite in Node vs Rust helper under Electron → **decide in TECH** (prefer Rust helper).
- **Fork 6**: Shared runtime path layout (neutral `dist/` vs read Tauri binaries path) → **decide in TECH**.

## Open questions

- [ ] Windows / Linux Electron targets in v1 dogfood, or macOS-first only? → PRD
- [ ] Updater channel naming so Electron packages never overwrite Tauri auto-update feeds → TECH
- [ ] Whether both shells may attach to the same `runtime-manager` instance simultaneously → TECH
- [ ] Minimum parity matrix for “Electron default” vs “Electron experimental” → PRD + TECH
- [ ] Branding / product name for internal Electron builds (same “Atmos” vs “Atmos Electron”) → PRD

## References

- Existing desktop: `apps/desktop/`, `apps/desktop/AGENTS.md`, `apps/desktop/src-tauri/`
- Web desktop adapters: `apps/web/src/shared/lib/desktop-runtime.ts`, `desktop-preview-bridge.ts`, appshot client
- Runtime layout: `scripts/desktop/prepare-sidecar.sh`, `layout-runtime-bundle.*`
- Related specs:
  - `APP-009_desktop-tauri` — original Tauri desktop design
  - `APP-011_preview-cross-origin-extend` — desktop-native preview transport
  - `APP-021_appshots-cross-app-snapshot` — AppShot native
  - `APP-029_native-preview-occlusion` — native surface stacking
  - `APP-041_browser-cookie-sync` — WebKit data store / cookie import
  - `APP-012_tunnel-connector` — tunnel host control from desktop shell

## Ready to promote

- Promote to PRD:
  - Dual shell coexistence (Tauri production + Electron experimental)
  - Feature-parity goal without claiming perfect behavioral identity
  - Shared web + Atmos Server; no product fork
  - Explicit out-of-scope: CEF-as-default, same-day cutover, package-size parity
- Promote to TECH:
  - Desktop Bridge protocol and shell detection
  - `apps/desktop-electron` layout and IPC
  - Shared runtime prepare pipeline
  - Command parity matrix and phased rollout (Phase 0–4)
  - AppShot as Rust helper; preview as WebContentsView + partition
  - Release channel separation
