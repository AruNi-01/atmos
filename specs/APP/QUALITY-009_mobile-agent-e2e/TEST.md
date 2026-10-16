# QUALITY-009 TEST: Mobile Agent E2E

## Test strategy

Mostly operational checks of the harness itself, run on a Mac with a booted iOS Simulator. Nothing here runs in CI. Product behavior is covered by the tests in `apps/mobile/e2e/tests/`.

## Execution map

| Id | Scenario | Command | Signals | Status |
| --- | --- | --- | --- | --- |
| S1 | Device pinning picks one Simulator even when several are booted | `node apps/mobile/e2e/scripts/resolve-device.mjs`; with `ATMOS_E2E_DEVICE=<name>`; with a bad name | UDID printed; unique name resolves; bad name exits 1 with a hint | see Coverage Status |
| S2 | Doctor is read-only and passes | `just mobile-e2e-doctor` | `Doctor: pass`; device claims listed; `e2e list` loads the config | see Coverage Status |
| S3 | Release simulator build | `ATMOS_E2E_NO_INSTALL=1 just mobile-e2e-build` | `Atmos.app` under `DerivedData-Sim-Release`; Debug RN core restored | see Coverage Status |
| S4 | Smoke on the pinned Simulator | `just mobile-e2e-install && just mobile-e2e-smoke` | `unpaired launch shows the pair screen` passes, exit 0 | see Coverage Status |
| S5 | Evidence publishes to `agent-artifacts` | `just mobile-e2e-evidence <pr> "note"` | folder `pr-<N>/<sha>/` with `screen.png`, `a11y.txt`, `meta.json`, `README.md` | see Coverage Status |
| S6 | CI isolation | `git diff --stat main -- .github e2e` | no workflow or `/e2e` change; `ci-e2e.yml` paths exclude `apps/mobile/**` | see Coverage Status |
| S7 | Lint and format | `bunx oxlint apps/mobile/e2e && bunx oxfmt --check apps/mobile/e2e`; `bun run typecheck` in `apps/mobile/e2e` | clean | see Coverage Status |

## Acceptance criteria

- Every `just mobile-e2e-*` command works from the repo root on a Mac with Xcode.
- No command boots, erases, creates or shuts down a Simulator.
- Evidence is retrievable by a different checkout through `git fetch origin agent-artifacts`.
- `just test-e2e-smoke` (Playwright) is unaffected.

## Manual verification steps

1. `just mobile-e2e-install-deps && just mobile-e2e-doctor`.
2. `just mobile-e2e-build`, then `just mobile-e2e-smoke`.
3. `just mobile-e2e-evidence <pr> "check"`, then from another clone: `git fetch origin agent-artifacts && git show origin/agent-artifacts:pr-<N>/<sha>/README.md`.

## Non-coverage

- Paired (signed-in) flows: need a hand-paired install (`ATMOS_E2E_PAIRED=1`).
- `agent.act` steps: need a model key.
- Android target: configured but not exercised here.
- Pixel-parity with web: tracked by APP-081.

## Coverage Status

_To be filled after the first run on the Air._
