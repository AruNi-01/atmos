# Atmos patches on serve-sim 0.1.37

These are the only first-party behavior changes. Prefer rebasing them when bumping the pin.

1. **Loopback bind** (`packages/serve-sim/src/index.ts`)
   - `--host` is ignored unless already loopback; listen address is always `127.0.0.1`.
   - `/exec` and `/exec-ws` stay token + Origin gated; global `--kill` with no device is refused.
2. **Hide serve-sim brand + GitHub jump** (device sidebar / empty state)
   - No `serve-sim` wordmark, no `https://github.com/expo/serve-sim` link.
   - Empty state does not mention `bunx @expo/serve-sim`.
3. **Left device panel matches the Tools floating card** (`Panel.tsx`, `resize-handle.tsx`, `grid-panel.tsx`)
   - Inset, rounded, bordered card instead of a flush full-height dock.
   - Header uses the same title + close control as Tools.
4. **Tools starts closed** (`client.tsx`)
   - First visit does not open the right Tools pane. Last explicit open/close is still remembered.
5. **Preview chrome stays on the phone** (`client.tsx`)
   - Hide the floating left Devices button; the device-name control still opens the list.
   - Device name and a two-button Stop/Tools pill sit above the phone, matching the bottom toolbar.
   - Stop asks for confirm, then posts `atmos:simulator-stop` so Atmos kills the helper.
   - No live/connecting pill. Long names ellipsize. Stream or start errors turn the name yellow.
   - Corner Tools / DevTools rails stay commented out.
6. **Compiled helper can exec itself** (`host-bin.ts`)
   - Tools used `/$bunfs/root/serve-sim`, which `/bin/sh` cannot see.
   - Inject and rewrite commands to the on-disk `~/.atmos/runtime/serve-sim/…` binary.
7. **No global `--kill` from the preview iframe** (`useSimStream.ts`, `host-bin.ts`, `/exec`)
   - Disconnect posts `atmos:simulator-stop` instead of `serve-sim --kill`.
   - `/exec` and `/exec-ws` refuse a kill command that has no device argument.
