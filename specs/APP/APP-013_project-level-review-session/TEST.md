# TEST · APP-013: Project-Level Review Session

> Test Plan · how we verify that a user on a Project route can create, view, comment on, and AI-fix a review session against the Project's main checkout, while the existing Workspace flow stays untouched. References PRD APP-013 and TECH APP-013.

## Test strategy

The feature is mostly a **shape-change** (new schema nullability + new `ReviewTarget` plumbing) wrapped around already-tested review logic. Most coverage lives in cheap layers; only the glue gets E2E:

- **Unit / integration (Rust)** — `resolve_repo_context` (workspace branch, project happy, project fallback, project hard-fail), the new repo method `list_sessions_by_project`, and the WS handler validator `parse_target`. Run via `cargo test -p infra` and `cargo test -p core-service`.
- **Migration test** — verify the new migration applies on a freshly seeded DB (with both empty and pre-existing review_session rows) and that `down()` is safe. Run via `cargo test -p infra`.
- **Frontend unit (Vitest / `bun test`)** — `RightSidebar`'s `reviewTarget` derivation from URL params, `ReviewContextProvider` accepting `target` instead of `workspaceId`, `ReviewView` empty-state copy, N2 badge rendering. Avoid full UI mounts; prefer hook-level tests.
- **Manual end-to-end smoke** — a single scripted run on a real local Atmos instance covering the full happy path on both project and workspace scopes, plus the coexistence and `target_branch=NULL` edge cases. No Playwright needed; the surface is small and the cost of authoring a Playwright spec for one feature exceeds the value here.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 — Create project session | S1, S10 |
| M2 — base_ref resolution with fallback | S2, S3, S4 |
| M3 — Empty-changeset error | S5 |
| M4 — Full review surface for project sessions | S6 |
| M5 — Project route lists only project sessions | S7 |
| M6 — Workspace flow unchanged | S8 |
| M7 — Coexistence | S9 |
| M8 — AI fix write-back parity | S6 (signal: working-tree mutation observed) |
| N2 — Scope badge | S11 |
| Migration | S12 |
| WS payload validation | S10 |

## Scenarios

### S1 — Happy path: user creates a project-scoped review session

- **Level**: Manual E2E + Service-level integration test backing it.
- **Given**: a Project whose `main_file_path` is a clean git repo on branch `main` with `target_branch="main"` set in the DB. The user has made one uncommitted edit to a tracked file. The user is on the project route in the web app, with no workspace selected.
- **When**: the user opens the right sidebar's Review tab and clicks "New Review Session".
- **Then**:
  - A new `review_session` row is inserted with `workspace_guid IS NULL`, `project_guid = <project>`, `repo_path = project.main_file_path`, `base_ref = "main"`.
  - The Review tab UI replaces the empty state with the session header, "Changed Files" group containing the edited file, and an empty "Comments" group.
  - Identical "New Review Session" flow on the workspace route still creates a `workspace_guid`-set session (regression covered by S8).
- **Signals**: DB row inspection, WS frame `review_session_create` request + response payload, DOM has `[data-test=review-session-header]` (or equivalent), no error toast.

### S2 — base_ref happy: target_branch is set on the project

- **Level**: Service-level Rust test on `resolve_repo_context(ReviewTarget::Project { ... })`.
- **Given**: a project row with `target_branch = Some("main")` and a git repo at its `main_file_path`.
- **When**: `resolve_repo_context` is called.
- **Then**: returns `RepoContext { base_ref: Some("main"), base_ref_origin: ProjectTargetBranch, workspace_guid: None, project_guid, repo_path }`.
- **Signals**: returned struct fields; no `tracing::warn!` line emitted with `target = "review"`.

### S3 — base_ref fallback: target_branch is NULL, origin/HEAD resolves

- **Level**: Service-level Rust test (with a fixture git repo).
- **Given**: a project row with `target_branch = None` and a git repo whose `origin/HEAD` resolves to `main` (use `core_engine::GitEngine::get_default_branch` against a real test-fixture repo).
- **When**: `resolve_repo_context` is called.
- **Then**: returns `base_ref: Some("main"), base_ref_origin: DefaultBranchFallback`. A `tracing::warn!` event with target `"review"` and `project_guid = <id>` is emitted.
- **Signals**: returned struct fields; captured tracing event via `tracing-test` or equivalent.

### S4 — base_ref hard failure: both target_branch and origin/HEAD missing

- **Level**: Service-level Rust test.
- **Given**: a project row with `target_branch = None` and a git repo with no `origin` remote (or use a temp directory with `git init` and no remote).
- **When**: `resolve_repo_context` is called.
- **Then**: returns `Err(ServiceError::Validation(msg))` where `msg` contains a hint pointing the user at the topbar.
- **Signals**: error variant + error message substring assertion.

### S5 — Empty changeset: working tree has no diff vs base_ref

- **Level**: Service-level integration test.
- **Given**: a project on `main` with `target_branch="main"`, no `staged + unstaged + untracked` changes vs `main`.
- **When**: `create_session(ReviewTarget::Project { ... })` is called.
- **Then**: returns `Err(ServiceError::Validation("Cannot create a review session with no changed files"))` — same error string as the existing workspace path.
- **Signals**: error message string match (parity with workspace flow).

### S6 — Full review surface on a project session

- **Level**: Manual E2E (single happy-path run).
- **Given**: an active project-scoped session created via S1.
- **When**: the user (1) leaves an inline comment on a changed file, (2) replies to it, (3) marks the file as reviewed, (4) starts an AI fix run via the existing CodeReview dialog, (5) waits for the run to finalize.
- **Then**:
  - All four review WS messages succeed: `review_comment_create`, `review_message_add`, `review_file_set_reviewed`, `review_agent_run_create` → `review_agent_run_finalize`.
  - The AI fix run mutates files inside `project.main_file_path` (the working tree on the current branch is modified — same behavior as the workspace flow). PRD M8.
  - A new `review_revision` row is created on finalize and the session UI shows the new revision selectable.
- **Signals**: DB rows for `review_comment`, `review_message`, `review_file_state.reviewed=true`, `review_agent_run.status="finalized"`, `review_revision` count incremented; `git status` inside `main_file_path` shows new modifications after the fix run.

### S7 — Project route lists only project-scoped sessions

- **Level**: Service-level Rust test on `list_sessions_by_project`.
- **Given**: a project with one project-scoped session AND two workspace-scoped sessions belonging to workspaces of the same project (all `is_deleted = false`, `status = "active"`).
- **When**: `list_sessions_by_project(project_guid, false)` is called.
- **Then**: returns exactly one DTO — the project-scoped session. Workspace-scoped sessions are not included.
- **Signals**: returned vector length and `workspace_guid` field check.

### S8 — Regression: workspace flow unchanged

- **Level**: Service-level integration test + manual smoke.
- **Given**: a workspace with one uncommitted change in its worktree.
- **When**: `create_session(ReviewTarget::Workspace { ... })` is called and then `list_sessions_by_workspace(...)`.
- **Then**:
  - Created session has `workspace_guid = Some(<ws>)`, `project_guid = <pj>`, `repo_path = <worktree path>`, `base_ref = workspace.base_branch`.
  - `list_sessions_by_workspace` returns the session (existing behavior preserved).
  - On the workspace route, the right-sidebar Review tab renders identically to today (no scope badge unless N2 is enabled, no changed copy, no extra UI).
- **Signals**: DB row shape, list method return, manual UI inspection in dark + light mode (per `apps/web/AGENTS.md`).

### S9 — Coexistence: project session + workspace session active simultaneously

- **Level**: Service-level integration test + manual confirmation.
- **Given**: a project with one active project-scoped session, AND a workspace under the same project with its own active workspace-scoped session, both with comments and an open AI fix run.
- **When**: the user performs operations on each session in any order — add comments, finalize fix runs, mark files reviewed.
- **Then**:
  - Operations on one session never mutate the other (verified by DB row counts before/after).
  - AI fix runs touch only their respective `repo_path` (project session writes to `project.main_file_path`, workspace session writes to its worktree path).
  - Both `list_sessions_by_project(project_guid, _)` and `list_sessions_by_workspace(workspace_guid, _)` continue to return their own session unchanged.
- **Signals**: DB row counts per session, `git status` in both repo paths, no cross-session WS notifications received.

### S10 — Failure: WS payload validation in `parse_target`

- **Level**: Unit test on `parse_target` in `crates/core-service/src/service/ws_message.rs`.
- **Given**: four payload variants for `ReviewSessionCreateRequest` / `ReviewSessionListRequest`:
  1. `{ workspace_guid: "ws-1" }` — workspace-only.
  2. `{ project_guid: "pj-1" }` — project-only.
  3. `{ workspace_guid: "ws-1", project_guid: "pj-1" }` — both set.
  4. `{}` — neither set.
- **When**: `parse_target` is called on each.
- **Then**:
  - (1) returns `Ok(ReviewTarget::Workspace { workspace_guid: "ws-1" })`.
  - (2) returns `Ok(ReviewTarget::Project { project_guid: "pj-1" })`.
  - (3) returns `Err(ServiceError::Validation("Specify exactly one of workspace_guid or project_guid"))`.
  - (4) returns `Err(ServiceError::Validation("workspace_guid or project_guid is required"))`.
- **Signals**: enum variant assertion, error message substring.

### S11 — N2: scope badge in session header

- **Level**: Frontend unit test (Vitest) on the session header sub-component.
- **Given**: two `ReviewSessionDto` fixtures — one with `workspace_guid: null` (project), one with `workspace_guid: "ws-1"` (workspace).
- **When**: the session header renders with each fixture as `currentSession`.
- **Then**: project fixture renders a badge containing the text `Project`; workspace fixture renders a badge containing `Workspace`. Verify both render correctly in `dark` and `light` data-attribute modes (per `apps/web/AGENTS.md` theme rule).
- **Signals**: rendered DOM text and `data-theme` attribute walk-through.

### S12 — Migration: applies on fresh and seeded DB

- **Level**: Integration test in `crates/infra` migration test harness.
- **Given**:
  1. A fresh in-memory SQLite DB.
  2. A DB seeded with one `review_session` row produced by the existing `m20260422_000019` migration (`workspace_guid` non-null, all indices in place).
- **When**: `m20260507_000023_make_review_session_workspace_optional::up()` runs against each.
- **Then**:
  - On both DBs the column is now nullable; indices `idx-review_session-workspace-status-updated` and `idx-review_session-project-status-updated` exist; old `idx-review_session-workspace-updated` is gone.
  - Existing seeded row is unchanged (`workspace_guid` value preserved, `project_guid` preserved).
  - `down()` then `up()` round-trip is idempotent (no error, no duplicate-index error).
- **Signals**: `sea-orm` schema introspection, row equality.

## Performance & load budgets

This change is not on a hot path — review sessions are created/listed at human cadence. Two soft budgets reused from existing review behavior:

- `list_sessions_by_project` returns within 200ms p95 for a project with up to 100 sessions (parity with `list_sessions_by_workspace`).
- `create_session` for a project with ≤ 200 changed files completes within 2s p95 (matches existing workspace-flow expectation; the bottleneck is `git_engine.get_changed_files`, not the new code).

## Regression checklist

Things that have broken near this surface before, or are fragile in this change:

- [ ] **Migration safety**: existing user DBs (with all `workspace_guid` non-null) survive `up()` and don't choke on the index swap. Verify on both SQLite (default) and Postgres if the project supports it.
- [ ] **No leak of NULL `workspace_guid` into workspace routes**: `RightSidebar` on a workspace URL never derives `target.kind = "project"`. If `workspaceId` is set, that wins.
- [ ] **CodeReviewDialog**: the auto-create flow still picks the right `ReviewTarget` based on the surrounding context; doesn't accidentally create a project-scoped session when invoked from a workspace.
- [ ] **Editor synthetic key**: opening a project-scoped review file via `EDITOR_REVIEW_DIFF_PREFIX` doesn't pollute regular tab listings or break tab restoration after refresh (per TECH risk).
- [ ] **`session.repo_path` is the source of truth** for downstream code; no path is rebuilt from `workspace.name` when it should be read directly from `session.repo_path`.
- [ ] **WS payload backward compatibility**: a payload sent with only `workspace_guid` (the shape used by today's clients before this change ships) still works. Even though we ship client+server together, this protects against any cached or stale frontend bundle in dev.
- [ ] **Theme**: scope badge (N2) rendered correctly in both light and dark modes (per `apps/web/AGENTS.md`).

## Acceptance criteria

Binary. Merge-blocking.

- [ ] Every PRD Must Have (M1–M8) and the chosen Nice to Have (N2) is covered by at least one passing scenario in this plan.
- [ ] All Rust scenarios (S2, S3, S4, S5, S7, S8, S9, S10, S12) pass via `cargo test --workspace` (or scoped `cargo test -p infra` / `cargo test -p core-service`).
- [ ] All frontend scenarios (S11) pass via `bun test`.
- [ ] Manual smoke (S1, S6, S8 visual side, S9 visual side) executed once on the developer's local Atmos against a real git project, with results recorded in the PR description.
- [ ] `just lint` passes on every changed crate and on `apps/web`.
- [ ] No new REST endpoints — review continues to be 100% WebSocket (per root `AGENTS.md` Transport Rules).
- [ ] No tracing log line at level `error` from review-session creation in the smoke run; the `DefaultBranchFallback` path emits exactly one `warn` line per occurrence.

## Manual verification steps

Automation can't reasonably mock a real git repo + AI fix run + UI workflow at the cost-effective level for this single feature, so the following are manual:

1. **Project happy path (S1, S6)**: open Atmos web, navigate to a project route (no workspace selected), edit a file, open the right-sidebar Review tab, click "New Review Session". Verify the session appears and contains the changed file. Add a comment, run an AI fix via the CodeReview dialog, and verify the working tree on the project's current branch is mutated by the fix run.
2. **Coexistence (S9)**: with the project session from step 1 still active, switch to a workspace under the same project, repeat the happy path on the workspace route. Verify (a) workspace Review tab shows ONLY the workspace session — no project session leaks here, and (b) project Review tab shows ONLY the project session.
3. **target_branch=NULL fallback (S3)**: in the dev DB, manually `UPDATE project SET target_branch = NULL WHERE guid = '<test-project>';` and try to create a project session. Verify the session creates successfully and a `tracing::warn!` line with `target="review"` appears in `./logs/debug/`.
4. **target_branch=NULL hard fail (S4)**: on a project whose git repo has no `origin` remote AND `target_branch = NULL`, attempt to create a project session. Verify a user-visible validation error explains the fix.
5. **Workspace regression (S8 visual)**: run through your normal workspace review flow once and confirm zero observable change in behavior.
6. **Theme (regression checklist)**: toggle between light and dark mode while a project session is open; the new scope badge and any modified empty-state copy must render legibly in both.

## Non-coverage

Deliberately out of scope for this round; will need their own scenarios when added later.

- **Aggregated project review** (showing a roll-up of workspace sessions on the project route) — explicitly out of PRD scope.
- **Cross-scope hints** in the workspace Review tab — explicitly out of PRD scope.
- **Protected-branch guard** preventing AI fix runs from writing to `main` — listed as a future enhancement (N1, deferred).
- **Multi-tenant authorization** — Atmos is single-user / local-first today; adding scope visibility checks across users is a separate concern.
- **Hosted Postgres `CREATE INDEX CONCURRENTLY`** — TECH calls this out as out of scope; verified only against the local SQLite path.

---

## Coverage Status

> Appended after implementation run on 2026-05-07.

| Scenario | Level | Test file / name | Status |
|----------|-------|-----------------|--------|
| S1 — Happy path: user creates a project-scoped review session | Manual E2E | — | **Manual** — requires a running Atmos instance with a real git project. See "Manual verification steps" §1. |
| S2 — base_ref happy: target_branch is set | Rust unit | `crates/core-service/src/service/review.rs` → `tests::s2_resolve_repo_context_project_target_branch` | ✅ Automated |
| S3 — base_ref fallback: target_branch NULL, origin/HEAD resolves | Rust unit | `crates/core-service/src/service/review.rs` → `tests::s3_resolve_repo_context_fallback_to_default_branch` | ✅ Automated |
| S4 — base_ref hard failure: both missing | Rust unit | `crates/core-service/src/service/review.rs` → `tests::s4_resolve_repo_context_hard_fail` | ✅ Automated |
| S5 — Empty changeset error | Rust integration | `crates/core-service/src/service/review.rs` → `tests::s5_create_session_empty_changeset` | ✅ Automated |
| S6 — Full review surface on a project session | Manual E2E | — | **Manual** — requires a running Atmos instance. See "Manual verification steps" §1. |
| S7 — Project route lists only project-scoped sessions | Rust unit | `crates/core-service/src/service/review.rs` → `tests::s7_list_sessions_by_project_excludes_workspace_sessions` | ✅ Automated |
| S8 — Regression: workspace flow unchanged | Rust unit + Manual | `crates/core-service/src/service/review.rs` → `tests::s8_workspace_session_has_workspace_guid` (automated); visual side requires running instance | ✅ Automated (logic) / **Manual** (visual) |
| S9 — Coexistence: project + workspace sessions active simultaneously | Rust unit + Manual | `crates/core-service/src/service/review.rs` → `tests::s9_project_and_workspace_sessions_coexist` (automated); visual side requires running instance | ✅ Automated (logic) / **Manual** (visual) |
| S10 — WS payload validation in `parse_target` | Rust unit | `crates/core-service/src/service/ws_message.rs` → `tests::s10_parse_target_*` (4 tests) | ✅ Automated |
| S11 — N2: scope badge in session header | Frontend unit | `apps/web/src/components/diff/__tests__/ReviewView.scope-badge.test.ts` | ✅ Automated |
| S12 — Migration: applies on fresh and seeded DB | Rust integration | `crates/infra/src/db/migration/mod.rs` → `tests::s12_migration_applies_on_fresh_db`, `tests::s12_migration_applies_on_seeded_db_preserves_existing_rows` | ✅ Automated |

### Test commands

```bash
# Rust tests (all scenarios except S1, S6, S8 visual, S9 visual)
cargo test -p infra -p core-service

# Frontend tests (S11)
bun test
```

### Manual scenarios pending human smoke-test

- **S1** — Create a project-scoped session from the project route in a real Atmos instance.
- **S6** — Full review surface: comment, reply, mark reviewed, AI fix run, verify working tree mutation.
- **S8 (visual)** — Workspace Review tab renders identically to before; no scope badge regression; test in both light and dark mode.
- **S9 (visual)** — Project and workspace sessions coexist; each route shows only its own session.
