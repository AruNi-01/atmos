# PRD · APP-020: Relay Stable Tenant Identity

> Product Requirements · WHAT and WHY. Settled direction for making Atmos Relay Access Tokens safely rotatable without losing Computers or external integrations.

## Context

- **Problem**: Relay currently uses `sha256(access_token)` as the tenant id. Replacing the token creates a different tenant, so registered Computers and future GitHub routes cannot follow the user.
- **Why now**: APP-019 GitHub Automation Triggers adds long-lived GitHub App installations and event routes. Token replacement must not silently detach those routes when the user still has the old token locally.
- **Related specs**: [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md), [APP-019 GitHub Automation Triggers](../APP-019_github-automation-triggers/TECH.md).

## Goals

1. Let users rotate the current Atmos Relay Access Token while preserving the same logical tenant.
2. Keep registered Computers and server secrets valid after token rotation.
3. Preserve tenant-owned integrations such as GitHub installations and event routes.
4. Keep the no-login model: the current Access Token remains the proof of ownership.
5. Make unsafe ownership transfer impossible when the current token is unavailable.

## Users & Scenarios

- **Primary persona**: Atmos user who manages one or more local or VPS Computers from Settings.
- **Secondary persona**: Maintainer who rotates secrets periodically but expects existing automations and GitHub triggers to keep working.

### Key scenarios

1. A user clicks "Rotate Access Token" in Settings. Atmos reads the current local token, generates a new token, rotates it through Relay, and writes the new token locally after success.
2. A user imports a different Access Token intentionally. Atmos treats that as switching identity and shows Computers/routes for the new token only.
3. A user configured GitHub-triggered automations before rotation. After rotation, those routes remain attached to the same tenant and continue to target the same Computers.
4. A user lost the old token. Atmos cannot migrate existing Computers/routes and requires setting up a new identity.

## User Stories

- As an Atmos user, I want to rotate my Relay Access Token, so that I can replace a credential without re-registering every Computer.
- As a maintainer, I want GitHub routes to survive token rotation, so that automations do not break after credential hygiene.
- As a security-conscious user, I want the old token to stop working after rotation, so that a leaked token cannot keep managing my Computers.
- As a user intentionally switching to another token, I want Atmos to treat it as a different identity, so that routes are not transferred without proof.

## Functional Requirements

### Must Have

- **M1 · Stable tenant id**: Relay tenants have an opaque stable `tenant_id` that is not derived from the Access Token.
- **M2 · Token as credential**: Access Tokens authenticate a tenant by matching `access_token_hash`; the token hash is not used as the tenant primary key.
- **M3 · Rotation API**: Users can rotate the current Access Token by presenting the current token and a new token. The rotation preserves the stable tenant id.
- **M4 · Ownership preservation**: Rotation preserves tenant-owned rows, including registered Computers, server secrets, client-visible Computer metadata, and APP-019 GitHub installations/routes.
- **M5 · Old token revocation**: After successful rotation, the old Access Token can no longer access the tenant control plane.
- **M6 · Local atomic update**: Web/Desktop updates local `~/.atmos/computer-client.json` only after Relay confirms rotation. On failure, the old token remains configured.
- **M7 · Identity switch distinction**: Replacing the local token without the rotation flow is treated as an identity switch and does not transfer old Computers or GitHub routes.
- **M8 · Lost token boundary**: If the user cannot present the current token, Relay does not provide automatic migration or transfer for tenant-owned rows.
- **M9 · Short-lived credential cleanup**: Rotation invalidates short-lived register tokens, client sessions, and setup sessions for the tenant; registered Computers remain valid.
- **M10 · Backward-compatible migration**: Existing Relay tenants are migrated from `tenant_id = token_hash` to stable tenant ids without losing registered Computers.

### Nice to Have

- **N1 · Rotation history**: Store a minimal tenant rotation audit row without recording raw token values.
- **N2 · Recovery phrase**: Future recovery credential separate from the Access Token.
- **N3 · Admin transfer**: Future hosted-account flow that can transfer ownership through logged-in identity rather than token possession.

## Out of Scope

- **Login accounts**: This spec does not add user accounts, email login, OAuth login, or hosted workspace identity.
- **Lost-token recovery**: Without the current token, no migration or transfer is allowed in v1.
- **Per-Computer token migration**: Computers keep their existing `server_secret`; they do not need per-device rotation for this feature.
- **GitHub App reinstall logic**: APP-019 owns GitHub setup UX; APP-020 only preserves tenant ownership through rotation.

## Success Metrics

- **Leading**: A rotated token can list the same Computers immediately after rotation.
- **Leading**: The old token receives `401 unauthorized` for control-plane actions after rotation.
- **Leading**: APP-019 GitHub routes remain associated with the same tenant after rotation.
- **Quality**: No raw Access Tokens appear in logs, D1 rows, or error payloads.

## Risks & Open Questions

- **Risk**: Migrating the tenant key incorrectly could orphan Computers. The migration must be tested against a seeded legacy D1 database.
- **Risk**: Users may confuse "rotate token" with "switch identity." UI copy should make the difference explicit.
- **Tradeoff**: Rotation revokes short-lived sessions for stricter security, which may require clients to reconnect.
- **Open**: Should the stable `tenant_id` ever be shown in Settings for debugging, or remain internal only?

## Milestones

- **Phase 1 · Schema foundation**: Add stable tenant ids and migrate existing tenant-scoped rows.
- **Phase 2 · Relay API**: Update tenant lookup and add token rotation endpoint.
- **Phase 3 · Client UX**: Add Settings action for rotation and explicit identity switch copy.
- **Phase 4 · APP-019 integration**: Ensure GitHub setup/routes use stable tenant ids before production rollout.
