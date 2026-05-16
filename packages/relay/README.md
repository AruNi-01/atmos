# Atmos Computer relay (APP-016)

Single Cloudflare Worker that provides:

- **Control plane (D1)** — register tokens, computer registration, listing, client session issuance
- **Relay (Durable Objects)** — one `ServerHub` DO per `server_id`; browser and Rust `apps/api` connect as WebSocket peers

## Prerequisites

- Node 18+ or Bun
- `wrangler` (devDependency of this package)

**Cloudflare plans (Durable Objects):** DOs are available on **Workers Free** and **Workers Paid**. On **Free**, only Durable Objects using the **SQLite storage backend** are available. On **Paid**, DOs may use **SQLite or key-value** storage backends. To downgrade **Paid → Free**, delete any DO namespaces that use the **key-value** backend first ([Cloudflare docs](https://developers.cloudflare.com/durable-objects/platform/pricing/)).

## Authenticate Wrangler

Pick **one**:

1. **Interactive (local laptop)** — from `packages/relay`:

   ```bash
   bunx wrangler login
   bunx wrangler whoami
   ```

2. **Token (CI / automation / Cursor agent)** — create an API token at  
   https://developers.cloudflare.com/fundamentals/api/get-started/create-token/  
   with permissions to deploy Workers and manage D1 for your account (e.g. **Workers Scripts: Edit**, **D1: Edit** as needed). Then:

   ```bash
   export CLOUDFLARE_API_TOKEN="your_token_here"
   ```

   Wrangler exits with an error in non-interactive shells if this variable is unset.

**Account ID (usually optional):** Wrangler normally infers which Cloudflare account to use from **OAuth login** or from an API token that applies to **one account**. If you have **multiple accounts** under the same user, or non-interactive deploy keeps asking / failing, pin the account in either place:

- **`wrangler.toml`:** top-level `account_id = "<32-char hex from dashboard sidebar>"`
- **Environment / CI:** `export CLOUDFLARE_ACCOUNT_ID="..."` (GitHub Actions: optional repo secret `CLOUDFLARE_ACCOUNT_ID`)

The ID is not a password; it only selects which account receives the deploy.

## One-time setup

1. Create D1 and apply schema:

   ```bash
   cd packages/relay
   npx wrangler d1 create atmos-computer-cp
   ```

   Put the returned `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_ID`).

2. Run migration:

   ```bash
   npx wrangler d1 execute atmos-computer-cp --remote --file=./migrations/0001_init.sql
   ```

   For local dev, omit `--remote` or follow `wrangler d1` docs for the local DB file.

No Worker-wide admin secret is required. Each C-end user registers their own **access token** via `POST /v1/tenants` (see HTTP API). Operator maintenance uses the D1 dashboard directly.

## Run locally

```bash
pnpm exec wrangler dev
# or
bunx wrangler dev
```

## Deploy

From `packages/relay`, after **Authenticate Wrangler**, **D1 id** in `wrangler.toml`, and **remote migration**:

```bash
bunx wrangler deploy
```

Use that HTTPS origin (production: **`https://relay.atmos.land`**) for **`NEXT_PUBLIC_ATMOS_CP_URL`** and as the base for `wss://` WebSocket URLs.

Validate a bundle without uploading:

```bash
bunx wrangler deploy --dry-run
```

### Custom domain (your own hostname)

This repo sets **`relay.atmos.land`** in `wrangler.toml` (`routes` + `custom_domain`). The **atmos.land** zone must be on Cloudflare; after deploy, Wrangler/Cloudflare will guide DNS if needed.

To use a different hostname, edit `routes` in `wrangler.toml` and redeploy.

You can still hit the default **`*.workers.dev`** URL until the custom hostname is active. For **`NEXT_PUBLIC_ATMOS_CP_URL`** and URLs returned by the control plane, prefer **`https://relay.atmos.land`** in production so clients don’t depend on `workers.dev`.

**Alternative:** **Dashboard** → **Workers &amp; Pages** → this Worker → **Domains &amp; Routes** → **Add** Custom Domain (same effect as `routes` in config).

### Deploy from GitHub Actions

Workflow: [`.github/workflows/deploy-relay.yml`](../../.github/workflows/deploy-relay.yml).

1. **Repository secret:** `CLOUDFLARE_API_TOKEN` — API token with permission to deploy this Worker (and use bound D1), same idea as local CLI ([create token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)).
2. **Optional:** **`CLOUDFLARE_ACCOUNT_ID`** — same value as the Account ID in the Cloudflare dashboard (only if deploy cannot infer the account from the token).
3. **`wrangler.toml`** must contain a real **`database_id`** (not `REPLACE_WITH_D1_ID`) before deploy will succeed on CI.
4. **Triggers:** manual **Run workflow**, or push to **`main`** when files under **`packages/relay/`** change.

D1 schema migrations are **not** auto-run in CI; apply SQL manually when you change `migrations/` (see One-time setup).

## HTTP API (M1)

All JSON. CORS `*` for dev.

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/v1/tenants` | _(none, rate-limited)_ | Body `{ "token": "<user access token ≥32 chars>" }`; registers tenant (`409` if exists) |
| POST | `/v1/register_tokens` | Bearer **user access token** | `{ register_token, expires_at, register_command }` |
| POST | `/v1/computers/register` | _(register_token only)_ | Body `{ register_token, display_name? }` |
| GET | `/v1/computers` | Bearer user token | Lists **your** computers only |
| POST | `/v1/computers/:id/revoke` | Bearer user token | Revokes |
| POST | `/v1/computers/:id/client_sessions` | Bearer user token | `{ client_token, expires_at, ws_url, gateway_url }` |
| * | `/v1/computers/:id/proxy/*` | Bearer `client_token` or user access token | HTTP gateway to remote `apps/api` (requires Server outbound WS) |

`tenant_id` in D1 = `sha256(user_access_token)` (hex). Possession of the token = identity; no account login.

## WebSockets

- **Server (Rust)** — `GET /ws/server?server_id=…` plus `Authorization: Bearer <server_secret>` (no secret in query).
- **Client (browser)** — `GET /ws/client?server_id=…&token=…&client_type=web`.

Envelope format between relay and upstream server matches `specs/APP/APP-016_atmos-computer/TECH.md` §4 (`v`, `kind`, `from`, `to`, `body`).

## `apps/web`

Set **`NEXT_PUBLIC_ATMOS_CP_URL`** to your Worker HTTPS origin (optional default for Settings → Atmos Computer). Users **generate or import** their own access token in Settings (never a shared operator key).

## `apps/api` (relay outbound)

Place `~/.atmos/relay_identity.json` (written by registering with the control plane) or set **`ATMOS_SERVER_IDENTITY_PATH`**. One-shot register on startup: **`ATMOS_REGISTER_TOKEN`** + optional **`ATMOS_CONTROL_PLANE_URL`**. Disabled with **`ATMOS_RELAY_DISABLE=1`**.

When present, API opens an outbound WebSocket and multiplexes relay client sessions through the existing `WsService` / `WsMessageService`.
