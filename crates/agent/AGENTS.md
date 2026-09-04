# Agent Integration Crate - AGENTS.md

> **External Code Agent hosts**: Independent vertical crate. Chat talks to `AgentProvider`. Five native hosts plus ACP fallback. `AgentManager` still owns install, registry, and keyring.

Chat business rules (jsonl transcript, `/fork` `/rewind` intercept, `rewind_view`, sibling `chat_id`) live in `core-service` `AgentChatService`, not here. Honesty tables: [APP-068 TECH](../../specs/APP/APP-068_agent_chat_arch_optimize/TECH.md) and [APP-069 TECH](../../specs/APP/APP-069_agent_chat_hits_and_session_ops/TECH.md).

---

## Build And Test

- **Build**: `cargo build -p agent`
- **Test**: `cargo test -p agent` or `just test-rust`
- **Lint**: `cargo clippy -p agent`

---

## Who talks to whom

```
apps/web  Agent Chat panel (composer, session-op card, hits)
  → main /ws  agent_chat_*   (no REST chat)
apps/api  WsAction / DTO
  → core-service  AgentChatService
       intercept native /fork|/rewind on send (do not persist as user text)
       fold rewind_view; fork = vendor session first, then sibling chat_id
  → crates/agent  AgentProvider
       contract/    AgentProvider, AgentEvent, AgentAction, descriptor
       policy/      canonicalize, honesty tables, Atmos permission map
       map/         classify_tool + JSON extractors (adapter-private)
       providers/   claude | codex | opencode | pi | grok | acp
       options/     Options probe + cache; snapshot → descriptor apply
       acp_client/  generic ACP stdio (Grok native reuses JSON-RPC framing)
       manager/     install / registry / keyring / Native tab
```

`apps/api` must not spawn CLIs or hold `AcpSessionHandle`. `AgentService` wraps `AgentManager` only (install/status/keys). Chat spawn goes through `DefaultAgentProviderFactory` in `core-service` (`agent_chat/acp_factory.rs`).

---

## Directory Structure

```
crates/agent/
└── src/
    ├── lib.rs                 # Public exports (contract + options + manager + native/ACP providers)
    ├── models.rs              # Install/registry models (AgentId, AgentLaunchSpec, …)
    ├── contract/              # Chat host contract: AgentProvider, AgentEvent, AgentAction
    ├── policy/                # Canonicalize, honesty tables, Atmos permission vocabulary
    ├── map/                   # Adapter-private classify_tool + JSON extractors
    ├── providers/
    │   ├── mod.rs             # chat_provider_kind after canonicalize
    │   ├── claude/            # stream-json + control (no --print)
    │   ├── codex/             # app-server JSON-RPC
    │   ├── opencode/          # HTTP + SSE (adapter-private)
    │   ├── pi/                # JSONL RPC
    │   ├── grok/              # grok agent stdio + _x.ai/* (not crate-root re-export)
    │   └── acp/               # generic ACP mapper (grok-build, gemini, cursor, custom)
    │       event_map.rs       # session events
    │       tool_map.rs        # protocol kind → extract fields → Other
    │       overlays/          # provider_id patches (deepseek, grok_acp)
    ├── options/               # OptionsProbe (run/plan + cli/acp/native); merge/cache/apply to descriptor
    ├── acp_client/            # ACP stdio process + JSON-RPC (not the Chat public API)
    ├── manager/               # AgentManager: npm, registry, binary, keyring, Native tab
    └── testing.rs             # test-support fakes (feature = "test-support")
```

Pinned CLI fixtures live under `providers/*/testdata/` (and `providers/acp/testdata/`). CI does not spawn live agent binaries.

---

## Spawn routing

`canonicalize_chat_provider_id` folds native synonyms (`claude-code` → `claude`), then `chat_provider_kind` picks the host. Exact id only — not argv, not parser. ACP registry ids are not folded.

| Canonical id | Kind | Wire |
|--------------|------|------|
| `claude` | Native | duplex `--input-format stream-json` |
| `codex` | Native | `codex app-server` + session `-c openai_base_url=""` (JSON-RPC) |
| `opencode` | Native | OpenCode HTTP + SSE |
| `pi` | Native | Pi JSONL RPC |
| `grok` | Native | `grok --permission-mode <selected\|default> agent stdio` (optional `--model` before `stdio`) + `_x.ai/*` |
| everything else | ACP | `acp_client` (`claude-acp`, `codex-acp`, `grok-build`, `gemini`, `cursor`, custom names) |

Built-in custom ACP agents that are **not** in the public ACP registry live in `manager/builtin_custom.rs` (currently `deepseek-harness` → `npx -y @deepseek-ai/dsh@… --profile acp`). They always appear in `list_custom_agents`. Chat picker and options probe them only after the Custom tab switch is on (`enabled` in the overlay; default off). Do not fold these ids into native. Token auth for DeepSeek is `DEEPSEEK_API_KEY`. The canonical secret lives in `~/.atmos/data/quota-usage/provider_config.json` (shared with AI Quota Usage). Spawn injects it as process env. A custom overlay env or process env still works as fallback; it is not the ACP `authenticate` / keyring path.

Chat native hosts (`claude` / `codex` / `opencode` / `pi` / `grok`) live in `manager/native_chat.rs`. They always appear in the Agent Manager Native tab. Chat picker and options probe them only after the Native tab switch is on (`enabled` in `acp_servers.json` `native_chat_agents`; default off). PATH presence is a badge only — it does not block the switch and does not install or remove ACP adapters. Native, ACP, and Custom lists stay independent; the Chat picker folds ACP aliases (`codex-acp` → `codex`) only when the matching native host is enabled.

Spawn does **not** fold ACP registry ids: `claude-acp` / `codex-acp` / `pi-acp` / `grok-build` / `grok-acp` stay ACP. Native synonyms that still fold: `claude-code` / `claude_code` → `claude`.

Do not change Terminal `resources/terminal-agents/builtin_agents.json` argv for Chat spawn.

Chat spawn overlays (session argv/`-c` only; never rewrite user toml):

| Host | Overlay | Why |
|------|---------|-----|
| **Codex** | `app-server -c openai_base_url=""`; `thread/start` `approvalPolicy` from Atmos permission (`ask_always` → `on-request`, `yolo` → `never`), `sandbox: workspace-write`; `thread/start` and `turn/start` send `model` (catalog/list default if spawn omitted it) | Atmos owns permission chrome and must not inherit a user `openai_base_url` gateway it does not control. Empty base URL is the published CLI ChatGPT-login path. 0.152.1 rejects a missing `model` field. |
| **Grok** | `--permission-mode <selected\|default>` **before** `agent` (not `grok agent --permission-mode`, which the CLI rejects). Still omit `--always-approve` / `--yolo` (Always approve is `--permission-mode bypassPermissions`). Mid-session: slash `/always-approve on\|off` and `/auto` via `session/prompt`; Plan/Normal via ACP `session/set_mode` (`plan`/`default`). Do **not** `session/set_config_option` permission aliases (Method not found). Advertise Yolo / Auto / Ask Always only (Accept edits is spawn-capable but has no mid-session slash). Session env `GROK_CURSOR_MCPS_ENABLED=0` and `GROK_CLAUDE_MCPS_ENABLED=0`. | Atmos owns permission chrome. Empty `session/new` `mcpServers` does not stop Cursor/Claude MCP ingestion (`compat.*.mcps` default on); HTTP MCP Connection refused / OAuth `AuthRequired` can fatal the stdio worker. |
| **Cursor (ACP)** | `cursor-agent acp` with optional parent flags `--yolo` (Run Everything) or `--auto-review` (Smart Auto) **before** `acp`. Do **not** `session/set_config_option` `permissionMode` / aliases — Cursor advertises `mode`/`model`/… only. Advertise Yolo / Auto / Ask Always (create-time CLI subset); never Accept edits. Mid-session permission has no ACP wire. Plan is `mode=plan`. | Guessing unknown configIds returns JSON-RPC `-32602`. Team policy may still force allowlist even with `--yolo`. |
| **Claude** | `--permission-prompt-tool stdio` + spawn `--permission-mode`; mid-session prefers control `set_permission_mode` but soft-fails must not break SetConfig / pending sync (Atmos chrome stays local). Do **not** ACP-guess `permissionMode` aliases for native `claude`. | Published default is Anthropic. Permission mode is a Chat flag, not a gateway wipe. |
| **Pi** | `--mode rpc` only | Host has **no** built-in tool-permission chrome. `--approve` / `-na` is project-file trust; RPC `extension_ui_request` `confirm` is extension UI only. |

---

## Coding Conventions

### Independence

- Independent of L1/L2/L3. Does **not** depend on `infra`, `core-engine`, or `core-service`.
- OpenCode HTTP and Grok `_x.ai/*` stay adapter-private. Do not leak vendor RPC types as Chat events.

### Public API

Chat callers use `AgentProvider` / `AgentRuntime` / `AgentAction`. ACP types stay in `acp_client` and `providers/acp`. Adapter classify/extract helpers stay in `map/` and are not crate-root API.

```rust
pub use agent::{
    AgentAction, AgentEvent, AgentProvider, AgentRuntime, AgentRuntimeControl,
    canonicalize_chat_provider_id, capabilities_for_provider,
    ClaudeNativeProvider, CodexNativeProvider, OpenCodeNativeProvider, PiNativeProvider,
    AcpAgentProvider, AgentManager,
};
use agent::providers::{chat_provider_kind, ChatProviderKind};
use agent::providers::grok::GrokNativeProvider; // not re-exported at crate root
```

`AgentAction` includes `Steer`, `SetConfig`, `RespondPermission`, `PrepareSessionOp`, `RespondSessionOp`. Fork Applied returns `new_session_id` (and optional `new_cwd`) via `AgentActionResult::forked`.

### Catalog

Natives use `NativeOptionsProbe` (`options/probe/native`). They skip `AcpOptionsProbe`. Grok native probe spawns `grok agent stdio` for slash commands (`initialize` `_meta` + `available_commands_update`); models still come from `grok models` CLI. Unknown / custom ids still probe ACP.

---

## Architecture Position

```
┌─────────────────────────────────────────────────────────┐
│                      apps/api                           │
│           WS agent_chat_*  →  AgentChatService          │
│           HTTP agent install  →  AgentService           │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  core-service (L3)                      │
│  AgentChatService  →  AgentProvider (this crate)        │
│  AgentService      →  AgentManager  (this crate)        │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐  ┌─────▼─────┐  ┌─────▼───────────┐
│    infra     │  │   core-   │  │     agent       │
│     (L1)     │  │  engine   │  │  (independent)  │
│ - DB         │  │ - PTY     │  │ - AgentProvider │
│ - Cache      │  │ - Git     │  │ - natives + ACP │
│              │  │ - FS      │  │ - AgentManager  │
└──────────────┘  └───────────┘  └─────────────────┘
```

Crate independence (no `agent` → L1/L2/L3) is [ADR-002](../../docs/adr/002-agent-crate-positioning.md). Chat runtime is `AgentProvider`; the ADR’s old `acp_client`-only tree is historical.

---

## Safety Rails

### NEVER

- Depend on `infra`, `core-engine`, or `core-service`.
- Put Chat transcript / `chat_id` / `rewind_view` / sibling-fork business rules here — that is `AgentChatService`.
- Expose ACP or vendor RPC types as Chat events (`AgentEvent` only).
- `git checkout`, `git worktree`, or restore workspace files for Chat rewind/fork. Grok worktree is `_x.ai/git/worktree/create` inside the Grok adapter only. Atmos never restores files.
- Add Cargo `xai-grok-*` (or embed Grok). Spawn the published `grok` CLI.
- Change Terminal `builtin_agents.json` argv to “fix” Chat spawn.
- Fold ACP registry ids (`claude-acp`, `codex-acp`, `grok-build`) into native spawn. Only native synonyms in `canonicalize_chat_provider_id` go native. Picker hide is UI-only.
- Omit Grok rewind `mode` (`conversation_only` | `files_only` | `all`). Omit defaults to `all` and restores files.
- Persist intercepted `/fork` `/rewind` as user messages (service send owns that).

### ALWAYS

- Route spawn with `chat_provider_kind` after native-only canonicalize.
- Map every vendor frame to `AgentEvent` (or skip / one `Unknown`).
- Keep ACP details in `acp_client/` + `providers/acp/`. Grok extension **wire** methods are `_x.ai/...` (underscore prefix).
- Store API keys in the system keyring via `manager/`.
- Pin native protocol fixtures under `providers/*/testdata/` with a CLI version note.

---

## Related

- [README.md](./README.md) (Chinese overview)
- [crates/core-service/AGENTS.md](../core-service/AGENTS.md) — `AgentChatService`
- [apps/api/AGENTS.md](../../apps/api/AGENTS.md) — `agent_chat_*` WS only
- [ACP spec](https://agentclientprotocol.com/)
