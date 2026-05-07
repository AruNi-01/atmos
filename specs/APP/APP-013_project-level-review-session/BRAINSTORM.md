# Brainstorm · APP-013: Project-Level Review Session

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Today the right sidebar's **Review** tab only renders when a Workspace is selected. The `ReviewContextProvider` requires a `workspaceId`, and `core-service::review::create_session` strictly resolves the repo path through `workspace_repo + git_engine.get_worktree_path(workspace.name)`.

In practice, a non-trivial slice of Atmos users **work directly on a Project** (its `main_file_path` is a real git repo, often on `main`/`master`) and never spawn a workspace/worktree. For those users the Review tab is dead — they have no way to start a review session, leave inline comments, or trigger an AI fix run on changes they made on the project's main checkout.

The data layer already half-anticipates this: `review_session` stores both `workspace_guid` and `project_guid`, plus `repo_path` (decoupled from worktree resolution). What's missing is making `workspace_guid` optional and teaching the service / WS / web layers to operate in a "project-only" mode.

## Goals (draft)

- **Primary**: a user working directly on a Project (no workspace) can create, view, comment on, and AI-fix a review session for the Project's main checkout, end-to-end through the same right-sidebar UI as today.
- **Secondary**: keep the existing workspace-scoped flow 100% backward compatible — no behavior change for current users.
- **Non-goal (this round)**: cross-workspace aggregated review (one session that diffs N workspaces). That's a separate future feature.

## Options

### Option A — `scope` enum on session (preferred shape)

Add a logical `scope` to `review_session`: `Project` or `Workspace`. Storage-wise: make `workspace_guid` nullable; rely on `project_guid` (always set) plus `workspace_guid IS NULL` to mean "project scope". Service exposes a unified `create_session(scope: ReviewScope)`; WS messages carry `scope: { Project { project_guid } | Workspace { workspace_guid } }`.

**Pros**
- One code path for both modes after the scope is resolved into `(repo_path, base_ref, project_guid, workspace_guid?)`.
- Cheap migration (nullability change + index tweak).
- Obvious extension point if "aggregated" scope ever lands.

**Cons**
- Touches every WS message that takes `workspace_guid` today (≈12 messages). Lots of grep-and-replace.
- Frontend `ReviewContextProvider` needs a `scope` prop instead of `workspaceId`, rippling into `useReviewContext`, `ReviewActions`, `ReviewView`.

**Unknown**
- Whether all downstream consumers (e.g. `CodeReviewDialog` auto-create flow, agent fix runs) cleanly accept "no workspace".

### Option B — separate `project_review_session` table

Mirror the full `review_*` schema for project scope, keep current tables untouched.

**Pros**
- Zero risk to existing workspace flow.
- Clean conceptual split.

**Cons**
- Doubles repos, services, WS messages, frontend hooks. Maintenance nightmare.
- Forces UI to merge two streams to show "all reviews for this project".

**Unknown**
- Whether the duplication is bounded enough to be worth the safety.

### Option C — synthesize a pseudo-workspace for the project

Auto-create a hidden `workspace` row pointing at `project.main_file_path` whenever a project session is requested.

**Pros**
- Smallest service-layer change.
- WS protocol untouched.

**Cons**
- Pollutes workspace listings, terminal panes, agent chat, etc., with a phantom workspace. Almost certainly leaks into UI somewhere.
- Inverts the data model: a workspace is supposed to *be* a worktree branch; pretending the main checkout is one breaks invariants in `core-engine/git`.

**Unknown**
- How many places assume `workspace.branch != project default branch`.

## Key forks in the road

- **Fork 1 — Schema shape**: Option A (nullable `workspace_guid` + scope-by-presence) vs explicit `scope_type` column vs Option B (separate tables). **Still open — decide in TECH.**
- **Fork 2 — `base_ref` source for project sessions**: ✅ **Resolved (revised)**: prefer `project.target_branch` (auto-set on project creation; topbar disallows clearing). For legacy projects where it is `NULL`, fall back to the repository's default branch (`origin/HEAD`) with a logged warning. Only fail loudly if both resolutions yield nothing.
- **Fork 3 — Coexistence semantics**: ✅ **Resolved**: a project may have 1 active project-scoped session AND any number of active workspace-scoped sessions simultaneously. They are independent; isolation is at the `repo_path` level (project session works on `project.main_file_path`, workspace sessions work on their own worktree paths).
- **Fork 4 — Right-sidebar UX on project routes**: ✅ **Resolved**: project-route Review tab shows only the project's own session. Aggregated roll-up of workspace sessions is out of scope for this round.
- **Fork 5 — Entry from workspace route**: ✅ **Resolved**: no cross-view hint. Workspace Review tab stays exactly as it is today; project session is invisible from there.

## Open questions

- [ ] AI fix run write-back: ✅ resolved per Fork 3 — write directly back to the current branch on the project's working tree, identical to workspace session behavior. (No protected-branch guard added in this round; user owns the risk of running fixes on `main`.)
- [x] "Changes" definition: same as workspace flow — diff = `staged + unstaged + untracked` against `base_ref` (`project.target_branch`). Empty changeset → same `Cannot create a review session with no changed files` error as today.
- [ ] Authorization: assume project-scoped sessions are visible to anyone who can see the project (parity with current workspace-session visibility). Confirm during PRD.
- [ ] Telemetry: add a `scope` dimension to existing review-session events (`workspace` | `project`). Decide in TECH.
- [ ] UI naming: keep "Review Session" everywhere; disambiguate via context (project route vs workspace route) and the existing session header. Re-examine if user testing shows confusion.

## References

- Backend
  - [`crates/infra/src/db/entities/review_session.rs`](../../../crates/infra/src/db/entities/review_session.rs) — already stores `project_guid` + `repo_path`.
  - [`crates/infra/src/db/migration/m20260422_000019_create_review_tables.rs`](../../../crates/infra/src/db/migration/m20260422_000019_create_review_tables.rs) — current `workspace_guid NOT NULL` + workspace-keyed indexes.
  - [`crates/core-service/src/service/review.rs`](../../../crates/core-service/src/service/review.rs) `create_session` (lines ~405–460) — workspace-only resolution.
  - [`crates/core-service/src/service/ws_message.rs`](../../../crates/core-service/src/service/ws_message.rs) lines ~302–342 — review WS message catalog.
- Frontend
  - [`apps/web/src/components/diff/review/ReviewContextProvider.tsx`](../../../apps/web/src/components/diff/review/ReviewContextProvider.tsx)
  - [`apps/web/src/components/diff/ReviewView.tsx`](../../../apps/web/src/components/diff/ReviewView.tsx)
  - [`apps/web/src/components/layout/RightSidebar.tsx`](../../../apps/web/src/components/layout/RightSidebar.tsx) lines ~690–713 — current Review tab wiring.
  - [`apps/web/src/components/code-review/CodeReviewDialog.tsx`](../../../apps/web/src/components/code-review/CodeReviewDialog.tsx) — auto-creates a session, will need scope awareness.
- Related entity: [`crates/infra/src/db/entities/project.rs`](../../../crates/infra/src/db/entities/project.rs) — `main_file_path`, `target_branch`.
- Related specs: none yet.

## Ready to promote

- **Promote to PRD**:
  - Primary user story: "as a user developing on the Project's main checkout, I can start a review session, comment on my own diff, and trigger an AI fix run, all from the right-sidebar Review tab on a project route."
  - Backward-compat constraint: workspace flow unchanged.
  - Resolve Forks 2, 3, 4, 5 as product decisions.
- **Promote to TECH**:
  - Option A (nullable `workspace_guid`) as the working baseline; document migration + index changes.
  - Scope abstraction at the service boundary: `resolve_repo_context(scope) -> RepoContext`.
  - WS message scope shape: `ReviewTarget = Project { guid } | Workspace { guid }`.
  - Frontend: `ReviewContextProvider` accepts `scope` instead of `workspaceId`; `RightSidebar` decides scope from URL params.
