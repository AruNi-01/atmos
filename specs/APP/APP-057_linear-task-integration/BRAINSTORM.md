# Brainstorm · APP-057: Linear Task Integration

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos Task Management already lists GitHub issues/PRs as an external source and can link a workspace to a GitHub issue (URL + snapshot columns on `workspace`). Many agentic builders track work in **Linear** instead of (or in addition to) GitHub Issues.

Goal of this exploration: add Linear Issues as another **import / link source** in Task — not a full Linear client, not realtime sync, and not a second project hierarchy inside Atmos.

Linear is currently only mentioned as a future Automations surface (APP-017); there is no Issues → Task / Workspace design yet.

Related product precedents:

- [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md) — `gh` CLI auth, on-demand fetch, branch-centric PR ops.
- Task Management UI — source tabs for Atmos workspaces vs GitHub issues/PRs; link-find helpers under `apps/web/src/features/task/`.
- Workspace entity today stores `github_issue_url` / `github_issue_data` (and PR equivalents) **on the workspace row**, not a separate association table.

Reference UI (product intent): Linear’s own Issues list (team `Land_atmos` screenshot) — priority, identifier, status, title, labels, project chip, GitHub `#N` chips, assignee, dates. Atmos Task Linear tab should **visually and structurally align** with that list, not invent a sparse alternate layout.

## Goals (draft)

Primary:

1. Browse / filter Linear Issues **on demand** in Task; **create an Atmos Workspace** from a selected issue (read Linear only — no write-back to Linear).
2. **Link multiple** Linear issues to a Workspace; store denormalized id / identifier / title / url (etc.) in a **dedicated association table** for popover / kanban display.
3. When a Linear issue already points at GitHub (attachments / linked PR-issue chips), **show those chips** and optionally reuse existing GitHub capabilities; create-workspace import **parity with GitHub**.
4. Support **both API key and OAuth** (desktop + web redirects); credentials live **on the user machine** (global to the local Atmos install).
5. Settings → Integrations → Linear: connect/disconnect + **API request/complexity quota** UI (GitHub-like rate bars).

Non-goals for v1:

- Webhooks / near-realtime push.
- In-app Linear detail, comments, timeline, or state transitions (open Linear URL instead).
- Creating / updating / commenting on Linear issues from Atmos.
- Binding Atmos Project / Groups to Linear Team / Linear Project.
- Bidirectional status sync; Automations on Linear events (defer to APP-017 later).

## Working decisions (from product conversation)

Provisional locks for this brainstorm — promote or revise in PRD.

| # | Topic | Decision |
|---|--------|----------|
| D1 | **Sync model** | **No webhooks.** User-driven filter + fetch only. |
| D2 | **Auth** | **Both API key and OAuth.** User picks either. Tokens/keys stored **locally** (global connection). See OAuth deep-dive. |
| D3 | **Association depth** | Link + display snapshot only. No detail/timeline mirror. “Open in Linear” for depth. |
| D4 | **Linear Team** | **Filter only** — not a bound Atmos entity. |
| D5 | **Linear Project** | **Filter only** — not bound to Atmos Project. |
| D6 | **Persistence** | **Dedicated association table** (not more columns on `workspace`). Redundant issue id + identifier + title (+ related display fields). |
| D7 | **GitHub cross-links** | Show Linear’s GitHub chips/attachments in the list; optional reuse of existing GitHub flows when relevant. |
| D8 | **Write path** | **Read-only** against Linear. Primary action = **create Atmos Workspace** (and multi-link). No Linear mutations. |
| D9 | **Cardinality** | **Many Linear issues per Workspace** allowed. |
| D10 | **Connection scope** | **One global Linear connection** per local Atmos install (not per Atmos Project). Filtering happens at list time (team / project / …). |
| D11 | **List UI** | **Align with Linear Issues list** (see List UI section + screenshot reference). Filters will be richer than GitHub Task filters. |
| D12 | **GitHub optional sync** | When creating a Workspace from a Linear issue, **may also attach GitHub link metadata** if Linear already points at a GitHub issue/PR (optional path; keep simple). |
| D13 | **OAuth platforms** | **Both** desktop/loopback and web HTTPS callback — pick the redirect that matches **where the user is authenticating** (desktop shell vs web). |
| D14 | **Import body / TODOs** | **Align with existing GitHub issue → workspace import** (same requirement/TODO extraction optionality and files — do not invent a Linear-only import product). |
| D15 | **Disconnect / stale creds** | **Do not delete association rows** when credentials expire or user disconnects. No webhooks ⇒ we cannot know remote lifecycle; **first successful link snapshot is the display source of truth** until the user re-links or edits. |
| D16 | **Settings** | Settings → **Integrations** gains a **Linear** card (connect OAuth / API key, status, disconnect). Show **API quota usage** panels analogous to GitHub’s rate-limit bars (`IntegrationsSettingsSection` + `github_rate_limit`). |

## Options

### Option A — Task Linear tab + dual auth + multi-link table + read-only create-workspace (chosen direction)

What it is:

- Settings → Integrations → Linear: connect via **OAuth** *or* paste **API key**.
- One global connection; Task Management gains a **Linear** source tab.
- Rich filters (team, project, state/view tabs, labels, assignee, …) → on-demand GraphQL list.
- Row UI mirrors Linear’s issue list density (priority, `LAN-48`, status, title, labels, project, GitHub `#N`, assignee, dates).
- Primary actions: **Create Workspace**, **Link to existing Workspace**, open in Linear. Never write to Linear.
- Association table stores N links per workspace for chips in popover / kanban.

**Pros**: Matches product decisions D1–D12; local-first; no Linear write permission needed (`read` scope / read-only API key).  
**Cons**: Dual auth increases TECH surface (OAuth app + key path); rich filters + Linear-like list is non-trivial UI work.  
**Unknown**: OAuth redirect strategy per shell (web vs desktop); whether GitHub handoff is v1 or phase-2 of the same ship.

### Option B — API key only (rejected as sole path)

Simpler ship, worse connect UX. Still available as **one of two** methods under Option A.

### Option C — Deep-link paste only (rejected)

Too weak as Task import surface.

### Option D — Full Linear client / write-back (explicitly out of v1)

Deferred.

## Auth deep-dive

### Why both key and OAuth

| | API key | OAuth |
|--|---------|--------|
| UX | Paste key from Linear Settings | “Connect Linear” button |
| Setup cost for Atmos | None (user-owned key) | Need Atmos-owned Linear OAuth Application |
| Scope control | User picks Read / Write / team limits in Linear UI | App requests `read` only (v1) |
| Rate limits (docs table) | ~2.5k req/h (prose also cites 5k) | ~5k req/h |
| Complexity budget | Higher (3M pts/h) | Lower (2M pts/h) |
| Fits v1 traffic | Yes (on-demand list) | Yes |

For on-demand lists, **quota is not the driver**. Dual support is about **user preference**: power users already have keys; others prefer Connect.

v1 GraphQL needs only **`read`**. Do not request `write` / `issues:create` / `admin`.

### Can secrets live only on the user machine?

**Yes — and that should be the default.**

What is “user local” in Atmos:

- Credentials written to the **local runtime store** (same class of data as other local settings / DB on the machine running API/desktop).
- **Not** uploaded to Atmos cloud by default.
- Not shared across machines unless the user copies their data directory (out of scope for v1 sync).

What gets stored:

| Credential | Who issues it | Store locally? |
|------------|---------------|----------------|
| Linear **API key** | User, in Linear Settings | Yes (secret) |
| OAuth **access_token** | Linear token endpoint (~24h) | Yes (secret) |
| OAuth **refresh_token** | Linear token endpoint | Yes (secret) |
| OAuth **client_id** | Atmos OAuth app (public identifier) | Can ship in app config (not a secret) |
| OAuth **client_secret** | Atmos OAuth app | **Must not** ship in open-source / client bundle if avoidable — see PKCE |

API key and user tokens are **the user’s** secrets; storing them locally is correct for a local-first product (same idea as `gh` credentials on disk).

Hardening later (TECH): OS keychain / encrypted-at-rest if the project already has a pattern; at minimum avoid logging tokens and avoid putting them in renderer-accessible plain storage without care.

### How OAuth works end-to-end (recommended for Atmos)

Linear OAuth does **not** require a registered company. Create an OAuth app under **any Linear workspace** you control (Settings → API → Applications). Linear recommends a dedicated workspace for managing the app because all admins of that workspace can access it.

#### 0. One-time: register the OAuth application (Atmos maintainers)

1. Open Linear → workspace used for product engineering → **Settings → API → Applications → New**.
2. Set name (e.g. `Atmos`), homepage, and **callback / redirect URIs**, for example:
   - Desktop / local API: `http://127.0.0.1:<port>/integrations/linear/callback` (exact port/path fixed in TECH).
   - Hosted web (if needed): `https://<atmos-domain>/integrations/linear/callback`.
3. Note `client_id` and `client_secret`. Prefer enabling / using **PKCE** so token exchange can omit `client_secret` for public clients.
4. Publish or leave as private app as Linear’s UI allows; end users authorize against this app id.

Atmos does **not** need Linear’s “client_credentials / app actor” flow for v1 — that is for server agents acting as the app. We use **user actor** (`actor=user`, default): each user authorizes their own Linear access.

#### 1. User clicks “Connect Linear” in Atmos

Atmos generates:

- `state` — random CSRF nonce (store briefly in local session).
- PKCE: `code_verifier` (random) → `code_challenge` = `BASE64URL(SHA256(verifier))`, method `S256`.

Open system / in-app browser to:

```http
GET https://linear.app/oauth/authorize
  ?response_type=code
  &client_id=ATMOS_CLIENT_ID
  &redirect_uri=REGISTERED_REDIRECT_URI
  &scope=read
  &state=RANDOM_STATE
  &code_challenge=...
  &code_challenge_method=S256
  &actor=user
```

Optional: `prompt=consent` if we want to re-prompt or switch Linear workspaces.

#### 2. User consents in Linear

Linear redirects browser to the registered `redirect_uri` with:

```text
?code=AUTH_CODE&state=RANDOM_STATE
```

Atmos local handler (desktop loopback HTTP or web route):

1. Verify `state` matches.
2. Discard if mismatch.
3. Exchange code for tokens (no user-visible secret paste).

#### 3. Exchange code → tokens

```http
POST https://api.linear.app/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE
&redirect_uri=SAME_AS_AUTHORIZE
&client_id=ATMOS_CLIENT_ID
&code_verifier=PKCE_VERIFIER
```

With PKCE, **`client_secret` is optional**. That is the path that lets an open-source / installable client avoid embedding a secret.

Response (illustrative):

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 86399,
  "scope": "read",
  "refresh_token": "..."
}
```

#### 4. Persist on the user machine (global connection)

Single global record, e.g. conceptual:

- `provider = linear`
- `auth_method = oauth | api_key`
- `access_token` / `refresh_token` / `expires_at` **or** `api_key`
- `linear_org_hint` / `viewer_name` (optional display)
- `connected_at`

Only **one active** Linear credential set for the install (D10). Connecting again replaces or re-auths.

#### 5. Call GraphQL with the user token

```http
POST https://api.linear.app/graphql
Authorization: Bearer <access_token>
```

API key mode uses Linear’s key header style (`Authorization: <api_key>`) instead — same GraphQL queries.

#### 6. Refresh before expiry

Access token ~24h. On `401` / near expiry:

```http
POST https://api.linear.app/oauth/token
grant_type=refresh_token
&refresh_token=...
&client_id=ATMOS_CLIENT_ID
```

(PKCE-originated tokens can refresh with `client_id` only.) Linear documents a short grace window if a refresh response is lost — TECH should store the new refresh token atomically.

#### 7. Disconnect

- Call Linear revoke endpoint with the token when user disconnects (best effort).
- Delete local credential row.
- Association table **rows can remain** (denormalized display) or be kept with “stale connection” UX — open in PRD.

### Platform notes (D13 — both shells)

| Where user authenticates | Redirect approach |
|--------------------------|-------------------|
| **Desktop (Electron)** | Loopback `127.0.0.1` during connect and/or custom protocol `atmos://linear/callback`. PKCE. |
| **Web (local or hosted)** | Registered **HTTPS (or local origin) redirect** on the web app / API callback route the user is actually using. PKCE. |

Product rule: **implement both**; at connect time choose the redirect URI registered for the current shell. OAuth app registration must list **all** redirect URIs Atmos will use (desktop loopback + web callback(s)).

TECH still owns exact ports/paths and how the local API participates in the code exchange.

### API key path (short)

1. User creates personal API key in Linear (prefer **Read** only; can team-scope the key in Linear).
2. Pastes into Atmos Settings.
3. Stored in the same global credentials table with `auth_method=api_key`.
4. Same issue list / link code paths as OAuth — only the HTTP auth header differs.

### What we do **not** need for v1 OAuth

- `client_credentials` / app-actor tokens (server agent identity).
- `admin` scope (webhooks management).
- Cloud-side storage of user Linear tokens.
- Corporate legal entity to create the OAuth app.

## Concept mapping (deliberately loose)

| Linear | Atmos v1 role |
|--------|----------------|
| Linear Workspace | Implicit tenant of the connected credentials; not an Atmos entity |
| Team | **List filter** (+ required context when Linear API scopes issues by team) |
| Linear Project | **List filter** + optional **row chip** (see UI) |
| Issue | External task we list / multi-link |
| Attachments / GitHub chips | Display; optional GitHub handoff |
| Atmos Project | Git repo container; **no** Linear Team binding |
| Atmos Workspace | Work unit; **0..N** Linear issue links |

Homonym warning: always prefix in UI copy (“Linear issue”, “Linear team”, “Linear project”).

## Association model sketch (for later TECH — not committed schema)

Motivation (D6, D9): multi-link + multi-provider-ready storage; denormalized fields for offline-ish UI chips.

Illustrative:

- `workspace_guid` (FK)
- `provider` = `linear`
- `external_id` (Linear issue UUID)
- `identifier` (`LAN-48`)
- `title`
- `url`
- `priority` / `state_type` / `state_name` (optional snapshot for chips)
- `snapshot_json` (labels, project name, github urls, assignee display…)
- `linked_at`, `updated_at`
- Unique `(workspace_guid, provider, external_id)`

Display consumers: workspace popover, kanban cards, Task “linked workspace” finder.

Refresh: update snapshots when user re-fetches list or explicitly refreshes links — not continuous sync.

Primary product action from a list row: **Create Atmos Workspace** (optionally prefill name from identifier/title; store association row). Linking additional issues to an existing workspace is supported (D9).

### Snapshot durability (D15)

- Association rows are written on **first successful link / create-workspace** with denormalized fields for UI.
- **No webhook** and no background revalidation required for “what did the user link?”
- Credential disconnect, token expiry, or failed list fetch **must not cascade-delete** links.
- Popover / kanban keep using the stored snapshot; optional “refresh from Linear” is a later explicit action (not a v1 must).
- Stale title vs live Linear is acceptable; user can re-link or open Linear for live truth.

## GitHub cross-link + import parity (D7, D12, D14)

Linear UI shows GitHub-style chips (`#164`, `#192`, …) when issues are linked to GitHub PRs/issues.

v1:

1. List query includes attachment / external link fields needed to render similar chips.
2. Chip click → open GitHub URL in browser at minimum; reuse GitHub Task helpers when `owner/repo` matches current project.
3. **Create Workspace from Linear** may **also** set GitHub issue/PR link fields when Linear already exposes a clear GitHub URL.
4. **Body / TODO import**: **same behavior as GitHub-origin workspace create** (requirement markdown, optional auto-extract TODOs — mirror existing `workspace` + `workspace_todos` path). Do not invent a Linear-only import UX.

Not required: reverse-syncing Atmos data into Linear; continuous re-import of description.

## Settings → Integrations → Linear (D16)

Mirror the GitHub card in `apps/web/src/features/settings/components/IntegrationsSettingsSection.tsx`.

### Card content

- Title / description: Linear for Task issue list + workspace linking.
- Connection status: disconnected | OAuth | API key; viewer name when available.
- Actions: Connect OAuth (shell-appropriate redirect), paste/replace API key, Disconnect (revoke OAuth best-effort; clear **local credentials only** — keep association rows per D15).

### API quota usage (like GitHub rate-limit panel)

GitHub today: `github_rate_limit` → `core` / `search` / `graphql` bars (used/limit, remaining, reset) + Refresh.

Linear product intent:

| Bucket | Headers on GraphQL responses | UI |
|--------|------------------------------|-----|
| **Requests** | `X-RateLimit-Requests-Limit` / `Remaining` / `Reset` | Progress bar |
| **Complexity** | `X-RateLimit-Complexity-Limit` / `Remaining` / `Reset` | Progress bar |

- Show only when connected; Refresh re-probes (cheap viewer query or last response headers — TECH).
- Do **not** poll solely for the meter; update on Settings open, manual refresh, and opportunistically from list-fetch headers.
- Task list surfaces `RATELIMITED` clearly; Settings is where users inspect budget.

## List UI — align with Linear Issues (screenshot)

Reference: Linear Issues list for team/workspace `Land_atmos` (user-provided screenshot). Atmos Task **Linear** tab should feel like a familiar Linear list inside Task chrome, not a bare table of titles.

### Density / row anatomy (left → right)

| Region | Linear reference | Atmos list field |
|--------|------------------|------------------|
| Priority | Orange `!`, gray `---` | `priority` (urgent/high/…/none) |
| Identifier | `LAN-48` | `identifier` |
| Status | Open circle / completed check | `state` (type + name); icon by state type |
| Title | Full issue title | `title` (single line, truncate) |
| Labels | Pill chips (`enhancement`, `Feature`, `UI`, `Bug`) | `labels[]` |
| Project | Cube + name (`Test`) | Linear project name if any (filter + display only) |
| GitHub | `#164` style chips | Parsed GitHub issue/PR numbers/urls from attachments |
| Assignee | Avatar / empty | `assignee` avatar or placeholder |
| Dates | Created / updated (e.g. Jul 20 · Aug 10) | `createdAt` / `updatedAt` (relative or short month-day) |

Row click / primary CTA:

- Prefer **Create Workspace** / show linked Atmos workspaces (if any).
- Secondary: open Linear in browser.
- **Do not** open an in-app Linear detail/timeline page in v1.

### Top chrome (filters — richer than GitHub Task)

Linear-like controls to support (phased if needed, but product expects “more filters”):

- View-ish tabs or presets: e.g. **Active** / **Backlog** / **All** (map to Linear state types / filter presets — exact mapping in TECH via GraphQL filters).
- **Team** filter (multi or single — open).
- **Linear Project** filter.
- State / status, assignee, labels, priority.
- Free-text search (title/identifier).
- Sort (updated, created, priority…) — align with what GraphQL allows easily.
- Manual refresh (React Query style staleTime + button), no webhook.

Empty / disconnected states:

- Not connected → CTA to Settings (OAuth or API key).
- Connected but no rows → adjust filters.

Visual language: use Atmos design system components, but **information hierarchy** matches Linear (identifier muted, title primary, meta chips trailing). Avoid ALL CAPS status labels (project English casing rules).

## Key forks in the road

| Fork | Status |
|------|--------|
| Auth key vs OAuth | **Resolved: both** |
| Write to Linear | **Resolved: no** — create Atmos Workspace only |
| Cardinality | **Resolved: many links per workspace** |
| Connection scope | **Resolved: global** |
| Team/Project binding | **Resolved: filter only** |
| List UI fidelity | **Resolved: align with Linear list** |
| OAuth platforms | **Resolved: both desktop + web** (redirect by auth surface) |
| GitHub on create-workspace | **Resolved: allowed** when Linear has GitHub link |
| Body/TODO import | **Resolved: align with GitHub** |
| Disconnect vs links | **Resolved: keep association snapshots** |
| Settings + quota UI | **Resolved: Integrations Linear card + rate bars like GitHub** |
| OAuth redirect URIs / code exchange | **Open → TECH** (register multi-URI; PKCE) |
| Association table generic vs linear-specific | **Open → TECH** |
| Migrate GitHub columns into same table later | **Open → TECH** (out of v1 product need) |
| Multi-link chip UI density | **Open → PRD** (all ids vs primary + “+N”) |
| Filter preset exact set for v1 | **Open → PRD** (Active/Backlog/All + team/project as must) |
| Linear rate probe WS action shape | **Open → TECH** (mirror `github_rate_limit`) |

## Open questions

- [ ] OAuth app ownership: product Linear workspace vs personal maintainer workspace for OSS?
- [ ] Is public `client_id` + PKCE (no `client_secret` in client) acceptable for production builds?
- [ ] Multi-link UI: show all Linear identifiers on kanban card, or primary + “+N”?
- [ ] When creating Workspace from Linear issue, default branch/name rules? (start from GitHub parity)
- [ ] Exact v1 filter set beyond team / project / Active|Backlog|All?
- [ ] When both Linear description and linked GitHub body exist, which feeds requirement import first? (default: same priority rules as pure GitHub if GH link attached; else Linear description)
- [ ] i18n: en + zh for all Linear Task + Settings strings?
- [ ] Secret storage: plain local DB vs keychain — reuse any existing Atmos secret pattern?
- [ ] Should Settings search index include Linear rate-limit terms (like `integrations.githubApiRateLimits`)?

## References

### Code (Atmos)

- Workspace GitHub columns: `crates/infra/src/db/entities/workspace.rs`
- Task GitHub panel / filters: `apps/web/src/features/task/components/TaskGithubPanel.tsx`, `TaskGithubFilterMenu.tsx`
- Link finder: `apps/web/src/features/task/lib/find-linked-workspace.ts`
- GitHub engine: `crates/core-engine/src/github/`
- Settings Integrations + GitHub rate bars: `apps/web/src/features/settings/components/IntegrationsSettingsSection.tsx`
- GitHub rate-limit wire types: `packages/api-types/src/ws/dto/github.ts` (`GithubRateLimitPayload`), action `github_rate_limit`
- Workspace TODO/requirement import: `crates/core-service/src/service/workspace_todos.rs`, `workspace.rs`

### Specs

- [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md)
- [APP-017 Atmos Automations](../APP-017_atmos-automations/PRD.md)
- [APP-019 GitHub automation triggers](../APP-019_github-automation-triggers/BRAINSTORM.md)

### External

- GraphQL: https://linear.app/developers/graphql
- OAuth 2.0 + PKCE: https://linear.app/developers/oauth-2-0-authentication
- API keys: https://linear.app/docs/api-and-webhooks
- Rate limiting: https://linear.app/developers/rate-limiting
- Attachments: https://linear.app/developers/attachments
- Concepts: https://linear.app/docs/conceptual-model

### Design reference

- User screenshot: Linear Issues list (`Land_atmos` / All issues) — priority, `LAN-*`, status, title, labels, project, GitHub `#N`, assignee, dates.

## Ready to promote

- **Promote to PRD**:
  - Dual auth (API key + OAuth), global connection, local credential storage
  - OAuth on **both** desktop and web (redirect follows auth surface)
  - Read-only Linear; create / multi-link Atmos Workspace
  - Import body/TODOs **parity with GitHub**
  - Optional GitHub metadata when Linear already links GH
  - No webhooks; no detail mirror; open-in-Linear
  - Filters only for Team/Project; rich Linear-aligned list + filters
  - Association table; N links; **snapshots kept after disconnect**
  - Settings → Integrations → Linear + **API request/complexity quota UI** (GitHub-like)
  - Out of scope: Linear write, automations, team binding, cascade-delete on disconnect

- **Promote to TECH**:
  - PKCE OAuth: multi redirect URI (loopback + web), token refresh, revoke on disconnect
  - Unified credential store for key + oauth
  - GraphQL list query + filter mapping; capture rate-limit headers
  - `linear_rate_limit` (or equivalent) WS action mirroring `github_rate_limit`
  - Association schema + WS actions; no FK cascade on credential delete
  - List component field mapping from Linear → UI
  - Reuse workspace create import path used for GitHub issues
  - Settings card wiring + i18n keys

## Session notes (raw product input)

1. Webhooks not needed — user filter/pull like GitHub.
2. Dual auth: key + OAuth; explain OAuth in detail; can secrets stay local?
3. Link depth like GitHub but no detail/timeline; jump out via URL.
4. No Team entity association — only linked issues.
5. Team/Project filter only, no binding.
6. New association table; redundant id + name for display.
7. Linear↔GitHub links: show + reuse GitHub capabilities.
8. **Both** key and OAuth; detail OAuth; local secret storage OK.
9. **No Linear write** — read + create Atmos Workspace only (keep simple).
10. **Multiple** Linear issues per workspace.
11. GitHub-related from Linear is **optional** (can sync/show).
12. **Global** one connection; user filters team/project → list; Linear filters more complex.
13. List fields/UI **align with Linear** (screenshot).
14. OAuth: **both** desktop and web — follow where user authenticates.
15. Create workspace: **may** carry GitHub link when present.
16. Body/TODO import: **align with GitHub**.
17. Disconnect: **do not clear** associations; first link snapshot is SoT (no webhook).
18. Settings Integrations: add Linear; show **API quota usage** like GitHub rate limits.

## Hub identity alignment (merged with APP-056)

APP-056 (Hub) is the **account root**. Linear auth is **not** a second identity system.

| Mode | When | Credential store |
|------|------|------------------|
| **Hub-bound only** | User signed into Atmos Hub (GitHub/Google) | Hub `user_integrations` keyed by `user_id` |
| ~~Local fallback~~ | **Removed** | No dual store — guide user to sign in |

**Optimal single design (no dual path):**

1. Settings → Integrations: Hub sign-in first; Linear Connect only when signed in.
2. Connect Linear OAuth/API key **only** upserts Hub `user_integrations` for that `user_id`.
3. Workspace ↔ Linear issue associations remain **local** (`workspace_external_issue`) — worktree display snapshots only.
4. Linear OAuth ≠ Hub OAuth (separate clients). Hub login is GitHub/Google via Better Auth.
5. Computers / Relay: same rule — Hub `user_id` + device credentials only (APP-056).

See [APP-056 TECH](../APP-056_usage-share-and-accounts/TECH.md) for Hub membership rules.
