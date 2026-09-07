# Atmos patches on serve-emu 0.0.5

These are the only first-party behavior changes. Prefer rebasing them when bumping the pin.

1. **Loopback bind** (`packages/serve-emu/src/cli.ts`)
   - `--host` is ignored unless already loopback; listen address is always `127.0.0.1`.
2. **Hide serve-emu brand** (`status-bar.tsx`)
   - Header title is "Device preview", not `serve-emu`.
3. **Preview chrome matches vendored serve-sim** (`app.tsx`, `styles.css`, `control-bar.tsx`)
   - Device identity control opens the device list.
   - Back / Home / Recents sit **below** the device (`data-atmos-device-actions`) as Android 3-button nav icons.
   - Tools live in a **right** overlay panel (`data-atmos-tools-panel`) and start closed.
   - Devices live in a **left** overlay panel; both panels slide in/out like serve-sim (no column dividers).
   - Stop asks for confirm, then posts `atmos:simulator-stop`.
   - The device column is content-sized (no stretched black stage / page scroll).
4. **Claim-safe picker** (`device-panel.tsx`)
   - Physical USB devices are hidden.
   - When the iframe is locked with `?device=`, Stop stays on the claimed device.
   - Selecting or starting a **free** other target posts `atmos:simulator-device` `{ udid, platform: "android" }` to the parent so Atmos can update the claim. Foreign Stop is refused.
5. **Packed scrcpy-server path** (`scrcpy-server.ts`)
   - Resolve `vendor/scrcpy-server-v4.0` next to `process.execPath` so `bun --compile` does not look under `/$bunfs/`.
6. **Packed preview UI** (`ui-dir.ts`, `pack.sh`)
   - Ship `dist/ui` next to the binary as `ui/` and resolve it from `process.execPath`. Without this, the iframe is a plain `not found` 404.
