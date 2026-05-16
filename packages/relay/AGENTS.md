# Relay package (APP-016) - AGENTS.md

> **☁️ Atmos Computer edge**: Cloudflare Worker + D1 control plane + Durable Object relay. Browsers and remote clients connect here; **Atmos Server** (`apps/api`) connects **outbound** only.

---

## Build And Test

- **Dev**: `cd packages/relay && bunx wrangler dev`
- **Deploy**: `bunx wrangler deploy` (see [README.md](README.md), `.github/workflows/deploy-relay.yml`)
- **D1 migrate**: `bunx wrangler d1 migrations apply atmos-relay --remote`

---

## 📁 Layout

```
packages/relay/
├── src/
│   ├── index.ts        # Worker routes (control plane REST + WS upgrade)
│   └── server-hub.ts   # Durable Object per server_id
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

`tenant_id = sha256(access_token)`. No global `CONTROL_PLANE_KEY` for end users.

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
- Log `server_secret`, `register_token`, or raw Access Tokens.

### ALWAYS

- Keep REST shapes aligned with [specs/APP/APP-016_atmos-computer/TECH.md](../../specs/APP/APP-016_atmos-computer/TECH.md).
- Run D1 migrations before deploy when schema changes.

---

## Related

- [apps/api/AGENTS.md](../../apps/api/AGENTS.md)
- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
