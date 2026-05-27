# TEST · APP-020: Relay Stable Tenant Identity

> Test Plan · how we verify Relay Access Token rotation preserves tenant-owned resources safely. References PRD APP-020 and TECH APP-020.

## Test strategy

- **Migration/integration**: Seed a legacy D1 schema with tenants, Computers, register tokens, and client sessions; run the migration; verify stable tenant ids and row preservation.
- **Relay unit/integration**: Test tenant lookup, tenant creation, rotation success, collision handling, old-token rejection, and cleanup of short-lived rows.
- **Frontend integration**: Test Settings copy and local token write sequencing for rotate vs switch identity.
- **Manual-only**: Production D1 migration dry run should be manually verified against a copied database before applying to production.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S2, S3 |
| M3 | S4, S5, S6 |
| M4 | S4, S10 |
| M5 | S5 |
| M6 | S8 |
| M7 | S9 |
| M8 | S9 |
| M9 | S7 |
| M10 | S1, S11 |

## Scenarios

### S1 - Legacy migration preserves registered Computers

- **Level**: Migration integration
- **Given**: a legacy D1 database where `tenants.token_hash` is referenced by `computers.tenant_id`, `register_tokens.tenant_id`, and `client_sessions.tenant_id`.
- **When**: the APP-020 migration runs.
- **Then**: every tenant has a stable `tenant_id`, every existing Computer points to that stable id, and no Computer row is lost.
- **Signals**: row counts match before/after; `tenants.access_token_hash` equals the old token hash; `computers.tenant_id` no longer equals the old token hash.

### S2 - New tenant creation stores token as credential

- **Level**: Relay integration
- **Given**: a new user creates a tenant with a valid Access Token.
- **When**: Relay handles `POST /v1/tenants`.
- **Then**: Relay stores a generated stable `tenant_id` and a unique `access_token_hash`.
- **Signals**: `tenants.tenant_id` has the stable id format; `tenants.access_token_hash` matches the token hash; no raw token is stored.

### S3 - Existing control-plane endpoints resolve stable tenant id

- **Level**: Relay integration
- **Given**: a tenant with stable `tenant_id` and an Access Token credential.
- **When**: the user calls `GET /v1/computers` and `POST /v1/register_tokens` with Bearer Access Token.
- **Then**: Relay resolves the tenant by `access_token_hash` and reads/writes rows under the stable `tenant_id`.
- **Signals**: returned Computers match the tenant; new register token row stores stable `tenant_id`.

### S4 - Rotation preserves durable tenant-owned rows

- **Level**: Relay integration
- **Given**: a tenant with Computers and APP-019 GitHub installation/route rows.
- **When**: the user calls `POST /v1/tenants/rotate_token` with the current token and a valid new token.
- **Then**: the tenant keeps the same `tenant_id`, durable rows remain attached, and the new token authenticates the same tenant.
- **Signals**: `tenant_id` unchanged; Computers list under new token matches pre-rotation list; GitHub route rows keep the same `tenant_id`.

### S5 - Old token is rejected after rotation

- **Level**: Relay integration
- **Given**: token rotation succeeded.
- **When**: a client calls `GET /v1/computers` with the old token.
- **Then**: Relay rejects the request.
- **Signals**: HTTP `401` with `unauthorized`; no tenant row resolves by the old token hash.

### S6 - Rotation rejects token collision atomically

- **Level**: Relay integration
- **Given**: tenant A and tenant B already exist.
- **When**: tenant A tries to rotate to tenant B's Access Token.
- **Then**: Relay rejects the request and preserves tenant A's current token.
- **Signals**: HTTP `409 new_token_exists`; old token for tenant A still works; no short-lived rows are deleted.

### S7 - Rotation revokes short-lived sessions only

- **Level**: Relay integration
- **Given**: a tenant has unused register tokens, active client sessions, APP-019 setup sessions, registered Computers, and GitHub routes.
- **When**: token rotation succeeds.
- **Then**: short-lived rows are deleted or invalidated, while Computers and GitHub routes remain.
- **Signals**: `register_tokens`, `client_sessions`, and `github_setup_sessions` rows for the tenant are gone; `computers` and `github_event_routes` rows remain.

### S8 - Local token write is atomic from the user's perspective

- **Level**: Frontend / local API integration
- **Given**: Settings has a current local Access Token.
- **When**: rotation succeeds.
- **Then**: the new token is written locally after Relay success and the Computers list reloads under the new token.
- **Signals**: `~/.atmos/computer-client.json` contains the new token; old token is not written back; Computers list is unchanged.

### S9 - Direct token replacement is identity switch

- **Level**: Frontend / Relay integration
- **Given**: the user imports Token B without using rotation from Token A.
- **When**: the app reloads Relay state.
- **Then**: Atmos treats Token B as a different identity and does not transfer Token A rows.
- **Signals**: Computers/routes from Token A are not shown; copy labels the action as identity switch; Token B cannot mutate Token A's rows.

### S10 - Server outbound connection remains valid

- **Level**: Relay integration
- **Given**: a registered Computer has `server_id` and `server_secret`.
- **When**: the tenant Access Token rotates.
- **Then**: the server outbound WebSocket can reconnect with the same `server_secret`.
- **Signals**: `GET /ws/server?server_id=...` with Bearer `server_secret` is accepted before and after rotation; `computers.secret_hash` is unchanged.

### S11 - Migration refuses orphaned tenant references

- **Level**: Migration integration
- **Given**: a copied legacy database contains a tenant-scoped row whose `tenant_id` has no matching `tenants.token_hash`.
- **When**: the migration validation runs.
- **Then**: migration fails before dropping legacy tables.
- **Signals**: migration validation reports orphan count; old tables remain restorable; no partial schema is promoted.

### S12 - Secrets are not logged

- **Level**: Relay unit / log inspection
- **Given**: tenant creation, rotation, and failed rotation requests.
- **When**: logs are captured.
- **Then**: no raw Access Token, token hash, register token, client token, or server secret appears.
- **Signals**: log assertions redact credential fields; error payloads contain only stable error codes.

## Performance & load budgets

- Tenant lookup by Access Token hash remains one indexed query.
- Rotation should complete within 2 seconds at p95 for tenants with 100 Computers and 1,000 GitHub routes.
- Migration dry run must report row counts for each tenant-scoped table before production apply.

## Regression checklist

- [ ] Existing `POST /v1/tenants` behavior still rejects duplicate tokens.
- [ ] Existing Computer registration flow still works after stable tenant migration.
- [ ] Existing client session creation still routes to the correct `server_id`.
- [ ] Rotating a token does not revoke registered Computers.
- [ ] Old Access Token fails after rotation.
- [ ] New Access Token can issue register tokens and client sessions.
- [ ] Direct token switch does not transfer old tenant rows.
- [ ] APP-019 GitHub routes keep their tenant after rotation.
- [ ] No credentials appear in logs or error payloads.

## Acceptance criteria

- [ ] All Must Have PRD items M1-M10 have at least one implemented and passing scenario.
- [ ] Legacy D1 migration is tested against seeded APP-016 rows.
- [ ] Rotation endpoint is atomic: collision/failure leaves the old token and rows intact.
- [ ] Settings distinguishes "rotate token" from "switch identity."
- [ ] APP-016 control-plane endpoints continue to pass existing tests.
- [ ] APP-019 TECH references stable tenant identity instead of cross-token row copying.

## Manual verification steps

1. Copy a staging D1 database with at least one registered Computer.
2. Apply APP-020 migrations to the copy.
3. Confirm old Access Token lists the same Computer before rotation.
4. Rotate to a new Access Token.
5. Confirm new Access Token lists the same Computer and old Access Token is rejected.
6. If APP-019 staging tables exist, confirm GitHub route rows still have the same stable `tenant_id`.

## Non-coverage

- Lost-token recovery is not covered because v1 intentionally requires the current token.
- Hosted login/JWT migration is not covered.
- Per-Computer `server_secret` rotation is not covered.
