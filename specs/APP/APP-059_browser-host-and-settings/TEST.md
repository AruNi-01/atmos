# TEST · APP-059: Browser Host & Settings

> Verification contract for ensure-then-act and the Browser settings page.

## Test strategy

- **Rust / bun unit + structural** for settings keys, command-bus ensure, skill/capabilities strings, and control-plane bind-empty behavior.
- **Component / store tests** for `default_surface` → sidebar vs center ensure (no Electron guest required: assert store + URL params + sidebar tab).
- **Agent-browser exploratory** for Settings IA and English casing.
- No Playwright E2E required for v1 unless QUALITY-003 already covers Settings modal.

## Coverage map

| PRD | Scenario |
|-----|----------|
| M1 | S1 default surface persist |
| M2 | S2 ensure on empty `tabs open`; S3 ensure on empty bind `state` |
| M3 | S4 bound target does not spawn second chrome |
| M4 | S5 last-active / ambiguous unchanged when hosts exist |
| M5 | S6 sidebar default turns module on |
| M6 | S7 Settings → Browser page + search |
| M7 | S8 human open follows default |
| M8 | S9 prepare capabilities + skill one-loop |
| M9 | S10 no `--surface` flag |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | bun | `bun test` | `browser-settings-store` persist/default | pending |
| S2 | structural + bun | `bun test` | agent-tab bridge `ensureSurface` on host-unavailable | pending |
| S3 | structural | `bun test` | control plane bind-empty emits ensure, not `ok: false` | pending |
| S4 | bun | `bun test` | open with `targetId` skips ensure | pending |
| S5 | bun | `bun test` | `resolveContext` unchanged when panels > 0 | pending |
| S6 | bun | `bun test` | set default sidebar ⇒ `rsShowBrowser` true | pending |
| S7 | structural | `bun test` | `SettingsModalTab` includes `browser`; layout section has no Browser row | pending |
| S8 | structural | `bun test` | human open helper reads `default_surface` | pending |
| S9 | rust + structural | `cargo test -p browser-use --lib`; skill file | `capability_flags`; skill has one loop | pending |
| S10 | rust | `cargo test -p atmos --bin atmos` | clap has no `--surface` | pending |

## Scenarios

### S1 — Default surface persist
Given a fresh settings store, When the user selects Center tabs, Then `browser.default_surface` is `"center"` and reload keeps it. Signals: store snapshot + `functionSettingsApi.update` key.

### S2 — Empty desktop, tabs open
Given zero mounted Browser panels, When renderer handles `tabAction: open` with a URL, Then it calls `ensureSurface(default_surface)` and acks `ok: true` with `target_id` after bind (or fails only on timeout). Signals: command bus token; ack `surface`.

### S3 — Empty desktop, bind state
Given zero bound guests, When `/v1/state` has no `target_id`, Then the host asks the renderer to ensure + bind instead of `browser_route_unavailable`. Signals: control-plane source contains `ensure-bind` or equivalent; no `ok: false` on zero-session bind.

### S4 — Bound target stays
Given a sidebar guest `sess-1`, When `tabs open` includes `targetId: sess-1`, Then no new center tab is created. Signals: `openBrowser` not called; `openTab` on sidebar context.

### S5 — Hosts exist, no silent ensure
Given two panels and no target, When `tabs open` runs, Then `browser_ambiguous_target` (or last-active single host) — ensure is not used. Signals: `ensureSurface` not invoked.

### S6 — Sidebar default shows module
Given `rsShowBrowser === false`, When the user sets default surface to Sidebar **or** ensure runs with placement sidebar, Then `rsShowBrowser` becomes true. Signals: layout store.

### S7 — Settings page
Given Settings modal, When opening Browser, Then Placement / Sidebar / New tab / Agent / Downloads cards render; Layout no longer has the Browser module row. Signals: `settings-modal-data` keywords; section component.

### S8 — Human open
Given default surface center, When the user triggers “open Browser” from Welcome / slash / empty state, Then a center tab is created (or reused). Signals: `ensureSurface` / center store.

### S9 — Capabilities
Given embedded `prepare`, Then JSON includes `capability_flags.ensure_surface === true` and `tabs === true`. Skill text describes one loop and Settings → Browser. Signals: rust test + skill grep.

### S10 — No agent surface flag
Given `atmos browser-use --help`, Then there is no `--surface`. Signals: clap test.

## Exploratory agent-browser checks

- Settings → Browser: sentence case (`Sidebar`, `Center tabs`), zh locale translated around the product name Browser.
- Toggle default surface; confirm description matches the chrome that actually opens.
- 390px / desktop: section remains a settings console (cards, not marketing).

## Regression checklist

- Existing Browser Use hardening: stale refs, last-active routing, query/truncated, binding end/close.
- APP-053: renderer still owns tabs; main does not `new BrowserWindow` for in-panel chrome.
- Layout other sidebar modules unchanged.

## Acceptance criteria

- M1–M9 each have a scenario with an automated signal, except exploratory casing (manual / agent-browser).
- `cargo test -p browser-use --lib` and targeted bun tests green after impl.

## Non-coverage

- Live CUA external prepare.
- Multi-machine settings sync edge cases beyond existing function-settings behavior.
- Mobile.

## Coverage Status

Not run. Implementation has not started.
