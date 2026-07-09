# TECH · QUALITY-005: TypeScript 7 Upgrade

> Technical Design · HOW. Repository-wide TypeScript toolchain upgrade to native TypeScript 7, with intentional TS 6 API coexistence for programmatic tooling.

## Scope summary

Upgrade every TypeScript workspace package from the current mixed `^5` / mobile `~6.0.3` state to **TypeScript 7 as the primary `tsc` / editor type-checker**, while keeping a **TypeScript 6 API package** available for tools that still import `typescript` programmatically (notably `eslint-config-next` / typescript-eslint).

This is an engineering quality upgrade, not a product feature. It must:

1. Make TypeScript 7 the default typecheck binary across the monorepo.
2. Adopt TypeScript 7's native performance features deliberately (parallel checkers/builders, improved watch, editor LSP).
3. Absorb TypeScript 6→7 hard errors (`baseUrl`, `ignoreDeprecations`, deprecated module settings, etc.) instead of papering over them.
4. Prove that existing product behavior is unchanged via the regression gates in `TEST.md`.

Out of scope:

- New product UI or WebSocket protocol changes.
- Waiting for TypeScript 7.1's stable programmatic API before adopting 7.0.
- Migrating Vue/Svelte/Astro/MDX language-service plugins (Atmos does not use those stacks for app code).
- Changing Next.js / Expo / Bun major versions except where required for TypeScript peer compatibility.

## Quality target

| Metric | Before | After |
|--------|--------|-------|
| Primary typecheck binary | JS `tsc` (TS 5 / mobile TS 6) | Native Go `tsc` (TS 7) |
| Workspace TypeScript versions | Mixed `^5` + mobile `~6.0.3` | Catalog-pinned TS 7 + TS 6 API alias |
| `ignoreDeprecations` | Present in mobile | Removed |
| Deprecated `baseUrl` | Present in mobile / docs / ui | Removed; paths rewritten relative to project root |
| Typecheck wall time (full monorepo) | Baseline captured in TEST S8 | ≥ 3× faster than baseline on the same machine |
| Product behavior | — | Unchanged (regression gates green) |

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Root package.json catalog                                            │
│   typescript          → npm:@typescript/native@^7   (tsc binary)     │
│   @typescript/api6    → npm:@typescript/typescript6  (programmatic)  │
└──────────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
   apps/*/typecheck scripts          eslint-config-next /
   packages/*/typecheck              typescript-eslint /
   just typecheck / CI               any `import "typescript"` tool
                │
                ▼
   Shared tsconfig bases in packages/config/typescript/
     - base.json          (library / package defaults for TS 7)
     - nextjs.json        (Next apps)
     - react-native.json  (Expo mobile)
     - workers.json       (relay / Cloudflare)
```

Decision: **optimal dual-package design**, not a single-package illusion.

- TypeScript 7.0 does not ship a stable programmatic API.
- Forcing every consumer onto the TS 7 package would break eslint and similar tools.
- The optimal design therefore makes TS 7 the *user-facing* compiler everywhere, and pins TS 6 only as an explicit API compatibility package with a clear removal path when 7.1 lands.

## Current state (audit)

| Package | Current `typescript` | Notes |
|---------|----------------------|-------|
| Root catalog | `^5` | Declared but packages mostly pin locally |
| `apps/web` | `^5` | Next 16, `moduleResolution: bundler`, already `strict` |
| `apps/landing` | `^5` | Same Next pattern |
| `apps/docs` | `^5.9.3` | Uses `baseUrl` |
| `apps/mobile` | `~6.0.3` | Uses `ignoreDeprecations: "6.0"` + `baseUrl` |
| `e2e` | `^5.9.3` | Explicit `types: ["node", "@playwright/test"]` |
| `packages/ui` | `^5` | Uses `baseUrl` + react path remaps |
| `packages/shared` / `i18n` | `^5` | Library emit (`declaration`) |
| `packages/relay` | `^5` | Explicit `types: ["@cloudflare/workers-types"]` |
| `packages/config` | `^5` | Shared tsconfig bases underused today |

Known TS 7 hard-error surfaces already present in-repo:

- `apps/mobile/tsconfig.json` → `ignoreDeprecations: "6.0"` (must delete).
- `apps/mobile/tsconfig.json`, `apps/docs/tsconfig.json`, `packages/ui/tsconfig.json` → `baseUrl` (must remove; rewrite `paths` to be project-root-relative).

## Module-by-module design

### Root dependency topology

Update root `package.json`:

```json
{
  "catalog": {
    "typescript": "npm:typescript@^7.0.2",
    "@typescript/api6": "npm:@typescript/typescript6@^6.0.2"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@typescript/api6": "catalog:"
  },
  "overrides": {
    "typescript": "npm:typescript@^7.0.2"
  }
}
```

Implementation notes:

1. Every workspace package's `devDependencies.typescript` becomes `"catalog:"` (or the explicit npm alias if Bun catalog aliasing of npm remaps needs a local pin).
2. Tools that resolve `require("typescript")` / `import "typescript"` for the **API** must resolve to `@typescript/api6` via package aliasing:

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    "@typescript/native": "npm:typescript@^7.0.2"
  }
}
```

**Chosen resolution strategy (optimal for Bun):**

```json
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "6.0.3"
  }
}
```

Notes:

- Do **not** use `"typescript": "npm:@typescript/typescript6@…"` under Bun — the API re-export resolves to an empty module (`createProgram` undefined). Install the real `typescript@6.0.3` package for eslint.
- Bun links root `.bin/tsc` → `@typescript/native` (7.x). Nested workspace `node_modules/.bin/tsc` may still point at TS 6, so every package `typecheck` script must call `scripts/run-tsc7.ts`.
- Document in `packages/config/AGENTS.md` that `typescript` means "API 6 for eslint" and `@typescript/native` means "TS 7 compiler" until 7.1.

### `scripts/typecheck-all.ts` (new)

Central orchestrator so every package uses the same native binary and parallelization flags:

```text
for each workspace with a typecheck script:
  run `@typescript/native` tsc with:
    --noEmit
    --checkers <N>
    --builders <M>   # when project references exist
```

Defaults:

| Environment | `--checkers` | `--builders` | Notes |
|-------------|--------------|--------------|-------|
| Local developer machine (≥ 8 cores) | `8` | `4` | Favor wall-clock speed |
| CI / constrained runners | `2` | `2` | Avoid memory thrash |
| Debug / bisect | `--singleThreaded` | n/a | Deterministic, comparable to TS 6 |

Expose via env:

```bash
ATMOS_TSC_CHECKERS=8
ATMOS_TSC_BUILDERS=4
ATMOS_TSC_SINGLE_THREADED=0
```

### `packages/config` — shared TS 7 bases

Expand `packages/config/typescript/` into the real shared source of truth:

```text
packages/config/typescript/
├── base.json           # shared library defaults (TS 7 clean)
├── nextjs.json         # Next apps (web / landing / docs)
├── react-native.json   # Expo mobile
└── workers.json        # Cloudflare Workers (relay)
```

#### `base.json` (target shape)

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noUncheckedSideEffectImports": true,
    "libReplacement": false,
    "stableTypeOrdering": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Rules:

- Do **not** set `ignoreDeprecations`.
- Do **not** set `baseUrl`.
- Do **not** set `types: []` globally; packages that need ambient types list them explicitly (`node`, `@playwright/test`, `@cloudflare/workers-types`).
- Prefer explicit `rootDir` only when emit layout requires it (declaration packages).

#### App/package migration

| Consumer | Extends | Package-specific deltas |
|----------|---------|-------------------------|
| `apps/web` | `nextjs.json` | Keep Next plugin + path aliases; no `baseUrl` |
| `apps/landing` | `nextjs.json` | Same |
| `apps/docs` | `nextjs.json` | Drop `baseUrl`; keep fumadocs path aliases as root-relative `paths` |
| `apps/mobile` | `react-native.json` | Drop `ignoreDeprecations` + `baseUrl`; keep Expo extends if still required, then overlay TS 7-safe options |
| `e2e` | `base.json` | Keep explicit `types: ["node", "@playwright/test"]` |
| `packages/ui` | `base.json` | Drop `baseUrl`; rewrite `paths` for `@/*` and react type remaps |
| `packages/shared` / `i18n` | `base.json` | Keep `declaration` / `declarationMap` |
| `packages/relay` | `workers.json` | Keep `types: ["@cloudflare/workers-types"]` |

### Path / `baseUrl` rewrite rules

TypeScript 7 rejects `baseUrl`. Convert:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

to:

```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```

For docs/ui cases that used `baseUrl` only to anchor `paths`, keep the same relative path strings; verify with `tsc --traceResolution` on one representative import per package.

For `packages/ui` react type remaps that currently rely on `baseUrl: "."`, rewrite to absolute-from-config relative paths (already relative to the tsconfig directory once `baseUrl` is gone — confirm with a focused typecheck).

### Mobile-specific plan

`apps/mobile` is already on TS 6 with deprecations suppressed. Optimal path:

1. Align mobile onto the same dual-package root topology (no private `~6.0.3` pin).
2. Remove `ignoreDeprecations`.
3. Remove `baseUrl`; keep `@/*` and `@atmos/resources/*` paths.
4. Re-run `bun --filter @atmos/mobile typecheck` until clean.
5. Keep Expo's `extends: "expo/tsconfig.base"` only if it remains compatible; if Expo's base reintroduces forbidden flags, fork the needed options into `packages/config/typescript/react-native.json` and stop extending Expo's base for compilerOptions that conflict.

### Editor / IDE adoption

- Document VS Code / Cursor setup: install or enable the TypeScript 7 language server / native extension so editor diagnostics match CI.
- Workspace recommendation (`.vscode/extensions.json` and/or `.vscode/settings.json`):
  - Point workspace TypeScript SDK at `@typescript/native` when the editor supports selecting a workspace TS version for the native server.
  - Add a short note in `agents/references/` or root `AGENTS.md` under a "TypeScript 7" subsection.
- Do not force editor settings that break non-TS workflows.

### Watch mode / local DX

Where packages already use `tsc --watch` (or will), prefer native watch:

```bash
bunx @typescript/native --watch --noEmit --checkers 4
```

Next.js / Expo still own their own transform pipelines; Atmos continues to use `tsc --noEmit` as the **typecheck gate**, not as the app bundler. This upgrade does not replace SWC / Metro / Turbopack.

### Performance harness

Add `scripts/typecheck-bench.ts`:

1. Record wall time + peak RSS for:
   - full monorepo typecheck
   - `apps/web` alone
   - `apps/mobile` alone
2. Write results to `logs/debug/typecheck-bench.jsonl` (or stdout table in CI summary).
3. Compare against a checked-in baseline file `specs/APP/QUALITY-005_typescript-7-upgrade/assets/typecheck-baseline.md` captured **before** flipping the default binary (implementation step 1).

This is how we prove we are "using the new features," not merely bumping a version number.

### Parallelization policy (using TS 7 features)

| Feature | How Atmos uses it |
|---------|-------------------|
| Native Go `tsc` | Default typecheck binary for all packages |
| `--checkers` | Tuned per environment via `ATMOS_TSC_CHECKERS` |
| `--builders` | Enabled for any future project-references graph; today mostly N/A but wired in the orchestrator |
| `--singleThreaded` | Escape hatch for debugging order-dependent diagnostics |
| Improved `--watch` | Documented for local package typecheck loops |
| Editor LSP multithreading | Documented editor enablement |
| Side-by-side TS 6 API | Explicit `@typescript/api6` / aliased `typescript` for eslint |

## Data model

No database, WebSocket, or runtime schema changes.

New durable artifacts:

| Artifact | Purpose |
|----------|---------|
| `packages/config/typescript/*.json` | Shared TS 7-safe bases |
| `scripts/typecheck-all.ts` | Unified native typecheck runner |
| `scripts/typecheck-bench.ts` | Performance proof harness |
| `specs/.../assets/typecheck-baseline.md` | Pre-upgrade timing baseline |
| Root catalog / overrides | Single version source of truth |

## Transport

None. This upgrade does not add REST or WebSocket surfaces.

## Security & permissions

- No new secrets.
- Do not commit npm tokens or private registry credentials.
- Benchmark logs must not include machine usernames beyond what already appears in local debug logs.

## Rollout plan

Ordered, mergeable steps. Prefer one PR for the full cutover if CI capacity allows; otherwise split as below without leaving the repo on a half-migrated catalog.

1. **Baseline capture** — run current typecheck timings into `assets/typecheck-baseline.md`; record `bun` / Node / machine core count.
2. **Shared config bases** — land TS 7-safe `packages/config/typescript/*` without switching packages yet.
3. **Dual-package install** — add `@typescript/native` (TS 7) + aliased TS 6 API; keep existing package typecheck scripts temporarily on old `tsc` if needed for a green intermediate.
4. **tsconfig hard-error cleanup** — remove `ignoreDeprecations`, remove `baseUrl`, fix `paths`, set explicit `types` where ambient globals disappear.
5. **Flip typecheck scripts** — point every `typecheck` script + root orchestrator at native TS 7 with `--checkers` defaults.
6. **Workspace version unification** — every package uses catalog / dual-package pins; delete stray `^5` / `~6.0.3` pins.
7. **Editor + docs** — update `packages/config/AGENTS.md`, root agent notes, optional VS Code recommendations.
8. **Regression gate** — execute `TEST.md` fully; attach bench comparison proving ≥ 3× speedup on full typecheck (or document machine-specific shortfall with checkers tuning).
9. **Follow-up ticket** — track removal of TS 6 API alias when TypeScript 7.1 ships a stable programmatic API.

## Risks & tradeoffs

| Risk | Mitigation |
|------|------------|
| ESLint / typescript-eslint breaks if `typescript` resolves to TS 7 API-less package | Keep TS 6 as the `typescript` package name for API consumers; native binary under `@typescript/native` |
| Expo `tsconfig.base` reintroduces forbidden options | Overlay / replace with `react-native.json`; verify with mobile typecheck |
| `types` default change hides ambient globals | Explicit `types` arrays in e2e / relay / any Node globals consumers |
| Template literal Unicode inference changes rare type-level string utils | Grep for surrogate-pair / `Length` utilities; fix if typecheck fails |
| Order-dependent diagnostics with varying `--checkers` | Pin checkers in CI; use `--singleThreaded` when bisecting |
| Docs Fumadocs / Next plugin incompat | Keep `skipLibCheck`; fix only Atmos-owned errors; escalate upstream if blocker |
| Dual-package confusion for contributors | Document clearly in config AGENTS + root notes; add script so humans never invent ad-hoc `tsc` invocations |

**Tradeoff chosen:** dual-package now beats waiting for 7.1. Waiting would leave the monorepo on TS 5/6 and forfeit the only upgrade benefit that matters (native speed).

**Rollback path:** revert the dependency/catalog/tsconfig PR; typecheck scripts return to previous `typescript` package. No data migration to undo.

## Dependencies & compatibility

- Depends on: TypeScript 7.0+ npm release, `@typescript/typescript6` compatibility package.
- Soft-depends on: eslint-config-next continuing to work against TS 6 API.
- Blocks: none.
- Unblocks: faster CI typecheck, snappier editor diagnostics, future project-references parallel builds.
- External docs: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)

## Open questions

- [x] Confirm Bun catalog / install layout — **resolved 2026-07-09**: Bun breaks `typescript` → `npm:@typescript/typescript6` API re-exports (`require("typescript")` returns an empty object). Use **`typescript@6.0.3` (real package)** + **`@typescript/native`: `npm:typescript@7.0.2`**. With that layout, Bun links `.bin/tsc` → native 7 while `require("typescript")` keeps `createProgram` for eslint.
- [x] Expo SDK 56 `expo/tsconfig.base` — **resolved**: clean for TS 7 (no `baseUrl` / `ignoreDeprecations`). Mobile keeps `extends: "expo/tsconfig.base"` and overlays strict TS 7-safe options.
- [x] Package names — **resolved**: `@typescript/native` for the binary; `typescript@6.0.3` for the API. Package scripts must call `scripts/run-tsc7.ts` (not bare `tsc`) because nested `apps/*/node_modules/.bin/tsc` can still point at TS 6.

<!-- updated 2026-07-09: Bun dual-package spike results -->
