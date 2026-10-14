# TEST · QUALITY-007: oxc Lint + Format Toolchain

> Test Plan · prove the oxlint + oxfmt cutover does not change product behavior, and that CI actually gates on oxc (errors, warning cap, format check). References TECH QUALITY-007. Implementation shipped in `#309` / `2067be8bc`; this file records the contract and the verification already run.

## Test strategy

This is a toolchain upgrade. The primary risk is **silent product breakage** from Tailwind class reordering, quote/wrap changes, or dropped ESLint rules. The secondary risk is **claiming an oxc cutover while CI still runs ESLint, or while warnings/format drift with no gate**.

Verification layers:

- **CI gates** — oxlint errors fail; warnings above `--max-warnings=1401` fail; `oxfmt --check` on the configured glob fails. These are merge-blocking.
- **Local commands** — `bun lint`, `bun run fmt:check`, `just lint` / `just fmt-check` match CI.
- **Config audit** — no leftover ESLint/Prettier; root configs exist; blame-ignore points at the squash SHA.
- **Automated product regression** — existing Bun tests, Playwright smoke/specs (including the native-click E2E patches).
- **Visual comparison** — Playwright + Chrome walkthrough of this branch vs `main` worktree; side-by-side screenshots. This is how we prove oxfmt class sort did not blank or shift UI.
- **Exploratory agent-browser** — short UI smoke only; not the source of truth for lint correctness.
- **Manual** — mermaid `prettier-ignore` fence stays multi-line after oxfmt.

## Coverage map

| Requirement (from TECH)                    | Scenario IDs |
| ------------------------------------------ | ------------ |
| oxlint is the JS/TS linter; errors fail CI | S1, S2       |
| `--max-warnings=1401` ratchet              | S3, S4       |
| oxfmt `--check` fails CI on drift          | S5, S6       |
| Local commands match CI                    | S7, S8       |
| ESLint / Prettier gone; one root config    | S9           |
| CodeQL-excluded files skipped by oxfmt     | S10          |
| `prettier-ignore` mermaid fence            | S11          |
| Blame-ignore squash SHA of `#309`          | S12          |
| lint-staged / AGENTS changed-files policy  | S13          |
| Next / Metro / Vite / Rust untouched       | S14          |
| Product behavior unchanged (automated)     | S15, S16     |
| Visual comparison vs `main`                | S17          |
| Timings in the quality-target ballpark     | S18          |

## Execution map

| Scenario | Level          | Expected tool       | Target command / method                                                     | Fixture / data               | Signals                                                              | Status  |
| -------- | -------------- | ------------------- | --------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------- |
| S1       | CI / toolchain | GitHub Actions      | `.github/workflows/ci-js.yml` job `oxlint` → `bun lint`                     | PR / push to `main`          | Job fails on oxlint **error**                                        | covered |
| S2       | Toolchain      | Shell               | inject a `no-var` / `typescript/no-explicit-any` error in a tracked TS file | dirty tree, revert after     | `bun lint` exit 1                                                    | covered |
| S3       | CI / toolchain | Shell               | `oxlint --max-warnings=1401` vs `1400`                                      | clean tree at ship inventory | 1401 exits 0; 1400 exits 1                                           | covered |
| S4       | CI             | GitHub Actions      | `CI - JS` oxlint                                                            | PR                           | new warning fails the job                                            | covered |
| S5       | CI / toolchain | Shell               | `bun run fmt:check`                                                         | clean formatted tree         | exit 0                                                               | covered |
| S6       | CI / toolchain | Shell               | unwrap one formatted file, rerun `fmt:check`                                | dirty tree, revert after     | exit 1; `CI - JS` oxfmt job would fail                               | covered |
| S7       | Local          | Shell               | `bun lint` / `just lint`                                                    | clean install                | 0 errors; warning count ≤ 1401                                       | covered |
| S8       | Local          | Shell               | `bun run fmt:check` / `just fmt-check`                                      | clean install                | oxfmt --check green (cargo fmt separate)                             | covered |
| S9       | Config audit   | ripgrep             | `rg` for `eslint.config` / `prettier` deps                                  | full tree                    | no app ESLint/Prettier configs; oxlint/oxfmt at root                 | covered |
| S10      | Config         | Shell               | `oxfmt --check` on one of the 13 ignored paths                              | those files                  | unmatched / skipped; file bytes unchanged                            | covered |
| S11      | Docs           | oxfmt               | `oxfmt` on `.agents/skills/atmos-specs-view/SKILL.md`                       | mermaid HTML fence           | fence stays multi-line below `<!-- prettier-ignore -->`              | covered |
| S12      | Config         | File                | `.git-blame-ignore-revs`                                                    | `main` after squash          | SHA `2067be8bc495938c95d5692a7623742cd1294305`; comment names `#309` | covered |
| S13      | Hook           | Review              | `lint-staged.config.mjs` + `AGENTS.md`                                      | n/a                          | staged oxlint --fix + oxfmt; agents: changed files only              | covered |
| S14      | Boundary       | Review              | Next/Metro/Vite/Rust configs vs `#309` diff                                 | n/a                          | no bundler/Rust toolchain swap                                       | covered |
| S15      | Regression     | Bun                 | `bun --filter web test` (and package tests as CI)                           | existing fixtures            | no new failures attributable to oxc                                  | covered |
| S16      | E2E            | Playwright          | `just test-e2e-smoke` + specs (Graph History, APP-066 S18)                  | e2e harness                  | smoke + specs green; native evaluate click/focus                     | covered |
| S17      | Visual         | Playwright + Chrome | side-by-side vs `main` worktree                                             | web/landing/docs             | no blank screens; no Tailwind layout diffs                           | covered |
| S18      | Performance    | Shell               | time `oxlint apps/web` and `CI - JS` tool logs                              | same machine class as TECH   | web ~1.26s local vs 63.3s; CI tool ~2–3s                             | covered |

## Scenarios

### S1 — oxlint **errors** fail `CI - JS`

- **Level**: CI / toolchain
- **Given**: `CI - JS` job `oxlint` runs `bun lint` (`oxlint --max-warnings=1401`).
- **When**: a tracked file introduces an oxlint **error** (for example `no-var` in TS, or `typescript/no-explicit-any` outside the three UI carve-outs).
- **Then**: the oxlint job exits non-zero and the PR cannot go green.
- **Signals**: Actions log shows oxlint error diagnostics; job failed.

### S2 — local `bun lint` fails on the same error

- **Level**: Toolchain
- **Given**: a clean install.
- **When**: the same error as S1 is introduced locally.
- **Then**: `bun lint` exits 1 before push.
- **Signals**: non-zero exit; error rule name in stdout.

### S3 — warnings over the cap fail (ratchet)

- **Level**: Toolchain
- **Given**: ship inventory is 1401 warnings, 0 errors.
- **When**: `oxlint --max-warnings=1401` vs `oxlint --max-warnings=1400` on that tree.
- **Then**: 1401 exits 0; 1400 exits 1. Adding a **new** warning with the cap unchanged also exits 1.
- **Signals**: exit codes; warning count in oxlint summary.

### S4 — `CI - JS` enforces the cap

- **Level**: CI
- **Given**: root script is `oxlint --max-warnings=1401`.
- **When**: `CI - JS` runs `bun lint`.
- **Then**: any warning count > 1401 fails the oxlint job.
- **Signals**: workflow YAML + job log.

### S5 — `oxfmt --check` is green on a formatted tree

- **Level**: CI / toolchain
- **Given**: files matching the fmt glob are oxfmt-clean (except the 13 ignorePaths).
- **When**: `bun run fmt:check` / `CI - JS` job `oxfmt`.
- **Then**: exit 0.
- **Signals**: oxfmt reports files checked, no diffs.

### S6 — `oxfmt --check` fails CI on drift

- **Level**: CI / toolchain
- **Given**: a file in the glob is rewritten off-style (extra spaces, unsorted `className`).
- **When**: `bun run fmt:check` or the oxfmt CI job.
- **Then**: exit 1. The oxfmt job in `CI - JS` fails the PR.
- **Signals**: oxfmt lists dirty files; Actions job failed.

### S7 — local lint commands

- **Level**: Local
- **Given**: `package.json` / `justfile` from TECH.
- **When**:
  - `bun lint`
  - `bun --filter web lint` / `bun run lint:web`
  - `just lint` (oxlint then clippy)
- **Then**: JS half matches CI (`--max-warnings=1401` at root). Per-app scripts do not pass the cap (app CI jobs lint a subset).
- **Signals**: 0 errors; root warning count ≤ 1401.

### S8 — local format commands

- **Level**: Local
- **Given**: oxfmt 0.73.0 installed.
- **When**: `bun run fmt:check` and `just fmt-check`.
- **Then**: JS/CSS/JSON/MD check matches `CI - JS` oxfmt. `just fmt-check` also runs `cargo fmt --all --check`.
- **Signals**: exit 0 on a clean tree.

### S9 — ESLint and Prettier are gone

- **Level**: Config audit
- **Given**: the cutover PR.
- **When**: searching for `eslint.config.*`, `prettier` as a root/app dependency, and per-app ESLint.
- **Then**: none remain for Atmos apps. Root configs are `.oxlintrc.jsonc` and `.oxfmtrc.json` only.
- **Signals**: `rg` clean except docs mentioning the removal and `vendor/` / ignore notes.

### S10 — 13 CodeQL-excluded files are not rewritten

- **Level**: Config
- **Given**: the 13 paths in TECH (`.oxfmtrc.json` `ignorePatterns`).
- **When**: `oxfmt` / `oxfmt --check` over the repo.
- **Then**: those files are skipped; lint-staged with only those files staged still succeeds (`--no-error-on-unmatched-pattern`).
- **Signals**: file bytes unchanged vs the restored `main` copies; oxfmt does not list them as dirty.

### S11 — `prettier-ignore` keeps the mermaid HTML example multi-line

- **Level**: Docs
- **Given**: `.agents/skills/atmos-specs-view/SKILL.md` has `<!-- prettier-ignore -->` above the mermaid HTML fence.
- **When**: `oxfmt` runs on that file.
- **Then**: the fence stays multi-line (`<div class="mermaid">flowchart TD` on its own line).
- **Signals**: git diff empty for that block after oxfmt.

### S12 — `.git-blame-ignore-revs` names the squash of `#309`

- **Level**: Config
- **Given**: `#309` was squash-merged as `2067be8bc495938c95d5692a7623742cd1294305`.
- **When**: reading `.git-blame-ignore-revs` on this branch / `main` after this spec PR.
- **Then**: it lists that full SHA, with a comment that it is the squash commit of `#309` (the format-only SHA `a480be45a` is not on `main`).
- **Signals**: file contents; `git cat-file -t 2067be8bc` is commit.

### S13 — lint-staged and AGENTS match TECH

- **Level**: Hook / docs
- **Given**: `lint-staged.config.mjs`, `.husky/pre-commit`, root `AGENTS.md`.
- **When**: a contributor stages JS/TS or reads agent instructions.
- **Then**: pre-commit runs `oxlint --fix` then `oxfmt --no-error-on-unmatched-pattern` on staged JS/TS; agents are told to lint/format **only changed paths**.
- **Signals**: config file + AGENTS oxc subsection.

### S14 — bundlers and Rust toolchain unchanged

- **Level**: Boundary
- **Given**: TECH boundary table.
- **When**: reviewing `#309` / this spec PR diff.
- **Then**: Next, Metro, Vite, and `cargo` toolchains are not replaced; `just lint` still chains clippy after oxlint.
- **Signals**: no Next/Expo/Rust version bump in the oxc PR for this purpose.

### S15 — web/package tests still pass

- **Level**: Regression (Bun)
- **Given**: source-snapshot tests updated for oxfmt class/quote order.
- **When**: CI web tests / `bun --filter web test`.
- **Then**: no new failures attributable to oxc (snapshots match new class order).
- **Signals**: CI green; snapshot diffs only from the format commit, already landed.

### S16 — Playwright smoke and the pointer-intercept specs

- **Level**: E2E
- **Given**: QUALITY-003 harness. Graph History landing row and APP-066 S18 xterm helper were flaky under Playwright `click()` because of overlapping hit targets (plus trigger; xterm canvas).
- **When**: `just test-e2e-smoke` and the specs jobs on `#309` @ `85572203b`.
- **Then**: tests pass using native `evaluate` click/focus (and Escape of any plus menu). This does **not** close the product UI follow-up in TECH.
- **Signals**: E2E jobs green on the merge SHA; 35 pass / 0 fail / 3 skipped (desktop release jobs) on `85572203b`.

### S17 — visual comparison vs `main` (method + results)

- **Level**: Visual / manual
- **Given**: draft `#309` @ `85572203b` vs `main` `9e4fc3fe8` in a second worktree, same seeded demo session where possible.
- **When**:
  1. Start web (`:3000`), landing (`:3001`), docs on both trees.
  2. Wait for hydration (do not screenshot during Fast Refresh compile — first shots were black).
  3. Playwright screenshot: web home/Launchpad, workspace + sidebar, Changes, Graph History, terminal, Agent chat, settings/Keyboard; landing homepage; docs `/introduction`.
  4. Chrome walkthrough recording of the branch.
  5. Side-by-side composites (`compare_*.png`) for home, workspace, settings, landing, docs.
- **Then**: no oxfmt/Tailwind class-sort layout break; no blank/white screens after hydration. Headline typewriter copy may differ by frame. Env-only noise (Hub CORS, `AgentAttentionSummaryStore` 404, missing `claude` CLI, empty Graph History in demo git) is **not** an oxc regression.
- **Signals**: walkthrough video; `compare_*.png`; `visual_verify_report.md` (pass on every compared page).

### S18 — measured timings

- **Level**: Performance
- **Given**: TECH quality-target table and **Local timing notes** (Cursor cloud VM: Intel Xeon KVM, 4 cores, `free -h` 15Gi RAM; bash `time` `real` after `bun install`; single invocations; warm/cold cache not isolated).
- **When**: `time oxlint apps/web`, `time bun --filter web lint`, `time oxlint` (repo), `time oxfmt --check "<glob>"`, plus `CI - JS` tool lines.
- **Then**: web lint **63.3s (ESLint, same-session note) → 1.259s / 1.256s** oxlint local; whole-repo oxlint **1.767s** / **1.873s --quiet**; oxfmt --check **1.790s real** (tool 1686ms; range 1.692–1.797s); CI tool time **~2.1s oxlint / ~3.3s oxfmt** (job wall includes `bun install`, not this VM).
- **Signals**: `oxc-timings.log` / `oxc-timings.txt`; Actions “Finished in …s” lines. See TECH Local timing notes.

## Performance & load budgets

| Check                   | Budget                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web` oxlint local | ~1.3s on the Cursor cloud VM in TECH timing notes (was 63.3s ESLint); must stay ≪ old ESLint |
| Whole-repo oxlint local | < 5s on that 4-core VM                                                                       |
| `oxfmt --check` local   | < 5s on ~4500 files on that VM                                                               |
| `CI - JS` tool time     | oxlint + oxfmt each a few seconds; wall dominated by `bun install`                           |
| Warning cap             | exactly the current inventory; never raise without a TECH note                               |

## Regression checklist

- [x] No `eslint.config.*` reintroduced for apps.
- [x] Root `bun lint` uses `--max-warnings=1401` (not unbounded).
- [x] `CI - JS` always-on (no path filter that skips format/lint).
- [x] 13 CodeQL files still in oxfmt `ignorePatterns`.
- [x] Mermaid HTML example still multi-line (`prettier-ignore`).
- [x] lint-staged uses `--no-error-on-unmatched-pattern`.
- [x] Agents instructed to lint/format changed files only.
- [x] `.git-blame-ignore-revs` SHA exists on `main` (squash, not `a480be45a`).
- [x] Next/Metro/Vite/Rust not swapped.
- [x] E2E Graph History / xterm helper still use native evaluate (until product hit-testing is fixed).

## Exploratory agent-browser checks

Use after automated gates. Load Agent Browser via the installed skill or `agent-browser skills get core --full`. If unavailable, follow `specs/references/agent-browser-setup.md` and mark `not_run`.

The `#309` visual pass used Playwright + Chrome instead of Agent Browser (Cloud Agent computer-use). Repeat only if oxfmt class sort changes again:

1. Open local web and confirm Launchpad / workspace chrome after a fresh reload.
2. Open landing + docs homepages; no blank body.
3. Narrow viewport smoke: primary chrome still visible.
4. Any real product bug must become a Bun/Playwright regression if durable.

## Acceptance criteria

Merge-blocking for the **toolchain** (already met on `#309`):

- [x] S1–S6: CI gates (oxlint error, warnings over cap, oxfmt --check) fail closed.
- [x] S7–S8: local commands documented and working.
- [x] S9: ESLint/Prettier removed.
- [x] S10–S12: ignores, prettier-ignore, blame-ignore squash SHA.
- [x] S15–S16: product tests / E2E green on the merge SHA.
- [x] S17: visual comparison recorded; no oxfmt layout regression.
- [x] S18: timings match TECH.
- [x] This spec PR: QUALITY-007 registered; blame-ignore SHA corrected.

## Manual verification steps

1. **Visual comparison (S17)** — method and results above. Re-run only if formatter options or Tailwind sort config change.
2. **Mermaid fence (S11)** — `oxfmt` the specs-view skill; confirm the HTML example is still multi-line.
3. **Wrong-cap sanity** — `oxlint --max-warnings=1400` on a clean tree must fail while 1401 passes (until the inventory drops).

## Non-coverage

- Fixing the product plus-trigger / xterm-canvas hit-testing (TECH follow-up).
- Re-including the 13 CodeQL-excluded files in oxfmt (TECH follow-up).
- Driving warning count to 0 in this spec.
- Full Desktop Electron E2E (no harness change).
- Replacing Next/Metro/Vite with oxc as a bundler.

## Coverage Status

> Filled from `#309` implementation + visual walkthrough (2026-10-14). Spec PR records the contract; it does not re-run the full E2E matrix.

| Scenario | Result | Evidence                                                                                                                                                                                           |
| -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1, S4   | ✅     | `CI - JS` oxlint job on `#309`; green on `85572203b` (35/0/3)                                                                                                                                      |
| S2, S3   | ✅     | `bun lint` 0 errors / 1401 warnings; `--max-warnings=1400` exits 1                                                                                                                                 |
| S5, S6   | ✅     | `CI - JS` oxfmt `--check`; local 1.69–1.80s on 4526 files                                                                                                                                          |
| S7, S8   | ✅     | `just lint` / `just fmt-check` wired; root scripts match CI                                                                                                                                        |
| S9       | ✅     | no app ESLint; `oxlint`/`oxfmt` at root                                                                                                                                                            |
| S10      | ✅     | 13 paths in `.oxfmtrc.json`; restored byte-identical                                                                                                                                               |
| S11      | ✅     | `<!-- prettier-ignore -->` mermaid fence in atmos-specs-view skill                                                                                                                                 |
| S12      | ✅     | this spec PR: blame-ignore `2067be8bc495938c95d5692a7623742cd1294305` (#309 squash)                                                                                                                |
| S13      | ✅     | `lint-staged.config.mjs` + AGENTS oxc subsection                                                                                                                                                   |
| S14      | ✅     | Next/Metro/Vite/Rust not replaced                                                                                                                                                                  |
| S15      | ✅     | web snapshots updated; CI tests green on merge SHA                                                                                                                                                 |
| S16      | ✅     | E2E smoke + specs green; native evaluate click/focus                                                                                                                                               |
| S17      | ✅     | Playwright + Chrome vs `main` `9e4fc3fe8`: home, workspace, Changes, Graph History, terminal, chat, settings, landing, docs — **pass**; no Tailwind layout break; no blank screens after hydration |
| S18      | ✅     | Cursor cloud VM (4-core Xeon KVM, 15Gi RAM): web ESLint **63.3s** → oxlint **1.259s**; CI tool **~2.1s oxlint / ~3.3s oxfmt**. Commands in TECH Local timing notes.                                |

Commands used:

```bash
bun lint                          # oxlint --max-warnings=1401
oxlint --max-warnings=1400        # must fail at ship inventory
bun run fmt:check
bun --filter web lint
just lint
just fmt-check
just test-e2e-smoke
# timings (#309, Cursor cloud VM — see TECH Local timing notes):
#   time oxlint apps/web
#   time bun --filter web lint
#   time oxlint
#   time oxfmt --check "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,css,json,jsonc,md,mdx}"
# visual: Playwright screenshots + Chrome walkthrough vs main worktree
```

Visual comparison pages (all pass vs `main`, no oxfmt regression):

| Page                        | Result                                      |
| --------------------------- | ------------------------------------------- |
| Web home / Launchpad        | pass                                        |
| Web workspace + sidebar     | pass                                        |
| Web Changes                 | pass                                        |
| Web Graph History           | pass (empty “No commits found” is demo git) |
| Web terminal                | pass                                        |
| Web Agent chat              | pass (missing `claude` is env)              |
| Web settings / Keyboard     | pass                                        |
| Landing homepage            | pass                                        |
| Docs homepage /introduction | pass                                        |
