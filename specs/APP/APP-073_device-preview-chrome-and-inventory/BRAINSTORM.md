# Brainstorm · APP-073: Device Preview chrome and inventory

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Device Preview (APP-060 / APP-070) already streams an iOS Simulator or Android Emulator into the Simulator tab through a vendored helper iframe, with one exclusive workspace claim. Agent HID is APP-071 and stays on that claim.

Three product gaps sit on top of that, not beside it:

1. The iOS helper pin is still `0.1.37-atmos.1`. Upstream `expo/serve-sim` has `0.1.48`. Atmos patches (loopback, de-brand, `atmos:simulator-stop` instead of global `--kill`, device postMessage) must survive a rebase.
2. Appearance (light / dark) and Android camera PNG injection only exist inside the helper page, if at all. The Simulator tab chrome does not own them.
3. APP-070 v1 never creates a simulator or AVD. When nothing is free, the tab says so. Users still leave Atmos for Xcode / Android Studio to add, boot, or shut down devices.

Current workaround: pick among devices the host already has; flip appearance in the iframe tools; there is no first-party Android camera control; create/boot/shutdown happens outside Atmos.

Who feels it: Agentic Builder on a Mac iterating on a mobile app who wants the Simulator tab to be the place they manage and look at the phone, not only the place they iframe it.

Why it’s hard: create / boot / shutdown are host lifecycle, not stream features. serve-sim and serve-emu already disagree on UI and HTTP. Putting a second catalog in each helper would fork the product. Claims, RAM, and “never steal” still apply if Atmos starts creating VMs.

## Goals (draft)

- **Primary** — Rebase vendored serve-sim to upstream `0.1.48` as `0.1.48-atmos.1` without dropping Atmos patches or the iframe preview.
- **Primary** — Light / dark appearance for the claimed iOS or Android device lives in Atmos Simulator chrome, not as a helper-only setting.
- **Primary** — Android claimed preview can take a PNG on the front or back camera from Atmos chrome.
- **Primary** — Simulator tab shows a Computer-wide device inventory: add/create, boot, shut down. One form: platform → device type → installed runtime / system image.
- **Secondary** — Helpers stay stream + HID. They do not grow a parallel create/boot UI.
- **Secondary** — One workspace still previews at most one device. Inventory can list many; it does not stream many.

## Options

### Option A — Helper bump only
Rebase serve-sim, ship the pin, leave chrome and create for later.

**Pros**: Smallest diff; APP-070 claim model untouched.
**Cons**: Appearance and camera stay buried; empty “no device” state still has no next step.
**Unknown**: Patch conflict size on 0.1.48 chrome.

### Option B — Atmos chrome over the existing iframe, inventory in our service
Keep iframe + one claim. Add Atmos chrome (appearance, Android camera) and an inventory panel whose verbs hit `DevicePreviewService` / `host_devices`. Create/boot/shutdown are one Computer API that branches on `platform`. Helpers are not asked to implement catalogs.

**Pros**: Matches APP-070/071 layering; one UI; one claim rule; no second helper dialect; create is user-initiated so RAM stays explicit.
**Cons**: Inventory + iframe can duplicate the helper device list; Android camera requires Atmos-owned AVD boot flags (`imagefile:`).
**Unknown**: none for inject — TECH pins `imagefile:` + atomic PNG rewrite.

### Option C — Each helper implements create / boot / appearance / camera
Patch serve-sim and serve-emu so each helper page grows its own device manager. Atmos only iframes.

**Pros**: Looks like “the preview already has tools.”
**Cons**: Two catalogs, two error shapes, two chrome languages; claims still have to intercept helper switches; Android camera still is not in our vendored serve-emu; product becomes the helper.
**Unknown**: How we keep workspace exclusivity when the helper is the source of truth.

### Option D — Replace the iframe with a native Atmos phone canvas
Consume helper stream/HID directly (APP-070 N1) and build inventory + appearance + camera on that canvas.

**Pros**: One chrome forever.
**Cons**: Rewrites the preview path; blocks the bump and inventory; out of this spec’s budget.
**Unknown**: Stream protocol work already deferred.

## Key forks in the road

- **Fork 1**: Who owns create / boot / shutdown — Atmos service + `host_devices`, or each helper. **Decide in PRD.** Recommendation: Atmos. Input is platform + device type + runtime. Helpers do not get a catalog API.
- **Fork 2**: Inventory vs preview — list many, stream one (keep APP-070 claim) vs multi-stream. **Decide in PRD.** Recommendation: list many, preview one.
- **Fork 3**: Boot vs Preview — boot only (VM on, no iframe) vs Preview (boot if needed + claim + helper). **Decide in PRD.** Recommendation: both verbs. Preview stays `simulator_start`.
- **Fork 4**: Appearance / camera target — claimed device only vs any booted device. **Decide in PRD.** Recommendation: claimed device (same authorization as APP-071).
- **Fork 5**: Create may download a system image / iOS runtime. **Decide in PRD.** Recommendation: v1 only uses already-installed runtimes/images; missing → typed error.
- **Fork 6**: Delete after create. **Decide in PRD.** Recommendation: include delete; create without delete fills the disk.
- **Fork 7**: Duplicate helper tools (appearance, camera, device list). **Decide in TECH.** Recommendation: Atmos chrome is the product; hiding helper duplicates is Nice to Have if cheap after the 0.1.48 rebase.

## Open questions

- [x] Android still PNG — emulator `imagefile:` paths + atomic rewrite; no gRPC; no helper camera stack. — **TECH**
- [x] Default device name — iOS display-style; AVD `[A-Za-z0-9._-]+`. — **TECH**
- [x] Preview of Shutdown Android — Atmos boot (seed + camera flags) then helper attach `-s`. — **TECH**
- [x] 0.1.48 chrome — rebase ATMOS-PATCHES behaviors. — **TECH**

## References

- Existing code: `crates/core-engine/src/host_devices/`, `crates/core-service/src/service/device_preview/`, `apps/api/src/api/ws/router/simulator.rs`, `apps/web/src/features/simulator/`, `vendor/serve-sim/ATMOS-PATCHES.md`, `vendor/serve-sim/UPSTREAM.md`, `crates/core-service/pins/serve-sim-requirement.json`
- Related specs: [APP-060](../APP-060_vendor-serve-sim/PRD.md), [APP-070](../APP-070_simulator-optimize-add-android/PRD.md), [APP-071](../APP-071_device-preview-agent-control/PRD.md)
- External: `expo/serve-sim` tag `@expo/serve-sim@0.1.48`; iOS `simctl` create/boot/shutdown/delete + `simctl ui appearance`; Android `avdmanager` / `emulator` / `adb shell cmd uimode night`

## Ready to promote

- Promote to PRD: Option B. Helper bump + Atmos chrome (appearance, Android camera) + Computer inventory (add/create, boot, shut down, delete). One claim, iframe stays. Create does not auto-download SDK/runtimes. Physical devices stay out. Native canvas stays out.
- Promote to TECH: Lifecycle in `host_devices` + `DevicePreviewService`; appearance via simctl/adb; Android camera via `imagefile:` + file rewrite; new `simulator_*` WS; rebase serve-sim patches; no catalog inside serve-sim / serve-emu.
