# Atmos Review CLI Reference

Shared reference for the `atmos review` CLI used by Atmos review sessions. The `atmos-review-fix`, `code-review-expert`, `fullstack-reviewer`, and `typescript-react-reviewer` skills all point here so the commands stay in one place.

The CLI is installed by the Atmos API on startup and is available on `PATH` inside Atmos-managed terminal sessions (desktop, web runtime, workspace terminals).

Every command prints a single JSON document on stdout and exits non-zero with an error message on failure.

## Session targets

A review session targets either a **workspace** or a **project**, and agents must respect the difference when editing code:

| Target | Identifier | Repo path used by Atmos | Isolation |
|---|---|---|---|
| Workspace | `workspace_guid` set, derived `project_guid` | Workspace git worktree | Isolated from the project's main checkout |
| Project | `project_guid` set, `workspace_guid` is null | Project's main checkout | **None** — shares the working tree with the user |

Implications:

- CLI commands below operate on `--session` / `--comment` / `--run` GUIDs and work identically for both target kinds.
- `session-list` is the only command where the target matters at the CLI surface: pass **exactly one** of `--workspace <guid>` or `--project <guid>`.
- When making edits for a **project-level** session, preserve all unrelated staged, unstaged, and untracked files — there is no worktree safety net.
- Target kind and identifiers are visible in the output of `session-show`.

## Body input convention

Commands that accept a body (`reply-comment`, `create-comment`, `summarize-run`, and the `--summary*` options on `finalize-run` / `set-status`) accept exactly one of:

- `--body "<inline text>"` — short single-line bodies
- `--body-file <path>` — read from a file (use `-` for stdin)
- `--body-stdin` — read from stdin (preferred for multi-line markdown)

Passing more than one of these for the same body is an error.

## Session discovery

```bash
# List sessions for a workspace (the --workspace / --project args are mutually exclusive)
atmos review session-list --workspace <workspace_guid> [--include-archived]

# List sessions for a project (project-level review sessions, no workspace)
atmos review session-list --project <project_guid> [--include-archived]

# Show a single session by GUID (target-agnostic)
atmos review session-show --session <session_guid>
```

`session-list` is rarely needed during an agent run — the run prompt already carries the session GUID. Use it when you need to discover sessions for a given workspace or project.

## Comment reading

```bash
# List all comments for a session (optionally filter to a specific revision)
atmos review comment-list --session <session_guid> [--revision <revision_guid>]

# Read the stored snapshot context for a single comment (the source of truth for fix runs)
atmos review comment-context --comment <comment_guid>
```

## Comment writing

```bash
# Reply to an existing comment (creates a message on that comment thread)
atmos review reply-comment \
  --comment <comment_guid> \
  --run <run_guid> \
  --body-stdin <<'EOF'
Reply markdown here.
EOF

# Create a new inline comment on a file line range (used by reviewers to report findings)
atmos review create-comment \
  --session <session_guid> \
  --revision <current_revision_guid> \
  --file <path> \
  --side new \
  --start-line <n> \
  --end-line <n> \
  --title "<short title>" \
  --run <run_guid> \
  --body-stdin <<'EOF'
Severity: P1
Issue: ...
Suggestion: ...
EOF

# Update a comment's status (e.g. mark as agent_fixed after applying a fix)
atmos review update-comment-status \
  --comment <comment_guid> \
  --status <status>
```

`--side` is `new` for the post-change side of the diff and `old` for the pre-change side. `--author` defaults to `agent` for both `create-comment` and `reply-comment`.

## Agent runs

```bash
# Create a new agent run on an existing session (Atmos normally does this for you)
atmos review create-agent-run \
  --session <session_guid> \
  --base-revision <revision_guid> \
  --run-kind <review|fix> \
  [--execution-mode <copy_prompt|agent_chat|terminal_cli>] \
  [--skill-id <skill>] \
  [--comment <comment_guid> ...] \
  [--created-by <name>]

# Write / overwrite the run summary
atmos review summarize-run --run <run_guid> --body-stdin <<'EOF'
- Handled ...
- Updated ...
EOF

# Mark run status (use this as the last step of every run)
atmos review set-status --run <run_guid> running
atmos review set-status --run <run_guid> succeeded --summary-stdin <<'EOF'
<summary>
EOF
atmos review set-status --run <run_guid> failed --message "<short reason>"

# Finalize a succeeded run and optionally set its title + summary in one call
atmos review finalize-run \
  --run <run_guid> \
  [--title "<title>"] \
  [--summary-stdin]
```

For fix runs, `set-status succeeded` finalizes the run, rolls the review revision snapshots, and persists `fix.patch`. For review runs, `set-status succeeded` just closes out the run — comments created via `create-comment` during the run are what persist.

## Status reference

Run statuses:

- `running` — mark at the start of a run
- `succeeded` — the only status that finalizes a fix run and rolls snapshots
- `failed` — accompanied by `--message "<reason>"`

Common comment statuses:

- `open` — default for reviewer-created comments
- `agent_fixed` — set by the fix agent after it applies a change
- `fixed` — user confirms the fix landed (agents should not set this automatically)
- `wontfix` / `archived` — user-driven terminal states
