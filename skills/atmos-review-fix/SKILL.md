---
name: atmos-review-fix
version: "1.0.0"
description: Handle an Atmos review fix run by reading review threads, editing code, replying to each thread with the installed `atmos review` CLI, writing a run summary, and finalizing the run into a new review revision.
user-invokable: true
---

Atmos-specific workflow for fixing comments inside a review session.

Use this skill whenever the prompt includes a review fix run payload or asks you to process Atmos review comments with Atmos' installed review CLI.

## Goal

Given a review run:

1. inspect the selected review threads and their snapshot context
2. modify the working tree to address the comments
3. reply to each handled thread
4. move handled threads to `needs_user_check`
5. write one run summary
6. finalize the run so Atmos creates the next review revision and `fix.patch`

Do not mark threads `resolved` automatically.

## Required CLI commands

- `atmos review session-show --session <session_guid>`
- `atmos review thread-list --session <session_guid>`
- `atmos review thread-context --thread <thread_guid>`
- `atmos review reply-thread --thread <thread_guid> --body-file <path>`
- `atmos review update-thread-status --thread <thread_guid> --status needs_user_check`
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
- selected `thread guid` values

### 2. Inspect every thread before editing

For each selected thread:

1. run `thread-context`
2. read the stored snapshot paths it returns
3. understand the user comment and the target code region

Do not skip thread-context lookup. The review snapshot is the source of truth, not the current diff UI.

### 3. Edit the workspace

Make the smallest coherent code change that addresses the comment set.

Rules:

- prefer one pass that handles multiple related comments together
- preserve unrelated local changes
- do not revert user work
- if a comment cannot be fully addressed, still reply with the blocker clearly

### 4. Reply to each thread

After handling a thread, write a short markdown reply to a temp file and post it with:

```bash
atmos review reply-thread --thread <thread_guid> --body-file <path>
```

The reply should state one of:

- fixed and what changed
- partially fixed and what remains
- not fixed and why

Then move the thread to:

```bash
atmos review update-thread-status --thread <thread_guid> --status needs_user_check
```

If the thread was not addressed at all, leave status unchanged.

### 5. Write a run summary

Create one short markdown summary covering:

- threads handled
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

- Be explicit in thread replies.
- Keep summaries concise and factual.
- Do not invent success if the code change was not made.
- Do not leave the run un-finalized after successful edits and replies.
