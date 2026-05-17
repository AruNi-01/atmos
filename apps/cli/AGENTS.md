# CLI Tool (atmos) - AGENTS.md

> **🛠️ atmos CLI**: Host operations and **HTTP client** to the current Atmos Server — not a second data plane for review/canvas state.

---

## Build And Test

- **Dev**: `just dev-cli`
- **Build**: `just build-cli`
- **Install**: `just install-cli`
- **Test**: `cargo test -p atmos`

---

## 📁 Directory Structure

```
apps/cli/
├── src/
│   ├── main.rs
│   └── commands/
│       ├── runtime.rs     # atmos runtime ensure|stop|status
│       ├── local.rs       # alias → runtime (legacy JSON shape)
│       ├── computer.rs    # relay register + ensure API (APP-016)
│       ├── canvas.rs      # HTTP → /api/canvas/agent/invoke
│       ├── review.rs      # HTTP → /api/review/*
│       └── update.rs
└── Cargo.toml             # runtime-manager (supervisor + client)
```

---

## Commands vs architecture

| Command | Purpose |
|---------|---------|
| `atmos runtime` | **Preferred** — ensure/stop/status local API via `runtime-manager::supervisor` |
| `atmos local` | Back-compat wrapper around `runtime` |
| `atmos computer` | Register on control plane (`register_token`) + `ensure` API on this host |
| `atmos canvas` | Agent canvas control — resolves API URL via `resolve_api_base_url()` |
| `atmos review` | HTTP client to `/api/review/*` (same API base resolution as canvas) |

### API URL resolution (`runtime-manager`)

Global on every command: `atmos --api-url … canvas status` (also per-subcommand).

1. `--api-url` / `ATMOS_API_URL` (explicit override)
2. `~/.atmos/client-session.json` (only when UI is on **relay** — gateway + token)
3. `~/.atmos/runtime_manifest.json` (normal **local** path — API writes this on start)

Token: `--api-token` → `ATMOS_API_TOKEN` → `ATMOS_LOCAL_TOKEN` → `client-session.json` (`gateway_token`).

---

## Coding Conventions

- Subcommands return `serde_json::Value` printed from `main`.
- **Supervisor** spawns installed layout under `~/.atmos/runtime/current` (or dev paths) — same binary Desktop uses when bundled.
- Do not embed `core-service` / `infra` — all review/canvas state goes through the API.

---

## Safety Rails

### NEVER

- Duplicate `core-service` business rules in CLI.
- Assume global default `127.0.0.1` when UI context points at another Computer.
- Kill a shared API on unrelated command exit.

### ALWAYS

- Prefer `atmos runtime` over documenting raw `api` binary flags for users.
- Pass `extra_env` only through `EnsureOptions` when spawning (Desktop sets `ATMOS_DATA_DIR`).

---

## Related

- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
- [apps/api/AGENTS.md](../api/AGENTS.md)
- [apps/desktop/AGENTS.md](../desktop/AGENTS.md)
