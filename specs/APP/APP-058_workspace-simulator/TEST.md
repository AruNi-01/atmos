# TEST · APP-058: Workspace Simulator

> Verification contract for [PRD.md](./PRD.md) Must Haves M1–M10, designed around [TECH §9](./TECH.md#9-testability-seams-design-requirement).
> One branch, so acceptance is all-or-nothing: the branch merges when every row here is green or explicitly recorded as a gap.

## Test strategy

| Level | Tool | Why |
|-------|------|-----|
| Unit — bridge logic | `bun test` in `apps/desktop-electron/src/simulator/` | Probe parsing, selection, degradation ladder, claims, governance, proxy allow-list, input encoder are pure over an injected `CommandRunner`. This is where the risky branches live, and it runs in CI without Xcode |
| Unit — web | `bun test` in `apps/web/src/features/simulator/` | Coordinate normalization, opcode encoding, phase → view mapping, store single-source-of-truth |
| Unit — CLI | `cargo test --package atmos` | Arg parsing, coordinate rejection, workspace resolution, exit-code mapping |
| E2E — web surfaces | Playwright (`e2e/`), `just test-e2e` | Every phase and setup card through a preload-shaped `window.__ATMOS_DESKTOP__` stub injected with `addInitScript`. No Xcode, no helper |
| Electron smoke | manual, `ATMOS_SIMULATOR_FAKE=<fixture>` | The real IPC + event path with a scripted bridge and synthetic frames |
| Manual matrix | macOS 14+ arm64 with Xcode | Real capture, addon load under a signed build, boot, window hiding, Automation TCC, mismatch, orphan cleanup |
| Quality gates | `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` | Regression |

Honest limits: nothing that needs a real iOS runtime or a signed macOS build can run in CI. Those rows are `manual` and must record the machine used.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 two surfaces, one session | S1, S2, S3 |
| M2 one simulator per workspace, exclusivity | S4, S5 |
| M3 probe + setup cards | S6, S7, S8, S9 |
| M4 boot + default selection + hide windows | S10, S11, S12 |
| M5 pixels + input | S13, S14 |
| M6 agent CLI | S15, S16, S17 |
| M7 failure is explained, never black | S18, S19, S20, S21 |
| M8 helper never exposed, never manual | S22, S23, S24 |
| M9 bounded resources | S25, S26 |
| M10 open in simulator | S27 |
| Naming (PRD naming rules) | S28 |
| Packaging + signing + authorization (TECH §4, §13.1, §13.2) | S29, S30, S31 |

## Execution map

| Id | Level | Target | Fixture / data | Signals | Status |
|----|-------|--------|----------------|---------|--------|
| S1 | e2e | `e2e/tests/specs/APP-058_workspace-simulator.e2e.ts` | stub bridge, probe ok | one `simulator_attach` for two surfaces | pending |
| S2 | unit web | `use-simulator-session-store` | scripted `simulator://status` | both surfaces read one slice; no local phase derivation | pending |
| S3 | e2e | same file as S1 | stub | closing one surface keeps `streaming` | pending |
| S4 | unit | `claims.test.ts` | claim table | second claim → `simulator_in_use` + holder | pending |
| S5 | unit | `claims.test.ts` | claim table | take-over releases + audit entry | pending |
| S6 | unit | `probe.test.ts` | `simctl list -j` fixtures (ok / no-runtime / no-iphone / booted) | exact code per fixture | pending |
| S7 | unit | `probe.test.ts` | non-darwin, x86_64, macOS 13 runners | `platform_not_macos`, `helper_arch_unsupported`, `macos_too_old` | pending |
| S8 | e2e | APP-058 e2e, setup-card group | stub per probe code | title + reason + facts + button per code; no shell string as primary CTA | pending |
| S9 | e2e | APP-058 e2e, setup-card group | stub without `__ATMOS_DESKTOP__` | "Requires Atmos Desktop"; zero invokes | pending |
| S10 | unit | `select-simulator.test.ts` | runtime + simulator fixtures | last-used → newest-runtime iPhone → create; no tier table | pending |
| S11 | manual | macOS 14+ arm64 + Xcode | cold machine | frame < 45 s, progress visible | pending |
| S12 | manual | macOS 14+ arm64 + Xcode | multiple `Simulator.app` windows | all hidden, or a non-blocking note; streaming unaffected | pending |
| S13 | manual | macOS 14+ arm64 + Xcode | booted simulator | tap/drag/scroll/keyboard land in the app | pending |
| S14 | unit web | `simulator-stream-client.test.ts` | synthetic pointer events | opcode byte + JSON per TECH §5.1; `0–1` payloads, top-left origin | pending |
| S15 | unit CLI | `cargo test --package atmos` | — | `--x 1.5` → `coord_out_of_range`, exit 2 | pending |
| S16 | unit CLI | `cargo test --package atmos` | two sessions | `workspace_ambiguous` with candidates, exit 2 | pending |
| S17 | manual | macOS 14+ arm64 + Xcode | live session | `atmos simulator tap` moves the human's screen; one helper pid | pending |
| S18 | unit | `degrade.test.ts` (reducer) | webrtc-timeout event | `webrtc → h264 → mjpeg`; phase never leaves a rendering state | pending |
| S19 | unit | `degrade.test.ts` | mismatch stderr fixtures | one MJPEG retry then `capture_xcode_mismatch`; no screenshot-poll branch exists | pending |
| S20 | unit | `degrade.test.ts` | helper-death events | 3 restarts → `failed` | pending |
| S21 | e2e | APP-058 e2e, fallback group | stub driving fallback | last frame or skeleton visible at all times; no blank canvas | pending |
| S22 | unit | `proxy.test.ts` | route table | only allow-listed upstream paths; wrong/absent token → 403; no arbitrary-port forwarding | pending |
| S23 | unit | `spawn-args.test.ts` + `handshake.test.ts` | sample helper state record | `--no-preview`, `--host 127.0.0.1`, ephemeral `-p`; URLs read from the record, not hardcoded; env free of `ATMOS_LOCAL_TOKEN` | pending |
| S24 | manual | macOS | after attach | upstream preview port not listening; no non-loopback listener in the helper process; UI copy contains no `npx` | pending |
| S25 | unit | `governance.test.ts` | visibility events + clock | throttle ≤ 5 s after hide; release at 10 min; simulator stays booted | pending |
| S26 | unit | `governance.test.ts` | 3 sessions | least-recently-visible killed at cap 2 | pending |
| S27 | manual | Expo worktree | — | Metro appears in a visible pane; app launches on the active simulator; failures surface | pending |
| S28 | grep gate | product trees | — | no `device` / `phone` / `mobile` / `emulator` identifier, path, event, code, or i18n key introduced by this feature | pending |
| S29 | unit + package check | `helper-resolve.test.ts` + packaged app inspection | staged payload | resolution order and version assertion; the packaged app contains `Resources/simulator-helper/` on macOS and not on Windows/Linux | pending |
| S30 | manual | packaged ad-hoc build, macOS 14+ arm64 | — | the Node-API addon loads from the bundle; no entitlement present in the app | pending |
| S31 | manual | clean macOS user account | — | exactly one permission prompt for the whole feature (Automation, named Atmos); no Screen Recording, no Accessibility, no "unidentified developer" gate | pending |
| G* | gates | `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` | — | green | pending |

## Scenarios

### S1 Two surfaces, one capture process
**Given** a workspace whose probe passes and no session yet
**When** the sidebar Simulator tab is opened, then the center Simulator tab is opened
**Then** exactly one `simulator_attach` reaches main, the second surface receives the existing `streamBaseUrl`, and both render `streaming`.
**Signals**: one attach invocation; identical `streamBaseUrl`; one helper pid in `serve-sim --list`.

### S3 Closing one surface is not disconnecting
**Given** both surfaces streaming
**When** the center tab is closed, or the sidebar tab is hidden in Settings
**Then** phase stays `streaming` and the other surface is unaffected.

### S4 Exclusivity
**Given** workspace A holds simulator `X`
**When** workspace B attaches `X`
**Then** the attach is refused with `simulator_in_use` naming A, and a take-over action is offered.
**Signals**: error code + holder identity; no second helper for `X`.

### S6 / S7 Probe codes are exact
**Given** each environment fixture
**When** probe runs
**Then** the emitted code is exactly one of `platform_not_macos`, `helper_arch_unsupported`, `macos_too_old`, `missing_simctl`, `missing_ios_runtime`, `missing_iphone`, `helper_not_installed`, or ok — and nothing is booted.
**Signals**: no `simctl boot` in the recorded runner calls.

### S8 Every missing prerequisite ends on a usable card
**Given** each probe failure code
**When** a surface is open
**Then** the card shows title, one-line reason, observed facts, and 1–2 primary buttons, plus "Re-check".
**Signals**: the primary button is an action or a system-location link — never a copyable shell command; no terminal is opened.

### S9 Hosted web is honest
**Given** the app served without Atmos Desktop (`window.__ATMOS_DESKTOP__` absent)
**When** the Simulator surface is opened
**Then** it states that Atmos Desktop is required and issues no bridge invokes.

### S12 Hiding `Simulator.app` is best-effort
**Given** more than one `Simulator.app` window, and Automation permission either granted or denied
**When** the session starts
**Then** granted → all windows hidden and Atmos focused; denied → a non-blocking note and streaming continues.
**Signals**: streaming never rolls back because hiding failed.

### S14 Input encoding matches the decoded protocol
**Given** pointer, keyboard, and rotate interactions
**When** the client encodes them
**Then** each message is one opcode byte plus a JSON body exactly as in TECH §5.1, with normalized `0–1` coordinates and top-left origin.
**Signals**: byte-level assertions per opcode; identical values to what `atmos simulator` sends.

### S18 / S21 No black screen, ever
**Given** WebRTC opted in and unreachable
**When** the session falls back
**Then** the ladder is `webrtc → HTTP H.264 → HTTP MJPEG`, and the surface shows the last frame or a skeleton until the first HTTP frame.
**Signals**: no interval where the stream area is blank; no user refresh required.

### S19 Xcode mismatch stops without inventing a protocol
**Given** helper output matching `SimulatorKit` / `IOSurface` / `dlopen`
**When** attach runs
**Then** exactly one MJPEG retry happens, then the mismatch card appears with `{ xcodeVersion, helperVersion, osVersion }` and an "Update capture helper" action.
**Signals**: no `simctl io screenshot` and no window-capture call anywhere in the recorded runner calls.

### S22 / S24 The helper is not reachable directly
**Given** a live session
**When** a request hits the proxy with no token, a foreign session token, or a path outside the allow-list
**Then** it is refused; and separately, the helper port answers nothing that did not come through the proxy, the preview port is not listening, and no non-loopback listener exists in the helper process.

### S23 Handshake uses the helper's published URLs
**Given** a helper state record with `streamUrl` / `wsUrl`
**When** the session starts
**Then** the session stores those URLs and derives `stream-settings` from `streamUrl`, rather than assembling endpoint paths from constants.

### S25 Hidden sessions get cheap, then get released
**Given** a streaming session
**When** both surfaces are hidden
**Then** the stream is throttled within 5 s and the session is released after 10 min, leaving the simulator booted.

### S28 One word, everywhere
**Given** the branch diff
**When** product trees are grepped
**Then** no identifier, file path, IPC command, event name, error code, CLI verb, or i18n key introduced by this feature contains `device`, `phone`, `mobile`, or `emulator`.
**Allowed exceptions**: `Simulator.app`, quoted Apple `simctl` vocabulary in diagnostic text, and the helper's own upstream field names in the state record it publishes.

### S30 The addon loads from the bundle, with no entitlement
**Given** a packaged ad-hoc-signed Atmos build on macOS 14+ arm64
**When** a session starts
**Then** the Node-API addon loads from `Contents/Resources/simulator-helper/`, and `codesign -d --entitlements` shows the app carries no `disable-library-validation`.
**Signals**: streaming works; no entitlements plist in the build.

### S31 One authorization for the whole feature
**Given** a clean macOS user account and a first run
**When** the user opens the surface, streams, and lets Atmos hide `Simulator.app`
**Then** the only permission prompt is Automation, attributed to Atmos — no Screen Recording prompt, no Accessibility prompt, and no Gatekeeper "unidentified developer" dialog for any helper binary.
**Signals**: prompt count and prompt text; `tccutil`/System Settings shows one Atmos entry under Automation.

## Exploratory agent-browser checks

Load the Agent Browser skill (or `agent-browser skills get core --full`) before running these; see [`../../references/agent-browser-setup.md`](../../references/agent-browser-setup.md). Record `not_run` with a reason if the CLI is unavailable.

| Id | Check |
|----|-------|
| X1 | Setup-card copy reads as a next step, not an error dump, in both `en` and `zh`; no ALL-CAPS labels; no `npx` or raw command strings; the surface is called Simulator and Apple's app is always `Simulator.app` |
| X2 | Sidebar width does not stretch the frame into a widescreen preview; aspect ratio holds while resizing |
| X3 | `Starting` and `Reconnecting` states are legible and never look like a hang |
| X4 | The Settings row reads consistently with neighbouring rows, and toggling it does not disconnect |
| X5 | No console errors or failed requests while switching workspaces with a session warm |

## Regression checklist

- Existing right-sidebar tabs (Changes / Review / Browser / Run / GitHub / Files) keep their order, visibility behaviour, and URL state.
- `FixedTab` is unchanged; terminal, wiki, project-wiki, code-review, overview keep working.
- Center-stage tab restore, MRU, and drag order still work with a Simulator tab open and closed.
- `browser` sessions still key per surface and still clone on "move to center" — this feature must not change that model.
- `desktop_use_*` and `browser_bridge_*` IPC families are unaffected; `ipc/handlers.ts` additions are additive.
- `apps/api` has no simulator route and no new WS action.
- Adding the bundled payload does not break app launch, ad-hoc signing, or DMG/zip packaging; Windows and Linux packages are unchanged in size.
- Desktop quit leaves no helper process and removes `control.json`.

## Acceptance criteria

1. M1–M10 have passing scenarios at the level named in the execution map, and every `manual` row records the machine it was verified on.
2. Unit coverage for probe, selection, degradation, claims, governance, proxy, spawn/handshake, helper resolution, input encoding, and CLI coordinate/workspace handling is green in CI **without** Xcode.
3. Playwright covers every phase and every setup card, including the hosted-web state.
4. No black screen in any documented fallback (S18, S21).
5. The repository contains no `@expo/hub-*` dependency, no `EvanBacon/serve-sim` or unscoped `serve-sim` source, no frontend `npx` spawn, and no second capture protocol.
6. Preview port not listening; helper only reachable through the token-gated proxy; no non-loopback listener (S24).
7. Naming gate S28 clean.
8. `NOTICE` contains the helper entry (Apache-2.0 + embedded WebRTC).
9. `just typecheck`, `bun test`, `just lint`, `cargo test --workspace` are green.
10. Both `en` and `zh` contain the full `simulator.*` copy, localized rather than copied.
11. The addon loads from the bundled payload with **no** new entitlement (S30), and the feature asks for at most one macOS permission, attributed to Atmos (S31).

## Manual verification steps

1. macOS 14+ arm64 with Xcode and ≥ 1 iOS runtime: open the sidebar Simulator tab → expect a frame; tap, swipe, type, rotate.
2. Open the center Simulator tab → expect the same simulator and one helper (`serve-sim --list`).
3. Remove all iOS runtimes, or point `DEVELOPER_DIR` at a runtime-less Xcode → expect the runtime card and a working Platforms button.
4. Deny Automation permission → expect streaming plus the non-blocking hide note.
5. Two workspaces, same simulator → expect `simulator_in_use`, then a successful take-over.
6. Quit Desktop while streaming → expect no `serve-sim` process and no `control.json`.
7. `atmos simulator list --json`, `attach`, `tap`, `screenshot`, `ax` against the live session → expect visible changes on the human's surface and `normalizedRect` present in `ax`.
8. Unsupported hosts: Intel Mac → arch card; macOS 13 → version card; non-macOS → macOS-only card.
9. Inspect the packaged app: `Resources/simulator-helper/` present on macOS and absent on Windows/Linux; remove it and expect the `helper_missing` card rather than a crash.

## Non-coverage

| Not covered | Reason |
|-------------|--------|
| Android emulators and physical Android devices | Out of scope — [PRD](./PRD.md#out-of-scope); separate spec |
| Remote Mac host / Relay proxying | Out of scope; separate spec |
| iOS physical devices | Out of scope |
| Intel Macs, macOS < 14 | Unsupported by the pinned helper; only the refusal path is asserted |
| Real capture in CI | No Xcode, no iOS runtime, no signing identity on CI hosts; covered by the manual matrix |
| WebRTC transport quality (bitrate, jitter) | Opt-in path; only the fallback behaviour is asserted |
| Camera injection, CoreAnimation debug, digital crown | Upstream opcodes deliberately not exposed |
| Helper internals (`IOSurface`, `SimulatorKit`) | Upstream; we assert our observable degradation instead |

## Coverage Status

_To be appended after implementation / test-run._
