# APP-068 reference TECHs

Implementer-depth HOW docs for one slice each. Parent files stay the contract:

- [../PRD.md](../PRD.md) — WHAT / WHY (Must Haves M1–M16)
- [../TECH.md](../TECH.md) — locked architecture + index
- [../TEST.md](../TEST.md) — scenarios S1–S24
- [../BRAINSTORM.md](../BRAINSTORM.md) — rejected forks

These files are **sibling assets**, not new specs. Do not invent a second PRD. If a slice needs a product change, update `PRD.md` first.

## Index

| File | Slice | PRD |
|------|-------|-----|
| [descriptor.md](./descriptor.md) | Identity, capabilities, supported options, current config | M1–M4 |
| [runtime.md](./runtime.md) | Small runtime, `AgentAction`, provider routing, spawn override | M5, M15 routing |
| [events.md](./events.md) | Tagged Atmos events, unknown frames, envelope | M6 |
| [tools.md](./tools.md) | Kind / params / result, web_search / fetch, `other` | M7–M9, M11 |
| [persistence.md](./persistence.md) | Chat files, new jsonl only, restore ≠ spawn | M12 |
| [ws-contract.md](./ws-contract.md) | Keep `agent_chat_*`, evolve DTOs | M14 |
| [web.md](./web.md) | Composer + cards read Atmos only; delete client classifiers | M10 |
| [acp-adapter.md](./acp-adapter.md) | ACP mapper for every agent except the four natives | M10, remaining agents |
| [native-claude.md](./native-claude.md) | Claude Code stream-json + control | M15–M16 |
| [native-codex.md](./native-codex.md) | Codex `app-server` JSON-RPC | M15–M16 |
| [native-opencode.md](./native-opencode.md) | OpenCode `serve` HTTP+SSE | M15–M16 |
| [native-pi.md](./native-pi.md) | Pi `--mode rpc` JSONL | M15–M16 |

M13 (APP-067 product behavior unchanged) applies to every slice. N1–N5 stay deferred unless a slice names a seam.

## Locked decisions (do not reopen)

Copied from parent TECH so a slice author does not invent a fork:

- Runtime = `send` / `cancel` / `close` / `next_event` + typed `AgentAction` (`Steer`, `RespondPermission`, `SetConfig`). No `execute(name, json)`. No fork/rewind/compact in v1.
- Capabilities = closed struct (`steer`, `resume`, `permission`, `configure`). Send/cancel are core, not flags.
- Events = tagged Atmos kinds. No native sidecar on mapped events.
- Tools = `kind` + `params` + `result` only. Mapped tools drop unused vendor keys. Unmapped = `kind: other` whose params/result **are** the vendor values. Never dual-write.
- `web_search` ≠ workspace `search`. Thinking/plan fold in the adapter, not as tool kinds.
- Persistence = APP-067 files under `~/.atmos/data/agent/chats/`. No SQLite chat tables. No old-jsonl compatibility.
- Client ↔ Atmos = main `/ws` `agent_chat_*`. Vendor HTTP (OpenCode) is adapter-private on `127.0.0.1`.
- Native for `claude` / `codex` / `opencode` / `pi`. ACP for everyone else. No TypeScript SDKs in Atmos Server. No community ACP bridges on the Chat path.
- Chat native adapters **override spawn**. Terminal APP-024 keeps catalog argv (`claude --print`, `codex exec --json`, `opencode run`, `pi -p`).
- Atmos `turn_id` is the host control epoch. Adapters store vendor turn/thread ids internally.
- Atmos `queue.json` is the queue SOT. Do not also enqueue on Pi `follow_up`.
- Steer honesty: Codex + Pi supported; Claude Code + OpenCode unsupported (do not fake).

## Slice writing rules

- English. Real paths (`crates/agent/src/...`). Decisive.
- Research official protocol docs and how other native hosts parse **before** inventing a codec.
- Cite sources with URLs. Pin CLI/protocol versions used for fixtures.
- MUST implement vs MUST NOT tables. Unknown vendor methods must not crash the session.
- Fixture strategy: recorded frames in `crates/agent/src/providers/<id>/testdata/`.
- Do not implement production code in this pass.

## Implementation order (after all slices are reviewed)

1. Domain types (`descriptor` / `runtime` / `events` / `tools`)
2. Persistence + WS DTOs + web composer
3. ACP adapter (remaining agents)
4. Native adapters one provider at a time (fixtures green before spawn)
