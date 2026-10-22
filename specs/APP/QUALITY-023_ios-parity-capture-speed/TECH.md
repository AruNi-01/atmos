# TECH · QUALITY-023: iOS parity capture speed

> Technical Design · HOW. Speed up the label-gated `ios-simulator` capture path without shrinking APP-081 / QUALITY-016 coverage. Not a product feature. No BRAINSTORM or PRD (quality spec).

## Scope summary

The `Install, launch, and capture` step (`scripts/agent-chat-parity/ios-capture.sh`) is the long pole of `CI - Mobile iOS parity` / `ios-simulator`. This spec keeps every fixture, every assertion, and the PillTap non-zero miss contract. It changes **how** those passes run: stills stays a parallel job after `ios-build`, motion is serial after stills, wait on logs instead of fixed sleeps, and stop writing the preview flag into files. Eng Manager stopped PillTap destination-preflight work after three labeled false fails.

Out of scope: CocoaPods / DerivedData caching (open #343, QUALITY-022 on that branch), raising `oxlint --max-warnings` above 455, `EVIDENCE_PUSH`, committing screenshots or recordings, adding the `ios-parity` label, and weakening PillTap (`A miss does not fail the job` stays gone).

## Quality target

Baseline is GitHub Actions run `39530230224` on `macos-26` / Xcode 26.5 / iPhone 17 Pro / iOS 26.5.

| Item                                | Attempt 1                                         | Attempt 2                       | After                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Job wall                            | 1h15m56s (01:57:03–03:12:59Z)                     | 1h51m51s (03:13:36–05:05:27Z)   | Build, then stills, then serial motion. Wall ≈ `ios-build` + stills + motion. ≤ **55 min** is a stretch once motion no longer overlaps stills |
| Capture step                        | **39m19s** (02:33:09–03:12:28Z)                   | **52m24s** (04:12:22–05:04:46Z) | No single 40–50 min step. Stills target ≤ **12 min**. Motion target ≤ **18 min** including boot                                               |
| 26 fixture stills                   | ~18 min (02:34:29–02:52:19Z)                      | ~23 min (04:13:23–04:36:27Z)    | ≤ **10 min**. Drop the 15s post-ready sleep; wait `[parity] painted`; do not block on `log show --last 10m`                                   |
| First PillTap (`testTapScrollPill`) | 6m51s (02:53:25–03:00:16Z)                        | 9m03s (04:38:38–04:47:41Z)      | Serial `xcodebuild test` on the motion job (no destination preflight). Same UDID. Cold compile is accepted; do not resume prebuild.           |
| `RECORD_SECONDS` still mux          | 8s movies from one PNG                            | same                            | 4s (duration gate remains ≥ 3s). Live `recordVideo` still runs for the motion passes that need it                                             |
| `EXPO_PUBLIC_PARITY_PREVIEW=1`      | Job `env:` plus `.env` and `ios/.xcode.env.local` | same on that branch             | Command / step `env:` only. No preview-flag files                                                                                             |
| Trigger                             | `workflow_dispatch` or PR label `ios-parity`      | same                            | Unchanged                                                                                                                                     |

### Where attempt 1 spent the 39m19s

| Phase                                                        | Clock              | Approx  |
| ------------------------------------------------------------ | ------------------ | ------- |
| Springboard framebuffer check                                | 02:33:58–02:34:01Z | 3s      |
| F1–F13 light + dark, one launch each, `sleep 15` after ready | 02:34:29–02:52:19Z | 18 min  |
| f13-tail away (3 screenshots + 8s mux)                       | 02:52:20–02:53:05Z | 45s     |
| f13-tail return PillTap (cold `xcodebuild test`)             | 02:53:25–03:00:16Z | 7 min   |
| stream-tools                                                 | 03:00:20–03:00:57Z | 37s     |
| F4 live + reduced `recordVideo`                              | 03:00:58–03:03:12Z | 2 min   |
| F4 pinned replay stills (non-failing)                        | 03:03:12–03:05:03Z | 2 min   |
| F12 lane stills (non-failing)                                | 03:05:05–03:05:45Z | 40s     |
| F12 pill taps                                                | 03:05:45–03:06:50Z | 1 min   |
| F12 card-row light + dark                                    | 03:06:50–03:11:07Z | 4 min   |
| Composer states + keyboard                                   | 03:11:07–03:12:27Z | 1.5 min |
| Still mux F4/F12/F13                                         | 03:12:27–03:12:28Z | 1s      |

Attempt 2 is the same script on a slower runner: almost every ready line printed `found … via log show`, and the first PillTap compile took 9 min. That is the 52m24s capture.

### Expected savings (capture wall, with evidence)

| Change                                                              | Attempt 1 save                      | Attempt 2 save | Evidence                                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line-buffered `log stream` + delay `log show`                       | ~3–5 min                            | ~6–8 min       | Attempt 2 F1: JS ready at 04:13:35Z, `log show` returned 04:14:02Z. Most frames then wait 15–30s in `log show --last 10m` (bounded 45s) instead of the stream file     |
| Replace `sleep 15` with `[parity] painted`                          | ~5–6 min                            | ~5–6 min       | 26 × 15s = 6.5 min guaranteed. Run 38877961991 was too early at 6s; painted waits until transcript content height is stable, with an 8s fallback                       |
| PillTap destination preflight / `test-without-building`             | withdrawn                           | withdrawn      | Three labeled rounds false-failed `wait_for_xcode_destination` while the sim was Booted. Eng Manager stopped further PillTap preflight work. Serial `xcodebuild test`. |
| Stills parallel after `ios-build`; motion serial after stills       | stills no longer sits behind motion | same           | Stills job `needs: ios-build`. Motion job `needs: [ios-build, ios-simulator]`. Wall ≈ `ios-build` + stills + motion.                                                   |
| `RECORD_SECONDS` 8 → 4; skip live record when the pass is still mux | ~0–1 min                            | ~0–1 min       | Mux is CPU. Live `recordVideo` stays on F4 replay, F12 pills, F12/F13 card rows, composer keyboard                                                                     |
| Build without booting the simulator                                 | 0 capture / ~4 min job              | same           | Attempt 1 boot was 3m38s before prebuild. Stills boots after `ios-build`; motion boots after stills. Neither boots in front of Atmos `xcodebuild`                      |

Stills no longer sit behind motion, but motion no longer overlaps stills. Combined capture wall is stills then motion. Job wall target stays **≤ 55 min** when `ios-build` is short; serial motion makes that a stretch if motion stays ~30 min.

### Measured (labeled run `39570872781`, head `ae64d00da`)

Workflow **success**, wall **55m10s** (08:39:01–09:34:11Z). Hits the ≤55 min job target. Combined capture wall (max of the two capture steps) is **30m08s**, not the ≤18 min stretch target — motion/xctrunner is still the long pole.

| Job / step                     | Clock              | Duration   | vs this spec                                      |
| ------------------------------ | ------------------ | ---------- | ------------------------------------------------- |
| `ios-build`                    | 08:39:03–08:56:31Z | **17m28s** | under 35 min                                      |
| `xcodebuild` inside build      | 08:41:04–08:56:19Z | 15m15s     | no simulator boot                                 |
| `ios-simulator (stills)` job   | 08:56:34–09:16:36Z | ~20m       | overlapped with motion                            |
| stills capture                 | 09:04:03–09:15:58Z | **11m55s** | hits TECH ≤12 min; TEST ≤10 min after boot missed |
| stills boot                    | 08:58:54–09:04:03Z | ~5m        |                                                   |
| `ios-simulator (motion)` job   | 08:56:35–09:33:56Z | ~37m       | wall driver after build                           |
| motion capture                 | 09:03:13–09:33:21Z | **30m08s** | above TECH ≤18 min / TEST ≤14 min after boot      |
| motion boot + PillTap prebuild | 08:58:22–09:03:13Z | ~5m        | historical; prebuild later withdrawn              |
| `ios-parity` merge             | 09:33:59–09:34:11Z | 12s        | success                                           |

Earlier labeled attempts on this PR: `39554572933` stills capture 14m42s green / motion SpringBoard Busy; `39561423684` motion capture 32m53s green / stills F4 home-screen (old painted line). Both are fixed on this head.

### Measured savings vs run `39530230224`

| Item              | Attempt 1 | Attempt 2 | Measured (`39570872781`) | Saved vs att. 1          | Saved vs att. 2 | Why it moved                                                                                                                                                                    |
| ----------------- | --------- | --------- | ------------------------ | ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow wall     | 1h15m56s  | 1h51m51s  | **55m10s**               | **~21 min**              | **~57 min**     | `ios-build` 17m then max(stills 20m, motion 37m). Stills no longer serial behind PillTap                                                                                        |
| Capture wall      | 39m19s    | 52m24s    | **30m08s** (motion)      | **~9 min**               | **~22 min**     | Matrix hides stills. Motion is now the capture wall                                                                                                                             |
| 26 fixture stills | ~18 min   | ~23 min   | **11m55s**               | **~6 min**               | **~11 min**     | No `sleep 15`; pty `log stream`; `[parity] painted`. Overlapped, so this does not add to workflow wall                                                                          |
| First PillTap     | 6m51s     | 9m03s     | after boot, same UDID    | compile off the tap path | same            | Historical for this run only (`build-for-testing` + `test-without-building`). Withdrawn after three destination-preflight false fails; current head is serial `xcodebuild test` |

`RECORD_SECONDS` 8→4 is a small mux save (~0–1 min). Preview flag / label gate / evidence policy are correctness, not time. The stills ∥ motion overlap on this run is also historical: Eng Manager later serialized motion after three PillTap destination-preflight false fails.

## Architecture overview

```
structural (ubuntu, every matching PR)
  python self-tests + bun test + compare.ts + rn-web screenshots

ios-build (macos-26, label / dispatch only)
  xcode-select 26.5
  EXPO_PUBLIC_PARITY_PREVIEW=1 bunx expo prebuild   # env, not a file
  pod install
  EXPO_PUBLIC_PARITY_PREVIEW=1 xcodebuild … generic iOS Simulator
  tar Atmos.app → artifact simulator-app

ios-simulator (stills)  (macos-26, needs ios-build)
  download app, boot iPhone 17 Pro, export PARITY_UDID
  PARITY_SHARD=stills ios-capture.sh
  artifact ios-parity-stills

ios-simulator-motion  (macos-26, needs ios-build + stills — serial)
  download app, boot iPhone 17 Pro, export PARITY_UDID
  PARITY_SHARD=motion PILL_TAP_ACTION=test ios-capture.sh
  artifact ios-parity-motion

ios-parity (ubuntu, needs stills + motion)
  merge phone trees → artifact ios-parity
```

Touched paths:

- `.github/workflows/ci-mobile-ios-parity.yml`
- `scripts/agent-chat-parity/ios-capture.sh`
- `scripts/agent-chat-parity/ios-boot-simulator.sh` (new)
- `apps/mobile/src/features/agent-chat/parity-cycle.ts` (`parityPaintedLine`)
- `apps/mobile/src/features/agent-chat/preview-chat-screen.tsx` (painted log)
- `apps/mobile/src/features/agent-chat/AgentChatTranscript.tsx` (optional `onContentSizeChange`)
- `apps/mobile/script/ios-parity-capture.test.ts` (new) and existing locks in `evidence-safety.test.ts` / parity tests

## Design

### D1. Split capture, not coverage

`PARITY_SHARD=all|stills|motion` (default `all` for a laptop). CI stills job sets `stills`; the motion job (after stills) sets `motion`.

- `stills`: springboard check, F1–F13 × light/dark (26 PNGs), distinctness, default-route / F1≠F12 hashes, still mux of F4/F12/F13.
- `motion`: springboard check, f13-tail away + return, stream-tools, F4 replay, F12 lane, F12 pill taps, F12/F13 card-row light+dark, composer states + keyboard.

Both shards install the same Release `.app`. Neither drops a fixture or a PillTap pass. A PillTap miss still prints `PillTap missed:` and exits 1. Replay / lane / composer stills still do not fail the job.

### D2. Wait for paint, not `sleep 15`

`parityReadyLine` fires when the preview claims the frame. Markdown / mermaid can still be missing (run 38877961991, ~6s). The preview logs `parityPaintedLine` once content height has been stable for 600ms, or at 8s after ready, whichever first. `ios-capture.sh` waits for that line (25s cap) then screenshots. The png-flat retry loop stays as a backstop. There is no fixed 15s sleep on the fixture path.

### D3. Do not block the wait loop on `log show`

Run 39530230224 attempt 2 shows JS `[parity] ready` in `os_log` a few seconds after launch, while the script sits in `run_bounded 45 log show --last 10m`. Redirected `log stream` is block-buffered. Capture starts the stream on a pty and copies lines with flush. `log show` is a fallback after 12s, `--last 30s`, 8s bound.

### D4. PillTap is serial `xcodebuild test` (do not resume destination preflight)

Eng Manager 2026-10-21: **stop fixing PillTap**. Three labeled rounds of the destination preflight were false fails — `wait_for_xcode_destination` exited 1 while `simctl` listed `E839A11B` **Booted** and the unpiped `showdestinations` dump already contained `id:E839A11B`:

| Round | Run                     | Head        | What the preflight did                                                                                                   |
| ----- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | `39578448510`           | `a8edae21c` | Labeled a destination miss; dump/list later disagreed with the piped grep                                                |
| 2     | `39591952360` attempt 2 | `90465acd1` | Return module wait held; preflight `2>/dev/null \| grep` failed; dump listed the UDID; `test-without-building` never ran |
| 3     | `39610161253`           | `5e34e6295` | Same: log show found the module; preflight still failed; dump listed the UDID Booted                                     |

Motion is therefore **serial** in two senses, and neither is another preflight patch:

1. **Job DAG**: `ios-simulator (stills)` stays parallel after `ios-build`. `ios-simulator-motion` `needs: [ios-build, ios-simulator]` so it starts only after stills finishes.
2. **PillTap command**: capture uses the script default `PILL_TAP_ACTION=test` (compile + run in one `xcodebuild test`). No `build-for-testing`, no `test-without-building`, no `wait_for_xcode_destination`.

A real `Unable to find a device matching the provided destination` from that `test` is still `PillTap destination missing:` and still exits 1. An XCTAssert miss is still `PillTap missed:` and still exits 1. Busy (`installing or uninstalling`) is the only targeted retry. Do not add the preflight back.

### D7. Motion waits are per-launch

`capture_tail_return` (and the other motion relaunches) use `wait_for_since` after a `log_mark`, same as stills. `wait_for_line` matching the away launch's `[parity] preview-chat module` would let the return pass proceed before this launch painted. `launch_frame` terminates Atmos until `simctl terminate` is a no-op, then stamps `log-mark-epoch.txt`. `wait_for_since` may poll `log show --last 30s` after 12s, but only lines at or after that epoch count — leftover fallback files and the previous stills frame must not match.

## Motion / PillTap instability (root cause)

Labeled motion failed on more than one surface of the same capture path. Root cause is in this table. Two-green-on-final-head is withdrawn for the serialize change; Eng Manager owns the rerun (agent `gh` is read-only).

| Run                     | Head        | Motion                | What the log actually said                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `39554572933`           | `5d38f5c97` | fail                  | SpringBoard Busy while xctrunner installing/uninstalling (`testSwipeCardPills`)                                                                                                                                                                                                                                                         |
| `39561423684`           | `11a2f44b0` | pass (32m53s)         | stills failed on a stale painted line; motion itself green                                                                                                                                                                                                                                                                              |
| `39570872781`           | `ae64d00da` | pass (30m08s)         | both shards green                                                                                                                                                                                                                                                                                                                       |
| `39578448510`           | `a8edae21c` | fail                  | `testTapScrollPill` reported `PillTap missed: scroll pill tap failed`; xcodebuild then `Unable to find a device matching … id:E839A11B-…`. Available destinations: My Mac + two placeholders. No simulators.                                                                                                                            |
| `39585289841`           | `701c626b1` | fail                  | Destination fix held: `build-for-testing` for `E839A11B` in 32s. Return launch 11:14:12Z; away process Atmos[7563] still logging at 11:14:01Z; new Atmos[11020] still registering Expo modules at 11:15:30Z; `wait_for_since` had no log-show fallback and 90s elapsed with an empty console-pty → `f13 tail return missed the module`. |
| `39591952360` attempt 1 | `90465acd1` | pass (29m22s capture) | terminate-until-noop + epoch-filtered log show; full motion green.                                                                                                                                                                                                                                                                      |
| `39591952360` attempt 2 | `90465acd1` | fail                  | Return module wait held (~28s to tap). `wait_for_xcode_destination` used `showdestinations 2>/dev/null \| grep` and failed; the unpiped dump then listed `id:E839A11B-…` and `simctl` showed it **Booted**. Destination table was on stderr when stdout was a pipe — preflight never ran `test-without-building`.                       |
| `39610161253`           | `5e34e6295` | fail                  | Round 3 of 3. Log show found `[parity] preview-chat module`. Preflight still failed; dump listed `id:E839A11B` and simctl **Booted**. `test-without-building` never ran. Structural `assert_cold_launch` flake is QUALITY-011, out of scope.                                                                                            |

Not a cross-shard resource fight: stills and motion are separate `macos-26` VMs. `simctl` still took screenshots of `E839A11B` at 10:17Z. xcodebuild, started for `test-without-building` after a generic `build-for-testing` that overlapped boot, saw zero devices.

Sequence on the failing motion job (`39578448510`):

1. `ios-boot-simulator.sh setup` kills `CoreSimulatorService` (framebuffer hint).
2. `build-for-testing -destination generic/platform=iOS Simulator` starts immediately. Boot is not done until 10:13:18Z; the generic build is already ~4 minutes in with no Booted device. The runner image listed three Shutdown `iPhone 17 Pro` devices.
3. Capture `simctl install`s the prebuilt xctrunner, then `test-without-building` installs it again → Busy on an earlier run.
4. Return launch used `wait_for_line` for `[parity] preview-chat module` (already in the stream from the away launch). The 18s to tap is therefore not proof the return frame was the one xcodebuild attached to.
5. `test-without-building -destination id=E839A11B` resolves destinations from the generic build's empty list and fails. The script labeled that a PillTap miss.

Sequence on the failing motion job (`39585289841`), after the destination fix:

1. Destination held: `build-for-testing` for `E839A11B` finished in 32s; xcodebuild saw the Booted sim.
2. f13-tail away process Atmos[7563] was still logging at 11:14:01Z.
3. Return `simctl launch --console-pty --terminate-running-process` at 11:14:12Z started Atmos[11020] while 7563 had not yet gone idle. console-pty for the return launch stayed empty.
4. `wait_for_since` only watched the empty pty + stream-after-mark. No `log show` fallback. At 11:15:30Z the new process was still registering Expo modules. 90s elapsed → `f13 tail return missed the module` (not a destination miss, not an XCTAssert miss).

Sequence on the failing motion job (`39591952360` attempt 2), after the terminate fix:

1. Return launch 13:31:59Z; `[parity] pill awaiting tap` by 13:32:27Z. Module wait held.
2. `tap_scroll_pill` → `wait_for_xcode_destination` polled `xcodebuild -showdestinations 2>/dev/null | grep id:` until the 60s deadline (wall ~3m because each query was slow).
3. Fail dump (stdout+stderr to the log) listed `{ platform:iOS Simulator, arch:arm64, id:E839A11B-…, OS:26.5, name:iPhone 17 Pro }`. `simctl` listed the same UDID **Booted**.
4. `test-without-building` never ran. This is a detector miss, not an empty CoreSimulator list and not an XCTAssert miss.

After three false fails, Eng Manager stopped PillTap preflight work. Keep terminate-until-noop and epoch-filtered `log show` (those are module-wait fixes, not destination preflight). Motion job is serial after stills. PillTap is serial `xcodebuild test`. Do not restore `wait_for_xcode_destination`.

Two-green-on-final-head is no longer the gate for this change. Rerun is owned by Eng Manager (agent `gh` is read-only).

### D5. Preview flag stays in the command environment

QUALITY-016 wrote `.env` and `ios/.xcode.env.local` because the Xcode bundle phase sources those files. Sourcing `.xcode.env` does not unset an already-exported `EXPO_PUBLIC_PARITY_PREVIEW`. The build step exports it on the `xcodebuild` / `expo prebuild` commands. The existing `main.jsbundle` greps remain: the string `EXPO_PUBLIC_PARITY_PREVIEW` must be gone (inlined) and `[parity] preview-chat route` must be present. Capture does not need the env; the flag is already in the bundle.

The ubuntu `Export parity preview for web` step already uses step `env:` only. Leave it.

### D6. Build does not boot the simulator

`xcodebuild build` uses `-destination 'generic/platform=iOS Simulator'`. Boot + framebuffer hint + `ConnectHardwareKeyboard=false` live in `ios-boot-simulator.sh`, used only by capture shards.

## Rollout plan

1. Land this spec (`TECH.md`, `TEST.md`) and the README row (QUALITY-023; 021 is #344, 022 is #343).
2. Add `parityPaintedLine` + transcript content-size hook; lock it in Bun tests.
3. Shard `ios-capture.sh`, pty log stream, painted wait, PillTap action switch, `RECORD_SECONDS=4`.
4. Split the workflow: `ios-build` artifact, stills job parallel after build, motion job serial after stills, ubuntu merge artifact `ios-parity`. Do not prebuild PillTap.
5. Keep `structural` on every matching PR. Do not add `ios-parity`.

## Risks & tradeoffs

- **Risk**: painted at 8s is still early on a loaded runner. Mitigation: png-flat retries (unchanged) still reject a 95%+ flat background; distinct-hash gate still requires 26 different PNGs.
- **Risk**: serial motion after stills lengthens job wall vs stills ∥ motion. Accepted: destination preflight false-failed three times; overlapping motion is not worth another PillTap patch.
- **Risk**: cold `xcodebuild test` on the first PillTap is 7–9 min again. Accepted: Eng Manager stopped prebuild / preflight.
- **Risk**: #343 edits the same workflow (CocoaPods / DerivedData cache). Merge conflict is expected; this branch is based on `origin/main` (QUALITY-020 E2E artifact). Do not rebase onto #343.
- **Tradeoff**: still mux movies stay (4s, not 8s) so `F4.mov` / `F12.mov` / `F13.mov` remain in the artifact. Live recordings already cover motion.
- **If this breaks**: revert the workflow to a single job calling `PARITY_SHARD=all`. The script default is still `all`.
- **Rollback path**: revert this PR. QUALITY-010 label gate and QUALITY-016 PillTap miss contract are unchanged.

## Dependencies & compatibility

- Depends on: QUALITY-010 (label gate), QUALITY-016 (capture hooks, PillTap miss), APP-081 (fixtures).
- Does not depend on #343 landing.
- `ios-simulator` / `ios-simulator-motion` are still opt-in. A draft without the label must skip `ios-build`, `ios-simulator`, `ios-simulator-motion`, and `ios-parity`.

## Open questions

None. Painted timeout (8s) and `RECORD_SECONDS=4` are the decided numbers; tune only with a labeled run.
