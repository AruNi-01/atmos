# TECH · APP-057: Linear Task Integration

> Technical Design · HOW. Implements PRD APP-057 Must Haves **M1–M12**.

## Scope summary

| Layer | Responsibility |
|-------|----------------|
| `crates/core-engine` | Linear GraphQL read client, rate-limit header parse, OAuth PKCE helpers, filter → GraphQL mapping, GitHub URL extract from attachments |
| `crates/infra` | `workspace_external_issue` table + entity/repo; optional no-op if credentials stay file-based |
| `crates/core-service` | Credential store (local file), association service, list/link/create orchestration, disconnect without cascade-delete |
| `apps/api` WS | `linear_*` actions (status, connect key, oauth start/finish, disconnect, issues list, rate limit, link, unlink) |
| `packages/api-types` | Wire DTOs + `WsAction` variants |
| `apps/web` | Settings Integrations Linear card + Task Linear panel |

Non-goals: webhooks, Linear mutations, GitHub column migration.

## Architecture overview

```text
Settings UI / Task UI
        │  WS linear_*
        ▼
apps/api WsMessageService
        │
        ▼
core-service LinearService
   ├─ Hub integrations (user_id) via hub_cookie
   ├─ WorkspaceExternalIssueRepo (SQLite, display)
   └─ core-engine LinearClient
          └─ GraphQL https://api.linear.app/graphql
             (+ OAuth token endpoints for OAuth path)
```

## Auth

### API key (M1)

- User pastes key → validate with `viewer { id name }` → store:
  - `auth_method: "api_key"`
  - `api_key`
  - `viewer_id`, `viewer_name`
  - `connected_at`
- Requests: `Authorization: <api_key>` (Linear personal key style).

### OAuth (M1, M2)

- Config: `LINEAR_OAUTH_CLIENT_ID` (and optional secret only for confidential server exchange if ever needed). Prefer **public client + PKCE**.
- Redirects registered on Linear app:
  - Desktop: `http://127.0.0.1:<port>/integrations/linear/callback`
  - Web: origin-based `/integrations/linear/callback`
- Flow: generate `state` + `code_verifier` → authorize URL `scope=read` → callback → exchange → store access/refresh/expires.
- Refresh on 401 / near expiry; disconnect calls revoke best-effort then deletes credential file fields.

### Credential store

- **Hub only** (`user_integrations.provider = linear`).
- Local API never persists Linear secrets to disk.
- Disconnect deletes Hub row; **never** touches association table (M3).


## Credentials — Hub only (joint with APP-056)

**Single source of truth:** Hub D1 `user_integrations` keyed by Better Auth `user_id`.

```text
apps/web (Hub session cookie)
  → packages/hub  PUT/GET/DELETE /v1/me/integrations/linear
  → Better Auth session required

apps/api Linear WS
  → receives hub_cookie from client
  → GET Hub credentials → Linear GraphQL (read-only)
  → workspace_external_issue stays local SQLite (display only)
```

**Forbidden:** `~/.atmos/linear_credentials.json`, install-global secrets, dual write.

**Computers / Relay:** also Hub `user_id` + device credentials only (APP-056). Using Computer Relay features requires sign-in + device enroll.


## Data model

### `workspace_external_issue` (M10)

| Column | Type | Notes |
|--------|------|-------|
| `guid` | string PK | ULID/uuid |
| `workspace_guid` | string FK → workspace | cascade delete with workspace only |
| `provider` | string | `linear` |
| `external_id` | string | Linear issue UUID |
| `identifier` | string | e.g. `LAN-48` |
| `title` | string | snapshot |
| `url` | string | open in Linear |
| `snapshot_json` | text null | labels, project, priority, state, github urls, assignee… |
| `linked_at` | datetime | first link time |
| `updated_at` | datetime | last snapshot write |

Unique: `(workspace_guid, provider, external_id)`.

No FK from associations to credentials.

## Linear client (core-engine)

Pure functions unit-tested without network:

- `parse_rate_limit_headers(headers) -> LinearRateLimit`
- `build_issues_filter(preset, team_id, project_id, query) -> GraphQL filter JSON`
- `extract_github_refs_from_attachment_urls(&[url]) -> Vec<GithubRef>`
- `oauth_pkce_challenge(verifier) -> challenge`
- `select_oauth_redirect(shell) -> redirect_uri`

Network methods (injectable HTTP for tests):

- `viewer()`
- `list_issues(filter, first, after)`
- `list_teams()` / `list_projects()` as needed for filter pickers
- `probe_rate_limit()` — cheap `viewer { id }` and return last headers

### List filter mapping (M7)

| UI | GraphQL filter sketch |
|----|----------------------|
| Active | `state: { type: { in: ["started", "unstarted"] } }` (exact set TECH-tuned) |
| Backlog | `state: { type: { eq: "backlog" } }` |
| All | no state type filter |
| Team | `team: { id: { eq: teamId } }` |
| Project | `project: { id: { eq: projectId } }` |
| Query | `or: [{ title: { containsIgnoreCase } }, { number: … }]` / identifier search |

Issue node fields: id, identifier, title, url, priority, createdAt, updatedAt, state { name type }, labels { nodes { name color } }, project { name }, assignee { name avatarUrl }, attachments { nodes { url title } }.

## WS actions

| Action | Purpose |
|--------|---------|
| `linear_status` | connected?, method, viewer |
| `linear_connect_api_key` | `{ api_key }` |
| `linear_oauth_start` | `{ shell }` → `{ authorize_url, state }` |
| `linear_oauth_finish` | `{ code, state, redirect_uri }` |
| `linear_disconnect` | clear creds only |
| `linear_rate_limit` | request + complexity buckets |
| `linear_issue_list` | filters + pagination |
| `linear_filter_options` | teams/projects for pickers |
| `linear_link_issue` | workspace_guid + issue snapshot |
| `linear_unlink_issue` | workspace_guid + external_id |
| `linear_links_for_workspace` | list associations |

Create workspace: reuse existing `workspace_create` path; after create, call link; map Linear description → GitHub-like issue payload for TODO import when needed (service helper).

## Settings + Task UI

- **Settings**: extend `IntegrationsSettingsSection` with Linear card + two `RateLimitBar`s (requests, complexity).
- **Task**: `TaskLinearPanel` parallel to `TaskGithubPanel`; source tab in `TaskManagementView`.
- i18n: `settings.integrationsSection.linear.*`, `task.linear.*` in en + zh.

## Rollout

1. Migration + entity/repo + credential store + engine pure fns + tests.
2. LinearService + WS handlers + api-types.
3. Settings UI + Task list/link UI.
4. OAuth env wiring; document required Linear OAuth app redirects.

## Risks

- Live OAuth needs registered app — API key path is CI-safe.
- GraphQL filter field names may need adjustment against live schema; keep mapping in one module.
- Do not log tokens.
