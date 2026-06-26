# E2E Agent Guide

Use this directory for Playwright end-to-end tests only.

## Before Editing

- Read root `AGENTS.md`, `apps/web/AGENTS.md`, and `specs/AGENTS.md` when a spec is involved.
- Keep Playwright tests named `*.e2e.ts`; root `bun test` must remain unit-test focused.
- Use `fixtures/test.ts` instead of importing from `@playwright/test` directly.

## Test Placement

- `tests/smoke/`: route boot, setup, and release smoke checks.
- `tests/specs/`: spec-owned journeys. Prefix filenames with the spec id when possible.
- `fixtures/`: shared server, auth, data, and assertion helpers.

## Rules

- Prefer accessible selectors: `getByRole`, `getByLabel`, `getByText`.
- Do not add REST-only test APIs unless the spec `TECH.md` explicitly justifies them; Atmos is WebSocket-first.
- Do not use E2E to exhaust backend edge cases, transactions, or concurrency. Cover those in Rust/Bun/service tests.
- Keep tests deterministic. If a flow needs data, add a fixture helper or document the required local state in the spec `TEST.md`.
- Treat Agent Browser as exploratory verification, not Playwright coverage. Use the external `agent-browser` skill/CLI only when the spec asks for exploratory browser checks.
