# Atmos patches on serve-emu 0.0.5

These are the only first-party behavior changes. Prefer rebasing them when bumping the pin.

1. **Loopback bind** (`packages/serve-emu/src/cli.ts`)
   - `--host` is ignored unless already loopback; listen address is always `127.0.0.1`.
2. **Hide serve-emu brand** (`status-bar.tsx`)
   - Header title is "Device preview", not `serve-emu`.
3. **Preview chrome matches vendored serve-sim** (`app.tsx`, `styles.css`)
   - Device identity control opens the device list.
   - Back / Home / Recents / Power sit **below** the device (`data-atmos-device-actions`).
   - Tools live in a **right** collapsible panel (`data-atmos-tools-panel`) and start closed.
   - Stop asks for confirm, then posts `atmos:simulator-stop`.
4. **Claim-safe picker** (`device-panel.tsx`)
   - Physical USB devices are hidden.
   - When the iframe is locked with `?device=`, other targets cannot be selected, started, or stopped.
5. **Packed scrcpy-server path** (`scrcpy-server.ts`)
   - Resolve `vendor/scrcpy-server-v4.0` next to `process.execPath` so `bun --compile` does not look under `/$bunfs/`.
