# Brainstorm · APP-059: Browser Host & Settings

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Browser Use is now reliable (snapshot-scoped refs, honest routing, renderer-owned tabs) but still a **tool the agent must already find**. If no Browser chrome is mounted, `tabs open` / `state` fail closed. Humans already have two surfaces — right sidebar `BrowserPanel` and center-stage browser tabs — plus a layout toggle `rsShowBrowser`. Agents cannot create either surface, and there is no Settings home for Browser itself.

Trigger: after the Browser Use hardening pass, the remaining leap is **ensure-then-act** plus a user-owned default surface (sidebar vs center).

Who feels it: Desktop builders who want the agent to open pages in *their* Browser, and anyone hunting cookie / sidebar / download prefs across Layout, Desktop Use, and implicit defaults.

## Goals (draft)

- Primary: agent can open a real Atmos Browser tab without the user pre-opening one; placement follows a user setting.
- Primary: Settings gains a **Browser** page that owns all Browser product prefs.
- Secondary: one agent-facing loop (capabilities from `prepare`), not two tutorials.
- Non-goal: MCP, first-class `browser_*` tools, faking `semantic_v2` on embedded.

## Options

### Option A — Agent picks `--surface sidebar|center`
Agent decides where the tab goes.

**Pros**: flexible per task.
**Cons**: fights the user's layout; models will guess; two more flags in the skill.
**Unknown**: none — rejected.

### Option B — User setting is the only placement; agent only says “open”
Settings `Default surface`: Sidebar | Center tabs. `tabs open` / first `state` **ensures** that chrome, then binds.

**Pros**: user owns layout; agent loop stays short; matches “open a browser” mental model.
**Cons**: cannot put one task in center and the next in sidebar without changing Settings.
**Unknown**: none for v1 — this is the locked shape.

### Option C — Always open center (or always sidebar)
Hard-code one chrome.

**Pros**: simplest code.
**Cons**: ignores the two surfaces we already shipped; user asked for a setting.
**Unknown**: none — rejected.

## Key forks in the road

- **Placement authority**: user setting, not agent flag — locked for PRD.
- **Ensure vs fail-closed**: first bound action may create chrome — locked for PRD.
- **Existing target**: if `--target-id` is already bound, open an in-panel tab there; do not spawn a second chrome — locked for TECH.
- **Hide-sidebar vs default-sidebar**: choosing Sidebar as default turns the sidebar Browser module on — locked for PRD.
- **Desktop Use on the Browser page**: link only, do not move TCC / engine install — locked for PRD.

## Open questions

- [x] Default surface for existing users → **sidebar** (current product home).
- [x] Agent `--surface` override → **out of scope** for v1.
- [x] Web (non-Desktop) ensure → Settings + human center/sidebar only; embedded control plane stays Desktop.

## References

- Existing chrome: `apps/web/src/app-shell/RightSidebar.tsx`, `use-browser-center-tabs.ts`, `BrowserPanel.tsx`
- Agent tab bus: `use-browser-agent-tab-bridge.ts`, `browser-use-control.ts` `/v1/tabs`
- Layout toggle: `layout-settings-store.ts` `rsShowBrowser`
- Settings IA: `settings-modal-data.ts`, `SettingsModalRule.md`
- Related: APP-052 (Browser Use / no MCP), APP-053 (webview), APP-041 (cookie sync)

## Ready to promote

- Promote to PRD: ensure-then-act; Settings → Browser; default surface sidebar|center; agent does not choose surface.
- Promote to TECH: `ensureSurface` on the renderer command bus; `functionSettings` group `browser`; capabilities on `prepare`/`state`; skill one-loop rewrite.
