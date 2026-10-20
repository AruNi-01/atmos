# TECH · QUALITY-017: Git Blob Directory Allowlist

> Technical Design · HOW. Closes the follow-up left by QUALITY-015: `GET /api/system/git-blob` must use the same directory allowlist as `GET /api/system/file`. Quality spec. No BRAINSTORM or PRD.

## Scope summary

Issue https://github.com/AruNi-01/atmos/issues/332. `serve_git_blob` in `apps/api/src/api/system/files.rs` accepts any absolute directory as `repo` and runs `git` there. A caller who can reach the API can read blobs from a git directory outside the project and workspace roots.

In scope:

1. Before `git`, canonicalize `repo` and require that path to sit inside the QUALITY-015 directory roots.
2. A symlink whose target leaves those roots, and a `..` path that canonicalizes outside them, return 403 and do not return blob bytes.
3. Share the directory-root check with `serve_allowed_file`. Do not copy a second root list or a second filesystem-root skip.
4. Keep today's rev/path checks and the 8 MiB response cap.

Out of scope: new REST routes, WebSocket messages, URL-builder changes, oxlint `--max-warnings` above 455, and treating a stored project logo file as a git root. Exact logo files stay a file-serve-only exception.

## Quality target

| Item                                  | Before                                    | After                                                                     |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| `repo`                                | Any absolute directory                    | Canonical path must be inside a directory root from `allowlist_for_state` |
| Symlink to a repo outside those roots | `git` runs in the target                  | 403, body is not the blob                                                 |
| `..` that leaves the roots            | `git` runs in the resolved directory      | 403, body is not the blob                                                 |
| Rev / path                            | 400 on unsafe rev, path, or index spec    | Same 400s                                                                 |
| Size                                  | Reject above 8 MiB (`GIT_BLOB_MAX_BYTES`) | Same cap, 413 `Blob too large`                                            |
| Roots                                 | Built once for `/api/system/file`         | Same `FileServeAllowlist.directory_roots`                                 |

## Architecture overview

```
GET /api/system/git-blob
  serve_git_blob(State, Query)
    allowlist_for_state          # already used by serve_file
    serve_allowed_git_blob
      rev/path checks            # unchanged helpers
      canonicalize(repo)
      find_containing_directory_root
        canonicalize_directory_root + Path::starts_with
      GIT_CEILING_DIRECTORIES = parent(matched root)
      rev-parse --show-toplevel --absolute-git-dir
        both canonical paths must stay in that same root
      show_git_blob_bytes_with_ceiling
      8 MiB cap
```

No new crate, table, or route. The route stays `GET /api/system/git-blob` in `apps/api/src/api/system/mod.rs`. It stays REST because it streams blob bytes (existing exception in `apps/api/AGENTS.md`).

## Module-by-module design

### `apps/api/src/api/system/files.rs`

Shared helper, used by file serve and git-blob:

```rust
pub(crate) fn find_containing_directory_root<'a>(
    canonical: &'a Path,
    roots: &[PathBuf],
) -> Option<(&'a Path, PathBuf)>
```

For each configured root it canonicalizes the root, skips a root whose canonical path has `parent() == None` (filesystem root), and returns the first pair where `canonical.starts_with(&root)`. `Path::starts_with` is component-wise, so a root `/tmp/ws` does not contain `/tmp/ws-evil`.

`serve_allowed_file` replaces its open root loop with this helper. The file open stays in the caller's `if path.starts_with(&root)` branch so the CodeQL `Path::starts_with` barrier still sits next to `is_file` / `metadata` / `open`. Exact logo files stay a second loop in `serve_allowed_file` only.

`serve_git_blob` takes `State<AppState>` and loads the allowlist with `allowlist_for_state`. A project-list error is 500 `File access policy unavailable` and does not fall open (same as file serve). The handler then calls `serve_allowed_git_blob`, which tests use without a database.

`serve_allowed_git_blob` order:

1. Trim `repo`. Empty, NUL, or non-absolute → 400 `Invalid repo path`. Not a directory → 400 `Invalid repo path`. `is_dir` follows symlinks, so a symlink to a directory still reaches the allowlist check.
2. Existing rev/path checks, unchanged:
   - `rev` starting with `:` must pass `parse_index_show_spec`, else 400 `Invalid index blob rev`.
   - Otherwise `is_safe_git_rev`, else 400 `Invalid rev`.
   - `path` must pass `is_safe_repo_relative_path`, else 400 `Invalid path`.
3. `std::fs::canonicalize(repo)`. Failure → 403 `Repo is outside the allowed directories`. Do not run `git` on the raw query path.
4. `find_containing_directory_root`. No match → 403 with the same message. Do not run `git`.
5. On a match, require `path.starts_with(&root)` again in this function. The ceiling is `root.parent()` (the matched root always has a parent because filesystem roots are skipped). Every git subprocess for this request sets `GIT_CEILING_DIRECTORIES` to that parent, so git stops before entering it and cannot discover an ancestor repository.
6. Still inside that branch, `resolve_git_repo_identity` runs `git rev-parse --show-toplevel --absolute-git-dir`. Both lines are canonicalized and must `starts_with` the same matched root. A failure to resolve an identity (including "not a git repository" after the ceiling stops the walk) is 403. A toplevel or git dir outside that root is 403, and `cat-file` does not run. This rejects a `.git` file whose `gitdir:` points outside the root.
7. `show_git_blob_bytes_with_ceiling` then reads the blob with the same ceiling. Join error or a failure to execute `git` → 500 `Failed to read blob`. A repository whose identity is inside the root but whose blob is missing → 404 `Blob not found`.
8. `bytes.len() > GIT_BLOB_MAX_BYTES` (8 × 1024 × 1024) → 413 `Blob too large`.

Success headers stay `content-type`, `content-length`, and `cache-control: private, max-age=60`.

Directory roots are the QUALITY-015 set: each project's `main_file_path`, `GitEngine::get_workspaces_base_dir()`, `default_agent_data_dir()`, and `ATMOS_FILE_SERVE_ROOTS`. Git-blob does not consult `exact_files`. A logo path is a file, not a repository root.

### `apps/api/AGENTS.md`

The git-blob paragraph states that `repo` must stay inside those directory roots, that the git subprocess sets `GIT_CEILING_DIRECTORIES` to the parent of the matched root, and that `rev-parse --show-toplevel --absolute-git-dir` must canonicalize inside that same root. An ancestor repository or a `gitdir:` file that leaves the root is 403.

### Callers

`apps/web/src/features/diff/lib/resolve-blob-url.ts` sends the project or worktree `repoPath`. A project checkout is its own directory root, so its git dir stays inside that root. A linked worktree whose checkout is under the workspaces base and whose git dir is under the project checkout spans two roots and is 403 until a follow-up allows a git dir in a second directory root on the same allowlist. The URL builder does not change. Desktop and mobile do not call this endpoint.

## Data model

No new types on the wire. `ServeGitBlobQuery` stays `{ repo, rev, path }`.

`FileServeAllowlist` is unchanged. Git-blob reads `directory_roots` only.

## Transport

No new WebSocket message. No new REST route.

`GET /api/system/git-blob?repo=&rev=&path=` remains a byte response for diff previews. Justification: binary payload, already classified as REST. This change only restricts which repository directory may be read.

## Security & permissions

- Loopback and token rules are unchanged (QUALITY-015).
- Blob bytes are read only after canonicalize plus `Path::starts_with` on a directory root.
- `git` `current_dir` is that canonical path, not the raw `repo` string.
- `ATMOS_FILE_SERVE_ROOTS=/` still does not allow every path.
- Rejection logs the canonical path. They do not log blob bytes.
- Rev and path strings are still rejected before `git` when they contain `..`, an absolute path, NUL, or an option-like rev. Those responses stay 400 even when the repo would also fail the allowlist, so the old checks do not change status.

## Rollout plan

1. Add this spec and the `specs/README.md` QUALITY-017 row. Commit the spec before code.
2. Add `find_containing_directory_root` and switch `serve_allowed_file` onto it. Existing file-serve tests stay green.
3. Check the allowlist in `serve_git_blob` / `serve_allowed_git_blob`, with tests for an allowed repo, an outside repo, `..`, and a symlink escape.
4. Draft PR against `main`. Do not merge.

## Risks & tradeoffs

- **Risk**: a diff preview whose `repo` is not under a project root, the workspaces base, the agent data dir, or `ATMOS_FILE_SERVE_ROOTS` now returns 403. The web caller passes a project or worktree path, which is in that set. An operator who pointed the preview at some other checkout adds that directory to `ATMOS_FILE_SERVE_ROOTS`.
- **Tradeoff**: one helper plus a second `starts_with` at each sink, instead of a boolean wrapper that hides `starts_with` from the function that opens the file or runs `git`. The extra check keeps the CodeQL path-injection barrier next to the sink.
- **Tradeoff**: exact logo files do not authorize git-blob. No current caller needs a logo path as `repo`.
- **Residual**: canonicalize-then-`git` is still a TOCTOU window. The process `current_dir` is the canonical path that passed `starts_with`, and the git subprocess also sets `GIT_CEILING_DIRECTORIES` to the parent of that root.
- **Residual**: `current_dir` alone does not stop git from walking to an ancestor repository outside the allowlist (for example a dotfiles repo on `$HOME` when `repo` is a non-repo directory under `~/.atmos/data/workspaces`). The ceiling is the parent of the matched root, so that walk stops before leaving the root. If identity resolution still fails, the response is 403 and the blob is not read.
- **Residual**: a `.git` file inside the root can still name an external object store with `gitdir:`. Ceiling does not block that pointer. Before `cat-file`, both `--show-toplevel` and `--absolute-git-dir` are canonicalized and must sit in the same matched root; otherwise the response is 403.
- **Residual**: a linked worktree whose checkout is under one allowlist root and whose `absolute-git-dir` is under a different root (the usual Atmos layout: worktree under the workspaces base, git dir under the project checkout) is 403. A linked worktree whose git dir stays inside the same matched root is still served. Widening git-dir to any directory root on the same allowlist is a follow-up, not this fix.
- **Residual**: the identity check is `--show-toplevel` and `--absolute-git-dir` only. A `.git` file whose git dir stays inside the root, while that git dir's `commondir` points at an object store outside the root, is not rejected by this check.
- **If this breaks a preview**: add the checkout's parent to `ATMOS_FILE_SERVE_ROOTS`, or revert the allowlist check in `serve_allowed_git_blob`.

## Dependencies & compatibility

- Depends on QUALITY-015 `FileServeAllowlist` / `allowlist_for_state` in `apps/api/src/api/system/files.rs`.
- Blocks: none. Implements https://github.com/AruNi-01/atmos/issues/332.
- Next free id after QUALITY-016.
- Lint cap stays `oxlint --max-warnings=455` in `package.json`.
- No manifest or client change.

## Open questions

None. Git-blob uses directory roots only.
