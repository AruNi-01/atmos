# BRAINSTORM · APP-058: Workspace Device Preview

> Working title in earlier drafts: "手机模拟器 / phone sim". Renamed to **Device** — see [D8](#d8-surface-naming).
> Problem space, dependency evidence, and the decisions that shaped [PRD.md](./PRD.md) / [TECH.md](./TECH.md).

## Problem

Mobile work is the only workflow where the Atmos feedback loop leaves the workspace. Code changes happen in a worktree; the result is only visible in `Simulator.app`. Two costs:

1. **Human**: constant app switching, and the simulator window fights the Atmos window for screen space.
2. **Agent**: an agent can edit React Native code but cannot see or touch the running app. It can only ask the human to "tap the button in the simulator". No shared pixel surface = no verification loop.

Secondary problem: when the machine is missing Xcode / a runtime / a device, today's answer is a wall of shell commands. Atmos already solved this shape with workspace setup cards (probe → stop on a card → give a button).

## Constraints that are not negotiable

| Constraint | Source |
|-----------|--------|
| `Simulator.app` cannot be embedded in another window | Apple; only framebuffer streaming is legal |
| iOS simulators only boot on macOS | Apple |
| Atmos does not ship iOS/Android system images | size + license |
| No second frame-capture protocol of our own | `IOSurface` / `scrcpy` already exist; a screenshot-polling loop is a dead end |
| The user must never be told to run `npx serve-sim` | capture is infrastructure, not a user step |
| One physical device = one capture stream | human + agent + both surfaces share it |

## Dependency audit (2026-08-13, measured not assumed)

This is the load-bearing research; earlier drafts locked packages that do not exist.

| Package | npm state | Notes |
|---------|-----------|-------|
| `@expo/serve-sim` | **exists** `0.1.37` (published 2026-07-30, 3 versions) | Apache-2.0, `cpu: ["arm64"]`, `engines.node >=20`, `bin: dist/serve-sim.js` |
| `serve-sim` (unscoped) | exists `0.1.45` | repo `EvanBacon/serve-sim` (2668 stars, last push 2026-07-17); version numbers are **inverted** vs the scoped package |
| `@expo/serve-emu` | **404** | GitHub `expo/serve-emu` exists (Apache-2.0) but nothing is published |
| `serve-emu` (unscoped) | exists `0.0.3` | published by **`jiunshinn`, not Expo**; `engines: bun`, `bin: src/cli.ts` |
| `@expo/hub-client` | **404** | workspace-internal `devDependency` of `expo-device-hub`, bundled into its `dist`, never published |
| `@expo/hub-components` / `hub-apple-utils` / `hub-android-utils` | **404** | same as above |
| `expo-device-hub` | exists `0.3.0` | full DevTools dashboard; npm says MIT, GitHub says NOASSERTION |

`@expo/serve-sim@0.1.37` tarball contents (7.3 MB packed / 15.8 MB unpacked):

```text
dist/serve-sim.js                                 921 KB   ESM entry (type: module)
dist/native/serve-sim-native.node                 990 KB   Node native addon
dist/bin/LiveKitWebRTC.framework/LiveKitWebRTC    12.3 MB  WebRTC (only in the scoped package)
dist/simcam/…  dist/simax/…                                camera injection + AX helpers
LICENSE (Apache-2.0)  +  Resources/LICENSE.webrtc
```

Verified CLI surface (from the packed bundle, not the README prose):

- Flags that exist: `--no-preview`, `--detach`, `-q`, `-p/--port`, `--codec auto|h264|mjpeg`, `--transport http|webrtc`, `--host <addr>` **defaulting to `127.0.0.1`**, `--max-dimension`, `--mjpeg-fps`, `--mjpeg-quality`, `--video-fps`, `--video-bitrate`, `--list`, `--kill`.
- Helper endpoints that exist: `/health`, `/healthz`, `/config`, `/stream.mjpeg`, `/stream.avcc` (H.264 over HTTP), `/ws`, `/ax`, `/foreground`, `/logs`, `/stream-settings`.
- Input verbs also exist as CLI subcommands: `gesture`, `button`, `type`, `rotate`, `event-log`.
- `--host` help text: *"Interface to bind the preview server to. Use 0.0.0.0 to expose on the LAN — only on trusted networks: **the preview exposes a token-gated shell-exec route**."* → `--no-preview` is a security requirement, not a UI preference.
- No auth on the helper itself. Only a `verifyClient` hook appears in the bundle; nothing token-shaped.

Comparison that matters for degradation: the **unscoped** package ships `Package.swift` + `Sources/SimNative/*.swift` (capture engine, H264 encoder, HID injector) and can rebuild its native module locally; the **scoped** package ships only the compiled `.node`. So a pinned scoped helper cannot self-heal after an Xcode major bump — it needs a new helper version. That drives [D3](#d3-helper-distribution).

## Host-integration audit

| Question | Answer in today's code |
|----------|------------------------|
| Can `apps/api` (Rust) call Electron main? | **No.** No `electron` / `ipcMain` reference in `apps/api`; the dependency runs the other way (`runtime/ensure.ts` spawns the server binary) |
| How does the web UI reach shell capabilities? | preload IPC — `window.__ATMOS_DESKTOP__.invoke(cmd)` → `ipcMain.handle("atmos:desktop-invoke")` → `ipc/handlers.ts` (e.g. `desktop_use_*`) |
| How does the CLI reach Electron main? | loopback HTTP + discovery file — `browser/browser-use-control.ts` writes `control.json`, the Rust embedded backend reads it |
| What does the canvas relay do? | HTTP → WS notification → **renderer** (the tldraw editor lives there). Not a path into main |
| Is `browser` a dual-surface precedent for shared state? | **No — the opposite.** Right sidebar keys sessions by `workspaceId`, center by `center-browser:{id}`; "move to center" clones and clears |
| Is `browser` in `FixedTab`? | No. `FixedTab = overview \| terminal \| wiki \| project-wiki \| code-review`; center browser tabs are dynamic `browser:{ctx}:{id}` values |
| Does the server know the "currently selected workspace"? | No. `activeWorkspaceId` is client-only state |

## Decisions

### D1 Control plane

**Panel ↔ DeviceBridge over preload IPC; CLI ↔ DeviceBridge over loopback HTTP + a discovery file. `apps/api` is not involved.**

Rejected: routing `device.*` through the Rust server's `/ws`. That channel is browser↔server; DeviceBridge owns OS processes and lives in Electron main, so the "WebSocket-first" rule does not apply — it would require inventing a Rust↔Electron RPC that has no precedent in the repo. Consequence accepted: the surface only works inside Atmos Desktop; hosted web shows a "Requires Atmos Desktop" state.

### D2 Screen client

**Own thin consumer in `apps/web/src/features/device/` speaking `/config` + `/stream.avcc` | `/stream.mjpeg` + `/ws`.**

Forced by the audit — `@expo/hub-client` is unpublished. This is not "our own capture protocol": we consume the helper's contract and still never touch framebuffers.

### D3 Helper distribution

**Engine model: pin a manifest in `extraResources`, install the helper into `~/.atmos/data/device-helper/<version>/` on first use.**

Rejected: bundling into the app. Three reasons: (a) the payload is 15.8 MB dominated by a WebRTC framework we default to *off*; (b) multiple Mach-O binaries + a framework complicate signing/notarization; (c) `serve-sim` uses Xcode private API, so an Xcode major bump breaks capture — with a bundled helper the only fix is a Desktop release, while a manifest bump is a same-day fix. Precedent already exists: `desktop-use` pins `engine-manifest.json` and installs under `~/.atmos/data/desktop-use/`.

### D4 Android

**Out of v1. Follow-up spec.**

There is no installable Expo-published Android capture package; the unscoped `serve-emu` name belongs to a third party and requires Bun. Keeping it in v1 scope means an unresolvable blocker inside the release. TECH keeps a `DeviceAdapter` seam so the follow-up drops in without redesign. Candidates for that spec: wait for Expo to publish → vendor `expo/serve-emu` with a NOTICE entry → consume `scrcpy-server` directly.

### D5 Remote Mac

**Out of v1. Follow-up spec.** It needs a new Relay stream class (APP-016) and only matters once local iOS works. v1 stops at loopback and says so.

### D6 Helper authentication

**A token-gated loopback proxy in Electron main sits in front of the helper; nothing else may talk to the helper.**

Loopback is not authentication: any local process — and any malicious page the user opens, since WebSocket ignores CORS — could otherwise connect to the helper and inject touches. Rejected: depending on the helper's `verifyClient` Origin behavior, which is unspecified upstream and could change. The proxy also gives one place to enforce "this workspace may only reach its own helper".

### D7 Transport

**Local: HTTP, H.264 when available, MJPEG otherwise. WebRTC stays off unless the user opts in, and falls back to HTTP on failure. Never a black screen.** Remote (follow-up) must force H.264 with dimension/fps/bitrate caps — cross-network MJPEG is not viable, and the helper already exposes those caps as flags.

### D8 Surface naming

**Surface is "Device" (`设备`), CLI is `atmos device`, i18n namespace `device.*`.** The feature already covers iPad and Apple Watch upstream and will cover Android physical devices later; "phone" would be wrong from day one. English labels use sentence case (`Device`, not `DEVICE`).

### D9 Default device selection

**Last used for this workspace → otherwise the first available iPhone `simctl` lists under the newest installed runtime → otherwise `simctl create`.**

Rejected: a curated ranking table (`Pro Max > Pro > Plus > …`). Apple renames tiers most years, so the table rots and needs maintenance for no user-visible gain. Remembering the user's choice beats guessing it.

### D10 Center surface shape

**Openable/closable center surface tab, not an always-on fixed tab.** Most workspaces are not mobile projects; a permanent tab is permanent noise. The right sidebar tab is the discovery entry point.

## Open questions (must be answered by the P0 spike, before product code)

| Id | Question | Blocks |
|----|----------|--------|
| Q1 | Does `dist/native/serve-sim-native.node` load under Electron's Node ABI (is it N-API)? | whole approach — if not, we need `ELECTRON_RUN_AS_NODE` against a matching Node, or the feature is not viable |
| Q2 | Exact `--no-preview --detach -q` JSON shape (pid / port / stream url), and whether the combination is even supported | session lifecycle |
| Q3 | Does `--host` govern the **helper** bind when `--no-preview` is set (help text says "preview server")? | security posture; loopback assertion stays as a backstop either way |
| Q4 | `/config` fields, `/stream.avcc` frame framing, `/ws` touch packet layout, `/ax` coordinate space | D2 consumer implementation |
| Q5 | Does the helper ever open a port besides the one we pass `-p`? | acceptance "preview port not listening" |

The spike writes its answers into this file as a "Contract record" section. No product code until Q1/Q2/Q4 are answered.

## Explicitly rejected ideas

| Idea | Why not |
|------|---------|
| Embed `expo-device-hub` in an iframe | Expo-branded dashboard; wrong product surface, and its internals are not a public API |
| Use the helper's own preview page as the panel | ships an Expo UI plus a token-gated shell-exec route into Atmos |
| `simctl io screenshot` polling as a stream fallback | second capture protocol, bad latency, no input path |
| Device farm / cloud simulators | not our product |
| Put the surface on Canvas | Canvas is an infinite-canvas product; a device stream is a workspace surface |
| Give the agent its own helper instance | two streams over one device; the agent must see exactly what the human sees |
| A DeviceBridge crate under `crates/` | the lifecycle owner must be the process that owns the window and the child processes |
