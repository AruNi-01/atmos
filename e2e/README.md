# Atmos E2E

Playwright tests live here as a separate workspace so end-to-end checks can grow without mixing with Rust or Bun unit tests.

## Commands

```bash
just test-e2e          # all Playwright E2E projects
just test-e2e-smoke    # fast Chromium smoke suite
just test-e2e-headed   # headed browser run for debugging
just e2e-report        # open the last HTML report
```

Install the browser once on a fresh machine:

```bash
bun run --cwd e2e install:browsers
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_WEB_PORT` | `3330` | Local Next.js dev server port when Playwright starts web. |
| `E2E_API_PORT` | `30303` | API port compiled into the web app via `NEXT_PUBLIC_API_PORT`. |
| `E2E_BASE_URL` | `http://localhost:$E2E_WEB_PORT` | Existing app URL to test. When set, Playwright does not start web. |
| `E2E_START_WEB=0` | unset | Do not start the web server; useful when another tool owns the app process. |
| `E2E_REUSE_SERVER=1` | unset | Reuse an already running server on `E2E_WEB_PORT`; disabled by default to avoid testing the wrong app. |
| `CI=1` | unset | Enables retries, `forbidOnly`, and non-reused server behavior. |

## Layout

```text
e2e/
├── playwright.config.ts
├── fixtures/
│   ├── app-server.ts
│   ├── console-errors.ts
│   ├── local-api.ts
│   └── test.ts
└── tests/
    ├── smoke/
    └── specs/
```

- `tests/smoke/` is for stable app boot and release smoke coverage.
- `tests/specs/` is for spec-owned journeys, named like `APP-027_canvas-workspace-surfaces.e2e.ts`.
- Test files use `*.e2e.ts` so root `bun test` does not collect Playwright tests.
- Use `fixtures/test.ts`, not `@playwright/test` directly, so page errors and console errors are captured consistently.
- Use `fixtures/local-api.ts` for no-backend smoke checks that must stub local API probes deterministically.
- Prefer role/text assertions over CSS selectors. Add explicit `data-testid` only when the UI has no stable accessible selector.
- Keep backend business rules in Rust/service tests. E2E proves the user journey and cross-layer wiring.

## Agent Browser Boundary

Agent Browser checks stay exploratory and belong in the spec `TEST.md` under agent-browser checks. If an exploratory finding becomes a regression risk, translate the smallest stable path into a Playwright test here.
