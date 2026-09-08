# Atmos patches on serve-emu 0.0.5

These are the only first-party behavior changes. Prefer rebasing them when bumping the pin.

1. **Loopback bind** (`packages/serve-emu/src/cli.ts`)
   - `--host` is ignored unless already loopback; listen address is always `127.0.0.1`.
2. **Hide serve-emu brand** (`status-bar.tsx`)
   - Header title is "Device preview", not `serve-emu`.
3. **Preview chrome matches vendored serve-sim** (`app.tsx`, `styles.css`, `control-bar.tsx`)
   - Device identity control opens the device list.
   - Back / Home / Recents sit **below** the device (`data-atmos-device-actions`) as Android 3-button nav icons.
   - A circular icon-only Agent button sits to the **right** of that nav pill (not inside it). Hover tooltip explains copying the prompt for Agent; **Copied** after success. Click posts `atmos:simulator-agent-copy`; the parent replies `atmos:simulator-agent-copied`.
   - Tools live in a **right** overlay panel (`data-atmos-tools-panel`) and start closed.
   - Devices / Tools overlay as drawers and do not shift the device column.
   - Stop asks for confirm, then posts `atmos:simulator-stop`.
   - The device column is content-sized (no stretched black stage / page scroll).
4. **Claim-safe picker** (`device-panel.tsx`)
   - Physical USB devices are hidden.
   - When the iframe is locked with `?device=`, Stop stays on the claimed device.
   - Selecting or starting a **free** other target posts `atmos:simulator-device` `{ udid, platform: "android" }` to the parent so Atmos can update the claim. Foreign Stop is refused.
5. **Packed scrcpy-server path** (`scrcpy-server.ts`)
   - Packed binary: resolve `vendor/scrcpy-server-v4.0` next to `process.execPath` so `bun --compile` does not look under `/$bunfs/`.
   - `bun run setup` / source runs: write to `packages/serve-emu/vendor/`. Do not use `dirname(process.execPath)` there (`execPath` is the bun CLI).
6. **Packed preview UI** (`ui-dir.ts`, `pack.sh`)
   - Ship `dist/ui` next to the binary as `ui/` and resolve it from `process.execPath`. Without this, the iframe is a plain `not found` 404.
7. **Android device frame** (`android-device-mockup.tsx`, `GET /api/display-chrome`)
   - Wrap the live stream in `react-device-mockup` (`AndroidMockup` / `AndroidTabMockup`).
   - Never draw the mockup camera hole.
   - Probe `dumpsys window displays` for a nav bar already present in the emulator framebuffer; hide the mockup nav bar when the stream already has one.
