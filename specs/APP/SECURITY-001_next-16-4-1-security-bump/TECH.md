# TECH · SECURITY-001: Unify Next.js 16.4.1 (security)

> Technical Design · HOW. Security bump for Next.js across the monorepo. No BRAINSTORM or PRD.

## Spec id

`SECURITY-001` is the first SECURITY-* id (none exist under `specs/APP` yet). QUALITY-033 is the latest QUALITY on main; this work is a security advisory fix, not a product quality feature.

## Why

Next.js 16.3.8 is vulnerable:

- Critical: GHSA-673q-mjm6-r5xr (RCE via `use cache` typed arrays)
- Critical: GHSA-2464-fhr4-w9xw (RCE via Image Optimization SVG)
- High: GHSA-p3m5-59mp-jv5r (DoS via Server Actions)

Dependabot [#367](https://github.com/AruNi-01/atmos/pull/367) only bumps `apps/docs` (`16.3.8 → 16.4.1`). Root bun `catalog` / `overrides` and `apps/web` + `apps/landing` remain on 16.3.8, so merging #367 alone does not secure the three Next apps.

## Package manager note

This repo uses **bun** workspaces (`packageManager: bun@…`, `bun.lock`), not pnpm. "Catalog" means root `package.json` → `"catalog": { "next": "…" }` plus `"overrides": { "next": "…" }`.

## Scope

1. Bump **every** Next.js pin in the workspace to **16.4.1**:
   - Root `package.json` `catalog.next`
   - Root `package.json` `overrides.next`
   - `apps/docs/package.json`, `apps/web/package.json`, `apps/landing/package.json` (currently literal `"16.3.8"`)
   - Any other workspace package that depends on `next` (e.g. `packages/i18n`, `packages/ui`, `packages/config` if they declare it)
2. Regenerate `bun.lock` so resolved `next` is 16.4.1 everywhere (`bun install`).
3. Align peer tooling **only if required** for 16.4.1 (e.g. `eslint-config-next`). As of main, the repo uses **oxlint**, not `eslint-config-next` — do not add eslint-config-next unless a package already depends on it.
4. Add this TECH (+ short TEST) under `specs/APP/SECURITY-001_next-16-4-1-security-bump/`.
5. Open **one Ready PR** from latest `origin/main` that supersedes #367. After the PR exists, comment on #367 that it is superseded and close #367 (or leave a clear supersede comment for the owner to close — prefer close with comment linking the new PR).

## Out of scope

- Other dependency major/minor bumps
- Business / product code changes (unless a compile break forces a minimal adapter)
- Merging / squash / force-push / amending pushed commits / editing git config
- Expanding #367's Dependabot branch (prefer a clean human PR)

## Quality / security target

| Surface                        | Before          | After               |
| ------------------------------ | --------------- | ------------------- |
| catalog.next / overrides.next  | 16.3.8          | 16.4.1              |
| apps/docs, web, landing `next` | 16.3.8          | 16.4.1              |
| bun.lock resolved next         | 16.3.8          | 16.4.1              |
| #367                           | open, docs-only | superseded / closed |

## Verification

- `rg` / package.json audit: no remaining `"next": "16.3.8"` (or any next ≠ 16.4.1) in workspace package manifests; catalog + overrides = 16.4.1
- `bun.lock` shows next@16.4.1 as the resolved version for the apps
- CI green on the new PR (Build/Typecheck/Lint/oxlint/structural/relevant Plan & E2E as required by the repo)
- PR body lists from→to for every touched package and how #367 was handled

## Git / PR conventions

- Author/committer via env only: `AruNi Lu` / `lrr.0x3f4@gmail.com`. Never change git config.
- Branch e.g. `aarynlu/security-001-next-16-4-1`
- Title e.g. `fix(security): bump next to 16.4.1 across web/landing/docs (SECURITY-001)`
- Ready (not Draft) immediately. **Do not merge.**
