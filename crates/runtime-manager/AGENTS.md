# runtime-manager (L1.5 local host) - AGENTS.md

> **🖥 Local host glue**: Manifest discovery, relay identity, and optional API process supervisor. Not the in-process “agent runtime” — that lives in `crates/agent` / `apps/api`.

---

## Build And Test

- **Build**: `cargo build -p runtime-manager`
- **Test**: `cargo test -p runtime-manager`
- **Features**: `client` (default), `supervisor` (CLI + Desktop)

---

## 📁 Layout

```
crates/runtime-manager/src/
├── lib.rs           # Re-exports
├── manifest.rs      # ~/.atmos/runtime_manifest.json
├── client_state.rs  # ~/.atmos/local/state.json (relay hint from Web/Desktop)
├── identity.rs      # ~/.atmos/relay_identity.json
├── register.rs      # POST control plane /v1/computers/register
└── supervisor.rs    # ensure / stop / status (feature supervisor)
```

---

## Contracts

### `runtime_manifest.json`

- Written by **`apps/api`** on bind (`source: "api"`) or **`supervisor`** after `ensure` (`source: "runtime-manager"`).
- Fields: `api.host`, `api.port`, `api.url`, `api.ws_url`, optional `pid`, `started_at`, `source`.
- **No token** — loopback discovery only. Optional API hardening via `ATMOS_LOCAL_TOKEN` env (not in manifest).

### `local/state.json` (client session hint)

- **Local UI**: Web/Desktop **clears** this file; CLI uses `runtime_manifest.json`.
- **Relay UI**: client writes `{ connection_mode: "relay", server_id }` so CLI does not silently hit loopback.

### `relay_identity.json`

- Written by `register_computer()` after successful control-plane registration.
- Read by `apps/api` `relay/` module for outbound WSS to `packages/relay`.

### Supervisor

- Resolves install layout: `ATMOS_RUNTIME_DIR` or `~/.atmos/runtime/current` or bundled Desktop `runtime/current`.
- Spawns `bin/api` with `ATMOS_STATIC_DIR`, `ATMOS_CLI_BIN`, optional `extra_env` (e.g. Desktop `ATMOS_DATA_DIR`).

---

## Consumers

| Crate / app | Features used |
|-------------|----------------|
| `apps/api` | `client` — manifest write, relay register env token, read identity |
| `apps/cli` | `client` + `supervisor` — `atmos runtime`, `atmos local`, `atmos computer` |
| `apps/desktop` | `client` + `supervisor` — `src-tauri/src/runtime.rs` |

---

## Safety Rails

### NEVER

- Put business rules or DB access in this crate.
- Store secrets in `runtime_manifest.json`.
- Assume CLI always runs on the same machine as the API without checking **selected Computer** context (see APP-016 §8).

### ALWAYS

- Keep manifest schema version in sync with readers (`RUNTIME_MANIFEST_VERSION`).
- Use `resolve_api_base_url()` for CLI HTTP clients (`canvas`, etc.) instead of ad-hoc path logic.

---

## Related

- Spec: [specs/APP/APP-016_atmos-computer/TECH.md](../../specs/APP/APP-016_atmos-computer/TECH.md) §1.4
- [apps/api/AGENTS.md](../../apps/api/AGENTS.md) — `relay/`
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md) — control plane
