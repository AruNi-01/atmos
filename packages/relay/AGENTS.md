# Relay package (APP-016) - AGENTS.md

> **☁️ Atmos Computer edge**: Cloudflare Worker + D1 control plane + Durable Object relay. Browsers and remote clients connect here; **Atmos Server** (`apps/api`) connects **outbound** only.

---

## Build And Test

- **Dev**: `cd packages/relay && bunx wrangler dev`
- **Deploy**: `bunx wrangler deploy` (see [README.md](README.md), `.github/workflows/deploy-relay.yml`)
- **D1 migrate**: `bunx wrangler d1 migrations apply atmos-computer-cp --remote` (see `migrations/`)
- **Deploy script**: `scripts/relay/deploy.sh` (or `bun run deploy:relay` from `packages/relay`)
- **D1 manual cleanup**: `scripts/relay/d1-maintenance.sql` (run via D1 console or `wrangler d1 execute`)

---

## 📁 Layout

```
packages/relay/
├── src/
│   ├── index.ts          # Worker routes (control plane REST + WS upgrade)
│   ├── server-hub.ts     # Durable Object per server_id
│   ├── github-app.ts     # GitHub App OAuth/JWT/install token helpers
│   ├── github-webhook.ts # Webhook signature verification + normalization
│   ├── event-routes.ts   # GitHub setup, route CRUD, and matching
│   ├── event-dispatch.ts # ServerHub system envelope dispatch
│   └── delivery-state.ts # Provider-neutral delivery insert/update/ack helpers
├── migrations/         # D1 schema (tenants, computers, register_tokens, client_sessions)
├── wrangler.toml
└── README.md
```

---

## Auth model (M1)

| Credential | Holder | Use |
|------------|--------|-----|
| **Access Token** (Bearer) | User (Settings) | Control plane: issue register tokens, list computers, client sessions |
| `register_token` | One-time to VPS/CLI | `POST /v1/computers/register` only |
| `server_secret` | `~/.atmos/relay_identity.json` on Server | Outbound `GET /ws/server` |
| `client_token` | Browser/Desktop memory + `client-session.json` | Inbound `GET /ws/client` + `GET/POST …/v1/computers/:id/proxy/*` HTTP gateway |

Tenants use a stable opaque `tenant_id`; the Access Token is stored only as `tenants.access_token_hash`. `POST /v1/tenants/rotate_token` rotates the credential while preserving Computers. No global `CONTROL_PLANE_KEY` for end users.

---

## Integration with monorepo

| Component | Role |
|-----------|------|
| `apps/api/src/relay/` | Outbound WSS + inject frames into local `WsManager` |
| `crates/runtime-manager` | `register_computer()` HTTP client |
| `apps/web` | Settings → Atmos Computer; access token + connect via relay |
| `apps/cli` | `atmos computer register\|start\|status` |

Default control plane URL: `https://relay.atmos.land` (`ATMOS_CONTROL_PLANE_URL` override).

---

## Safety Rails

### NEVER

- Put Atmos business logic (projects, terminals, canvas) in the Worker — relay is routing + auth + presence only.
- Run automations, inspect local automation instructions, or decide whether a local automation is safe to execute.
- Log `server_secret`, `register_token`, raw Access Tokens, GitHub webhook secrets, private keys, OAuth codes, or installation tokens.

### ALWAYS

- Keep REST shapes aligned with [specs/APP/APP-016_atmos-computer/TECH.md](../../specs/APP/APP-016_atmos-computer/TECH.md).
- Keep GitHub trigger ingress aligned with [specs/APP/APP-019_github-automation-triggers/TECH.md](../../specs/APP/APP-019_github-automation-triggers/TECH.md).
- Run D1 migrations before deploy when schema changes.
- For provider ingress, verify webhook/auth first, normalize only small event metadata, match route metadata, dedupe delivery records, and dispatch a `stream: "system"` envelope to the target ServerHub.
- Use the user Access Token for control-plane route/setup mutations. The Computer `server_secret` is only for the outbound server WebSocket.

---

## Related

- [apps/api/AGENTS.md](../../apps/api/AGENTS.md)
- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
