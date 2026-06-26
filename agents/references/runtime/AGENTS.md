# Runtime Reference - AGENTS.md

Cross-cutting runtime guidance for Atmos agents. Load this when work touches local API discovery, Desktop/CLI runtime startup, relay identity, or Atmos Computer routing.

## When To Load

- Changing local runtime startup, shutdown, status, or supervision.
- Reading or writing `~/.atmos/runtime_manifest.json`.
- Reading or writing `~/.atmos/relay_identity.json`.
- Wiring Desktop, CLI, Web, or local web runtime to the shared `apps/api` process.
- Changing Atmos Computer relay registration, identity, or remote connection behavior.

## Unified Local Runtime

One `apps/api` process per machine is the default Atmos Server. Desktop, CLI, and the local web runtime installer are entry points, not separate API products.

| Piece | Location |
|-------|----------|
| Discovery | `~/.atmos/runtime_manifest.json` with `host`, `port`, `url`, and `ws_url`. It must not contain an auth token. |
| Relay credentials | `~/.atmos/relay_identity.json`, written after `atmos computer start --token` or `ATMOS_REGISTER_TOKEN`. |
| Process supervisor | `crates/runtime-manager` with the `supervisor` feature. Used by `atmos runtime ensure` and Desktop `runtime.rs`. |
| API self-describe | `apps/api` writes the manifest on bind and may start optional `relay/` outbound WebSocket when identity exists. |

## Auth Boundary

- `ATMOS_LOCAL_TOKEN` is optional loopback hardening only.
- Do not write `ATMOS_LOCAL_TOKEN` or any bearer token into `runtime_manifest.json`.
- Desktop and Web development must not require loopback auth by default.
- Atmos Computer remote access uses the user Access Token against Relay. The server-side `server_secret` stays in relay identity storage and must not be exposed to browser or mobile clients.

## Ownership

| Area | Owner |
|------|-------|
| Runtime manifest and relay identity helpers | `crates/runtime-manager` |
| Local API bind and manifest write | `apps/api` |
| Desktop ensure/start integration | `apps/desktop` |
| CLI runtime commands | `apps/cli` |
| Relay Worker, D1, Durable Object routing | `packages/relay` |
| Product-level Atmos Computer contract | `specs/APP/APP-016_atmos-computer/` |

## Related Files

- [../../../crates/runtime-manager/AGENTS.md](../../../crates/runtime-manager/AGENTS.md)
- [../../../apps/api/AGENTS.md](../../../apps/api/AGENTS.md)
- [../../../apps/desktop/AGENTS.md](../../../apps/desktop/AGENTS.md)
- [../../../apps/cli/AGENTS.md](../../../apps/cli/AGENTS.md)
- [../../../packages/relay/AGENTS.md](../../../packages/relay/AGENTS.md)
- [../../../specs/APP/APP-016_atmos-computer/TECH.md](../../../specs/APP/APP-016_atmos-computer/TECH.md)
