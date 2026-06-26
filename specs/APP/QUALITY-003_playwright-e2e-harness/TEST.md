# QUALITY-003: Playwright E2E Harness Test Plan

## Test Strategy

- Typecheck the harness so config and fixtures compile.
- Run the smoke suite to prove Playwright can boot the web app, load a stable route, assert UI, and collect browser errors.
- Keep Agent Browser out of this acceptance gate; it remains exploratory and spec-driven.

## Coverage Map

| Scenario | Requirement |
|----------|-------------|
| S1 | `e2e` workspace is installable and typechecks. |
| S2 | Playwright can start or reuse the web app. |
| S3 | Smoke test reaches `/en/setup` and validates setup controls on Chromium. |
| S4 | Specs guidance points future E2E scenarios to the harness and commands. |

## Execution Map

| Scenario | Level | Tool | Command | Signals | Status |
|----------|-------|------|---------|---------|--------|
| S1 | Harness | TypeScript | `bun run --cwd e2e lint` | `tsc --noEmit` exits 0 | passed |
| S2 | Harness | Playwright | `just test-e2e-smoke` | web server starts/reuses successfully | passed |
| S3 | E2E smoke | Playwright | `just test-e2e-smoke` | `/en/setup` renders tabs/buttons without page or console errors | passed |
| S4 | Docs | Review | inspect `specs/AGENTS.md`, `e2e/README.md`, `e2e/AGENTS.md` | future agents know placement and commands | passed |

## Scenarios

### S1: Harness Typecheck

Given the `e2e` workspace exists, when `bun run --cwd e2e lint` runs, then Playwright config, fixtures, and tests compile under TypeScript strict mode.

Signals:

- No TypeScript errors.
- `@playwright/test` and Node types resolve from the `e2e` package.

### S2: Web Server Startup

Given no `E2E_BASE_URL` is set, when `just test-e2e-smoke` runs, then Playwright starts `apps/web` on the dedicated `E2E_WEB_PORT` and waits for the base URL.

Signals:

- Playwright web server reaches the configured URL.
- `NEXT_PUBLIC_API_PORT` receives `E2E_API_PORT`.

### S3: Setup Route Smoke

Given the web app is available, when the smoke test opens `/en/setup`, then the setup onboarding controls render and the Local Server tab can be selected.

Signals:

- Setup explanatory copy is visible.
- `Local Server` and `Remote Computer` tabs are visible.
- `Generate Key` button is visible on the default remote tab.
- `Check again` button is visible after selecting Local Server.
- No unexpected browser console errors or page errors are collected.

### S4: Agent Guidance

Given a future spec needs E2E coverage, when an agent reads specs and e2e docs, then it can place tests under `e2e/tests/specs/` and reference `just test-e2e*` in `TEST.md`.

Signals:

- `specs/AGENTS.md` references `../e2e/`.
- `e2e/AGENTS.md` documents placement and selector rules.
- `e2e/README.md` documents commands and environment variables.

## Acceptance Criteria

- `e2e` is registered as a root Bun workspace.
- `just test-e2e-smoke`, `just test-e2e`, `just test-e2e-headed`, `just install-e2e-browsers`, and `just e2e-report` exist.
- Playwright report and result artifacts are ignored by git.
- At least one smoke test exists and passes locally.

## Coverage Status

Verified 2026-06-26:

- `bun run --cwd e2e lint` — passed.
- `just test-e2e-smoke` — passed, 1 Chromium smoke test.
- `just test-e2e` — passed, 2 tests across `chromium` and `mobile-chromium`.
- `git diff --check` — passed.

Notes:

- `just test-e2e-smoke` initially exposed missing Playwright browsers, a dev-port collision, Next HMR host mismatch, cold-cache navigation timeout, and local API probe console errors. The harness now uses `localhost:3330`, disables implicit server reuse, increases cold-cache navigation tolerance, and stubs local API probes for no-backend setup smoke.
