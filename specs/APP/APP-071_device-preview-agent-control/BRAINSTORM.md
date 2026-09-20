# Brainstorm · APP-071: Device Preview agent control

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-060 / APP-070 already start a loopback helper (`serve-sim` or `serve-emu`) and iframe it in the Simulator tab. Both helpers are built for **agent workflows** (tap, type, screenshot, keys). Atmos Chat does not use that surface today: the agent has Bash / MCP / Desktop Use, but no first-class way to drive the **claimed** simulator in this workspace.

Trigger: users now want the in-tab iOS/Android preview to be operable from Agent Chat — “tap the login button”, “type this”, “screenshot and check” — without leaving Atmos or teaching two helper dialects.

Current workaround: user taps in the iframe; or an agent with shell guesses `127.0.0.1:<port>` and curls serve-emu / runs `serve-sim tap` (leaks ports, skips claim rules, two APIs).

Who feels it: Agentic Builder iterating on Expo / RN / native apps in a workspace that already has Device Preview running.

Why it’s hard: iOS and Android helpers do not share a protocol. Agent hosts (Claude, Codex, ACP) do not share a tool-injection API. Claims live in `DevicePreviewService`; HID lives inside the helper process.

## Goals (draft)

- Primary: one **workspace-scoped device control** surface the agent can call, covering iOS and Android, using the existing claim (do not start a second capture stack).
- Primary: hide helper dialects. Agent speaks one verb set (screenshot / tap / swipe / type / press).
- Secondary: same verbs available from `atmos` CLI so any coding agent with Bash + skill can drive it (not only a future injected Chat tool).
- Not this spec: Metro / install / launch, physical USB devices, native Atmos canvas, remote Computer over relay.

## Options

### Option A — Teach the agent each helper’s native API

Skill text: “if Android, curl `/api/tap`; if iOS, `serve-sim tap`”. Pass `preview_url` from `simulator_status`.

**Pros**: almost no Atmos code; helpers already document this.
**Cons**: two dialects; agent sees ports/tokens; skips claim ownership; screenshot/coord spaces diverge; every host still needs a skill.
**Unknown**: how often agents pick the wrong helper.

### Option B — Inject Chat tools into every agent host

Add `device_tap` etc. as native tools on Claude / Codex / OpenCode / ACP session setup.

**Pros**: looks like first-class tools in the transcript.
**Cons**: per-host injection is fragile (APP-068 honesty tables); ACP hosts may ignore unknown tools; duplicates Desktop Use’s lesson (“No MCP, use CLI + skill”).
**Unknown**: which hosts allow extra tools without breaking the session.

### Option C — Unified Device Control in core-service + CLI + skill (locked)

`DeviceControlService` resolves this workspace’s live `DeviceClaim`, then an **adapter** talks to serve-sim or serve-emu. Wire is new `simulator_*` control actions. CLI is a thin `POST /api/cli/invoke` client (APP-063). Delivery to agents is a system skill `atmos-device-preview` (same family as `atmos-desktop-use` / `atmos-browser-use`).

**Pros**: one verb set; claim-safe; WS-first; CLI works for every Bash-capable agent; no second HID stack.
**Cons**: we maintain two adapters; skill must be loaded; Chat UI will show Bash/`atmos simulator` rather than a dedicated tool chip unless we later classify it.
**Unknown**: iOS screenshot path (simctl vs helper HTTP) reliability.

### Option D — Local MCP server wrapping the claim

Atmos spawns an MCP next to the helper; Chat MCP-calls it.

**Pros**: structured tools in hosts that speak MCP.
**Cons**: Desktop Use already rejected MCP as the product path; extra process; still need adapters; ACP/native mix is uneven.
**Unknown**: MCP availability on every Chat provider we ship.

## Key forks in the road

- **Fork 1 — Agent delivery**: skill+CLI vs injected Chat tools vs MCP. **Decide in PRD.**
- **Fork 2 — Start vs require claim**: agent may call `simulator_start`, or v1 requires an already-running preview. **Decide in PRD.**
- **Fork 3 — Coordinate space**: normalized 0..1 (both helpers) vs PNG pixels (Desktop Use). **Decide in TECH.**
- **Fork 4 — One tagged `simulator_control` vs per-verb `simulator_tap` / `screenshot` / …**. **Decide in TECH.**
- **Fork 5 — Accessibility tree in v1 vs screenshot-only.** **Decide in PRD** (Nice to Have).
- **Fork 6 — How the agent names a device when several previews are live.** Workspace slot vs `udid` vs new `claim_id` vs `platform`. **Decide in PRD.**
- **Fork 7 — How the user injects device context into Chat.** Skill-only vs Copy prompt vs slash chip. **Decide in PRD.**

## Open questions

- [x] Delivery surface — skill + CLI (Option C). Injected tools / MCP = later.
- [x] Live claim required in v1 — do not auto-boot an emulator from Chat.
- [x] TECH: iOS screenshot via `simctl io`; HID via packed `serve-sim` CLI; Android via loopback HTTP.
- [x] TECH: PNG under `~/.atmos/tmp/device-preview/<workspace_id>/`; wire returns path + dimensions, not bytes.
- [x] Device handle is existing claim `udid` (not a new UUID, not `platform`). Workspace authorizes; `udid` selects.
- [x] Missing id → skill lists claims with project/workspace and asks. Copy Agent prompt + `/device-preview` chip expand to the same text.

## References

- Existing code: `crates/core-service/src/service/device_preview/`, `apps/api/src/api/ws/router/simulator.rs`, `packages/api-types/src/ws/contract/simulator.ts`, `vendor/serve-sim`, `vendor/serve-emu`
- Related specs: [APP-060](../APP-060_vendor-serve-sim/PRD.md), [APP-070](../APP-070_simulator-optimize-add-android/PRD.md) (Agent automation was Out of scope / Phase 2), [APP-063](../APP-063_agent-first-product-cli/PRD.md), Desktop Use skill `skills/atmos-desktop-use/`
- External: serve-emu REST (`POST /api/tap|swipe|text`, `GET /api/screenshot`); serve-sim CLI (`tap`, `button`, `type`) with normalized 0..1 coords

## Ready to promote

Promoted: Option C; live claim required; iOS+Android same verbs; DeviceControlService + two adapters; `simulator_*` WS; CLI invoke; skill `atmos-device-preview`; 0..1 coordinates; device handle = `udid`. See [PRD.md](./PRD.md) and [TECH.md](./TECH.md).
