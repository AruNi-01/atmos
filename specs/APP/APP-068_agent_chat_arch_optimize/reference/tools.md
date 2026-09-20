# TECH · APP-068 slice: Atmos tool contract

> Implementer HOW for **kind + params + result**. Implements PRD M7–M9, M11 (M8 kinds; M10 UI is [web.md](./web.md); native vendor maps are `native-*.md` / [acp-adapter.md](./acp-adapter.md)). Parent lock: [../TECH.md](../TECH.md) “Tool contract”. Do not reopen dual-write, `web_search` = `search`, or thinking/plan as tool kinds.

## Scope summary

Replace today’s bag (`AgentToolCall.input` / `output` / `content` plus client `classifyTool`) with one Atmos observation per call. Addresses **M7, M8, M9, M11**. Does not own WS action names (M14 / [ws-contract.md](./ws-contract.md)), jsonl layout (M12 / [persistence.md](./persistence.md)), or vendor codecs (M15–M16). **N1** (workspace hit lists / file trees) stays `Text`.

## Today (bugs to close)

| Location | What is wrong |
|----------|----------------|
| `crates/agent/src/domain/tool_kind.rs` | `AgentToolKind` has no `WebSearch`. `classify_tool` maps `web_search` / `websearch` / `name.contains("web_search")` → **`Search`**. Unit test `"Web search"` expects `Search`. |
| `crates/agent/src/domain/event.rs` `AgentToolCall` | Stores `input` / `output` / `content`. No `params` / `result`. |
| `crates/agent/src/providers/acp/adapter.rs` `map_tool_call` | Copies `raw_input` → `input`, `raw_output` → `output`, ACP `content` → `content`. `ClassifiedTool::Thinking \| Plan \| Hide` collapse to `kind: Other` instead of folding. |
| `crates/agent/src/lib.rs` | Re-exports `classify_tool` as crate Chat API. `core-service` `apply_event.rs` / `store.rs` classify again when folding parts. |
| `packages/api-types/src/ws/dto/agent-chat.ts` | `AgentToolKind` missing `"web_search"`. `AgentPart` tool_call still `input`/`output`/`content`. |
| `crates/core-service/src/service/agent_chat/types.rs` `MessagePart::ToolCall` | Same bag. `deserialize_tool_kind` routes strings through `classify_tool`. |
| `apps/web/src/features/agent/lib/agent-tool-kind.ts` | Duplicates Rust `classify_tool`, including `web_search` → `"search"`. |
| `apps/web/src/features/agent/lib/tool-results/parse-tool-result.ts` | Sniffs `_toolName`, Claude envelopes, Grok banners to decide presentation. |
| `apps/web/src/features/agent/lib/agent/background-command/` | Vendor adapters (`adapters/claude.ts`, `adapters/grok.ts`) infer background from `input`/`output`. |

## Architecture

```text
vendor frame (ACP ToolCallUpdate | native item)
        │
        ▼
adapter tool_map  ──fold──► Thinking* / PlanUpdated / drop (Hide)
        │ typed
        ▼
domain/tool_map.rs extractors (path, command, url, query, links)
        │
        ▼
AgentTool { kind, params, result }     // NEVER + native bag
        │
        ▼
core-service fold → MessagePart::ToolCall { kind, params, result }
        │
        ▼
/ws agent_chat_event + agent_chat_get    // same AgentTool
        │
        ▼
web cards switch on kind + params/result
```

Touched: `crates/agent` domain + ACP `map_tool_call`; `crates/core-service/src/service/agent_chat/{types,apply_event,store}.rs`; `apps/api/src/api/ws/message/agent_chat.rs`; `packages/api-types/src/ws/dto/agent-chat.ts`; web consumers (delete classifiers — details in [web.md](./web.md)).

No new `WsAction`. No REST chat API.

## MUST / MUST NOT

| MUST | MUST NOT |
|------|----------|
| Persist **one** `params` and **one** `result` per `tool_call_id` (M7) | Dual-write typed fields **and** `input`/`output`/`content`/`native` |
| v1 kinds: `read`, `edit`, `delete`, `move`, `search`, `web_search`, `execute`, `fetch`, `skill`, `subagent`, `other` (M8) | Treat `web_search` as workspace `search` |
| Mapped: only fields the matching card shows; drop unused vendor keys (M9) | Kitchen-sink params (full vendor object + typed fields) |
| Unmapped: `kind: other`; `params`/`result` **are** vendor input/output once (M11) | Hide unknown tools; emit no card |
| Fold think / todo / `SwitchMode` in the **adapter** before `AgentEvent::ToolCall*` | `AgentToolKind::Thinking` or `Plan`; client `classifyTool` |
| `classify_tool` = adapter name fallback only | Public Chat API (`lib.rs` re-export); TS duplicate; `core-service` re-classify; `deserialize_tool_kind` via `classify_tool` |
| Add `WebSearch` to Rust + TS `AgentToolKind` | Infer kind from output banners (`Web Search Results for:`, `URL Content from:`) |
| Background execute: `params.Execute.background` + `task_id` | Client `background-command/adapters/*` as SOT |

## Data model

New files: `crates/agent/src/domain/tool.rs`, `crates/agent/src/domain/tool_map.rs`. Keep `tool_kind.rs` for `AgentToolKind` + `ClassifiedTool` + `classify_tool`. Replace `AgentToolCall` in `event.rs` with `AgentTool`. Events stay `ToolCallStarted \| Updated \| Completed \| Failed { tool_call: AgentTool }`.

Serde: kinds/status `rename_all = "snake_case"` strings. Params/result `#[serde(tag = "type", rename_all = "snake_case")]`. `kind` on `AgentTool` must match the params `type` (including `other`). Result may be `text` / `error` / `empty` / omitted while running without changing `kind`.

```rust
// crates/agent/src/domain/tool_kind.rs
pub enum AgentToolKind {
    Read, Edit, Delete, Move,
    Search,      // workspace grep / glob
    WebSearch,   // internet search  — ADD
    Execute, Fetch, Skill, Subagent,
    Other,
}

pub enum AgentToolStatus { Pending, Running, Completed, Failed }

// crates/agent/src/domain/tool.rs
pub struct AgentTool {
    pub tool_call_id: String,
    pub name: String,                 // vendor name; generic-card title fallback
    pub title: Option<String>,
    pub kind: AgentToolKind,
    pub status: AgentToolStatus,      // not Option<String>
    pub params: AgentToolParams,
    pub result: Option<AgentToolResult>,
}

pub enum AgentToolParams {
    Read { path: String, offset: Option<i64>, limit: Option<i64> },
    Edit { path: String },
    Delete { path: String },
    Move { from: String, to: String },
    Search { query: String, path: Option<String>, glob: Option<String> },
    WebSearch { query: String },
    Execute { command: String, cwd: Option<String>, background: bool, task_id: Option<String> },
    Fetch { url: String },
    Skill { skill: String },
    Subagent { description: String, agent_type: Option<String> },
    Other { value: serde_json::Value },  // vendor input as-is, once
}

pub struct WebSearchLink { pub url: String, pub title: String, pub snippet: Option<String> }

pub enum AgentToolResult {
    Text { text: String },
    FileContent { path: String, text: String },
    DiffStats { path: String, additions: u32, deletions: u32 },
    Execute { output: String, exit_code: Option<i32> },
    WebSearch { query: String, links: Vec<WebSearchLink> },
    WebFetch { url: String, title: Option<String>, markdown: Option<String>, text: Option<String> },
    Other { value: serde_json::Value },  // vendor output as-is, once
    Error { message: String },
    Empty,
}
```

Wire / TS (`packages/api-types/src/ws/dto/agent-chat.ts`), same tags:

```ts
export type AgentToolKind =
  | "read" | "edit" | "delete" | "move"
  | "search" | "web_search" | "execute" | "fetch"
  | "skill" | "subagent" | "other";

export type AgentToolStatus = "pending" | "running" | "completed" | "failed";

export type AgentToolParams =
  | { type: "read"; path: string; offset?: number | null; limit?: number | null }
  | { type: "edit"; path: string }
  | { type: "delete"; path: string }
  | { type: "move"; from: string; to: string }
  | { type: "search"; query: string; path?: string | null; glob?: string | null }
  | { type: "web_search"; query: string }
  | { type: "execute"; command: string; cwd?: string | null; background: boolean; task_id?: string | null }
  | { type: "fetch"; url: string }
  | { type: "skill"; skill: string }
  | { type: "subagent"; description: string; agent_type?: string | null }
  | { type: "other"; value: unknown };

export type AgentToolResult =
  | { type: "text"; text: string }
  | { type: "file_content"; path: string; text: string }
  | { type: "diff_stats"; path: string; additions: number; deletions: number }
  | { type: "execute"; output: string; exit_code?: number | null }
  | { type: "web_search"; query: string; links: Array<{ url: string; title: string; snippet?: string | null }> }
  | { type: "web_fetch"; url: string; title?: string | null; markdown?: string | null; text?: string | null }
  | { type: "other"; value: unknown }
  | { type: "error"; message: string }
  | { type: "empty" };

export type AgentTool = {
  tool_call_id: string;
  name: string;
  title?: string | null;
  kind: AgentToolKind;
  status: AgentToolStatus;
  params: AgentToolParams;
  result?: AgentToolResult | null;
};
```

`AgentPart` tool_call = those fields (no `input`/`output`/`content`/`native`). `agent_chat_event` `tool_call` is `AgentTool`. Optional `result` omitted (`null` / missing) while `pending`/`running`.

**Partial map (locked):** if kind is known but result links/body cannot be parsed, keep typed **params** and set `result: { "type": "text", "text": "…" }` (vendor output string once). Do **not** pair typed params with `result: Other`. Only the whole call falls to `other` when kind cannot be classified.

**Merge by `tool_call_id`:** later `Updated`/`Completed` replace `status` / `result`; replace `params` when the new params are typed or `Other`; keep prior params if the update omits them (streaming). Never merge a native sidecar. Kind may upgrade `other` → typed once; never `search` ↔ `web_search` after start; never downgrade.

Status map: ACP `in_progress`/`running` → `running`; missing start → `pending`; `completed` / `failed` as named.

### Worked JSON (copy these, do not keep the old bag)

Mapped execute (Claude `Bash` / Codex `commandExecution`):

```json
{
  "tool_call_id": "tc_1",
  "name": "Bash",
  "title": null,
  "kind": "execute",
  "status": "completed",
  "params": { "type": "execute", "command": "ls -la", "cwd": null, "background": false, "task_id": null },
  "result": { "type": "execute", "output": "README.md\n", "exit_code": 0 }
}
```

Unmapped (S9) — `value` **is** the vendor object; no second copy:

```json
{
  "tool_call_id": "tc_x",
  "name": "vendor_mystery",
  "kind": "other",
  "status": "completed",
  "params": { "type": "other", "value": { "opaque": true } },
  "result": { "type": "other", "value": { "n": 1 } }
}
```

Web search vs workspace search (S16): `kind` + params `type` stay aligned.

```json
{ "kind": "web_search", "params": { "type": "web_search", "query": "atmos acp" }, "result": { "type": "web_search", "query": "atmos acp", "links": [{ "url": "https://example.com", "title": "Example", "snippet": null }] } }
{ "kind": "search", "params": { "type": "search", "query": "AgentTool", "path": "crates/agent", "glob": null }, "result": { "type": "text", "text": "tool.rs:12: pub struct AgentTool" } }
{ "kind": "fetch", "params": { "type": "fetch", "url": "https://example.com/page" }, "result": { "type": "web_fetch", "url": "https://example.com/page", "title": "Example", "markdown": "# Hello", "text": null } }
```

## Mapping algorithm

Shared last-resort extractors — `crates/agent/src/domain/tool_map.rs` (not ACP-only):

| fn | Keys (first non-empty string / bool) |
|----|--------------------------------------|
| `extract_path` | `file_path`, `filePath`, `target_file`, `targetFile`, `absolute_path`, `path`, `file`, `filename`, `uri` (non-http), `dir_path` |
| `extract_command` | `command`, `cmd`, `script`, `bash`, `shell`; nested `args` / `parameters` / `input` / `{ type: "Bash", command }` |
| `extract_url` | `url`, `uri`, `href` if `https?://`; nested `action.url` |
| `extract_query` | `query`, `q`, `search_term`, `pattern`, `glob_pattern` |
| `extract_cwd` | `cwd`, `working_directory`, `workdir` |
| `extract_links` | arrays `links`, `results`, `sources` with `url`/`title`/`snippet` (or `description`) |
| `extract_background` | bool `run_in_background`, `is_background`, `background`; `task_id` / `taskId` from input or output |
| `extract_skill` | `skill`, `skill_name`, `name` when kind already Skill |
| `extract_subagent` | `description` + `subagent_type` / `agent_type` |

Native adapters (`providers/<id>/tool_map.rs`) map published item types first (parent tool table). ACP (`providers/acp/tool_map.rs`, called from `adapter.rs` `map_tool_call`):

1. **Fold** via `classify_tool` (name, title, raw_input): `Thinking` → `AgentEvent::ThinkingDelta` (text from `thinking_text`); `Plan` → `PlanUpdated`; `Hide` → drop. Do not emit `ToolCall*`.
2. Else start kind from ACP `ToolKind` when it is Read/Edit/Delete/Move/Execute/Fetch/Search. ACP has **no** WebSearch: names `web_search` / `websearch` / `WebSearch` **override Search → WebSearch**. `web_fetch` / `webfetch` / `WebFetch` → `Fetch`. Codex-style `action.type = search` → `WebSearch`; `open_page` / `openPage` / `find_in_page` → `Fetch`. Workspace `grep` / `glob` stay `Search` even if the query looks like prose.
3. Fill params via extractors. Vendor overlay on `provider_id` (e.g. Grok execute envelope) after generics.
4. If kind still unknown **or** required field missing (execute without command, fetch without url, read without path, web_search without query): `kind: Other`, `params: Other { value: raw_input }` (`{}` if none), `result` while running `None`; on complete `Other { value: raw_output }` or `Empty`.
5. Fill result from vendor output **without changing kind**: execute → `Execute { output, exit_code }`; fetch → `WebFetch` when title/body/markdown present else `Text`; web_search → `WebSearch { query, links }` when `extract_links` succeeds else `Text`; read → `FileContent` or `Text`; edit → `DiffStats` when counts known else `Text`; search (N1) → `Text`. Failed status → `Error { message }` if no better result.
6. Never set `input`/`output`/`content`/`native`. Keep vendor `name`/`title` for the generic heading.

`crates/agent/src/acp_client/client.rs` `format_tool_kind` stays ACP-internal (labels like `"Search"`). Chat kinds are Atmos snake_case from step 2–4, not those labels.

## `classify_tool` (adapter fallback only)

Keep in `tool_kind.rs`. **Fix the Search arm:** `web_search` / `websearch` / `contains("web_search")` → `WebSearch`. Add Hide for poll names `bashoutput` / `bash_output` / `taskoutput` / `task_output`. Flip the unit test `"Web search"` → `WebSearch`. Add `"Grep"` → `Search`, `"WebFetch"` stays `Fetch`.

`pub(crate)` (or `pub` inside `domain` but **drop** from `crates/agent/src/lib.rs`). `core-service` must not call it. `deserialize_tool_kind`: map unknown JSON strings to `Other` **without** classify; known snake_case includes `web_search`. New jsonl never stores `"Read"` / `"Bash"`.

Do **not** port this table to TypeScript. Live UI in [web.md](./web.md) switches on `part.kind`.

## Background execute

Mapped execute with a background flag:

```text
params: { type: "execute", command, cwd, background: true, task_id }
```

- Claude ACP/native: `run_in_background` → `background: true`; poll `BashOutput` is **Hide**; output merges onto the original execute `result` by adapter (not the client).
- Grok ACP: `is_background` / title `[bg]` → `background: true`; `task_id` from output; `TaskOutput` Hide + merge into the execute with that `task_id`.
- Dock: `apps/web/src/features/agent/components/BackgroundCommandsDock.tsx` reads `params.background` / `task_id` / `result`. **Delete** `apps/web/src/features/agent/lib/agent/background-command/adapters/{claude,grok,fallback}.ts` as SOT (folder goes away with [web.md](./web.md)).

## Persistence + service fold

`MessagePart::ToolCall` in `crates/core-service/src/service/agent_chat/types.rs`: drop `input`/`output`/`content`; add `params`, `result`. `store.rs` merge copies params/result (same `tool_call_id` rule as above). `apply_event.rs` `persist_tool`: if the event is already `Thinking*`/`PlanUpdated`, do not re-classify. Stop importing `agent::classify_tool`.

Pre-APP-068 jsonl is not a reader target (M12).

## Tests (S9 / S10 / S16)

Parent [../TEST.md](../TEST.md). Own these in `crates/agent` (`domain/tool_map.rs` + ACP `tool_map` / `map_tool_call`) plus a Bun card test for S9/S16 UI.

**S9 — Unknown tool is one generic card (M7, M11)**  
Given name `vendor_mystery`, input `{ "opaque": true }`, output `{ "n": 1 }`.  
Then `kind: other`, `params: { type: "other", value: { "opaque": true } }`, `result: { type: "other", value: { "n": 1 } }`. Serialized JSON has no `input`, `output`, `content`, `native`. Event is `ToolCallCompleted`, not dropped. Bun: one generic card pretty-prints those params/result.

**S10 — Execute params unify (M8/M9)**  
Given Claude-style `{ "command": "ls -la" }` (name `Bash`) and Codex/Grok-style `{ "type": "Bash", "command": "ls -la" }` (name `Tool` / `commandExecution`).  
Then both `params: Execute { command: "ls -la", background: false, .. }`. Fixture equality on `command`. Unused keys (`description`, aggregated vendor meta) dropped.

**S16 — web_search ≠ search; fetch first-class (M8, M9)**  
Given (1) `WebSearch` / `web_search` with query + `sources`/`links`; (2) `WebFetch` with url + body; (3) `Grep` with `pattern` + `path`.  
Then (1) `kind: web_search`, `params.query`, `result` `web_search.links` (or `text` if no links); (2) `kind: fetch`, `params.url`, `result` `web_fetch` title/body; (3) `kind: search`, **not** `web_search`. Bun card reads `result`, not `output`. Regression: `classify_tool("Web search")` is `WebSearch`; `classify_tool("Grep")` is `Search`.

Adjacent **S11** (think/todo): adapter emits thinking/plan events; no `AgentTool`. Covered here only as fold gate in `map_tool_call`.

Test homes (create with the domain PR):

- `crates/agent/src/domain/tool_map.rs` `#[cfg(test)]` — S9/S10/S16 extract + shape (no `input` key in `serde_json::to_value`).
- `crates/agent/src/domain/tool_kind.rs` — `classify_tool("Web search") == WebSearch`, `Grep == Search`, `BashOutput == Hide`.
- `crates/agent/src/providers/acp/` mapper test — `map_tool_call` / `tool_map` on a `ToolCallUpdate` with `raw_input` only (today’s `adapter.rs` path).
- Bun: `apps/web/src/features/agent/components/__tests__/agent-part-view.test.ts` (or successor) — `kind: "other"` one card; `kind: "web_search"` reads `result.links`.

Commands: `cargo test -p agent tool_map`; `cargo test -p agent classifies_common_tools`; `cargo test -p core-service --lib agent_chat` (S14). Native recorded frames stay under `crates/agent/src/providers/<id>/testdata/` ([native-claude.md](./native-claude.md) / [native-codex.md](./native-codex.md)); this slice’s fixtures are inline JSON in `tool_map.rs`.

## Rollout

1. Domain: `WebSearch`, `tool.rs`, `tool_map.rs`, `classify_tool` split, stop crate-root export. Unit tests S10/S16 kind + S9 shape. No UI.
2. ACP `map_tool_call` → `providers/acp/tool_map.rs`; fold think/plan/hide. Native slices reuse extractors.
3. Same PR: `MessagePart` + WS DTO `AgentTool` (drop bag fields). `apply_event` / `store` copy through.
4. Web cards + dock consume `params`/`result`; delete `classifyTool` live path and `background-command/adapters/*` ([web.md](./web.md)).

## Risks

- **Tradeoff: drop unused vendor keys on mapped tools.** Cards do not show them; storing `native` was the second copy. Extend the mapper when a new field is needed.
- **Risk: ACP `ToolKind::Search` for web search.** Name + `action.type` override is mandatory; S16 grep fixture must stay `search`.
- **Risk: poll tools as `other` cards.** Hide `BashOutput`/`TaskOutput` in `classify_tool` + adapter merge, or the dock double-counts.
- **Rollback:** revert domain + DTO together; old jsonl is already unsupported.
