# Brainstorm · APP-070: Simulator optimize + Android

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-060 shipped a Desktop iOS Simulator tab: vendored `serve-sim`, GitHub Release download into `~/.atmos/runtime/serve-sim/<version>/`, spawn from the local Atmos Server, iframe the helper preview. That path works, but the domain is still iOS-only, probe is all-or-nothing, and claim rules still assume one helper at a time in spirit (APP-060 S7) even though `apps/api/src/simulator.rs` already keys claims by workspace.

Trigger: add Android Emulator preview **and** make Simulator a Computer-level Device Preview capability that several workspaces can use without sharing one global sim.

Source note (Chinese architecture dump): [`sources/arch_discussion.md`](./sources/arch_discussion.md). That dump is useful for ownership language. It is **not** locked as-is — see Options and forks.

### Current architecture (as of APP-060)

```text
apps/web SimulatorPanel
  → /ws simulator_probe|start|stop|status
  → apps/api/src/simulator.rs   (probe, download, spawn, claims, hide Simulator.app)
  → ~/.atmos/runtime/serve-sim/<version>/serve-sim
  → iframe http://127.0.0.1:<port>/?device=<udid>
```

- `crates/runtime-manager` only exposes layout paths (`serve_sim_runtime_dir`, `simulator_state_dir`).
- Atmos does **not** own Metro, xcodebuild, gradle, install, or launch. Users run those from Terminal.
- Hosted Web cannot boot a Simulator. Preview URL is loopback on the Computer.
- Product UI **is** the serve-sim page inside an iframe (APP-060 M4).

## Goals (draft)

- Primary: one Device Preview subsystem for iOS Simulator + Android Emulator, same vendor/runtime install model as APP-060.
- Primary: Computer owns devices; Workspace owns a claim. Two workspaces can preview at once on two devices.
- Secondary: Android preview chrome matches vendored serve-sim (picker, below-device actions, right tools). Keep iframe.
- Not this spec: Metro / build / install / launch, native Atmos canvas, Agent HID tools, Linux/Windows, physical devices.

## Options

### Option A — Add Android beside `simulator.rs`, keep APP-060 product shape

Duplicate download/spawn for `serve-emu`, extend probe reasons, keep iframe.

**Pros**: smallest diff.
**Cons**: leaves ~1k lines of business logic in `apps/api`; probe stays a single reason; claim policy stays muddy; Android UI will not match iOS.

### Option B — Unified Device Preview + Workspace claim, iframe kept (locked)

Computer-level registry + preview helpers; Workspace-level exclusive claim; per-platform probe; vendor `expo/serve-emu` like `serve-sim`; iframe both; patch serve-emu chrome to serve-sim.

**Pros**: matches real ownership; Android is a platform, not a second feature; APP-060 install model reused; no second HID stack.
**Cons**: claim + probe refactor; we maintain two vendor trees.

### Option C — Native Atmos Device Screen now

Atmos draws the phone, consumes helper streams/HID/AX directly. Helpers become headless bridges.

**Pros**: one Atmos product UI; iframe goes away.
**Cons**: months; APP-060 already rejected this as the main path. Revisit later.

### Option D — Also own Metro / build / install / launch

Workspace-isolated bundler and app process as first-class resources.

**Pros**: true multi-app isolation.
**Cons**: Atmos does not spawn Metro today. Separate spec. Bundling it here blocks Android.

### Option E — `npx serve-emu` / `serve-avd` at runtime

**Pros**: no vendor.
**Cons**: rejected by APP-060. Desktop must not depend on npm at runtime.

## Key forks in the road

| Fork | Decision | Where |
|------|----------|--------|
| Scope | Device Preview + Workspace claim. **No** Metro/build/install/launch. | PRD |
| Android helper | Vendor [expo/serve-emu](https://github.com/expo/serve-emu) (`serve-emul`, Apache-2.0). **Not** npm `serve-avd`. | PRD / TECH |
| Preview UI | Keep iframe. Patch serve-emu preview chrome to match vendored serve-sim. Native canvas later. | PRD |
| Claim policy | Auto-claim a **free** device. Never steal. Empty → prompt (start another / none). Restore claim when the workspace returns. | PRD |
| Hosts | macOS arm64 Desktop / local Computer only (iOS + Android). | PRD |
| Physical devices | Out. Emulators / simulators only. | PRD |
| `/exec` | Keep APP-060: loopback + upstream token/Origin. Do not strip for iframe Home/rotate. | TECH |
| Layering | Domain in `core-service`, inventory in `core-engine`, paths in `runtime-manager`, thin WS in `apps/api`. Do **not** put Device Preview inside Runtime Manager (that crate supervises Atmos Server). | TECH |
| Wire names | Keep `simulator_*` actions; extend payloads with `platform`. | TECH |
| Helper topology | One helper process per claimed device (serve-emu multi-device routing is still planned upstream). | TECH |

## Open questions

- [x] Metro in v1? → **No.** Decide in PRD.
- [x] `serve-avd` vs `serve-emu`? → **serve-emu.** Decide in PRD.
- [x] Iframe vs native canvas? → **iframe + chrome parity.** Decide in PRD.
- [x] Steal vs auto-claim free? → **auto-claim free, no steal.** Decide in PRD.
- [x] Linux/Windows Android? → **No.** Decide in PRD.
- [x] Physical adb devices? → **No.** Decide in PRD.
- [x] Exact serve-emu git tag / compile layout (scrcpy bits, bun `--compile`) → commit `def2e0d87a60857ba5a303750bcb7de9f5fc7185`; binary `serve-emu`; pack copies `vendor/scrcpy-server-v4.0` next to the binary.
- [ ] How hard is hiding the Android Emulator.app / qemu window vs Simulator.app → TECH (best-effort).

## References

- Existing: `apps/api/src/simulator.rs`, `apps/web/src/features/simulator/`, `packages/api-types/src/ws/dto/simulator.ts`, `vendor/serve-sim/`
- Related spec: [`../APP-060_vendor-serve-sim/`](../APP-060_vendor-serve-sim/)
- Layout: `agents/references/runtime/atmos-home-layout.md`
- Upstream iOS: `expo/serve-sim` (already vendored)
- Upstream Android: `expo/serve-emu` (Apache-2.0). Official README still lists compiled single binary as **Planned** — Atmos compiles like APP-060.
- Rejected name: `serve-avd` / `hsandhu/serve-avd` (not the Expo sibling)

## Ready to promote

- Promote to PRD: unified Device Preview; iOS + Android emulators; iframe; serve-emu vendor; exclusive auto-claim; macOS arm64 only; no Metro/agent/physical/Linux.
- Promote to TECH: per-platform probe, claim state vs boot state, move domain out of `apps/api`, pack/release for serve-emu, iframe device-switch vs claim sync, serve-emu chrome patch contract.
