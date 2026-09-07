# TEST · APP-071: Device Preview agent control

> Test Plan · how we verify Device Preview agent control (claim-gated HID, unified verbs, CLI + skill). References PRD APP-071 and TECH APP-071.

## Test strategy

Deterministic tests own coord validation, claim gating, platform key policy, and adapter request shapes. CLI tests own envelope + invoke action names (no live helper). Skill tests are structural (frontmatter, “no curl”, “no Desktop Use for phone”). Live Simulator.app / AVD HID is manual. Playwright cannot drive the iframe HID stack — no E2E for tap landing.

- Unit: `core-engine` coords, PNG write, fake HTTP / fake serve-sim argv.
- Service: `DeviceControlService` with APP-070-style fake claims (two workspaces).
- WS / invoke: DTO + `WsContract` extract; unknown key / no claim codes.
- Bun: CLI clap/envelope if cheap; skill + i18n if web copy lands.
- Playwright: none for live HID.
- Exploratory agent-browser: none required for v1 (no new web chrome). If skill copy appears in Settings, one pass.
- Manual: iOS tap visible in iframe; Android tap/back; no-claim does not boot.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S3 |
| M2 | S4, S5 |
| M3 | S6, S7, S8, S9, S10 |
| M4 | S11, S12 |
| M5 | S13, S14 |
| M6 | S15 |
| M7 | S3, S16 |
| M8 | S17, S18, S24 |
| M9 | S4, S12, S13, S19, S24 |
| M10 | S1, S2, S20 |
| M11 | S21 |
| M12 | S16, S18, S23, S24 |
| M13 | S25 |
| M14 | S26 |
| M15 | S27, S28 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Structural | grep / bun | skill tree | `skills/atmos-device-preview` | `name: atmos-device-preview`; in `ALL_SYSTEM_SKILL_NAMES` | planned |
| S2 | Structural | grep | desktop-use + atmos-cli skills | those SKILL.md | “not the phone” / device-preview pointer | planned |
| S3 | Structural | grep | skill + CLI help | skill, clap | no `/api/tap`, no helper port, no `--token` | planned |
| S4 | Rust | `cargo test` | DeviceControl no claim | empty running map | `NoClaim`; start() not called | planned |
| S5 | Rust | `cargo test` | tap does not start | spy on `DevicePreviewService::start` | start invocation count 0 | planned |
| S6 | Rust | `cargo test` | iOS screenshot | fake simctl writes PNG | result.path exists; width/height set | planned |
| S7 | Rust | `cargo test` | Android tap HTTP | fake listener | `POST /api/tap` body `{x,y}` | planned |
| S8 | Rust | `cargo test` | iOS tap argv | fake bin | argv contains `tap`, udid, two floats | planned |
| S9 | Rust | `cargo test` | swipe both adapters | fake HTTP + fake bin | emu `/api/swipe`; sim `gesture` | planned |
| S10 | Rust | `cargo test` | type both adapters | fake | emu `/api/text`; sim `type` | planned |
| S11 | Rust | `cargo test` | coords | 0, 1, 0.5 ok; -0.1 / 1.01 fail | `InvalidCoords`; no HTTP | planned |
| S12 | Bun/Rust | contract / CLI | skill math | screenshot `{width,height}` | docs say px/width; CLI has no `--coord-space png` | planned |
| S13 | Rust | `cargo test` | press back on iOS claim | helper ServeSim | `UnsupportedOnPlatform`; no button spawn | planned |
| S14 | Rust | `cargo test` | press home both; back Android | claims | iOS `button home`; Android `POST /api/key` `{key:back}` | planned |
| S15 | Rust | `cargo test` | screenshot result | PNG bytes | JSON has `path`, not `data`/`base64` | planned |
| S16 | Rust | `cargo test` | CLI invoke payload | recorded invoke | action `simulator_tap`; data has workspace_id + udid; not `url`/`port` | planned |
| S17 | Rust | `cargo test` | workspace A/B | two claims | A tap hits A port/udid only | planned |
| S18 | Rust | `cargo test` | unknown udid | no such live claim | `DeviceUnknown`; no I/O | planned |
| S19 | Rust / API | `cargo test` | envelope codes | invoke / service | `NO_CLAIM`, `DEVICE_UNKNOWN`, `CLAIMED_BY_OTHER_WORKSPACE`, `PLATFORM_MISMATCH`, `INVALID_COORDS`, `HELPER_UNREACHABLE` | planned |
| S20 | Structural | grep | manifest | `system-skills-manifest.json` | skill files listed | planned |
| S21 | Structural | bun/grep | web simulator | `SimulatorPanel` | still iframe; no DeviceScreen canvas | planned |
| S22 | Manual | human | Mac + live preview | iOS then Android | iframe reacts; no-claim CLI does not boot qemu | planned |
| S23 | Rust | `cargo test` | status handle | live claim with name | `{ udid, name, platform }` present | planned |
| S24 | Rust | `cargo test` | other workspace udid | A claims Pixel, B claims iPhone | from A, `--udid` of B → `ClaimedByOtherWorkspace`; B untouched | planned |
| S25 | Structural / Rust | grep + `cargo test` | skill + list DTO | two live claims | skill says list+ask; list rows have project_name + workspace_name + current | planned |
| S26 | Bun | `bun test` | SimulatorPanel overlay + prompt | live session fixture | Agent button present outside iframe; clipboard protocol has udid, no port; Copied not toast | planned |
| S27 | Bun | `bun test` | slash expand | `[#ctx:device-preview:…]` | send expands to `formatDevicePreviewPrompt` body, not `/device-preview` | planned |
| S28 | Bun structural | `bun test` / grep | Welcome + Terminal + Agent Chat | those three files | `DEVICE_PREVIEW_SLASH_COMMAND_ID`; Agent Chat not `/cmd:` | planned |

## Scenarios

### S1 — System skill exists

- **Level**: Structural
- **Given**: repo after implementation.
- **When**: system skill sync list is read.
- **Then**: `atmos-device-preview` is a system skill with a decision tree.
- **Signals**: `skills/atmos-device-preview/SKILL.md` frontmatter; name in `ALL_SYSTEM_SKILL_NAMES`.

### S2 — Not folded into atmos-cli / not Desktop Use

- **Level**: Structural
- **Given**: `atmos-cli` and `atmos-desktop-use` skills.
- **When**: those files are read.
- **Then**: they point phone/simulator control to `atmos-device-preview` and do not document helper curl.
- **Signals**: explicit “Not this skill” lines.

### S3 — Agent never sees helper dialect

- **Level**: Structural
- **Given**: skill + `atmos simulator --help`.
- **When**: agent-facing text is scanned.
- **Then**: no serve-emu REST paths, no `serve-sim tap` as the product command, no ports/tokens.
- **Signals**: product command is `atmos simulator …`.

### S4 — No claim

- **Level**: Rust
- **Given**: workspace with no live `DeviceClaim`.
- **When**: `screenshot` or `tap` runs.
- **Then**: `NoClaim`; no helper process spawned; `DevicePreviewService::start` is not used.
- **Signals**: error code `NO_CLAIM`; fix mentions Start Simulator / `atmos simulator start` as an **explicit** next action only.

### S5 — Tap does not auto-boot

- **Level**: Rust
- **Given**: spy/fake preview service.
- **When**: control verbs run without a claim.
- **Then**: start count stays 0.
- **Signals**: unit assertion on start invocations.

### S6 — iOS screenshot via simctl

- **Level**: Rust
- **Given**: iOS claim + fake `simctl io` that writes a tiny PNG.
- **When**: `simulator_screenshot`.
- **Then**: dest file exists; result includes path, width, height, platform `ios`, claim udid.
- **Signals**: no `/exec` call.

### S7 — Android tap hits helper HTTP

- **Level**: Rust
- **Given**: Android claim port bound to a fake serve-emu.
- **When**: tap `0.5, 0.5`.
- **Then**: one `POST /api/tap` with JSON `{x:0.5,y:0.5}`.
- **Signals**: path and body; host is loopback.

### S8 — iOS tap uses packed serve-sim CLI

- **Level**: Rust
- **Given**: iOS claim + fake binary recorder.
- **When**: tap `0.2, 0.8`.
- **Then**: argv is `tap 0.2 0.8 -d <udid>` (or equivalent clap order documented in TECH).
- **Signals**: udid from claim; coords passed through.

### S9 — Swipe both platforms

- **Level**: Rust
- **Given**: each helper fake.
- **When**: swipe with four coords.
- **Then**: Android `/api/swipe`; iOS `gesture` begin/move/end (or documented serve-sim equivalent).
- **Signals**: all four numbers 0..1.

### S10 — Type both platforms

- **Level**: Rust
- **Given**: ASCII text.
- **When**: `simulator_type`.
- **Then**: Android `/api/text`; iOS `type`.
- **Signals**: text preserved.

### S11 — Coord rejection

- **Level**: Rust
- **Given**: any live claim.
- **When**: tap x=1.5 or y=-0.01.
- **Then**: `InvalidCoords`; adapter not called.
- **Signals**: no HTTP, no spawn.

### S12 — Skill coordinate rule is not Desktop Use

- **Level**: Structural / CLI
- **Given**: screenshot result `{width, height}` and skill text.
- **When**: agent follows the skill.
- **Then**: it divides PNG pixels by size; CLI has no `--coord-space`.
- **Signals**: skill table; clap args `--x --y` only.

### S13 — iOS Back unsupported

- **Level**: Rust
- **Given**: iOS claim.
- **When**: `press back` or `press recents`.
- **Then**: `UnsupportedOnPlatform`; serve-sim `button` not run.
- **Signals**: `fix` suggests Home (or user swipe).

### S14 — Home both; Android Back

- **Level**: Rust
- **Given**: iOS and Android claims.
- **When**: `press home` on both; `press back` on Android.
- **Then**: iOS `button home`; Android `/api/key` with `home` then `back`.
- **Signals**: no Power verb in clap.

### S15 — Screenshot is a path

- **Level**: Rust
- **Given**: either adapter returning PNG bytes.
- **When**: result is serialized for WS/CLI.
- **Then**: fields `path`, `width`, `height`; no image payload field.
- **Signals**: JSON size small.

### S16 — CLI does not pass ports

- **Level**: Rust / CLI
- **Given**: sticky workspace context.
- **When**: `atmos simulator tap --udid <claim.udid> --x 0.1 --y 0.2`.
- **Then**: invoke action `simulator_tap` with workspace_id, udid, x, y.
- **Signals**: recorded body has no `url`/`port`/`token`; `udid` is the claim handle.

### S17 — Workspace isolation

- **Level**: Rust
- **Given**: A claimed Android port 1, B claimed iOS udid 2.
- **When**: control(A) tap.
- **Then**: only A’s adapter/port/udid is used.
- **Signals**: B fake receives 0 calls.

### S18 — Unknown udid

- **Level**: Rust
- **Given**: claim udid `AAA`.
- **When**: request `udid: BBB` (not live).
- **Then**: `DeviceUnknown`; no I/O.
- **Signals**: error before adapter.

### S19 — Typed envelope codes

- **Level**: Rust / API
- **Given**: invoke dispatcher.
- **When**: the failure cases above are invoked via CLI/WS.
- **Then**: `error.code` is stable (`NO_CLAIM`, `DEVICE_UNKNOWN`, `CLAIMED_BY_OTHER_WORKSPACE`, `PLATFORM_MISMATCH`, `UNSUPPORTED_ON_PLATFORM`, `INVALID_COORDS`, `HELPER_UNREACHABLE`).
- **Signals**: APP-063 envelope; `fix` + `next_actions` on CLI.

### S20 — Manifest lists skill files

- **Level**: Structural
- **Given**: `skills/system-skills-manifest.json`.
- **When**: APP-071 ships.
- **Then**: `atmos-device-preview` files are listed so sync copies them.
- **Signals**: SKILL.md path present.

### S21 — Preview UI unchanged

- **Level**: Structural
- **Given**: web simulator feature.
- **When**: live preview sources are scanned.
- **Then**: still iframe helper; no native Device Screen.
- **Signals**: same as APP-070 S16.

### S22 — Manual live HID

- **Level**: Manual
- **Given**: Mac with Xcode and/or AVD; Simulator tab started.
- **When**: screenshot → tap a visible button; Android Back; stop preview and tap again.
- **Then**: iframe shows the tap; Back works on Android; second tap is `no_claim` and qemu/sim is not launched by CLI.
- **Signals**: human + CLI JSON.

### S23 — Status returns the device handle

- **Level**: Rust
- **Given**: a live claim with `udid`, `name`, `platform`.
- **When**: `simulator_status` / CLI `atmos simulator status`.
- **Then**: agent-facing result includes those three fields (and helper).
- **Signals**: no need to parse `url` to know which phone.

### S24 — Other workspace’s udid is not drivable

- **Level**: Rust
- **Given**: workspace A claimed Pixel (`udid=Pixel_8`), B claimed iPhone (`udid=AAA`).
- **When**: control from A with `--udid AAA`.
- **Then**: `ClaimedByOtherWorkspace`; B’s adapter receives 0 calls.
- **Signals**: `owner_workspace_id` in the error; fix says switch workspace or start that device here.

### S25 — Skill asks when id is missing

- **Level**: Structural / Rust
- **Given**: two live claims on the Computer; user message has no udid and no Device Preview chip.
- **When**: the agent follows the skill.
- **Then**: it runs `atmos simulator list`, shows name/platform/project/workspace, and asks; it does not tap yet.
- **Signals**: skill decision tree; list DTO includes `project_name`, `workspace_name`, `current`.

### S26 — Agent copy button

- **Level**: Bun
- **Given**: Simulator tab ready with a claim.
- **When**: the user clicks Agent.
- **Then**: clipboard is `atmos://context/device-preview` + prompt with udid/name/platform/project/workspace; no url/port; button shows Copied; no success toast. Control is on Atmos `SimulatorPanel`, not in serve-emu markup.
- **Signals**: overlay in `SimulatorPanel`; prompt builder unit test.

### S27 — Chip expands on send

- **Level**: Bun
- **Given**: composer text is a device-preview AI-context token plus “tap Sign in”.
- **When**: `expandAgentComposerText` / `resolvePromptPlaceholders` runs.
- **Then**: outbound text is the prompt body + user words, not `/device-preview` and not a skill path.
- **Signals**: same body as Copy.

### S28 — Slash on three surfaces

- **Level**: Structural
- **Given**: Welcome composer, Terminal overlay, Agent Chat popover.
- **When**: `/` query matches device preview.
- **Then**: Atmos command `device-preview` is listed; selecting it inserts an AI-context chip; Agent Chat does not apply `/cmd:device-preview`.
- **Signals**: `DEVICE_PREVIEW_SLASH_COMMAND_ID` in all three; Agent Chat select path uses `applyAiContextAtRange`.

## Exploratory agent-browser checks

v1 now has Simulator overlay + slash. When UI is up: confirm Agent button sentence case, Copied inline, `/device-preview` in Terminal and Agent Chat, send expands to text with udid (no port).

## Regression checklist

- [ ] APP-070 probe/start/stop/status still work; control verbs absent does not break start.
- [ ] Two workspace claims (APP-070) still exclusive; control cannot cross.
- [ ] `POST /api/cli/invoke` unknown-action envelope unchanged for typos.
- [ ] Desktop Use CLI still independent (`atmos desktop-use`).
- [ ] serve-emu / serve-sim spawn argv still loopback, still no `--kill` on stop.

## Acceptance criteria

- [ ] M1–M15 each have a scenario that would fail if the behavior regressed.
- [ ] No claim never boots a device.
- [ ] iOS Back is an error, not a no-op.
- [ ] Agent-facing docs do not include helper ports or REST.
- [ ] Screenshot is a filesystem path with dimensions and `udid`.
- [ ] Targeting another workspace’s `udid` fails without moving that device.
- [ ] Missing user id → list includes project and workspace names.
- [ ] Copy and slash send the same prompt body; composer chip does not stay as `/device-preview` on the wire.
- [ ] api-types `WsContract` includes the five control actions plus `simulator_list`.

## Manual verification steps

1. Start iOS preview in a workspace. `atmos context set --workspace <id>`. `atmos simulator status` → copy `udid`. `atmos simulator screenshot --udid …` → open PNG. Tap a control using px/width. Confirm iframe.
2. Repeat on Android; `atmos simulator press --key back --udid …`.
3. `atmos simulator stop` then `tap` → `NO_CLAIM`, Activity Monitor shows no new emulator.
4. Second workspace with its own preview: from A, pass B’s `udid` → `CLAIMED_BY_OTHER_WORKSPACE`; B’s iframe does not move.
5. Ask Chat (with skill synced) to tap with no udid while two previews are live; confirm it lists project/workspace and asks.
6. Click Agent on the Simulator tab; paste into Chat — chip, then send — model sees udid text, not a slash token.
7. `/device-preview` in Terminal and in Agent Chat; same expand.

## Non-coverage

- Real pixel-perfect tap accuracy vs different device bezels (manual only).
- Accessibility tree (N2).
- Install/launch/Metro.
- Relay/remote Computer.
- Injected Chat tool chips (N3).
- Non-ASCII iOS type success (expected fail path only).
- Playwright live emulator.

## Coverage Status

Not run. Implementation has not started. After impl, append exact `cargo test` / `bun test` command lines and remaining gaps here.
