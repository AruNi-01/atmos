# REVIEW · APP-019: Relay Stable Tenant Identity

> Post-implementation review log for token identity, tenant integrity, route cleanup, retention, and verification follow-up. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-05-27  
**Review scope**: quality review fixes for stable tenant identity and APP-018 integration  
**Related code**: `packages/relay/migrations/0004_stable_tenant_identity.sql`, `packages/relay/src/index.ts`, `packages/relay/migrations/0005_github_automation_triggers.sql`, `apps/web/src/features/connection/lib/atmos-access-token.ts`, `apps/web/src/features/automations/`, `crates/core-service/src/service/automation/`

## Review Summary

APP-019 is the identity foundation for APP-018. The current implementation moves the Relay tenant model toward stable `tenant_id` rows, treats Access Tokens as credentials, and adds a rotation endpoint that preserves durable tenant-owned resources while revoking short-lived setup/session rows.

The remaining quality work is mostly about proving the edge cases: direct token replacement must stay an identity switch, stale GitHub routes must not be transferred across identities, tenant migration must fail before data loss when orphaned references exist, and retention cleanup must be explicit before production rollout.

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | relay/web | Token rotation and token switch need separate behavior | fixed |
| REV-002 | P1 | automations/relay | Route cleanup must preserve tenant ownership boundaries | fixed |
| REV-003 | P1 | migration/relay | Stable tenant migration must protect tenant integrity | fixed |
| REV-004 | P2 | relay/ops | Retention cleanup remains a production tradeoff | fixed |

## REV-001 · Token rotation and token switch need separate behavior

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | relay/web |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

The product distinction between "rotate the current Access Token" and "switch to a different Access Token" is security-critical. Rotation preserves the same stable tenant, while a direct switch must not transfer Computers, GitHub installations, or GitHub routes.

### Fix Progress

- Relay now looks up tenants by `access_token_hash` and returns a stable `tenant_id`.
- `POST /v1/tenants/rotate_token` updates the credential hash for the existing tenant.
- Rotation deletes short-lived register tokens, client sessions, and APP-018 setup sessions when the table exists.
- Durable rows such as Computers and GitHub route/install rows stay attached to the same stable tenant id.

### Remaining Tradeoff

There is still no lost-token recovery. That is intentional for v1: without the current token, the user can create a new identity but cannot transfer old tenant-owned rows.

### Verification Items

- Rotation success: new token lists the same Computers and old token receives `401`.
- Collision: rotating to an existing token returns conflict and leaves the old token usable.
- Direct switch: importing Token B does not show or mutate Token A's Computers or GitHub routes.
- Log inspection: no raw Access Tokens or token hashes appear in logs or error payloads.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current implementation separates rotation from direct switch at the Relay credential layer; UI copy and end-to-end verification remain required.

## REV-002 · Route cleanup must preserve tenant ownership boundaries

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | automations/relay |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

APP-018 route cleanup can fail after a direct token switch because the current token may belong to a different tenant than the stored route. Cleanup must not bypass tenant ownership, and the local automation must not remain active when the current identity cannot manage its route.

### Fix Progress

- Relay route updates and deletes are tenant-scoped.
- Existing routes owned by another tenant are treated as not found for the caller.
- Local GitHub-triggered automations normalize to `needs_setup` when the route is missing, stale, or no longer manageable by the current identity.
- Disable/delete and route replacement paths attempt Relay cleanup but keep local execution safe if cleanup is rejected by tenant ownership checks.

### Remaining Tradeoff

If a user directly switches away from Token A, Token B cannot clean up Token A's old Relay route. That is the correct ownership boundary, but it leaves cleanup to the old token holder, route disable flow before switching, or a future administrative maintenance path.

### Verification Items

- Token B cannot delete Token A's route.
- After failed cleanup caused by token switch, the local automation has `trigger_enabled = false` and `trigger_status = "needs_setup"`.
- Incoming webhook for a stale route receives local rejection rather than starting a run.
- Manual and scheduled automations continue working after GitHub route cleanup failure.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current implementation adds tenant-scoped route cleanup and local `needs_setup` fallback; cross-token cleanup behavior still needs targeted integration coverage.

## REV-003 · Stable tenant migration must protect tenant integrity

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | migration/relay |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

Changing the tenant primary key is high risk because legacy tenant-scoped rows reference the old token hash. A migration bug could orphan Computers or sessions, which would break APP-016 and APP-018 ownership.

### Fix Progress

- Migration adds an orphan-check table with `CHECK (orphan_count = 0)` before renaming legacy tenant data.
- New `tenants` rows use stable opaque ids and keep the old token hash only as `access_token_hash`.
- `register_tokens`, `computers`, and `client_sessions` are rebuilt by joining old references through the new tenant credential mapping.
- APP-018 GitHub tables are created against stable `tenants(tenant_id)` and do not depend on token hashes.

### Remaining Tradeoff

The migration disables foreign keys while rebuilding tables, which is pragmatic for D1 table replacement. Production rollout still needs a copied-database dry run with row counts before and after migration.

### Verification Items

- Seeded migration test: row counts match for tenants, Computers, register tokens, and client sessions.
- Orphaned reference test: migration fails before dropping legacy tables.
- Post-migration control-plane test: old token still resolves to the same stable tenant until rotation occurs.
- APP-018 schema test: GitHub tables reference stable `tenant_id` values.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current migration includes preflight orphan checks and table rebuilds; production dry-run evidence still needs to be attached before rollout.

## REV-004 · Retention cleanup remains a production tradeoff

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | relay/ops |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

APP-019 rotation cleanup covers short-lived rows during credential rotation, but operational retention for APP-018 delivery rows and stale setup/session rows still needs an explicit maintenance path before production rollout.

### Fix Progress

- Rotation deletes register tokens and client sessions for the tenant.
- Rotation deletes APP-018 setup sessions when the `github_setup_sessions` table exists.
- Existing manual D1 maintenance covers expired register tokens and client sessions.
- Manual D1 maintenance now also purges expired APP-018 setup sessions and `github_webhook_deliveries` older than 30 days.

### Operational Note

`github_webhook_deliveries` retention remains operational rather than part of token rotation, because delivery logs are audit/debug records. The documented default purge window is 30 days and can be adjusted before running the maintenance SQL.

### Verification Items

- Maintenance dry run shows how many `github_webhook_deliveries` rows would be purged before deletion.
- Purging old delivery rows does not delete GitHub routes, installations, Computers, or tenants.
- Rotation cleanup test proves setup sessions are removed while durable GitHub routes remain.
- README/operations docs include the delivery retention command and expected retention window.

### Fix Log

- 2026-05-27 - Added maintenance SQL for expired setup sessions and 30-day webhook delivery retention; verified Relay dry-run still succeeds with the updated schema and Worker bundle.
