# TECH · QUALITY-023: iOS parity capture speed

> Technical Design · HOW. Speed up the label-gated `ios-simulator` capture path without shrinking APP-081 / QUALITY-016 coverage. Not a product feature. No BRAINSTORM or PRD (quality spec).

## Scope summary

The `Install, launch, and capture` step (`scripts/agent-chat-parity/ios-capture.sh`) is the long pole of `CI - Mobile iOS parity` / `ios-simulator`. This spec keeps every fixture, every assertion, and the PillTap non-zero miss contract. It changes **how** those passes run: shard them, wait on logs instead of fixed sleeps, prebuild PillTap, and stop writing the preview flag into files.

Out of scope: CocoaPods / DerivedData caching (open #343, QUALITY-022 on that branch), raising `oxlint --max-warnings` above 455, `EVIDENCE_PUSH`, committing screenshots or recordings, adding the `ios-parity` label, and weakening PillTap (`A miss does not fail the job` stays gone).

## Quality target

Baseline is GitHub Actions run `39530230224` on `macos-26` / Xcode 26.5 / iPhone 17 Pro / iOS 26.5.

| Item                                | Attempt 1                                         | Attempt 2                       | After                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job wall                            | 1h15m56s (01:57:03–03:12:59Z)                     | 1h51m51s (03:13:36–05:05:27Z)   | Build then two capture shards. Wall ≈ `ios-build` + max(stills, motion). Target ≤ **55 min** on a cold capture, ≤ **50 min** when `ios-build` stays ~30 min |
| Capture step                        | **39m19s** (02:33:09–03:12:28Z)                   | **52m24s** (04:12:22–05:04:46Z) | No single 40–50 min step. Stills target ≤ **12 min**. Motion target ≤ **18 min** including boot                                                             |
| 26 fixture stills                   | ~18 min (02:34:29–02:52:19Z)                      | ~23 min (04:13:23–04:36:27Z)    | ≤ **10 min**. Drop the 15s post-ready sleep; wait `[parity] painted`; do not block on `log show --last 10m`                                                 |
| First PillTap (`testTapScrollPill`) | 6m51s (02:53:25–03:00:16Z)                        | 9m03s (04:38:38–04:47:41Z)      | `build-for-testing` after boot, same UDID. Capture uses `test-without-building`. Target ≤ **90s** for that tap                                              |
| `RECORD_SECONDS` still mux          | 8s movies from one PNG                            | same                            | 4s (duration gate remains ≥ 3s). Live `recordVideo` still runs for the motion passes that need it                                                           |
| `EXPO_PUBLIC_PARITY_PREVIEW=1`      | Job `env:` plus `.env` and `ios/.xcode.env.local` | same on that branch             | Command / step `env:` only. No preview-flag files                                                                                                           |
| Trigger                             | `workflow_dispatch` or PR label `ios-parity`      | same                            | Unchanged                                                                                                                                                   |

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

| Change                                                              | Attempt 1 save                             | Attempt 2 save  | Evidence                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Line-buffered `log stream` + delay `log show`                       | ~3–5 min                                   | ~6–8 min        | Attempt 2 F1: JS ready at 04:13:35Z, `log show` returned 04:14:02Z. Most frames then wait 15–30s in `log show --last 10m` (bounded 45s) instead of the stream file |
| Replace `sleep 15` with `[parity] painted`                          | ~5–6 min                                   | ~5–6 min        | 26 × 15s = 6.5 min guaranteed. Run 38877961991 was too early at 6s; painted waits until transcript content height is stable, with an 8s fallback                   |
| PillTap `build-for-testing` after boot                              | ~5–6 min                                   | ~7–8 min        | First `xcodebuild test` compiles host + XCTest. Overlapping that compile with boot raced CoreSimulator (run 39578448510). Serialize.                               |
| Matrix `stills` ∥ `motion`                                          | ~18 min of stills overlap the motion shard | ~23 min overlap | Two `macos-26` jobs after one `ios-build`. Wall is max(shard), not sum                                                                                             |
| `RECORD_SECONDS` 8 → 4; skip live record when the pass is still mux | ~0–1 min                                   | ~0–1 min        | Mux is CPU. Live `recordVideo` stays on F4 replay, F12 pills, F12/F13 card rows, composer keyboard                                                                 |
| Build without booting the simulator                                 | 0 capture / ~4 min job                     | same            | Attempt 1 boot was 3m38s before prebuild. Capture shards boot in parallel with each other, not in front of `xcodebuild`                                            |

Sum is not additive with the matrix (stills time is hidden behind motion). Combined capture wall target: **≤ 18 min** vs 39–52 min. Job wall target: **≤ 55 min** vs 1h16m–1h52m, dominated by `ios-build`.

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
| motion boot + PillTap prebuild | 08:58:22–09:03:13Z | ~5m        |                                                   |
| `ios-parity` merge             | 09:33:59–09:34:11Z | 12s        | success                                           |

Earlier labeled attempts on this PR: `39554572933` stills capture 14m42s green / motion SpringBoard Busy; `39561423684` motion capture 32m53s green / stills F4 home-screen (old painted line). Both are fixed on this head.

### Measured savings vs run `39530230224`

| Item              | Attempt 1 | Attempt 2 | Measured (`39570872781`) | Saved vs att. 1          | Saved vs att. 2 | Why it moved                                                                                                  |
| ----------------- | --------- | --------- | ------------------------ | ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| Workflow wall     | 1h15m56s  | 1h51m51s  | **55m10s**               | **~21 min**              | **~57 min**     | `ios-build` 17m then max(stills 20m, motion 37m). Stills no longer serial behind PillTap                      |
| Capture wall      | 39m19s    | 52m24s    | **30m08s** (motion)      | **~9 min**               | **~22 min**     | Matrix hides stills. Motion is now the capture wall                                                           |
| 26 fixture stills | ~18 min   | ~23 min   | **11m55s**               | **~6 min**               | **~11 min**     | No `sleep 15`; pty `log stream`; `[parity] painted`. Overlapped, so this does not add to workflow wall        |
| First PillTap     | 6m51s     | 9m03s     | after boot, same UDID    | compile off the tap path | same            | `build-for-testing` after boot; capture is `test-without-building`. Remainder is xctrunner + live recordVideo |

`RECORD_SECONDS` 8→4 is a small mux save (~0–1 min). Preview flag / label gate / evidence policy are correctness, not time.

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

ios-simulator [stills | motion]  (macos-26, needs ios-build)
  download app, boot iPhone 17 Pro, export PARITY_UDID
  motion: xcodebuild build-for-testing PillTap for that UDID (after boot, not overlapping)
  PARITY_SHARD=… PILL_TAP_ACTION=test-without-building ios-capture.sh
  artifact ios-parity-<shard>

ios-parity (ubuntu, needs ios-simulator)
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

`PARITY_SHARD=all|stills|motion` (default `all` for a laptop). CI sets the matrix value.

- `stills`: springboard check, F1–F13 × light/dark (26 PNGs), distinctness, default-route / F1≠F12 hashes, still mux of F4/F12/F13.
- `motion`: springboard check, f13-tail away + return, stream-tools, F4 replay, F12 lane, F12 pill taps, F12/F13 card-row light+dark, composer states + keyboard.

Both shards install the same Release `.app`. Neither drops a fixture or a PillTap pass. A PillTap miss still prints `PillTap missed:` and exits 1. Replay / lane / composer stills still do not fail the job.

### D2. Wait for paint, not `sleep 15`

`parityReadyLine` fires when the preview claims the frame. Markdown / mermaid can still be missing (run 38877961991, ~6s). The preview logs `parityPaintedLine` once content height has been stable for 600ms, or at 8s after ready, whichever first. `ios-capture.sh` waits for that line (25s cap) then screenshots. The png-flat retry loop stays as a backstop. There is no fixed 15s sleep on the fixture path.

### D3. Do not block the wait loop on `log show`

Run 39530230224 attempt 2 shows JS `[parity] ready` in `os_log` a few seconds after launch, while the script sits in `run_bounded 45 log show --last 10m`. Redirected `log stream` is block-buffered. Capture starts the stream on a pty and copies lines with flush. `log show` is a fallback after 12s, `--last 30s`, 8s bound.

### D4. PillTap is compiled once, after the simulator is Booted

Motion shard: boot iPhone 17 Pro first, pin `PARITY_UDID`, then `xcodebuild build-for-testing` of `scripts/agent-chat-parity/pill-tap/PillTap.xcodeproj` with `-destination platform=iOS Simulator,id=$PARITY_UDID`. Capture calls `xcodebuild test-without-building` with the same id and `-derivedDataPath`. Do not overlap build-for-testing with `killall CoreSimulatorService` / `simctl boot`. Do not `simctl install` the xctrunner before the first test (that double-install raced SpringBoard). Local default remains `test` so a laptop without a prior build still works.

A destination that xcodebuild cannot see is `PillTap destination missing:` and still exits 1. An XCTAssert miss is still `PillTap missed:` and still exits 1. Busy (`installing or uninstalling`) is the only targeted retry.

### D7. Motion waits are per-launch

`capture_tail_return` (and the other motion relaunches) use `wait_for_since` after a `log_mark`, same as stills. `wait_for_line` matching the away launch's `[parity] preview-chat module` would let the return pass proceed before this launch painted.

## Motion / PillTap instability (root cause)

Two of the last three labeled motion shards failed, at different surfaces of the same race:

| Run           | Head        | Motion        | What the log actually said                                                                                                                                                                                   |
| ------------- | ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `39554572933` | `5d38f5c97` | fail          | SpringBoard Busy while xctrunner installing/uninstalling (`testSwipeCardPills`)                                                                                                                              |
| `39561423684` | `11a2f44b0` | pass (32m53s) | stills failed on a stale painted line; motion itself green                                                                                                                                                   |
| `39570872781` | `ae64d00da` | pass (30m08s) | both shards green                                                                                                                                                                                            |
| `39578448510` | `a8edae21c` | fail          | `testTapScrollPill` reported `PillTap missed: scroll pill tap failed`; xcodebuild then `Unable to find a device matching … id:E839A11B-…`. Available destinations: My Mac + two placeholders. No simulators. |

Not a cross-shard resource fight: stills and motion are separate `macos-26` VMs. `simctl` still took screenshots of `E839A11B` at 10:17Z. xcodebuild, started for `test-without-building` after a generic `build-for-testing` that overlapped boot, saw zero devices.

Sequence on the failing motion job (`39578448510`):

1. `ios-boot-simulator.sh setup` kills `CoreSimulatorService` (framebuffer hint).
2. `build-for-testing -destination generic/platform=iOS Simulator` starts immediately. Boot is not done until 10:13:18Z; the generic build is already ~4 minutes in with no Booted device. The runner image listed three Shutdown `iPhone 17 Pro` devices.
3. Capture `simctl install`s the prebuilt xctrunner, then `test-without-building` installs it again → Busy on an earlier run.
4. Return launch used `wait_for_line` for `[parity] preview-chat module` (already in the stream from the away launch). The 18s to tap is therefore not proof the return frame was the one xcodebuild attached to.
5. `test-without-building -destination id=E839A11B` resolves destinations from the generic build's empty list and fails. The script labeled that a PillTap miss.

Fix: boot → pin UDID → `build-for-testing` for that id → `test-without-building` for that id. Wait until `xcodebuild -showdestinations` lists the UDID before the first tap. No xctrunner pre-install. Motion relaunches wait `wait_for_since`. Do not retry XCTAssert misses or destination loss; only Busy.

Two consecutive full iOS greens on the head that contains this paragraph are the gate. Fill the table when those runs finish (a later docs-only push would change the head, so record them on the same commit when possible; otherwise re-run both on the docs head).

| Round | Run                  | ios-build | stills | motion | ios-parity | workflow |
| ----- | -------------------- | --------- | ------ | ------ | ---------- | -------- |
| 1     | TBD                  | TBD       | TBD    | TBD    | TBD        | TBD      |
| 2     | TBD (`gh run rerun`) | TBD       | TBD    | TBD    | TBD        | TBD      |

### D5. Preview flag stays in the command environment

QUALITY-016 wrote `.env` and `ios/.xcode.env.local` because the Xcode bundle phase sources those files. Sourcing `.xcode.env` does not unset an already-exported `EXPO_PUBLIC_PARITY_PREVIEW`. The build step exports it on the `xcodebuild` / `expo prebuild` commands. The existing `main.jsbundle` greps remain: the string `EXPO_PUBLIC_PARITY_PREVIEW` must be gone (inlined) and `[parity] preview-chat route` must be present. Capture does not need the env; the flag is already in the bundle.

The ubuntu `Export parity preview for web` step already uses step `env:` only. Leave it.

### D6. Build does not boot the simulator

`xcodebuild build` uses `-destination 'generic/platform=iOS Simulator'`. Boot + framebuffer hint + `ConnectHardwareKeyboard=false` live in `ios-boot-simulator.sh`, used only by capture shards.

## Rollout plan

1. Land this spec (`TECH.md`, `TEST.md`) and the README row (QUALITY-023; 021 is #344, 022 is #343).
2. Add `parityPaintedLine` + transcript content-size hook; lock it in Bun tests.
3. Shard `ios-capture.sh`, pty log stream, painted wait, PillTap action switch, `RECORD_SECONDS=4`.
4. Split the workflow: `ios-build` artifact, `ios-simulator` matrix, ubuntu merge artifact `ios-parity`.
5. Keep `structural` on every matching PR. Do not add `ios-parity`.

## Risks & tradeoffs

- **Risk**: painted at 8s is still early on a loaded runner. Mitigation: png-flat retries (unchanged) still reject a 95%+ flat background; distinct-hash gate still requires 26 different PNGs.
- **Risk**: `test-without-building` destination mismatch. Mitigation: motion shard boots first, then `build-for-testing` and `test-without-building` both use `id=$PARITY_UDID`. Destination loss exits 1 as `PillTap destination missing:`, not as a tap miss.
- **Risk**: two macos capture jobs cost extra minutes. Mitigation: they skip `xcodebuild` of Atmos.app. Billable time should drop because stills no longer sit behind a 7–9 min cold PillTap on the same runner.
- **Risk**: #343 edits the same workflow (CocoaPods / DerivedData cache). Merge conflict is expected; this branch is based on `origin/main` (QUALITY-020 E2E artifact). Do not rebase onto #343.
- **Tradeoff**: still mux movies stay (4s, not 8s) so `F4.mov` / `F12.mov` / `F13.mov` remain in the artifact. Live recordings already cover motion.
- **If this breaks**: revert the workflow to a single job calling `PARITY_SHARD=all`. The script default is still `all`.
- **Rollback path**: revert this PR. QUALITY-010 label gate and QUALITY-016 PillTap miss contract are unchanged.

## Dependencies & compatibility

- Depends on: QUALITY-010 (label gate), QUALITY-016 (capture hooks, PillTap miss), APP-081 (fixtures).
- Does not depend on #343 landing.
- `ios-simulator` is still opt-in. A draft without the label must skip `ios-build`, `ios-simulator`, and `ios-parity`.

## Open questions

None. Painted timeout (8s) and `RECORD_SECONDS=4` are the decided numbers; tune only with a labeled run.
