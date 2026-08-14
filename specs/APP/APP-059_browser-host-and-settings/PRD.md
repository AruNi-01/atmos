# PRD · APP-059: Browser Host & Settings

> WHAT & WHY. Product domain: **browser**. Builds on APP-052 (Browser Use, no MCP) and APP-053 (in-app webview).

## Context

- **Problem**: Agents can drive a page only after a human has already opened Atmos Browser. Placement (sidebar vs center) is implicit. Browser prefs are scattered (Layout “show Browser”, cookies, downloads, agent chrome).
- **Why now**: Browser Use is reliable enough to become a **host the product opens**, not a tool that hopes chrome exists.
- **Related**: APP-052, APP-053, APP-041. Does not change Desktop Use TCC / engine install (APP-052).

## Goals

1. Primary — A user setting chooses where new Browser sessions appear: **right sidebar** or **center tabs**. Agents and humans follow it.
2. Primary — An agent can open a Browser tab without a pre-existing panel (`ensure-then-act`).
3. Secondary — Settings has a **Browser** page that owns all Browser product preferences.

## Users & Scenarios

- **Primary persona**: Desktop builder using `/browser-use` or `atmos browser-use --backend embedded`.
- **Key scenarios**:
  1. Settings → Browser → Default surface = Center tabs. Agent runs `tabs --action open --url https://example.com`. A center Browser tab appears and binds; no human pre-click.
  2. Default surface = Sidebar. Same command opens the right-sidebar Browser module (showing it if hidden) and a page tab inside it.
  3. Agent already has a `--target-id`. `tabs open` adds a tab **in that panel**, wherever it already lives.
  4. User opens Settings → Browser and changes homepage, agent chrome, downloads, sidebar visibility, cookie-related Browser prefs — without visiting Layout / Desktop Use except via a link.

## User Stories

- As a builder, I want the agent to open pages in the chrome I already use so I can watch or take over.
- As a builder, I want one Settings page for Browser so I am not hunting toggles.
- As an agent, I want `state` / `tabs open` to succeed on a fresh Desktop window so I do not ask the user to “open a Browser tab first”.

## Functional Requirements

### Must Have

- **M1: Default surface setting** — `Sidebar` | `Center tabs`. Default for existing users: **Sidebar**. Sentence case in English UI. Persisted with other function settings (not a one-off localStorage key).
- **M2: Agent ensure-then-act** — On Desktop, if no Browser host is mounted, `tabs --action open` and bind-mode `state` (no `--target-id`, zero bound guests) create the default surface, then bind. Failure is only when Desktop / renderer cannot create chrome (`embedded_browser_host_unavailable`).
- **M3: Existing target stays put** — If `--target-id` is bound, open/select/close act on that panel. Do not spawn a second sidebar or center chrome.
- **M4: Last-active before ensure** — If guests already exist and the call has no target, keep today’s honest routing (last-active host, else one host, else `browser_ambiguous_target`). Ensure only when **zero** hosts exist.
- **M5: Sidebar default implies module on** — Choosing Sidebar as default surface turns on `rsShowBrowser` and focuses the sidebar Browser tab when ensuring. Choosing Center does not hide the sidebar module.
- **M6: Settings → Browser page** — New Settings section in the Interface group, next to Layout / Editor / Canvas / Terminal. Owns:
  - Default surface (M1)
  - Show Browser in the right sidebar (moved UI from Layout; same persisted key)
  - New tab / homepage URL
  - Show agent activity chrome (badge + guest cursor)
  - Embedded download root explanation (path is still the approved Browser Use downloads directory)
  - Entry points / links for cookie sync (APP-041) and “system Chrome / Desktop Use” (do not duplicate engine/TCC controls)
- **M7: Human open follows the same default** — Welcome / slash / empty-state “open Browser” uses M1. Existing “Move to center” on a sidebar panel stays as an explicit move, not a settings change.
- **M8: One agent loop** — Skill + `prepare` expose a **capabilities** object (`tabs`, `query`, `continuation`, `upload`, `press_key`, `snapshot_format`). Skill is one procedure that branches on capabilities. Do not teach two full tutorials.
- **M9: Placement is not an agent flag** — No `--surface` in v1. User setting is the source of truth.

### Nice to Have

- Remember last human-used surface as a “Follow last used” third option.
- Per-workspace default surface.
- Agent `--surface` override after v1 if a real task needs both chromes at once.

## Non-Goals

- MCP or first-class `browser_*` tools (APP-052).
- Faking `semantic_v2` on embedded; auto-snapshot then click `e0`.
- Moving Desktop Use driver / TCC / AppShot into the Browser page.
- Web (non-Desktop) embedded control plane.
- Changing external CUA `start_session` behavior.
- Mobile.

## Success

- Fresh Desktop workspace: `atmos browser-use --backend embedded tabs --action open --url https://example.com` returns `ok: true` with a `target_id`, and the page is visible in the user’s default surface.
- Changing Default surface and repeating the command opens the other chrome, not both.
- Settings search finds “Browser”, “sidebar”, “center tabs”, “homepage”, “agent chrome”.
- Layout no longer hosts the only Browser toggle; Browser page is canonical.

## Out of scope copy

English UI: `Sidebar`, `Center tabs`, `Browser` — not `SIDEBAR` / `CENTER`.
