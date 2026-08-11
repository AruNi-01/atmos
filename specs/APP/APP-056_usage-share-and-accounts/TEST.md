# TEST · APP-056: Usage Share, Users & Devices

> Test Plan · how we verify GitHub Atmos Accounts and Token Usage share pages. References PRD APP-056 and TECH APP-056.

## Test strategy

- **Hub unit/integration**: Better Auth (GitHub + Google; password disabled — S27), session `/v1/me`, device mint/rotate/revoke + `relay_synced`, snapshot CRUD + recursive redaction (S15), public 404 + `Cache-Control: no-store` (S11), CORS (S29).
- **Relay unit/integration**: device credential auth; computers by `user_id`; no user Access Token tenant APIs; register_tokens issuer (S25); post-rotate/revoke 401 after projection (S23/S28).
- **Client unit**: snapshot redaction; device credential storage; non-logging (S30).
- **Web integration**: PNG share without login; publish gated on session; device enroll Settings; no Generate Access Token primary UX (S26). Playwright scenarios live under `e2e/` when added.
- **Landing**: public share page + 404 after revoke.
- **Regression**: local Token Usage signed-out; pure local Server without Hub still works.
- **Manual-only**: real GitHub + Google OAuth on staging; cookie domain across hub/app.
- **Exploratory**: agent-browser checks listed below (status `not_run` until setup).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S14 |
| M2 | S2, S3, S4, S19 |
| M3 | S5, S6 |
| M4 | S5, S12 |
| M5 | S5, S7, S8 |
| M6 | S7, S8, S9 |
| M7 | S10, S11 |
| M8 | S6, S15 |
| M9 | S6, S15 |
| M10 | S16 |
| M11 | S1 |
| M12 | S3, S4, S27 |
| M13 | S18, S20, S21 |
| M14 | S22, S23, S28 |
| M15 | S21, S24 |
| M16 | S25, S26 |

Nice-to-have / cross-cutting (not PRD M-ids): public profile S13; OG S17; CORS S29; credential non-logging S30.

## Execution map

| ID | Level | Expected tool | Target / command | Fixtures | Status |
|----|-------|---------------|------------------|----------|--------|
| S1 | Web unit / manual | bun test | Token Usage overview signed-out (no hub session) | local api mock | pending |
| S2 | Hub integration | bun test | Better Auth GitHub callback mock → `user` + `account` | D1 + fake provider | pending |
| S3 | Hub integration | bun test | `GET /v1/me` with session cookie | D1 session | pending |
| S4 | Hub integration | bun test | Better Auth / custom logout → `/v1/me` 401 | D1 session | pending |
| S5 | Hub integration | bun test | `POST /v1/usage/shares` | session + snapshot | pending |
| S6 | Hub/client unit | bun test | `packages/hub` `redactSnapshot` + client builder | overview fixture | pending |
| S7 | Hub integration | bun test | `GET /v1/public/shares/:id` unlisted | share row | pending |
| S8 | Hub integration | bun test | public profile lists only public | shares + profile | pending |
| S9 | Landing | Playwright `e2e/` | `/s/:id` render | mock hub | pending |
| S10 | Hub integration | bun test | `PATCH /v1/usage/shares/:id` | share row | pending |
| S11 | Hub integration | bun test | `DELETE` revoke → public 404; no cache headers that stale | share row | pending |
| S12 | Web integration | bun test | copy share URL UI | mock hub | pending |
| S13 | Hub + landing | bun test / Playwright | handle + `/u/:handle` | account | pending |
| S14 | API regression | cargo | `cargo test -p token-usage` | none | pending |
| S15 | Hub unit | bun test | recursive denylist / cost strip / size reject | malicious JSON | pending |
| S16 | Static | grep | no usage-share product routes in `packages/relay/src` | tree | pending |
| S17 | Hub integration | bun test | OG PUT ownership + PNG magic + public `og_image_url` | R2 mock | pending |
| S18 | Hub integration | bun test | `GET /v1/devices` after enroll | session | pending |
| S19 | Hub integration | bun test | Google OAuth mock → linked `account` | D1 | pending |
| S20 | Hub integration | bun test | `POST /v1/devices` credential once | session | pending |
| S21 | Relay integration | bun test | `GET /v1/computers` Bearer device_credential | projected device | pending |
| S22 | Hub+Relay | bun test | rotate preserves computers | devices+computers | pending |
| S23 | Hub+Relay | bun test | old credential 401 after projected rotate | devices | pending |
| S24 | Relay | bun test | two devices same `user_id` see computers | devices | pending |
| S25 | Relay | bun test | `POST /v1/register_tokens` with device Bearer | device | pending |
| S26 | Web UI | review / Playwright | no generate-Access-Token primary CTA | UI | pending |
| S27 | Hub unit | bun test | password provider disabled / social only | better-auth config | pending |
| S28 | Hub+Relay | bun test | device revoke projects; Relay 401 | devices | pending |
| S29 | Hub | bun test | CORS credentials + origin allowlist | OPTIONS/GET | pending |
| S30 | Static/unit | grep + unit | device credential never logged in hub/relay paths | code | pending |

## Scenarios

### S1 - Local Token Usage works signed out

- **Level**: Web / product regression
- **Given**: no Atmos Cloud session cookie.
- **When**: user opens Token Usage and refreshes overview.
- **Then**: charts and stats load from local API; PNG share still available.
- **Signals**: no redirect to GitHub; overview request succeeds; Publish CTA may invite login but does not block local view.

### S2 - GitHub OAuth creates account (Better Auth)

- **Level**: Hub integration
- **Given**: mocked GitHub exchange returns provider subject `42`, login `aruni`.
- **When**: Better Auth GitHub callback completes with valid state.
- **Then**: Better Auth `user` row exists; provider **`account`** row upserted (`providerId=github`, `accountId=42`); session created; redirect hits allowlisted `return_to` / trusted origin.
- **Signals**: `account.accountId=42`; profile `handle` default derived from login; `Set-Cookie` present; invalid `return_to` rejected.

### S3 - Session resolves `/v1/me`

- **Level**: Cloud integration
- **Given**: valid session cookie.
- **When**: `GET /v1/me`.
- **Then**: account profile returned.
- **Signals**: 200 with `user_id`, `handle`; missing/expired cookie → 401.

### S4 - Logout

- **Level**: Cloud integration
- **Given**: active session.
- **When**: `POST /v1/auth/logout`.
- **Then**: session row deleted; subsequent `/v1/me` is 401.
- **Signals**: cookie cleared; old raw token hash no longer matches a row.

### S5 - Publish creates unlisted share by default

- **Level**: Cloud integration
- **Given**: signed-in account and valid redacted snapshot.
- **When**: `POST /v1/usage/shares` without visibility (or visibility unlisted).
- **Then**: share stored with `visibility=unlisted`, `revoked_at` null, stable `share_id`.
- **Signals**: response includes `https://atmos.land/s/{share_id}`; D1 row exists.

### S6 - Redaction strips cost and sensitive fields

- **Level**: Client unit (+ server reject)
- **Given**: overview with costs and a malicious extra field `prompt`.
- **When**: builder runs with `includeCost: false`; server validates.
- **Then**: snapshot has no cost fields; server rejects payloads that still contain denylisted keys.
- **Signals**: unit asserts absence of `total_cost_usd`; server returns `400 invalid_snapshot`.

### S7 - Public read of unlisted share by id

- **Level**: Cloud integration
- **Given**: unlisted non-revoked share.
- **When**: anonymous `GET /v1/public/shares/:share_id`.
- **Then**: snapshot returned with owner public profile fields.
- **Signals**: 200; no session required; response includes `provenance`.

### S8 - Unlisted share does not appear on public profile listing

- **Level**: Cloud integration
- **Given**: account has unlisted share and public share; profile public.
- **When**: `GET /v1/public/u/:handle`.
- **Then**: only public primary/listing data is exposed; unlisted ids not enumerated.
- **Signals**: unlisted `share_id` absent from profile payload.

### S9 - Landing page renders share

- **Level**: Landing / agent-browser
- **Given**: public API returns a snapshot.
- **When**: visitor opens `/s/{share_id}`.
- **Then**: title/summary visible; no app shell login wall.
- **Signals**: text for total tokens visible; console free of uncaught errors.

### S10 - Owner updates snapshot in place

- **Level**: Cloud integration
- **Given**: existing share owned by user A.
- **When**: A PATCHes new snapshot.
- **Then**: same `share_id`; `updated_at` increases; public GET shows new totals.
- **Signals**: row count unchanged; `updated_at > published_at` possible.

### S11 - Unpublish hides public content

- **Level**: Cloud integration
- **Given**: published share.
- **When**: owner DELETE/revoke.
- **Then**: public GET returns 404/410; owner list shows revoked or omits per API design.
- **Signals**: `revoked_at` set; anonymous read fails.

### S12 - UI copy share URL

- **Level**: Web integration
- **Given**: publish succeeded.
- **When**: user clicks copy link.
- **Then**: clipboard or visible field contains `atmos.land/s/...`.
- **Signals**: success toast; URL matches API response.

### S13 - Handle based profile

- **Level**: Cloud + landing
- **Given**: `profile_public=1` and primary public share.
- **When**: visitor opens `/u/{handle}`.
- **Then**: profile renders; private profile → 404.
- **Signals**: handle match case-insensitive as designed.

### S14 - token-usage crate regression

- **Level**: Rust unit
- **Given**: existing tests.
- **When**: `cargo test -p token-usage`.
- **Then**: all pass; overview model unchanged for local path.
- **Signals**: green test run.

### S15 - Server rejects oversized or illegal snapshot

- **Level**: Cloud unit
- **Given**: body > 256 KiB or contains `messages` array.
- **When**: POST share.
- **Then**: 400; no row written.
- **Signals**: error code `invalid_snapshot` or `payload_too_large`.

### S16 - Relay surface stays free of usage share product routes; Hub is the only share/auth host

- **Level**: Static / review
- **Given**: monorepo after implementation.
- **When**: search `packages/relay` for usage share account APIs.
- **Then**: no `/v1/usage/shares` product implementation in relay; auth/share live under `packages/hub` and `hub.atmos.land`.
- **Signals**: `rg "usage/shares" packages/relay` only docs cross-links; `packages/hub` exists with auth + usage share routes; no package named `packages/cloud` for this feature.

### S17 - OG image metadata

- **Level**: Integration
- **Given**: owner uploaded OG PNG.
- **When**: public GET + landing metadata.
- **Then**: `og_image_url` non-null; landing meta includes image.
- **Signals**: URL fetch returns image/png in staging.

### S18 - Device list returns enrolled devices

- **Level**: Hub integration
- **Given**: signed-in user has enrolled via `POST /v1/devices`.
- **When**: `GET /v1/devices`.
- **Then**: device appears with `device_id` / label; raw credential is not returned.
- **Signals**: response has no `device_credential` field; `revoked_at` null.


### S19 - Google OAuth creates/links account

- **Level**: Hub integration
- **Given**: mocked Google token exchange returns subject `g-1`, email `a@gmail.com`.
- **When**: Better Auth Google callback completes.
- **Then**: user exists; provider account linked; session established.
- **Signals**: `/v1/me` shows google in providers; GitHub-only fields optional null.

### S20 - Device mint returns credential once

- **Level**: Hub integration
- **Given**: valid Hub session.
- **When**: `POST /v1/devices` with label.
- **Then**: response includes `device_credential` and `device_id`; subsequent list omits credential; Hub stores only hash.
- **Signals**: DB has `credential_hash`; plaintext not in DB.

### S21 - Relay accepts device credential under account

- **Level**: Relay integration
- **Given**: Hub projected device to Relay; computer registered to `user_id`.
- **When**: `GET /v1/computers` with Bearer device_credential.
- **Then**: computer list returns that user’s computers.
- **Signals**: 200; wrong credential 401.

### S22 - Rotate via Hub session preserves computers

- **Level**: Hub + Relay
- **Given**: account has computers; device A enrolled.
- **When**: session calls rotate on device A.
- **Then**: new credential works; computers still listed; `user_id` unchanged.
- **Signals**: computer row count unchanged; `server_secret` hash unchanged.

### S23 - Old device credential dies after rotate

- **Level**: Hub + Relay
- **Given**: rotate succeeded.
- **When**: old credential calls Relay.
- **Then**: 401.
- **Signals**: no tenant/device resolve on old hash.

### S24 - Two devices same user share Computers

- **Level**: Relay
- **Given**: device A and B for same `user_id`; computer registered via A.
- **When**: B lists computers.
- **Then**: same computer visible.
- **Signals**: both Bearers authorize same `user_id` rows.

### S25 - One-time register token for VPS (Relay issuer)

- **Level**: Relay
- **Given**: Hub-projected device credential for a `user_id`.
- **When**: `POST /v1/register_tokens` with Bearer device credential; machine redeems register token.
- **Then**: computer row owned by that `user_id`; token single-use / expiry enforced.
- **Signals**: second consume rejected; computer `user_id` matches device owner.

### S26 - No user-generated Access Token primary UX

- **Level**: Product / UI
- **Given**: Settings connection UI after this ships.
- **When**: user manages remote Computer access.
- **Then**: primary path is Sign in + Trust device / Add Computer; no “generate access token as identity” primary CTA.
- **Signals**: copy review + optional Playwright under `e2e/`.

### S27 - Password auth disabled

- **Level**: Hub unit
- **Given**: Better Auth config for Hub.
- **When**: inspect providers / attempt email-password sign-in path.
- **Then**: only GitHub + Google social; no password product.
- **Signals**: config assertion or 404/disabled on password routes.

### S28 - Device revoke projects to Relay

- **Level**: Hub + Relay
- **Given**: enrolled device projected to Relay.
- **When**: `POST /v1/devices/:id/revoke` then old Bearer hits Relay.
- **Then**: after projection, Relay returns 401.
- **Signals**: Hub `revoked_at` set; Relay upsert `revoked: true` or equivalent.

### S29 - CORS allowlist for Hub session

- **Level**: Hub
- **Given**: `ALLOWED_ORIGINS` includes app origin.
- **When**: browser-like `Origin` on credentialed request.
- **Then**: allowed origin gets ACAO + credentials; disallowed origin rejected.
- **Signals**: OPTIONS preflight headers.

### S30 - Device credentials not logged

- **Level**: Static / unit
- **Given**: mint/rotate handlers and Relay auth.
- **When**: review logs and redaction paths.
- **Then**: plaintext device credential never written to structured logs.
- **Signals**: grep for log fields; unit if logger mock exists.

## Exploratory agent-browser checks

**Setup:** Agent Browser skill / `agent-browser skills get core --full` not executed in this authoring pass → **overall status: `not_run`**.

| # | Check | Status |
|---|--------|--------|
| 1 | Token Usage → Share → Publish: copy and empty states clear (en/zh if applicable) | not_run |
| 2 | Public `/s/...` at 390px width: no horizontal overflow; stats readable | not_run |
| 3 | After unpublish, hard refresh shows 404 (no stale cache) | not_run |
| 4 | Signed-out publish attempt never exposes other users’ data | not_run |

## Regression checklist

- [ ] Local Token Usage refresh/signed-out path
- [ ] Existing PNG capture/share still works
- [ ] Relay computer list / GitHub setup unaffected
- [ ] `cargo test -p token-usage`
- [ ] Cloud deploy dry-run / wrangler tests
- [ ] Landing build typecheck for new routes

## Acceptance criteria

1. A user can publish a redacted usage snapshot after GitHub login and open it while logged out.
2. Local Token Usage never requires hub login.
3. Revoked shares are not publicly readable.
4. Snapshots cannot retain denylisted sensitive keys under validation.
5. Usage share product is not implemented inside `packages/relay`.
6. Cost omitted unless opted in.
7. PRD Must Haves **M1–M16** each have at least one scenario in the coverage map with a planned automated or explicit manual check (device credentials / Relay ownership covered by S18–S26, S28).

## Manual verification steps

1. Staging Hub + GitHub + Google OAuth clients + Relay internal sync secret.
2. Sign in GitHub; enroll device; register a Computer; list from same device.
3. Sign in Google (fresh account); enroll; publish share.
4. Rotate device while logged in; old credential fails; computers remain.
5. Second device enroll; both see same computers.
6. Publish/unpublish share; private window checks.
7. Pure local Server without login still works.

## Non-coverage

- Real GitHub outage behavior beyond error toast.
- Full Phase 2 Computer ownership migration and lost-token recovery product.
- Continuous multi-device rollup accuracy.
- Abuse/spam ML detection.
- Legal export of all account data (GDPR package) beyond delete share + logout.

## Coverage Status

> Fill after implementation / test runs.

| Date | What ran | Result | Gaps |
|------|----------|--------|------|
| — | — | not_started | Spec only |
