# Atmos Hub (`packages/hub`)

Hosted **control plane**: identity (Better Auth + GitHub/Google), device credentials, third-party integrations (Linear), usage-share publish.

- **Not** relay (WS/gateway) — that is `packages/relay`.
- **Not** local Server business logic — that is `apps/api` / `crates/*`.
- **Stack**: Better Auth + Drizzle + Cloudflare D1 (+ optional R2 for OG).

See [APP-056 TECH](../../specs/APP/APP-056_usage-share-and-accounts/TECH.md).

## Build And Test

- **Dev**: `bun run --cwd packages/hub dev` (or `just dev-hub`)
- **Deploy**: `bunx wrangler deploy` (see [README.md](README.md), `.github/workflows/deploy-hub.yml`)
- **D1 migrate**: `bunx wrangler d1 migrations apply atmos-hub --remote` (see `drizzle/`)
- **Deploy script**: `scripts/hub/deploy.sh` (or `bun run deploy:hub` from `packages/hub`)
- **Secrets**: `scripts/hub/put-cloud-secrets.sh`

## Rules

1. Product owner is always **`user_id`** (= Better Auth `user.id`). Never dual-store Access Token identity.
2. Linear (and future integrations) credentials live only in Hub `user_integrations` — no `~/.atmos/*_credentials.json` dual path.
3. Computers on Relay are owned by `user_id`; device credentials are Hub-minted.
4. Do not run Better Auth inside Relay.
5. Do not put usage-share product routes on Relay.
6. Mobile pairing: signed-in clients create a one-time QR code via `POST /v1/mobile-pair/create` (3 min TTL); phones claim with `POST /v1/mobile-pair/claim` (no login). Mobile OAuth handoff uses `/v1/mobile-auth/complete` + deep link `atmos://hub-auth/callback`.
6. **Product HTTP routes use `requireUser` only** (session cookie **or** device Bearer → same `userId`). Do not reintroduce cookie-only gates for Desktop. Exception: `/v1/desktop-auth/complete` uses `requireSession` because it mints the first device after browser OAuth.
7. Clients attach identity via `@atmos/hub-client` (`hubFetch` / `withHubAuth`) — feature code never branches on cookie vs device.

## Commands

```bash
bun run --cwd packages/hub test
bun run --cwd packages/hub typecheck
bun run --cwd packages/hub dev   # wrangler dev
```
