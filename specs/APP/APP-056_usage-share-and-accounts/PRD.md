# PRD · APP-056: Usage Share, Users & Devices

> Product Requirements · WHAT and WHY. Settled direction for GitHub-based Atmos Accounts and public Token Usage share pages.

## Context

- **Problem**: Users can analyze AI token usage locally and export a PNG share card, but cannot give someone a **URL** that opens a live usage page owned by them. Without a cloud identity, a public page has no safe owner, recovery, or unpublish story.
- **Why now**: Token Usage is a marketed product surface; PNG-only share is weak for social proof and collaboration. Relay already has D1 + GitHub App plumbing, but its identity is token-possession and its role is connection fabric — the wrong place to grow product accounts and public content.
- **Product direction**: Introduce **Atmos Hub** for **third-party auth (GitHub + Google), device credentials, and public share**. Keep **local-first** Token Usage without login. Keep **relay** as connection fabric only. **User is the only product identity root** — no user-generated Relay Access Token.
- **Service name (settled)**: package `packages/hub`, host `hub.atmos.land`, D1 `atmos-hub`. Engineering term: **hosted control plane**. Marketing **“Cloud”** (if used) is only a future compute umbrella — never this package name.
- **Hub growth**: more account/public features later; must **not** absorb relay traffic or sandbox/agent execution.
- **Auth stack (settled)**: **Better Auth + Drizzle + D1** on Hub. Relay remains raw D1 SQL (no Better Auth).
- **Owner id (settled)**: product owner is Better Auth **`user.id` → column/API `user_id`**. Better Auth’s **`account` table is only OAuth provider links** (GitHub/Google), not billing and not the Computer owner FK. UI may still say “Atmos Account” for the signed-in person.
- **Relay identity (settled, no backward compat)**: Hub session **mints/rotates/revokes device credentials**; Computers and GitHub installs are owned by **`user_id`**. Device credential is a machine secret, not a user-managed password-like token.
- **Related specs**: [APP-016 Atmos Computer](../APP-016_atmos-computer/TECH.md), [APP-019 GitHub Automation Triggers](../APP-019_github-automation-triggers/TECH.md), [APP-020 Relay Stable Tenant Identity](../APP-020_relay-stable-tenant-identity/TECH.md). This spec **supersedes** “Access Token = identity root” (APP-016/020 product identity); no production migration required.

## Goals

1. Let users publish a shareable Token Usage page with a stable link and social-friendly preview.
2. Keep local Token Usage fully usable without any cloud account or network.
3. Establish the **Atmos user** (GitHub or Google sign-in; `user_id`) as the owner of published content, devices, and Computers (via Hub-issued device credentials).
4. Preserve privacy: only redacted aggregates leave the machine, and only after explicit publish.
5. Keep relay free of usage/content business logic; hub is a separate service surface.

## Users & Scenarios

- **Primary persona**: Agentic builder who wants to show token/cost intensity (heatmap, agent mix) on X/Reddit or in a portfolio.
- **Secondary persona**: Teammate sharing an unlisted link with a coworker without making a public profile.
- **Power persona**: Multi-machine user who later wants one user to own Computers + shares (Phase 2).

### Key scenarios

1. User opens Token Usage locally (no login), explores charts, then clicks **Publish page**, signs in with GitHub once, and gets `https://atmos.land/s/...`.
2. User posts the link; a visitor (logged out) sees the snapshot page and OG preview on social platforms.
3. User updates the published snapshot after more local usage, same URL refreshes.
4. User unpublishes; the link stops showing data.
5. User keeps using PNG share without ever creating an account.
6. User enrolls a second device while signed in and sees the same Computers without pasting any token.

```text
[Local, signed out]
  Token Usage → charts OK
  PNG share OK
  Publish page → require Hub login (GitHub|Google)
       ↓
[Signed in] → create/update snapshot (same share_id) → public /s/:id
       ↓ unpublish → public 404 (no stale edge cache)
[Signed in] → Trust device → device credential → Relay Computers
[Second device] → enroll again → same user_id Computers
```

## User Stories

- As a user, I want a public or unlisted usage URL, so that I can share stats without attaching a screenshot every time.
- As a user, I want local Token Usage to work offline, so that cloud outages or privacy preference never block analysis.
- As a user, I want GitHub or Google sign-in, so that ownership is obvious and I do not manage another password or Access Token.
- As a user, I want signing in to enroll this device automatically (or with one click), so that I never copy-paste a Relay Access Token.
- As a user, I want to rotate this device’s credential while logged in, so that a leaked machine secret dies without losing my Computers.
- As a privacy-conscious user, I want only aggregate stats published, so that prompts, paths, and projects never leave my machine.
- As a user, I want to hide estimated cost by default, so that money figures are not leaked accidentally.
- As a user, I want to unpublish a share (and update its snapshot on the same URL while it is live), so that I control exposure after posting.
- As a multi-device user, I want my user identity—not a free-floating token—to own Computers, shares, and installs, so that rotating a device credential never orphans resources.

## Functional Requirements

### Must Have

- **M1 · Local-first dashboard**: Existing Token Usage page continues without Atmos Account login.
- **M2 · Atmos user / sign-in (GitHub + Google)**: User can sign in / out with **GitHub or Google** via Hub (Better Auth). Account stores provider subject ids, display name, avatar; no password product.
- **M3 · Publish snapshot**: From Token Usage UI, authenticated user can publish a redacted aggregate snapshot derived from the current local overview (and selected options).
- **M4 · Share URL**: Each share has a stable id URL (`/s/{share_id}`). Copy link is one click from the share UI.
- **M5 · Visibility**: At least **unlisted** (link-only) and **public** (eligible for profile listing). Default = unlisted.
- **M6 · Public read**: Logged-out visitors can open unlisted/public share URLs and see the snapshot UI (summary, heatmap/timeline as available, agent/model mix).
- **M7 · Update & unpublish**: Owner can replace snapshot content on the same share id, or revoke so the URL no longer shows content.
- **M8 · Privacy redaction**: Snapshot schema excludes prompts, messages, file paths, project names, repo paths, and credentials. Only aggregates and display labels the user already sees on the local overview.
- **M9 · Cost opt-in**: Estimated cost fields are omitted unless the user enables “Include cost”.
- **M10 · Service separation**: Account, auth, device credentials, and usage share APIs live in **`packages/hub`**. Relay remains connection fabric (WS/gateway/register), not product login.
- **M11 · Existing PNG share**: Current image capture / clipboard / native share remains available without account.
- **M12 · Session security**: Hub sessions are HttpOnly Secure cookies (Better Auth); OAuth provider tokens are not the long-term client session; device credentials are never logged.
- **M13 · Device enroll (no user Access Token)**: While logged in, user can enroll the current install; Hub **mints** a device credential written locally. There is **no** primary UX to generate/import a free-floating Relay Access Token.
- **M14 · Device rotate / revoke via login**: Logged-in user can rotate or revoke this device (and list other devices). Rotation preserves Computers under the same user. Old device credential fails immediately.
- **M15 · User-owned Computers**: Relay Computer rows and APP-019 installs are scoped to **`user_id`**. Any non-revoked device credential of that user may manage them (subject to product policy).
- **M16 · Headless / VPS enroll**: Logged-in UI can produce a one-time register path (command or device code) so a Server can join the user without pasting a long-lived user token.

### Should Have

- **S1 · Profile handle**: Account has a public `handle` (default GitHub login); optional `/u/{handle}` profile that can feature a primary public share.
- **S2 · OG image**: Share pages expose Open Graph / Twitter card metadata; v1 may use client-uploaded share-card PNG.
- **S3 · Device list UI**: Settings shows enrolled devices (label, last seen) with revoke.
- **S4 · Share list**: Owner can list their shares and see last updated time.
- **S5 · Data provenance badge**: Public page shows “Local aggregate snapshot · generated …” so visitors know it is not live billing data.

### Nice to Have

- **N1 · Continuous multi-Computer rollup** under user.
- **N2 · Email magic-link** or additional OAuth providers.
- **N3 · Server-rendered OG** without client PNG upload.
- **N4 · Year-in-review / leaderboard** (strict opt-in).
- **N5 · Password-protected shares**.
- **N6 · Org / team accounts** and shared Computer pools.

## Out of Scope

- Moving raw tokscale session files or agent transcripts to the cloud.
- Putting usage share routes or account tables into the **relay** Worker as the product home (may later *reference* `user_id` from relay tables in Phase 2, but share product is not relay).
- Replacing local Token Usage computation with a cloud-only dashboard.
- Team org accounts / SSO (future).
- Billing Atmos itself based on token usage.
- Forcing login for **pure local** Atmos Server use (no Relay).
- User-generated Access Token as a supported identity mode.
- Dual local+Hub stores for Computers or third-party integrations (Linear): **Hub `user_id` only**; features that need cloud identity must guide users to sign in.
- Password/email-only accounts in v1.
- Putting Better Auth on `packages/relay`.

## Success Metrics

| Metric | Target (direction) |
|--------|--------------------|
| Publish completion | Token Usage → GitHub/Google login → live `/s/...` URL |
| Local independence | 100% of local Token Usage features work signed-out |
| Privacy | Zero raw prompts/paths in stored `snapshot_json` (schema + review) |
| Separation | No new usage/account business routes in `packages/relay` public API surface for this feature |
| Unpublish latency | Revoked share returns not-found/gone to public readers immediately after revoke |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental oversharing of cost or agent mix | Default unlisted; cost off; clear publish checklist |
| Account vs device confusion | UI: “Signed in as …” vs “This device credential” (never “Access Token identity”) |
| Relay scope creep | Hard package boundary + AGENTS.md for hub |
| Social login vs GitHub App install | Product login = Better Auth GitHub/Google; APP-019 install stays GitHub App on relay |
| Public page abuse / spam | Rate limit publish; bind to GitHub account; optional future abuse reporting |
| Stale snapshots mistaken for live billing | Provenance badge + generated_at on page |

## Milestones

- **Phase 1 · Hub identity + Share + device credentials**: GitHub/Google login (Better Auth), device mint/rotate/revoke, user-owned Computers on Relay, snapshot publish, public `/s/{id}`. (**Must Haves including M13–M16.**)
- **Phase 2 · Multi-device polish & recovery UX**: richer device labels, cross-device revoke everywhere, optional continuous usage rollup.
- **Phase 3 · Social depth**: server OG, leaderboards (opt-in), more auth providers if needed.

## Dependencies

- Existing local Token Usage overview API and UI.
- Cloudflare (Workers, D1, R2 optional, DNS on `atmos.land`).
- GitHub OAuth App + Google OAuth client for Better Auth (separate from APP-019 GitHub App install secrets where practical).
- Relay schema/API changes for `user_id` + device credentials (this monorepo; no external users to migrate).
- Landing app deploy path for public share routes.

## Open product choices settled here

- **Login v1 = GitHub + Google only** (Better Auth + Drizzle + D1 on Hub).
- **No user-generated Relay Access Token**; Hub session mints/rotates device credentials.
- **Computers owned by `user_id`.**
- **Share v1 = explicit snapshot**, default unlisted.
- **Hub ≠ relay ≠ sandbox.**
- **No backward compatibility** for token-tenant identity (zero production users).
- Supersedes product identity assumptions in APP-016/APP-020 where they conflict (Access Token = tenant root).
