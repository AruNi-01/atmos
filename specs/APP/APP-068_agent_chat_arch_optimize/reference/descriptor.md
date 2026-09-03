# TECH · APP-068 reference · Descriptor

> Implementer HOW for identity / capabilities / supported_options / current_config.
> Contract: [../PRD.md](../PRD.md) M1–M4, [../TECH.md](../TECH.md) Descriptor + capability honesty.
> Do not implement production code from this file.

## Scope summary (M1–M4)

Ship one Atmos `AgentDescriptor` as the Chat product surface. Composer, catalog picker, steer chrome, and `agent_chat_configure` read **only** this object.

- **M1** — One descriptor: `identity` + `capabilities` + `supported_options` + `current_config`.
- **M2** — Closed `AgentCapabilities`: `steer`, `resume`, `permission`, `configure`. Send / cancel / subscribe are core runtime, not flags.
- **M3** — Options ≠ capabilities. Missing thinking / models / modes → omit the control. Never fake a list.
- **M4** — Selection is `current_config`. Live session may refresh options and config. Drop `meta.supports_steer` and `meta.session_config_options` as SOT.

Out of this slice: `AgentAction` dispatch (runtime.md), events/tools, native spawn. Native adapters **must** fill capabilities from the honesty matrix below when those slices land.

## Current state

Today Chat has no descriptor. Ability and config are split across four leaks:

| Leak | Path | Problem |
|------|------|---------|
| Thinking on capabilities | `crates/agent/src/domain/session.rs` `AgentCapabilities { supports_steer, supports_resume, thinking }` | Mixes a product verb with a config option. |
| Bool steer on meta | `crates/core-service/src/service/agent_chat/types.rs` `supports_steer`; copied in `service.rs` from `session.capabilities()` | Parallel SOT. Wire: `packages/api-types/src/ws/dto/agent-chat.ts`. |
| ACP option bag on meta | `session_config_options: Vec<SessionAdvertisedOption>` filled in `apply_event.rs` from `AgentEvent::ConfigChanged` | Composer prefers this bag over catalog (`use-agent-chat-session.ts` `configOptions`). |
| Selected fields on meta | `selected_model` / `selected_thinking` / `selected_mode` | Implicit “current” inferred beside the bag. |

Catalog already knows models / thinking / modes (`crates/agent/src/catalog/{engine,merge,acp_probe,spec}.rs`, `domain/model.rs`). ACP initialize still produces `AgentCapabilitiesSnapshot` (`session_list`, `session_resume`, `logout`, …) in `crates/agent/src/acp_client/{types,runner}.rs`. Web Chat **synthesizes** that snapshot in `use-agent-chat-session.ts` (`config_options.supported: configOptions.length > 0`). Composer (`AgentPromptComposer.tsx`) sniffs `configOptions` by id alias and still renders **extra** ACP selects (`extraConfigOptions`).

ACP Chat path hardcodes `supports_steer: false` and `supports_resume: true` (`providers/acp/adapter.rs`, `acp_factory.rs`) and never maps `session_resume` from the snapshot.

## Target design

```text
New Chat (no chat_id)
  agent_model_catalog_get → CatalogEngine → supported_options + default current_config
  capabilities_for_provider(id)           → closed capabilities
  registry name                           → identity

agent_chat_create
  write meta.descriptor (catalog + request current_config + capabilities)
  no spawn (APP-067)

Live session
  adapter may emit ConfigChanged
  core-service merges into meta.descriptor
  WS config_updated carries the full descriptor (not an option bag)
```

`AgentCapabilitiesSnapshot` stays inside `acp_client`. Chat maps **only** `session_resume.supported` → `capabilities.resume`. Do not map `session_list`, `session_close`, `logout`, `load_session`, `config_options`, `session_info_update`.

## Module / file layout

```text
crates/agent/src/domain/descriptor.rs     # NEW: types, merge, native capability table, serde tests
crates/agent/src/domain/session.rs        # delete AgentCapabilities; trait capabilities() → descriptor()
crates/agent/src/domain/mod.rs            # re-export descriptor
crates/agent/src/domain/model.rs          # unchanged AgentModel / AgentThinkingSupport / AgentMode
crates/agent/src/catalog/*                # unchanged probe; caller maps catalog → supported_options
crates/agent/src/providers/acp/adapter.rs # live resume overlay; descriptor() not snapshot
crates/agent/src/testing.rs               # stub descriptor
crates/core-service/.../agent_chat/types.rs   # meta.descriptor; drop wire SOT fields
crates/core-service/.../agent_chat/store.rs   # create writes descriptor
crates/core-service/.../agent_chat/apply_event.rs  # ConfigChanged → merge_live_* ; ConfigUpdated { descriptor }
crates/core-service/.../agent_chat/service.rs # steer gate; spawn copies runtime.descriptor()
crates/core-service/.../agent_chat/catalog.rs # optional helper: catalog → supported_options (or call domain)
apps/api/src/api/ws/message/agent_chat.rs     # pass-through; no new WsAction
packages/api-types/src/ws/dto/agent-chat.ts   # AgentDescriptor types; extract + contract
apps/web/.../use-agent-chat-session.ts        # meta.descriptor; drop session_config_options / supports_steer
apps/web/.../lib/agent-chat-thread.ts         # descriptorToComposerControls; catalogToSupportedOptions
apps/web/.../components/AgentPromptComposer.tsx  # model/thinking/mode from descriptor only; delete extraConfigOptions
```

No new crate. No REST. `agent_model_catalog_get` stays the prefetch API.

Trait change (this slice, so M1 is real):

```rust
// AgentProvider
async fn descriptor(&self, ctx: &AgentCatalogContext) -> AgentResult<AgentDescriptor>;
// AgentRuntime
fn descriptor(&self) -> AgentDescriptor;
```

Delete `capabilities()` on both traits.

## Data model

Serde: struct fields `snake_case`. `Capability` and thinking tagged enums `rename_all = "snake_case"`. Always emit all four capability fields.

```rust
// crates/agent/src/domain/descriptor.rs

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub id: String,                    // provider_id, e.g. "claude"
    pub name: String,                  // registry display name; fallback id
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,       // live initialize only; pre-spawn null
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    #[default]
    Unsupported,
    Supported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentCapabilities {
    pub steer: Capability,
    pub resume: Capability,
    pub permission: Capability,
    pub configure: Capability,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AgentSupportedOptions {
    #[serde(default)]
    pub models: Vec<AgentModel>,       // reuse domain/model.rs
    #[serde(default, skip_serializing_if = "AgentThinkingSupport::is_none")]
    pub thinking: AgentThinkingSupport,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modes: Vec<AgentMode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentCurrentConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentDescriptor {
    pub identity: AgentIdentity,
    pub capabilities: AgentCapabilities,
    pub supported_options: AgentSupportedOptions,
    pub current_config: AgentCurrentConfig,
}
```

Wire JSON (meta.json + `/ws`):

```json
{
  "identity": { "id": "claude", "name": "Claude Code" },
  "capabilities": {
    "steer": "unsupported",
    "resume": "supported",
    "permission": "supported",
    "configure": "supported"
  },
  "supported_options": {
    "models": [{ "id": "opus", "label": "Opus", "is_default": true }],
    "thinking": { "type": "enum", "arg": "--effort", "options": ["low", "high"] }
  },
  "current_config": { "model": "opus", "thinking": "high" }
}
```

When thinking is unsupported, **omit** `supported_options.thinking` (do not send `{ "type": "none" }` as a control). Empty `modes` omit the key. Empty `models` stay `[]` (honest “no list”, not “unknown”).

### Meta (persist + WS)

`AgentChatMeta` gains `descriptor: AgentDescriptor`.

**Drop from wire and as SOT:** `supports_steer`, `session_config_options`, `selected_model`, `selected_thinking`, `selected_mode`.

**Host-private only** (meta.json, not `packages/api-types` `AgentChatMeta`): `applied_model` / `applied_thinking` / `applied_mode` — last values actually given to the live process, for `pending_session_config_change` / session_config_change folds. Composer never reads them.

`ConfigUpdated` payload becomes `{ descriptor: AgentDescriptor }` only. No top-level `model` / `thinking` / `mode` / `config_options`.

ACP `SessionAdvertisedOption` remains an **adapter parse helper** inside `apply_event.rs` (or a private fn in `descriptor.rs`). It is not on Chat meta or the WS DTO.

### Native honesty → capabilities (locked)

`pub fn capabilities_for_provider(provider_id: &str) -> AgentCapabilities` in `descriptor.rs`:

| id | steer | resume | permission | configure |
|----|-------|--------|------------|-----------|
| `claude` | Unsupported | Supported | Supported | Supported |
| `codex` | Supported | Supported | Supported | Supported |
| `opencode` | Unsupported | Supported | Supported | Supported |
| `pi` | Supported | Supported | Supported | Supported |
| other (ACP) | Unsupported | Supported (pre-spawn default) | Supported | Supported |

`configure` means the adapter implements `SetConfig`, not “has options right now”. Empty pickers are M3.

ACP **live** overlay after initialize: `resume = snapshot.session_resume.supported ? Supported : Unsupported`. Never take steer from the snapshot. Never set steer true to mean “send another prompt” (`adapter.rs` today).

## Merge / honesty rules

Two phases. Do not reuse them interchangeably.

### Phase A — catalog (pre-spawn / New Chat)

Keep `merge_catalogs` in `crates/agent/src/catalog/merge.rs` (Config → CLI → ACP; live model ids win; config thinking fills when live probe omits).

```text
supported_options_from_catalog(catalog):
  models  = catalog.models
  thinking = catalog.thinking          # None → omit on the wire
  modes   = catalog.modes
```

`current_config` at create: request values if set; else default model (`is_default` or first), default mode, first enum thinking value if the control will show. Do not invent thinking when `is_none()`.

New Chat without `chat_id` reads **catalog**, not meta. `agent_model_catalog_get` status `probing` still drives `catalogModelsLoading`. Do not patch every existing chat on catalog prefetch.

### Phase B — live session overlay

Input: parsed known ACP/native options (model / models, mode / modes, thinking aliases already in `config_kind_matches` / `acp_probe.rs`). Unknown option ids stay in the adapter. They do **not** enter `supported_options` and do **not** become composer dropdowns.

`LiveOptionsPatch` is complete when any known option has a non-empty `options` list or boolean type (same trigger as today’s `merge_advertised_options`).

| Incoming | Models / modes | Thinking |
|----------|----------------|----------|
| Complete snapshot | replace that group from live | if thinking option **absent**, set `None` (omit control) even if catalog had it |
| Incomplete (`current_value` only) | keep lists; update `current_config` | keep thinking support |
| Live thinking `None` on a **complete** snapshot | — | omit (session advertised the truth) |
| Catalog-only, no live yet | keep phase A | keep phase A |

Pending user selection: if `current_config.model != applied_model` and live reports `applied`, **keep** `current_config` (today’s `keep_pending_session_selection`). Same for thinking / mode.

`agent_chat_configure` writes `current_config` immediately, then `SetConfig` when a runtime exists (runtime slice). Persist descriptor on meta; do not also keep `selected_*`.

### Composer read path

```text
chat exists?  descriptor.supported_options + descriptor.current_config
else          catalogToSupportedOptions(catalog) + local draft ids

thinking control  iff thinking.type === "enum" && options.length > 0
                  (per-model AgentModel.thinking wins when that model is selected)
                  None / encoded_in_model / manual / flag_only → omit Chat picker
                  (Manual stays Terminal APP-024 argv; do not fake a Chat enum)
model control     iff models.length > 0   — do not synthesize a one-item list from current_config
mode control      iff modes.length > 0
steer             iff capabilities.steer === "supported"
                  followup-policy: unsupported steer → queue (existing routeBusySubmit)
```

Delete `advertisedOptionsToConfigOptions` as SOT. Delete `extraConfigOptions`. Stop returning a fake ACP `AgentCapabilitiesSnapshot` from the Chat session hook; Chat header logout / session_list are not v1 capabilities.

## MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Closed four-field `AgentCapabilities` | `Vec<String>`, ACP snapshot on descriptor/meta, `capabilities.cancel` |
| Omit thinking key when `is_none()` | Fake `low/medium/high` or a thinking slider |
| Catalog before spawn; live may refresh | Dual-write `supports_steer` + `capabilities.steer` |
| Map ACP `session_resume` → `resume` only | Map logout / session_list / load_session onto Chat capabilities |
| Native steer: Codex + Pi only | Fake Claude Code / OpenCode steer with queue or interrupt |
| Composer reads descriptor (or catalog pre-create) | Client classifies ACP `configOptions` / extra vendor ids |
| `ConfigUpdated { descriptor }` | `config_options` bag on the Chat wire |
| Unknown ACP option ids stay adapter-private | Extra composer selects for those ids |
| Send/cancel always on the runtime trait | Capability flags for send/cancel |

Adding a capability field is a PRD change (N4), not a silent struct grow.

## Fixtures & tests

No vendor CLI spawn in this slice. Recorded ACP option JSON is enough.

| Id | Command | Assert |
|----|---------|--------|
| S1 | `cargo test -p agent descriptor` | Catalog + live patch → one `AgentDescriptor`; serde has no `session_list`; thinking omitted when None |
| S4 | same | Field list is exactly steer/resume/permission/configure (explicit assertion) |
| S5 | same | Models without thinking → `thinking.is_none()` |
| honesty | same | `capabilities_for_provider` matches the matrix (claude/opencode steer unsupported) |
| merge | same | Complete live snapshot without thinking **clears** catalog thinking; incomplete current_value keeps it |
| S6 | `cargo test -p core-service --lib agent_chat` | `agent_chat_configure` sets `meta.descriptor.current_config.model`; meta.json has no `session_config_options` / `supports_steer` |
| steer gate | same | `steer == Unsupported` → service error; queue/cancel still work (full `AgentAction` in runtime.md; this slice at least keeps the meta gate) |
| S2 | `bun test` `agent-chat-thread` + composer | Enum thinking shows; `none` + empty modes hide thinking and mode; no extra ACP selects |
| wire | `bun run --filter @atmos/api-types extract-actions` + dto test | `AgentChatMeta.descriptor`; no `supports_steer` / `session_config_options` / `selected_*` |

Put unit tests in `descriptor.rs` `#[cfg(test)]`. Do not add `testdata/` until a native adapter slice records frames.

## Rollout

1. **Domain** — add `descriptor.rs`, table, merge helpers, serde tests. Change traits. Stubs in `testing.rs`. No UI.
2. **core-service** — create/get/configure persist and return `descriptor`; ConfigChanged merge; drop bag/bool/selected from meta + `ConfigUpdated`. Update `agent_chat` tests.
3. **WS DTO** — `packages/api-types` + extract. Same `agent_chat_*` names.
4. **Web** — session hook + `agent-chat-thread.ts` + composer. Delete extra ACP selects and the synthetic snapshot.

No dual schema. Native adapters consume `capabilities_for_provider` when they land (do not wait for this slice to spawn CLIs).

Rollback: revert the four steps; APP-067 chats without descriptor are out of scope (no migrator).

## Sources (code paths)

- Capabilities mix thinking: `crates/agent/src/domain/session.rs`
- Catalog probe/merge: `crates/agent/src/catalog/{engine,merge,acp_probe,spec}.rs`, `domain/model.rs`
- ACP snapshot: `crates/agent/src/acp_client/types.rs` `AgentCapabilitiesSnapshot`; map in `acp_client/runner.rs` `map_agent_capabilities`
- ACP Chat defaults: `crates/agent/src/providers/acp/adapter.rs`, `crates/core-service/src/service/agent_chat/acp_factory.rs`
- Meta / advertised merge: `crates/core-service/src/service/agent_chat/{types,store,apply_event,service}.rs`
- WS DTO: `packages/api-types/src/ws/dto/agent-chat.ts`, `contract/agent-chat.ts`
- Composer: `apps/web/src/features/agent/components/AgentPromptComposer.tsx`, `hooks/use-agent-chat-session.ts`, `lib/agent-chat-thread.ts`, `lib/followup-policy.ts`
- Prefetch: `crates/core-service/src/service/agent_chat/catalog.rs` `builtin_catalog_specs`
- Honesty matrix: [../TECH.md](../TECH.md) “Capability honesty (locked)”
- Tests to satisfy: [../TEST.md](../TEST.md) S1–S6

## Open questions (only real conflicts)

None for v1. Catalog “live none keeps config thinking” vs Chat live “complete snapshot without thinking omits” is resolved as Phase A vs Phase B above, not a product fork.
