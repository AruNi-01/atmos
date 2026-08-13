# BRAINSTORM · APP-058: Workspace Simulator

> Problem space, measured dependency evidence, decisions, and the **contract record** that unblocked implementation.
> Requirements: [PRD.md](./PRD.md). Design: [TECH.md](./TECH.md).

## Vocabulary (locked)

One word for this feature everywhere — product copy, code, CLI, i18n, paths, error codes: **simulator** (`模拟器`).

| Use | Do not use |
|-----|-----------|
| Simulator surface, `SimulatorBridge`, `simulator_*` IPC, `atmos simulator`, `simulator.*` i18n, `simulatorId`, `simulator_in_use` | device, phone, mobile, handset, emulator (as an Atmos-owned name) |
| `Simulator.app` — always with `.app` — when naming Apple's application | "Simulator" alone for Apple's app, because that is now our surface name |
| Apple's own vocabulary when quoting its CLI: `xcrun simctl list devices`, "device type", "runtime" | renaming third-party identifiers |

The one intentional exception is the last row: `simctl` output keys and Apple's documented terms keep their upstream spelling, because they are third-party identifiers, not names we own. Everything Atmos names is `simulator`.

## Problem

iOS work is the only workflow where the Atmos feedback loop leaves the workspace. Code changes happen in a worktree; the result is only visible in `Simulator.app`. Two costs:

1. **Human**: constant app switching, and `Simulator.app` fights the Atmos window for screen space.
2. **Agent**: an agent can edit React Native code but cannot see or touch the running app. It can only ask the human to "tap the button in the simulator". No shared pixel surface = no verification loop.

Secondary problem: when the machine is missing Xcode, a runtime, or a bootable simulator, today's answer is a wall of shell commands. Atmos already solved this shape with workspace setup cards (probe → stop on a card → give a button).

## Constraints that are not negotiable

| Constraint | Source |
|-----------|--------|
| `Simulator.app` cannot be embedded in another window | Apple; only framebuffer streaming is legal |
| iOS simulators only boot on macOS | Apple |
| Atmos does not ship iOS system images | size + license |
| No second frame-capture protocol of our own | `IOSurface` capture already exists; a screenshot-polling loop is a dead end |
| The user must never be told to run `npx serve-sim` | capture is infrastructure, not a user step |
| One booted simulator = one capture stream | human + agent + both surfaces share it |

## Dependency audit (2026-08-13, measured not assumed)

| Package | npm state | Notes |
|---------|-----------|-------|
| `@expo/serve-sim` | **exists** `0.1.37` (published 2026-07-30, 3 versions) | Apache-2.0, `cpu: ["arm64"]`, `engines.node >=20`, `bin: dist/serve-sim.js` |
| `serve-sim` (unscoped) | exists `0.1.45` | repo `EvanBacon/serve-sim`, last push 2026-07-17; version numbers are **inverted** vs the scoped package |
| `@expo/serve-emu` | **404** | GitHub `expo/serve-emu` exists but nothing is published |
| `serve-emu` (unscoped) | exists `0.0.3` | published by **`jiunshinn`, not Expo**; `engines: bun`, `bin: src/cli.ts` |
| `@expo/hub-client` and the other `@expo/hub-*` | **404** | workspace-internal `devDependencies` of `expo-device-hub`, bundled into its `dist`, never published |
| `expo-device-hub` | exists `0.3.0` | full DevTools dashboard; npm says MIT, GitHub says NOASSERTION |

`@expo/serve-sim@0.1.37` tarball (7.3 MB packed / 15.8 MB unpacked):

```text
dist/serve-sim.js                                 921 KB   ESM entry (type: module)
dist/native/serve-sim-native.node                 990 KB   Node native addon (arm64 Mach-O)
dist/bin/LiveKitWebRTC.framework/LiveKitWebRTC    12.3 MB  WebRTC — only in the scoped package
dist/simcam/…  dist/simax/…                                camera injection + AX helpers
src/*.ts                                                   partial TypeScript sources (middleware, state, ax)
LICENSE (Apache-2.0)  +  Resources/LICENSE.webrtc
```

Comparison that matters for degradation: the **unscoped** package ships `Package.swift` + `Sources/SimNative/*.swift` and can rebuild its native module locally; the **scoped** package ships only the compiled `.node`. A pinned scoped helper therefore cannot self-heal after an Xcode major bump — it needs a new helper version. That drives [D3](#d3-capture-helper-distribution).

## Host-integration audit

| Question | Answer in today's code |
|----------|------------------------|
| Can `apps/api` (Rust) call Electron main? | **No.** No `electron` / `ipcMain` reference in `apps/api`; the dependency runs the other way (`runtime/ensure.ts` spawns the server binary) |
| How does the web UI reach shell capabilities? | preload IPC — `window.__ATMOS_DESKTOP__.invoke(cmd)` → `ipcMain.handle("atmos:desktop-invoke")` → `ipc/handlers.ts` (e.g. `desktop_use_*`) |
| How does the CLI reach Electron main? | loopback HTTP + discovery file — `browser/browser-use-control.ts` writes `control.json`, the Rust embedded backend reads it |
| What does the canvas relay do? | HTTP → WS notification → **renderer** (the tldraw editor lives there). Not a path into main |
| Is `browser` a precedent for shared state across surfaces? | **No — the opposite.** Right sidebar keys sessions by `workspaceId`, center by `center-browser:{id}`; "move to center" clones and clears |
| Is `browser` in `FixedTab`? | No. `FixedTab = overview \| terminal \| wiki \| project-wiki \| code-review`; center browser tabs are dynamic `browser:{ctx}:{id}` values |
| Does the server know the "currently selected workspace"? | No. `activeWorkspaceId` is client-only state |

## Contract record (spike closed 2026-08-13, static analysis of the pinned artifact)

The five questions that used to gate implementation are answered. Evidence is the shipped `@expo/serve-sim@0.1.37` artifact itself (Mach-O load commands, code-signature blobs, bundled JS, and the TypeScript sources included in the tarball).

### C1 — Native addon ABI: **Node-API, loads under Electron**

`dist/native/serve-sim-native.node` exports `_napi_register_module_v1` and `_node_api_module_get_api_version_v1`. It is a Node-API module, so it is ABI-stable across Node and Electron versions and is not tied to a `NODE_MODULE_VERSION`. This removes the risk that gated the whole approach.

Mach-O facts from the same binary:

| Fact | Value | Consequence |
|------|-------|-------------|
| Architecture | `Mach-O 64-bit arm64` | Apple Silicon only, matching `cpu: ["arm64"]` |
| `LC_BUILD_VERSION` | platform macOS, **minos 14.0** | **macOS 14+ is a hard requirement**; probe must check it |
| Code signature | present, `CodeDirectory` flags `0x2` → **ad-hoc** | see C2 |
| Linked/loaded | `SimulatorKit.framework`, `CoreSimulator.framework` (resolved via `dlopen` + `/usr/bin/xcode-select`), `IOSurface`, `VideoToolbox`, `AccessibilityPlatformTranslation`, `/usr/lib/swift/*` | confirms the Xcode-private-API dependency and that `DEVELOPER_DIR` must be in the child environment |
| WebRTC | referenced as `/../bin/LiveKitWebRTC.framework/LiveKitWebRTC` | only needed on the WebRTC path, which is off by default |

### C2 — New blocker found and solved: hardened runtime library validation

The addon is **ad-hoc signed**, not signed by our Team ID. Under macOS hardened runtime, a process may only load libraries signed by the same team or by Apple. Our signed Electron app therefore cannot `dlopen` it as-is.

Resolution: the process that loads the addon needs the **`com.apple.security.cs.disable-library-validation`** entitlement. Since the helper runs as a detached child launched through the app binary, the entitlement goes on the app's mac entitlements plus `entitlementsInherit`. This is a standard requirement for Electron apps that load third-party native modules, and it is recorded as an explicit security tradeoff in [TECH §13](./TECH.md#13-security).

### C3 — Bind surface and the host flag

`startHelper` in the bundle spawns the helper with a **hardcoded `"127.0.0.1"`** host argument (`["--port", port, "--host", host, …]`), and the server's listen call is `listen(port, host ?? "127.0.0.1")`. So the helper binds loopback by default and honours `--host`; passing it explicitly is correct and the "read the actual bind" fallback is a backstop, not the main path.

One residual exposure: the bundled `inspect-webkit` CDP bridge listens with `host === "127.0.0.1" ? "::" : host` and `ipv6Only: false` — that is a **dual-stack all-interfaces bind**. It only starts on the WebKit-inspection path, which we never enable, but the loopback assertion must therefore cover the helper's whole process, not just the stream port.

### C4 — Startup handshake and discovery

`--detach` returns the pid, and the full URL set is published by the helper itself as an atomically written, `0600` per-simulator state file:

```text
$TMPDIR/serve-sim/server-<udid>.json
{ "pid", "port", "device", "url", "streamUrl", "wsUrl", "streamSettings"? }
```

Design consequence: **do not hardcode endpoint paths**. Read `streamUrl` / `wsUrl` from that record (the bundle derives `stream-settings` by replacing the last path segment of `streamUrl`, and we do the same). Endpoint addressing differs between preview mode (`{base}{path}?device=<udid>`) and in-process mode (`{base}/helper/<udid>/{path}`), so consuming the published URLs is the only stable contract. Failures are logged by the helper to `server-<udid>.log` next to the state file, which is what the setup card summarises.

### C5 — Input protocol over `/ws`

Fully decoded from `handleHidMessage`: each client message is **one opcode byte followed by a JSON body**. On attach the server immediately pushes a config frame (width, height, orientation) and re-pushes it whenever orientation changes.

| Opcode | Operation | JSON body |
|--------|-----------|-----------|
| 3 | touch | `{ type: "begin" \| "move" \| "end", x, y, edge? }` |
| 4 | button | `{ button }` or `{ page, usage, phase }` |
| 5 | multi-touch / pinch | `{ type, x1, y1, x2, y2 }` |
| 6 | key | `{ type, usage }` |
| 7 | orientation | `{ orientation }` |
| 8 | CoreAnimation debug | `{ option, enabled }` |
| 9 | memory warning | — |
| 10 | digital crown | `{ delta }` |
| 11 | scroll | `{ dx, dy, x, y }` |
| 12 | software keyboard | — |

Coordinates arrive **normalized** and are multiplied by the captured width/height server-side, so the PRD's `0–1` contract matches upstream exactly and needs no conversion layer.

### C6 — Security confirmed, not assumed

`writeWebSocketAccept` upgrades on nothing but a valid `sec-websocket-key`. **There is no Origin check and no token on the helper.** Any local process, and any page the user happens to open (WebSocket ignores CORS), could connect and inject touches. The token-gated proxy in [D6](#d6-helper-authentication) is therefore mandatory. Separately, the preview server carries a token-gated `/exec` shell route (`execToken` in `previewConfigForState`), which is why `--no-preview` is a security requirement rather than a UI preference.

### Still needs a Mac (verification, not design risk)

| Item | How it is closed |
|------|------------------|
| Actual `dlopen` of the addon inside a signed Atmos build | first run of the implementation branch on macOS 14+ arm64 with the entitlement in place |
| Exact `/stream.avcc` byte framing (AVCC length-prefixed vs Annex-B) | observed on first connect; only the decoder plumbing depends on it |
| Whether any additional listener appears in practice | asserted by the loopback check that ships with the feature |

## Decisions

### D1 Control plane

**Panel ↔ SimulatorBridge over preload IPC; CLI ↔ SimulatorBridge over loopback HTTP + a discovery file. `apps/api` is not involved.**

Rejected: routing `simulator.*` through the Rust server's `/ws`. That channel is browser↔server; SimulatorBridge owns OS processes and lives in Electron main, so the "WebSocket-first" rule does not apply — it would require inventing a Rust↔Electron RPC with no precedent in the repo. Consequence accepted: the surface only works inside Atmos Desktop; hosted web shows a "Requires Atmos Desktop" state.

### D2 Screen client

**Own thin consumer in `apps/web/src/features/simulator/` speaking the helper's published `streamUrl` / `wsUrl` plus the opcode protocol in C5.**

Forced by the audit — `@expo/hub-client` is unpublished. This is not "our own capture protocol": we consume the helper's contract and never touch framebuffers.

### D3 Capture helper distribution

**Engine model: pin a manifest in `extraResources`, install the helper into `~/.atmos/data/simulator-helper/<version>/` on first use.**

Rejected: bundling into the app. Three reasons: (a) the payload is 15.8 MB dominated by a WebRTC framework we default to *off*; (b) multiple Mach-O binaries plus a framework complicate signing and notarization; (c) capture uses Xcode private API, so an Xcode major bump breaks it — with a bundled helper the only fix is a Desktop release, while a manifest bump is a same-day fix. Precedent: `desktop-use` pins `engine-manifest.json` and installs under `~/.atmos/data/desktop-use/`.

### D4 Android

**Not part of this feature.** No installable Expo-published Android capture package exists, and the unscoped npm name belongs to a third party and requires Bun. TECH keeps a `SimulatorAdapter` seam so a future spec can add one without redesign. Candidates for that spec: wait for Expo to publish → vendor `expo/serve-emu` with a NOTICE entry → consume `scrcpy-server` directly.

### D5 Remote Mac host

**Not part of this feature.** It needs a new Relay stream class (APP-016) and only matters once local capture works. This spec stops at loopback and says so.

### D6 Helper authentication

**A token-gated loopback proxy in Electron main sits in front of the helper; nothing else may talk to the helper.** Justified by C6, not by suspicion. The proxy is also the single place that enforces "this workspace may only reach its own simulator".

### D7 Transport

**HTTP, H.264 when available, MJPEG otherwise. WebRTC stays off unless the user opts in, and falls back to HTTP on failure. Never a black screen.**

### D8 Naming

**`simulator` everywhere** — see [Vocabulary](#vocabulary-locked). Earlier drafts used "phone" and then "device"; both are gone, including from user-facing copy.

### D9 Default simulator selection

**Last used for this workspace → otherwise the first available iPhone `simctl` lists under the newest installed runtime → otherwise `simctl create`.**

Rejected: a curated ranking table (`Pro Max > Pro > Plus > …`). Apple renames tiers most years, so the table rots for no user-visible gain. Remembering the user's choice beats guessing it.

### D10 Center surface shape

**Openable/closable center surface tab, not an always-on fixed tab.** Most workspaces are not iOS projects; a permanent tab is permanent noise. The right-sidebar tab is the discovery entry point.

### D11 Delivery shape

**One branch, one PR, one release unit.** The spike is closed, so there is no reason to stage the feature across mergeable slices. TECH §10 gives a commit order with a gate per step; the branch is only mergeable when the whole feature is green.

## Explicitly rejected ideas

| Idea | Why not |
|------|---------|
| Embed `expo-device-hub` in an iframe | Expo-branded dashboard; wrong product surface, and its internals are not a public API |
| Use the helper's own preview page as the panel | ships an Expo UI plus a token-gated `/exec` shell route into Atmos |
| `simctl io screenshot` polling as a stream fallback | second capture protocol, bad latency, no input path |
| Simulator farm / cloud simulators | not our product |
| Put the surface on Canvas | Canvas is an infinite-canvas product; a stream is a workspace surface |
| Give the agent its own helper instance | two streams over one simulator; the agent must see exactly what the human sees |
| A SimulatorBridge crate under `crates/` | the lifecycle owner must be the process that owns the window and the child processes |
