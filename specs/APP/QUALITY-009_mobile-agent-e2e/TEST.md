# QUALITY-009 TEST: Mobile Agent E2E

## Test strategy

Mostly operational checks of the harness itself, run on a Mac with a booted iOS Simulator. Nothing here runs in CI. Product behavior is covered by the tests in `apps/mobile/e2e/tests/`.

## Execution map

| Id  | Scenario                                                        | Command                                                                                                       | Signals                                                                                                                                      | Status              |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| S1  | Device pinning picks one Simulator even when several are booted | `node apps/mobile/e2e/scripts/resolve-device.mjs`; with `ATMOS_E2E_DEVICE=<name>`; with a bad name            | UDID printed; unique name resolves; bad name exits 1 with a hint                                                                             | see Coverage Status |
| S2  | Doctor is read-only and passes                                  | `just mobile-e2e-doctor`                                                                                      | `Doctor: pass`; device claims listed; `e2e list` loads the config                                                                            | see Coverage Status |
| S3  | Release simulator build                                         | `ATMOS_E2E_NO_INSTALL=1 just mobile-e2e-build`                                                                | `Atmos.app` under `DerivedData-Sim-Release`; Debug RN core restored                                                                          | see Coverage Status |
| S4  | Smoke on the pinned Simulator                                   | `just mobile-e2e-install && just mobile-e2e-smoke`                                                            | `unpaired launch shows the pair screen` passes, exit 0                                                                                       | see Coverage Status |
| S5  | Evidence stages locally                                         | `just mobile-e2e-evidence <pr> "note"`                                                                        | no push by default; only `EVIDENCE_PUSH=1` pushes. Local folder `pr-<N>/<sha>/` still has `screen.png`, `a11y.txt`, `meta.json`, `README.md` | see Coverage Status |
| S6  | CI isolation                                                    | `git diff --stat main -- .github e2e`                                                                         | no workflow or `/e2e` change; `ci-e2e.yml` paths exclude `apps/mobile/**`                                                                    | see Coverage Status |
| S7  | Lint and format                                                 | `bunx oxlint apps/mobile/e2e && bunx oxfmt --check apps/mobile/e2e`; `bun run typecheck` in `apps/mobile/e2e` | clean                                                                                                                                        | see Coverage Status |

## Acceptance criteria

- Every `just mobile-e2e-*` command works from the repo root on a Mac with Xcode.
- No command boots, erases, creates or shuts down a Simulator.
- Evidence is retrievable by a different checkout through `git fetch origin agent-artifacts` only after an explicit push. No push by default; only `EVIDENCE_PUSH=1` pushes.
- `just test-e2e-smoke` (Playwright) is unaffected.

## Manual verification steps

1. `just mobile-e2e-install-deps && just mobile-e2e-doctor`.
2. `just mobile-e2e-build`, then `just mobile-e2e-smoke`.
3. `just mobile-e2e-evidence <pr> "check"` stages locally. No push by default; only `EVIDENCE_PUSH=1` pushes. After that explicit push, another clone can `git fetch origin agent-artifacts && git show origin/agent-artifacts:pr-<N>/<sha>/README.md`.

## Non-coverage

- Paired (signed-in) flows: need a hand-paired install (`ATMOS_E2E_PAIRED=1`).
- `agent.act` steps: need a model key.
- Android target: configured but not exercised here.
- Pixel-parity with web: tracked by APP-081.

## Coverage Status

First run on the Air (MacBook Air, Xcode 27.0, iPhone 17 Pro iOS 26.5, e2e 0.21.2, agent-device 0.21.25), first on main `b236ad0c1`, re-verified on main `6a7fd70e1` (clean build 10m04s including `bun install` and prebuild):

- S1 pass: default resolves the iPhone 17 Pro UDID with an iPhone 18 Pro (iOS 27.0) also booted; a unique name resolves; an unknown name exits 1 with a hint.
- S2 pass: `Doctor: pass`, no device claims, `e2e list` loads 8 test x target pairs.
- S3 pass: clean `ATMOS_E2E_NO_INSTALL=1 just mobile-e2e-build` took 10m18s (Expo prebuild and `bun install` ran separately before it, about 4 min); an incremental rebuild took 38s. The Debug RN core is restored afterwards.
- S4: on main before #316, the smoke test failed with a black window (`app.json` named the missing `Atmos.SceneDelegate`). After #316 (`6a7fd70e1`, includes the fix), a clean `rm -rf apps/mobile/ios` + `just mobile-e2e-build` + `ATMOS_E2E_PAIRED=1 just mobile-e2e-smoke` passes in about 3s (cold engine prepare 4s); no black screen. The generated `Info.plist` has no scene manifest. The Simulator's install was already paired, so the unpaired test skipped itself and was not exercised.
- S5 historical pass on that run pushed to `agent-artifacts:pr-315/<sha>/`. Current contract: no push by default; only `EVIDENCE_PUSH=1` pushes.
- S6 pass: no change under `.github/` or `/e2e`.
- S7 pass: oxlint, oxfmt and `tsc --noEmit` clean for `apps/mobile/e2e`.
