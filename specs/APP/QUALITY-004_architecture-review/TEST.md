# QUALITY-004 Architecture Review — Verification Contract

## Scope

This spec is an audit + roadmap; the "implementation" is the remediation phases in `TECH.md` Part 3. This file records (1) how to re-verify the audit's factual claims and (2) the regression gates each remediation phase must keep green.

## Re-verifying audit claims

Each High/Medium finding is reproducible from a clean checkout:

| Finding | Command | Expected signal (as of 2026-07-02) |
|---|---|---|
| F-01 layering bypass | `rg -c 'use (infra\|core_engine\|agent\|llm\|quota_usage\|token_usage\|local_model_runtime)' apps/api/src` | 23 direct lower-layer import statements |
| F-02 contract drift | `awk '/pub enum WsAction/,/^}/' apps/api/src/api/ws/message.rs \| rg -c '^\s+[A-Z][A-Za-z0-9]*,?$'` vs the web union in `use-websocket.ts` | 201 Rust variants; web union missing `terminal_workspace_candidates` |
| F-03 web monolith | `find apps/web/src \( -name '*.ts' -o -name '*.tsx' \) -exec wc -l {} + \| awk '$1>800 && $2!="total"' \| wc -l` | 37 files > 800 lines |
| F-04 CI gaps | `rg -l 'bun test' .github/workflows/` ; `rg -l 'apps/mobile' .github/workflows/` | both empty |
| F-05 god-crate | `find crates/core-service -name '*.rs' \| xargs wc -l \| tail -1` | 23,336 LOC |
| F-06 entity leak | `rg -n 'infra::db::entities' apps/api/src` | hits in project handlers + ws workspace DTOs |
| F-08 dead deps | `rg -c 'quota_usage\|local_model_runtime' crates/core-service/src` | 0 |
| F-09 relay dup | compare `RelayEnvelope` in `apps/api/src/relay/ingest.rs` and `packages/relay/src/server-hub.ts` | same shape, two definitions |
| F-11 dead machinery | `rg -l '"catalog:' apps packages --glob 'package.json'` ; `rg -l '@atmos/config' apps/*/tsconfig.json` | both empty |
| F-14 doc dup | `diff AGENTS.md CLAUDE.md` | no output (identical) |
| F-20 ui barrel | `rg -n 'export \* from "(lucide-react\|@dnd-kit\|react-resizable-panels)' packages/ui/src/index.ts` ; `rg -c '"sideEffects"' packages/ui/package.json` | barrel `export *`s 6 third-party entries; 0 `sideEffects` field |
| F-20 heavy deps | `rg -rn 'PixelBlast\|MorphSurface' apps packages --glob '*.ts*'` ; `rg '"lucide-react":' apps/*/package.json packages/ui/package.json` | 0 consumers of the `three` components; lucide split `^1.8.0` vs `^0.562/0.563` |

## Regression gates per remediation phase

All phases: `just test` (`bun test` + `cargo test --workspace`) and `just test-e2e-smoke` must pass before and after each landed chunk.

### Phase 0 (gates & cleanup)

- New `ci.yml` runs green on a no-op PR touching only a README (proves always-on).
- `bun test` in CI reports the same file count as local (67 at time of audit; triage, do not skip, any newly surfaced failures on mobile/relay).
- After deleting core-service dead deps: `cargo check -p core-service` and `cargo test --workspace` unchanged.
- After `packages/relay` → `apps/relay`: `wrangler deploy --dry-run` (or `wrangler versions upload --dry-run`) succeeds from the new path; `deploy-relay.yml` path filters updated and workflow lints clean.
- After catalog adoption: `bun install --frozen-lockfile` succeeds; `bun run typecheck` green; no version resolution changes except the intended unifications (check `bun.lock` diff).
- After `packages/ui` on-demand guards (F-20): `bun run typecheck` green across ui/web/landing/docs; `next build` succeeds for web/landing/docs; First Load JS captured as the baseline for Phase 3 comparison; eslint reports bare `@workspace/ui` imports as warnings (rule active, not yet error).

### Phase 1 (contract codegen)

- CI diff gate: regenerating `@atmos/protocol` from Rust produces zero diff against the committed artifact.
- Web/mobile migration is type-level only: `bun run typecheck` green in web and mobile; the previously drifted action (`terminal_workspace_candidates`) now present in the shared union.
- Relay envelope: a round-trip serde test in `apps/api/src/relay` deserializes a fixture produced from the shared schema; same fixture validated in `packages/relay` bun tests.
- E2E smoke (onboarding + app-shell suites) green — these exercise the live WS bootstrap path end to end.

### Phase 2 (backend layering)

- Per router migration (git, github, workspace_setup, local_model, skills, settings): existing `cargo test -p api` and `-p core-service` green; WS action behavior verified via the e2e smoke suites that touch it; no change to `message.rs` DTO shapes (protocol frozen during the move).
- End-state assertions: `rg -c 'use (infra|core_engine|agent|llm|quota_usage|token_usage|local_model_runtime)' apps/api/src` trends to ~0; `apps/api/Cargo.toml` path deps reduced to core-service + runtime-manager.
- After infra util relocation: `cargo test --workspace` green; API startup (`just dev-api`) still performs skill sync (manual smoke: `logs` show sync ran).

### Phase 3 (frontend structure)

- Boundary lint promoted to error only when violation count is 0: `bun lint` green.
- File-size ratchet: audit command from QUALITY-001 shows no file above the error threshold.
- App-shell dissolution chunks each pass `bun run typecheck` + affected e2e smoke suites (app-shell-navigation, settings-modal).
- `packages/ui` barrel diet (F-20): after removing third-party `export *` and repointing consumers, `bun run typecheck` green across ui/web/landing/docs; web `next build` First Load JS ≤ Phase-0 baseline; `just test-e2e-smoke` green; `rg -c 'from "@workspace/ui"$' apps` (bare barrel) trends to 0; after deleting the `three` components `rg -rn 'PixelBlast|MorphSurface' apps packages` returns 0 and `bun install` drops `three`/`postprocessing`; the bare-barrel eslint rule flips to error only when the violation count is 0.

## Acceptance criteria

- Every High finding (F-01…F-05) has either a landed fix or a tracked decision in this spec's `PROGRESS.md`/`REVIEW.md` before the repo's public release.
- CI enforces at minimum: TS typecheck (all workspaces), `bun test`, cargo fmt/clippy/test (including cli paths), relay tests pre-deploy.
- The re-verification table above, re-run after remediation, shows the expected post-fix signals (0 dead deps, 0 catalog gaps, protocol diff gate green).
- `packages/ui` (F-20): `sideEffects` set, root barrel free of third-party `export *`, no bare `@workspace/ui` imports remain (eslint at error), and unused `three` components/deps removed.

## Non-coverage

- No performance benchmarking (compile times, CI wall-time) was captured in this audit; add baseline numbers before Phase 2 if compile time becomes a concern.
- Desktop Tauri native modules (appshot, preview_bridge) were mapped but not audited in depth; the desktop crate is also excluded from CI clippy/test (see F-04) — coverage there remains a known gap.
- `marketing/` and `apps/landing`/`apps/docs` content quality out of scope.

## Coverage Status

- 2026-07-02: Audit completed; findings verified against the tree with the commands in the re-verification table. No remediation implemented yet; all phase gates pending.
- 2026-07-02: Added F-20 (`packages/ui` on-demand exports) after a focused deep-dive; evidence measured against the tree (barrel `export *` of 6 third-party entries, 0 `sideEffects` field, 0 consumers of the `three` components, lucide `^1.8.0` vs `^0.562/0.563` split). Remediation folded into Phase 0 (guards) and Phase 3 (barrel diet); gates pending.
