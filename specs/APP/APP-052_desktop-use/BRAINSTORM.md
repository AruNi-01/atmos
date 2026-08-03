# BRAINSTORM · APP-052：Desktop Use

## Problem

Atmos can orchestrate terminal agents and capture AppShot context, but:

1. **AppShot capture** is implemented inside Electron (`osascript` + `screencapture`), scattering OS permission ownership and making capture hard to reuse from CLI/agents.
2. Agents cannot **drive** the local desktop GUI (click/type) through an Atmos-owned surface.
3. Users need a **Settings** home for install/lifecycle of an optional control engine and for OS permissions — not a one-off AppShot permissions window.

## Non-goals (locked)

- No public **Cua** / trycua branding or install flows pointing at cua.ai.
- No **MCP** surface for Desktop Use.
- No merge into APP-016 **`atmos computer` / Computer / Relay** semantics.
- No vendoring the full trycua/cua monorepo.
- No remote GUI drive of a different Relay machine in M1.

## Options considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| A. Agent-facing raw third-party MCP | Fast for Claude | Brand leak, multi-agent config, no Atmos control plane | Reject |
| B. Nest under `atmos computer` | One CLI tree | Collides with APP-016 machine identity | Reject |
| C. **Desktop Use** capability + sidecar/helper + CLI + Settings | Clear naming, Atmos owns control plane, optional engine download | More packaging work | **Accept** |
| D. Keep capture in Electron forever | Less move | Split permission owners | Reject for production path |

## Settled product language

| Concept | Name |
|---------|------|
| Remote machine + Relay | `computer` / `atmos computer` (unchanged) |
| Local desktop interaction capability | **Desktop Use** |
| Process / crate / dirs | `desktop-use` |
| CLI | `atmos desktop-use` |

## Architecture sketch

```
Atmos control plane (CLI + Settings + optional IPC)
        │
        ▼
Desktop Use surface (crate + CLI + Desktop helper path)
  ├── Capture  — frontmost + screenshot + a11y (replaces Electron osascript path)
  └── Control  — optional engine (lazy ensure); drive click/type/screenshot
        ▲
        │
 Electron AppShot (records / protocol / pending UI only)
```

## Open decisions (autonomous defaults for ship)

1. **Capture always available** on supported platforms without control-engine download.
2. **Control engine** is optional; `driver ensure` installs a pinned binary under `~/.atmos/desktop-use/`; offline/not-installed is a first-class status.
3. **Permissions UX** lives in Settings → Desktop Use; standalone AppShot permissions window is no longer the primary recovery path (deep-links redirect to Settings).
4. **Internal** adapters may wrap a third-party control binary; user-facing text never names vendors.

## Related

- [APP-016 Atmos Computer](../APP-016_atmos-computer/PRD.md) — orthogonal machine identity
- [APP-021 Appshots](../APP-021_appshots-cross-app-snapshot/PRD.md) — business layer retained; capture backend migrates
