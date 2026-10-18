---
name: verify-atmos-mobile
description: Verify the Atmos Expo mobile app (apps/mobile, iOS/Android, bundle id land.atmos.mobile) on a simulator with the e2e mobile engine. Use after changing mobile UI to prove pairing, the workspace list, agent chat, or the terminal behave the way a user sees them, or to bug bash a mobile feature.
---

# Verify Atmos mobile

## Read first

The e2e skill (`.agents/skills/e2e/SKILL.md`, or `npx e2e guide <topic>`) is the reference. This skill drives `apps/mobile/e2e/e2e.config.ts`, tests glob `apps/mobile/e2e/tests/**/*.e2e.ts`. `just mobile-e2e-*` recipes wrap everything below; npx commands run from `apps/mobile/e2e/` (its own Bun package, not a bun workspace; web Playwright lives in the root `e2e/` and is unrelated).

## Launch

The config has no `app.command`: the engine opens the app already installed on the booted simulator/emulator under `land.atmos.mobile`.

1. Node.js >= 22.22 (e2e needs `module.registerHooks`). macOS + Xcode + a booted iOS Simulator (deploymentTarget 16.4) for `ios`; an Android emulator for `android`. agent-device comes with `@e2e-dev/mobile`.
2. Build and install the app once: `cd apps/mobile && bun install && bun run ios` (or `bun run android`). The app uses native modules and expo-dev-client, so Expo Go is not enough. A dev build needs Metro running (`bun run start`); a Release build does not.
3. `just mobile-e2e-install-deps` (bun). `just mobile-e2e-build` builds a Release app for the pinned Simulator and installs it (`ATMOS_E2E_NO_INSTALL=1` to only build). `just mobile-e2e-doctor` checks the setup read-only. The Simulator is pinned by UDID (`ATMOS_E2E_DEVICE`, default iPhone 17 Pro iOS 26.5), so several booted Simulators do not cause `AMBIGUOUS_MATCH`.

Readiness: the app shows either the pair screen ("Pair this phone with your Computer.") or the workspace list.

Signed-in tests need a paired install: pair once by hand (Desktop/Web → Settings → Atmos Computer → Show QR, then "Scan QR" in the app; on Simulator use "Continue with GitHub"), keep the Computer online, then export:

- `ATMOS_E2E_PAIRED=1`
- `ATMOS_E2E_WORKSPACE_ID=<workspace guid>` and `ATMOS_E2E_WORKSPACE_TITLE=<its title in the list>`

Without them those tests are skipped, not failed.

## Doctor

1. `npx e2e list` loads the config and lists test×target pairs without starting anything.
2. `npx e2e run --target ios tests/smoke.e2e.ts` on an **unpaired** install: exit 0 means the app launches, the engine drives it, and the pair screen renders. On a paired install the smoke test skips itself; run `tests/workspace.e2e.ts` as the doctor instead.

## Drive

- Live over MCP: `npx e2e mcp` (topic `mcp`); `open_session` with target `ios`, `observe`, then `locate` before writing any locator.
- Scripted: tests under `apps/mobile/e2e/tests/`. Prefer, in order: accessibility labels (`getByLabel('New terminal')`, `getByLabel('Send')`), placeholders (`getByPlaceholder('Send a message to create a session')`), visible text, existing testIDs (`terminal-frame-<sessionId>`, `terminal-group-drawer`). Navigate with expo-router deep links via `device.openLink('atmos://workspace/<id>/chat/new')` instead of tapping through tabs. Use `agent.act` only where the flow varies; pair each with a deterministic `expect`.
- Credentials: none in the repo. The paired device credential lives in the app's secure store on the simulator.

## Evidence

Every run writes `apps/mobile/e2e/.e2e/report.json`; a failed test gets `.e2e/results/<test>/trace.md`; `--trace on` traces passing tests, `--video` records (topic `running`). The next run clears `.e2e/results/`, so keep a proof with `--output .e2e/proof/<name>`.

Proof standards: drive the real user path (pair screen, list tap, composer, header button), not store setters. For agent chat, also confirm the session appears on the Computer (Desktop/Web chat list) — the side effect lives there. For the terminal, the new tab shows in the terminal group drawer and on Desktop. Do not mock the relay.

## Bug bash

Topic `bug-bash`. Charters come from `features/*.md`. Bug-bash config: copy `e2e.config.ts` to `e2e.bugbash.config.ts` (untracked) keeping `workers: 1` — there is one simulator and one paired app, never drive it from two runs at once. Add `.e2e/bugbash/` output under the already-ignored `.e2e/`. A finding is a bug only once `tests/bugbash/<slug>.e2e.ts` fails with `ASSERTION_FAILED`.

Share proof with a cloud agent: `just mobile-e2e-evidence <pr> "<note>"` pushes screenshot, a11y tree and report to branch `agent-artifacts` at `pr-<N>/<sha>/`. Hand the branch over with a `HANDOFF:` PR comment. Rules: `specs/APP/QUALITY-009_mobile-agent-e2e/TECH.md`.

## Cleanup

The runner leaves the simulator booted and the app installed; that is the user's. Delete chats/terminals the run created on the Computer if they matter. Never kill Simulator or Metro by process name. Evidence stays in `apps/mobile/e2e/.e2e/`.

## Helpers

None; the e2e CLI is the helper.
