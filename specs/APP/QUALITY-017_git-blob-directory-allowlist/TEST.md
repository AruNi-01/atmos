# TEST · QUALITY-017: Git Blob Directory Allowlist

> Test Plan · how we verify `GET /api/system/git-blob` stays inside the file-serve directory roots, and that rev/path checks plus the 8 MiB cap still reject bad input. References TECH QUALITY-017.

## Test strategy

The allowlist is a handler decision in `apps/api`. Rust tests on `serve_allowed_git_blob` and the existing `serve_allowed_file` tests are enough. No UI, URL, or WebSocket change.

- Unit: `cargo test -p api` filters in `apps/api/src/api/system/files.rs`.
- File-serve regression: the existing allow, deny, `..`, and symlink tests keep calling `serve_allowed_file` after it uses `find_containing_directory_root`.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.
- Exploratory agent-browser: omitted. No screen or copy change. Denial is an HTTP status.

## Coverage map

| Requirement                                                              | Scenario IDs |
| ------------------------------------------------------------------------ | ------------ |
| M1. Repo inside a directory root returns the blob                        | S1, S2       |
| M1. Repo outside the roots is 403 and body is not the blob               | S3           |
| M1. `..` that leaves the roots is 403                                    | S4           |
| M1. Symlink whose target repo is outside is 403 and body is not the blob | S5           |
| M1. Symlink whose target repo stays inside still returns the blob        | S6           |
| M1. Sibling prefix and filesystem root do not allow a repo               | S7           |
| M1. Exact logo files do not authorize git-blob                           | S8           |
| M2. Unsafe rev, path, and index spec stay 400                            | S9           |
| M2. A safe index spec on an allowed repo still returns the blob          | S10          |
| M2. Blob larger than 8 MiB is 413                                        | S11          |
| M1. Git does not discover an ancestor repo above the matched root        | S14          |
| M1. A `.git` file with `gitdir:` outside the root is 403                 | S15          |
| M1. A linked worktree whose git dir stays in that same root still serves | S16          |
| M1. A missing blob in an allowed repo stays 404                          | S1           |
| M3. File-serve allowlist behavior unchanged                              | S12          |
| M3. Lint cap unchanged                                                   | S13          |

## Execution map

| Scenario | Level     | Expected tool       | Target command / method                                  | Fixture / data                                             | Signals                                    | Status |
| -------- | --------- | ------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------ |
| S1       | Rust unit | `cargo test -p api` | `serves_git_blob_inside_allowlisted_directory`           | temp git repo; parent dir is the only root                 | 200 and committed bytes; missing path 404  | pass   |
| S2       | Rust unit | `cargo test -p api` | `serves_git_blob_when_repo_itself_is_the_root`           | temp git repo; the repo path is the root                   | 200 and committed bytes                    | pass   |
| S3       | Rust unit | `cargo test -p api` | `rejects_git_blob_outside_allowlist`                     | second repo outside the root                               | 403; body has no secret bytes              | pass   |
| S4       | Rust unit | `cargo test -p api` | `rejects_git_blob_dotdot_escape`                         | `root/../outside-repo`                                     | 403; body has no secret bytes              | pass   |
| S5       | Rust unit | `cargo test -p api` | `rejects_git_blob_symlink_escape`                        | symlink inside root → outside repo                         | 403; body has no secret bytes              | pass   |
| S6       | Rust unit | `cargo test -p api` | `serves_git_blob_symlink_inside_root`                    | symlink inside root → repo inside root                     | 200 and committed bytes                    | pass   |
| S7       | Rust unit | `cargo test -p api` | `rejects_git_blob_sibling_prefix_and_filesystem_root`    | `workspace-evil` repo; allowlist `/`                       | 403                                        | pass   |
| S8       | Rust unit | `cargo test -p api` | `ignores_exact_logo_file_for_git_blob`                   | repo path listed only in `exact_files`                     | 403                                        | pass   |
| S9       | Rust unit | `cargo test -p api` | `rejects_unsafe_rev_and_path`                            | allowed repo; `--output=…`, `../x`, `:../x`, relative repo | 400                                        | pass   |
| S10      | Rust unit | `cargo test -p api` | `serves_index_blob_inside_allowlist`                     | allowed repo; staged `:note.txt`                           | 200 and staged bytes                       | pass   |
| S11      | Rust unit | `cargo test -p api` | `rejects_git_blob_over_size_cap`                         | allowed repo; file of 8 MiB + 1                            | 413 `Blob too large`; body is not the file | pass   |
| S12      | Rust unit | `cargo test -p api` | existing `serve_allowed_file` tests                      | temp files from QUALITY-015                                | same 200 / 403 / 404 / 400 as before       | pass   |
| S13      | Toolchain | shell               | read `package.json` `lint`                               | repo `package.json`                                        | script is `oxlint --max-warnings=455`      | pass   |
| S14      | Rust unit | `cargo test -p api` | `rejects_git_blob_discovered_above_allowlist`            | ancestor repo at `home`; request `home/ws/sub`; root `ws`  | 403; body has no secret bytes              | pass   |
| S15      | Rust unit | `cargo test -p api` | `rejects_git_blob_external_gitdir_file`                  | `ws/sub/.git` is `gitdir:` to an outside repo              | 403; body has no secret bytes              | pass   |
| S16      | Rust unit | `cargo test -p api` | `serves_linked_worktree_whose_git_dir_stays_inside_root` | main repo and linked worktree under one root               | 200 and committed bytes                    | pass   |

## Scenarios

### S1 — Parent directory root allows the repo

- **Level**: Unit
- **Given**: a git repo under `workspace/repo` with `hello.txt` committed, and the allowlist directory root is `workspace`.
- **When**: `serve_allowed_git_blob` is called with `rev=HEAD` and `path=hello.txt`.
- **Then**: status is 200 and the body is the committed bytes. The same repo with `path=missing.txt` is 404 `Blob not found`, not 403.
- **Signals**: status and body.

### S2 — The repo path itself is the root

- **Level**: Unit
- **Given**: the allowlist directory root is the git repo (a project `main_file_path`).
- **When**: the same HEAD blob is requested.
- **Then**: status is 200 and the body is the committed bytes.
- **Signals**: status and body.

### S3 — Repo outside the roots

- **Level**: Unit
- **Given**: the allowlist root is `workspace`, and a different repo holds a committed secret file.
- **When**: `repo` is that outside repo and `rev`/`path` name the secret.
- **Then**: status is 403 and the body does not contain the secret bytes.
- **Signals**: status and body.

### S4 — `..` leaves the root

- **Level**: Unit
- **Given**: `workspace/../outside-repo` is an absolute path with a `..` component, and `outside-repo` has a committed secret.
- **When**: that path is `repo`.
- **Then**: status is 403 and the body does not contain the secret bytes.
- **Signals**: status and body.

### S5 — Symlink target is outside

- **Level**: Unit
- **Given**: `workspace/link` points at an outside git repo that contains a committed secret.
- **When**: `repo` is `workspace/link`.
- **Then**: status is 403 and the body does not contain the secret bytes.
- **Signals**: status and body.

### S6 — Symlink target stays inside

- **Level**: Unit
- **Given**: `workspace/link` points at `workspace/repo`, which is inside the root.
- **When**: `repo` is the symlink and the rev/path name a committed file.
- **Then**: status is 200 and the body is that file.
- **Signals**: status and body.

### S7 — Sibling prefix and filesystem root

- **Level**: Unit
- **Given**: a repo at `workspace-evil` while the root is `workspace`, and a second request whose only directory root is `/`.
- **When**: each repo is requested.
- **Then**: both statuses are 403.
- **Signals**: status.

### S8 — Exact logo file is not a git root

- **Level**: Unit
- **Given**: `directory_roots` is empty and `exact_files` contains the repo path.
- **When**: a blob in that repo is requested.
- **Then**: status is 403.
- **Signals**: status.

### S9 — Rev and path checks still return 400

- **Level**: Unit
- **Given**: an allowed repo.
- **When**: `rev` is `--output=/tmp/pwned`, `path` is `../secret`, or `rev` is `:../secret`, and a separate call uses a relative `repo`.
- **Then**: each status is 400. The relative repo is `Invalid repo path`.
- **Signals**: status.

### S10 — Index spec still serves

- **Level**: Unit
- **Given**: an allowed repo with `note.txt` staged and not required as a commit.
- **When**: `rev` is `:note.txt`.
- **Then**: status is 200 and the body is the staged bytes.
- **Signals**: status and body.

### S11 — 8 MiB cap

- **Level**: Unit
- **Given**: an allowed repo with a committed file of `GIT_BLOB_MAX_BYTES + 1` bytes.
- **When**: that path is requested at `HEAD`.
- **Then**: status is 413 and the body is the text `Blob too large`, not the file bytes.
- **Signals**: status and body.

### S12 — File serve still uses the shared helper

- **Level**: Unit
- **Given**: the QUALITY-015 file fixtures (in-root file, outside file, sibling, `..`, symlink escape, in-root symlink, logo file, env root, filesystem root).
- **When**: `serve_allowed_file` runs.
- **Then**: statuses stay 200, 403, 404, or 400 as those tests already assert.
- **Signals**: existing assertions.

### S13 — Lint cap

- **Level**: Toolchain
- **Given**: `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is `oxlint --max-warnings=455`.
- **Signals**: script text. Do not edit `.oxlintrc.jsonc` or the cap.

### S14 — Ancestor repository above the allowlist

- **Level**: Unit
- **Given**: `home` is a git repo with a committed secret `s.txt`. `home/ws/sub` is not itself a repository. The only directory root is `home/ws`.
- **When**: `repo` is `home/ws/sub` and `rev`/`path` name `HEAD:s.txt`.
- **Then**: status is 403 and the body does not contain the secret bytes. Git's upward search stops at the parent of `home/ws` (`GIT_CEILING_DIRECTORIES`), so the ancestor repository is not read.
- **Signals**: status and body.

### S15 — `gitdir:` points outside the root

- **Level**: Unit
- **Given**: an outside git repo has a committed secret. `ws/sub/.git` is a file whose `gitdir:` line is that repo's `.git`. The only directory root is `ws`.
- **When**: `repo` is `ws/sub` and `rev`/`path` name the secret.
- **Then**: status is 403 and the body does not contain the secret bytes. `rev-parse --show-toplevel --absolute-git-dir` is canonicalized, the git dir is outside `ws`, and `cat-file` does not run.
- **Signals**: status and body.

### S16 — Linked worktree stays inside one root

- **Level**: Unit
- **Given**: a main repo and `git worktree add --detach` checkout are both under one directory root, so the worktree git dir (`<main>/.git/worktrees/<name>`) is inside that root.
- **When**: `repo` is the worktree and `rev`/`path` name a committed file.
- **Then**: status is 200 and the body is the committed bytes.
- **Signals**: status and body.

## Regression checklist

- [x] `serve_allowed_file` still 403s a symlink that leaves its root, and still 200s an in-root file.
- [x] `is_safe_git_rev` and `is_safe_repo_relative_path` are still the rev/path gate. An option-like rev does not reach `git`.
- [x] `GIT_BLOB_MAX_BYTES` is still `8 * 1024 * 1024`.
- [x] `package.json` `lint` still passes `--max-warnings=455`.
- [x] `resolve-blob-url.ts` is unchanged.
- [x] An ancestor git repo above the matched root is 403 and its blob bytes are not returned.
- [x] A `.git` file with `gitdir:` outside the matched root is 403 and its blob bytes are not returned.
- [x] A linked worktree whose git dir stays inside the same matched root is still 200.
- [x] A missing blob in an allowed repo is 404, not 403.

## Exploratory agent-browser checks

Omitted. This endpoint has no new screen, label, or client flow.

## Acceptance criteria

- [x] S1 and S2 pass: an allowlisted repo returns blob bytes.
- [x] S3, S4, and S5 pass: outside path, `..`, and symlink escape are 403 and do not return the secret.
- [x] S9 passes: unsafe rev/path still 400.
- [x] S11 passes: over 8 MiB is 413.
- [x] S12 passes: existing file-serve tests pass.
- [x] S13 passes: oxlint cap is still 455.
- [x] S14 passes: discovering a repository above the matched root is 403 and does not return the secret.
- [x] S15 passes: `gitdir:` outside the matched root is 403 and does not return the secret.
- [x] S16 passes: a linked worktree whose git dir stays in that root still returns the blob.
- [x] No new REST route.
- [x] Coverage Status names the commands that ran and any command that did not run.

## Manual verification steps

None. The handler tests observe status and body without a browser.

## Non-coverage

- Playwright and agent-browser. The diff UI URL builder does not change.
- The 500 path when `list_projects` fails. Git-blob calls the same `allowlist_for_state` as file serve; tests pass the allowlist in directly.
- A live `git` binary other than the one on the test runner. Tests skip nothing when `git` is missing; they fail.
- Windows symlink privileges. The symlink cases use `std::os::unix::fs::symlink`, same as the file-serve tests.
- A linked worktree whose checkout is under one directory root and whose git dir is under another (workspaces checkout, project `.git`). That layout is 403 by the same-root identity check. Widening git-dir to a second directory root is a follow-up, not an allow case here.
- `GIT_DIR` or `GIT_WORK_TREE` inherited from the API process environment. The handler sets `GIT_CEILING_DIRECTORIES` for the git subprocess; it does not clear operator env.
- A `.git` file whose `gitdir:` stays inside the root while that git dir's `commondir` points at an object store outside the root. The check is `--show-toplevel` and `--absolute-git-dir` only.

## Coverage Status

2026-10-20. Handler tests live in `apps/api/src/api/system/files.rs`.

- S1–S12, S14–S16 — pass. `cargo test -p api --bin api` (129 unit tests, including every `api::system::files::tests` case). Allowed repo (missing blob stays 404), repo-as-root, outside path, `..`, symlink escape, in-root symlink, sibling prefix, filesystem root, exact logo file, unsafe rev/path, index spec, 8 MiB + 1, ancestor discovery (`rejects_git_blob_discovered_above_allowlist`), external `gitdir:` (`rejects_git_blob_external_gitdir_file`), in-root linked worktree (`serves_linked_worktree_whose_git_dir_stays_inside_root`), and the existing file-serve cases all passed.
- `cargo test -p core-engine --lib show_git_blob` — pass (2). `show_git_blob_bytes` still rejects an option-like spec and still reads an index blob. Ceiling is not set on that path.
- S13 — pass by inspection. `package.json` `lint` is still `oxlint --max-warnings=455`. `.oxlintrc.jsonc` was not edited.
- `cargo clippy -p core-engine -p api --all-targets --all-features -- -D warnings` passed.
- `cargo fmt --all -- --check` passed.

Not run locally:

- `cargo test --workspace` and `cargo clippy --workspace`. CI backend runs those.
- `bun lint`, `bun run fmt:check`, and `just lint` / `just test`. No JS/TS file changed. CI JS runs oxlint and oxfmt.
- `list_projects` failure → 500. Git-blob calls the existing `allowlist_for_state`; tests pass the allowlist in.
- Playwright, agent-browser, and a browser diff preview. No UI change. `resolve-blob-url.ts` is unchanged.
