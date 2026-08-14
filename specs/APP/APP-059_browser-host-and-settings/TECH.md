# TECH · APP-059: Browser Host & Settings

> HOW. Domain: **browser**. WebSocket-first for settings persistence (existing `functionSettingsApi`). No new REST. No MCP.

<!-- updated 2026-08-14: initial design -->

## Scope

| Area | Change |
|------|--------|
| Settings | New `browser` tab; Interface group; i18n `settings.browser.*` + `settings.modal.sections.browser` |
| Function settings | New group `browser` (or extend `layout` only for `rsShowBrowser`) |
| Renderer host | `ensureSurface` on the Browser command bus |
| Agent tab bridge | `open` / bind-mode `state` may ensure before acting |
| Control plane | `/v1/tabs` open and `/v1/state` bind already talk to renderer; no new HTTP routes |
| Skill | One loop + capabilities; version bump |
| Layout settings UI | Remove Browser row from Right sidebar layout card; keep key + store method |

## Locked decisions

1. **User owns placement.** Persist `browser.default_surface`: `"sidebar" | "center"`. Default `"sidebar"`.
2. **Ensure only when zero hosts.** Last-active / single-host / ambiguous stay as shipped in the hardening pass.
3. **Bound `target_id` never relocates chrome.**
4. **No `--surface` CLI flag** in this spec.
5. **Sidebar default ⇒ `rsShowBrowser = true`** on save and on ensure.
6. Desktop Use stays on its own Settings page; Browser page links to `desktop-use`.

## Architecture

```text
User setting (functionSettings group `browser`)
  default_surface: sidebar | center
  new_tab_url: string
  show_agent_chrome: bool

Agent / CLI
  atmos browser-use tabs --action open --url …
  atmos browser-use state --backend embedded     # bind, zero guests

Embedded control plane (main)
  POST /v1/tabs { action: open, url }
  POST /v1/state { }                             # bind mode
        │
        ▼
  emitAgentTab { tabAction: open|ensure-bind, url? }
        │
        ▼
Renderer (same window that owns the host)
  read default_surface
  if zero Browser panels mounted:
      ensureSurface(placement, url?)
  else:
      resolveContext (existing honesty)
  open in-panel tab / bind session
  ack { target_id, tab_id, surface }
```

Do **not** let Electron main create a `<webview>` or write tab stores. Ensure is renderer-owned, same as today’s tab CRUD.

## Data

### Function settings group `browser`

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `default_surface` | `"sidebar" \| "center"` | `"sidebar"` | M1 |
| `new_tab_url` | string | `""` | Empty = current empty-tab behavior (`about:blank` / user typed URL) |
| `show_agent_chrome` | bool | `true` | Badge + guest cursor |

`right_sidebar_show_browser` remains on the existing **layout** group so sidebar module visibility does not fork. Browser Settings writes it through `setRightSidebarShowBrowser`.

Store: `apps/web/src/features/settings/store/browser-settings-store.ts` (zustand + `functionSettingsApi.update('browser', key, value)`), matching terminal/layout stores.

### Agent tab payload (extend, do not replace)

```ts
type AgentTabPayload = {
  requestId: string;
  tabAction: "open" | "select" | "close" | "ensure-bind";
  url?: string;
  targetId?: string;
};
```

`ensure-bind` is bind-mode `state` when the renderer reports zero panels. `open` with a URL and zero panels also ensures, then opens.

Ack adds:

```ts
surface?: "sidebar" | "center";
```

CLI / crate pass `surface` through on the JSON result (optional field). Binding still stores only `{backend,target_id,tab_id}`.

## Renderer: `ensureSurface`

Add to `use-browser-tab-commands.ts` (or a sibling `use-browser-host.ts` if the command union would blur). Keep **one FIFO per context**.

```ts
ensureSurface(input: {
  contextId: string;          // workspace/project context, not session id
  placement: "sidebar" | "center";
  url?: string;
}): Promise<{ tabId: string; evictedSessionIds: string[]; surface: "sidebar" | "center" }>;
```

### Sidebar path

1. `setRightSidebarShowBrowser(true)` if needed.
2. Expand right sidebar if collapsed (existing RightSidebar collapse API).
3. Select sidebar tab `"browser"`.
4. If `url`, enqueue existing `openTab` on the sidebar `browserContextId`.
5. Wait for `sessionForTab` (same 8s bind wait as today’s open).

### Center path

1. `useBrowserCenterTabsStore.openBrowser(contextId)` if this workspace has no center browser, **or** reuse the last center browser for that context when one exists and we are ensuring (not when the user asked for a brand-new human center tab).
2. `setCenterStageParams({ tab: centerTab.value })`.
3. If `url`, `openTab` on `centerTab.browserContextId`.
4. Wait for bind.

**Reuse rule (locked):** ensure prefers one chrome per workspace per placement. Do not open a new center Browser on every agent `tabs open` when a center Browser already exists for that workspace.

### Human entry points

`use-open-browser-center-tab.ts` and Welcome / slash “open Browser” read `default_surface` and call `ensureSurface` instead of hard-coding center or sidebar.

## Control plane

No new HTTP path. Changes in `requestAgentTab` / `/v1/state` bind:

- Bind with **zero** sessions: emit `ensure-bind` (or `open` with `new_tab_url` / `about:blank`) instead of `ok: false` + `browser_route_unavailable`.
- `/v1/tabs` `open` already emits `open`; renderer performs ensure when `resolveContext` would have returned `embedded_browser_host_unavailable`.
- Timeouts stay host 15s > renderer 8s + bind 8s.
- Unknown explicit `target_id` stays `browser_route_unavailable` (do not ensure a *different* surface to “save” a bad id).

`prepare` / health capabilities array already exists; add structured:

```json
"capability_flags": {
  "tabs": true,
  "query": true,
  "continuation": false,
  "upload": false,
  "press_key": true,
  "snapshot_format": "embedded_dom_v1",
  "ensure_surface": true
}
```

External `prepare` returns the inverse flags (`continuation` / `upload` true, `tabs` / `press_key` / `ensure_surface` false).

## Settings UI

Follow `SettingsModalRule.md`.

- `SettingsModalTab` += `"browser"`.
- `SETTINGS_GROUPS.interface.items` += `"browser"` after `"terminal"` (or after `"layout"` — **after terminal** keeps layout as chrome chrome, Browser as the product).
- New `BrowserSettingsSection.tsx`: cards
  1. **Placement** — segmented control Sidebar | Center tabs; description: “New Browser sessions from you or an agent.”
  2. **Right sidebar** — show Browser module (existing switch).
  3. **New tab** — URL input; empty allowed.
  4. **Agent** — show activity chrome switch.
  5. **Downloads** — read-only path `~/.atmos/data/browser-use/downloads` + one sentence; no free-form dir (still enforced by control plane).
  6. **Related** — links to Settings → Desktop Use, and cookie / site-data actions already in the Browser toolbar (do not rebuild APP-041 here; link or short “Clear site data is in the Browser menu” note).

Layout `RightSidebarLayoutSettingsSection`: delete the Browser row so there is a single editor. Search keywords on the Browser section include `sidebar`, `center`, `webview`, `homepage`, `download`.

i18n: `apps/web/messages/en.json` + `zh.json`. English sentence case. Chinese natural prose; product name `Browser` stays English.

## Skill (`skills/atmos-browser-use`)

Rewrite to **one** loop:

1. `prepare` (backend omitted → binding / Desktop prefers embedded).
2. Read `capability_flags`.
3. `state` (ensure + bind if embedded and empty).
4. Act with refs from that snapshot.
5. `tabs` only if `tabs: true`.

Document: “If no tab is open, embedded `state` / `tabs open` creates one in the user’s default surface (Settings → Browser).”

## Rollout

1. Settings store + Browser page + move layout toggle (no agent behavior change).
2. `ensureSurface` + human entry points honor `default_surface`.
3. Agent tab bridge / control-plane bind-empty path.
4. Capabilities + skill rewrite.
5. Tests in TEST.md.

Each step stays shippable; 1–2 are useful without 3.

## Risks

| Risk | Mitigation |
|------|------------|
| Ensure opens chrome in the wrong window | Keep last-active host routing; ensure only at zero hosts |
| Center `openBrowser` creates a new center tab every call | Reuse last center browser per workspace on ensure |
| User hid sidebar but default is sidebar | Saving Sidebar default and ensure both set `rsShowBrowser` |
| Settings group schema missing on older computers | Default locally; `functionSettingsApi` create-on-write like other groups |
| Dual FIFO (ensure + open) races | One command token; ensure internally calls open after chrome exists |

## Non-goals (tech)

- New WS actions (unless function-settings group registration already requires a known key list — extend that list, do not invent a parallel channel).
- Main-process tab store.
- Broadcasting `agent-tab` to every window.
