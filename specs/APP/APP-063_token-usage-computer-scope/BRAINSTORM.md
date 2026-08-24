# Brainstorm · APP-063: Token Usage Computer scope

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Token Usage today is **per Atmos Computer**: `token_usage_overview_get` scans agent/CLI usage files on the machine that hosts that Computer’s Atmos Server (`crates/token-usage` + tokscale). The dashboard (`TokenUsagePage`) always reads the **currently connected** Computer over the main `/ws`. Share (APP-061) publishes that same local overview.

Users who own several Computers (laptop, desktop, VPS) cannot see a combined total, and cannot inspect another machine’s usage without switching the whole workbench connection. Relay already lists Computers for the signed-in Hub account (`GET /v1/computers`), and a client can open a session to any of them.

A second, quieter problem: the same **physical machine** can appear more than once. Registration keys Computers by `app_device_id` (HMAC of host machine id, APP-016 / runtime-manager), but one device may have up to **10** `server_id` rows (`COMPUTER_DEVICE_REGISTRATION_LIMIT`). The list API does **not** return `app_device_id`. Summing every `server_id` would count the same local scan twice.

**Trigger**: multi-machine users; Token Usage only reflects “this connection”.
**Who feels it**: signed-in users with more than one Atmos Computer.
**Current workaround**: switch Computer in the header, or mentally add PNG/share pages.
**Why hard**: live scan lives on each machine (not in Hub); Relay is connection fabric, not a usage store (APP-056 deferred continuous sync); uniqueness is `app_device_id`, not `server_id`.

## Goals (draft)

- **Primary**: On Token Usage, choose **All Computers** or one Computer, without forcing a workbench Computer switch.
- **Primary**: Selecting one Computer shows **that machine’s** scan, fetched over Relay when it is not the current `/ws`.
- **Primary**: **All Computers** shows a **sum of unique devices** — one scan per `app_device_id`.
- **Secondary**: Keep Token Usage usable **signed-out / single local Computer** (selector hidden or inert).
- **Non-goal (draft)**: Continuous Hub ingest of usage; changing APP-061 public URL shape; Quota Usage.

## Options

### Option A — Page-local Computer select + live Relay fan-out (stated direction)

Toolbar: select **to the left of Share**. Options: **All Computers**, then unique Computers for the Hub account (display name). Current Computer stays in the list.

- One Computer → open (or reuse) a Relay client session to that `server_id`, call existing `token_usage_overview_get`, render as today.
- Current Computer → keep using the existing main `/ws` (no extra session).
- All Computers → fan-out to **one representative session per `app_device_id`**, merge overviews in the client (tokens, cost, by_day / by_model / by_client, years).
- Dedup: group Relay rows by `app_device_id`; pick one representative (prefer online, then latest `last_seen_at`). If the local Computer is also in the list, do not add it a second time.

**Pros**: Matches the requested UI; no new usage store; local-first preserved; uniqueness is explicit.
**Cons**: Needs a **side** Relay `/ws` (or equivalent) so the workbench connection does not move; All Computers is only as complete as reachable machines; merge rules for overlapping days/models must be defined.
**Unknown**: Whether a short-lived side session is acceptable vs a REST read through the Relay gateway; cookie-consent banners on a remote Computer.

### Option B — Header Computer switch only; All Computers later

Do not add a Token Usage select. User already switches Computer in the header. Ship uniqueness cleanup in the Computer list first.

**Pros**: Smallest change; no second session.
**Cons**: Does not deliver All Computers; inspecting another machine **does** tear down the workbench session; user asked for an in-page select.

### Option C — Hub snapshot ingest (APP-056 Option D)

Each Computer periodically uploads redacted overview to Hub. Token Usage All Computers reads Hub. Offline machines still contribute last snapshot.

**Pros**: Offline-friendly totals; no fan-out of live sessions; public share could use the same rollup.
**Cons**: New cloud usage store; consent/privacy; Relay/Hub boundary; user asked to **fetch via Relay now**, not sync continuously.
**Unknown**: Merge across partial time windows; snapshot freshness.

### Option D — Sideways: unique-device Computer picker, usage still current-only

Expose `app_device_id` on `GET /v1/computers`, collapse Settings/header lists so the same machine is not listed twice. Token Usage stays on the connected Computer.

**Pros**: Fixes the uniqueness bug everywhere.
**Cons**: Does not solve cross-machine Token Usage. Can be **prerequisite work** for A, not a substitute.

## Key forks in the road

- **Fork 1 (PRD)**: Page-local usage scope vs switching the workbench Computer. Stated lean: **page-local**.
- **Fork 2 (PRD)**: Live Relay fetch vs Hub ingest. Stated lean: **live Relay**.
- **Fork 3 (PRD)**: Dedup key = **`app_device_id`** (physical machine) vs `server_id`. Stated lean: device id, so re-registers of the same box do not double-count. List API must return it (or a stable public alias).
- **Fork 4 (PRD)**: **All Computers** when some machines are offline — partial total + warnings vs hard fail vs Hub last-known. Lean: **partial + existing `partial_warnings`**, skip unreachable after a timeout.
- **Fork 5 (PRD)**: Default selection — **current Computer** (no behavior change) vs All Computers. Lean: current Computer.
- **Fork 6 (PRD)**: APP-061 Share/publish — currently selected scope vs always current Computer vs always All. Lean: **publish whatever the page is showing** (one snapshot still).
- **Fork 7 (TECH)**: Side main `/ws` via `createClientSession` vs gateway HTTP for overview. Atmos is WS-first; overview is already a WS action. Lean: **short-lived / pooled side WS**, no new REST unless TECH proves WS is too heavy.
- **Fork 8 (TECH)**: Representative per `app_device_id` when several `server_id`s exist — prefer `online`, else max `last_seen_at`, else newest `created_at`.
- **Fork 9 (PRD)**: Selector visibility — hide when signed out or only one unique device; show as soon as the account has **two unique devices** (or one remote + distinct local).

## Open questions

- [ ] Confirm Fork 1: Token Usage select must **not** change the header/workspace Computer. (decide in PRD)
- [ ] Confirm Fork 4: partial All Computers vs wait-for-all. (decide in PRD)
- [ ] Confirm Fork 5: default = current Computer. (decide in PRD)
- [ ] Confirm Fork 6: Share/publish follows the select. (decide in PRD)
- [ ] Remote cookie-consent: ignore on non-current Computers (scan files only) vs proxy consent to that Computer. (decide in PRD)
- [ ] Unregistered local Desktop: include in All Computers as its own device even if it is not on the Relay list. (decide in PRD)
- [ ] Copy: English **All computers** (sentence case); product noun **Computer** in labels. (decide in PRD)
- [ ] How to expose `app_device_id` on the Computer list without leaking a tracking handle to the wrong client. (decide in TECH)
- [ ] Merge function for two overviews (sum tokens/cost/messages; union days; max processing time; union years; concat warnings). Active-days is **union of dates**, not sum of per-machine active_days. (decide in TECH)
- [ ] Side-session lifecycle: one multiplexed client, per-Computer pool, or connect-fetch-disconnect. (decide in TECH)

## References

- Existing UI: `apps/web/src/app-shell/TokenUsagePage.tsx` (`toolbarEnd` = Share), `apps/web/src/features/token-usage/TokenUsageOverviewView.tsx`
- Scan: `crates/token-usage/`, `apps/api` `token_usage_overview_get`, `apps/web/src/api/ws/token-usage-api.ts`
- Computer list: `packages/relay` `GET /v1/computers` (no `app_device_id` today), `packages/relay-client` `ComputerRow`, `apps/web/src/features/connection/`
- Device id: `crates/runtime-manager/src/device_identity.rs`, Relay `COMPUTER_DEVICE_REGISTRATION_LIMIT = 10`, migrations `0008_computer_app_device_id.sql`
- Related specs: [APP-016](../APP-016_atmos-computer/PRD.md), [APP-056](../APP-056_usage-share-and-accounts/BRAINSTORM.md) (Option D deferred), [APP-061](../APP-061_token-usage-public-share/PRD.md)
- Transport: `packages/relay-client` `createClientSession` → main `/ws`; gateway `/api/system/*` is not the usage API today

## Ready to promote

- Promote to PRD: page-local select left of Share; All Computers + per-Computer; live Relay fetch; uniqueness by `app_device_id`; signed-out local-only; out of scope = Hub ingest, Quota Usage, workbench switch.
- Promote to TECH: expose `app_device_id` on list; representative picker; overview merge; side WS vs gateway; Query keys scoped by computer/device; i18n keys.
