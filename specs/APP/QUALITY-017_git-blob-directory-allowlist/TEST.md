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
| M3. File-serve allowlist behavior unchanged                              | S12          |
| M3. Lint cap unchanged                                                   | S13          |

## Execution map

| Scenario | Level     | Expected tool       | Target command / method                               | Fixture / data                                             | Signals                                    | Status  |
| -------- | --------- | ------------------- | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------- |
| S1       | Rust unit | `cargo test -p api` | `serves_git_blob_inside_allowlisted_directory`        | temp git repo; parent dir is the only root                 | 200 and committed bytes                    | planned |
| S2       | Rust unit | `cargo test -p api` | `serves_git_blob_when_repo_itself_is_the_root`        | temp git repo; the repo path is the root                   | 200 and committed bytes                    | planned |
| S3       | Rust unit | `cargo test -p api` | `rejects_git_blob_outside_allowlist`                  | second repo outside the root                               | 403; body has no secret bytes              | planned |
| S4       | Rust unit | `cargo test -p api` | `rejects_git_blob_dotdot_escape`                      | `root/../outside-repo`                                     | 403; body has no secret bytes              | planned |
| S5       | Rust unit | `cargo test -p api` | `rejects_git_blob_symlink_escape`                     | symlink inside root → outside repo                         | 403; body has no secret bytes              | planned |
| S6       | Rust unit | `cargo test -p api` | `serves_git_blob_symlink_inside_root`                 | symlink inside root → repo inside root                     | 200 and committed bytes                    | planned |
| S7       | Rust unit | `cargo test -p api` | `rejects_git_blob_sibling_prefix_and_filesystem_root` | `workspace-evil` repo; allowlist `/`                       | 403                                        | planned |
| S8       | Rust unit | `cargo test -p api` | `ignores_exact_logo_file_for_git_blob`                | repo path listed only in `exact_files`                     | 403                                        | planned |
| S9       | Rust unit | `cargo test -p api` | `rejects_unsafe_rev_and_path`                         | allowed repo; `--output=…`, `../x`, `:../x`, relative repo | 400                                        | planned |
| S10      | Rust unit | `cargo test -p api` | `serves_index_blob_inside_allowlist`                  | allowed repo; staged `:note.txt`                           | 200 and staged bytes                       | planned |
| S11      | Rust unit | `cargo test -p api` | `rejects_git_blob_over_size_cap`                      | allowed repo; file of 8 MiB + 1                            | 413 `Blob too large`; body is not the file | planned |
| S12      | Rust unit | `cargo test -p api` | existing `serve_allowed_file` tests                   | temp files from QUALITY-015                                | same 200 / 403 / 404 / 400 as before       | planned |
| S13      | Toolchain | shell               | read `package.json` `lint`                            | repo `package.json`                                        | script is `oxlint --max-warnings=455`      | planned |

## Scenarios

### S1 — Parent directory root allows the repo

- **Level**: Unit
- **Given**: a git repo under `workspace/repo` with `hello.txt` committed, and the allowlist directory root is `workspace`.
- **When**: `serve_allowed_git_blob` is called with `rev=HEAD` and `path=hello.txt`.
- **Then**: status is 200 and the body is the committed bytes.
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

## Regression checklist

- [ ] `serve_allowed_file` still 403s a symlink that leaves its root, and still 200s an in-root file.
- [ ] `is_safe_git_rev` and `is_safe_repo_relative_path` are still the rev/path gate. An option-like rev does not reach `git`.
- [ ] `GIT_BLOB_MAX_BYTES` is still `8 * 1024 * 1024`.
- [ ] `package.json` `lint` still passes `--max-warnings=455`.
- [ ] `resolve-blob-url.ts` is unchanged.

## Exploratory agent-browser checks

Omitted. This endpoint has no new screen, label, or client flow.

## Acceptance criteria

- [ ] S1 and S2 pass: an allowlisted repo returns blob bytes.
- [ ] S3, S4, and S5 pass: outside path, `..`, and symlink escape are 403 and do not return the secret.
- [ ] S9 passes: unsafe rev/path still 400.
- [ ] S11 passes: over 8 MiB is 413.
- [ ] S12 passes: existing file-serve tests pass.
- [ ] S13 passes: oxlint cap is still 455.
- [ ] No new REST route.
- [ ] Coverage Status names the commands that ran and any command that did not run.

## Manual verification steps

None. The handler tests observe status and body without a browser.

## Non-coverage

- Playwright and agent-browser. The diff UI URL builder does not change.
- The 500 path when `list_projects` fails. Git-blob calls the same `allowlist_for_state` as file serve; tests pass the allowlist in directly.
- A live `git` binary other than the one on the test runner. Tests skip nothing when `git` is missing; they fail.
- Windows symlink privileges. The symlink cases use `std::os::unix::fs::symlink`, same as the file-serve tests.

## Coverage Status

> Filled after implementation by the test run. Not run yet.
