# Crates Directory - AGENTS.md

> **🦀 Rust layers**: `infra` → `core-engine` → `core-service` → consumed by `apps/api`. Capability and host/runtime crates are listed below.

---

## Layered stack

| Layer | Crate | AGENTS.md |
|-------|-------|-----------|
| L1 | `infra` | [infra/AGENTS.md](infra/AGENTS.md) |
| L2 | `core-engine` | [core-engine/AGENTS.md](core-engine/AGENTS.md) |
| L3 | `core-service` | [core-service/AGENTS.md](core-service/AGENTS.md) |
| Capability | `agent` | [agent/AGENTS.md](agent/AGENTS.md) |
| Capability | `llm` | [llm/AGENTS.md](llm/AGENTS.md) |
| Capability | `ai-usage` | [ai-usage/AGENTS.md](ai-usage/AGENTS.md) |
| Capability | `token-usage` | [token-usage/AGENTS.md](token-usage/AGENTS.md) |
| Capability | `local-model-runtime` | — |
| Capability | `tunnel-connector` | — |
| Host | `runtime-manager` | [runtime-manager/AGENTS.md](runtime-manager/AGENTS.md) |

Change flow: **infra → core-engine → core-service → apps/api**. Do not skip layers.

Inbound HTTP and browser WebSocket are both API entry concerns. `apps/api/src/api/ws` owns browser WebSocket connection management, protocol DTOs, action routing, and service/event adaptation. `infra` must not contain inbound WebSocket code.

---

## `runtime-manager` (local host)

Not part of the business stack — used by **`apps/api`** (manifest + relay identity), **`apps/cli`**, and **`apps/desktop`** to discover and optionally spawn the same loopback API. See [runtime-manager/AGENTS.md](runtime-manager/AGENTS.md).

---

## Safety Rails

### NEVER

- Import `apps/*` from `crates/*`.
- Put HTTP route handlers in crates (belongs in `apps/api`).
- Put inbound WebSocket handlers, connection managers, or browser WS protocol DTOs in `infra`.

### ALWAYS

- Open the crate’s own `AGENTS.md` before editing that crate.
