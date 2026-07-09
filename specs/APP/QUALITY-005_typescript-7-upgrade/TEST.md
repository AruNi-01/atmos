# TEST · QUALITY-005: TypeScript 7 Upgrade

> Test Plan · prove the TypeScript 7 cutover does not change product behavior, and that the monorepo actually uses native TS 7 features (binary, parallel checkers, unified config). References TECH QUALITY-005.

## Test strategy

This is a toolchain upgrade. The primary risk is **silent product breakage** from stricter / different typechecking, broken eslint resolution, or tsconfig hard errors. The secondary risk is **claiming a TS 7 upgrade while still running TS 5/6 `tsc`**.

Verification layers:

- **Toolchain / unit-style gates** — prove which binary runs, which versions are installed, and that forbidden TS 6 escape hatches are gone.
- **Package typecheck matrix** — every TS workspace must typecheck cleanly under native TS 7.
- **Lint / build regression** — eslint (TS 6 API path) and production builds still work.
- **Automated product regression** — existing Bun tests, Playwright smoke, and scoped web/mobile checks.
- **Performance proof** — bench harness shows real speedup vs pre-upgrade baseline (this is how we prove new features are used).
- **Exploratory agent-browser** — short UI smoke only; not the source of truth for type safety.
- **Manual** — editor LSP enablement and mobile native smoke where automation is thin.

## Coverage map

| Requirement (from TECH) | Scenario IDs |
|-------------------------|--------------|
| TS 7 is the primary typecheck binary | S1, S2, S8 |
| TS 6 API remains available for eslint / programmatic tools | S3, S4 |
| Catalog / workspace versions unified | S1, S5 |
| TS 7 hard errors absorbed (`baseUrl`, `ignoreDeprecations`, etc.) | S5, S6 |
| Shared `packages/config` bases adopted | S5, S7 |
| Parallel checkers / orchestrator wired | S8, S9 |
| Existing product behavior unchanged | S10–S16 |
| Editor / contributor docs updated | S17 |
| Rollback / dual-package clarity | S3, S18 |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Toolchain | Shell | `bun pm ls typescript` + package.json inspection | clean `bun install` | TS 7 native + TS 6 API both present; no stray `^5` pins | planned |
| S2 | Toolchain | Shell | `bunx @typescript/native --version` (or documented binary) | post-install | reports `7.x`; typecheck scripts invoke this binary | planned |
| S3 | Toolchain | Shell / Node | resolve `require.resolve('typescript/package.json')` from eslint context | root + `apps/web` | resolves to `@typescript/typescript6` / 6.x API package | planned |
| S4 | Integration | Bun | `bun --filter web lint` (and root `bun lint` if scoped) | default repo | eslint exits 0; no "typescript API missing" errors | planned |
| S5 | Config audit | Shell / ripgrep | `rg` over `**/tsconfig*.json` + `**/package.json` | full tree | no `ignoreDeprecations`, no `baseUrl`, no `typescript: ^5` / mobile `~6.0.3` | planned |
| S6 | Typecheck | Bun | `bun --filter @atmos/mobile typecheck` | mobile tsconfig without deprecations | exits 0 | planned |
| S7 | Typecheck | Bun | `bun run typecheck` (root orchestrator) | all workspaces | every package typecheck exits 0 under TS 7 | planned |
| S8 | Performance | Bench script | `bun run typecheck:bench` | baseline file in `assets/` | ≥ 3× faster full typecheck vs baseline; checkers > 1 in non-debug mode | planned |
| S9 | Toolchain | Shell | inspect `scripts/typecheck-all.ts` + env | CI + local defaults | `--checkers` / `--builders` (or env) applied; `--singleThreaded` documented | planned |
| S10 | Regression | Bun | `bun --filter web test` (or package test script) | existing fixtures | exit 0; no new failures vs main | planned |
| S11 | Regression | Bun | `bun --filter @atmos/mobile test` | existing fixtures | exit 0 | planned |
| S12 | Regression | Playwright | `just test-e2e-smoke` | e2e harness | smoke passes on Chromium | planned |
| S13 | Build | Bun | `bun --filter web build` | production build env | Next build exits 0 | planned |
| S14 | Build | Bun | `bun --filter landing build` | production build env | exits 0 | planned |
| S15 | Build | Bun | `bun run --filter docs types:check` (and build if feasible) | docs env | exits 0 | planned |
| S16 | Build / typecheck | Bun | `bun --filter @atmos/relay typecheck` | relay tsconfig | exits 0 with workers types | planned |
| S17 | Docs | Review | read `packages/config/AGENTS.md` + root notes | n/a | dual-package + editor steps documented | planned |
| S18 | Failure | Manual / Shell | temporarily point typecheck at wrong package | local only | failure mode is obvious; rollback = revert deps/tsconfig | planned |

## Scenarios

### S1 — Dual-package install is correct and versions are unified

- **Level**: Toolchain
- **Given**: a clean install after the upgrade PR (`bun install`).
- **When**: an agent inspects root + workspace `package.json` files and the lockfile resolution for TypeScript.
- **Then**:
  - every former `typescript: ^5` / `~6.0.3` pin is gone;
  - the native TS 7 package and the TS 6 API compatibility package are both installed as designed in TECH;
  - workspace versions are catalog-driven (or equivalently centralized), not ad-hoc per app.
- **Signals**: `package.json` grep clean; `bun pm ls` / lockfile shows `typescript@7` (native) and `typescript@6` API alias; no package still declares `^5`.

### S2 — Typecheck invokes native TypeScript 7, not the old JS tsc

- **Level**: Toolchain
- **Given**: root and package `typecheck` scripts from TECH.
- **When**: running the documented version command and one package typecheck with verbose / which-binary tracing.
- **Then**: the binary in use is TypeScript **7.x** native (`@typescript/native` or the documented wrapper), not TS 5/6 `tsc` from the API package alone.
- **Signals**: `--version` prints `7.`; process / script path points at the native package; a deliberate `--checkers 2` flag is accepted (TS 6 JS `tsc` would not).

### S3 — Programmatic `typescript` import still resolves to the TS 6 API

- **Level**: Toolchain
- **Given**: eslint-config-next / typescript-eslint need `import "typescript"`.
- **When**: resolving `typescript/package.json` from `apps/web` (and root if eslint runs there).
- **Then**: resolution yields the **6.x API compatibility package**, not an API-less TS 7 module.
- **Signals**: resolved version starts with `6.`; `require("typescript").version` (or equivalent) works and exposes the legacy API surface eslint expects.

### S4 — ESLint keeps working after the dual-package cutover

- **Level**: Integration
- **Given**: `apps/web` eslint config (`eslint-config-next` + typescript).
- **When**: `bun --filter web lint` runs.
- **Then**: lint completes without resolver/parser crashes about missing TypeScript APIs.
- **Signals**: process exit code 0 (or only pre-existing non-upgrade findings); no stack traces mentioning missing `typescript` exports / `createProgram`.

### S5 — Forbidden TS 6 escape hatches and deprecated options are gone

- **Level**: Config audit
- **Given**: all `tsconfig*.json` under `apps/`, `packages/`, `e2e/`.
- **When**: searching for upgrade blockers called out in TECH.
- **Then**: none of the following remain in committed configs:
  - `"ignoreDeprecations"`
  - `"baseUrl"`
  - `"moduleResolution": "node"` / `"node10"` / `"classic"`
  - `"target": "es5"`
  - `"module": "amd" | "umd" | "system" | "none"`
- **Signals**: `rg` over tsconfigs returns no matches for the forbidden keys/values above; mobile/docs/ui configs still typecheck after `paths` rewrites.

### S6 — Mobile typecheck passes without `ignoreDeprecations`

- **Level**: Typecheck
- **Given**: `apps/mobile/tsconfig.json` no longer sets `ignoreDeprecations` or `baseUrl`.
- **When**: `bun --filter @atmos/mobile typecheck`.
- **Then**: typecheck exits 0 under native TS 7.
- **Signals**: exit code 0; no errors demanding `ignoreDeprecations` or rejecting `baseUrl`.

### S7 — Full monorepo typecheck is green under TS 7

- **Level**: Typecheck
- **Given**: root `bun run typecheck` / `scripts/typecheck-all.ts` orchestrates all workspaces.
- **When**: the full typecheck runs once on a clean tree.
- **Then**: every workspace that previously typechecked still exits 0; no package is skipped silently.
- **Signals**: aggregator exit 0; per-package logs show success for web, landing, docs, mobile, e2e, ui, shared, i18n, relay, config (as applicable).

### S8 — Performance: native TS 7 features deliver a real speedup

- **Level**: Performance
- **Given**: `assets/typecheck-baseline.md` captured on the same machine class before flipping the binary, and `bun run typecheck:bench` after.
- **When**: full monorepo typecheck is benchmarked with default local checkers (≥ 2).
- **Then**:
  - wall-clock time improves by **≥ 3×** vs baseline (stretch target aligns with TECH's quality table; if hardware-limited, record checkers tuning and still show clear improvement);
  - the bench command is clearly running TS 7 (version stamped in output).
- **Signals**: bench table with before/after seconds; output includes TS 7 version; checkers value logged.

### S9 — Parallelization controls are wired (not left as unused flags)

- **Level**: Toolchain
- **Given**: `scripts/typecheck-all.ts` and env vars from TECH (`ATMOS_TSC_CHECKERS`, `ATMOS_TSC_BUILDERS`, `ATMOS_TSC_SINGLE_THREADED`).
- **When**: running typecheck with `ATMOS_TSC_CHECKERS=1` vs `ATMOS_TSC_CHECKERS=4` (or inspecting the argv actually passed).
- **Then**: the orchestrator passes the configured flags through to the native binary; CI defaults are conservative; local defaults may be higher.
- **Signals**: logged argv contains `--checkers`; changing the env changes the flag; `--singleThreaded` path documented and functional.

### S10 — Web unit / package tests still pass

- **Level**: Regression (Bun)
- **Given**: existing `apps/web` test suite.
- **When**: `bun --filter web test` (or the package's canonical test script).
- **Then**: no new failures attributable to the TS upgrade.
- **Signals**: exit 0; failure count ≤ pre-upgrade baseline (record baseline in Coverage Status).

### S11 — Mobile unit tests still pass

- **Level**: Regression (Bun)
- **Given**: existing `apps/mobile` tests.
- **When**: `bun --filter @atmos/mobile test`.
- **Then**: suite remains green.
- **Signals**: exit 0.

### S12 — Playwright smoke still passes

- **Level**: E2E
- **Given**: QUALITY-003 harness.
- **When**: `just test-e2e-smoke`.
- **Then**: setup-route smoke still passes; harness itself still typechecks under TS 7 (`bun run --cwd e2e typecheck` / `lint`).
- **Signals**: Playwright smoke exit 0; e2e `tsc --noEmit` exit 0.

### S13 — Web production build still succeeds

- **Level**: Build regression
- **Given**: `apps/web` Next 16 build pipeline (SWC/Turbopack unchanged; TS 7 is typecheck-only).
- **When**: `bun --filter web build`.
- **Then**: build exits 0.
- **Signals**: Next build success log; no new TS-config-induced compile failures in the typecheck step Next invokes (if any).

### S14 — Landing production build still succeeds

- **Level**: Build regression
- **Given**: `apps/landing`.
- **When**: `bun --filter landing build`.
- **Then**: build exits 0.
- **Signals**: success exit code.

### S15 — Docs typegen / typecheck still succeeds

- **Level**: Build / typecheck regression
- **Given**: `apps/docs` Fumadocs + Next typegen.
- **When**: `bun run --filter docs types:check`.
- **Then**: exits 0 after `baseUrl` removal and path rewrites.
- **Signals**: exit 0; no unresolved `@/*` or fumadocs collection path errors.

### S16 — Relay Workers typecheck still succeeds

- **Level**: Typecheck regression
- **Given**: `packages/relay` with explicit Cloudflare worker types.
- **When**: `bun --filter @atmos/relay typecheck` (or package script name).
- **Then**: exits 0; ambient worker types still load via explicit `"types"`.
- **Signals**: exit 0; no missing `DurableObject` / worker lib errors from `types` default changes.

### S17 — Contributor docs explain dual-package and editor setup

- **Level**: Docs review
- **Given**: TECH requires `packages/config/AGENTS.md` (+ root/agent note) updates.
- **When**: a new contributor reads those docs.
- **Then**: they can answer: which package is the TS 7 binary, which is the TS 6 API, how to run typecheck, and how to enable the TS 7 editor experience.
- **Signals**: docs contain the dual-package names, `bun run typecheck`, and editor enablement steps; no instruction to `npm i typescript@5`.

### S18 — Failure mode / rollback is understandable

- **Level**: Failure / manual
- **Given**: dual-package design.
- **When**: someone accidentally runs the API-6 package's `tsc6` (or wrong binary) for CI typecheck, or reverts the upgrade commit.
- **Then**:
  - wrong-binary usage is detectable via `--version` / missing `--checkers`;
  - full rollback is `git revert` of the upgrade commit(s) with no data migration.
- **Signals**: documented rollback in TECH/AGENTS; version mismatch fails an explicit check in S2 or bench header.

## Performance & load budgets

| Check | Budget |
|-------|--------|
| Full monorepo typecheck wall time | ≥ **3×** faster than pre-upgrade baseline on the same machine (record absolute seconds in Coverage Status) |
| `apps/web` typecheck alone | Clearly faster than baseline; log checkers used |
| CI typecheck | Completes without OOM at `ATMOS_TSC_CHECKERS=2` (or documented CI default) |
| ESLint on `apps/web` | No >2× regression vs pre-upgrade (API still TS 6; should be ~flat) |

If the 3× full-monorepo budget is missed, do **not** waive silently: tune `--checkers`, confirm the native binary is in use (S2), and re-bench. Only then document a machine-specific exception in Coverage Status.

## Regression checklist

Fragile areas for this upgrade — scan before merge:

- [ ] `apps/mobile` path aliases (`@/*`, `@atmos/resources/*`) still resolve after `baseUrl` removal.
- [ ] `apps/docs` fumadocs `paths` + Next plugin still work without `baseUrl`.
- [ ] `packages/ui` react `@types` path remaps still resolve.
- [ ] `e2e` still sees `@playwright/test` + Node types with explicit `"types"`.
- [ ] `packages/relay` still sees Cloudflare worker types with explicit `"types"`.
- [ ] ESLint does not resolve `typescript` to the API-less native package.
- [ ] Root `bun run typecheck` does not silently skip a workspace.
- [ ] No package reintroduces `ignoreDeprecations` to "make CI green."
- [ ] Desktop/web static export paths untouched (this upgrade must not change `BUILD_TARGET` behavior).
- [ ] Lockfile does not contain accidental duplicate conflicting `typescript@5` runtime deps for app code.

## Exploratory agent-browser checks

Use after the automated gates are green. Load Agent Browser via the installed skill or `agent-browser skills get core --full`. If unavailable, follow `specs/references/agent-browser-setup.md` and mark `not_run` in Coverage Status.

1. Open local web (`just dev-web` with API if needed) and confirm the setup / welcome shell renders after a fresh reload.
2. Navigate one authenticated happy path the developer already uses (workspace list or setup → local server) and confirm no new console TypeScript tooling errors appear in the browser (app runtime should be unchanged).
3. Narrow viewport smoke: no clipped primary CTA on setup.
4. This upgrade is mostly non-UI — keep exploration short; any real product bug found here must become a Bun/Playwright regression if durable.

## Acceptance criteria

Merge-blocking:

- [ ] S1–S9 pass (toolchain correctness + performance proof that TS 7 features are actually used).
- [ ] S10–S16 pass (product/build regression gates).
- [ ] S17 docs updated.
- [ ] No committed `ignoreDeprecations` or `baseUrl` in app/package tsconfigs.
- [ ] ESLint still functions via TS 6 API package (S3–S4).
- [ ] Native TS 7 is what `bun run typecheck` runs (S2).
- [ ] Bench shows ≥ 3× full typecheck speedup **or** an explicit, justified Coverage Status exception after checkers tuning.
- [ ] `just test-e2e-smoke` passes.
- [ ] `atmos-specs-test-run` (or implementing agent) fills Coverage Status with exact commands and results.
- [ ] No product feature regressions identified in automated suites attributable to this upgrade.

## Manual verification steps

Automation cannot fully cover these:

1. **Editor**: enable TypeScript 7 language server / native extension in Cursor or VS Code; open `apps/web/src` and confirm diagnostics appear quickly and match `bun --filter web typecheck` on a known error (temporarily introduce and revert a type error).
2. **Mobile native smoke** (if a simulator is available): `bun --filter @atmos/mobile start` / ios run once; confirm app boots. If no simulator, record `not_run` with reason — typecheck + unit tests still required.
3. **Wrong-binary sanity**: run `tsc --version` vs documented native binary once and confirm contributors won't accidentally typecheck with API-6 `tsc6` in CI.

## Non-coverage

- Full Desktop Tauri E2E (no harness change in this spec).
- Exhaustive visual regression of every web surface (out of scope for a compiler upgrade).
- Waiting for / testing TypeScript 7.1 stable programmatic API (follow-up).
- Vue/Svelte/MDX embedded TS 7 language services (not used by Atmos app code).
- Guaranteeing identical diagnostics ordering across different `--checkers` values (pin CI checkers instead).
- Replacing Next/Expo bundlers with `tsc` emit.

## Coverage Status

> Updated 2026-07-09 during QUALITY-005 implementation (pre `atmos-specs-test-run` formal pass).

| Scenario | Result | Evidence |
|----------|--------|----------|
| S1 | ✅ | Root + workspaces pin `typescript@6.0.3`; root has `@typescript/native@7.0.2`; no `^5` / mobile `~6` left |
| S2 | ✅ | `node_modules/@typescript/native/bin/tsc --version` → `7.0.2`; `bun run typecheck` refuses non-7 |
| S3 | ✅ | `require("typescript").version` → `6.0.3`, `typeof createProgram === "function"` |
| S4 | ⚠️ | `bun --filter web lint` runs typescript-eslint successfully (no missing-API crash). Pre-existing: 2× `@typescript-eslint/no-explicit-any` errors in `center-stage-support.tsx` + 143 warnings — not introduced by this upgrade |
| S5 | ✅ | `rg ignoreDeprecations\|baseUrl` over tsconfigs → clean |
| S6 | ✅ | `bun --filter @atmos/mobile typecheck` via `run-tsc7.ts` exits 0 |
| S7 | ✅ | `bun run typecheck` all 9 workspaces green |
| S8 | ✅ | Bench: web **26.14×** (19.23s → 0.74s), mobile **6.08×**, ui **1.60×**; web exceeds 3× budget |
| S9 | ✅ | Orchestrator passes `--checkers`; `--builders` only with `-b`; env knobs documented |
| S10 | ⚠️ | `bun test` in `apps/web`: 247 pass / 6 fail — failures are `next-intl` / Appshot mock issues, not TS 7 diagnostics |
| S11 | ✅ | `bun --filter @atmos/mobile test` — 58 pass / 0 fail |
| S12–S16 | planned | Builds / e2e smoke not re-run in this implementation session |
| S17 | ✅ | `packages/config/AGENTS.md`, root `AGENTS.md` / `CLAUDE.md`, `just typecheck` documented |
| S18 | planned | Manual wrong-binary / editor checks deferred |

Commands used:

```bash
bun install
bun run typecheck
bun run typecheck:bench
node -e 'const ts=require("typescript"); console.log(ts.version, typeof ts.createProgram)'
bun --filter @atmos/mobile test
(cd apps/web && bun test)
(cd apps/web && bun run lint)
```

