# TEST · APP-058: Workspace Device Preview

> Verification contract for [PRD.md](./PRD.md) Must Haves M1–M10, designed around [TECH §9](./TECH.md#9-testability-seams-required-by-design-not-by-testmd).

## Test strategy

| Level | Tool | Why |
|-------|------|-----|
| Unit — pure bridge logic | `bun test` in `apps/desktop-electron/src/device/` | Probe parsing, device resolution, degradation ladder, claim table, proxy allow-list are pure over an injected `CommandRunner`. This is where the risky branches live, and it runs in CI without Xcode |
| Unit — web | `bun test` in `apps/web/src/features/device/` | Coordinate normalization, input encoding, phase → view mapping, store single-source-of-truth |
| Unit — CLI | `cargo test --package atmos` | Arg parsing, coordinate rejection, workspace resolution, exit-code mapping |
| E2E — web surfaces | Playwright (`e2e/`), `just test-e2e` | Every phase and setup card through a preload-shaped `window.__ATMOS_DESKTOP__` stub injected with `addInitScript`. No Xcode, no helper |
| Electron smoke | manual, `ATMOS_DEVICE_FAKE=<fixture>` | The real IPC + event path with a scripted bridge and a synthetic frame source |
| Manual matrix | macOS arm64 + Xcode | Real capture, boot, window hiding, Automation TCC, mismatch, orphan cleanup |
| Quality gates | `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` | Regression |

Honest limits: nothing that requires a real iOS runtime can run in CI. Those scenarios are marked `manual` and must be recorded in `Coverage Status` with the machine used.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 two surfaces, one session | S1, S2, S3 |
| M2 one device per workspace, exclusivity | S4, S5 |
| M3 probe + setup cards | S6, S7, S8, S9 |
| M4 boot + default device + hide windows | S10, S11, S12 |
| M5 pixels + input | S13, S14 |
| M6 agent CLI | S15, S16, S17 |
| M7 failure is explained, never black | S18, S19, S20, S21 |
| M8 helper never exposed, never manual | S22, S23, S24 |
| M9 bounded resources | S25, S26 |
| M10 open in simulator | S27 |

## Execution map

| Id | Level | Target | Fixture / data | Signals | Status |
|----|-------|--------|----------------|---------|--------|
| S1 | e2e | `e2e/tests/specs/APP-058_workspace-device-preview.e2e.ts` | stub bridge, probe ok | one `device_attach` call for two surfaces | pending |
| S2 | unit web | `use-device-session-store` | scripted `device://status` | both selectors read one slice; no local phase derivation | pending |
| S3 | e2e | same file as S1 | stub | closing one surface keeps `streaming` | pending |
| S4 | unit | `claims.test.ts` | claim table | second claim → `device_in_use` + holder | pending |
| S5 | unit | `claims.test.ts` | claim table | take-over releases + audit entry emitted | pending |
| S6 | unit | `probe.test.ts` | `simctl list -j` fixtures (ok / no-runtime / no-iphone / not-booted) | exact code per fixture | pending |
| S7 | unit | `probe.test.ts` | non-darwin + x86_64 runners | `platform_not_macos`, `helper_arch_unsupported` | pending |
| S8 | e2e | APP-058 e2e, setup-card group | stub per probe code | title + reason + facts + button per code; no shell string as primary CTA | pending |
| S9 | e2e | APP-058 e2e, setup-card group | stub without `__ATMOS_DESKTOP__` | "Requires Atmos Desktop"; zero invokes | pending |
| S10 | unit | `resolve-device.test.ts` | runtime + device fixtures | last-used → newest-runtime iPhone → create; no tier table | pending |
| S11 | manual | macOS + Xcode | cold machine | frame < 45 s, progress visible | pending |
| S12 | manual | macOS + Xcode | multi-window simulator | all windows hidden or a non-blocking note; streaming unaffected | pending |
| S13 | manual | macOS + Xcode | booted device | tap/drag/scroll/keyboard land in the app | pending |
| S14 | unit web | `device-stream-client.test.ts` | synthetic pointer events | `0–1` payloads, top-left origin, identical to CLI space | pending |
| S15 | unit CLI | `cargo test` | — | `--x 1.5` → `coord_out_of_range`, exit 2 | pending |
| S16 | unit CLI | `cargo test` | two sessions | `workspace_ambiguous` with candidates, exit 2 | pending |
| S17 | manual | macOS + Xcode | live session | `atmos device tap` moves the human's screen; no second helper pid | pending |
| S18 | unit | `degrade.test.ts` (reducer) | webrtc-timeout event | `webrtc → h264 → mjpeg`, phase never leaves a rendering state | pending |
| S19 | unit | `degrade.test.ts` | mismatch stderr fixtures | one MJPEG retry then `capture_xcode_mismatch`; never a screenshot-poll branch | pending |
| S20 | unit | `degrade.test.ts` | helper-death events | 3 restarts → `failed` | pending |
| S21 | e2e | APP-058 e2e, fallback group | stub driving fallback | last frame or skeleton is visible at all times; no blank canvas | pending |
| S22 | unit | `proxy.test.ts` | route table | only allow-listed paths; wrong/absent token → 403; no arbitrary-port forwarding | pending |
| S23 | unit | `spawn-args.test.ts` | — | `--no-preview`, `--host 127.0.0.1`, ephemeral `-p`; env free of `ATMOS_LOCAL_TOKEN` | pending |
| S24 | manual | macOS | after attach | upstream preview port not listening; helper port not reachable except via proxy; UI copy contains no `npx` | pending |
| S25 | unit | `governance.test.ts` | visibility events + clock | throttle ≤ 5 s after hide; release at 10 min; device stays booted | pending |
| S26 | unit | `governance.test.ts` | 3 sessions | least-recently-visible killed at cap 2 | pending |
| S27 | manual | Expo worktree | — | Metro appears in a visible pane; app launches on the active device; failures surface | pending |
| Q1 | manual | P0 spike | — | native addon loads under Electron; contract record appended to BRAINSTORM | pending |
| G* | gates | `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` | — | green | pending |

## Scenarios

### S1 Two surfaces, one capture process
**Given** a workspace whose probe passes and no session yet
**When** the sidebar Device tab is opened, then the center Device tab is opened
**Then** exactly one `device_attach` reaches main, the second surface receives the existing `streamBaseUrl`, and both render `streaming`.
**Signals**: one attach invocation; identical `streamBaseUrl` in both surfaces; one helper pid.

### S3 Closing one surface is not disconnecting
**Given** both surfaces streaming
**When** the center tab is closed (or the sidebar tab hidden in Settings)
**Then** phase stays `streaming` and the other surface is unaffected.

### S4 Device exclusivity
**Given** workspace A holds device `X`
**When** workspace B attaches `X`
**Then** the attach is refused with `device_in_use` naming A, and a take-over action is offered.
**Signals**: error code + holder identity; no second helper for `X`.

### S6 Probe codes are exact
**Given** each `simctl` fixture
**When** probe runs
**Then** the emitted code is exactly one of `missing_simctl` / `missing_ios_runtime` / `missing_iphone_device` / `helper_not_installed` / ok, and no device is booted.
**Signals**: no `simctl boot` in the recorded runner calls.

### S8 Every missing prerequisite ends on a usable card
**Given** each probe failure code
**When** a surface is open
**Then** the card shows title, one-line reason, observed facts, and 1–2 primary buttons, plus "Re-check".
**Signals**: primary button is an action or a system-location link — never a copyable shell command; no terminal is opened.

### S9 Hosted web is honest
**Given** the app served without Atmos Desktop (`window.__ATMOS_DESKTOP__` absent)
**When** the Device surface is opened
**Then** it states that Atmos Desktop is required and issues no bridge invokes.

### S12 Hiding simulator windows is best-effort
**Given** a device with more than one simulator window, and Automation permission either granted or denied
**When** the session starts
**Then** granted → all windows hidden and Atmos focused; denied → a non-blocking note and streaming continues.
**Signals**: streaming never rolls back because hiding failed.

### S18 / S21 No black screen, ever
**Given** WebRTC opted in and unreachable
**When** the session falls back
**Then** the ladder is `webrtc → HTTP H.264 → HTTP MJPEG`, and the surface shows the last frame or a skeleton until the first HTTP frame.
**Signals**: no interval where the stream area is blank; no user refresh required.

### S19 Xcode mismatch stops without inventing a protocol
**Given** helper stderr matching `SimulatorKit` / `IOSurface` / `dlopen`
**When** attach runs
**Then** exactly one MJPEG retry happens, then the mismatch card appears with `{ xcodeVersion, helperVersion, osVersion }` and an "Update capture helper" action.
**Signals**: no `simctl io screenshot` and no window-capture call anywhere in the recorded runner calls.

### S22 The helper is not reachable directly
**Given** a live session
**When** a request hits the proxy with no token, a foreign session token, or a path outside the allow-list
**Then** it is refused, and there is no API that forwards to an arbitrary port.

### S25 Hidden sessions get cheap, then get released
**Given** a streaming session
**When** both surfaces are hidden
**Then** the stream is throttled within 5 s and the session is released after 10 min, leaving the device booted.

## Exploratory agent-browser checks

Load the Agent Browser skill (or `agent-browser skills get core --full`) before running these; see [`../../references/agent-browser-setup.md`](../../references/agent-browser-setup.md). Record `not_run` with a reason if the CLI is unavailable.

| Id | Check |
|----|-------|
| X1 | Setup-card copy reads as a next step, not an error dump, in both `en` and `zh`; no ALL-CAPS labels; no leaked `npx` / raw command strings |
| X2 | Sidebar width does not stretch the device frame into a widescreen preview; aspect ratio holds while resizing |
| X3 | `Starting` and `Reconnecting` states are legible and never look like a hang |
| X4 | Settings row for the Device tab reads consistently with the neighbouring rows and toggling it does not disconnect |
| X5 | No console errors or failed requests while switching workspaces with a session warm |

## Regression checklist

- Existing right-sidebar tabs (Changes / Review / Browser / Run / GitHub / Files) keep their order, visibility behaviour, and URL state.
- `FixedTab` is unchanged; terminal, wiki, project-wiki, code-review, overview keep working.
- Center-stage tab restore, MRU, and drag order still work with a Device tab open and closed.
- `browser` sessions still key per surface and still clone on "move to center" — APP-058 must not change that model.
- `desktop_use_*` and `browser_bridge_*` IPC families are unaffected; `ipc/handlers.ts` additions are additive.
- `apps/api` has no `device` route and no new WS action.
- Desktop quit leaves no helper process and removes `control.json`.

## Acceptance criteria

1. M1–M10 have passing scenarios at the level named in the execution map, and every `manual` row records the machine it was verified on.
2. Unit coverage for probe, device resolution, degradation ladder, claim table, governance, proxy, spawn args, and CLI coordinate/workspace handling is green in CI **without** Xcode.
3. Playwright covers every phase and every setup card, including the hosted-web state.
4. No black screen in any documented fallback (S18, S21).
5. The repository contains no `@expo/hub-*` dependency, no `EvanBacon/serve-sim` or unscoped `serve-sim` source, no frontend `npx` spawn, and no second capture protocol.
6. Upstream preview port is not listening; helper is only reachable through the token-gated proxy.
7. `NOTICE` contains the helper entry (Apache-2.0 + embedded WebRTC).
8. `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` are green.
9. Both `en` and `zh` contain the full `device.*` copy, localized rather than copied.
10. P0 contract record exists in `BRAINSTORM.md` before any P2 code merges.

## Manual verification steps

1. macOS arm64 with Xcode and ≥ 1 iOS runtime: open the sidebar Device tab → expect a frame; tap, swipe, type, rotate.
2. Open the center Device tab → expect the same device, no second helper (`serve-sim --list` shows one).
3. Remove all iOS runtimes (or point `DEVELOPER_DIR` at a runtime-less Xcode) → expect the runtime card and a working Platforms button.
4. Deny Automation permission → expect streaming plus the non-blocking hide note.
5. Two workspaces, same device → expect `device_in_use`, then a successful take-over.
6. Quit Desktop while streaming → expect no `serve-sim` process and no `control.json`.
7. `atmos device list --json`, `attach`, `tap`, `screenshot`, `ax` against the live session → expect visible changes on the human's surface and `normalizedRect` present in `ax`.
8. Intel Mac → expect the arch card; non-macOS → expect the macOS-only card.

## Non-coverage

| Not covered | Reason |
|-------------|--------|
| Android emulators and physical devices | Out of scope — [PRD](./PRD.md#out-of-scope-v1); follow-up spec |
| Remote Mac host / Relay proxying | Out of scope; follow-up spec |
| iOS physical devices | Out of scope |
| Real capture in CI | No Xcode or simulator runtime on CI hosts; covered by the manual matrix |
| WebRTC transport quality (bitrate, jitter) | Opt-in path; only the fallback behaviour is asserted |
| Camera injection, CoreAnimation debug | Not exposed in v1 |
| Helper internals (`IOSurface`, `SimulatorKit`) | Upstream; we assert our observable degradation instead |

## Coverage Status

_To be appended after implementation / test-run._
