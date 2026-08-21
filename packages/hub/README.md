# @atmos/hub

Atmos Hub — `hub.atmos.land` control plane ([APP-056](../../specs/APP/APP-056_usage-share-and-accounts/TECH.md)).

## Stack (official patterns)

| Piece | How we do it |
|-------|----------------|
| **D1 + Drizzle** | `drizzle(env.DB)` — [Drizzle D1 get started](https://orm.drizzle.team/docs/get-started/d1-new), [connect D1](https://orm.drizzle.team/docs/connect-cloudflare-d1) |
| **Migrations** | `drizzle-kit generate` → `drizzle/`; wrangler `migrations_dir = "drizzle"` |
| **Auth** | [Better Auth](https://better-auth.com/docs/installation) + [`@better-auth/drizzle-adapter`](https://better-auth.com/docs/adapters/drizzle), `provider: "sqlite"` |
| **Providers v1** | GitHub + Google social only |
| **Identity** | `user_id` = Better Auth `user.id` — **no** user Access Token dual identity |

## Layout

```
packages/hub/
├── drizzle/              # drizzle-kit generate output
├── drizzle.config.ts     # dialect sqlite + driver d1-http
├── wrangler.toml         # nodejs_compat, migrations_dir
├── src/
│   ├── index.ts
│   ├── env.ts
│   ├── db/client.ts      # drizzle(env.DB, { schema })
│   ├── db/schema.ts      # BA tables + devices + shares + integrations
│   ├── auth/index.ts     # betterAuth + drizzleAdapter
│   ├── devices.ts
│   ├── integrations.ts   # Linear (APP-057) — Hub-only credentials
│   ├── usage-shares.ts
│   ├── public.ts
│   ├── redaction.ts
│   ├── relay-sync.ts
│   └── cors.ts
└── test/
```

## Commands

```bash
cd packages/hub
bun install
bun run db:generate          # drizzle-kit generate
bunx wrangler d1 execute atmos-hub --local --file=./drizzle/0000_init.sql
bun run dev
bun test
```

## Env (`.dev.vars`)

```
BETTER_AUTH_SECRET=dev-secret-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:8787
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ALLOWED_ORIGINS=http://localhost:3030,http://127.0.0.1:3030,http://localhost:30303,http://127.0.0.1:30303,http://localhost:3000,https://app.atmos.land
RELAY_URL=https://relay.atmos.land
RELAY_HUB_SYNC_SECRET=...   # same secret Relay uses for /v1/internal/devices/upsert
```

Client: `NEXT_PUBLIC_ATMOS_HUB_URL=http://localhost:8787` (prod: `https://hub.atmos.land`)

### Google OAuth client (Cloud Console)

Create a **Web application** OAuth client. Better Auth callback path is fixed:

| Field | Values |
|-------|--------|
| **Authorized JavaScript origins** | `http://localhost:3000`, `https://app.atmos.land`, `http://localhost:8787`, `https://hub.atmos.land` |
| **Authorized redirect URIs** | `http://localhost:8787/api/auth/callback/google`, `https://hub.atmos.land/api/auth/callback/google` |

Do **not** use bare `https://localhost`, `http://localhost:8080`, or `https://api.atmos.land` for Hub Google login — those are not Hub origins / not the BA callback path.

`BETTER_AUTH_URL` must match the redirect host (e.g. `https://hub.atmos.land` in prod).

## Product rules

1. **Linear / integrations** — credentials only in Hub `user_integrations` under `user_id`. No `~/.atmos/*_credentials.json`.
2. **Computers** — Relay rows owned by `user_id`; device credentials Hub-minted. Using Relay requires sign-in + device enroll.
3. **Local Token Usage** still works offline; **publish** and **integrations** require Hub login.

## Deploy

From `packages/hub`, after Wrangler auth, a real D1 `database_id` in `wrangler.toml`, and Worker secrets (`scripts/hub/put-cloud-secrets.sh`):

```bash
scripts/hub/deploy.sh
# or (from packages/hub)
bun run deploy:hub
# or
bunx wrangler deploy
```

Worker secrets persist across deploys. Production origin is **`https://hub.atmos.land`**.

### Custom domain

This repo sets **`hub.atmos.land`** in `wrangler.toml` (`routes` + `custom_domain`). The **atmos.land** zone must be on Cloudflare.

### Deploy from GitHub Actions

Workflow: [`.github/workflows/deploy-hub.yml`](../../.github/workflows/deploy-hub.yml).

1. **Repository secret:** `CLOUDFLARE_API_TOKEN` (same token as relay)
2. **Optional:** `CLOUDFLARE_ACCOUNT_ID`
3. **`wrangler.toml`** must contain a real **`database_id`**
4. **Triggers:** manual **Run workflow**, or push to **`main`** when files under **`packages/hub/`** change

D1 schema migrations are **not** auto-run in CI; apply when you change `drizzle/`:

```bash
cd packages/hub
bunx wrangler d1 migrations apply atmos-hub --remote
```
