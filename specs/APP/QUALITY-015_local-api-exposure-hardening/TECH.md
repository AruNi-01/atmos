# TECH · QUALITY-015: Local API Exposure Hardening

> Technical Design · HOW. First three findings of the 2026-10-20 security audit. Not a product feature. No BRAINSTORM or PRD (quality spec).

## Scope summary

Three server-side holes, one draft PR:

1. **M1.** `is_request_authorized` treats a missing `ATMOS_LOCAL_TOKEN` as success, so any non-loopback client is authorized. The rejection log prints the raw query, including `token=`.
2. **M2.** `GET /api/system/file` opens the query `path` with no root check (CodeQL `rust/path-injection` #57 #59 #60 #61: `exists`, `is_file`, `metadata`, `open`).
3. **M3.** `sync-homebrew-tap.yml` and `sync-r2.yml` interpolate `github.event.workflow_run.head_branch` and `github.event.inputs.release_tag` inside `run:` (CodeQL actions command injection #1 #2).

Out of scope: other CodeQL alerts, `GET /api/system/git-blob`, raising the oxlint cap above 455, and persisting a new bearer secret.

## Quality target

| Item                        | Before                                  | After                                                                                          |
| --------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unset token                 | `is_request_authorized` returns `true`  | Returns `false`. Loopback is still short-circuited earlier in `require_local_token`            |
| Non-loopback bind, no token | Process listens                         | Process exits before `TcpListener::bind`                                                       |
| Rejection log               | `query={:?}` includes `token=` values   | `token` query values replaced with `REDACTED`                                                  |
| `/api/system/file`          | Any existing file the API user can read | Canonical path must sit under an allowlisted directory, or match a stored project logo file    |
| Symlink escape              | Followed                                | Canonical target fails the prefix check; response is 403 and does not contain the target bytes |
| Workflow shell              | `${{ github.event... }}` inside `run:`  | Same values passed through step `env:` and read as `"$VAR"`                                    |

## Decision for M1: refuse to start

When `SERVER_HOST` is not a loopback address and `ATMOS_LOCAL_TOKEN` is unset or blank, **refuse to start**. Do not auto-generate a token.

Why:

- Desktop, CLI, and web discover the API from `runtime_manifest.json`. That file must not contain a bearer token (`crates/runtime-manager` contract).
- Default clients do not send `ATMOS_LOCAL_TOKEN`. A generated token they cannot read would still 401 every non-loopback client, while the socket stays open and the secret rotates every restart with nowhere safe to store it.
- Writing the secret into the manifest is forbidden. A new secret store is outside this audit.
- Dev and Desktop bind `127.0.0.1` (`apps/desktop-electron/src/runtime/ensure.ts` `DEFAULT_HOST`). Those processes keep starting with no token. Loopback requests stay authorized by `is_trusted_local_source` / `is_loopback_ip` before `is_request_authorized` runs.
- `ATMOS_ALLOW_LAN_TRUST` is not a waiver. It only skips the per-request check for private and link-local peers. A non-loopback listen socket still requires an explicit token before bind. After a token is set, LAN trust keeps exempting those peers from presenting it.

Loopback hosts: `localhost` (any case), `127.0.0.0/8`, `::1`, and IPv4-mapped loopback. `0.0.0.0`, `::`, other IPs, and DNS names are not loopback.

Blank or whitespace-only `ATMOS_LOCAL_TOKEN` counts as unset in both the startup check and `is_request_authorized`. A non-blank token keeps today's header and `token=` query comparison, including `constant_time_eq`.

## Architecture overview

```
apps/api/src/config/mod.rs
  ServerConfig::ensure_exposed_bind_has_token  →  called from main before bind

apps/api/src/middleware/mod.rs
  require_local_token
    loopback or (LAN && ATMOS_ALLOW_LAN_TRUST) → allow
    else is_request_authorized → false when token unset
    rejection log uses redact_query_token

apps/api/src/api/system/files.rs
  serve_file → allowlist_for_state → serve_allowed_file
    canonicalize, then Path::starts_with on each directory root
    exact match for stored project logo files
    open only that canonical path

.github/workflows/sync-homebrew-tap.yml
.github/workflows/sync-r2.yml
  env RELEASE_TAG_INPUT / WORKFLOW_HEAD_BRANCH
  shell "$RELEASE_TAG_INPUT" / "$WORKFLOW_HEAD_BRANCH"
```

No new crate, table, WebSocket message, or REST route. `/api/system/file` stays REST because it streams bytes (existing exception in `apps/api/AGENTS.md`).

## Module-by-module design

### `apps/api/src/config/mod.rs`

```rust
pub fn token_is_configured(token: &Option<String>) -> bool
pub fn host_is_loopback(host: &str) -> bool

impl ServerConfig {
    pub fn ensure_exposed_bind_has_token(&self) -> Result<(), BindAuthError>
}
```

`BindAuthError`'s `Display` names `SERVER_HOST` and `ATMOS_LOCAL_TOKEN`. It does not echo a token value.

`apps/api/src/main.rs` calls `ensure_exposed_bind_has_token` immediately before `socket_addr()` / `TcpListener::bind`. Failure returns from `main`.

### `apps/api/src/middleware/mod.rs`

`is_request_authorized`: if `token_is_configured` is false, return `false`. Do not read the header or query for that case.

`redact_query_token(query: Option<&str>) -> String`:

- `None` → `<none>`
- Split on `&`. A pair whose first six bytes equal `token=` ignoring ASCII case becomes `token=REDACTED`.
- Other pairs are unchanged.

`require_local_token` logs `path`, the redacted query, and `remote`. It does not log `Authorization`.

`require_loopback_or_token` already omits the query. It picks up the new `false` return for free, so a non-loopback destructive call with no token is 401.

### `apps/api/src/api/system/files.rs`

`FileServeAllowlist` directory roots, union of:

| Root                                                                          | Why callers need it                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Each project's `main_file_path`                                               | File viewer, diff worktree files on the main checkout, in-repo logos, md-live documents |
| `GitEngine::get_workspaces_base_dir()` (`~/.atmos/data/workspaces`)           | Workspace worktrees, diff files, `.atmos/attachments` under a worktree                  |
| `default_agent_data_dir()` (`~/.atmos/data/agent`, or `ATMOS_AGENT_DATA_DIR`) | Agent Chat attachments under `chats/{id}/attachments`                                   |
| `ATMOS_FILE_SERVE_ROOTS`                                                      | Operator allowlist. `std::env::split_paths`                                             |

Exact files, not directories: each project's absolute `logo_path`. A user-picked logo outside the repo still loads. Its sibling files do not. `https://` logos are not absolute paths and are skipped (the web app does not send those to this endpoint).

A root whose canonical path has `parent() == None` (filesystem root) is ignored, so `ATMOS_FILE_SERVE_ROOTS=/` does not reopen the machine.

`serve_allowed_file`:

1. Reject empty, NUL, or non-absolute paths with 400 `Path must be absolute`.
2. `std::fs::canonicalize`. Failure → 404 `File not found` (missing path). Do not call `exists`, `is_file`, `metadata`, or `open` on the raw query path.
3. For each directory root, canonicalize the root, skip filesystem roots, then `if canonical.starts_with(&root)` serve **inside that branch**.
4. Else if a logo path canonicalizes equal to `canonical`, serve the **logo path**, not the query path.
5. Otherwise 403 `File is outside the allowed directories`.

`starts_with` is `std::path::Path::starts_with` (component-wise), so `/tmp/ws` does not allow `/tmp/ws-evil`. The `open` / `metadata` / `is_file` sinks sit in the true branch of `starts_with`, which is the CodeQL `Path::starts_with` barrier (`rust/path-injection`). Symlinks are resolved by `canonicalize` before the check, so a link inside a root whose target is outside fails the prefix check and is not opened.

Status codes otherwise match today: 400 `Not a file`, 500 on metadata/open failure, 200 with the same content-type and content-length headers.

`serve_file` loads the allowlist from `AppState::project_service.list_projects()`. A DB error returns 500 `File access policy unavailable` and does not fall open.

### Frontend callers

Grep of `apps/web`, `apps/desktop`, `apps/desktop-electron`, `apps/mobile`, `apps/cli`, and `packages` finds callers only in `apps/web`:

| Caller                                                         | Path it sends                                  | Still served                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ProjectItem.tsx`, `use-project-logo-url.ts`                   | Stored `logoPath`                              | In-repo logos via project root; external picks via exact logo file                                              |
| `resolve-blob-url.ts` worktree branch                          | `repoPath + relative`                          | Project root or worktrees base                                                                                  |
| `FileViewer.tsx` `stream://`                                   | Editor source path                             | Project or worktree file                                                                                        |
| `agent-composer-attachment.ts`                                 | Uploaded attachment path                       | Under the worktree or `~/.atmos/data/agent`                                                                     |
| `AgentToolPathPreviewBody.tsx` / `resolveAgentChatPreviewPath` | Absolute path, including outside the workspace | Served only when that path is under a root above. Other paths 403; the preview already treats non-OK as missing |
| `md-live-media-plugin.tsx`                                     | Document-relative or absolute                  | Document-relative stays under the workspace root. Arbitrary absolute paths 403 unless allowlisted               |

URL builders are unchanged. Comments that say any outside-workspace path is served are updated so they match the allowlist.

Desktop and mobile do not call this endpoint.

### Workflows

In the resolve step of both files:

```yaml
env:
  RELEASE_TAG_INPUT: ${{ github.event.inputs.release_tag }}
  WORKFLOW_HEAD_BRANCH: ${{ github.event.workflow_run.head_branch }}
run: |
  TAG="$RELEASE_TAG_INPUT"       # workflow_dispatch
  TAG="$WORKFLOW_HEAD_BRANCH"    # workflow_run
```

Job-level `if:` expressions stay as expressions. They are not shell. Other `${{ }}` inside those `run:` blocks (`github.event_name`, `github.event.release.tag_name`) are unchanged in this spec.

## Data model

No new tables or wire types.

```rust
pub struct FileServeAllowlist {
    pub directory_roots: Vec<PathBuf>,
    pub exact_files: Vec<PathBuf>,
}
```

## Transport

No new WebSocket message. No new REST route.

`GET /api/system/file?path=` remains a byte stream. Justification: binary file response, already classified as REST in `apps/api/AGENTS.md`. This change only tightens who may read which path.

## Security & permissions

- Loopback without a token stays the dev/Desktop default.
- Non-loopback without a token is denied at request time and refused at bind time.
- Query tokens are not written to the unauthorized-request log.
- File bytes are read only after canonicalize + prefix check, or exact logo equality.
- `ATMOS_FILE_SERVE_ROOTS` is an operator opt-in. It cannot be the filesystem root.
- Tokens are not added to `runtime_manifest.json`.

## Rollout plan

1. Add this spec and the `specs/README.md` QUALITY-015 row.
2. Startup refusal + `is_request_authorized` + query redaction, with Rust tests.
3. File allowlist, canonicalize, prefix check, symlink-escape tests.
4. Workflow env move, plus a Rust check that those two expressions are absent from `run:` bodies.
5. Draft PR against `main`. Do not merge. Do not mark ready.

## Risks & tradeoffs

- **Risk**: a markdown image or agent preview that points outside every root (the documented `~/.grok/sessions/...` case) now 403s and the UI shows the existing empty/missing state. Operators add that directory to `ATMOS_FILE_SERVE_ROOTS` if they need it. In-repo, worktree, attachment, and stored-logo reads keep working.
- **Tradeoff**: refuse-to-start instead of auto-generating a token, for the reasons in the decision section. `ATMOS_ALLOW_LAN_TRUST` alone cannot bind a non-loopback socket until a token is also set.
- **Tradeoff**: missing paths are 404 even when they would have been outside the allowlist (`canonicalize` fails). Existing symlink escapes point at real files, so they 403. A dangling symlink is 404.
- **Residual**: canonicalize-then-open is still a TOCTOU window. The opened path is the canonical path that passed `starts_with`, not the raw query string.
- **If this breaks in production**: set `ATMOS_LOCAL_TOKEN` before binding a non-loopback host, or bind `127.0.0.1`. Add a directory to `ATMOS_FILE_SERVE_ROOTS` for a legitimate file root the allowlist missed. Revert the workflow env lines if a release sync stops resolving tags.

## Dependencies & compatibility

- Depends on: none. QUALITY-012 and QUALITY-013 are unused numbers; this spec is the next free id after QUALITY-014.
- Blocks: none.
- Minimum Atmos version: this API build. No manifest schema change.
- Lint cap stays `oxlint --max-warnings=455`.
- `apps/api/AGENTS.md` auth paragraph is updated to match the new bind and token rules.

## Open questions

None. The bind decision is refuse-to-start.
