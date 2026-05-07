# PRD · APP-013: Project-Level Review Session

> Product Requirements · WHAT and WHY. Settled direction for letting users start a Review Session against a Project's main checkout — not just inside a Workspace.

## Context

- **Problem**: today the right-sidebar **Review** tab only works when a Workspace is selected. Users who develop directly on the Project's main checkout (no worktree, just `main`/`master` in `project.main_file_path`) cannot create a review session, leave inline comments, or trigger an AI fix run on their own diff. The Review tab simply renders a "no context" empty state.
- **Why now**: a meaningful slice of Atmos users skip workspaces and work straight on the project repo. The data model already half-anticipates this — `review_session` stores both `project_guid` and the concrete `repo_path` — so unlocking this scope is incremental, not a redesign.
- **Related specs**: none directly. Builds on the existing review-session feature shipped under `crates/core-service::service::review` (no formal APP-NNN entry).

## Goals

1. **Primary** — A user on a Project route, with no workspace selected, can create, view, comment on, and AI-fix a review session for the Project's main checkout, end-to-end through the same right-sidebar Review tab as today.
2. **Secondary** — Zero behavior change for the existing workspace-scoped flow. Existing review sessions, comments, and AI fix runs continue to work exactly as before.

Non-goals are listed in **Out of Scope** below.

## Users & Scenarios

- **Primary persona**: the **Solo Project Developer** — a user who treats a Project as their working repo, edits files on its current branch (often `main`), and never spawns a workspace/worktree.
- **Secondary persona**: the **Workspace Owner** — unaffected by this change, but should observe no regression.

### Key scenarios

1. **Start a project review.** A solo developer makes changes on the project's main checkout, opens the right sidebar's Review tab on the project route, and clicks "New Review Session". A session is created against `project.target_branch`, listing all changed files.
2. **Comment & fix.** They expand a changed file in the Review tab, leave inline comments, and trigger an AI fix run. The fix run rewrites the working tree on the project's current branch — same behavior as the workspace flow.
3. **Coexist with workspace sessions.** While a project session is active, a teammate can independently start a workspace-scoped session in the same project; the two sessions are isolated and do not interfere.
4. **Misconfiguration error path.** A user tries to start a project session, but the project has no `target_branch` set. The UI surfaces a clear validation error pointing them at the project's settings to configure a target branch.

## User Stories

- As a solo project developer, I want to start a Review Session directly from the project route, so that I can self-review changes on `main` before committing.
- As a solo project developer, I want to leave inline comments and trigger an AI fix run on my project-level diff, so that I get the same review tooling I'd get inside a workspace.
- As a workspace owner, I want my existing review sessions to keep working unchanged, so that adopting this feature carries no risk for my flow.
- As a project member, I want to see only the project-scoped session on the project route (not a roll-up of workspace sessions), so that the Review tab stays focused on my current scope.

## Functional Requirements

### Must Have

- **M1 — Create project session**: From the right-sidebar Review tab on a project route (no workspace selected), the user can create a review session scoped to the Project. The session uses `project.main_file_path` as `repo_path` and `project.target_branch` as `base_ref`.
- **M2 — Resolve `base_ref` with safe fallback**: session creation uses `project.target_branch` as `base_ref`. In normal operation `target_branch` is auto-set on project creation (`git_engine.get_default_branch`) and the topbar UI does not allow clearing it, so it is effectively always present. For the rare legacy/edge case where `target_branch` is `NULL` (older projects whose lazy-init never fired), fall back to the repository's default branch (`origin/HEAD`) and log a warning. If even that resolution fails, surface a user-facing error with a CTA to configure target branch from the topbar.
- **M3 — Empty-changeset behavior**: If the project's working tree has no `staged + unstaged + untracked` changes vs `base_ref`, creation fails with the same "no changed files" error already used by the workspace flow.
- **M4 — Full review surface for project sessions**: project-scoped sessions support the same operations as workspace sessions: list/get session, list revisions, browse changed files, mark files reviewed, list/create/update review comments, add/edit/delete review messages, list/create/finalize agent fix runs, read run artifacts.
- **M5 — Session listing on project route**: the project route's Review tab lists only the project's own active session (or shows the empty/onboarding state). Workspace sessions in the same project are not displayed here.
- **M6 — Workspace flow unchanged**: on a workspace route, the Review tab behaves exactly as it does today. No new entries, no cross-scope hints, no schema changes visible to the user.
- **M7 — Coexistence**: a project may have one active project-scoped session AND any number of active workspace-scoped sessions simultaneously. The two scopes are independent — actions on one never block or mutate the other.
- **M8 — AI fix write-back parity**: AI fix runs for a project session write back to the project's current branch on the working tree, identical to how workspace-session fix runs write to the worktree's branch.

### Nice to Have

- **N1 — Pre-create branch hint**: when starting a project session on a protected-looking branch (`main`, `master`), surface an informational banner reminding the user that AI fix runs will modify the current branch.
- **N2 — Session header scope label**: in the session header, render a small "Project" / "Workspace" badge so the user can tell at a glance which scope a session belongs to.
- **N3 — Empty-state CTA on workspace route**: if the user lands on a project route by mistake while expecting a workspace session, no extra plumbing — but reuse existing copy patterns to make the empty state self-explanatory.

## Out of Scope

- **Aggregated project view** — a single Review tab showing project session **plus** a read-only roll-up of all workspace sessions under that project. Deferred to a future spec.
- **Cross-scope hints** — surfacing "this project has a project-level session in progress" inside a workspace's Review tab. Explicitly excluded to avoid noise.
- **Protected-branch guard / dry-run mode** — automatically blocking AI fix runs from writing to `main`, or running them in a "stash + propose patch" mode. Out of scope; users own the risk on the branch they chose.
- **Cross-workspace review** — one session that diffs N workspaces. Separate problem; will need its own brainstorm.
- **Project session for non-git project paths** — projects whose `main_file_path` is not a git repository. Same precondition as the workspace flow today.
- **Renaming the feature** — the surface stays "Review Session" everywhere; no new "Project Review" / "Workspace Review" naming.

## Success Metrics

- **Leading** — within 30 days of release, ≥ X% of projects (X TBD against current usage data) have at least one project-scoped session created.
- **Lagging** — number of comments and AI fix runs originating from project-scoped sessions trends up week-over-week for the first 6 weeks; workspace-scoped session activity stays flat or grows (no cannibalization).
- **Qualitative** — at least 3 users from the Solo Project Developer persona confirm the flow matches their expectations without prompting; zero regression reports against the workspace flow in the first 2 weeks.

## Risks & Open Questions

- **Risk — habit inertia**: solo developers who currently work around the gap by spinning up a throwaway workspace may not discover the new project-scope entry. Mitigation: empty-state copy on the project route Review tab should explicitly invite them.
- **Risk — `main` branch surprise**: AI fix runs writing to `main` is intentional but may surprise users. Mitigation candidate: N1 banner.
- **Risk — legacy `target_branch=NULL` projects**: in practice `target_branch` is auto-set on project creation and the topbar UI prevents clearing it, but older project rows may still have NULL. M2's fallback to `origin/HEAD` keeps the flow alive; only when both are missing do we fail loudly.
- **Open (defer to TECH)** — Schema shape for scope: nullable `workspace_guid` + scope-by-presence vs explicit `scope_type` column. BRAINSTORM Fork 1.
- **Open (defer to TECH)** — How to slice the WS message protocol changes (new `scope` field on existing messages vs net-new project-scoped messages) while keeping backward compatibility.
- **Open (defer to TECH)** — Telemetry: add a `scope` dimension (`workspace` | `project`) to existing review-session events.

## Milestones

Single-shot release. All Must Have items (M1–M8) and the chosen Nice to Have items ship together; no phased rollout.

- **Single phase — full feature**: backend (`infra` migration + `core-service::review` scope abstraction + WS protocol scope field) and frontend (`ReviewContextProvider` scope-aware, `RightSidebar` wiring, `ReviewView` / `ReviewActions` parity) implemented in one branch, gated by `cargo test --workspace` + `bun test` + manual end-to-end smoke on both project and workspace routes. Push only when all of the above is green.
- **Nice to Have inclusion**: N2 (scope badge in session header) ships in the same release. N1 / N3 deferred unless explicitly upgraded later.
