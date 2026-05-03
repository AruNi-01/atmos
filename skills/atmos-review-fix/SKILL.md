---
name: atmos-review-fix
version: "2.1.0"
description: Handle an Atmos review fix run by reading review comments, marking run status with the installed `atmos review` CLI, editing code, replying to each comment, writing a run summary, and finalizing the run into a new review revision.
user-invokable: true
---

Atmos-specific workflow for fixing comments inside a review session.

Use this skill whenever the prompt includes a review fix run payload or asks you to process Atmos review comments with Atmos' installed review CLI.

## Goal

Given a review run:

1. mark the run `running`
2. inspect the selected review comments and their snapshot context
3. verify each issue exists and the requested fix is reasonable
4. modify the working tree to address the comments
5. reply to each handled comment
6. move handled comments to `agent_fixed`
7. write one run summary and mark the run `succeeded` so Atmos updates the review revision snapshots and generates `fix.patch`

Do not mark comments `fixed` automatically.

## Required CLI commands

- `atmos review session-show --session <session_guid>`
- `atmos review comment-list --session <session_guid>`
- `atmos review comment-context --comment <comment_guid>`
- `atmos review set-status --run <run_guid> running`
- `atmos review reply-comment --comment <comment_guid> --run <run_guid> --body-stdin`
- `atmos review update-comment-status --comment <comment_guid> --status agent_fixed`
- `atmos review summarize-run --run <run_guid> --body-stdin`
- `atmos review set-status --run <run_guid> succeeded --summary-stdin`
- `atmos review set-status --run <run_guid> failed --message "<reason>"`

The Atmos API installs this CLI on startup and Atmos-managed terminal sessions expose it on `PATH`.

## Workflow

### 1. Read the run payload

The prompt will contain XML like:

```xml
<review-fix-run>
  <session guid="..." current_revision_guid="..." />
  <run guid="..." execution_mode="..." />
  ...
</review-fix-run>
```

Extract:

- `session guid`
- `run guid`
- selected `comment guid` values

### 2. Inspect and validate every comment before editing

Before inspecting or editing, mark the run as started:

```bash
atmos review set-status --run <run_guid> running
```

For each selected comment:

1. run `comment-context`
2. read the stored snapshot paths it returns
3. understand the user comment and the target code region
4. verify that the issue exists and that the requested change is reasonable

Do not skip comment-context lookup. The review snapshot is the source of truth, not the current diff UI. Do not blindly edit just because a comment exists; if the comment is incorrect or unclear, reply with that finding instead of forcing a code change.

### 3. Edit the workspace

Make the smallest coherent code change that addresses the comment set.

Rules:

- prefer one pass that handles multiple related comments together
- preserve unrelated local changes
- do not revert user work
- if a comment cannot be fully addressed, still reply with the blocker clearly

### 4. Reply to each comment

After handling a comment, post a short markdown reply via stdin. Do not create reply files in the workspace.

```bash
atmos review reply-comment --comment <comment_guid> --run <run_guid> --body-stdin <<'EOF'
Fixed by ...
EOF
```

The reply should state one of:

- fixed and what changed
- partially fixed and what remains
- not fixed and why

Then move the comment to:

```bash
atmos review update-comment-status --comment <comment_guid> --status agent_fixed
```

If the comment was not addressed at all, leave status unchanged.

### 5. Write a run summary

Create one short markdown summary covering:

- comments handled
- key files changed
- any remaining risks or follow-ups

Then either run:

```bash
atmos review summarize-run --run <run_guid> --body-stdin <<'EOF'
- Handled ...
- Updated ...
EOF
```

or pass the summary via stdin to the final status command in the next step.

### 6. Complete or fail the run

Only after replies and summary are written:

```bash
atmos review set-status --run <run_guid> succeeded --summary-stdin <<'EOF'
- Handled ...
- Updated ...
EOF
```

This updates the review revision snapshots and persists `fix.patch`.

If you cannot continue the run, report the failure instead:

```bash
atmos review set-status --run <run_guid> failed --message "<short reason>"
```

## Expected behavior

- Be explicit in comment replies.
- Keep summaries concise and factual.
- Do not invent success if the code change was not made.
- Do not leave the run running after successful edits and replies.
