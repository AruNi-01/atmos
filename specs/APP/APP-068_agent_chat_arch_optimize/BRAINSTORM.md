# Brainstorm · APP-068: Agent Chat Architecture Optimize

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-067 shipped Agent Chat as an Atmos-owned workspace: `chat_id`, file history, restore ≠ resume, main `/ws` `agent_chat_*`, ACP behind `AgentProvider`. That host is real.

What is still not Atmos-shaped:

- **Capabilities are a grab bag.** `AgentCapabilities` is three booleans. Model lists live in `AgentOptionsSnapshot`. Thinking lives in catalog *and* capabilities *and* builtin JSON. Live ACP `configOptions` leak onto `AgentChatMeta.session_config_options`. ACP `AgentCapabilitiesSnapshot` is a third dialect.
- **Tools are vendor JSON plus name heuristics.** The ACP adapter copies `raw_input` / `raw_output`. Rust `classify_tool` and web `classifyTool` duplicate alias tables. `parse-tool-result.ts` and `background-command/` adapters sniff Claude vs Grok vs fallback on the client.
- **Runtime grew by union.** `AgentRuntimeCommands` already has `prompt` / `steer` / `cancel` / `close` / `set_config` / `respond_permission`. Adding Codex fork, Pi compact, etc. the same way would recreate the 45-method interface the IDEA rejected.
- **Turn / Message / Part** are still easy to treat as a second SOT even though APP-067 TECH called them projections of `AgentEvent[]`.

Source prompt: [IDEA.md](./IDEA.md). Related: [APP-067](../APP-067_atmos_agent_abs/TECH.md).

## Goals (draft)

- Atmos owns the **observation model** (events + tools) and the **product control surface** (descriptor + small runtime). Native wires for Claude / Codex / OpenCode / Pi; ACP for other agents.
- Do **not** unify by taking the union of Claude + Codex + Pi + OpenCode abilities.
- Do **not** unify by taking only the intersection (`send` / `cancel` / events) if that hides product-needed steer, permission, model, thinking.
- Adding a new ACP agent should mean: descriptor spec + tool/event maps — not a new Chat path and not new UI parsers.
- Claude Code, Codex, OpenCode, and Pi Chat paths speak each vendor’s native protocol from Rust. ACP is for everyone else.

## Options

### 1. How wide is Runtime?

**A — Union interface.** `steer()`, `fork()`, `compact()`, `rewind()`, `approve()`, … on the trait.

Rejected. Most methods are `unsupported` on most agents. The trait stops meaning anything.

**B — Intersection only.** `start` / `send` / `cancel` / `subscribe`.

Too weak. Atmos Chat already needs steer, permission, resume, configure.

**C — Core ∩ + product Capability + native escape (preferred).**

```text
Core runtime: send, cancel, events, close
Product actions (closed set): Steer, RespondPermission, SetConfig
Native: stay in the adapter until Web / Desktop / CLI actually need them
```

### 2. How are optional abilities declared?

**A — String list** `capabilities: ["steer", "permission", …]`.

Easy to dump. Invites union-by-accident. Weakly typed in Rust.

**B — Closed `AgentCapabilities` struct (preferred).**

Each field is a product decision. Adapters fill it. Unknown vendor flags stay native.

**C — Giant `AgentRuntime` with default `unsupported`.**

Same as option 1A.

### 3. Identity vs ability vs configuration

Today these are mixed (`AgentCapabilities.thinking`, catalog models, leaked ACP options, `selected_model` on meta).

**Preferred split (from IDEA, kept):**

| Slot | Meaning |
|------|---------|
| `identity` | who this agent is |
| `capabilities` | what Atmos can *do* to it (steer, resume, configure, …) |
| `supported_options` | how the user may *configure* it (models, thinking, modes) |
| `current_config` | what is selected now |

Composer reads options + current config. Action chrome reads capabilities. Catalog prefetch fills `supported_options` before spawn.

### 4. Events: mirror the vendor, or observe for Atmos?

**A — 1:1 ACP / Codex / Pi events on the wire.** Status quo leak.

**B — JsonValue `data` plus `kind` string.** Flexible, every consumer re-parses.

**C — Tagged Atmos `AgentEvent` (preferred).**

Event is Atmos's observation model. Unmapped vendor events are dropped or one unknown event. No native sidecar on mapped events.

### 5. Tools: classify names, or contract params/results?

**A — Keep alias tables on Rust and TS; UI parses `input`/`output`.** Current pain.

**B — Kind only** (`read` / `execute` / …) with raw JSON still on the part.

Better labels, still vendor params.

**C — Atmos tool contract (preferred):** kind + `params` + `result`. Adapter is the only mapper. Typed cards when we understand the tool. Unknown tools are `other` whose params/result **are** the vendor input/output (one generic card). Never store typed fields and a parallel native bag.

v1 types only the fields Chat already needs (path, command, url, query, background, diff stats, output text). Do not invent fields Atmos does not display.

### 6. Turn

**A — Nested Conversation → Turn → Message → Part as SOT.** Too many documents.

**B — Delete turn_id entirely.** Breaks steer match, queue dispatch, stop, usage grouping.

**C — Turn is a host control epoch, not a transcript entity (preferred).** Persistence is `Session` + `AgentEvent[]`. `turn_id` is the send→complete token APP-067 already uses. Messages/parts stay projections.

### 7. Persistence

IDEA sketched SQLite `agent_sessions` / `agent_events`. APP-067 already ships `~/.atmos/data/agent/chats/` (`meta.json` + `transcript.jsonl`).

**Preferred:** keep the file store. jsonl lines become the Atmos event envelope (tool contract as params/result). No chat tables in `atmos.db`.

### 8. Native vs ACP for Claude / Codex / OpenCode / Pi

**A — ACP for everyone.** Rejected for these four. Steer, Codex items/approvals, Pi RPC, OpenCode SSE are lossy or missing.

**B — Wrap TypeScript SDKs from Rust (NAPI / sidecar Node).** Rejected. Extra runtime, version skew, not how other native hosts do it.

**C — Speak published wires from Rust (preferred).** Spawn official binaries. Codex `app-server`, Claude stream-json+control, Pi `--mode rpc`, OpenCode `serve` HTTP+SSE. Fixture-test the codec. ACP remains for other registry agents.

## Key forks

| Fork | Preferred |
|------|-----------|
| Runtime width | Core ∩ + closed product actions + native |
| Capability encoding | Closed struct, not string list, not method union |
| Descriptor | identity / capabilities / supported_options / current_config |
| Events | Tagged Atmos kinds; no native sidecar on mapped events |
| Tools | Adapter-normalized params/result; other = vendor params/result once; web_search/fetch first-class |
| Old jsonl | None; new envelope only |
| Turn | Control epoch; event log is SOT |
| Storage | Keep APP-067 files |
| Action dispatch | Typed `AgentAction` enum, not `execute(name, json)` |
| Providers in this spec | Native Claude / Codex / OpenCode / Pi; ACP for others |

## Open questions

Resolved in PRD/TECH unless the product owner overrides:

- [x] Promote fork / rewind / compact / computerUse in v1? **No** — native until a surface needs them.
- [x] Move all of `parse-tool-result.ts` into Rust in v1? **No** — emit Atmos `result`; renderer switches on that. Vendor sniffing leaves the client.
- [x] Break APP-067 `agent_chat_*` CRUD? **No** — evolve payloads (descriptor, tool contract), keep actions.
- [x] Non-ACP providers in v1? **Yes for Claude Code, Codex, OpenCode, Pi (native wire).** Other agents stay ACP. Further natives are N3.
- [x] Web search / web fetch structured results in v1? **Yes** — first-class kinds + params/result (query + links, url + body). File-search hit lists and trees stay N1.
- [x] Old jsonl compatibility? **None.** New envelope only; no migrator, no remap-on-read.
- [x] Keep untyped `input`/`output` on the Atmos tool? **Only for `other`.** Mapped tools store typed params/result. `other` params/result *are* the vendor values. No parallel `native` bag.

## Ready to promote

- PRD: users get one composer (options from descriptor) and one tool/event language; Claude / Codex / OpenCode / Pi keep native host capabilities; other agents stay ACP; adding an agent does not add UI parsers; APP-067 Chat product behavior stays.
- TECH: `AgentDescriptor`, small `AgentRuntime` + `AgentAction`, Atmos tool contract, tagged events, new jsonl only, native adapters for the four mainstream agents, ACP adapter for the rest, web stops classifying vendor JSON.
