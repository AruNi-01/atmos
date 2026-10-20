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
      drop inherited GIT_DIR / GIT_WORK_TREE / GIT_COMMON_DIR /
        GIT_OBJECT_DIRECTORY / GIT_ALTERNATE_OBJECT_DIRECTORIES
      rev-parse --show-toplevel --absolute-git-dir --git-common-dir
        each canonical path must sit in some directory root
      parse <common-dir>/objects/info/alternates
        recursive, depth > 5 is 403, cycle is 403
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
5. On a match, require `path.starts_with(&root)` again in this function. The ceiling is `root.parent()` (the matched root always has a parent because filesystem roots are skipped). Every git subprocess for this request sets `GIT_CEILING_DIRECTORIES` to that parent, so git stops before entering it and cannot discover an ancestor repository. The same subprocesses `env_remove` `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, and `GIT_ALTERNATE_OBJECT_DIRECTORIES`. Other git commands in `core-engine` do not set the ceiling and do not clear those variables.
6. Still inside that branch, `resolve_git_repo_identity` runs `git rev-parse --show-toplevel --absolute-git-dir --git-common-dir`. Each line is canonicalized (a relative path, usually `.git` for `--git-common-dir` on a normal repository, is joined to the repo directory first) and must `starts_with` some canonical directory root from the allowlist. The three paths do not have to share one root. A failure to resolve an identity (including "not a git repository" after the ceiling stops the walk) is 403. If any of the three paths is outside every directory root, the response is 403 and `cat-file` does not run. This rejects a `.git` file whose `gitdir:` points outside the allowlist, and a git dir inside the allowlist whose `commondir` points at an object store outside it. Ceiling does not stop git from following a `gitdir:` file, so a linked worktree checked out under the workspaces root can still resolve a git dir and common dir that live under the project root when both directories are on the allowlist.
7. Still before `cat-file`, parse `<common-dir>/objects/info/alternates` when that file exists. Clearing `GIT_ALTERNATE_OBJECT_DIRECTORIES` does not stop git from reading this file. Relative entries are relative to that objects directory, not the common dir or the repo. Empty lines and lines whose first byte is `#` are ignored. A line that starts with `"` is decoded with git's `unquote_c_style` (`\\`, `\"`, `\n`, `\t`, `\a`, `\b`, `\f`, `\r`, `\v`, and octal `\ooo` whose first digit is `0`–`3` and that is exactly three digits). A broken quote, trailing junk after the closing quote, a NUL, or a non-UTF-8 file is 403; a broken quote is not treated as a raw path. Each decoded path is canonicalized and must `starts_with` some directory root. A missing path, a path that is not a directory, or a canonicalize failure is 403. The same rules apply to each alternate's own `info/alternates`. Depth matches git: the primary file is depth 0, and a file at depth greater than 5 is 403 (git ignores that file; this check fails closed). A path that is already on the current walk stack is a cycle and is 403. A path already fully checked through another parent is not walked again.
8. `show_git_blob_bytes_with_ceiling` then reads the blob with the same ceiling and the same cleared environment. Join error or a failure to execute `git` → 500 `Failed to read blob`. A repository whose identity is inside the allowlist but whose blob is missing → 404 `Blob not found`.
9. `bytes.len() > GIT_BLOB_MAX_BYTES` (8 × 1024 × 1024) → 413 `Blob too large`.

Success headers stay `content-type`, `content-length`, and `cache-control: private, max-age=60`.

Directory roots are the QUALITY-015 set: each project's `main_file_path`, `GitEngine::get_workspaces_base_dir()`, `default_agent_data_dir()`, and `ATMOS_FILE_SERVE_ROOTS`. Git-blob does not consult `exact_files`. A logo path is a file, not a repository root.

### `apps/api/AGENTS.md`

The git-blob paragraph states that `repo` must stay inside those directory roots, that the git subprocess sets `GIT_CEILING_DIRECTORIES` to the parent of the matched root and drops the inherited git-location variables, and that toplevel, absolute git dir, and common dir must each canonicalize inside some directory root. It also states that `objects/info/alternates` is parsed before `cat-file`, and that clearing `GIT_ALTERNATE_OBJECT_DIRECTORIES` does not replace that parse. An ancestor repository, a `gitdir:` file, a `commondir`, or an alternate object store that leaves every root is 403. A worktree under the workspaces base whose git dir is under the project root is served.

### Callers

`apps/web/src/features/diff/lib/resolve-blob-url.ts` sends the project or worktree `repoPath`. A project checkout is its own directory root. A linked worktree checkout lives under the workspaces base, and its git dir and common dir live under the project checkout. Both of those directories are allowlist roots, so the preview is served. The URL builder does not change. Desktop and mobile do not call this endpoint.

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
- **Residual**: a `.git` file inside a directory root can name an external object store with `gitdir:`, and ceiling does not block that pointer. Before `cat-file`, `--show-toplevel`, `--absolute-git-dir`, and `--git-common-dir` are canonicalized and each must sit in some directory root. Any path outside every root is 403.
- **Residual**: `GIT_CEILING_DIRECTORIES` does not stop git from following a `gitdir:` file under the start directory. The Atmos worktree layout (checkout under the workspaces base, git dir and common dir under the project root) is served when both directories are allowlist roots. The object store still has to be inside the allowlist: a common dir outside every root is 403.
- **Residual**: the git-blob subprocess removes `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, and `GIT_ALTERNATE_OBJECT_DIRECTORIES`. Removing `GIT_ALTERNATE_OBJECT_DIRECTORIES` does not stop git from reading `<common-dir>/objects/info/alternates`. That file, and nested alternates up to git's depth, are parsed before `cat-file`. A path outside every directory root is 403.
- **If this breaks a preview**: add the checkout's parent to `ATMOS_FILE_SERVE_ROOTS`, or revert the allowlist check in `serve_allowed_git_blob`.

## Dependencies & compatibility

- Depends on QUALITY-015 `FileServeAllowlist` / `allowlist_for_state` in `apps/api/src/api/system/files.rs`.
- Blocks: none. Implements https://github.com/AruNi-01/atmos/issues/332.
- Next free id after QUALITY-016.
- Lint cap stays `oxlint --max-warnings=455` in `package.json`.
- No manifest or client change.

## Open questions

None. Git-blob uses directory roots only.
