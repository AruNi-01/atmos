# Brainstorm · APP-056: Usage Share, Users & Devices

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already has a strong **local** Token Usage dashboard (`crates/token-usage` + tokscale, UI under `apps/web` Token Usage). Share today is **client-only**: capture overview DOM → compose branded PNG → clipboard / system share / social intent ([`token-usage-share-card.ts`](../../../apps/web/src/app-shell/token-usage-share-card.ts)). There is **no public URL**, no hosted page, and no cloud identity for “whose usage is this?”

Relay identity (APP-016 / APP-020) is **Access Token possession = tenant**. D1 holds `tenants`, `computers`, sessions, and APP-019 GitHub install/routes. GitHub OAuth on relay is **only** for verifying installation ownership during setup — not product login. Relay AGENTS.md forbids putting Atmos business logic (projects, terminals, canvas, usage) into the Worker.

Users now want a **Token usage sharing page**: a link others can open. That forces three questions this brainstorm settles:

1. Host inside relay, or elsewhere?
2. Do we need real login (GitHub / Google / email)?
3. What is the optimal identity model if we may overturn prior design?

## Goals (draft)

- Let users publish a **shareable public (or unlisted) usage page** with stable URL and social OG.
- Keep **local-first**: viewing and analyzing usage on a machine never requires cloud login.
- Give public pages a **real owner** that survives Access Token rotation and multi-device use.
- Keep **relay** a thin connection fabric; do not overload it with product content.
- Prefer privacy-preserving **aggregate snapshots** over uploading raw agent sessions.

## Options

### Option A — Bolt share onto `packages/relay` + existing Access Token

Add `/v1/usage/*` to the relay Worker; authenticate publish with Bearer Access Token; store snapshots keyed by `tenant_id`.

**Pros**: Fastest ship; reuses D1 and domain (`relay.atmos.land`); no new deploy target.  
**Cons**: Violates relay boundary; public read traffic shares fate with WS/gateway control plane; Access Token is a bad public identity (leak = impersonation, lost token = orphan pages); no display name/avatar/handle without more hacks.  
**Unknown**: Whether Cloudflare cache/CDN patterns for public pages fit the same Worker cleanly.

### Option B — New heavy backend (VPS / separate cloud)

Build a traditional API + DB for users and share pages outside Cloudflare.

**Pros**: Full freedom of stack.  
**Cons**: New ops surface while the product already standardizes on Workers + D1; slower and more expensive for this scope.  
**Unknown**: Team capacity to run a second platform.

### Option C — Independent CF Worker `packages/hub` + GitHub Atmos Account + snapshot publish

New monorepo package / Worker (`hub.atmos.land`) owns:

- GitHub OAuth → `accounts`
- Session cookies for app/landing
- Usage share documents (redacted aggregates)
- Public read API

`apps/landing` (or edge SSR) renders `atmos.land/s/:id` and `/u/:handle`. Relay stays connection-only. Hub session mints **device credentials**; Computers owned by `user_id` (Phase 1).

**Pros**: Correct separation of concerns; natural GitHub identity for agentic builders; reuses CF/D1 ops; local-first preserved; path to lost-token recovery and multi-device rollup.  
**Cons**: New package + auth surface; dual Worker ops (Hub + Relay) and Hub→Relay device projection must stay consistent.  
~~**Historical (pre-decision):** Phase 1 might leave token-tenant ownership for Computers.~~ **Settled:** Computers are owned by Hub `user_id`; identity is session + device credentials only (no user Access Token).  
**Unknown**: Whether one shared D1 or two D1 databases is cleaner for ops.

### Option D — Continuous cloud sync of usage (not just publish)

Always-on ingest of local aggregates to cloud; public profile always “live”.

**Pros**: Multi-machine totals “just work”.  
**Cons**: Higher privacy surface, always-on dependency, harder consent model; overkill for first shareable page.  
**Unknown**: Merge rules across Computers and partial offline windows.

## Key forks in the road

| Fork | Decision (settled for this spec) |
|------|----------------------------------|
| Where to host share/account logic | **Not relay.** New `packages/hub` (CF Worker). Public HTML on `apps/landing` (`atmos.land`). |
| Auth for publish & account | **GitHub + Google OAuth (Better Auth).** No password / email magic link in v1. |
| Auth for local dashboard | **None.** Local Token Usage stays offline-capable. |
| Data model for share | **Explicit snapshot publish** of redacted aggregates (v1). Continuous sync deferred. |
| Identity root | **User** (`user_id` = Better Auth `user.id`; GitHub or Google login). **No user-generated Access Token.** Hub session mints/rotates **device credentials**. Computers owned by `user_id`. Better Auth `account` = OAuth link only, not owner FK. |
| Default visibility | **Unlisted link** default; public profile (`/u/:handle`) opt-in. |
| Cost on public page | **Off by default**; user can include estimated cost. |
| OG image | Reuse client-composed share card PNG upload to R2 (v1); server-side render later. |
| Backward compat | **Not a goal** for identity model; phased migration allowed. Existing PNG share remains. |

## Naming fork (settled)

**Canonical name:** `packages/hub` · domain `hub.atmos.land` · D1 `atmos-hub` · env `NEXT_PUBLIC_ATMOS_HUB_URL`.

| Layer | Atmos | Industry analogue |
|-------|--------|-------------------|
| Local agent/product server | `apps/api` (Atmos Server) | OpenCode **Server** (`opencode serve`); LobeHub desktop talking to a server |
| Connection to user machines | `packages/relay` | LobeHub **device-gateway** |
| Hosted multi-tenant **control plane** (auth, share, later entitlements) | **`packages/hub`** | SaaS **control plane** / platform API; LobeHub official app auth surface (not their agent-gateway) |
| Hosted agent compute (future) | `packages/sandbox` / `run.*` | LobeHub **sandbox** / agent-gateway compute path; not Hub |
| Marketing umbrella (optional) | “Atmos Cloud” | Product tier name only — **never** a package name |

| Candidate | Verdict |
|-----------|---------|
| `packages/cloud` / `cloud.atmos.land` | **Reject.** Collides with future hosted Agent/sandbox; kitchen-sink. |
| `packages/identity` / `auth` | Too narrow for share + later public features. |
| `packages/share` | Too narrow for OAuth/accounts. |
| `packages/gateway` / `server` / `api` | Collides with relay, local Server, model gateways. |
| `packages/platform` | Acceptable alternate; more empty. Prefer **hub**. |
| **`packages/hub` / `hub.atmos.land`** | **Choose.** Third-party auth + public share + extensible control-plane features. |
| Future `packages/sandbox` + `run.atmos.land` | Hosted Agent runtime; separate service. |

### What belongs in Hub (membership test)

A feature belongs in Hub if roughly all hold:

1. Needs an **Atmos Account** (or anonymous public read of user-owned resources).
2. Needs **Atmos-operated public internet** (works without the user’s local Server).
3. Is **control data** (identity, permissions, published snapshots, entitlements) — not agent execution and not Computer traffic relay.

| In Hub | Out of Hub |
|--------|------------|
| GitHub/Google OAuth, sessions, profiles | Local Token Usage computation (`crates/token-usage` / `apps/api`) |
| Usage share publish + public JSON | Relay WS / register / gateway (`packages/relay`) |
| Device↔account link records | Hosted sandbox PTY / cloud Agent runtime |
| Later: billing entitlements, public marketplace read APIs | Model proxy / LLM gateway product (if any) |

## Rejected approaches

- Using only Access Token as the owner of public pages.
- Using GitHub `installation_id` as the user id (org installs ≠ person).
- Uploading raw session logs / prompts to cloud to recompute tokscale remotely.
- Forcing cloud login before opening the local Token Usage page.
- Merging share routes into `packages/relay/src/index.ts` “for convenience”.
- Naming the account/share service `cloud` (collides with future hosted compute).
- User-generated Relay Access Token as the primary identity (copy/paste token in Settings).
- Keeping dual identity (manual token + OAuth) once accounts exist — pick Account as root.

## Open questions

- [x] Relay vs new service? → New hub Worker (`packages/hub`); relay stays fabric.
- [x] Login provider v1? → **GitHub + Google** (Better Auth). No email/password.
- [x] Snapshot vs continuous sync v1? → Snapshot publish.
- [x] Shared D1 with relay vs separate `atmos-hub` D1? → **Separate D1** `atmos-hub` (blast radius); link later via `user_id` / `devices`.
- [x] Handle mutability? → Default `github_login`; **one rename / 30d cooldown** (TECH).
- [x] Package name? → **`packages/hub`** (not cloud/platform/gateway).
- [x] Auth framework? → **Better Auth + Drizzle + D1** on Hub only; Relay stays raw D1 SQL.
- [x] Relay Access Token UX? → **Removed as user-facing identity.** Hub session enrolls devices; mints/rotates device credentials; Computers hang on `user_id`. No backward compat (no production users).

## References

- Code: `apps/web/src/app-shell/TokenUsagePage.tsx`, `TokenUsageShareDialog.tsx`, `token-usage-share-card.ts`, `crates/token-usage/`, `packages/relay/`, `packages/relay/migrations/`
- Specs: [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md), [APP-019 GitHub Automation Triggers](../APP-019_github-automation-triggers/TECH.md), [APP-020 Relay Stable Tenant Identity](../APP-020_relay-stable-tenant-identity/TECH.md)
- Relay boundary: [packages/relay/AGENTS.md](../../../packages/relay/AGENTS.md)


## Device credentials vs Access Token (settled)

**Problem with Access Token as identity:** Once Atmos Account exists, asking users to generate/import a high-entropy token is a second identity that can desync from the login, blocks recovery, and conflicts with “login owns my Computers.”

**Optimal model (no backward compatibility):**

```text
Atmos Account (Hub / Better Auth)
  ├── OAuth identities: GitHub, Google
  ├── Browser sessions (cookie) — interactive control plane
  └── Devices (Desktop / CLI / browser install)
        ├── device_id
        ├── device_credential (shown once at mint; stored hashed)
        └── can act for user on Relay management APIs
Computers + GitHub installs → owned by user_id (not by a free-floating token tenant)
```

| Credential | Who holds it | Lifetime | Used for |
|------------|--------------|----------|----------|
| Hub session cookie | Browser | Short / idle timeout | Login UI, publish share, **mint/rotate/revoke devices** |
| Device credential | Local install (`~/.atmos/…`) | Long-lived until rotated/revoked | Relay Bearer for list/register computers, client sessions |
| Computer `server_secret` | Atmos Server machine | Long-lived until revoke | Outbound `/ws/server` only |

**Rotation:** Prefer **Hub session** authorizes rotate (Settings “This device” / “Rotate credential”). Optional: present current device credential for headless rotate. Old credential dies immediately; Computers stay on `user_id`.

**Enroll UX:** Sign in → “Trust this device” (or automatic on first Relay action while logged in) → credential written locally. **No “Generate Access Token” primary path.** Headless VPS: from logged-in UI, “Add Computer” one-time register command / device code flow.

**Rejected:** Session cookie alone as Relay Bearer (cookies don’t fit CLI/VPS well; Hub and Relay hosts differ).

## Ready to promote

- Promote to PRD: Local Token Usage remains login-free; hub publish requires Atmos Account (GitHub or Google).
- Promote to PRD: Share is redacted aggregate snapshot with unlisted/public visibility, not raw session sync.
- Promote to TECH: `packages/hub` Worker + D1 + optional R2; landing public routes; client publish next to existing PNG share.
- Promote to TECH: Better Auth + Drizzle; device credentials minted by Hub; Relay computers under `user_id`; supersedes APP-016/020 token-tenant as product identity.
- Promote to TECH: GitHub + Google social providers only in v1.
- Promote to TEST: Auth, snapshot CRUD, public read, privacy redaction, unpublish, OG, and non-regression of local usage / relay.
