# runtime-manager

Local Atmos runtime: manifest discovery, relay identity, and optional process supervisor.

## Features

| Feature | Enables |
|---------|---------|
| `client` (default) | `runtime_manifest.json`, `relay_identity.json`, `register_computer` |
| `supervisor` | `ensure_running` / `stop_running` / `runtime_status` for `~/.atmos/runtime/current` or `ATMOS_RUNTIME_DIR` |

## Consumers

- `apps/api` — `client` only; writes manifest on startup
- `apps/cli` — `supervisor` + `client` (`atmos runtime`, `atmos computer`)
- `apps/desktop` — `supervisor` + `client` (shared API on launch)

## Manifest

`~/.atmos/runtime_manifest.json` — loopback `host` / `port` / `url` / `ws_url`. **No auth token** (local discovery only).
