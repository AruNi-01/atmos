# Atmos Computer relay (APP-016 / APP-056)

Single Cloudflare Worker that provides:

- **Relay (D1)** — Hub-projected **devices**, register tokens, computer registration, listing, client session issuance
- **Relay (Durable Objects)** — one `ServerHub` DO per `server_id`; browser and Rust `apps/api` connect as WebSocket peers. One `PtDesignRoom` DO per Prototype Design share link (`/ws/pt-design/:roomId`) forwards encrypted collaboration frames only.
- **Provider ingress** — GitHub App webhook verification, route matching, delivery dedupe, and dispatch to an online Computer

## Identity model (APP-056)

| Concept | Owner | Notes |
|---------|--------|--------|
| **Hub user** | `packages/hub` (`hub.atmos.land`) | Better Auth `user_id` — sole product identity |
| **Device credential** | Hub-minted, shown once | Relay Bearer; stored hashed as `devices.credential_hash` |
| **Computers** | `user_id` rows in Relay D1 | Any active device of that user may manage |
| **Access Token / tenants** | **Removed** | No `POST /v1/tenants`, no user-generated access token |

Hub projects devices after enroll/rotate/revoke:

```http
POST /v1/internal/devices/upsert
Authorization: Bearer <RELAY_HUB_SYNC_SECRET>
```

End-user management APIs require:

```http
Authorization: Bearer <device_credential>
```

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

## One-time setup

1. Create D1 and apply schema:

   ```bash
   cd packages/relay
   npx wrangler d1 create atmos-computer-relay
   ```

   Put the returned `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_ID`).

2. Run migrations (in order), including APP-056 identity:

   ```bash
   npx wrangler d1 migrations apply atmos-computer-relay --remote
   ```

   Local: omit `--remote` or follow `wrangler d1` docs.

   Manual retention SQL (expired tokens, stale computers): [scripts/relay/d1-maintenance.sql](../../scripts/relay/d1-maintenance.sql)

### Private relay secret

By default, no Worker-wide secret is required for end users. Device credentials are minted on **Hub** and projected here.

For a private/self-hosted relay, set a Worker secret so unrelated clients cannot call management APIs without knowing the secret:

```bash
wrangler secret put RELAY_SECRET_KEY
```

When `RELAY_SECRET_KEY` is configured, protected relay REST requests must include:

```http
X-Atmos-Relay-Secret: <your secret>
```

This includes `POST /v1/computers/register`; the Atmos CLI/API read `ATMOS_RELAY_SECRET_KEY` and send it as the relay-secret header during registration.

Hub → Relay device projection uses:

```bash
wrangler secret put RELAY_HUB_SYNC_SECRET
```

(same value as Hub env `RELAY_HUB_SYNC_SECRET`).

### GitHub App secrets

APP-019 GitHub Automation Triggers require these Worker secrets/config values before webhook setup is usable:

```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put GITHUB_APP_PRIVATE_KEY
wrangler secret put GITHUB_APP_CLIENT_SECRET
```

Set non-secret app identifiers as environment variables or secrets according to the deployment environment:

- `GITHUB_APP_ID`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_SETUP_RETURN_ORIGINS` (optional comma-separated `http://`/`https://` origins allowed for GitHub setup return URLs; defaults cover `https://app.atmos.land` and local web dev on port 3030)

The production GitHub App webhook URL is `https://relay.atmos.land/v1/github/webhook`, and its callback URL is `https://relay.atmos.land/v1/github/callback`.

## Run locally

```bash
bunx wrangler dev
```

## Deploy

From `packages/relay`, after **Authenticate Wrangler**, **D1 id** in `wrangler.toml`, and **remote migration**:

```bash
scripts/relay/deploy.sh
# or (from packages/relay)
bun run deploy:relay
# or
bunx wrangler deploy
```

For a private relay, provide `RELAY_SECRET_KEY` before using the deploy script; it will write the Cloudflare Worker secret before deploying:

```bash
export RELAY_SECRET_KEY="your-private-relay-secret"
scripts/relay/deploy.sh
```

Use that HTTPS origin (production: **`https://relay.atmos.land`**) for **`NEXT_PUBLIC_ATMOS_RELAY_URL`** and as the base for `wss://` WebSocket URLs.

### Custom domain

This repo sets **`relay.atmos.land`** in `wrangler.toml` (`routes` + `custom_domain`). The **atmos.land** zone must be on Cloudflare.

### Deploy from GitHub Actions

Workflow: [`.github/workflows/deploy-relay.yml`](../../.github/workflows/deploy-relay.yml).

1. **Repository secret:** `CLOUDFLARE_API_TOKEN`
2. **Optional:** `CLOUDFLARE_ACCOUNT_ID`
3. **`wrangler.toml`** must contain a real **`database_id`**
4. **Triggers:** manual **Run workflow**, or push to **`main`** when files under **`packages/relay/`** change

D1 schema migrations are **not** auto-run in CI; apply when you change `migrations/`.

## HTTP API

All JSON. CORS `*` for dev. If `RELAY_SECRET_KEY` is configured, protected routes also require `X-Atmos-Relay-Secret` (except Hub internal routes, which use `RELAY_HUB_SYNC_SECRET`).

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/healthz` | _(none)_ | Liveness |
| POST | `/v1/internal/devices/upsert` | Bearer **Hub sync secret** | Project/revoke device row from Hub |
| POST | `/v1/register_tokens` | Bearer **device credential** | `{ register_token, expires_at, register_command }` |
| POST | `/v1/computers/register` | `register_token` + relay secret when configured | Body `{ register_token, display_name?, app_device_id }` |
| GET | `/v1/computers` | Bearer device credential | Lists computers for that Hub `user_id` |
| PATCH | `/v1/computers/:id` | Bearer device credential | Rename |
| POST | `/v1/computers/:id/revoke` | Bearer device credential | Revokes |
| POST | `/v1/computers/:id/client_sessions` | Bearer device credential | `{ client_token, expires_at, ws_url, gateway_url }` |
| * | `/v1/computers/:id/proxy/*` | Bearer `client_token` or device credential | HTTP gateway to remote `apps/api` |
| POST | `/v1/github/webhook` | GitHub `X-Hub-Signature-256` | Webhook ingress |
| POST | `/v1/github/setup_sessions` | Bearer device credential | GitHub App install setup state |
| GET | `/v1/github/callback` | GitHub OAuth callback + setup state | Stores installation for `user_id` |
| GET | `/v1/github/installations` | Bearer device credential | List installations for user |
| GET | `/v1/github/installations/:id/repositories` | Bearer device credential | List repos for installation |
| POST | `/v1/github/event_routes` | Bearer device credential | Upsert route metadata |
| DELETE | `/v1/github/event_routes/:route_id` | Bearer device credential | Disable route |

**Removed:** `POST /v1/tenants`, `POST /v1/tenants/rotate_token`.

## Prototype Design collaboration

`GET /ws/pt-design/:roomId` upgrades to a Durable Object room. The Worker never sees the room key or scene JSON — clients encrypt with the `#room=id,key` hash, same as Excalidraw's protocol.

```
wss://relay.atmos.land/ws/pt-design/<20-hex-room-id>
```

No device credential. Anyone with the room id can sit on the socket; the encryption key in the share link is what keeps the board private. Clients default to this relay origin and fall back to Excalidraw `oss-collab` if the room socket does not come up. Override with `NEXT_PUBLIC_PT_DESIGN_COLLAB_URL` / `PT_DESIGN_COLLAB_URL`.

## WebSockets

- **Server (Rust)** — `GET /ws/server?server_id=…` plus `Authorization: Bearer <server_secret>` (no secret in query).
- **Client (browser)** — `GET /ws/client?server_id=…&token=…&client_type=web`.

Envelope format between relay and upstream server matches `specs/APP/APP-016_atmos-computer/TECH.md` §4 (`v`, `kind`, `from`, `to`, `body`).

GitHub trigger dispatch uses a server-directed system envelope; see APP-019 / `event-dispatch.ts`.

## `apps/web` / Desktop

1. Sign in to **Hub** (`NEXT_PUBLIC_ATMOS_HUB_URL` → `hub.atmos.land`).
2. **Trust this device** (Settings → Account) — Hub mints device credential and projects it to Relay.
3. Credential is stored in `~/.atmos/credentials/computer-client.json` as `device_credential` and used as Relay Bearer.

Optional: `NEXT_PUBLIC_ATMOS_RELAY_URL` for private relay origin.

## `apps/api` (relay outbound)

Place `~/.atmos/credentials/relay_identity.json` (written by registering with the relay) or set **`ATMOS_SERVER_IDENTITY_PATH`**. One-shot register on startup: **`ATMOS_REGISTER_TOKEN`** + optional **`ATMOS_RELAY_URL`** + optional **`ATMOS_RELAY_SECRET_KEY`** for private relays. Disabled with **`ATMOS_RELAY_DISABLE=1`**.

When present, API opens an outbound WebSocket and multiplexes relay client sessions through the existing `WsService` / `WsMessageService`.
