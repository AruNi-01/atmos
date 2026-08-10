# CLI Tool (atmos) - AGENTS.md

> **🛠️ atmos CLI**: Host operations and **HTTP client** to the current Atmos Server — not a second data plane for product state.
>
> APP-058 adds an **agent-first product control plane**: typed L1 resources + `/api/cli/rpc` reusing `WsAction` handlers + JSON envelope.

---

## Build And Test

- **Dev**: `just dev-cli`
- **Build**: `just build-cli`
- **Install (cargo bin)**: `just install-cli` → `~/.cargo/bin/atmos`
- **Use local CLI**: `just use-local-cli` → release build + replace `~/.atmos/bin/atmos` (and `~/.cargo/bin` if present)
- **Test**: `cargo test -p atmos`

---

## 📁 Directory Structure

```
apps/cli/
├── src/
│   ├── main.rs
│   ├── envelope.rs        # APP-058 JSON envelope
│   ├── rpc.rs             # POST /api/cli/rpc client
│   ├── context.rs         # ~/.atmos/cli-context.json
│   ├── api_client.rs
│   └── commands/
│       ├── product.rs     # L1 project/workspace/terminal/…
│       ├── runtime.rs
│       ├── computer.rs
│       ├── canvas.rs
│       ├── review.rs
│       ├── desktop_use/
│       └── …
└── Cargo.toml             # thin client — no core-service
```

Agent skill (usage): `skills/atmos-cli/` → system skill `atmos-cli`.

---

## Commands vs architecture

| Surface | Purpose |
|---------|---------|
| `atmos` / `status` / `call` / `actions` | Discovery + RPC escape hatch |
| `project` `workspace` `group` `settings` `terminal` `run` `git` `context` | L1 product control via `/api/cli/rpc` |
| `atmos runtime` | Ensure/stop/status local Atmos Server |
| `atmos computer` | Relay registration + ensure API |
| `atmos canvas` / `review` / `desktop-use` / `browser-use` | Specialized tools (envelope-wrapped) |

### Atmos Server URL resolution (`runtime-manager`)

1. `--api-url` / `ATMOS_API_URL`
2. `~/.atmos/client-session.json` (relay)
3. `~/.atmos/state/runtime_manifest.json` (local)

Token: `--api-token` → `ATMOS_API_TOKEN` → `ATMOS_LOCAL_TOKEN` → `client-session.json`.

---

## Coding Conventions

- **JSON envelope always** for point-in-time commands (`ok`, `command`, `result`/`error`+`fix`, `next_actions`). Exit `0` iff `ok`.
- Product mutations go through `rpc::call_rpc` → `POST /api/cli/rpc` — never embed `core-service`.
- Destructive L1 deletes require `--yes`.
- Prefer extending L1 clap verbs over teaching agents raw wire actions.

---

## Safety Rails

### NEVER

- Duplicate `core-service` business rules in CLI.
- Assume global default `127.0.0.1` when UI context points at another Computer.
- Kill a shared Atmos Server on unrelated command exit.

### ALWAYS

- Prefer `atmos runtime` over documenting raw `api` binary flags for users.
- Pass `extra_env` only through `EnsureOptions` when spawning (Desktop sets `ATMOS_DATA_DIR`).

---

## Related

- [specs/APP/APP-058_agent-first-product-cli](../../specs/APP/APP-058_agent-first-product-cli/)
- [skills/atmos-cli](../../skills/atmos-cli/)
- [agents/references/cli-feature-versions.md](../../agents/references/cli-feature-versions.md)
- [crates/runtime-manager/AGENTS.md](../../crates/runtime-manager/AGENTS.md)
- [apps/api/AGENTS.md](../api/AGENTS.md)
