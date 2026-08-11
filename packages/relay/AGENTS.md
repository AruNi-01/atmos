# Relay package (APP-016) - AGENTS.md

> **☁️ Atmos Computer edge**: Cloudflare Worker + D1 relay + Durable Object relay. Browsers and remote clients connect here; **Atmos Server** (`apps/api`) connects **outbound** only.

---

## Build And Test

- **Dev**: `cd packages/relay && bunx wrangler dev`
- **Deploy**: `bunx wrangler deploy` (see [README.md](README.md), `.github/workflows/deploy-relay.yml`)
- **D1 migrate**: `bunx wrangler d1 migrations apply atmos-computer-relay --remote` (see `migrations/`)
- **Deploy script**: `scripts/relay/deploy.sh` (or `bun run deploy:relay` from `packages/relay`)
- **D1 manual cleanup**: `scripts/relay/d1-maintenance.sql` (run via D1 console or `wrangler d1 execute`)

---

## 📁 Layout

```
packages/relay/
├── src/
│   ├── index.ts          # Worker routes (relay REST + WS upgrade)
│   ├── server-hub.ts     # Durable Object per server_id
│   ├── github-app.ts     # GitHub App OAuth/JWT/install token helpers
│   ├── github-webhook.ts # Webhook signature verification + normalization
│   ├── event-routes.ts   # GitHub setup, route CRUD, and matching
│   ├── event-dispatch.ts # ServerHub system envelope dispatch
│   └── delivery-state.ts # Provider-neutral delivery insert/update/ack helpers
├── migrations/         # D1 schema (devices, computers, register_tokens, client_sessions, github_*)
├── wrangler.toml
└── README.md
```

---

## Auth model (APP-056)

| Credential | Holder | Use |
|------------|--------|-----|
| **Relay secret** (`X-Atmos-Relay-Secret`, optional) | Private relay operator/user | Extra relay gate when `RELAY_SECRET_KEY` is set on a self-hosted Worker |
| **Hub sync secret** (Bearer on `/v1/internal/*`) | Hub Worker | Device upsert/revoke projection |
| **Device credential** (Bearer) | Hub-minted; Desktop/Web/Mobile store | `user_id` identity: register tokens, list computers, client sessions, GitHub control |
| `register_token` | One-time to VPS/CLI | `POST /v1/computers/register` only |
| `server_secret` | `~/.atmos/credentials/relay_identity.json` on Server | Outbound `GET /ws/server` |
| `client_token` | Browser/Desktop memory + `~/.atmos/state/client-session.json` | Inbound `GET /ws/client` + HTTP gateway |

There is **no** end-user `POST /v1/tenants` / Access Token model.

---

## Integration with monorepo

| Component | Role |
|-----------|------|
| `apps/api/src/relay/` | Outbound WSS + inject frames into local `WsManager` |
| `crates/runtime-manager` | `register_computer()` HTTP client |
| `apps/web` / `apps/mobile` | **Client SDK:** `@atmos/relay-client` (not this package) |
| `apps/cli` | `atmos computer start\|status` |

Apps **must not** import `packages/relay/src`. Shared REST shapes live in `@atmos/relay-client`.

Default relay URL: `https://relay.atmos.land` (`ATMOS_RELAY_URL` override). Self-hosted relays may set `RELAY_SECRET_KEY`; clients must then send `X-Atmos-Relay-Secret` on protected relay REST calls. Do not put that secret into WebSocket URLs; CLI/API registration should receive it through `ATMOS_RELAY_SECRET_KEY` or `--relay-secret-key`.

---

## Safety Rails

### NEVER

- Put Atmos business logic (projects, terminals, canvas) in the Worker — relay is routing + auth + presence only.
- Run automations, inspect local automation instructions, or decide whether a local automation is safe to execute.
- Log `server_secret`, `register_token`, raw device credentials, GitHub webhook secrets, private keys, OAuth codes, or installation tokens.

### ALWAYS

- Keep REST shapes aligned with [specs/APP/APP-016_atmos-computer/TECH.md](../../specs/APP/APP-016_atmos-computer/TECH.md).
- Keep GitHub trigger ingress aligned with [specs/APP/APP-019_github-automation-triggers/TECH.md](../../specs/APP/APP-019_github-automation-triggers/TECH.md).
- Run D1 migrations before deploy when schema changes.
- For provider ingress, verify webhook/auth first, normalize only small event metadata, match route metadata, dedupe delivery records, and dispatch a `stream: "system"` envelope to the target ServerHub.
- Use the Hub device credential for relay route/setup mutations. The Computer `server_secret` is only for the outbound server WebSocket.

---

## Related

- [apps/api/AGENTS.md](../../apps/api/AGENTS.md)
- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
