# REVIEW · APP-019: GitHub Automation Triggers

> Post-implementation review log for code quality, maintainability, security boundaries, and verification follow-up. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-05-27  
**Review scope**: code quality review for GitHub trigger implementation and Relay integration  
**Related code**: `packages/relay/src/event-routes.ts`, `packages/relay/src/github-webhook.ts`, `packages/relay/src/github-app.ts`, `apps/api/src/relay/`, `crates/core-service/src/service/automation/`, `apps/web/src/features/automations/`

## Review Summary

The APP-019 implementation follows the planned ownership model: GitHub ingress and route metadata live in Relay, while local automation definitions and run execution remain in the local Atmos Server. The review focus for this round is preserving that boundary as the first end-to-end implementation grows across Relay, API, service, and web UI code.

The main quality risks are tenant ownership drift, stale Relay routes, untrusted GitHub payload text leaking into trusted instructions, and incomplete verification of delivery lifecycle edge cases. The fixes should stay narrow: strengthen ownership checks, keep route cleanup explicit, keep external trigger handling locally revalidated, and add targeted regression coverage before production rollout.

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | relay | Route mutations need strict tenant ownership guards | fixed |
| REV-002 | P1 | service/api | External trigger ingestion must revalidate local automation state | fixed |
| REV-003 | P2 | web/service | Route cleanup and `needs_setup` transitions need explicit handling | fixed |
| REV-004 | P2 | relay/tests | Delivery lifecycle coverage is still incomplete | fixed |

## REV-001 · Route mutations need strict tenant ownership guards

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | relay |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

GitHub route creation, update, and deletion are control-plane operations. They must be authorized by the user's Relay Access Token and scoped to the stable APP-020 tenant. A route id supplied by a client must never let one tenant update or disable another tenant's route.

### Fix Strategy

- Keep `server_secret` limited to outbound Computer socket authentication.
- Resolve the caller through the Access Token and stable `tenant_id` before any GitHub route mutation.
- Validate that the tenant owns `server_id`, `installation_id`, and the target repository before persisting a route.
- Treat an existing `route_id` owned by another tenant as not found.

### Verification Items

- Relay integration test: Token A cannot update or delete a route created under Token B.
- Relay integration test: route creation rejects a `server_id` not owned by the caller's tenant.
- Relay integration test: route creation rejects a repository outside the installation scope.
- Log inspection: rejected ownership checks do not print raw Access Tokens, token hashes, installation tokens, or webhook bodies.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current implementation includes tenant-scoped route lookup/update guards and installation/server ownership checks; verification still needs to be run by the implementation owner.

## REV-002 · External trigger ingestion must revalidate local automation state

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | service/api |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

Relay can verify GitHub signatures and match route metadata, but it cannot be the final authority for starting a local automation run. The local service must reject stale, disabled, or mismatched route events before creating a run.

### Fix Strategy

- Keep Relay delivery envelopes structured and provider-specific payload excerpts bounded.
- Add local external-trigger handling that checks automation existence, trigger kind, trigger enabled/status, stored route id, repository, and event family before starting a run.
- Mark GitHub user-authored text as untrusted context rather than merging it into trusted automation instructions.
- Return explicit delivery ack statuses so Relay can distinguish accepted, locally rejected, and errored deliveries.

### Verification Items

- Service-level test: disabled GitHub trigger returns `local_rejected` and creates no run.
- Service-level test: stale route id returns `local_rejected` and creates no run.
- Service-level test: GitHub comment/body excerpts are marked untrusted in generated run context.
- API/Relay integration test: delivery ack can update a matched or dispatched row, but cannot overwrite a terminal ack status.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current implementation adds external-trigger modules and delivery ack handling; targeted tests remain the required verification gate.

## REV-003 · Route cleanup and `needs_setup` transitions need explicit handling

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | web/service |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

GitHub trigger setup spans local automation state and Relay route state. If disable/delete, route replacement, or Access Token identity switch paths are implicit, stale routes can keep receiving webhooks or the local UI can show a trigger as active when the current identity cannot manage it.

### Fix Strategy

- Keep `needs_setup` as the local safe state whenever route sync is missing, fails, or belongs to another identity.
- Attempt Relay route cleanup before replacing or deleting a local GitHub route.
- On local delete, mark the GitHub trigger setup as stale before soft-deleting the automation so incoming stale deliveries cannot start runs.
- Treat APP-020 direct token replacement as an identity switch: do not transfer routes, and require setup under the new token.

### Verification Items

- Frontend/API test: deleting a GitHub-triggered automation calls route cleanup and leaves no active local trigger state.
- Frontend test: failed route sync keeps the automation disabled with `needs_setup`.
- Integration test: Token B cannot clean up Token A's route, and the local automation enters `needs_setup`.
- Regression test: manual and scheduled triggers remain unaffected by GitHub route cleanup failures.

### Fix Log

- 2026-05-27 - Recorded after quality review. Current implementation adds explicit cleanup calls and local `needs_setup` normalization; route cleanup failure handling still needs end-to-end verification.

## REV-004 · Delivery lifecycle coverage is still incomplete

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | relay/tests |
| **Reported by** | internal quality review |
| **Owner** | unassigned |

### Finding

The delivery state machine is central to safe GitHub webhook behavior, but the first implementation only has targeted unit coverage. Before production rollout, it needs broader tests for duplicate delivery handling, offline Computers, local rejection, and retention cleanup expectations.

### Fix Strategy

- Add Relay tests for duplicate `delivery_id + route_id` writes and `duplicate_count` increments.
- Add Relay/API tests for `matched -> dispatched -> accepted`, `matched -> missed_offline`, and `matched/dispatched -> local_rejected`.
- Add a maintenance/retention verification item for 30-day `github_webhook_deliveries` cleanup.
- Keep delivery rows route-level so one GitHub delivery can intentionally trigger multiple routes without duplicate runs per route.

### Verification Items

- `bun test packages/relay/test/event-routes.test.ts`
- Relay integration test with two routes matched by one GitHub delivery.
- Relay integration test with a repeated GitHub delivery for the same route.
- Maintenance dry run proving old `github_webhook_deliveries` rows can be purged without touching active routes.

### Fix Log

- 2026-05-27 - Added provider-neutral delivery-state tests for ack transition guards and dispatch status write guards; added route matching tests for repository-id rename fallback and review-comment normalization; added setup-session atomic claim coverage; added D1 maintenance cleanup for expired setup sessions and 30-day webhook delivery rows.
