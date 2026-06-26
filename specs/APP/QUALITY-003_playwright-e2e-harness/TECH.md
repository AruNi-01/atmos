# QUALITY-003: Playwright E2E Harness

## Quality Target

Create a repository-level Playwright harness that lets spec implementations prove cross-layer web behavior without mixing E2E checks into Rust or Bun unit tests.

## Current Gap

- Atmos has Rust tests and Bun tests, but no committed Playwright harness.
- `TEST.md` files can now name E2E scenarios, but agents need a standard directory, command, fixture layer, and report location.
- Browser exploration through Agent Browser is useful for UX checks, but it is not a deterministic regression gate.

## Design

### Directory

```text
e2e/
├── AGENTS.md
├── README.md
├── package.json
├── playwright.config.ts
├── fixtures/
│   ├── app-server.ts
│   ├── console-errors.ts
│   └── test.ts
└── tests/
    ├── smoke/
    └── specs/
```

### Execution Model

- `e2e` is a separate Bun workspace package named `@atmos/e2e`.
- Playwright starts `apps/web` by default on the dedicated `E2E_WEB_PORT` with `NEXT_PUBLIC_API_PORT=$E2E_API_PORT`.
- `E2E_BASE_URL` points the harness at an already running app and disables automatic web startup.
- `E2E_START_WEB=0` disables web startup when another tool owns the server process.
- `E2E_REUSE_SERVER=1` explicitly allows reuse of an existing server on `E2E_WEB_PORT`; reuse is disabled by default so E2E does not silently test the wrong app.
- The default base URL uses `localhost` rather than `127.0.0.1` so Next dev HMR stays same-origin.
- The first target is the web app. Desktop, mobile, docs, and landing can add projects later when they have stable boot fixtures.

### Test Shape

- Use `*.e2e.ts` so root `bun test` does not discover Playwright tests.
- `tests/smoke/` owns stable release smoke checks.
- `tests/specs/` owns feature/spec journeys, named with the spec id when possible.
- Tests import from `fixtures/test.ts` so console errors and page errors are captured consistently.
- Reports write to `e2e/reports/`; traces, screenshots, and video write to `e2e/test-results/`.

### Boundaries

- Backend rules, transaction safety, and concurrency stay in Rust/service tests.
- Frontend pure logic stays in Bun tests.
- Playwright proves full user journeys and cross-layer wiring.
- Agent Browser remains exploratory verification. If it finds a durable regression risk, add a minimal Playwright assertion.

## Rollout

1. Add the `e2e` workspace, Playwright config, fixtures, smoke/spec directories, and documentation.
2. Add root `just` commands for smoke, full, headed, browser install, and report viewing.
3. Add one stable smoke test for the web setup route.
4. Update specs guidance so future `TEST.md` execution maps can point to `just test-e2e*`.
5. Keep E2E out of default `just test` until the suite has stable CI ownership.

## Risks

- Full app flows often need local API state. Those tests should add explicit fixtures before becoming required gates.
- Browser downloads are machine-specific. Fresh-machine setup is handled by `just install-e2e-browsers`.
- Next dev startup and first route compilation can be slow. Playwright web server timeout is set to 120 seconds, navigation timeout to 60 seconds, and test timeout to 90 seconds.
- If a developer is already using `3030` for normal web dev, E2E defaults to `3330` to avoid port collisions.

## Follow-Ups

- Add CI once the smoke suite is stable in the target runner.
- Add API-backed fixture helpers for workspace/project journeys.
- Add spec-owned E2E tests as feature TEST.md files start mapping scenarios to Playwright.
