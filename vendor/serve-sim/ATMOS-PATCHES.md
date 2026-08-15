# Atmos patches on serve-sim 0.1.37

These are the only first-party behavior changes. Prefer rebasing them when bumping the pin.

1. **Loopback bind** (`packages/serve-sim/src/index.ts`)
   - `--host` is ignored unless already loopback; listen address is always `127.0.0.1`.
   - `/exec` and `/exec-ws` stay identical to upstream (token + Origin gated).
2. **Hide serve-sim brand + GitHub jump** (device sidebar / empty state)
   - No `serve-sim` wordmark, no `https://github.com/expo/serve-sim` link.
   - Empty state does not mention `bunx @expo/serve-sim`.
3. **Left device panel matches the Tools floating card** (`Panel.tsx`, `resize-handle.tsx`, `grid-panel.tsx`)
   - Inset, rounded, bordered card instead of a flush full-height dock.
   - Header uses the same title + close control as Tools.
4. **Tools starts closed** (`client.tsx`)
   - First visit does not open the right Tools pane. Last explicit open/close is still remembered.
