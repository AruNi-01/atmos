# Atmos Hub (`packages/hub`)

Hosted **control plane**: identity (Better Auth + GitHub/Google), device credentials, third-party integrations (Linear), usage-share publish.

- **Not** relay (WS/gateway) — that is `packages/relay`.
- **Not** local Server business logic — that is `apps/api` / `crates/*`.
- **Stack**: Better Auth + Drizzle + Cloudflare D1 (+ optional R2 for OG).

See [APP-056 TECH](../../specs/APP/APP-056_usage-share-and-accounts/TECH.md).

## Rules

1. Product owner is always **`user_id`** (= Better Auth `user.id`). Never dual-store Access Token identity.
2. Linear (and future integrations) credentials live only in Hub `user_integrations` — no `~/.atmos/*_credentials.json` dual path.
3. Computers on Relay are owned by `user_id`; device credentials are Hub-minted.
4. Do not run Better Auth inside Relay.
5. Do not put usage-share product routes on Relay.

## Commands

```bash
bun run --cwd packages/hub test
bun run --cwd packages/hub typecheck
bun run --cwd packages/hub dev   # wrangler dev
```
