# Applications Directory - AGENTS.md

> **🚀 Application entry points**: Thin shells around `crates/*` and shared packages. One **Atmos Server** (`apps/api`) per machine; apps differ by **how they launch and connect** to it.

---

## Architecture snapshot

```
                    ┌─────────────────────────────────────┐
                    │  packages/relay (control + WSS)      │
                    └──────────────▲──────────────────────┘
                                   │ outbound / client WSS
┌──────────┐  ensure/connect  ┌──┴──────────┐  manifest/WS
│ desktop  │ ────────────────►│  apps/api   │◄──────────── web
│ cli      │                  │ Atmos Server │
└──────────┘                  └──────▲───────┘
       │                             │
       └──── runtime-manager ────────┘
```

---

## 📁 Application list

| App | Role | AGENTS.md |
|-----|------|-----------|
| **api** | Atmos Server (HTTP/WS, relay ingest, manifest) | [api/AGENTS.md](api/AGENTS.md) |
| **web** | Next.js UI (loopback / relay) | [web/AGENTS.md](web/AGENTS.md) |
| **desktop** | Tauri shell; `runtime-manager` ensure shared API | [desktop/AGENTS.md](desktop/AGENTS.md) |
| **cli** | `atmos runtime`, `computer`, `canvas`, … | [cli/AGENTS.md](cli/AGENTS.md) |
| **docs** | Fumadocs site | [docs/AGENTS.md](docs/AGENTS.md) |
| **landing** | Marketing | [landing/AGENTS.md](landing/AGENTS.md) |

---

## Typical dev flows

```bash
bun install

# Web + API (two terminals or just dev-web + dev-api)
just dev-api          # loopback API + runtime_manifest.json
just dev-web          # localhost:3030 → API :30303

# Desktop (prepares binaries/runtime/current first)
just dev-desktop

# CLI
just dev-cli
atmos runtime ensure
atmos computer status
```

---

## Safety Rails

### NEVER

- Put business logic in apps — use `crates/core-service` (backend) or `packages/shared` (shared TS).
- Run a second ad-hoc API stack for Desktop only — use unified runtime.

### ALWAYS

- `workspace:*` for internal packages.
- Read the app-specific `AGENTS.md` before editing that app.

---

## Related

- Root: [../AGENTS.md](../AGENTS.md)
- [../crates/runtime-manager/AGENTS.md](../crates/runtime-manager/AGENTS.md)
- [../packages/relay/AGENTS.md](../packages/relay/AGENTS.md)
