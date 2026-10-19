# QUALITY-009: Mobile Agent E2E (local iOS Simulator)

## Quality Target

Let an agent (a Cursor cloud agent, or an agent on a Mac) prove mobile UI changes by driving a real iOS Simulator, and hand the evidence back through git. This is a **local, headed, agent-facing** harness. It coexists with the **headless CI Playwright** harness from [QUALITY-003](../QUALITY-003_playwright-e2e-harness/TECH.md) and never replaces or runs in it.

## Current Gap

- CI-hosted iOS simulator runs were slow and could hang in `simctl` screenshots (APP-081 parity work). Agents had no repeatable way to verify on a real Simulator.
- `feat/mobile-e2e-testerarmy` already scaffolded `apps/mobile/e2e/` and the `e2e` / `verify-atmos-mobile` skills, but had no commands, no device pinning, no evidence path, and no handoff protocol.

## Stack (verified)

- [`e2e`](https://github.com/tester-army/e2e) (TesterArmy, Apache-2.0): runner, locators, optional `agent.act` steps.
- `@e2e-dev/mobile`: the mobile engine. It is built on [`agent-device`](https://github.com/callstack/agent-device) (hard dependency, pinned `0.21.25`). agent-device drives the Simulator through `simctl` plus an XCUITest runner, and exposes `snapshot -i` (a11y tree), `click/fill/swipe`, `screenshot`, `record`, `diff screenshot`.
- Versions are pinned in `apps/mobile/e2e/package.json` (`@e2e-dev/mobile` and `agent-device` exact, `e2e` caret). e2e is pre-1.0; bump deliberately.
- Tests that do not call `agent` need no model or API key. The first phase uses only deterministic tests plus agent-device CLI. `agent.act` is opt-in and needs a model key (`AI_GATEWAY_API_KEY`) or `npx e2e login`.

## Coexistence With CI Playwright E2E

|               | CI Playwright (`/e2e`, QUALITY-003)   | Mobile agent e2e (`apps/mobile/e2e`)                                               |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Runs in       | GitHub Actions `ci-e2e.yml`, headless | Developer or agent Mac only, headed Simulator                                      |
| Package       | Bun workspace `@atmos/e2e`            | Standalone Bun package (own `bun.lock`), not in root `workspaces`                  |
| Commands      | `just test-e2e*`, `just e2e-report`   | `just mobile-e2e-*`                                                                |
| Trigger paths | `e2e/**`, `apps/web/**`, ...          | None. `ci-e2e.yml` paths do not include `apps/mobile/**`                           |
| Output        | `e2e/playwright-report`               | `apps/mobile/e2e/.e2e/` (gitignored) and branch `agent-artifacts`                  |
| Telemetry     | n/a                                   | Off by default (`E2E_TELEMETRY_DISABLED=1`, set by `justfile` and `e2e.config.ts`) |
| Device        | Chromium                              | One Simulator pinned by UDID                                                       |

Rules: do not add this suite to CI; do not import across the two packages; keep env names distinct (`E2E_*` for Playwright, `ATMOS_E2E_*` for mobile).

## Commands (`justfile`)

| Command                                | What it does                                                                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just mobile-e2e-install-deps`         | `bun install --frozen-lockfile` in `apps/mobile/e2e`                                                                                                                                                                                   |
| `just mobile-e2e-doctor`               | Read-only: resolves the Simulator UDID, `agent-device doctor`, device claims, `e2e list`                                                                                                                                               |
| `just mobile-e2e-build`                | `mobile-ios-prepare`, Release core swap, `xcodebuild` Release for the pinned Simulator into `apps/mobile/ios/DerivedData-Sim-Release`, then `simctl install`. `ATMOS_E2E_NO_INSTALL=1` builds only. Restores the Debug RN core on exit |
| `just mobile-e2e-install`              | Installs the last build onto the pinned Simulator                                                                                                                                                                                      |
| `just mobile-e2e-smoke`                | `tests/smoke.e2e.ts` (unpaired launch shows the pair screen)                                                                                                                                                                           |
| `just mobile-e2e-run [file]`           | Whole suite, or one file                                                                                                                                                                                                               |
| `just mobile-e2e-evidence <pr> [note]` | Capture proof locally. Push only when `EVIDENCE_PUSH=1` (see below; QUALITY-010)                                                                                                                                                       |

### Device pinning

Several Simulators are usually booted and agent-device refuses to guess (`AMBIGUOUS_MATCH`). `scripts/resolve-device.mjs` prints one UDID:

1. `ATMOS_E2E_DEVICE` as a UDID is used as is; as a name it must match exactly one available iOS Simulator.
2. Otherwise `ATMOS_E2E_DEFAULT_NAME` (default `iPhone 17 Pro`) on `ATMOS_E2E_DEFAULT_RUNTIME` (default `26.5`). Pin the runtime: the a11y tree changes between iOS releases.

The resolver only reads `simctl list`. Nothing in this harness boots, creates, erases or shuts down a Simulator.

### Release build

Use a Release build: it carries its JS and needs no Metro. A Debug build opens the dev launcher. Config sets `app.bundleId = land.atmos.mobile`. `just mobile-ios-prepare` creates the gitignored `apps/mobile/ios` per worktree (one-time CocoaPods and RN core download).

## Evidence

`just mobile-e2e-evidence <pr> [note]` writes `apps/mobile/e2e/.e2e/evidence/pr-<N>/<sha>/`. It pushes that folder to the orphan branch `agent-artifacts` only when `EVIDENCE_PUSH=1` (QUALITY-010; previously the script pushed unless `EVIDENCE_NO_PUSH=1`):

```text
pr-<N>/<sha>/
├── README.md          index (branch, device, note, file list)
├── meta.json          pr, full sha, branch, device UDID, agent-device version, time, note (no hostname)
├── screen.png         simctl framebuffer screenshot, scaled (EVIDENCE_SCALE, default 0.4)
├── a11y.txt           agent-device snapshot -i
├── report.json        last `e2e run` report, if present
├── traces/*.md        failure traces from `.e2e/results`, if present
└── contact-sheet.png  only with EVIDENCE_RECORD_SECONDS>0 (keyframes of a screen recording)
```

- `EVIDENCE_LINK=atmos://<route>` opens a deep link before capturing; `EVIDENCE_WAIT_MS` sets the settle time (default 3000).
- The screenshot comes from `xcrun simctl io screenshot`, not `agent-device screenshot`: on iOS 26.5 the latter drew sheets black while the a11y tree was correct.
- **The remote is public.** Never push evidence of a paired app's real screens (workspace names, chat text, Computer URLs). The script does not push unless `EVIDENCE_PUSH=1`. Use that only with a neutral `EVIDENCE_LINK`. `meta.json` must not include a hostname.
- Videos stay local in `.e2e/evidence-video/`. Only text, scaled PNGs and the contact sheet are pushed.
- `<sha>` is the 9-char HEAD of the checkout that built the app. Re-running at the same sha overwrites that folder.
- The script publishes through a throwaway repo, so the working checkout is untouched. A push race is retried (fetch, re-copy, push); history is never force-pushed.
- Read from anywhere: `git fetch origin agent-artifacts && git show origin/agent-artifacts:pr-<N>/<sha>/README.md` (`git show` also works for `screen.png`; or `git worktree add /tmp/art origin/agent-artifacts`).
- PRs reference evidence in a comment as `agent-artifacts:pr-<N>/<sha>`. Do not commit screenshots or recordings to feature branches.
- The branch only grows. Prune old `pr-*` folders for merged PRs by hand (orphan branch, no review needed).

## Cloud Agent <-> Mac Git Handoff

Cloud agent (Linux, edits code, no Simulator) and the Mac agent (Air, has Simulator) alternate on the **same feature branch**.

1. **One writer at a time.** The writer is whoever the latest `HANDOFF` comment names as `to`. Default: the cloud agent.
2. **Finish a turn:** commit, `git pull --rebase`, `git push`, then post a PR comment whose first line is:

   ```text
   HANDOFF: <from>-><to> sha=<full-sha> state=<ready|blocked|done> evidence=agent-artifacts:pr-<N>/<sha> next=<one line>
   ```

   `from` and `to` are `cloud` or `air`. `state=blocked` needs a reason after `next=`.

3. **Start a turn:** `git fetch origin && git status -sb`, then `git pull --rebase --autostash`. HEAD must equal the handed-off `sha`; if not, stop and comment instead of working on stale code.
4. **Never force-push.** On a conflict, rebase and resolve; for `bun.lock` regenerate with `bun install` instead of merging by hand.
5. **Mac side uses a dedicated worktree** per PR (for example `~/atmos-verify-<N>`), never the owner's day-to-day checkout. Native output (`apps/mobile/ios`, `DerivedData-*`) is gitignored; nothing generated is committed.
6. **Native changes need a rebuild.** The cloud agent must say so in `next=` when it touched native code, plugins or `app.json`; JS-only changes also need `mobile-e2e-build` because the Release app embeds its JS.
7. **Simulator is exclusive.** Before using it: `just mobile-e2e-doctor` (shows claims), `pgrep -fl xcodebuild`, `pgrep -fl agent-device`. If busy, build only (`ATMOS_E2E_NO_INSTALL=1`) or pick another UDID via `ATMOS_E2E_DEVICE`; never kill, erase or shut down a Simulator you did not start.
8. **Evidence goes to `agent-artifacts`**, not the branch. The `HANDOFF` comment links it.

## Risks

- Xcode 27 and iOS 27 Simulators: runner compatibility is unverified. Default is iOS 26.5.
- First Simulator drive builds the XCUITest runner into `~/.agent-device/` (outside the repo).
- iOS a11y limits: a plain RN `View` has no children in the tree; `accessibilityRole="tab"` reads as `other`. Parity checks of chat cards need `testID`s. They are intentionally out of scope here and belong to the APP-081 alignment work.
- A Simulator keeps app data and the keychain across `simctl install`. An install that was paired earlier stays paired, so run `ATMOS_E2E_PAIRED=1` for it; the smoke file has a paired and an unpaired test.
- Signed-in flows need a manually paired install (`ATMOS_E2E_PAIRED=1`). Pairing cannot be automated.
- One Simulator, one run (`workers: 1`); two agents on one Mac must serialize.
- e2e is pre-1.0 and sends anonymous telemetry unless disabled.

## Follow-ups

- Add `testID`s to transcript/tool cards during the APP-081 parity alignment, then add parity tests.
- Optional `agent-device test` `.ad` replay scripts for pixel-diff baselines (`screenshot --normalize-status-bar`, `diff screenshot`).
- Scheduled prune of `agent-artifacts`.
