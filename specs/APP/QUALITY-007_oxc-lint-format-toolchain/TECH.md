# TECH · QUALITY-007: oxc Lint + Format Toolchain

> Technical Design · HOW. Repository-wide JS/TS lint and format cutover to oxlint + oxfmt, shipped in squash-merge `#309` (`2067be8bc`). As-built.

## Scope summary

Replace ESLint 9 + `eslint-config-next` (and the broken `just fmt` Prettier invocation) with **oxlint 1.88.0** and **oxfmt 0.73.0** for the whole JS/TS monorepo.

This is an engineering quality upgrade, not a product feature. It must:

1. Make oxlint the only JS/TS linter (ESLint removed entirely; no hybrid leftover).
2. Make oxfmt the only JS/TS/CSS/JSON/MD formatter (Prettier not installed; `just fmt` works).
3. Keep a Next-equivalent rule allowlist plus native React Compiler rules, with a `--max-warnings=1401` ratchet so new warnings fail CI.
4. Prove product behavior is unchanged via the regression gates in `TEST.md`.

Out of scope:

- New product UI or WebSocket protocol changes.
- Changing Next.js / Expo / Metro / Vite / Turbopack / SWC.
- Changing the Rust toolchain (`cargo clippy` / `cargo fmt` stay as they are).
- Clearing the 1401-warning inventory in this cutover (follow-up: lower the cap progressively).
- Re-formatting the 13 CodeQL-excluded files (follow-up: regress them back in).

Shipped on `main` as `2067be8bc495938c95d5692a7623742cd1294305` (`chore(tooling): migrate JS/TS lint and format to oxc (oxlint + oxfmt) (#309)`).

## Quality target

| Metric                  | Before                                                  | After                                                         |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| JS/TS linter            | ESLint 9 + `eslint-config-next` (web/landing/docs only) | oxlint 1.88.0, one root `.oxlintrc.jsonc`                     |
| JS/TS formatter         | None (`just fmt` called missing Prettier)               | oxfmt 0.73.0, one root `.oxfmtrc.json`                        |
| `apps/web` lint (local) | **63.3s**                                               | **1.26s**                                                     |
| `apps/web` lint (CI)    | ~55–93s                                                 | oxlint tool ~2.1s; `CI - JS` job wall includes `bun install`  |
| Whole-repo JS/TS lint   | not linted                                              | **1.77–1.87s** local (0 errors, 1401 warnings)                |
| Format check            | n/a                                                     | **1.69–1.80s** local on 4526 files; CI tool **~3.3s**         |
| Product behavior        | —                                                       | Unchanged (regression gates + visual comparison in `TEST.md`) |

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Root package.json                                                    │
│   oxlint 1.88.0     → bun lint / lint:web / per-app lint scripts     │
│   oxfmt  0.73.0     → bun run fmt / fmt:check                        │
│   lint-staged       → oxlint --fix + oxfmt on staged files           │
└──────────────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
   .oxlintrc.jsonc                     .oxfmtrc.json
   (allowlist + overrides)             (Prettier-compatible + Tailwind sort)
                │                              │
                ▼                              ▼
   just lint  = bun lint + cargo clippy
   just fmt   = bun run fmt + cargo fmt
   CI - JS    = bun lint  +  bun run fmt:check   (always-on)
```

Decision: **oxc-only**, not Biome, not an ESLint hybrid.

## Motivation (before)

Three problems stacked:

1. **Web ESLint was slow.** `apps/web` lint was **63.3s** locally and **~55–93s** in CI. Landing/docs were faster only because they had less code. Packages, mobile, Electron, e2e, and scripts were not in the same gate.
2. **No JS/TS formatter.** The repo had no Prettier (or other) config. Contributors formatted ad hoc; CI did not check JS/TS/CSS/JSON/MD format.
3. **`just fmt` was broken.** The justfile invoked Prettier, which was not a dependency, so the recipe failed. Rust `cargo fmt` was the only working half.

QUALITY-005 already split TypeScript 7 (native `tsc`) from TypeScript 6 (programmatic API for ESLint). After this cutover ESLint is gone; `typescript@6` remains for Next and other programmatic consumers, not for lint.

## Tool choice

| Option                                                                                        | Verdict                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Biome** (lint + format in one Rust CLI)                                                     | Fast, but weaker Next.js plugin coverage and no native React Compiler rule set matching Next 16. Formatter is less Prettier-compatible (`prettier-ignore`, MD/HTML fences). Would still leave a Compiler-rule gap. |
| **ESLint hybrid** — keep ESLint in `apps/web` for Compiler rules + `eslint-plugin-oxlint`     | Extra 55–93s CI job, duplicate config, still need oxlint for everything else. The slow path stays on the hottest package.                                                                                          |
| **oxlint JS plugins** + `eslint-plugin-react-hooks`                                           | Unstable here: plugin name is reserved (`react-hooks`); JS plugins are slower than native rules.                                                                                                                   |
| **Native oxlint `react/*` Compiler rules** (oxlint ≥ 1.79, pin **1.88.0**) + **oxfmt 0.73.0** | **Chosen.** Same Compiler rules as Next 16, warn-level ratchet matches the old web/landing ESLint overrides, one config, one CI job measured in seconds.                                                           |

**Why ESLint was removed entirely.** oxlint 1.88 already implements the React Compiler rules natively (`react/set-state-in-effect`, `refs`, `immutability`, …). Loading `eslint-plugin-react-hooks` as an oxlint JS plugin is rejected and slower. Keeping ESLint “just for Compiler” recreates the 55–93s job the migration exists to delete. There is no remaining ESLint config, dependency, or per-app `eslint.config.*`.

## `.oxlintrc.jsonc` design

Bootstrap: `@oxlint/migrate` on the old `apps/web/eslint.config.mjs` (`eslint-config-next` core-web-vitals + typescript, React Compiler as warn).

Invariants:

- **`categories.correctness` is `off`.** oxlint must not dump a silent global rule set. Only the Next-equivalent allowlist plus a tiny unicorn/import slice is enabled.
- **One root config** covers `apps/web`, `landing`, `docs`, `packages/*`, `apps/mobile`, `apps/desktop-electron`, `e2e`, `extension`, and `scripts`.
- **Ignore generated / vendored trees:** `vendor/**`, `marketing/**`, `skills/react-native-chart-kit`, Expo/iOS/Android, `.next`, `dist`/`out`/`build`, `.source`, `next-env.d.ts`, coverage, wrangler/turbo/playwright reports, `target`, `node_modules`, deprecated `apps/desktop/src-tauri/**`.
- **Plugins:** `eslint`, `typescript`, `unicorn`, `oxc`, `import`, `react`, `jsx-a11y`, `nextjs`, `node`.
- **Env:** builtin + browser + node. React `19.2.3`. Next `rootDir`: `apps/web`, `apps/landing`, `apps/docs`.

Per-app `package.json` `lint` scripts call `oxlint .` (or `oxlint packages` in `CI - Packages`). Root `bun lint` is `oxlint --max-warnings=1401`.

### Per-path overrides

| Path                                                                                                | Rule                                                                                                 | Level    | Why                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `packages/**`, `apps/mobile/**`, `apps/desktop-electron/**`, `e2e/**`, `scripts/**`, `extension/**` | Next pages-dir rules (`no-html-link-for-pages`, `no-head-element`, `no-img-element`, font/script-ga) | off      | Not Next apps                                                                |
| `packages/shared/browser/browser-runtime.js`, `extension/*.js`                                      | `no-var`, `prefer-rest-params`                                                                       | off      | Injected IIFE must stay ES5-ish `var`                                        |
| `**/*.{js,cjs}`                                                                                     | `typescript/no-require-imports`                                                                      | off      | CJS `require` is valid                                                       |
| `apps/mobile/**`                                                                                    | `typescript/no-require-imports`                                                                      | **warn** | Metro asset `require(...)`                                                   |
| `apps/mobile/**`, `packages/ui/**`                                                                  | `react/static-components`                                                                            | **warn** | Pre-existing Compiler hits in RN + design system                             |
| Repo-wide (match old web/landing)                                                                   | Compiler `set-state-in-effect` / `refs` / `immutability` / `preserve-manual-memoization` / `purity`  | **warn** | Hundreds of pre-existing hits                                                |
| `packages/ui/src/css.d.ts`, `motion-preset.tsx`, `auth-shell.tsx`                                   | `typescript/no-explicit-any`                                                                         | **off**  | Next `StaticImageData` vs Vite string URL; motion factory is not tag-generic |

### Targeted file suppressions (kept, not a global disable)

| File                                                                         | Rule                                        | Why                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/api-types/src/ws/dto/resource-monitor.test.ts`                     | `typescript/no-empty-object-type`           | `{} extends Pick<T, K>` optional-key helper                                   |
| `apps/web/src/features/workspace/store/use-workspace-surface-cache-store.ts` | `typescript/no-require-imports` (block)     | Lazy `require` so WSC unit tests skip the editor/UI graph                     |
| `packages/shared/src/hooks/use-storage.ts`                                   | `unicorn/no-instanceof-builtins` (one line) | `typeof === "function"` does not narrow `T \| updater` when T may be callable |

## Rule mapping

### Kept (Next / typescript-eslint recommended, not type-aware)

| Source                                                | oxlint                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint core                                           | `no-array-constructor`, `no-unused-expressions` (warn), `no-unused-vars` (warn), `no-var`, `prefer-const`, `prefer-rest-params`, `prefer-spread`     |
| typescript-eslint recommended                         | `typescript/ban-ts-comment`, `no-explicit-any`, `no-require-imports`, `no-empty-object-type`, … (full recommended set in `.oxlintrc.jsonc`)          |
| eslint-plugin-react recommended                       | `jsx-key`, `display-name`, `no-unescaped-entities`, … (`jsx-no-target-blank` / `no-unknown-property` / `react-in-jsx-scope` stay off, matching Next) |
| react-hooks recommended                               | `react/rules-of-hooks` (error), `react/exhaustive-deps` (warn)                                                                                       |
| React Compiler (Next 16 errors → warn in web/landing) | `react/set-state-in-effect`, `refs`, `immutability`, `preserve-manual-memoization`, `purity` as **warn**                                             |
| `@next/next` recommended + core-web-vitals            | `nextjs/*` (html-link-for-pages, img-element, inline-script-id, …)                                                                                   |
| import                                                | `import/no-anonymous-default-export` (warn)                                                                                                          |
| jsx-a11y (Next subset)                                | `alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`                  |

### Lost

| Rule                                                    | Why                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **`react/prop-types`**                                  | Not implemented in oxlint. TypeScript + React 19 makes it unnecessary.                                |
| Type-aware typescript-eslint (`recommendedTypeChecked`) | `eslint-config-next/typescript` was **not** type-aware; nothing lost vs previous CI.                  |
| ESLint `--max-warnings` / Next-only config files        | Replaced by one root allowlist + per-path overrides. Whole-repo CI uses oxlint `--max-warnings=1401`. |

### Added (small, explicit)

| Rule                                   | Level                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unicorn/no-instanceof-builtins`       | error                                                                                                                                                                                            |
| `unicorn/no-new-buffer`                | error                                                                                                                                                                                            |
| `unicorn/no-empty-file`                | warn                                                                                                                                                                                             |
| Native Compiler extras Next also ships | `react/static-components` (error, warn on `packages/ui` + mobile), `use-memo`, `globals`, `error-boundaries`, `set-state-in-render` (error); `unsupported-syntax`, `incompatible-library` (warn) |

## Baseline and `--max-warnings=1401` ratchet

Errors fail CI. Warnings are capped, not disabled.

- `bun lint` / `CI - JS` run `oxlint --max-warnings=1401`.
- Inventory at ship: **0 errors / 1401 warnings**. `--max-warnings=1400` exits 1.
- New warnings fail the job. Fixes that drop the count should lower the cap in the same PR (follow-up: ratchet down progressively).

### Warning inventory at `#309` merge (0 errors)

| Count | Rule                                                 |
| ----: | ---------------------------------------------------- |
|   487 | `react/refs`                                         |
|   365 | `react/set-state-in-effect`                          |
|   198 | `no-unused-vars`                                     |
|   171 | `react/exhaustive-deps`                              |
|    54 | `typescript/no-require-imports` (mobile Metro, warn) |
|    36 | `react/preserve-manual-memoization`                  |
|    36 | `react/immutability`                                 |
|    13 | `jsx-a11y/alt-text`                                  |
|    11 | `react/purity`                                       |
|    11 | `nextjs/no-img-element`                              |
|     9 | `react/static-components` (ui/mobile warn)           |
|     4 | `react/incompatible-library`                         |
|     4 | `import/no-anonymous-default-export`                 |
|     2 | `jsx-a11y/role-has-required-aria-props`              |

## oxfmt config and ignore list

Root `.oxfmtrc.json` (Prettier-compatible):

| Option                           | Value                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `printWidth`                     | 100                                                                            |
| `tabWidth` / `useTabs`           | 2 / false                                                                      |
| `semi`                           | true                                                                           |
| `singleQuote` / `jsxSingleQuote` | false                                                                          |
| `trailingComma`                  | all                                                                            |
| `insertFinalNewline`             | true                                                                           |
| `proseWrap`                      | preserve                                                                       |
| `sortPackageJson`                | false                                                                          |
| `sortTailwindcss`                | stylesheet `packages/ui/src/styles/globals.css`; functions `cn`, `clsx`, `cva` |

Mobile overlay `apps/mobile/.oxfmtrc.json` points Tailwind sort at `./src/global.css`.

Shared ignore patterns match oxlint (vendor, generated, locks, patches, deprecated Tauri). **Plus 13 files restored byte-identical to pre-oxfmt `main`** because GitHub Code scanning treated whitespace-only diffs as new alerts:

1. `packages/ui/src/components/ui/tabs-subtle.tsx`
2. `packages/ui/src/components/ui/color-picker.tsx`
3. `packages/shared/src/terminal/links.ts`
4. `packages/pt-design/src/host/catalog.ts`
5. `packages/md-live/src/embed/unknown-directive.ts`
6. `packages/agent-transcript/src/present.ts`
7. `apps/web/src/shared/lib/oauth-callback-return.ts`
8. `apps/web/src/features/md-live/lib/md-live-embed-nodes.ts`
9. `apps/web/src/features/github/lib/agent-fix-prompts.ts`
10. `apps/web/src/features/github/components/ActionsJobsList.tsx`
11. `apps/web/src/features/browser/components/RunScript.tsx`
12. `packages/relay/src/server-hub.ts`
13. `apps/web/src/features/browser/lib/browser-helper/bridge.ts`

Those paths are listed in `.oxfmtrc.json` `ignorePatterns`. lint-staged passes `oxfmt --no-error-on-unmatched-pattern` so a commit that stages only ignored files still succeeds.

### `prettier-ignore` usage

oxfmt honors Prettier ignore comments. The only committed use at ship is `.agents/skills/atmos-specs-view/SKILL.md`: a mermaid HTML fence must stay multi-line (oxfmt otherwise flattens it onto one line and the example no longer renders). Protected with `<!-- prettier-ignore -->` immediately above the fence. A scan of every `*.md` / `*.mdx` in the format commit found no other flattened HTML/mermaid blocks.

## CI / justfile / lint-staged / AGENTS.md integration

| Surface                                    | Behavior                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root scripts                               | `lint`: `oxlint --max-warnings=1401`; `lint:web`: `oxlint apps/web`; `fmt` / `fmt:check`: oxfmt on `**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,css,json,jsonc,md,mdx}`                                                   |
| `just lint`                                | `bun lint` then `cargo clippy --workspace`                                                                                                                                                                        |
| `just fmt` / `just fmt-check`              | `bun run fmt` / `fmt:check` then `cargo fmt`                                                                                                                                                                      |
| `CI - JS` (always-on)                      | job `oxlint` → `bun lint`; job `oxfmt` → `bun run fmt:check`                                                                                                                                                      |
| `CI - Web` / Landing / Docs / Packages     | path filters include `.oxlintrc.jsonc` and `.oxfmtrc.json`; web lint is `bun --filter web lint`; packages lint is `bunx oxlint packages`                                                                          |
| `lint-staged.config.mjs`                   | staged `*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`: `oxlint --fix` then `oxfmt --no-error-on-unmatched-pattern`; staged CSS/JSON/MD: oxfmt only; staged `*.rs`: `cargo fmt`; `packages/shared` TS: APP-050 boundary check |
| `.husky/pre-commit`                        | `bunx lint-staged` (not full CI)                                                                                                                                                                                  |
| Root `AGENTS.md` / `CLAUDE.md` / `WARP.md` | oxc subsection: agents run oxlint/oxfmt **only on changed files**; do not `just fmt` the whole tree unless the task is an explicit repo-wide format                                                               |
| `CONTRIBUTING.md`                          | documents the hook                                                                                                                                                                                                |
| `packages/config/AGENTS.md`                | lint/format live at repo root; do not put oxlint/oxfmt/ESLint configs in this package                                                                                                                             |

`.git-blame-ignore-revs` lists **`2067be8bc495938c95d5692a7623742cd1294305`**, the squash commit of `#309`. The pre-squash format-only SHA `a480be45a` is not on `main`. Enable locally: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Boundary (untouched)

| Layer                                              | Status                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (web / landing / docs) transform           | Untouched. oxlint/oxfmt are CI/dev gates, not the bundler.                                                                        |
| Metro (mobile)                                     | Untouched. Metro `require(...)` for assets stays; rule is warn on `apps/mobile/**`.                                               |
| Vite (where used, e.g. `@workspace/ui` type edges) | Untouched. `no-explicit-any` off on the three published-type files so Next `StaticImageData` vs Vite string URL still typechecks. |
| Rust (`cargo clippy` / `cargo fmt`)                | Untouched besides `just lint` / `just fmt` still chaining them after the JS tools.                                                |
| QUALITY-005 TypeScript 7 dual-package              | Untouched. `typescript@6` remains for programmatic API (Next, etc.); `@typescript/native` remains `tsc` 7.                        |

## Module-by-module design

### Root

- `package.json` `devDependencies`: `oxlint@1.88.0`, `oxfmt@0.73.0`. No `eslint`, `eslint-config-next`, `prettier`.
- `.oxlintrc.jsonc`, `.oxfmtrc.json`, `lint-staged.config.mjs`, `.git-blame-ignore-revs`.

### Apps

- `apps/web`, `apps/landing`, `apps/docs`, `apps/mobile`, `apps/desktop-electron`: `lint` script is `oxlint .`.
- `apps/mobile/.oxfmtrc.json` for Tailwind stylesheet path.
- Deprecated Tauri (`apps/desktop/src-tauri`) ignored.

### Packages / e2e / scripts / extension

- Covered by the root config. `e2e` has `oxlint .`. `vendor/serve-sim` keeps its own optional oxlint pin and is ignored by root ignorePatterns.

### Tests that had to follow oxfmt

- Web source-snapshot tests updated for Tailwind class order and quote style.
- E2E click workarounds (not product fixes): see Follow-ups.

## Data model

No database, WebSocket, or runtime schema changes.

New durable artifacts:

| Artifact                      | Purpose                          |
| ----------------------------- | -------------------------------- |
| `.oxlintrc.jsonc`             | Root allowlist + overrides       |
| `.oxfmtrc.json`               | Root formatter + ignore list     |
| `apps/mobile/.oxfmtrc.json`   | Mobile Tailwind sort stylesheet  |
| `lint-staged.config.mjs`      | Staged oxlint/oxfmt/cargo fmt    |
| `.github/workflows/ci-js.yml` | Always-on oxlint + oxfmt --check |
| `.git-blame-ignore-revs`      | Squash SHA of `#309`             |

## Transport

None. This upgrade does not add REST or WebSocket surfaces.

## Security & permissions

- No new secrets.
- CodeQL: 13 files excluded from oxfmt so whitespace-only diffs do not open new alerts. Follow-up is to re-format them with an explicit CodeQL baseline, not to hide real issues.
- Do not commit npm tokens.

## Rollout plan

Shipped as one squash on `main` (`2067be8bc`, `#309`). Historical steps inside that PR:

1. Tooling + oxlint allowlist + CI/just/lint-staged/AGENTS + targeted lint fixes.
2. Whole-repo oxfmt (blame-ignore).
3. Restore lazy-`require` suppressions after wrap; restore CodeQL-flagged files; skip them in oxfmt.
4. Source-snapshot tests after class/quote order; keep motion/png `any` for `@workspace/ui` typecheck.
5. E2E: Graph History landing-row native click; xterm helper native focus; mermaid `prettier-ignore`; `--max-warnings=1401`.

This spec PR only records the as-built design and points blame-ignore at the squash SHA.

## Risks & tradeoffs

| Risk                                                    | Mitigation                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| oxfmt Tailwind class sort changes visual layout         | Visual comparison vs pre-merge `main` (TEST S9); no class-sort regressions found                                                                               |
| CodeQL false-new alerts on whitespace                   | 13 files restored + ignored; lint-staged `--no-error-on-unmatched-pattern`                                                                                     |
| Warning inventory grows                                 | `--max-warnings=1401` fails CI on any new warning                                                                                                              |
| Agents run whole-repo `just fmt`                        | AGENTS.md: changed files only                                                                                                                                  |
| `react/prop-types` gone                                 | TypeScript + React 19; not implemented in oxlint                                                                                                               |
| Blame-ignore of the **entire squash** (not format-only) | `a480be45a` is not on `main`; ignore `2067be8bc` so `git blame` still skips the mass reformat. Tooling-only lines in that squash are also skipped — acceptable |
| Playwright click flakes after format                    | Tests use native `evaluate` click / focus; product pointer-interception remains a follow-up                                                                    |

**Tradeoff chosen:** native oxlint + oxfmt now beats Biome (Compiler/Next gap) and beats keeping ESLint (the slow job).

**Rollback path:** revert `2067be8bc` (and this spec). No data migration. ESLint configs are gone from git history on `main` except via that revert.

## Dependencies & compatibility

- Depends on: oxlint 1.88.0 (native React Compiler rules), oxfmt 0.73.0 (Tailwind v4 `sortTailwindcss`).
- Soft-depends on: QUALITY-005 dual-package TypeScript (unchanged).
- Blocks: none.
- Unblocks: fast JS lint in CI, a working formatter, packages/mobile/e2e in the same gate as web.
- Shipped by: `#309`.

## Follow-ups

- **Lower `--max-warnings` progressively.** Every PR that deletes warnings should drop the cap by that count. Do not wait for a “zero warnings” project.
- **Regress the 13 CodeQL-excluded files back into oxfmt** after an explicit CodeQL baseline / confirmed false-positive, so they do not forever drift from house style.
- **Fix the real UI pointer-interception issues** that the E2E click workarounds papered over:
  - Changes sidecar **plus trigger** intercepts pointer events meant for the Graph History landing row / scope dropdown (Playwright hover opens the plus menu).
  - xterm **canvas** sits over `textarea.xterm-helper-textarea`, so Playwright `click()` never reaches the helper.
    Tests now Escape any open plus menu and native-click / native-focus via `evaluate`. That is a harness patch, not a product fix.

## Open questions

- [x] oxlint vs Biome vs ESLint hybrid — **resolved:** native oxlint 1.88 + oxfmt 0.73; ESLint removed entirely.
- [x] Warning policy — **resolved:** `--max-warnings=1401` ratchet, not a global warn disable.
- [x] CodeQL whitespace alerts — **resolved for ship:** 13 files ignored; re-include is a follow-up.
- [x] Blame-ignore SHA after squash — **resolved in this spec PR:** `.git-blame-ignore-revs` points at `2067be8bc`.
