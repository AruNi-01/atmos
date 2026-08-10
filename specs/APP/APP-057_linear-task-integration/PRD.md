# PRD · APP-057: Linear Task Integration

> Product Requirements · WHAT and WHY. Settled direction from [BRAINSTORM.md](./BRAINSTORM.md).

## Context

- **Problem**: Agentic builders track work in Linear Issues, but Atmos Task only surfaces Atmos workspaces and GitHub issues/PRs. Starting a Workspace from a Linear issue requires leaving Atmos and re-entering context manually.
- **Why now**: Task already has a multi-source pattern (Atmos / GitHub). Linear is a common issue tracker for the same persona; integration can reuse the GitHub-style **on-demand list + link + create Workspace** model without becoming a full Linear client.
- **Related specs**:
  - [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md) — on-demand fetch, workspace import from issue.
  - [APP-017 Automations](../APP-017_atmos-automations/PRD.md) — Linear may appear later as an automation surface; **this PRD is Task-only**.

## Goals

1. Connect Linear via **API key or OAuth** only after **Atmos Hub sign-in** (GitHub/Google). Credentials live under Hub `user_id` only — **no local dual store**.
2. Browse Linear Issues in Task with **Linear-aligned** list density and **rich filters** (team/project and more).
3. **Create Atmos Workspace** from an issue and **multi-link** issues with denormalized display snapshots.
4. Settings shows connection status and **API request + complexity quota** like GitHub rate bars.
5. Stay **read-only** on Linear; no webhooks; detail is open-in-Linear.

## Users & Scenarios

- **Primary**: Agentic Builder who manages work in Linear and implements in Atmos Workspaces.
- **Secondary**: Developer who already has a Linear API key and wants a paste-connect path.

### Key scenarios

1. User opens Settings → Integrations → Linear, pastes a **read** API key (or OAuth Connect on desktop/web), sees connected status and rate-limit bars after refresh.
2. User opens Task → Linear tab, filters by team + Active, sees rows with priority / `LAN-48` / status / title / labels / project / GitHub `#N` / assignee / dates.
3. User creates a Workspace from `LAN-48`; association row stores identifier + title; requirement/TODO import follows GitHub parity; if Linear has a GitHub attachment, GitHub metadata may be attached.
4. User links a second Linear issue to the same Workspace; both show on popover/kanban chips.
5. User disconnects Linear; Settings shows disconnected; **linked snapshots remain** for display.

## User Stories

- As a builder, I want to list my Linear issues inside Task so I can pick work without context-switching.
- As a builder, I want to create a Workspace from a Linear issue so branch/work starts with the right title context.
- As a builder, I want multiple Linear issues linked to one Workspace so large work can reference several tickets.
- As a user, I want Connect via OAuth or API key so I can choose convenience vs control.
- As a user, I want to see API quota usage so I understand throttling without leaving Atmos.

## Functional Requirements

### Must Have

- **M0 · Atmos sign-in required**: Linear Task and Linear Settings require Hub session. Show clear Sign in with GitHub / Google CTA when missing.

- **M1 · Hub-bound dual auth**: User must be signed into **Atmos Hub** (APP-056). Then connect Linear with personal **API key** and/or **OAuth** (`read` only). Credentials stored **only** on Hub under `user_id` (`user_integrations`). **No** `~/.atmos/linear_credentials.json` and **no** install-global fallback. Unsigned-in users are guided to sign in.

- **M2 · OAuth both shells**: OAuth works when the user authenticates from **desktop** (loopback and/or custom protocol) and from **web** (registered HTTPS/local redirect). Redirect URI is chosen for the current shell. PKCE preferred so `client_secret` need not ship in the client.

- **M3 · Disconnect keeps snapshots**: Disconnect removes Hub Linear integration (and best-effort revokes Linear OAuth token). **Does not** delete local workspace↔Linear association rows. First successful link snapshot remains display SoT until user re-links/edits.

- **M4 · Settings Integrations Linear**: Settings → Integrations includes a Linear card: status, connect OAuth, paste/replace API key, disconnect. When connected, show **request** and **complexity** quota bars (used/limit, remaining, reset), GitHub-like layout, manual Refresh. No polling solely for the meter.

- **M5 · Task Linear source (on-demand)**: Task Management exposes a Linear source/tab. Lists issues via on-demand GraphQL (user filter/fetch or refresh). **No webhooks**.

- **M6 · Linear-aligned list fields**: Each row shows at least: priority, identifier (`LAN-48`), status icon/type, title, labels, Linear project chip (if any), GitHub chips when present, assignee, created/updated dates. Primary depth action is **open Linear URL** (no in-app detail/timeline).

- **M7 · Filters (v1 cut)**: Must support **Active / Backlog / All** presets, **Team**, **Linear Project**, free-text search (title/identifier). Nice-to-have richer filters (assignee, labels, priority, sort) may ship in the same release if low-cost; TECH may phase beyond the must set.

- **M8 · Read-only Linear**: Atmos never creates/updates/comments/deletes Linear issues or changes Linear state. Only GraphQL reads (+ OAuth token endpoints for auth lifecycle).

- **M9 · Create Workspace from issue**: From a listed issue, user can create an Atmos Workspace. Prefill display name from identifier/title when sensible. Store association snapshot. Body/TODO import **aligns with GitHub issue → workspace** path (same optionality for auto-extract TODOs / requirement files).

- **M10 · Multi-link associations**: A Workspace may link **0..N** Linear issues via a **dedicated association table** (not only columns on `workspace`). Denormalized fields include at least external id, identifier, title, url for popover/kanban.

- **M11 · Optional GitHub metadata**: When Linear issue exposes a clear GitHub issue/PR URL (attachments/chips), list shows the chip; create-workspace **may** also set GitHub link metadata and reuse existing GitHub capabilities where repo matches.

- **M12 · Localization**: User-facing Linear Task + Settings strings in all web locales (en + zh minimum). English UI sentence case (no ALL CAPS labels).

### Nice to Have

- **N1 · Extra filters**: assignee, labels, priority, cycle, sort options beyond v1 must.
- **N2 · Explicit “Refresh link snapshot”** on a linked issue without full re-auth.
- **N3 · Multi-link chip density**: primary identifier + “+N” on kanban if space is tight.
- **N4 · Settings search index** for Linear rate-limit terms.

## Out of Scope

- Linear webhooks / realtime push.
- In-app Linear issue detail, comments, timeline, status transitions.
- Writing to Linear (create/update/comment).
- Binding Atmos Project/Groups to Linear Team/Project as org units.
- Automations triggers on Linear events (APP-017).
- Migrating existing GitHub `workspace.github_issue_*` columns into the new association table.
- Full Playwright E2E of live Linear OAuth consent in CI without credentials.

## Success Metrics

- Dogfood user connects Linear (key or OAuth) and creates a Workspace from an issue without leaving Atmos for list discovery.
- Disconnect does not remove kanban/popover Linear chips for previously linked issues.
- Settings quota bars update after Refresh when connected.
- No Linear mutation traffic from Atmos Task paths.

## Risks & Open Questions

- **Risk · OAuth app registration**: Requires Atmos-owned Linear OAuth app with multi redirect URIs. Mitigation: ship API key path fully; OAuth uses env-configured `client_id` + PKCE.
- **Risk · Rate limits**: On-demand list only; surface `RATELIMITED` clearly.
- **Risk · Snapshot staleness**: Accepted (D15); no silent delete.
- **Open · Import source priority**: If both Linear description and linked GitHub body exist, prefer GitHub body when GH metadata is attached (GitHub parity); else Linear description.

## Milestones

- **Phase 1**: Specs + credentials + association + Linear read client + rate-limit probe + unit tests.
- **Phase 2**: WS/service + create/link + GitHub import hooks.
- **Phase 3**: Task Linear UI + Settings card + i18n.
