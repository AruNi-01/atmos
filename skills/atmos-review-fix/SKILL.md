---
name: atmos-review-fix
version: "2.0.0"
description: Handle an Atmos review fix run by reading review comments, editing code, replying to each comment with the installed `atmos review` CLI, writing a run summary, and finalizing the run into a new review revision.
user-invokable: true
---

Atmos-specific workflow for fixing comments inside a review session.

Use this skill whenever the prompt includes a review fix run payload or asks you to process Atmos review comments with Atmos' installed review CLI.

## Goal

Given a review run:

1. inspect the selected review comments and their snapshot context
2. modify the working tree to address the comments
3. reply to each handled comment
4. move handled comments to `agent_fixed`
5. write one run summary
6. finalize the run so Atmos creates the next review revision and `fix.patch`

Do not mark comments `fixed` automatically.

## Required CLI commands

- `atmos review session-show --session <session_guid>`
- `atmos review comment-list --session <session_guid>`
- `atmos review comment-context --comment <comment_guid>`
- `atmos review reply-comment --comment <comment_guid> --body-file <path>`
- `atmos review update-comment-status --comment <comment_guid> --status agent_fixed`
- `atmos review summarize-run --run <run_guid> --body-file <path>`
- `atmos review finalize-run --run <run_guid>`

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

### 2. Inspect every comment before editing

For each selected comment:

1. run `comment-context`
2. read the stored snapshot paths it returns
3. understand the user comment and the target code region

Do not skip comment-context lookup. The review snapshot is the source of truth, not the current diff UI.

### 3. Edit the workspace

Make the smallest coherent code change that addresses the comment set.

Rules:

- prefer one pass that handles multiple related comments together
- preserve unrelated local changes
- do not revert user work
- if a comment cannot be fully addressed, still reply with the blocker clearly

### 4. Reply to each comment

After handling a comment, write a short markdown reply to a temp file and post it with:

```bash
atmos review reply-comment --comment <comment_guid> --body-file <path>
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

Then run:

```bash
atmos review summarize-run --run <run_guid> --body-file <path>
```

### 6. Finalize the run

Only after replies and summary are written:

```bash
atmos review finalize-run --run <run_guid>
```

This creates the next review revision and persists `fix.patch`.

## Expected behavior

- Be explicit in comment replies.
- Keep summaries concise and factual.
- Do not invent success if the code change was not made.
- Do not leave the run un-finalized after successful edits and replies.
