# Brainstorm · APP-019: Relay Stable Tenant Identity

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-016 currently models a Relay tenant as `tenant_id = sha256(access_token)`. That worked for the first Atmos Computer control plane because possession of the Access Token was the only identity signal. APP-018 GitHub Automation Triggers adds long-lived GitHub installations and event routes under the same tenant, which makes direct token replacement risky: a new token becomes a different tenant, and a lost token cannot prove ownership.

Users normally still have the current token locally in `~/.atmos/computer-client.json`. That means Atmos can support a safe rotation flow: the old token authorizes the change, and the new token becomes the credential for the same logical tenant.

## Goals (draft)

- Make Relay tenant identity stable across Access Token rotation.
- Preserve registered Computers, server secrets, GitHub installations, routes, and delivery history when a user rotates their token.
- Keep the no-login model: possession of the current token remains the authority.
- Make direct token replacement an explicit identity switch, not an implicit migration.
- Avoid unsafe cross-token ownership transfer when the old token is unavailable.

## Options

### Option A - Patch by rewriting tenant foreign keys

Keep `tenant_id = sha256(access_token)`. Add `POST /v1/tenants/rotate_token` that authenticates with the old token and rewrites every table's `tenant_id` from the old hash to the new hash.

**Pros**: Smallest schema change; fastest to implement.
**Cons**: Every new tenant-scoped table must be added to the rotation transaction; easy to miss future GitHub/event tables; tenant identity remains semantically tied to a credential.
**Unknown**: Whether D1 transaction/batch behavior is enough for large tenant rows without introducing partial rotation risk.

### Option B - Stable tenant id with Access Token credential

Introduce an opaque stable `tenant_id` generated once per tenant. Store `access_token_hash` as a unique credential on the tenant row. All foreign keys point at the stable `tenant_id`. Rotation updates only the credential hash and revokes short-lived sessions/tokens.

**Pros**: Correct identity model; future providers and route tables inherit stable ownership; rotation is small and less fragile; aligns with future login/JWT migration.
**Cons**: Requires a schema migration and code changes wherever `tenant_id` currently assumes token hash.
**Unknown**: Whether old D1 data needs a one-off migration script beyond plain SQL for easier rollback.

### Option C - Keep current model and document re-setup

Do not support token rotation. Treat any token replacement as a new identity and require users to re-register Computers and GitHub triggers.

**Pros**: No engineering work.
**Cons**: Bad fit once GitHub triggers exist; users who rotate for security lose long-lived routes; recovery story is weak despite the old token usually being locally available.
**Unknown**: Whether users will tolerate re-setup for all Computers and automations after a security rotation.

## Key forks in the road

- **Stable identity vs hashed-token identity**: choose stable identity for long-lived integrations; token hash becomes a credential.
- **Rotation vs transfer**: rotation requires the current token; transfer without the current token stays unsupported.
- **Session preservation vs revocation**: registered Computers remain valid, but short-lived register/client/setup sessions should be revoked on rotation.
- **GitHub routes in APP-018 vs foundation in APP-019**: APP-019 owns identity and rotation; APP-018 depends on it.

## Open questions

- [ ] Should the rotation endpoint return the stable `tenant_id` to clients, or keep it internal?
- [ ] Should the Settings UI offer "Rotate current token" and "Switch identity" as two separate actions?
- [x] Should token rotation keep active client sessions for a smoother UX, or revoke all short-lived sessions for stricter security? Settled: revoke short-lived register/client/setup sessions; registered Computers remain valid.

## References

- Existing code: `packages/relay/src/index.ts`, `packages/relay/migrations/0001_init.sql`, `apps/web/src/features/connection/`, `crates/runtime-manager/src/computer_client_settings.rs`
- Related specs: [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md), [APP-018 GitHub Automation Triggers](../APP-018_github-automation-triggers/TECH.md)
- Current docs: [packages/relay README](../../../packages/relay/README.md)

## Ready to promote

- Promote to PRD: Access Token rotation preserves the same logical Relay tenant.
- Promote to PRD: Directly replacing the local Access Token without rotation is an identity switch.
- Promote to TECH: Add stable `tenants.tenant_id` and move token hash into `tenants.access_token_hash`.
- Promote to TECH: Add `POST /v1/tenants/rotate_token`, authenticated by the current token.
- Promote to TEST: Cover migration, rotation success, collision rollback, old-token rejection, new-token access, and APP-018 route preservation.
