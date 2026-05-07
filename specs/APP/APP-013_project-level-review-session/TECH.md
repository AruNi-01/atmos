# TECH · APP-013: Project-Level Review Session

> Technical Design · HOW. Implements PRD APP-013: Project-Level Review Session.

## Scope summary

Addresses every Must Have in the PRD (M1–M8) and Nice to Have N2 (scope badge in session header). N1 / N3 deferred. The work spans `crates/infra` (one schema migration + repo additions), `crates/core-service` (`review.rs` scope abstraction), `crates/infra/src/websocket/message.rs` + `crates/core-service/src/service/ws_message.rs` (WS payload reshape), and `apps/web` (`ReviewContextProvider`, `RightSidebar`, `ReviewView`, `ReviewActions`). No new REST endpoints — Atmos is WebSocket-first and the existing review surface is fully WS-based.

This doc resolves BRAINSTORM Fork 1 (schema shape) and the three "defer to TECH" PRD opens (schema, WS shape, telemetry).

## Architecture overview

```text
apps/web/components/diff/review        ← scope-aware Provider, View, Actions
        │
        ▼
apps/web/api/ws-api.ts                  ← typed wrappers over WS payloads
        │   (WebSocket)
        ▼
crates/core-service/service/ws_message  ← handle_review_session_{list,create}
        │
        ▼
crates/core-service/service/review      ← resolve_repo_context(target) + create/list branches
        │
        ▼
crates/infra/db/repo/review_repo        ← list_sessions_by_workspace + new list_sessions_by_project
crates/core-engine/git                  ← reused: get_default_branch, get_changed_files
crates/infra/db/entities/review_session ← workspace_guid → Option<String>
crates/infra/db/migration/m2026...0023  ← ALTER + index
```

No external dependencies change. No new background jobs, no Redis surface.

## Module-by-module design

### crates/infra

#### DB migration: `m20260507_000023_make_review_session_workspace_optional.rs`

- **ALTER** `review_session.workspace_guid` from `NOT NULL` to nullable.
- **DROP** the existing index `idx-review_session-workspace-updated` (defined in [`m20260422_000019_create_review_tables.rs#L76`](../../../crates/infra/src/db/migration/m20260422_000019_create_review_tables.rs#L76)).
- **CREATE** two replacement indexes on `review_session`:
  - `idx-review_session-workspace-status-updated` on `(workspace_guid, status, updated_at)` — only useful for rows where `workspace_guid IS NOT NULL`. SQLite/Postgres both index NULLs implicitly; we accept the small cost.
  - `idx-review_session-project-status-updated` on `(project_guid, status, updated_at)` — for the new project-scoped listing.
- **No data backfill**: every existing row already has both `workspace_guid` and `project_guid` set, so the schema change is forward-only and free of data migration. `down()` re-tightens the column to `NOT NULL` but **is NOT safe** after project-scoped sessions (`workspace_guid = NULL`) have been created — the rollback filters to `WHERE "workspace_guid" IS NOT NULL` (SQLite) or deletes NULL rows (Postgres), which would lose project-scoped session data. Rollback should only be used before any project-scoped sessions are created, or with explicit data migration to preserve those sessions.

#### Entity: `crates/infra/src/db/entities/review_session.rs`

- Change `pub workspace_guid: String` → `pub workspace_guid: Option<String>` (line 14). All other fields untouched.

#### Repo: `crates/infra/src/db/repo/review_repo.rs`

- Update `create_session(...)` signature: `workspace_guid: String` → `workspace_guid: Option<String>` (line 34). Body's `workspace_guid: Set(workspace_guid)` (line 55) auto-adapts.
- Add `list_sessions_by_project(project_guid: &str, include_archived: bool)` mirroring [`list_sessions_by_workspace`](../../../crates/infra/src/db/repo/review_repo.rs#L79-L94) but filtering on `Column::ProjectGuid` AND `Column::WorkspaceGuid IS NULL` (so project listing returns ONLY project-scoped sessions; per PRD M5 it must not roll up workspace sessions).

### crates/core-engine

No new capability. Reuse:
- `GitEngine::get_default_branch(repo_path)` — for the `target_branch` legacy fallback (PRD M2).
- `GitEngine::get_changed_files(repo_path, base_branch, false)` — same call shape as the workspace flow today; `repo_path` is just `project.main_file_path` for project scope.

### crates/core-service

All changes in `crates/core-service/src/service/review.rs`.

#### New domain type

```rust
/// Where a review session lives.
/// One enum, two variants — keep at the service boundary; do not leak to repo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReviewTarget {
    Workspace { workspace_guid: String },
    Project { project_guid: String },
}

/// Resolved working context for a session, regardless of scope.
struct RepoContext {
    project_guid: String,
    workspace_guid: Option<String>, // None => project-scoped session
    repo_path: String,              // absolute filesystem path of the git working tree
    base_ref: Option<String>,       // branch name to diff against
    base_ref_origin: BaseRefOrigin, // for telemetry / warning logs
}

enum BaseRefOrigin {
    ProjectTargetBranch,
    DefaultBranchFallback,
    WorkspaceBaseBranch, // existing workspace path
}
```

#### New helper

```rust
async fn resolve_repo_context(&self, target: &ReviewTarget) -> Result<RepoContext>;
```

- **Workspace branch**: same code path as today — `workspace_repo.find_by_guid` → `git_engine.get_worktree_path(workspace.name)` → `base_ref = workspace.base_branch`. Wrap into `RepoContext`.
- **Project branch** (PRD M2):
  1. `project_repo.find_by_guid(project_guid)` (404 → `ServiceError::NotFound`).
  2. `repo_path = project.main_file_path`.
  3. `base_ref =` first of: `project.target_branch.clone()`, `git_engine.get_default_branch(&repo_path).ok()`. Tag the origin accordingly. If both are `None`/`Err`, return `ServiceError::Validation("Project has no target branch configured. Set one from the topbar before starting a review session.")`.
- Returned `RepoContext` is the only thing downstream code in `create_session` and `list_sessions_*` reads — they no longer touch `workspace_repo` directly, eliminating the workspace assumption.

#### `CreateReviewSessionInput` reshape

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct CreateReviewSessionInput {
    pub target: ReviewTarget,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
}
```

`target` replaces the old `workspace_guid: String` field ([`review.rs#L181-L188`](../../../crates/core-service/src/service/review.rs#L181-L188)). Net-net there are no external Rust callers of this DTO outside `ws_message.rs`, so this is a contained change.

#### `create_session` rewrite

Replace the current top of `create_session` (lines ~409–435) with:

```rust
let ctx = self.resolve_repo_context(&input.target).await?;
let changed = self
    .git_engine
    .get_changed_files(Path::new(&ctx.repo_path), ctx.base_ref.as_deref(), false)
    .map_err(ServiceError::Engine)?;
// ... existing ordered_paths / empty-changeset error / snapshot writing logic ...
review_repo
    .create_session(
        Some(session_guid.clone()),
        ctx.workspace_guid.clone(),       // now Option<String>
        ctx.project_guid.clone(),
        ctx.repo_path.clone(),
        storage_root_rel_path,
        ctx.base_ref.clone(),
        base_commit,
        head_commit,
        revision_guid.clone(),
        ReviewSessionStatus::Active.as_str().into(),
        input.title.clone(),
        input.created_by.clone(),
    )
    .await?;
```

If `ctx.base_ref_origin == BaseRefOrigin::DefaultBranchFallback`, log `tracing::warn!(target = "review", project_guid = %ctx.project_guid, "target_branch missing, falling back to repo default branch")` (PRD M2 + telemetry open).

#### New listing entry point

```rust
pub async fn list_sessions_by_project(
    &self,
    project_guid: String,
    include_archived: bool,
) -> Result<Vec<ReviewSessionDto>> {
    let repo = ReviewRepo::new(&self.db);
    let sessions = repo
        .list_sessions_by_project(&project_guid, include_archived)
        .await?;
    let mut items = Vec::with_capacity(sessions.len());
    for session in sessions {
        items.push(self.build_session_dto(session).await?);
    }
    Ok(items)
}
```

Mirrors [`list_sessions_by_workspace`](../../../crates/core-service/src/service/review.rs#L381-L395) one-for-one. `build_session_dto` already keys off `session.guid`, no change needed.

#### Existing helpers that read `workspace_guid`

Audit and patch (current usages at [`review.rs#L1983-L1988`](../../../crates/core-service/src/service/review.rs#L1983-L1988) etc.): wherever code does `workspace_repo.find_by_guid(&session.workspace_guid)` to recover repo path, prefer `session.repo_path` directly (it's already stored). Only fall back to workspace lookup when both `session.workspace_guid` is `Some` AND `session.repo_path` is empty/legacy — defensive only.

### crates/infra/src/websocket/message.rs

Two payloads change. All 10 other review WS payloads are session-keyed and untouched.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionListRequest {
    /// Either workspace_guid OR project_guid must be set, not both.
    #[serde(default)]
    pub workspace_guid: Option<String>,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSessionCreateRequest {
    /// Either workspace_guid OR project_guid must be set, not both.
    #[serde(default)]
    pub workspace_guid: Option<String>,
    #[serde(default)]
    pub project_guid: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
}
```

**Why two-Option-fields instead of a tagged enum on the wire**: keeps WS payloads flat and JS-friendly; old clients that still send only `workspace_guid` keep working; the handler does the validation. The tagged enum (`ReviewTarget`) lives only inside the Rust service layer.

### crates/core-service/src/service/ws_message.rs

`handle_review_session_list` (line 4545) and `handle_review_session_create` (line 4558) become thin adapters:

```rust
fn parse_target(workspace_guid: Option<String>, project_guid: Option<String>)
    -> Result<ReviewTarget>
{
    match (workspace_guid, project_guid) {
        (Some(w), None) => Ok(ReviewTarget::Workspace { workspace_guid: w }),
        (None, Some(p)) => Ok(ReviewTarget::Project { project_guid: p }),
        (Some(_), Some(_)) =>
            Err(ServiceError::Validation("Specify exactly one of workspace_guid or project_guid".into()).into()),
        (None, None) =>
            Err(ServiceError::Validation("workspace_guid or project_guid is required".into()).into()),
    }
}

async fn handle_review_session_list(&self, req: ReviewSessionListRequest) -> Result<Value> {
    let target = parse_target(req.workspace_guid, req.project_guid)?;
    let sessions = match target {
        ReviewTarget::Workspace { workspace_guid } => self.review_service
            .list_sessions_by_workspace(workspace_guid, req.include_archived).await?,
        ReviewTarget::Project { project_guid } => self.review_service
            .list_sessions_by_project(project_guid, req.include_archived).await?,
    };
    Ok(json!({ "sessions": sessions }))
}

async fn handle_review_session_create(&self, req: ReviewSessionCreateRequest) -> Result<Value> {
    let target = parse_target(req.workspace_guid, req.project_guid)?;
    let session = self.review_service.create_session(CreateReviewSessionInput {
        target, title: req.title, created_by: req.created_by,
    }).await?;
    Ok(json!({ "session": session }))
}
```

No new `WsAction` variants. No protocol-level rename.

### apps/api

No changes. All review traffic flows through the existing WS handler dispatcher in `crates/core-service/src/service/ws_message.rs`, which is wired by `apps/api` once at boot.

### apps/web

#### `apps/web/src/api/ws-api.ts`

Update the typed wrappers around `review_session_list` and `review_session_create` to accept a discriminated union for the target:

```ts
export type ReviewTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "project"; projectId: string };

reviewWsApi.listSessions(target: ReviewTarget, includeArchived = false)
reviewWsApi.createSession(data: { target: ReviewTarget; title?: string | null; createdBy?: string | null })
```

The runtime payload sends snake_case (`workspace_guid` / `project_guid`) per existing convention, with the kind field determining which GUID is sent.

#### `apps/web/src/hooks/use-review-context.ts`

- Replace `workspaceId: string | null` arg with `target: ReviewTarget | null` (typed: `{ kind: 'workspace'; workspaceId: string } | { kind: 'project'; projectId: string }`).
- Internal calls to `reviewWsApi.listSessions(workspaceId)` and `reviewWsApi.createSession(workspaceId, ...)` pass the resolved `target`.
- `canEdit`, comment / message / fix-run handlers don't change — they all key off `currentSession.guid`.
- The query state keys (`reviewSession`, `reviewRevision`) stay the same; sessions are unique by GUID across scopes.

#### `apps/web/src/components/diff/review/ReviewContextProvider.tsx`

Replace `workspaceId: string | null` prop with `target: ReviewTarget | null`. `filePath` and `fileSnapshotGuid` props unchanged. All `useMemo` deps stay; the prop reshape is upstream.

#### `apps/web/src/components/diff/ReviewView.tsx`

- Replace direct read of `workspaceId` (line 31) with `target` from `useReviewCtx()` exposing `currentSession.workspace_guid` / `currentSession.project_guid` for downstream needs.
- The "No workspace selected" empty state (lines 112–118) becomes "No project or workspace selected" — same pattern, slightly broadened wording.
- The "New Review Session" button (line 128) keeps the same handler; `handleCreateSession` already pulls scope from context.
- File-open / pin actions currently call `openFile(..., workspaceId, ...)` (lines 216, 225, 327). For a project-scoped session the editor needs a non-null workspace identifier. Options:
  - **Chosen**: pass `currentSession.guid` prefixed (e.g., `EDITOR_REVIEW_DIFF_PREFIX` already encodes snapshot guid). The editor store is keyed by workspace; for project scope, fall back to a synthetic editor key `project:<project_guid>` — confined to `EDITOR_REVIEW_DIFF_PREFIX` paths only, so it won't pollute regular file tabs.
- N2 scope badge: render a small `<span>` inline in the existing session header showing `Project` or `Workspace`, derived from `currentSession.workspace_guid` presence.

#### `apps/web/src/components/diff/review/ReviewActions.tsx`

No structural changes — actions are session-keyed. Add optional disabling of "Mark all reviewed" etc. only if `target` is null (already implicit via `currentSession` being null).

#### `apps/web/src/components/layout/RightSidebar.tsx`

Lines 697–709 currently:

```tsx
<ReviewContextProvider workspaceId={workspaceId} filePath={filePath}>
```

becomes:

```tsx
const reviewTarget: ReviewTarget | null = useMemo(() => {
  if (workspaceId) return { kind: 'workspace', workspaceId };
  if (projectIdFromUrl) return { kind: 'project', projectId: projectIdFromUrl };
  return null;
}, [workspaceId, projectIdFromUrl]);

// in JSX:
<ReviewContextProvider target={reviewTarget} filePath={filePath}>
```

`hasWorkingContext` already evaluates to true on project routes (`effectiveContextId = workspaceId || projectIdFromUrl`), so the Review tab will render its full UI on a project route — no further wiring at the tab-visibility level.

#### `apps/web/src/components/code-review/CodeReviewDialog.tsx`

This dialog auto-creates a session (PRD context). Update its create-session call to forward whatever `ReviewTarget` the parent passes. If invoked from a workspace-only flow, behavior is unchanged.

### packages/ui

No changes. The scope badge in N2 reuses the existing `Badge` primitive.

## Data model

### Database

```sql
-- m20260507_000023_make_review_session_workspace_optional.rs
ALTER TABLE review_session
  ALTER COLUMN workspace_guid DROP NOT NULL;     -- Postgres
-- (sqlite: emulated via table rebuild — sea-orm-migration handles it)

DROP INDEX IF EXISTS "idx-review_session-workspace-updated";

CREATE INDEX "idx-review_session-workspace-status-updated"
  ON review_session (workspace_guid, status, updated_at);

CREATE INDEX "idx-review_session-project-status-updated"
  ON review_session (project_guid, status, updated_at);
```

### Rust

```rust
// crates/infra/src/db/entities/review_session.rs
pub struct Model {
    // ...
    pub workspace_guid: Option<String>,   // CHANGED: was String
    pub project_guid: String,             // unchanged, always set
    pub repo_path: String,                // unchanged, source-of-truth for working tree
    // ...
}

// crates/core-service/src/service/review.rs
pub enum ReviewTarget {
    Workspace { workspace_guid: String },
    Project   { project_guid: String },
}

pub struct CreateReviewSessionInput {
    pub target: ReviewTarget,
    pub title: Option<String>,
    pub created_by: Option<String>,
}
```

### Frontend

```ts
// apps/web/src/api/ws-api.ts
export type ReviewTarget =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'project';   projectId: string };

export interface ReviewSessionDto {
  // existing fields unchanged
  workspace_guid: string | null;   // CHANGED: was string
  project_guid: string;
  repo_path: string;
  // ...
}
```

## Transport

### WebSocket messages

Two payload shapes change as documented above. Action names (`review_session_list`, `review_session_create`) and all other 10 review actions remain identical.

```jsonc
// review_session_create — workspace scope (unchanged on the wire)
{ "action": "review_session_create",
  "data": { "workspace_guid": "ws-...", "title": "..." } }

// review_session_create — NEW: project scope
{ "action": "review_session_create",
  "data": { "project_guid": "pj-...", "title": "..." } }

// review_session_list — workspace scope
{ "action": "review_session_list",
  "data": { "workspace_guid": "ws-...", "include_archived": false } }

// review_session_list — NEW: project scope
{ "action": "review_session_list",
  "data": { "project_guid": "pj-...", "include_archived": false } }
```

The handler rejects payloads with both fields set, or neither set.

### REST

None added. Justification: the entire review surface is already WS-based; introducing REST only for project scope would break the consistency rule in the root `AGENTS.md` Transport Rules.

## Security & permissions

- **AuthN**: same as today — WS connection is already authenticated when the user reaches the right sidebar.
- **AuthZ**: a project-scoped session is visible to anyone who can read the `project` row (parity with workspace-scoped sessions, which are visible to anyone who can read the workspace). No new check is added; reusing the existing project-visibility middleware in the WS handler is sufficient. PRD authorization open question is hereby resolved: **parity with workspace, no new gating**.
- **Sensitive data**: the project session writes the same kind of file snapshots under the existing review storage root. No new secrets, tokens, or paths are exposed.

## Rollout plan

Per PRD: single-shot release. No feature flag, no phased rollout. Push only when every step below is green.

1. **Migration** — add `m20260507_000023_make_review_session_workspace_optional.rs`, register in [`crates/infra/src/db/migration/mod.rs`](../../../crates/infra/src/db/migration/mod.rs). Run `cargo test -p infra` to confirm the migration applies cleanly on a fresh DB and on a DB seeded with existing fixtures.
2. **Entity + repo** — flip `workspace_guid` to `Option<String>`, add `list_sessions_by_project`, update `create_session` signature. `cargo build -p infra` clean.
3. **Service** — introduce `ReviewTarget`, `RepoContext`, `resolve_repo_context`; rewrite `create_session` head; add `list_sessions_by_project`; reshape `CreateReviewSessionInput`. Update existing `workspace_guid` reads (audit grep). `cargo build -p core-service` clean.
4. **WS payloads** — make both `workspace_guid` fields `Option`, add `project_guid` field; rewrite `handle_review_session_list` + `handle_review_session_create` with `parse_target`. `cargo build --workspace` clean.
5. **Frontend API client** — update `reviewWsApi.listSessions` / `createSession` signatures, add `ReviewTarget` type, update `ReviewSessionDto` type for nullable `workspace_guid`. `bun typecheck` clean.
6. **Frontend hook + provider + view** — `useReviewContext` accepts `target`, `ReviewContextProvider` accepts `target`, `ReviewView` empty-state copy + N2 scope badge, `RightSidebar` resolves `target` from URL params, `CodeReviewDialog` forwards target. `bun typecheck && bun lint` clean.
7. **Manual smoke test** — on a real project: (a) create a project session on a project route, comment, run AI fix; (b) repeat on a workspace route; (c) confirm both sessions coexist; (d) wipe `target_branch` on a test project (via DB) and confirm fallback path + warn log; (e) confirm topbar still works.
8. **Test pass** — `just test` (= `cargo test --workspace` + `bun test`) green. Then push.

## Risks & tradeoffs

- **Tradeoff — flat WS payload over tagged enum**: chose two `Option<String>` fields on the wire instead of a serde-tagged `ReviewTarget`. Wins JS ergonomics and trivially keeps existing clients building, at the cost of a 4-line `parse_target` validator on the handler. Worth it.
- **Tradeoff — schema-by-presence over `scope_type` column**: chose nullable `workspace_guid` to encode scope, instead of adding an explicit `scope_type` enum column. Wins zero data backfill. Cost: a small ergonomic loss when reading rows without context. Mitigation: helper `Model::scope() -> Scope` derived from `workspace_guid.is_some()` if call sites multiply.
- **Risk — synthetic editor key for project-scoped review files**: the editor store is keyed by workspace today. Using `project:<project_guid>` as a fallback key for `EDITOR_REVIEW_DIFF_PREFIX` paths is novel. **Rollback path**: if the editor store leaks the synthetic key into other tab features, gate it inside a small `useReviewEditorKey()` adapter and revert call sites in `ReviewView` to it.
- **Risk — index drop+create migration on Postgres**: `DROP INDEX` is fast but locks briefly. Acceptable on Atmos's local-first deployment; would warrant `CREATE INDEX CONCURRENTLY` on a hosted Postgres but is out of scope here.
- **Rollback plan**: revert PR. The migration's `down()` re-tightens `workspace_guid` to `NOT NULL`, which is safe because no project-scoped rows exist on user machines until they exercise the new flow. Document this in the PR description.

## Dependencies & compatibility

- **Depends on spec**: none.
- **Blocks spec**: a future "aggregated project review" spec can layer on top by adding a third `ReviewTarget::AggregatedProject` variant without touching the schema again.
- **Minimum Atmos version**: ships with the next release; older clients without the WS payload reshape will fail on `handle_review_session_list` validation if they happen to send neither field — but no current client does, since today's clients always send `workspace_guid`.
- **External services**: none.

## Open questions

- [ ] **Telemetry**: where do we emit the `scope=project|workspace` dimension? Need to confirm the existing analytics sink in `apps/web` (if any). If none exists, defer to the implementation skill — TECH-recommended is to log via `tracing::info!(scope = ?…, "review.session.created")` at the service layer and surface in any future analytics plumbing.
- [ ] **Editor synthetic key**: confirm during impl that no other feature in `useEditorStore` assumes `workspaceId` is non-empty; if it does, route project-scoped review file opens through a dedicated viewer instead of the workspace-keyed editor.
