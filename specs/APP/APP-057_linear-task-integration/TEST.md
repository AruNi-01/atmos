# TEST · APP-057: Linear Task Integration

> Test Plan · verify PRD APP-057 and TECH APP-057.

## Test strategy

- **Rust unit (core-engine)**: rate-limit header parse, filter builder, GitHub attachment URL extract, PKCE challenge, redirect selection — pure functions, no network.
- **Rust unit/integration (infra/core-service)**: association insert/list unique constraint; credential store save/load/clear; disconnect does **not** delete associations; link multi-issues.
- **Rust service/API**: connect API key path with injectable HTTP fixture; issue list mapping; create/link flow does not call Linear mutations.
- **Bun/TS**: wire types compile; optional pure helpers if any.
- **E2E Playwright**: not required for v1 OAuth consent against live Linear.
- **Manual / agent-browser**: Settings Linear card + Task tab smoke when local runtime available.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 dual auth / local creds | S1, S2, S3 |
| M2 OAuth shells | S4 |
| M3 disconnect keeps snapshots | S5 |
| M4 Settings quota | S6, S14 |
| M5 on-demand list | S7 |
| M6 list fields | S8 |
| M7 filters | S9 |
| M8 read-only | S10 |
| M9 create workspace + GitHub import parity hooks | S11 |
| M10 multi-link | S12 |
| M11 GitHub chips/metadata | S13 |
| M12 i18n | S15 (static/locale keys) |

## Execution map

| Scenario | Level | Expected tool | Target | Signals | Status |
|----------|-------|---------------|--------|---------|--------|
| S1 | Rust unit | `cargo test` | credential store save/load | api_key round-trip | planned |
| S2 | Rust unit | `cargo test` | connect key with mock viewer | status connected | planned |
| S3 | Rust unit | `cargo test` | oauth token record shape | oauth fields present | planned |
| S4 | Rust unit | `cargo test` | select_oauth_redirect desktop/web | distinct URIs | planned |
| S5 | Rust unit | `cargo test` | clear creds after insert links | links remain | planned |
| S6 | Rust unit | `cargo test` | parse_rate_limit_headers | used/remaining/reset | planned |
| S7 | Rust unit | `cargo test` | list issues parse fixture JSON | identifiers | planned |
| S8 | Rust unit | `cargo test` | issue DTO field presence from fixture | priority, labels… | planned |
| S9 | Rust unit | `cargo test` | build_issues_filter Active/team | filter JSON | planned |
| S10 | Rust unit | `cargo test` | mutation guard / read-only client API surface | no create/update methods | planned |
| S11 | Rust unit | `cargo test` | linear description → issue-like payload | body mapped | planned |
| S12 | Rust unit | `cargo test` | two links same workspace | count 2 | planned |
| S13 | Rust unit | `cargo test` | extract github urls | # number/owner | planned |
| S14 | Static | script | Settings Linear strings/components exist | path match | planned |
| S15 | Static | grep | en/zh locale keys for linear | keys present | planned |

## Scenarios

### S1 — Credential store round-trip
**Given** empty store  
**When** save API key credentials  
**Then** load returns same method and key  
**Signals**: unit assert

### S2 — Connect API key (mock HTTP)
**Given** mock GraphQL returns viewer  
**When** connect_api_key  
**Then** status.connected true  

### S3 — OAuth credential shape
**Given** finish oauth stores tokens  
**When** load  
**Then** auth_method oauth + access_token set  

### S4 — Redirect by shell
**Given** shell desktop vs web  
**When** select_oauth_redirect  
**Then** loopback vs https/origin path differ  

### S5 — Disconnect keeps associations
**Given** workspace has 2 linear links and credentials  
**When** disconnect  
**Then** credentials empty; links still listed  

### S6 — Rate limit headers
**Given** response headers with Requests and Complexity limits  
**When** parse  
**Then** buckets match used = limit - remaining  

### S7 — List issues from fixture
**Given** GraphQL issues JSON fixture  
**When** parse list  
**Then** identifiers and titles extracted  

### S8 — List field mapping
**Given** rich issue node fixture  
**When** map to DTO  
**Then** priority, state, labels, project, assignee, dates, github chips present  

### S9 — Filters
**Given** preset Active + team id  
**When** build filter  
**Then** state type + team id constraints present  

### S10 — Read-only surface
**Given** LinearClient public API  
**When** inspected  
**Then** no issueCreate/issueUpdate methods  

### S11 — Import parity hook
**Given** Linear issue with description  
**When** to_github_like_issue_payload  
**Then** title/body/url populated for workspace import  

### S12 — Multi-link
**Given** workspace W  
**When** link A and B  
**Then** list returns 2 unique external ids  

### S13 — GitHub attachment extract
**Given** `https://github.com/org/repo/issues/12`  
**When** extract  
**Then** owner/repo/number  

### S14 — Settings UI surface
**Given** codebase  
**When** static check  
**Then** Integrations Linear section and rate bar usage  

### S15 — i18n keys
**Given** en.json / zh.json  
**When** grep linear integration keys  
**Then** both locales have entries  

## Acceptance criteria

- All planned Rust unit scenarios for engine/service pass in CI-local `cargo test`.
- Disconnect does not delete association rows (S5).
- Rate-limit parse matches Linear header semantics (S6).
- Specs PRD/TECH/TEST non-placeholder (gating).

## Non-coverage

- Live Linear OAuth browser consent in CI.
- Full Playwright Task UI layout parity with Linear screenshots.
- Live rate-limit against production Linear without user key.

## Coverage Status

**Date**: 2026-08-10

### Commands run

```bash
cargo test -p core-engine linear
cargo test -p core-service linear
cargo check -p api
bun packages/api-types/scripts/extract-ws-actions.ts
```

### Results

| Scenario | Status | Evidence |
|----------|--------|----------|
| S1 credential store | pass | `linear_credentials::tests::credential_store_round_trip_api_key` |
| S4 oauth redirect + start | pass | `select_oauth_redirect_by_shell`, `oauth_start_stores_pending_and_selects_redirect` |
| S5 disconnect keeps links | pass | `multi_link_and_disconnect_keeps_rows` |
| S6 rate limit headers | pass | `parse_rate_limit_headers_computes_used` |
| S7–S8 list/field mapping | pass | `parse_issues_connection_fixture` |
| S9 filters | pass | `build_issues_filter_*` |
| S10 read-only surface | pass | `linear_client_has_no_mutation_api_surface` |
| S11 import payload | pass | `import_payload_parity_fields` |
| S12 multi-link | pass | `multi_link_and_disconnect_keeps_rows` |
| S13 github refs | pass | `extract_github_refs` |
| S14 Settings UI | pass | static: `LinearIntegrationCard` + rate bars in IntegrationsSettingsSection |
| S15 i18n | pass | en.json + zh.json linear keys present |
| S2 live API key connect | not_run | needs live Linear API key in environment |
| S3 full oauth finish | not_run | needs registered OAuth app + browser consent |

### Skeptic-gap fixes (follow-up)

| Gap | Fix | Evidence |
|-----|-----|----------|
| M9 Create Workspace | `TaskLinearPanel.createWorkspaceFromIssue` → `addWorkspace` + `wsLinearApi.linkIssue` | `TaskLinearPanel.tsx` Create button |
| M10 multi-link UI | `WorkspaceDto.linear_links` + kanban/popover chips | `WorkspaceKanbanCard` / `WorkspaceContent` |
| M6 assignee | `AssigneeAvatar` on each row | `TaskLinearPanel.tsx` |
| soft-unlink unique | `find_link_any` + revive `is_deleted=false` | `relink_after_unlink_revives_soft_deleted_row` |
| OAuth finish | `/integrations/linear/callback` → `oauthFinish` | `apps/web/src/app/integrations/linear/callback/page.tsx` |

### Gaps / honesty

- Live Linear GraphQL list / live OAuth consent against production still not CI-gated (needs user API key / OAuth app + browser).
- OAuth app redirect URIs must include the running origin’s `/integrations/linear/callback` (and optional desktop loopback).
