# TEST · QUALITY-017: Git Blob Directory Allowlist

> Test Plan · how we verify `GET /api/system/git-blob` stays inside the file-serve directory roots, and that rev/path checks plus the 8 MiB cap still reject bad input. References TECH QUALITY-017.

## Test strategy

The allowlist is a handler decision in `apps/api`. Rust tests on `serve_allowed_git_blob` and the existing `serve_allowed_file` tests are enough. No UI, URL, or WebSocket change.

- Unit: `cargo test -p api` filters in `apps/api/src/api/system/files.rs`.
- File-serve regression: the existing allow, deny, `..`, and symlink tests keep calling `serve_allowed_file` after it uses `find_containing_directory_root`.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.
- Exploratory agent-browser: omitted. No screen or copy change. Denial is an HTTP status.

## Coverage map

| Requirement                                                                    | Scenario IDs |
| ------------------------------------------------------------------------------ | ------------ |
| M1. Repo inside a directory root returns the blob                              | S1, S2       |
| M1. Repo outside the roots is 403 and body is not the blob                     | S3           |
| M1. `..` that leaves the roots is 403                                          | S4           |
| M1. Symlink whose target repo is outside is 403 and body is not the blob       | S5           |
| M1. Symlink whose target repo stays inside still returns the blob              | S6           |
| M1. Sibling prefix and filesystem root do not allow a repo                     | S7           |
| M1. Exact logo files do not authorize git-blob                                 | S8           |
| M2. Unsafe rev, path, and index spec stay 400                                  | S9           |
| M2. A safe index spec on an allowed repo still returns the blob                | S10          |
| M2. Blob larger than 8 MiB is 413                                              | S11          |
| M1. Git does not discover an ancestor repo above the matched root              | S14          |
| M1. A `.git` file with `gitdir:` outside the root is 403                       | S15          |
| M1. A linked worktree whose git dir stays in that same root still serves       | S16          |
| M1. A worktree under one root whose git dir is in another root is served       | S17          |
| M1. `commondir` outside every directory root is 403                            | S18          |
| M1. Inherited `GIT_DIR` does not redirect the blob                             | S19          |
| M1. `objects/info/alternates` outside the allowlist is 403                     | S20          |
| M1. An alternate inside the allowlist can supply the blob                      | S21          |
| M1. A nested alternate outside the allowlist is 403                            | S22          |
| M1. Alternates nested past git's depth are 403                                 | S23          |
| M1. An unparseable alternates line is 403                                      | S24          |
| M1. A cycle in alternates is 403                                               | S25          |
| M1. A promisor `file://` remote is 403 and does not supply an outside blob     | S26          |
| M1. `ext::` and `core.sshCommand` do not run                                   | S27          |
| M1. `core.fsmonitor` does not run on an index blob                             | S28          |
| M1. Promisor `ftp` / `ftps` / `fd` / `foo::` is 403 when lazy fetch is ignored | S29–S32      |
| M1. `extensions.partialClone` alone is 403                                     | S33          |
| M1. Promisor via `include`, `includeIf`, or worktree config is 403             | S34–S36      |
| M1. `remote.*.promisor=false` still serves a local blob                        | S37          |
| M1. Unreadable repository config is 403                                        | S38          |
| M1. A missing blob in an allowed repo stays 404                                | S1           |
| M3. File-serve allowlist behavior unchanged                                    | S12          |
| M3. Lint cap unchanged                                                         | S13          |

## Execution map

| Scenario | Level     | Expected tool       | Target command / method                                         | Fixture / data                                                                                 | Signals                                                              | Status |
| -------- | --------- | ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| S1       | Rust unit | `cargo test -p api` | `serves_git_blob_inside_allowlisted_directory`                  | temp git repo; parent dir is the only root                                                     | 200 and committed bytes; missing path 404                            | pass   |
| S2       | Rust unit | `cargo test -p api` | `serves_git_blob_when_repo_itself_is_the_root`                  | temp git repo; the repo path is the root                                                       | 200 and committed bytes                                              | pass   |
| S3       | Rust unit | `cargo test -p api` | `rejects_git_blob_outside_allowlist`                            | second repo outside the root                                                                   | 403; body has no secret bytes                                        | pass   |
| S4       | Rust unit | `cargo test -p api` | `rejects_git_blob_dotdot_escape`                                | `root/../outside-repo`                                                                         | 403; body has no secret bytes                                        | pass   |
| S5       | Rust unit | `cargo test -p api` | `rejects_git_blob_symlink_escape`                               | symlink inside root → outside repo                                                             | 403; body has no secret bytes                                        | pass   |
| S6       | Rust unit | `cargo test -p api` | `serves_git_blob_symlink_inside_root`                           | symlink inside root → repo inside root                                                         | 200 and committed bytes                                              | pass   |
| S7       | Rust unit | `cargo test -p api` | `rejects_git_blob_sibling_prefix_and_filesystem_root`           | `workspace-evil` repo; allowlist `/`                                                           | 403                                                                  | pass   |
| S8       | Rust unit | `cargo test -p api` | `ignores_exact_logo_file_for_git_blob`                          | repo path listed only in `exact_files`                                                         | 403                                                                  | pass   |
| S9       | Rust unit | `cargo test -p api` | `rejects_unsafe_rev_and_path`                                   | allowed repo; `--output=…`, `../x`, `:../x`, relative repo                                     | 400                                                                  | pass   |
| S10      | Rust unit | `cargo test -p api` | `serves_index_blob_inside_allowlist`                            | allowed repo; staged `:note.txt`                                                               | 200 and staged bytes                                                 | pass   |
| S11      | Rust unit | `cargo test -p api` | `rejects_git_blob_over_size_cap`                                | allowed repo; file of 8 MiB + 1                                                                | 413 `Blob too large`; body is not the file                           | pass   |
| S12      | Rust unit | `cargo test -p api` | existing `serve_allowed_file` tests                             | temp files from QUALITY-015                                                                    | same 200 / 403 / 404 / 400 as before                                 | pass   |
| S13      | Toolchain | shell               | read `package.json` `lint`                                      | repo `package.json`                                                                            | script is `oxlint --max-warnings=455`                                | pass   |
| S14      | Rust unit | `cargo test -p api` | `rejects_git_blob_discovered_above_allowlist`                   | ancestor repo at `home`; request `home/ws/sub`; root `ws`                                      | 403; body has no secret bytes                                        | pass   |
| S15      | Rust unit | `cargo test -p api` | `rejects_git_blob_external_gitdir_file`                         | `ws/sub/.git` is `gitdir:` to an outside repo                                                  | 403; body has no secret bytes                                        | pass   |
| S16      | Rust unit | `cargo test -p api` | `serves_linked_worktree_whose_git_dir_stays_inside_root`        | main repo and linked worktree under one root                                                   | 200 and committed bytes                                              | pass   |
| S17      | Rust unit | `cargo test -p api` | `serves_worktree_under_workspaces_with_git_dir_in_project_root` | project root and workspaces root; worktree checkout under workspaces                           | 200 and committed bytes; `.git` is a `gitdir:` file into the project | pass   |
| S18      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_commondir_is_outside_allowlist`          | git dir inside the root; `commondir` points at an outside repo                                 | 403; body has no secret bytes                                        | pass   |
| S19      | Rust unit | `cargo test -p api` | `ignores_inherited_git_dir_for_allowlisted_repo`                | child process `GIT_DIR` points at a second allowlisted repo                                    | 200 and the requested repo's bytes                                   | pass   |
| S20      | Rust unit | `cargo test -p api` | `rejects_git_blob_alternate_outside_allowlist`                  | `git clone --shared` of an outside repo into the allowlist                                     | 403; body has no secret bytes                                        | pass   |
| S21      | Rust unit | `cargo test -p api` | `serves_git_blob_from_allowlisted_alternate`                    | shared clone; quoted relative `objects/info/alternates`; no loose object in the borrower       | 200 and the alternate's bytes                                        | pass   |
| S22      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_nested_alternate_is_outside_allowlist`   | borrower → inside alternate → outside object store                                             | 403; body has no secret bytes                                        | pass   |
| S23      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_alternates_nesting_exceeds_git_depth`    | alternates file at depth 6; blob also exists locally                                           | 403; body is not the local blob                                      | pass   |
| S24      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_alternates_line_is_unparseable`          | local blob; alternates line is an unterminated quote                                           | 403; body is not the local blob                                      | pass   |
| S25      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_alternates_form_a_cycle`                 | borrower and a second in-root store name each other                                            | 403; body is not the local blob                                      | pass   |
| S26      | Rust unit | `cargo test -p api` | `does_not_lazy_fetch_promisor_file_outside_allowlist`           | promisor `file://` outside repo; local `protocol.file.allow=always`; blob absent locally       | 403; body has no secret; no loose object and no pack                 | pass   |
| S27      | Rust unit | `cargo test -p api` | `does_not_run_promisor_ext_or_ssh_command`                      | promisor `ext::touch <marker>`; `core.sshCommand` touches a second marker                      | 403; neither marker file exists                                      | pass   |
| S28      | Rust unit | `cargo test -p api` | `does_not_run_fsmonitor_command_for_index_blob`                 | `core.fsmonitor` touches a marker; request is `:note.txt`                                      | 200 and the staged bytes; marker file does not exist                 | pass   |
| S29      | Rust unit | `cargo test -p api` | `rejects_promisor_ftp_without_lazy_fetch_env`                   | promisor `ftp://`; `protocol.ftp.allow=always`; child omits `GIT_NO_LAZY_FETCH`; marker helper | 403; marker file does not exist                                      | pass   |
| S30      | Rust unit | `cargo test -p api` | `rejects_promisor_ftps_without_lazy_fetch_env`                  | promisor `ftps://`; `protocol.ftps.allow=always`; child omits `GIT_NO_LAZY_FETCH`              | 403; marker file does not exist                                      | pass   |
| S31      | Rust unit | `cargo test -p api` | `rejects_promisor_fd_without_lazy_fetch_env`                    | promisor `fd::`; `protocol.fd.allow=always`; child omits `GIT_NO_LAZY_FETCH`                   | 403; marker file does not exist                                      | pass   |
| S32      | Rust unit | `cargo test -p api` | `rejects_promisor_foo_helper_without_lazy_fetch_env`            | promisor `foo::bar`; `protocol.foo.allow=always`; `git-remote-foo` touches a marker            | 403; marker file does not exist                                      | pass   |
| S33      | Rust unit | `cargo test -p api` | `rejects_partial_clone_extension_without_promisor_flag`         | `extensions.partialclone` only; no `remote.*.promisor=true`; `foo::` helper                    | 403; marker file does not exist                                      | pass   |
| S34      | Rust unit | `cargo test -p api` | `rejects_promisor_set_only_through_include`                     | `include.path` sets `remote.origin.promisor=true`; main config does not                        | 403; marker file does not exist                                      | pass   |
| S35      | Rust unit | `cargo test -p api` | `rejects_promisor_set_only_through_include_if_on_worktree`      | `includeIf.gitdir:**` on a linked worktree; promisor only in the included file                 | 403; marker file does not exist                                      | pass   |
| S36      | Rust unit | `cargo test -p api` | `rejects_promisor_set_only_in_worktree_config`                  | `extensions.worktreeConfig`; promisor only in worktree config                                  | 403; marker file does not exist                                      | pass   |
| S37      | Rust unit | `cargo test -p api` | `serves_git_blob_when_promisor_remote_is_false`                 | `remote.origin.promisor=false`; local blob                                                     | 200 and the committed bytes                                          | pass   |
| S38      | Rust unit | `cargo test -p api` | `rejects_git_blob_when_repo_config_cannot_be_read`              | local blob; `.git/config` has a broken line                                                    | 403; body is not the local blob                                      | pass   |

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
- **Then**: status is 403 and the body does not contain the secret bytes. `rev-parse --show-toplevel --absolute-git-dir --git-common-dir` is canonicalized, the git dir is outside every directory root, and `cat-file` does not run.
- **Signals**: status and body.

### S16 — Linked worktree stays inside one root

- **Level**: Unit
- **Given**: a main repo and `git worktree add --detach` checkout are both under one directory root, so the worktree git dir (`<main>/.git/worktrees/<name>`) is inside that root.
- **When**: `repo` is the worktree and `rev`/`path` name a committed file.
- **Then**: status is 200 and the body is the committed bytes.
- **Signals**: status and body.

### S17 — Worktree checkout and git dir are in different roots

- **Level**: Unit
- **Given**: a project repository is one directory root, and `git worktree add --detach` checks out under a second directory root (the workspaces base). The worktree `.git` file is `gitdir:` pointing at `<project>/.git/worktrees/<name>`. The ceiling passed to git is the parent of the workspaces root.
- **When**: `repo` is the worktree and `rev`/`path` name a committed file.
- **Then**: status is 200 and the body is the committed bytes. Ceiling does not stop git from following that `gitdir:` file. Toplevel is inside the workspaces root. Absolute git dir and common dir are inside the project root.
- **Signals**: status, body, and the `gitdir:` text.

### S18 — `commondir` points outside the allowlist

- **Level**: Unit
- **Given**: an outside git repo has a committed secret. Inside the only directory root, `sub/.git` is `gitdir:` to `priv.git`, and `priv.git/commondir` is the outside repo's `.git`. Toplevel and the private git dir are inside the root. The common dir is not.
- **When**: `repo` is `sub` and `rev`/`path` name the secret.
- **Then**: status is 403 and the body does not contain the secret bytes. `cat-file` does not run.
- **Signals**: status and body.

### S19 — Inherited `GIT_DIR` does not redirect the read

- **Level**: Unit
- **Given**: two allowlisted repositories. The requested repo's `hello.txt` is `from-repo-a`. The other repo's `hello.txt` is different. A child process has `GIT_DIR` set to the other repo's `.git`.
- **When**: `ignores_inherited_git_dir_for_allowlisted_repo` spawns `git_dir_env_probe` with that environment.
- **Then**: status is 200 and the body is `from-repo-a`. The git-blob subprocess removes `GIT_DIR` before `rev-parse`.
- **Signals**: child exit status. The probe test no-ops when `ATMOS_GIT_BLOB_ENV_PROBE` is unset, so the normal suite does not publish `GIT_DIR` into parallel tests.

### S20 — Alternate object store is outside the allowlist

- **Level**: Unit
- **Given**: an outside repo has a committed secret. `git clone --shared` borrows it from a repo inside the only directory root, so `objects/info/alternates` names the outside objects directory. The loose object is not copied into the borrower.
- **When**: `repo` is the borrower and `rev`/`path` name the secret.
- **Then**: status is 403 and the body does not contain the secret bytes. `cat-file` does not run.
- **Signals**: status and body.

### S21 — Alternate object store stays inside the allowlist

- **Level**: Unit
- **Given**: both the borrower and the alternate are under one directory root. The borrower's alternates file is a blank line, a `#` comment, and a quoted path relative to the borrower's objects directory. The blob has no loose object in the borrower.
- **When**: `repo` is the borrower and `rev`/`path` name that blob.
- **Then**: status is 200 and the body is the alternate's bytes.
- **Signals**: status, body, and the missing loose object. `parses_git_alternate_quoting` also checks `\040`, a broken octal escape, and trailing junk after a closing quote.

### S22 — Nested alternate is outside the allowlist

- **Level**: Unit
- **Given**: `main` borrows `middle` and `middle` borrows an outside repo that holds the secret. `main` and `middle` are inside the directory root. The outside store is not on the first alternates line.
- **When**: `repo` is `main` and `rev`/`path` name the secret.
- **Then**: status is 403 and the body does not contain the secret bytes.
- **Signals**: status and body.

### S23 — Alternates nesting is past git's depth

- **Level**: Unit
- **Given**: an allowlisted repo has its own committed blob. Its alternates chain reaches an `info/alternates` file at depth 6. Git's cutoff is `depth > 5` (the primary file is depth 0). Every directory in the chain is inside the root.
- **When**: `repo` is that repo and `rev`/`path` name the local blob.
- **Then**: status is 403 and the body is not the local blob.
- **Signals**: status and body.

### S24 — Alternates line cannot be parsed

- **Level**: Unit
- **Given**: an allowlisted repo has its own committed blob and an alternates line `"unterminated`.
- **When**: that blob is requested.
- **Then**: status is 403 and the body is not the local blob. The broken quote is not used as a raw path.
- **Signals**: status and body.

### S25 — Alternates form a cycle

- **Level**: Unit
- **Given**: an allowlisted repo has its own committed blob. Its objects directory and a second objects directory inside the same root each list the other in `info/alternates`.
- **When**: that blob is requested.
- **Then**: status is 403 and the body is not the local blob. A path already on the walk stack is a cycle, not a successful revisit.
- **Signals**: status and body.

### S26 — Promisor `file://` does not read an outside object

- **Level**: Unit
- **Given**: an outside repo has a committed secret. An allowlisted repo has that commit and tree, but not the blob. Its config sets `remote.origin.promisor=true`, `url=file://` to the outside repo, and `protocol.file.allow=always`.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The body does not contain the secret. The blob is still not a loose object, and no pack file was written. The repository is rejected before `cat-file`.
- **Signals**: status, body, and the object store.

### S27 — `ext::` and `core.sshCommand` do not run

- **Level**: Unit
- **Given**: the same missing-blob layout. The promisor URL is `ext::touch <marker>`. Local config sets `protocol.ext.allow=always`, `protocol.ssh.allow=always`, and `core.sshCommand` to `touch` a second marker.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. Neither marker file exists.
- **Signals**: status and the two marker paths.

### S28 — `core.fsmonitor` does not run for an index blob

- **Level**: Unit
- **Given**: an allowlisted repo has `note.txt` staged. `core.fsmonitor` is `touch <marker>`.
- **When**: `rev` is `:note.txt`.
- **Then**: status is 200 and the body is the staged bytes. The marker file does not exist.
- **Signals**: status, body, and the marker path.

### S29 — Promisor `ftp` is 403 when `GIT_NO_LAZY_FETCH` is absent

- **Level**: Unit
- **Given**: the missing-blob layout. The promisor URL is `ftp://127.0.0.1:1/x` and local config sets `protocol.ftp.allow=always`. A child process omits `GIT_NO_LAZY_FETCH` (`ATMOS_GIT_BLOB_OMIT_NO_LAZY_FETCH=1`) and points `GIT_EXEC_PATH` at a `git-remote-ftp` that would create a marker. Git before 2.44 ignores `GIT_NO_LAZY_FETCH`; this child imitates that.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S30 — Promisor `ftps` is 403 when `GIT_NO_LAZY_FETCH` is absent

- **Level**: Unit
- **Given**: the same child as S29, with `ftps://127.0.0.1:1/x` and `protocol.ftps.allow=always`. The overlay helper is `git-remote-ftps`.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S31 — Promisor `fd` is 403 when `GIT_NO_LAZY_FETCH` is absent

- **Level**: Unit
- **Given**: the same child as S29, with `fd::99,99` and `protocol.fd.allow=always`. The overlay helper is `git-remote-fd`.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S32 — Promisor `foo::` does not run a third-party helper

- **Level**: Unit
- **Given**: the same child as S29, with `foo::bar` and `protocol.foo.allow=always`. `git-remote-foo` on the exec path would create a marker. There is no per-protocol lock for `foo`.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S33 — `extensions.partialClone` alone is 403

- **Level**: Unit
- **Given**: the missing-blob layout and the S29 child. Config sets `extensions.partialclone=origin` and `url=foo::bar`. It does not set `remote.*.promisor=true`.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S34 — Promisor only in an included config file is 403

- **Level**: Unit
- **Given**: the missing-blob layout and the S29 child. `include.path` points at a file whose only promisor key is `remote.origin.promisor=true`. The main config sets `url=foo::bar` and `protocol.foo.allow=always` and does not set promisor itself.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S35 — Promisor only via `includeIf` on a linked worktree is 403

- **Level**: Unit
- **Given**: the S34 layout, except the include is `includeIf.gitdir:**`. The request `repo` is a linked worktree of that repository (`git worktree add --detach --no-checkout`) inside the same allowlist root.
- **When**: `rev` is `HEAD` and `path` is `s.txt` on the worktree.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S36 — Promisor only in worktree config is 403

- **Level**: Unit
- **Given**: the missing-blob layout and the S29 child. `extensions.worktreeConfig=true` and `remote.origin.promisor=true` is set with `git config --worktree` only. The local config has the `foo::` URL and `protocol.foo.allow=always`, and does not set promisor.
- **When**: `rev` is `HEAD` and `path` is `s.txt`.
- **Then**: status is 403. The marker file does not exist.
- **Signals**: status and the marker path.

### S37 — `promisor=false` still serves a local blob

- **Level**: Unit
- **Given**: an allowlisted repo has a committed blob. Config sets `remote.origin.promisor=false`, `url=foo::bar`, and `protocol.foo.allow=always`. `extensions.partialClone` is unset.
- **When**: that blob is requested.
- **Then**: status is 200 and the body is the committed bytes.
- **Signals**: status and body.

### S38 — Unreadable repository config is 403

- **Level**: Unit
- **Given**: an allowlisted repo has a committed blob, and `.git/config` ends with a broken `[` line.
- **When**: that blob is requested.
- **Then**: status is 403 and the body is not the local blob.
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
- [x] A worktree under the workspaces root whose git dir is in the project root is 200.
- [x] A `commondir` outside every directory root is 403 and its blob bytes are not returned.
- [x] An inherited `GIT_DIR` does not change which repository is read.
- [x] An alternate object store outside the allowlist is 403 and its blob bytes are not returned.
- [x] An alternate object store inside the allowlist still returns a blob that exists only there.
- [x] A nested alternate outside the allowlist is 403.
- [x] An alternates file nested past git's depth is 403.
- [x] An unparseable alternates line is 403.
- [x] An alternates cycle is 403.
- [x] A promisor `file://` remote is 403, does not return an outside blob, and does not write a pack.
- [x] An `ext::` promisor command and `core.sshCommand` do not run.
- [x] `core.fsmonitor` does not run when an index blob is read.
- [x] A missing blob in an allowed repo that is not a promisor is 404, not 403.
- [x] Promisor `ftp`, `ftps`, `fd`, and `foo::` are 403 when `GIT_NO_LAZY_FETCH` is not set, and the helper marker is absent.
- [x] `extensions.partialClone` without `remote.*.promisor=true` is 403.
- [x] A promisor key that exists only via `include`, `includeIf`, or worktree config is 403.
- [x] `remote.*.promisor=false` still returns a local blob.
- [x] A repository config that git cannot parse is 403.

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
- [x] S17 passes: a worktree under one allowlist root whose git dir is in another allowlist root returns the blob.
- [x] S18 passes: `commondir` outside the allowlist is 403 and does not return the secret.
- [x] S19 passes: inherited `GIT_DIR` does not redirect the blob.
- [x] S20 passes: an outside alternate is 403 and does not return the secret.
- [x] S21 passes: an inside alternate returns the borrowed blob.
- [x] S22 passes: a nested outside alternate is 403 and does not return the secret.
- [x] S23 passes: alternates nested past depth 5 are 403.
- [x] S24 passes: an unparseable alternates line is 403.
- [x] S25 passes: an alternates cycle is 403.
- [x] S26 passes: a promisor `file://` repository is 403 and does not return the outside blob.
- [x] S27 passes: `ext::` and `core.sshCommand` do not create their marker files.
- [x] S28 passes: `core.fsmonitor` does not create its marker file, and the index blob is still served.
- [x] S29–S32 pass: promisor `ftp`, `ftps`, `fd`, and `foo::` are 403 when `GIT_NO_LAZY_FETCH` is omitted, and the helper marker is absent.
- [x] S33 passes: `extensions.partialClone` alone is 403.
- [x] S34–S36 pass: promisor config that arrives only through `include`, `includeIf` on a linked worktree, or worktree config is 403.
- [x] S37 passes: `remote.*.promisor=false` still returns the local blob.
- [x] S38 passes: unreadable repository config is 403.
- [x] No new REST route.
- [x] Coverage Status names the commands that ran and any command that did not run.

## Manual verification steps

None. The handler tests observe status and body without a browser.

## Non-coverage

- Playwright and agent-browser. The diff UI URL builder does not change.
- The 500 path when `list_projects` fails. Git-blob calls the same `allowlist_for_state` as file serve; tests pass the allowlist in directly.
- A live `git` binary other than the one on the test runner. Tests skip nothing when `git` is missing; they fail.
- Windows symlink privileges. The symlink cases use `std::os::unix::fs::symlink`, same as the file-serve tests.
- Replacing `objects/info/alternates` or `.git/config` after the check and before `cat-file`. That remains the existing canonicalize-then-`git` TOCTOU window.
- Global and system git config. They are the operator's. The tests do not set `GIT_CONFIG_NOSYSTEM` or `GIT_CONFIG_GLOBAL`. Command-line `-c` still overrides them for the locked keys.
- A git binary that actually ignores `GIT_NO_LAZY_FETCH` (stock git 2.43). This runner's git is 2.43 and does contain the variable. The tests omit it with `ATMOS_GIT_BLOB_OMIT_NO_LAZY_FETCH=1` instead of relying on that binary.
- `url.<base>.insteadOf` and `remote.<name>.vcs`. They matter only if a fetch runs. The promisor rejection happens first. There is no separate test.
- A promisor remote that exists only in global or system config. Those files are the operator's and are not a reason to 403 every repository.
- `core.hooksPath`, textconv, and smudge. `cat-file blob` does not pass `--textconv` or `--filters`. Those probes were not turned into API tests.
- The index FSMN extension. `-c core.fsmonitor=false` is what ignores it. S28 covers a `core.fsmonitor` command, not the extension.
- `ftps` is covered (S30). A helper name other than `ftp`, `ftps`, `fd`, and `foo` is the same rejection as S32: any promisor remote is 403 before the helper name matters.

## Coverage Status

2026-10-20. Handler tests live in `apps/api/src/api/system/files.rs`.

- S1–S12, S14–S38 — pass. `cargo test -p api --bin api` (154 unit tests, including every `api::system::files::tests` case). Allowed repo (missing blob stays 404), repo-as-root, outside path, `..`, symlink escape, in-root symlink, sibling prefix, filesystem root, exact logo file, unsafe rev/path, index spec, 8 MiB + 1, ancestor discovery (`rejects_git_blob_discovered_above_allowlist`), external `gitdir:` (`rejects_git_blob_external_gitdir_file`), in-root linked worktree (`serves_linked_worktree_whose_git_dir_stays_inside_root`), cross-root worktree (`serves_worktree_under_workspaces_with_git_dir_in_project_root`), external `commondir` (`rejects_git_blob_when_commondir_is_outside_allowlist`), inherited `GIT_DIR` (`ignores_inherited_git_dir_for_allowlisted_repo` plus `git_dir_env_probe`), outside alternate (`rejects_git_blob_alternate_outside_allowlist`), in-allowlist alternate (`serves_git_blob_from_allowlisted_alternate`), nested outside alternate (`rejects_git_blob_when_nested_alternate_is_outside_allowlist`), depth 6 (`rejects_git_blob_when_alternates_nesting_exceeds_git_depth`), unparseable quote (`rejects_git_blob_when_alternates_line_is_unparseable` plus `parses_git_alternate_quoting`), alternates cycle (`rejects_git_blob_when_alternates_form_a_cycle`), promisor `file://` (`does_not_lazy_fetch_promisor_file_outside_allowlist`, now 403), `ext::` / `core.sshCommand` (`does_not_run_promisor_ext_or_ssh_command`, now 403), `core.fsmonitor` (`does_not_run_fsmonitor_command_for_index_blob`), promisor `ftp` / `ftps` / `fd` / `foo::` with `GIT_NO_LAZY_FETCH` omitted (`rejects_promisor_ftp_without_lazy_fetch_env`, `rejects_promisor_ftps_without_lazy_fetch_env`, `rejects_promisor_fd_without_lazy_fetch_env`, `rejects_promisor_foo_helper_without_lazy_fetch_env`, child `promisor_fetch_probe`), `extensions.partialClone` alone (`rejects_partial_clone_extension_without_promisor_flag`), include / includeIf / worktree config (`rejects_promisor_set_only_through_include`, `rejects_promisor_set_only_through_include_if_on_worktree`, `rejects_promisor_set_only_in_worktree_config`), `promisor=false` (`serves_git_blob_when_promisor_remote_is_false`), unreadable config (`rejects_git_blob_when_repo_config_cannot_be_read`), and the existing file-serve cases all passed.
- `cargo test -p core-engine --lib show_git_blob` — pass (2). `show_git_blob_bytes` still rejects an option-like spec and still reads an index blob. Ceiling is not set on that path.
- S13 — pass by inspection. `package.json` `lint` is still `oxlint --max-warnings=455`. `.oxlintrc.jsonc` was not edited.
- `cargo clippy -p core-engine -p api --all-targets --all-features -- -D warnings` passed.
- `cargo fmt --all -- --check` passed.

Not run locally:

- `cargo test --workspace` and `cargo clippy --workspace`. CI backend runs those.
- `bun lint`, `bun run fmt:check`, and `just lint` / `just test`. No JS/TS file changed. CI JS runs oxlint and oxfmt.
- `list_projects` failure → 500. Git-blob calls the existing `allowlist_for_state`; tests pass the allowlist in.
- Playwright, agent-browser, and a browser diff preview. No UI change. `resolve-blob-url.ts` is unchanged.
