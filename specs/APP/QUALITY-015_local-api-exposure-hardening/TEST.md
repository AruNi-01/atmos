# TEST · QUALITY-015: Local API Exposure Hardening

> Test Plan · how we verify unset-token denial, bind refusal, query redaction, file confinement (including symlink escape), and workflow env interpolation. References TECH QUALITY-015.

## Test strategy

API behavior is Rust unit tests on `apps/api`. The workflow change is a Rust text check over the two YAML files, because those workflows are not runnable from a pull request without a real release. There is no new UI surface.

- Unit: `apps/api` tests for `is_request_authorized`, `redact_query_token`, `require_local_token`, `ensure_exposed_bind_has_token`, and `serve_allowed_file`.
- Workflow check: `apps/api/tests/workflow_shell_env.rs` scans `run:` bodies.
- Caller inventory: `rg` across web, desktop, and mobile. No Playwright. URL builders are unchanged.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.
- Exploratory agent-browser: omitted. No screen or copy change. File denial is an HTTP status.

## Coverage map

| Requirement                                             | Scenario IDs |
| ------------------------------------------------------- | ------------ |
| M1. Unset token is not authorization for non-loopback   | S1, S2, S3   |
| M1. Loopback without a token still works                | S2           |
| M1. Non-loopback bind without a token refuses to start  | S4, S5       |
| M1. Blank token counts as unset                         | S3, S5       |
| M1. Configured token still matches header and query     | S6           |
| M1. Rejection log redacts `token=`                      | S7, S8       |
| M1. LAN trust still exempts private IPs, not public IPs | S9           |
| M2. File inside an allowlisted directory is served      | S10          |
| M2. Outside file, sibling prefix, and `..` are 403      | S11, S12     |
| M2. Symlink escape is 403 and body is not the secret    | S13          |
| M2. In-root symlink still serves the in-root target     | S14          |
| M2. Relative path 400; missing path 404; directory 400  | S15          |
| M2. Exact logo file allowed; its sibling is not         | S16          |
| M2. Env root allowed; filesystem root is not            | S17          |
| M2. Web/desktop/mobile callers                          | S18          |
| M3. Workflow expressions moved to env and `"$VAR"`      | S19          |
| M3. Lint cap unchanged                                  | S20          |

## Execution map

| Scenario | Level     | Expected tool       | Target command / method                                                | Fixture / data                                                               | Signals                                                                                     | Status |
| -------- | --------- | ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| S1       | Rust unit | `cargo test -p api` | `is_request_authorized` tests                                          | `token = None`, bearer and query set                                         | returns `false`                                                                             | pass   |
| S2       | Rust unit | `cargo test -p api` | `require_local_token` oneshot                                          | `127.0.0.1` and `10.0.0.1`, no token                                         | loopback 200; public 401                                                                    | pass   |
| S3       | Rust unit | `cargo test -p api` | `is_request_authorized`                                                | `Some("  ")`                                                                 | returns `false`                                                                             | pass   |
| S4       | Rust unit | `cargo test -p api` | `ensure_exposed_bind_has_token`                                        | hosts `0.0.0.0`, `::`, `192.168.0.10`, `example.com`                         | `Err`                                                                                       | pass   |
| S5       | Rust unit | `cargo test -p api` | `ensure_exposed_bind_has_token`                                        | `127.0.0.1`, `localhost`, `::1` without token; `0.0.0.0` with token          | `Ok` / `Err` as specified                                                                   | pass   |
| S6       | Rust unit | `cargo test -p api` | `is_request_authorized`                                                | bearer and `token=` query                                                    | match true; mismatch false                                                                  | pass   |
| S7       | Rust unit | `cargo test -p api` | `redact_query_token`                                                   | `token=`, `Token=`, `%74oken=`, `token%3D`, `%54%4f%4b%45%4e=`               | value is `REDACTED`; secret absent; non-token pairs unchanged                               | pass   |
| S8       | Rust unit | `cargo test -p api` | middleware log capture and TraceLayer span                             | public IP 401, and a 200 with `token=` / `%74oken=` / `token%3D`             | status as expected; captured log has no secret and contains `token=REDACTED`                | pass   |
| S9       | Rust unit | `cargo test -p api` | `require_local_token`                                                  | `10.1.2.3` with LAN trust; `8.8.8.8` with LAN trust; no token                | private 200; public 401                                                                     | pass   |
| S10      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | temp root + `readme.txt`                                                     | 200 and file bytes                                                                          | pass   |
| S11      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | file outside the root                                                        | 403                                                                                         | pass   |
| S12      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | `workspace-evil` sibling and `..` escape                                     | 403                                                                                         | pass   |
| S13      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | symlink inside root → outside file                                           | 403; body does not contain the secret                                                       | pass   |
| S14      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | symlink inside root → file inside root                                       | 200 and in-root bytes                                                                       | pass   |
| S15      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | relative path, missing file, directory                                       | 400, 404, 400                                                                               | pass   |
| S16      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | exact file outside roots; sibling file                                       | exact 200; sibling 403                                                                      | pass   |
| S17      | Rust unit | `cargo test -p api` | `serve_allowed_file`                                                   | extra directory root; allowlist root `/`                                     | extra file 200; `/` does not allow a temp file                                              | pass   |
| S18      | Shell     | `rg`                | path search below                                                      | web, desktop, mobile trees                                                   | only the web callers in TECH; desktop and mobile have no matches                            | pass   |
| S19      | Rust unit | `cargo test -p api` | `workflow_shell_env`                                                   | sync workflows and the release workflows                                     | no `github.event.*`, `github.event_name`, or `inputs.*` inside `run:`; shell reads `"$VAR"` | pass   |
| S20      | Toolchain | shell               | `bun lint` is not re-run repo-wide unless CI does; confirm script text | `package.json`                                                               | `oxlint --max-warnings=455` unchanged                                                       | pass   |
| S21      | Rust unit | `cargo test -p api` | bind check and both token middlewares                                  | `::ffff:127.0.0.1`, `::ffff:0.0.0.0`, `::ffff:8.8.8.8`, `::ffff:192.168.0.1` | only `::ffff:127.x` is loopback; other mapped addresses are not                             | pass   |
| S22      | Rust unit | `cargo test -p api` | source assertion on `constant_time_eq`                                 | `middleware/mod.rs`                                                          | body is the SHA-256 XOR fold; no `==` on the secrets and no `.eq(`                          | pass   |

## Scenarios

### S1 — Unset token rejects authorization

- **Level**: Unit
- **Given**: `token` is `None`.
- **When**: `is_request_authorized` runs with `Authorization: Bearer anything` and with `token=anything`.
- **Then**: both return `false`.
- **Signals**: assertion on the bool.

### S2 — Loopback still passes the middleware; public does not

- **Level**: Unit
- **Given**: a router layered with `require_local_token` and `expected_token = None`.
- **When**: one request comes from `127.0.0.1` and one from `10.0.0.1`.
- **Then**: loopback is 200; the public address is 401.
- **Signals**: response status.

### S3 — Blank token is unset

- **Level**: Unit
- **Given**: `token` is `Some("   ")`.
- **When**: `is_request_authorized` runs.
- **Then**: it returns `false`.
- **Signals**: assertion on the bool.

### S4 — Non-loopback bind without a token refuses to start

- **Level**: Unit
- **Given**: `ServerConfig` hosts `0.0.0.0`, `::`, `192.168.0.10`, and `example.com`, token unset. LAN trust may be true.
- **When**: `ensure_exposed_bind_has_token` runs.
- **Then**: each returns `Err`. The message names `SERVER_HOST` and `ATMOS_LOCAL_TOKEN` and does not contain a secret.
- **Signals**: `Err` display text.

### S5 — Loopback bind and tokenized non-loopback bind are allowed

- **Level**: Unit
- **Given**: hosts `127.0.0.1`, `localhost`, `::1` with no token, and `0.0.0.0` with `Some("set")`.
- **When**: `ensure_exposed_bind_has_token` runs.
- **Then**: loopback is `Ok`. `0.0.0.0` without a token is `Err`. `0.0.0.0` with a token is `Ok`. Whitespace token on `0.0.0.0` is `Err`.
- **Signals**: `Result`.

### S6 — Configured token still matches

- **Level**: Unit
- **Given**: `token` is `Some("expected")`.
- **When**: the bearer header matches, the query `token=` matches, and a third request has neither.
- **Then**: the two matches are `true` and the third is `false`.
- **Signals**: bool assertions.

### S7 — Redaction helper

- **Level**: Unit
- **Given**: `None`, `a=1`, `token=SECRET`, `Token=SECRET`, `%74oken=secret`, `token%3Dsecret`, `%74oken%3Dsecret`, `TOKEN%3dSECRET`, `%54%4f%4b%45%4e=secret`, and `notoken=secret`.
- **When**: `redact_query_token` runs.
- **Then**: `None` is `<none>`; pairs without a token key are unchanged; token values, including percent-encoded keys and `token%3D`, are `token=REDACTED`. The secret text is absent.
- **Signals**: string equality.

### S8 — Middleware log does not contain the query token

- **Level**: Unit
- **Given**: a tracing subscriber capturing warn output, a public peer, and query `token=s3cr3t-token-value`. A second subscriber captures DEBUG span events for a successful `TraceLayer` request whose query contains `token=`, `%74oken=`, and `token%3D`.
- **When**: `require_local_token` rejects the first request, and the traced router serves the second with 200.
- **Then**: the 401 log and the DEBUG access log do not contain `s3cr3t-token-value`. Both contain `token=REDACTED`.
- **Signals**: status and captured log text.

### S9 — LAN trust regression

- **Level**: Unit
- **Given**: `allow_lan_without_token = true` and no API token.
- **When**: peers `10.1.2.3` and `8.8.8.8` request the guarded route.
- **Then**: the private address is 200 and the public address is 401.
- **Signals**: status codes.

### S10 — In-root file is served

- **Level**: Unit
- **Given**: a temp directory root containing `readme.txt` with known bytes.
- **When**: `serve_allowed_file` is called with that absolute path.
- **Then**: status 200 and the body equals those bytes.
- **Signals**: status and body.

### S11 — Outside file is forbidden

- **Level**: Unit
- **Given**: a file next to the root, not inside it.
- **When**: `serve_allowed_file` is called.
- **Then**: status 403 and the body does not contain the file bytes.
- **Signals**: status and body.

### S12 — Sibling prefix and dot-dot

- **Level**: Unit
- **Given**: roots `.../workspace` and a file in `.../workspace-evil`, plus `workspace/../../outside-file` when that file exists.
- **When**: each path is requested.
- **Then**: both are 403.
- **Signals**: status.

### S13 — Symlink escape

- **Level**: Unit
- **Given**: `workspace/link` is a symlink to `outside/secret.txt` whose contents are a unique secret.
- **When**: the link path is requested.
- **Then**: status 403. The body does not contain the secret.
- **Signals**: status and body bytes.

### S14 — In-root symlink

- **Level**: Unit
- **Given**: `workspace/alias` points at `workspace/readme.txt`.
- **When**: the alias is requested.
- **Then**: status 200 and the body is the readme bytes.
- **Signals**: status and body.

### S15 — Relative, missing, directory

- **Level**: Unit
- **Given**: a relative path, a missing absolute path under the root, and the root directory itself.
- **When**: each is requested.
- **Then**: 400, 404, and 400 respectively.
- **Signals**: status.

### S16 — Exact logo file

- **Level**: Unit
- **Given**: directory roots empty, `exact_files` contains one absolute file, and a sibling file sits beside it.
- **When**: both paths are requested.
- **Then**: the exact file is 200; the sibling is 403.
- **Signals**: status and body of the exact file.

### S17 — Env root and filesystem root

- **Level**: Unit
- **Given**: one extra directory root, and a separate allowlist whose only directory root is `/`.
- **When**: a file inside the extra root is requested, then a temp file is requested against `/`.
- **Then**: the extra-root file is 200. The temp file against `/` is 403.
- **Signals**: status.

### S18 — Frontend callers

- **Level**: Shell
- **Given**: the tree after the API change.
- **When**: `rg -n "/api/system/file" apps/web apps/desktop apps/desktop-electron apps/mobile apps/cli packages` runs.
- **Then**: matches are only the web callers listed in TECH. Desktop, mobile, CLI, and packages have no matches. Those web modules still build the same `/api/system/file?path=` URL.
- **Signals**: `rg` output.

### S19 — Workflow shell env

- **Level**: Unit
- **Given**: `sync-homebrew-tap.yml`, `sync-r2.yml`, and the release workflows (`release-cli`, `release-desktop`, `release-desktop-electron`, `release-local-runtime`, `release-local-model-runtime`, `release-serve-emu`, `release-serve-sim`).
- **When**: the test extracts `run:` bodies.
- **Then**: no body contains `${{ github.event.`, `${{ github.event_name`, or `${{ inputs.`. The two sync files still map `head_branch` and `release_tag` under `env:` and their shells read `"$RELEASE_TAG_INPUT"` and `"$WORKFLOW_HEAD_BRANCH"`. Job-level `if:` expressions stay outside the scanner.
- **Signals**: string search over the extracted bodies.

### S20 — Lint cap

- **Level**: Toolchain
- **Given**: root `package.json`.
- **When**: the `lint` script is read.
- **Then**: it is still `oxlint --max-warnings=455`.
- **Signals**: file text. This PR does not edit that script.

### S21 — Only IPv4-mapped loopback is loopback

- **Level**: Unit
- **Given**: hosts and peers `::ffff:127.0.0.1`, `::ffff:0.0.0.0`, `::ffff:8.8.8.8`, and `::ffff:192.168.0.1`.
- **When**: `host_is_loopback`, `ensure_exposed_bind_has_token`, `require_local_token`, and `require_loopback_or_token` run.
- **Then**: only the `::ffff:127.x` address is treated as loopback. The others are refused at bind and rejected by both middlewares when no token is set. A mapped private address is still allowed only when LAN trust is on.
- **Signals**: `Result` and response status.

### S22 — Token compare cannot fall back to `==`

- **Level**: Unit
- **Given**: the source of `constant_time_eq` in `apps/api/src/middleware/mod.rs`.
- **When**: the test reads that function body.
- **Then**: it hashes both strings with SHA-256 and folds XOR. The only `==` is the accumulator check against `0`. The body does not call `.eq(`.
- **Signals**: source text assertions.

## Performance & load budgets

None. The file handler canonicalizes the registered project roots per request. That is a metadata walk, not a product hot path beyond existing image fetches.

## Regression checklist

- [x] Loopback `require_local_token` without a token still returns 200.
- [x] Bearer and query token checks still use the SHA-256 XOR fold. A source assertion fails if that function compares the secrets with `==`.
- [x] `::ffff:127.0.0.1` is loopback. `::ffff:0.0.0.0` and `::ffff:8.8.8.8` are not.
- [x] `ATMOS_ALLOW_LAN_TRUST` still allows private IPv4 without a token.
- [x] Origin guard tests in `middleware/mod.rs` still pass.
- [x] `/api/system/git-blob` is unchanged.
- [x] `package.json` lint cap is 455.
- [x] Job-level `if:` filters in the two workflows still use `github.event.workflow_run.head_branch`.

## Exploratory agent-browser checks

Omitted. No user-facing screen. Outside-root file reads fail closed in the API; the existing preview empty state already handles non-OK responses.

## Acceptance criteria

- [x] S1–S17, S19, S21, and S22 pass under `cargo test -p api`.
- [x] S18 `rg` matches TECH's caller table.
- [x] S20 lint cap unchanged.
- [x] `cargo fmt -p api -- --check` passes.
- [ ] Draft PR CI is green. `ios-simulator` may be skipped without the `ios-parity` label.
- [ ] The PR is not merged.

## Manual verification steps

None. Do not dispatch the release or Homebrew workflows from this PR.

## Non-coverage

- Executing `sync-homebrew-tap.yml` or `sync-r2.yml` against GitHub. S19 checks the script text only.
- `GET /api/system/git-blob` behavior. The missing directory allowlist is https://github.com/AruNi-01/atmos/issues/332.
- `ci-e2e.yml`, the deploy-pages workflows, and `pullfrog.yml`. Those still expand `github.event.*` or `inputs.*` inside `run:`. S19 scans the sync workflows and the release workflows.
- Later release steps that interpolate `steps.*.outputs`, other than the Homebrew cask and commit steps already moved to env.
- A live browser click-through of logo, diff, and attachment images. Callers keep the same URL shape; confinement is proven in Rust.
- CodeQL alerts other than the three findings in TECH.

## Coverage Status

2026-10-20, branch `aarynlu/security-audit-auth-files-ci-5061` (review follow-up; the 2026-10-19 run was 110 bin tests before these cases):

- S1–S9, S10–S17, S21, S22 — pass. `cargo test -p api --bin api`: 115 pass, 0 fail. Includes unset-token denial, loopback 200 / public 401, blank token, bind refusal, bearer and query match, query redaction of literal, case-variant, and percent-encoded keys (`s3cr3t-token-value` absent, `token=REDACTED` present on the 401 line and on the DEBUG access-log span for a 200), IPv4-mapped loopback only for `::ffff:127.x`, SHA-256 XOR-fold source assertion, LAN trust, in-root serve, outside and sibling and `..` 403, symlink escape 403 without the secret, in-root symlink 200, relative 400 / missing 404 / directory 400, exact logo vs sibling, extra root 200, filesystem root `/` 403.
- S18 — pass. `rg -n "/api/system/file"` matches only `apps/web` URL builders (`ProjectItem.tsx`, `use-project-logo-url.ts`, `AgentToolPathPreviewBody.tsx`, `agent-chat-file-links.ts`, `agent-composer-attachment.ts`, `resolve-blob-url.ts`, `FileViewer.tsx`, `md-live-media-plugin.tsx`, plus web tests). `apps/desktop`, `apps/desktop-electron`, `apps/mobile`, `apps/cli`, and `packages` have no matches. URL builders were not changed.
- S19 — pass. `cargo test -p api --test workflow_shell_env`: 1 pass. The scanner rejects `${{ github.event.`, `${{ github.event_name`, and `${{ inputs.` inside `run:` bodies of the two sync workflows and the release workflows. It still rejects `${{ steps.release.outputs.tag }}` and `${{ steps.release.outputs.version }}` inside Homebrew `run:` bodies. Job `if:` expressions are not scanned.
- S20 — pass. `package.json` `lint` is still `oxlint --max-warnings=455`.
- `cargo clippy -p api --all-targets --all-features -- -D warnings` exit 0. `cargo fmt -p api` applied.
- Draft PR CI (including CodeQL) recorded after the GitHub run finishes. `ios-simulator` may be skipped without the `ios-parity` label. Release workflows were not dispatched.
