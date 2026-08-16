# TECH · APP-060: Vendor serve-sim

> Technical Design · HOW. Implements PRD APP-060: Vendor serve-sim.

## Scope summary

Addresses **M1–M11**. N1–N3 deferred. This spec vendors serve-sim, compiles a darwin-arm64 helper, publishes it to a GitHub Release, downloads it on demand into `~/.atmos`, and embeds its preview. Spawn lives in the **local Atmos Server** (`just dev-api` / Desktop sidecar). Hosted cloud API has no Xcode and returns a setup reason. No Android, no custom Atmos phone chrome.

## Architecture overview

```
vendor/serve-sim/          our Apache-2.0 fork (exec shell deleted)
        │
        ▼  just pack-serve-sim / CI
GitHub Release  tag serve-sim-<version>
        │  asset + manifest.json (version, sha256, minos, arch)
        ▼  first open
~/.atmos/runtime/serve-sim/<version>/serve-sim   (+ native/*.node)
        │  local apps/api exec
        ▼
127.0.0.1:<ephemeral>   preview HTML + helper WS
        │
        ▼
apps/web Simulator panel  iframe that origin  (?device=<udid>)
```

Layers:

| Layer | Role |
|-------|------|
| `vendor/serve-sim/` | Forked source + Atmos patches |
| `scripts/serve-sim/` | Pack + checksum + archive |
| `.github/workflows/release-serve-sim.yml` | Tag-driven GitHub Release (no R2) |
| `apps/api/src/simulator.rs` | Probe, download, spawn, kill, hide Simulator.app (local Server only) |
| `apps/web/src/features/simulator/` | Tab + iframe; talks `/ws` `simulator_*` |
| `crates/runtime-manager` layout helpers | Canonical `~/.atmos` paths |

Control plane is the **local Atmos Server**. Web and Desktop are both `/ws` clients. A cloud API process is not on a Mac with Xcode — `simulator_start` returns `unsupported_platform` / `xcode_missing`.

## Upstream pin

| Field | Value |
|-------|--------|
| Original upstream | https://github.com/EvanBacon/serve-sim (Apache-2.0) |
| Pin repo / tag | `expo/serve-sim` `@expo/serve-sim@0.1.37` |
| Commit | `b2c92534d373f2a2975a3c013c25a3ab3985f268` |
| Atmos version | `0.1.37-atmos.1` (first fork of 0.1.37) |
| License | Apache-2.0 — NOTICE entry for vendor source **and** redistributed binary |

Record commit + sha256 in `vendor/serve-sim/UPSTREAM.md` and `apps/api/simulator/serve-sim-requirement.json`. Bumping the pin updates both.

## Module-by-module design

### `vendor/serve-sim/`

Copy the tagged tree (source, LICENSE, lockfile). Strip `.git`. Do not vendor `node_modules` or `dist`.

**Required patches (must land with the vendor):**

1. **Keep `/exec` and `/exec-ws` identical to upstream.** Home, rotate, screenshot, and Tools all go through this channel. Token + Origin checks stay as serve-sim wrote them.
2. **Bind loopback only.** Ignore `--host` if it is not `127.0.0.1` / `localhost` / `::1`. Always listen on `127.0.0.1`. That is the network boundary — do not delete the preview's exec surface.

0.1.37 has no `--panes`. Embed the full page (PRD N1 deferred).

Do not add GPL dependencies.

### Pack / Release

`just pack-serve-sim` (script `scripts/serve-sim/pack.sh`):

1. `bun install` + `bun run build` in `vendor/serve-sim/packages/serve-sim` (existing `build.ts` already `bun build --compile`s `dist/serve-sim`).
2. Stage:

```
serve-sim-<version>-darwin-arm64/
  serve-sim                         # compiled bun executable
  native/serve-sim-native.node      # Swift N-API addon; exec'd binary dlopens this, Electron does not
  bin/LiveKitWebRTC.framework/      # rpath of the addon (`@loader_path/../bin/…`)
  LICENSE
  ATMOS-PATCHES.md
  manifest.json
```

Camera dylibs (`dist/simcam/`) are not required for the preview. Omit them in v1 to shrink the archive. `simax` is only needed if the remaining `{ui}` path shells out to it; include it if the built binary resolves it at runtime.

3. `tar czf` the folder. Compute sha256 of the tarball.
4. Write `manifest.json`:

```json
{
  "name": "serve-sim",
  "version": "0.1.37-atmos.1",
  "minos": "14.0",
  "arch": "arm64",
  "asset": "serve-sim-0.1.37-atmos.1-darwin-arm64.tar.gz",
  "sha256": "<hex>",
  "upstream_commit": "b2c92534d373f2a2975a3c013c25a3ab3985f268"
}
```

CI: `.github/workflows/release-serve-sim.yml` on tag `serve-sim-*`, `macos-26` arm64 runner (Xcode 26 / Swift that accepts `--build-system swiftbuild` for SimNative macros; `macos-14` fails with exit 64), same script, `gh release create` with tarball + `manifest.json`. **GitHub Releases only. No R2.**

Dev without a published release: `just pack-serve-sim --install` extracts into `~/.atmos/runtime/serve-sim/<version>/` so Desktop can skip the network.

### `~/.atmos` layout

| Kind | Path |
|------|------|
| Binary + addon | `~/.atmos/runtime/serve-sim/<version>/serve-sim` |
| Native addon | `~/.atmos/runtime/serve-sim/<version>/native/serve-sim-native.node` |
| Claims / lease | `~/.atmos/state/simulator/claims.json` |

Never `~/.atmos/data/desktop/`. Add helpers on `runtime_manager::layout` (`serve_sim_runtime_dir`, `simulator_state_dir`) and document them in `agents/references/runtime/atmos-home-layout.md`.

Pin file (packaged with Desktop, not the downloaded archive):

`apps/api/simulator/serve-sim-requirement.json`

```json
{
  "version": "0.1.37-atmos.1",
  "minos": "14.0",
  "arch": "arm64",
  "release_tag": "serve-sim-0.1.37-atmos.1",
  "asset": "serve-sim-0.1.37-atmos.1-darwin-arm64.tar.gz",
  "sha256": "<filled after first pack>",
  "download_url": "https://github.com/AruNi-01/atmos/releases/download/serve-sim-0.1.37-atmos.1/serve-sim-0.1.37-atmos.1-darwin-arm64.tar.gz"
}
```

### Local Server (`apps/api/src/simulator.rs`)

WebSocket only. Desktop is not special — it uses the same `/ws` as `just dev-web`.

| Action | Args | Result |
|--------|------|--------|
| `simulator_probe` | `{}` | host probe (Xcode / arch / devices / helper) |
| `simulator_start` | `{ workspace_id, udid? }` | downloads if needed, then `{ ready, url, udid }` or a setup `reason` |
| `simulator_stop` | `{ workspace_id }` | `{ stopped: true }` |
| `simulator_status` | `{ workspace_id }` | current claim or `null` |

Event: `simulator_download_progress` → `{ workspace_id, downloaded, total }`

**Download:** stream to `~/.atmos/cache/serve-sim/<asset>.part`, sha256, extract into `runtime/serve-sim/<version>/`. Mismatch deletes the part and returns a retryable error.

**Spawn (do not use `--kill`):**

```
<install>/serve-sim --host 127.0.0.1 -p <freePort> <udid>
```

- Pick `<freePort>` by binding `127.0.0.1:0` in Electron, close, pass `-p`.
- If `udid` omitted, serve-sim boots its default iPhone; then read the written state.
- cwd = install dir so the compiled binary can find `native/serve-sim-native.node`.
- env: inherit PATH so `xcrun` / `simctl` resolve.

**Ready signal:** poll `$TMPDIR/serve-sim/server-<udid>.json` (serve-sim `STATE_DIR`) for `{ url, port, pid, device }`. Timeout ~30s after boot. Iframe URL is `state.url` with `?device=<udid>` if missing. Fallback `http://127.0.0.1:<port>/?device=<udid>`.

**Stop:** `SIGTERM` our child pid, wait, then `SIGKILL`. Do not call `serve-sim --kill`. Remove our claim. Leave other users' helpers alone.

**Claims** (`~/.atmos/state/simulator/claims.json`):

```json
{
  "<workspaceId>": {
    "pid": 1234,
    "port": 49152,
    "udid": "…",
    "url": "http://127.0.0.1:49152",
    "version": "0.1.37-atmos.1",
    "startedAt": 0
  }
}
```

One live claim globally in v1 (one Simulator.app). Starting from workspace B stops workspace A's helper first, then starts. One tab per workspace (M5).

**Hide Simulator.app (M8):**

Before `start`, and on a short loop after spawn (boot raises the app):

1. `osascript` / System Events: `set frontmost of process "Simulator" to false`.
2. Focus the Atmos `BrowserWindow` (`show`, `focus`, macOS `app.focus({ steal: true })`).

Do not require the user to click Simulator.app.

**Probe reasons** (map to setup cards): `not_desktop` (renderer-only), `unsupported_platform`, `unsupported_arch`, `macos_too_old`, `xcode_missing`, `simctl_missing`, `no_runtime`, `no_device`, `helper_missing` (ensure will download), `ok`.

### Web (`apps/web/src/features/simulator/`)

- Center-stage tab kind `simulator`, value `simulator`, one per workspace (same shape as project-wiki visibility, not a multi-instance browser tab).
- Entry: New tab menu (+) next to Terminal / Browser. Optional global-search item.
- Hosted / non-Electron: do not call start; show M7 card.
- Desktop: `simulator_probe` → card or `simulator_ensure` (progress event) → `simulator_start` → `<iframe src={url}>`.
- Close tab → `simulator_stop`.
- Progress is inline in the panel. Errors are inline. No success toast.

Iframe sandbox: allow scripts / same-origin / forms is unnecessary; this is another loopback origin. Do **not** sandbox so tightly that WebSocket / MJPEG breaks. `allow="autoplay"` if the stream needs it. No Atmos-drawn device chrome around the iframe.

Copy keys under `features.simulator.*` in `apps/web/messages/en.json` and `zh.json`. Sentence case. No `npx`.

Do not edit `apps/desktop` (Tauri).

### Agent / CLI (M10)

Phase 1: if something already started a helper for this workspace or project, reuse that claim (same pid/url). Other contexts get their own helper and must not steal a claimed UDID. A later spec can teach agents the serve-sim CLI against that URL.

## Data model

```ts
type SimulatorReason =
  | "ok"
  | "not_desktop"
  | "unsupported_platform"
  | "unsupported_arch"
  | "macos_too_old"
  | "xcode_missing"
  | "simctl_missing"
  | "no_runtime"
  | "no_device"
  | "helper_missing"
  | "download_failed"
  | "start_failed";

type SimulatorClaim = {
  pid: number;
  port: number;
  udid: string;
  url: string;
  version: string;
  startedAt: number;
};
```

No new SQLite tables. No new `WsAction`.

## Transport

WebSocket actions on the local Server: `simulator_probe`, `simulator_start`, `simulator_stop`, `simulator_status`. Event `simulator_download_progress`. No REST. No Electron IPC.

## Security & permissions

- Preview is loopback-only. `/exec` HTTP gone. `/exec-ws` cannot run a shell.
- Token still gates remaining `/exec-ws` UI/SSE (unchanged serve-sim auth).
- Downloaded archive must match the pin sha256.
- Do not log the preview token.

## Rollout plan

1. Specs + NOTICE + layout paths.
2. Vendor source + `/exec` patches + `UPSTREAM.md`.
3. `just pack-serve-sim` + release workflow (tag later).
4. Electron probe / download / spawn / stop / hide.
5. Web tab + setup card + iframe + i18n.
6. Tests (bun + targeted cargo layout).

## Risks & tradeoffs

- **Tradeoff**: keep serve-sim's `/exec` + `/exec-ws` as-is. Loopback bind is the network boundary; token + Origin stay as upstream wrote them.
- **Tradeoff**: tarball is binary + `.node`, not a single file. We still `exec` the binary; we do not `dlopen` into Electron.
- **Risk**: no published Release yet → first-run download 404s. `just pack-serve-sim --install` covers local dogfood; CI publishes on tag.
- **Rollback**: hide the New tab entry; leftover helpers die with the Desktop process.

## Dependencies & compatibility

- macOS 14+ arm64, Xcode + `xcrun simctl`, at least one available iOS Simulator.
- bun (pack time only). Users never need bun or npm.
- GitHub Releases for the archive.

## Open questions

- [x] Spawn in API vs Electron → **local API** (`apps/api`). Electron is just another `/ws` client.
- [x] R2 vs GitHub → GitHub.
- [x] Hide Tools → not in 0.1.37; full page.
