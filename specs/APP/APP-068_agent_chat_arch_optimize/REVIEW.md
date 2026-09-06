# REVIEW · APP-068: Agent Chat Architecture Optimize - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-09-01  
**Review scope**: architecture review (primary) · quality review · secondary bug pass  
**Related code**: `crates/agent`, `crates/core-service/src/service/agent_chat`, `apps/api/src/api/ws`, `packages/api-types/src/ws/dto/agent-chat.ts`, `apps/web/src/features/agent`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-006**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Architecture match (this pass)

Layers match [TECH.md](./TECH.md) overview: web → `/ws` `agent_chat_*` → `apps/api` DTO map → `AgentChatService` persist/fold → `crates/agent` domain + `providers/{claude,codex,opencode,pi,acp}`. Vendor wires stay off the browser. Tools are `kind` + `params` + `result`. `get` does not spawn. Chat spawn overrides Terminal argv; `resources/terminal-agents/builtin_agents.json` params were not rewritten for Chat.

| Contract | Spec source | Implementation | Match |
|----------|-------------|----------------|-------|
| Descriptor 4-field + closed capabilities | TECH / descriptor.md | `domain/descriptor.rs` | Yes |
| Runtime `send`/`cancel`/`close`/`action(AgentAction)` | TECH / runtime.md | `domain/session.rs`, `action.rs` | Yes (`action` returns `AgentActionError`, not `AgentResult`) |
| Events tagged Atmos; sequence host-only | events.md | domain envelope has no sequence; `apply_event` stamps WS seq | Yes vs events.md; parent TECH envelope now matches (`payload`, no timestamp) |
| Tools no dual-write | tools.md | `AgentTool`; persist `TranscriptEvent::ToolCall` | Yes |
| Native four + ACP else | TECH / acp-adapter.md | `chat_provider_kind` + factory | Yes (alias fold; TECH table updated) |
| Steer honesty | TECH matrix | `capabilities_for_provider` canonicalizes first | Yes including `codex-acp` / `pi-acp` |
| Persist files, no SQLite chat, no old jsonl migrator | persistence.md | `meta.json` + `transcript.jsonl` | Yes |
| WS names frozen; `applied_*` persist-only | ws-contract.md | `AgentChatMetaWire` | Yes; envelope `turn_id` on Rust+TS |
| Web reads Atmos only | web.md | `part.kind` / `meta.descriptor` | Yes; probe remnants deleted |

No open P0/P1. REV-001–005 closed after Wave 11.

Verification gaps (not architecture mismatches): Live CLI spawn, dual-agent visual, agent-browser, Playwright optional smoke — see [TEST.md](./TEST.md) Coverage Status.

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P2 | docs | Parent TECH routing table omits alias fold | verified |
| REV-002 | P2 | backend | Crate-root Chat API does not re-export native providers | verified |
| REV-003 | P1 | backend | Capability helper ignores provider aliases | verified |
| REV-004 | P2 | api | WS `AgentChatEvent.turn_id` Rust/TS/spec disagree | verified |
| REV-005 | P2 | frontend | Dead vendor probe helpers still in the Chat tree | verified |

---

## REV-001 · Parent TECH routing table omits alias fold

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | docs |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Chat spawn canonicalizes ACP-era aliases (`claude-acp` → native Claude, `codex-acp` → Codex, `pi-acp` → Pi). That matches [reference/acp-adapter.md](./reference/acp-adapter.md) spawn routing. Parent [TECH.md](./TECH.md) and [reference/runtime.md](./reference/runtime.md) still show an exact-id `match` only. The implementation did not invent a third routing scheme; the overview docs were not updated.

### Evidence

- `specs/APP/APP-068_agent_chat_arch_optimize/TECH.md:143-150` — exact `"claude"|"codex"|"opencode"|"pi"` table.
- `specs/APP/APP-068_agent_chat_arch_optimize/reference/acp-adapter.md:79-87` — alias fold table.
- `crates/agent/src/providers/mod.rs:19-38` — `canonicalize_chat_provider_id` then `chat_provider_kind`.

### Required fix

Update parent TECH and `runtime.md` routing sections to the acp-adapter alias table (or explicitly say “exact id after canonicalize”). Do not add a second router.

### Acceptance

- [x] TECH / runtime.md routing text matches `canonicalize_chat_provider_id`.
- [x] `my-claude` / `grok` remain ACP in the same paragraph.

### Fix log

- 2026-09-01 - Parent updated TECH.md Provider routing table and runtime.md `chat_provider_kind` docs to the alias fold. S11 shares one canonicalize in `descriptor.rs`. Independent review pass.

---

## REV-002 · Crate-root Chat API does not re-export native providers

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

[TECH.md](./TECH.md) and [acp-adapter.md](./reference/acp-adapter.md) say the crate-root Chat API includes the four native providers plus `AcpAgentProvider`. `lib.rs` exports domain, catalog, manager, models, and `AcpAgentProvider` only. Factory construction uses `agent::providers::{claude,codex,opencode,pi}` — layering still works; the published Chat surface is narrower than TECH.

ACP session types are correctly *not* crate-root Chat types.

### Evidence

- `specs/APP/APP-068_agent_chat_arch_optimize/TECH.md:170`
- `crates/agent/src/lib.rs:36` — `pub use providers::acp::{AcpAgentProvider, AcpProviderParams}` only.
- `crates/core-service/src/service/agent_chat/acp_factory.rs` — imports native types from `agent::providers::…`.

### Required fix

Either crate-root `pub use` the four `*NativeProvider` types, or change TECH/acp-adapter to “natives live under `providers::`, crate-root is domain + ACP constructor only”.

### Acceptance

- [x] `lib.rs` Chat re-exports match the written TECH sentence.

### Fix log

- 2026-09-01 - S12 `lib.rs:37-40` crate-root `pub use` four NativeProviders. Review pass. `cargo check -p agent` / `core-service`.

---

## REV-003 · Capability helper ignores provider aliases

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Steer honesty is supposed to follow the same routing as spawn. `capabilities_for_provider_id` only treats canonical `"codex"` / `"pi"` as steer-supported. `chat_descriptor(provider_id)` and ACP `LazyAcpProvider::descriptor` pass the raw id. A chat created as `codex-acp` / `pi-acp` can have `descriptor.capabilities.steer = unsupported` until live `session.descriptor()` overwrites meta after spawn. Composer and `AgentChatService::steer` both gate on that field, so the first session can hide or reject steer even though the native adapter supports it.

This is an architecture miss: capability SOT helper is not composed with `canonicalize_chat_provider_id`.

### Evidence

- `crates/agent/src/domain/descriptor.rs:62-72` — match `"codex" | "pi"` only.
- `crates/core-service/src/service/agent_chat/types.rs:97-105` — `chat_descriptor` uses raw `provider_id`.
- `crates/core-service/src/service/agent_chat/acp_factory.rs:204-211` — Lazy ACP descriptor uses `capabilities_for_provider_id(&self.id)`.
- `crates/core-service/src/service/agent_chat/service.rs:447-450` — steer Validation if capabilities.steer != Supported.
- Native constructors pass canonical ids (`capabilities_for_provider_id("codex")` in `providers/codex/mod.rs`), so post-spawn live descriptor is honest.

### Required fix

Route `capabilities_for_provider_id` through the same canonicalize function as `chat_provider_kind` (or call `chat_provider_kind` and map kind → capabilities). Keep `grok` / `my-claude` unsupported for steer.

### Acceptance

- [x] `capabilities_for_provider_id("codex-acp")` and `("pi-acp")` equal the canonical Codex/Pi capability structs.
- [x] `capabilities_for_provider_id("my-claude")` stay steer unsupported.
- [x] Targeted test in `descriptor.rs` (`capabilities_canonicalize_aliases_before_honesty_matrix`).

### Fix log

- 2026-09-01 - S11: `canonicalize_chat_provider_id` in `descriptor.rs`; `chat_provider_kind` calls it. Review pass. `cargo test -p agent --lib domain::descriptor`.

---

## REV-004 · WS `AgentChatEvent.turn_id` Rust/TS/spec disagree

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Host live events are one observation with host `sequence`. [events.md](./reference/events.md) includes `turn_id` on the WS envelope. [ws-contract.md](./reference/ws-contract.md) says the envelope stays `{ chat_id, event_id, sequence, payload }`. Rust `AgentChatEvent` has optional `turn_id`. TypeScript `AgentChatEvent` does not. Web Chat fold does not read envelope `turn_id` (payloads still carry turn ids where needed). Not a live composer break; it is a three-way contract split.

### Evidence

- `specs/APP/APP-068_agent_chat_arch_optimize/reference/events.md:22` — emit `{ chat_id, event_id, sequence, turn_id, payload }`.
- `specs/APP/APP-068_agent_chat_arch_optimize/reference/ws-contract.md:218` — envelope unchanged without `turn_id`.
- `crates/core-service/src/service/agent_chat/types.rs:1088-1095`
- `packages/api-types/src/ws/dto/agent-chat.ts:454-459`

### Required fix

Pick one envelope: add `turn_id?: string | null` to the TS DTO and ws-contract, or strip it from Rust and events.md. Re-extract `@atmos/api-types` if the wire type changes.

### Acceptance

- [x] events.md, ws-contract.md, Rust `AgentChatEvent`, and TS `AgentChatEvent` list the same fields.
- [x] `bun run --filter @atmos/api-types test` green after any DTO change.

### Fix log

- 2026-09-01 - Parent updated ws-contract.md envelope. S13 added `turn_id?: string | null` on TS `AgentChatEvent`. Review pass. 22 api-types tests.

---

## REV-005 · Dead vendor probe helpers still in the Chat tree

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Live SOT for background tools is `kind === "execute" && params.background`. Vendor adapter files were deleted. The Chat feature tree still contains unused helpers that sniff `input` / `output` / vendor envelopes (`commandFromProbe`, `deriveToolDisplayName`). They are not called on the live path today (`no-acp-schema` does not ban them). That is leftover mapper surface in the client, which [web.md](./reference/web.md) forbids as SOT.

### Evidence

- `apps/web/src/features/agent/lib/agent/background-command/utils.ts:30-38` — `commandFromProbe`.
- `apps/web/src/features/agent/lib/chat-helpers.ts:331` — `deriveToolDisplayName` (no live call sites under `features/agent`).
- `apps/web/src/features/agent/lib/agent/background-command/index.ts` — live helper uses Execute params.

### Required fix

Delete unused probe/display helpers or move them out of the Chat live tree. Extend `no-acp-schema.test.ts` if they must stay gone.

### Acceptance

- [x] No unused `input`/`output` sniffers under `apps/web/src/features/agent/lib` outside `__tests__` and the Terminal ACP allowlist.
- [x] `bun test` `no-acp-schema.test.ts` still pass.

### Fix log

- 2026-09-01 - S14 deleted `utils.ts`/`types.ts` and `deriveToolDisplayName`; `no-acp-schema` bans the symbols. Review pass.
