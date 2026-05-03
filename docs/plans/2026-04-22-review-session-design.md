# Review Session + Diff Comments + AI Fix Design

**Date**: 2026-04-22
**Status**: Draft

## Overview

This design adds a first-class review workflow to Atmos for workspace diffs:

- Users create an explicit `Review Session` for the current diff state
- Users leave line/range-based diff comments as review comments
- Each file in the session can be marked `Reviewed`, similar to GitHub's reviewed checkbox
- Atmos persists full review snapshots for historical replay
- AI can read open review comments, fix code, reply to each comment, and write a batch summary
- The same review capability is shared by Agent Chat and terminal-based agent CLI flows

The design intentionally separates:

- `structured metadata` in the database
- `large replay artifacts` on disk under `.atmos/review/`
- `business workflow` in `core-service`
- `transport` over WebSocket-first APIs
- `agent operations` via a dedicated `atmos review` capability layer

This avoids storing large diff blobs directly in DB rows while still supporting full historical replay.

---

## Goals

- Support explicit review sessions with clear lifecycle: create, active, closed, archived
- Support diff comments with stable anchors within a session
- Support full historical replay even if the live Git state later changes
- Support file-level `Reviewed` state in the session UI
- Support AI-assisted fix flow with per-comment replies and batch summaries
- Support both Agent Chat and terminal agent CLI using one shared review capability

## Non-Goals

- GitHub PR sync in v1
- Cross-session comment continuity
- Automatic cross-commit re-anchoring of old comments onto new diffs
- Realtime collaborative editing between multiple human reviewers
- Generic “all large data everywhere go to file storage” refactor across the whole app

---

## Product Model

### Review Session

A review session is an explicit object representing “review this workspace diff at this point in time”.

Core behavior:

- User starts `New Review Session` from the current diff view
- Atmos snapshots the reviewable diff state
- User reviews files, adds comments, marks files reviewed, triggers AI fix runs
- Session can be `closed` to prevent new comments
- Session can later be `archived` while remaining replayable

The session is a durable artifact, not an implicit transient UI state.

### Review Comment

A review comment is a comment comment anchored to one file snapshot and one location in that file diff.

Each comment contains:

- one initial user comment
- zero or more follow-up messages
- zero or more AI replies
- status transitions such as `open`, `agent_fixed`, `fixed`, `dismissed`

### File Review State

Each file in a session has an independent file review state:

- `unreviewed`
- `reviewed`

This state is intentionally separate from comment status:

- A file can be `reviewed` while still having open comments
- A file can have no comments but remain `unreviewed`
- A reviewed mark means “I have inspected this file in this session”, not “all issues are fixed”

This is the same mental model as GitHub's file reviewed checkbox.

---

## User Experience

### Entry Flow

The existing diff view becomes session-aware.

Recommended v1 flow:

1. User opens diff view for a workspace
2. Header shows either:
   - `Start Review Session`
   - or current active session information
3. Once a session is active, the diff UI adds:
   - review comment annotations in the diff
   - a review sidebar with comments, files, run history, and summary
   - file-level `Reviewed` checkbox in each file header

This should be implemented as an enhancement to the existing diff page, not as a brand-new dedicated page in v1.

### Session Header

The review session header should show:

- session title or generated label
- created time
- session status
- compare base / head commit
- counts:
  - files
  - reviewed files
  - open comments
  - AI runs

Primary actions:

- `Close Session`
- `Archive Session`
- `Replay Session`
- `Fix Open Comments`

### File Reviewed Checkbox

Each file card header should include:

- `Reviewed` checkbox
- optional timestamp tooltip
- optional “reviewed by” later if multi-reviewer support is added

In the current diff component stack, this can be modeled using the custom header metadata area supported by the diff renderer. The reviewed checkbox belongs in the file header, not in per-line gutter UI.

Behavior:

- checking marks file reviewed for this session
- unchecking returns it to unreviewed
- state persists across refresh/reconnect
- file list/sidebar should show visual reviewed state
- session summary should show `X / Y reviewed`

### Review Sidebar

The session sidebar should include 4 tabs:

- `Comments`
- `Files`
- `Runs`
- `Summary`

`Comments`
- all review comments grouped by status
- jump to comment in diff

`Files`
- files in session with:
  - comment count
  - reviewed state
  - outdated indicator if needed

`Runs`
- AI fix runs, status, mode, timestamps

`Summary`
- generated or user-edited session summary

---

## Technical Architecture

### High-Level Layers

```text
apps/web
  -> WebSocket client DTOs and review UI

apps/api
  -> thin WS handlers only

crates/core-service
  -> review session orchestration, snapshot creation, run lifecycle, agent workflow

crates/infra
  -> DB entities/repos + file artifact storage

.atmos/review/
  -> persisted replay artifacts
```

### Storage Model

The review domain uses `DB metadata + file artifact storage`.

Use DB for:

- ids
- status
- relationships
- timestamps
- queries, sorting, filters
- compact anchor metadata

Use filesystem for:

- full old/new file contents for replay
- large prompt payloads
- large AI summaries or structured run outputs
- manifest and integrity metadata

This pattern is specific to the review domain. It should not become a blanket rule for all large values in the app.

---

## Filesystem Layout

All review artifacts live under the workspace root:

```text
.atmos/review/
  sessions/
    <session_guid>/
      manifest.json
      diff-files/
        <file_snapshot_id>/
          old
          new
          meta.json
      runs/
        <run_guid>/
          prompt.md
          result.json
          summary.md
          fix.patch
```

`fix.patch` is generated and persisted once a fix run is finalized; it is the
source of truth for the fix-diff view and for the finalize-commit flow.

### Path Rules

- DB stores only relative paths from workspace root
- No absolute paths are persisted
- `file_snapshot_id` is not the source filename; use a stable safe id
- Suggested file snapshot id format:
  - `<ordinal>_<short-hash>`
  - example: `00012_6f8a2b91`

### `manifest.json`

Example shape:

```json
{
  "schema_version": 1,
  "session_guid": "sess_xxx",
  "workspace_guid": "ws_xxx",
  "repo_path": ".",
  "base_ref": "main",
  "base_commit": "abc123",
  "head_commit": "def456",
  "created_at": "2026-04-22T10:00:00Z",
  "file_count": 14
}
```

### `diff-files/<file_snapshot_id>/meta.json`

Example shape:

```json
{
  "schema_version": 1,
  "file_path": "apps/web/src/components/diff/DiffViewer.tsx",
  "git_status": "M",
  "is_binary": false,
  "old_rel_path": ".atmos/review/sessions/sess_xxx/diff-files/00012_6f8a2b91/old",
  "new_rel_path": ".atmos/review/sessions/sess_xxx/diff-files/00012_6f8a2b91/new",
  "old_sha256": "…",
  "new_sha256": "…",
  "old_size": 4210,
  "new_size": 4482
}
```

### Large Artifact Policy

Use file artifacts for:

- old/new replay content
- batch prompt snapshots
- large agent result payloads
- long markdown summaries if they grow large

Do not use file artifacts for:

- comment status
- per-file reviewed state
- searchable comment body text
- run status or timestamps

Those remain in DB.

---

## Database Model

### `review_session`

Fields:

- `guid`
- `workspace_guid`
- `project_guid`
- `repo_path`
- `storage_root_rel_path`
- `base_ref`
- `base_commit`
- `head_commit`
- `status` = `active | closed | archived`
- `current_revision_guid`
- `title` nullable
- `created_by`
- `created_at`
- `updated_at`
- `closed_at` nullable
- `archived_at` nullable

### `review_revision`

Fields:

- `guid`
- `session_guid`
- `parent_revision_guid` nullable
- `source_kind` = `initial | ai_run | manual_promote`
- `fix_run_guid` nullable
- `title` nullable
- `storage_root_rel_path`
- `base_revision_guid` nullable
- `created_by`
- `created_at`

Purpose:

- models session evolution over time
- lets the session contain multiple reviewable snapshots
- provides a stable anchor target when users comment on a later fix result

v1 should restrict revisions to a linear chain:

- one initial revision
- each successful AI fix run may create at most one next revision
- no branching or parallel revision trees

### `review_file_identity`

Fields:

- `guid`
- `session_guid`
- `canonical_file_path`
- `created_at`

Purpose:

- represents the logical file identity across revisions
- lets file review state evolve across revisions even when each revision has a new file snapshot
- keeps reviewed state inheritance rules unambiguous

### `review_file_snapshot`

Fields:

- `guid`
- `revision_guid`
- `file_identity_guid`
- `file_path`
- `git_status`
- `old_rel_path`
- `new_rel_path`
- `meta_rel_path`
- `old_sha256`
- `new_sha256`
- `old_size`
- `new_size`
- `is_binary`
- `display_order`
- `created_at`

Purpose:

- binds a logical source file to a replayable stored snapshot
- gives comments a stable replay target
- stores the concrete file content for one specific revision

### `review_file_state`

Fields:

- `guid`
- `revision_guid`
- `file_identity_guid`
- `file_snapshot_guid`
- `reviewed` boolean
- `reviewed_at` nullable
- `reviewed_by` nullable
- `inherited_from_file_state_guid` nullable
- `last_code_change_at` nullable
- `updated_at`

Purpose:

- drives the GitHub-style `Reviewed` checkbox per file
- independent of comment state
- models per-revision file review state while preserving inheritance across revisions

### `review_comment`

Fields:

- `guid`
- `session_guid`
- `revision_guid`
- `file_snapshot_guid`
- `anchor_side`
- `anchor_start_line`
- `anchor_end_line`
- `anchor_line_range_kind`
- `anchor_json`
- `status` = `open | agent_fixed | fixed | dismissed`
- `parent_comment_guid` nullable
- `title` nullable
- `created_by`
- `created_at`
- `updated_at`
- `fixed_at` nullable

### `review_message`

Fields:

- `guid`
- `comment_guid`
- `author_type` = `user | agent | system`
- `kind` = `comment | reply | summary | status_change`
- `body_storage_kind` = `inline | file`
- `body`
- `body_rel_path` nullable
- `fix_run_guid` nullable
- `created_at`

### `review_fix_run`

Fields:

- `guid`
- `session_guid`
- `base_revision_guid`
- `result_revision_guid` nullable
- `execution_mode` = `copy_prompt | agent_chat | terminal_cli`
- `status` = `queued | running | finalizing | succeeded | partially_succeeded | failed | cancelled`
- `prompt_rel_path` nullable
- `result_rel_path` nullable
- `patch_rel_path` nullable
- `summary_rel_path` nullable
- `agent_session_ref` nullable
- `finalize_attempts`
- `failure_reason` nullable
- `created_by`
- `created_at`
- `started_at` nullable
- `finished_at` nullable

---

## Anchoring Model

Comments should anchor to a snapshot, not to the live repo.

Recommended anchor payload:

```json
{
  "file_path": "apps/web/src/components/diff/DiffViewer.tsx",
  "side": "new",
  "start_line": 42,
  "end_line": 44,
  "line_range_kind": "range",
  "selected_text": "const diff = await gitApi.getFileDiff(repoPath, filePath);",
  "before_context": [
    "try {"
  ],
  "after_context": [
    "setWorkingDiff(parseDiffFromFile(nextOldFile, nextNewFile));"
  ],
  "hunk_header": "@@ -280,6 +280,10 @@"
}
```

High-frequency anchor fields must also be stored as first-class columns on `review_comment`:

- `anchor_side`
- `anchor_start_line`
- `anchor_end_line`
- `anchor_line_range_kind`

`anchor_json` should hold only lower-frequency or replay-specific fields such as:

- `selected_text`
- `before_context`
- `after_context`
- `hunk_header`

Rules:

- anchor always belongs to a `review_file_snapshot`
- each comment is created against one explicit `review_revision`
- replay uses stored `old/new` file contents
- live diff rendering during active review may compare against current working tree, but comment navigation always has a replay fallback
- v1 does not attempt full automatic re-anchoring across later Git states
- if current working diff no longer matches snapshot, UI marks the comment or file as `outdated`

### Revision-Aware Commenting

Users may continue commenting after AI has produced a fix.

To support that cleanly, comments must bind to the revision the user is currently reviewing.

Rules:

- comments created in the initial review snapshot bind to the initial revision
- comments created while viewing a fix result bind to that fix result revision
- the UI must always show which revision is currently commentable

Recommended UI labels:

- `Commenting on: Initial Review`
- `Commenting on: Fix Result R1`
- `Commenting on: Fix Result R2`

This avoids ambiguity about which code version a new comment targets.

---

## Review Session Lifecycle

### Create

When starting a review session:

1. resolve workspace + repo path
2. resolve current compare base and head commit
3. enumerate changed files
4. persist session DB row
5. create `.atmos/review/sessions/<session_guid>/`
6. create initial `review_revision`
7. write `manifest.json`
8. write `revisions.json`
9. for each changed file:
   - create `review_file_identity` if absent in the session
   - capture old content
   - capture new content
   - write replay files
   - insert `review_file_snapshot`
   - insert `review_file_state` with `reviewed = false`

### Active

Allowed actions:

- add comment
- reply
- update comment status
- mark file reviewed/unreviewed
- trigger AI fix run
- move the session's current review focus to a later revision

### Closed

Closed means:

- no new comments by default
- no new file review state edits by default unless explicitly allowed
- replay remains available
- AI run creation disabled by default

### Archived

Archived means:

- hidden from primary active review UI
- searchable in history
- fully replayable

### Revision Progression

A review session is not just one immutable snapshot plus a mutable workspace. It evolves through a sequence of review revisions.

Example:

- `R0`: initial review snapshot
- `R1`: result after fix run 1
- `R2`: result after fix run 2

v1 should model this as a linear revision chain:

- session has one `current_revision_guid`
- each successful fix run may append one next revision
- new comments are created against the current revision by default
- old revisions remain replayable and read-only

### File State Inheritance Across Revisions

When `R(n+1)` is created from `R(n)`, file review state must be propagated explicitly.

Rules:

- unchanged file carried into `R(n+1)`:
  - inherit `reviewed`, `reviewed_at`, and `reviewed_by`
  - `last_code_change_at` is unchanged
- file touched by the fix run:
  - inherit `reviewed`, `reviewed_at`, and `reviewed_by`
  - set `last_code_change_at` to the run completion time
- newly introduced file:
  - initialize with `reviewed = false`
- removed file:
  - preserve the historical state in older revisions
  - in the new revision, mark the snapshot as removed and keep the file state only for replay and lineage

AI changes must not reset `reviewed` to `false`. The user-reviewed fact is durable; “changed after review” is the derived signal (see the persistence rules below).

Persistence rule for `changed_after_review`:

- Only `reviewed`, `reviewed_at`, `reviewed_by`, and `last_code_change_at` are persisted on the file state row.
- `changed_after_review` is **derived, not persisted**: it is computed on read as
  `reviewed_at != null && last_code_change_at > reviewed_at` in both the backend DTO and the UI.

### Commenting on Fix Results

When users review `Fix Diff` and leave more feedback, that feedback should not be forced back onto the initial revision.

Instead:

- the new comment binds to the current revision being viewed
- the new comment may optionally reference `parent_comment_guid` if it is a follow-up to an earlier concern
- the next fix run operates on the current revision, not on the original session revision

This allows iterative review without anchor drift.

---

## Diff Replay Model

Historical replay must not depend on the repository still being in the same state.

Replay should read:

- session manifest
- revisions manifest
- stored old/new file content
- comment anchors
- file reviewed state
- run summaries

Replay view should support:

- open session from history
- browse file list
- see reviewed/unreviewed markers
- reopen comments in correct position
- inspect AI batch runs and replies

If source files no longer exist in the live repo, replay still works because it uses stored artifacts.

---

## Diff Views After AI Fixes

Once AI edits code, the live workspace diff changes. If the product keeps only one mutable diff view, original review comments become hard to understand because their anchors no longer match what the user sees.

The review system should therefore separate three different diff perspectives.

### 1. Review Snapshot Diff

This is the immutable diff captured when the review session was created.

Use it for:

- rendering original review comments
- historical replay
- understanding what the user originally reviewed
- jumping from comment list to the commented location

Properties:

- stable for the lifetime of the session
- never rewritten after AI or user edits
- backed by stored `old/new` artifacts in `.atmos/review/`

### 2. Fix Run Diff

Each AI fix run should persist its own delta artifact showing what that run changed relative to the review state it acted on.

Recommended artifact:

```text
.atmos/review/sessions/<session_guid>/runs/<run_guid>/fix.patch
```

Use it for:

- “what did AI change for this run?”
- per-comment fix inspection
- batch summary inspection
- as the basis for creating the next review revision

Properties:

- scoped to one run
- immutable once the run finishes
- should be viewable even if the workspace later changes again

### 3. Current Workspace Diff

This is the live diff of the workspace after AI and/or user changes.

Use it for:

- current repository state
- follow-up manual review
- deciding whether another fix run is needed

Properties:

- mutable
- can diverge from both the original review snapshot and previous fix runs

### UI Rule

A review session should expose all three perspectives explicitly rather than trying to merge them into one diff.

Recommended labels:

- `Review Snapshot`
- `Fix Diff`
- `Current Changes`

Comment navigation should default to `Review Snapshot`, because that is the only stable view where original comment anchors are guaranteed to remain valid.

When the user is looking at a fix result and adding new comments, the UI should treat that view as a commentable revision surface, not as a transient patch preview only.

### Revision Timeline

The session UI should expose a small revision timeline, for example:

- `Initial Review`
- `Fix Run 1`
- `Fix Run 2`

Selecting a revision should show:

- that revision's snapshot
- comments created on that revision
- open inherited context from earlier revisions where relevant

The main workflow should still default to the current revision to avoid overwhelming the user.

### Why This Separation Is Required

Without this split:

- original comments drift or appear incorrect
- users cannot tell what AI changed for a specific fix run
- replay becomes unreliable
- file-level reviewed state becomes ambiguous

The system should never rely on reattaching old comments directly onto the latest live diff as the only representation.

---

## Reviewed Checkbox Design

### Semantics

`Reviewed` means:

- this file has been manually inspected in this review session

It does not mean:

- all comments are fixed or dismissed
- the file has no problems
- AI has already fixed the file

### UI Placement

Use the diff file header metadata region for the checkbox.

Desired file header content:

```text
<file path>   [Reviewed ✓]   [3 open comments]
```

For file list/sidebar:

- reviewed files show a check icon or muted completed style
- filters:
  - all
  - reviewed
  - unreviewed
  - with open comments

### Behavioral Rules

- marking reviewed persists immediately
- if a new comment is added later, file remains reviewed unless the user manually unchecks it
- v1 should not auto-clear reviewed when AI edits the file
- if the session diff is materially refreshed in a future v2 flow, that should create a new session instead of mutating the old reviewed state

This keeps the semantics simple and stable.

### Derived File State: Changed After Review

AI edits introduce a second important signal: whether a file changed after the user marked it reviewed.

This should be modeled as a derived display state, not a replacement for `reviewed`.

Recommended displayed file states:

- `unreviewed`
- `reviewed`
- `reviewed_then_changed`

Semantics:

- `reviewed` means the user has inspected the file in this session
- `reviewed_then_changed` means the user reviewed it, but later code changes occurred in that file after the review mark

Recommended derivation:

- base persisted flag: `reviewed`
- derived UI flag only: `changed_after_review = reviewed_at != null && last_code_change_at > reviewed_at`

Where `last_code_change_at` can be driven by:

- AI fix run touching the file
- user edits after the review mark if tracked in a future version

v1 may scope this only to Atmos-observed AI fix runs if generic user edit tracking is not yet available.

UI suggestions:

- file list badge: `Reviewed, changed`
- warning or refresh-style icon on file header
- optional sidebar filter: `changed after review`

---

## AI Fix Workflow

### Supported Execution Modes

Three execution modes share the same underlying review capability:

- `copy_prompt`
- `agent_chat`
- `terminal_cli`

### Execution Mode Semantics

`agent_chat` and `terminal_cli` are Atmos-observed execution modes.

`copy_prompt` is not directly observable by Atmos at launch time. Therefore:

- run starts in `queued`
- Atmos does not assume the user has executed anything yet
- the first write operation referencing the run, such as:
  - comment reply
  - comment status update
  - run summary write
  - finalize call
  implicitly transitions the run to `running`

This keeps `copy_prompt` transparent to skills and avoids introducing a separate “start” protocol.

### Batch Fix Flow

1. user selects `Fix Open Comments` or `Fix Selected Comments`
2. system creates `review_fix_run`
3. system generates prompt artifact under `runs/<run_guid>/prompt.md`
4. execution mode launches
5. AI reads structured review context
6. AI edits code
7. AI posts per-comment replies
8. system finalizes the run by generating and persisting `fix.patch` from:
   - the run's `base_revision_guid` snapshot
   - the current workspace state after AI edits
9. system creates next `review_revision` from the run result
10. AI writes batch summary
11. system updates run status

### Finalization and Commit Point

The run must have an explicit finalize phase because result persistence spans both filesystem artifacts and DB rows.

Recommended lifecycle:

- `queued`
- `running`
- `finalizing`
- terminal state: `succeeded | partially_succeeded | failed | cancelled`

`finalize_attempts` is an internal operational counter used for reconcile/debug visibility. It is incremented each time Atmos attempts the finalize pipeline again after an interrupted or failed finalize. v1 does not need to expose a user-facing retry budget based on this field.

Commit point:

The run may only leave `finalizing` after all of the following succeed:

- patch artifact written
- revision artifacts written
- `review_revision` row committed
- `review_file_snapshot` rows committed
- inherited/new `review_file_state` rows committed
- comment replies committed
- batch summary committed
- session `current_revision_guid` updated

### Recovery from Partial Finalization

If the process crashes or a DB transaction fails during finalize, the system must be able to reconcile.

Recommended recovery behavior:

- any run stuck in `finalizing` is considered recoverable
- on service startup or session open, Atmos may trigger reconcile for such runs
- reconcile checks:
  - artifact existence
  - revision row existence
  - file snapshot row existence
  - summary existence
  - session current revision pointer
- if the finalize steps can be completed safely, continue and finish the run
- otherwise mark the run `failed` with a `failure_reason`

This prevents a state where the filesystem contains a patch but the DB has no corresponding revision lineage.

### Iterative Fixing

After a run completes, users may continue reviewing the resulting fix diff and leave more comments.

In that case:

- those new comments target the newly created revision
- the next fix run uses that new revision as its base
- the session becomes an iterative chain of review -> fix -> review -> fix

This is why the session must support multiple revisions instead of a single immutable snapshot only.

### Reply Rules

For each comment, AI should post:

- what it changed, or
- why it did not change anything, or
- what clarification is needed

Batch summary should include:

- total comments attempted
- fixed comments
- skipped comments
- failed comments
- files touched

### Status Rules

Recommended default:

- user comment starts as `open`
- when included in a running batch, comment stays `open` while a fix run is in progress
- if AI handled it, comment becomes `agent_fixed`
- only user action moves comment to `fixed`

This avoids AI self-resolving review feedback without user confirmation.

### Comment-Level Fix Inspection

Each AI reply should link the original comment to the corresponding fix run.

Recommended per-comment metadata:

- `fix_run_guid`
- `touched_files`
- `handled` boolean
- `result_kind` = `fixed | skipped | failed | needs_clarification`

Comment UI should offer:

- original commented location in `Review Snapshot`
- AI reply text
- `View Fix Diff` action

`View Fix Diff` should open the run-scoped delta, not just jump into the mutable live workspace diff.

This makes it clear:

- what the original concern was
- what AI changed in response
- what still needs user confirmation

### Follow-Up Feedback on a Fix

When a user comments on a fix result, there are two valid models:

- continue in the existing logical comment
- create a follow-up comment linked to the earlier one

Recommended v1 choice:

- create a new comment on the current revision
- optionally set `parent_comment_guid` to the earlier comment it follows up on

This is simpler than letting one comment carry multiple anchors across multiple revisions while still preserving lineage.

---

## Status Derivation After AI Changes

### Comment Status

Recommended comment statuses remain:

- `open`
- `agent_fixed`
- `fixed`
- `dismissed`

Meaning after AI runs:

- `open`: user raised concern, not yet processed
- `agent_fixed`: AI replied and likely changed code; user still needs to inspect the fix
- `fixed`: user explicitly confirmed the comment is done
- `dismissed`: user decided no fix is needed

AI should never automatically move a comment to `fixed`.

### File Review State

The file reviewed checkbox remains a user-driven flag.

AI code changes should not silently uncheck it. Instead, the UI derives `reviewed_then_changed`.

This preserves two truths independently:

- “I reviewed this file”
- “the file changed after that review”

That is much more informative than simply clearing the checkbox.

### Session Summary Signals

At the session level, expose:

- reviewed files count
- reviewed-then-changed files count
- open comments count
- needs-user-check comments count

This gives users an immediate answer to:

- what has been reviewed
- what changed after review
- what still needs confirmation

---

## Atmos Review Capability

AI should not infer how to manipulate review data from prompts alone. Atmos must expose explicit review operations.

Recommended capability surface:

### CLI Commands

```bash
atmos review session show --session <id>
atmos review session files --session <id>
atmos review comment list --session <id> --status open
atmos review comment get --comment <id>
atmos review comment context --comment <id>
atmos review comment reply --comment <id> --body-file <path>
atmos review comment update-status --comment <id> --status agent_fixed
atmos review run summarize --run <id> --body-file <path>
```

Large `review_message` bodies should use a spillover policy:

- default small bodies stay inline in DB
- if body exceeds a configured threshold, such as `16 KB` or `32 KB`:
  - store a truncated preview in DB
  - write full body to a file artifact
  - set `body_storage_kind = file`

This keeps DB rows queryable while preventing oversized agent replies from becoming large unindexed blobs.

### Core Principles

- CLI and Agent Chat use the same service layer
- skills define workflow, not storage details
- review context is fetched through commands, not reconstructed ad hoc
- replies and summaries are written through explicit review commands

---

## Agent Skill Workflow

The review-fix skill should define this workflow:

1. list open comments for the session or selected run scope
2. for each comment:
   - read context
   - inspect code
   - decide whether a fix is appropriate
3. apply code changes
4. post one reply per comment
5. update each handled comment to `agent_fixed`
6. write run summary

Skill responsibilities:

- execution ordering
- tone and reply shape
- failure handling
- no silent completion

Capability responsibilities:

- reading review data
- writing replies
- updating statuses
- locating snapshot artifacts

---

## WebSocket API

This feature should be WS-first like the rest of the app.

Recommended actions:

- `review_session_create`
- `review_session_get`
- `review_session_list`
- `review_session_close`
- `review_session_archive`
- `review_session_replay`
- `review_file_list`
- `review_file_set_reviewed`
- `review_comment_create`
- `review_comment_list`
- `review_comment_get`
- `review_comment_update_status`
- `review_message_add`
- `review_fix_run_create`
- `review_fix_run_get`
- `review_fix_run_list`

Recommended notifications:

- `review.session.updated`
- `review.file.updated`
- `review.comment.created`
- `review.comment.updated`
- `review.message.created`
- `review.run.updated`

Each notification payload should include at least:

- `entity_guid`
- `updated_at`
- `changed_fields`

Example:

```json
{
  "event": "review.comment.updated",
  "data": {
    "entity_guid": "comment_xxx",
    "updated_at": "2026-04-22T12:34:56Z",
    "changed_fields": ["status", "updated_at"]
  }
}
```

This lets the frontend perform targeted cache updates instead of reloading entire entities after every event.

---

## Service Responsibilities

### `infra`

- SeaORM entities and repos
- file artifact writer/reader
- atomic file write utility
- integrity/hash helpers

### `core-service`

- create session snapshot
- enforce lifecycle rules
- orchestrate comment creation and file review state
- orchestrate fix run creation
- translate agent outputs into review replies and summaries
- expose DTO-friendly service methods

### `apps/api`

- thin WS handlers
- DTO conversion only

### `apps/web`

- review session UI
- diff comment annotations
- file reviewed checkbox
- replay browsing
- run status display

---

## Integrity, Consistency, and GC

### Atomic Writes

All artifact writes should be:

1. write to temp file
2. flush
3. rename into place
4. only then commit/update DB transaction state

This minimizes partial session corruption.

### Integrity

Store:

- `schema_version`
- `sha256`
- `size`
- `is_binary`

Use these for:

- corruption detection
- debugging
- future migrations

### Session and Revision Manifests

Use:

- `manifest.json` for session-level metadata
- `revisions.json` for revision chain metadata

`revisions.json` should record:

- `revision_guid`
- `parent_revision_guid`
- `source_kind`
- `fix_run_guid`
- `storage_root_rel_path`
- `created_at`

This makes offline inspection, migration, and recovery tooling practical without forcing all lineage reconstruction through DB joins only.

### Path Safety

Do not use raw human-facing identifiers as artifact directory names unless they are already guaranteed to be short and path-safe.

Recommended rule:

- DB stores full GUIDs
- filesystem uses a URL-safe or hashed directory id, such as a short encoded guid or truncated hash
- manifests record the mapping between logical GUID and on-disk directory id

This reduces cross-platform path issues and keeps artifact paths predictable.

### Cleanup

Do not garbage-collect archived review sessions in v1.

Recommended v1 retention rule:

- archived sessions remain until explicit deletion support is added

This matches the historical replay goal.

---

## Alternatives Considered

### Option A: DB-only storage

Rejected because:

- full old/new file contents can become large
- replay artifacts are a poor fit for hot DB rows
- migration and read amplification are worse

### Option B: Session without explicit product object

Rejected because:

- unclear lifecycle
- poor replay/history UX
- difficult to reason about file reviewed state

### Option C: Only skill, no Atmos review capability

Rejected because:

- agent cannot reliably read or reply to review comments
- prompt-only coupling is fragile
- terminal and chat flows would diverge

---

## v1 Scope

Include in v1:

- explicit review session create / close / archive
- snapshot persistence under `.atmos/review/`
- DB metadata + file artifacts
- diff comments as review comments
- per-file `Reviewed` checkbox
- historical replay
- AI fix runs with:
  - Agent Chat
  - terminal CLI
  - per-comment replies
  - batch summary
- `atmos review` capability surface

Exclude from v1:

- GitHub PR sync
- multi-reviewer attribution UI
- auto-reanchor onto newer diffs
- session merge or refresh-in-place
- delete/retention policies beyond archive

---

## Testing Strategy

### Backend

- create session with N changed files
- verify manifest and diff artifacts written
- verify DB rows point to valid relative paths
- verify comment anchors resolve against stored snapshot
- verify reviewed state persists and reloads correctly
- verify run artifacts and status transitions

### Frontend

- start session from diff view
- mark file reviewed/unreviewed
- add comment on single line and range
- jump from comment list to diff position
- replay archived session
- display reviewed counts and file filters

### Agent Workflow

- CLI reads open comments
- CLI writes per-comment reply
- CLI writes batch summary
- failed run leaves comments non-fixed
- handled run sets comments to `agent_fixed`

### Edge Cases

- source file later deleted from repo
- binary file exists in changed set
- session creation interrupted midway
- reconnect after WS disconnect
- archived session replay after workspace evolves

---

## Open Follow-Ups

- whether session title is user-entered, generated, or both
- whether closed sessions allow late manual replies
- whether AI should be allowed to mark files reviewed automatically in any future mode
- whether replay should offer side-by-side snapshot-only rendering when live diff diverges

These can be decided during implementation without changing the core architecture above.
