# Plan-phase vs execution-todo probe results

Observation-only audit (2026-09-06). **Do not** broaden `PlanDocument` heuristics from this note.
`AgentToolKind::PlanDocument` stays **Cursor-only** (`createPlan` / `updatePlan` by name + ACP `cursor/create_plan`).

Live captures (anonymized): `src/providers/testdata/plan-probe/`.
Pinned CI fixtures remain under each provider’s `testdata/`.

## Inventory (Atmos Chat)

| Agent | Wire | Plan chrome |
|-------|------|-------------|
| Claude | Native stream-json | `--permission-mode plan`; Enter/ExitPlanMode |
| Codex | Native app-server | `collaborationMode: plan` on `turn/start` |
| OpenCode | Native HTTP+SSE | session agent/mode `plan`; tool `todowrite` / `plan` |
| Pi | Native JSONL RPC | No built-in plan/todo tool (extension optional) |
| Grok | Native ACP-shaped stdio | `--permission-mode plan` / `session/set_mode`; `enter_plan_mode` / `exit_plan_mode` + ExtMethod `_x.ai/exit_plan_mode` |
| Cursor | ACP (`cursor-agent acp`) | `--mode plan` / ACP mode=plan; `createPlan` / ExtMethod `cursor/create_plan` |
| Amp | ACP (`amp-acp`) | Experimental modes; no todo/plan in execute tool list |
| Gemini | ACP (`gemini --acp`) | CLI `--approval-mode plan` (read-only) |
| DeepSeek Harness | Custom ACP | Generic ACP kinds; no Cursor createPlan |
| Claude-ACP / Codex-ACP / Grok-build / Kimi / … | ACP registry | Same mapper as Cursor family unless overlay |

## Per-agent findings

| Agent | Plan-phase tools/events | Execution todo tools | Sample fields | Current Atmos mapping | Recommended mapping | Live probe? |
|-------|-------------------------|----------------------|---------------|----------------------|---------------------|-------------|
| **Cursor** | `createPlan` / `updatePlan`; print: `createPlanToolCall`; ACP ExtMethod `cursor/create_plan`; permission `Exit plan mode` | `updateTodos` (`_toolName`) | `name`, `overview`, `plan` (md), `todos[{id,content,status}]`, `isProject`, `phases[]` | **PlanDocument** by name; `updateTodos` → `Plan`/`PlanUpdated`; ExtMethod → ApprovalCard | Keep Cursor-only PlanDocument; no change | **Yes** (`--print --mode plan`) |
| **Claude** | `EnterPlanMode` / `ExitPlanMode` (`can_use_tool` with `plan` + `planFilePath`); permissionMode `plan` | `TodoWrite` (legacy fixture) **or** `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` (live 2.1.259 init) | Exit: `{plan, planFilePath}`; Task: `{subject, status?}` | Exit → PermissionRequested + plan md (**Hide** tool card); Task*/TodoWrite → `Plan`/`PlanUpdated`; Enter/Exit tool_use SyncModes | **Not** PlanDocument. Optional later: ExitPlan approval body as PlanDocument-*like* UI only if product wants Claude parity — by **tool name**, not input shape | Partial: init tools yes; turn **402** Insufficient Balance |
| **Codex** | Mode `collaborationMode.plan`; events `item` type `plan`, `turn/plan/updated`, `item/plan/delta` | Same plan list is execution progress (`[{step,status}]`) | `plan: [{step, status}]`; item `{type:plan,text}` | `PlanUpdated` (not PlanDocument) | Keep fold-plan. Do **not** treat as PlanDocument | Partial: `codex exec` prose only; structured events from **fixtures** `turn-tools.jsonl` |
| **Grok** | `enter_plan_mode`, `exit_plan_mode`; ExtMethod `_x.ai/exit_plan_mode` `{planContent\|plan}`; writes `plan.md` via `write` | `todo_write` | Exit ExtMethod: `planContent` md; tool companion often empty `rawInput` | Exit ExtMethod → PermissionRequested; companion tool **Hide**; `todo_write` → Plan | **Not** PlanDocument. If UI wants document view, map ExtMethod markdown only (already ApprovalCard `plan`) | **Yes** (`grok --permission-mode plan --output-format streaming-json -p`) |
| **OpenCode** | Session mode/agent `plan` (options) | `todowrite` (`todos[{content,status,priority}]`); name `plan` also classified Plan | No overview/name/plan-md on live todowrite | `ClassifiedTool::Plan` → `PlanUpdated` | Keep. Even if `plan` markdown appears on todowrite, **not** PlanDocument (existing unit test) | **Yes** (`opencode run --format json`) |
| **Pi** | None built-in (model said “No plan tool”) | None observed | Built-ins: read/bash/edit/write | Would fold if a todo-named tool appeared | No PlanDocument. Optional extension tools: observe before mapping | **Yes** — no plan tool |
| **Amp** | None in execute tool inventory | `Task` present (subagent-like), no TodoWrite/createPlan | 35 tools listed at init | Generic ACP classify | Do not invent PlanDocument from Task | Init only; ChatGPT auth error |
| **Gemini** | CLI `--approval-mode plan` (read-only) | Unknown (auth blocked) | — | Generic ACP | Re-probe after Antigravity migration | **No** — IneligibleTierError |
| **DeepSeek / other ACP** | No Cursor createPlan | Often todos-shaped or kind+title | `kind_title_content.json` | Fold Plan / Other by name | Name-gated only if a vendor ships an explicit createPlan-equivalent | Fixtures only |

## Live probe notes

- **Cursor**: Forced `createPlan` with full schema; also emitted `interaction_query` `createPlanRequestQuery` (approve gate in print stream). ACP Chat path uses ExtMethod `cursor/create_plan` (see `acp_client/client.rs`).
- **Grok**: `enter_plan_mode` → writes plan file → `exit_plan_mode` auto-completed in print stream. Chat stdio expects inbound `_x.ai/exit_plan_mode` (fixture `exit_plan_mode.json`).
- **OpenCode**: Called `todowrite` twice as execution checklist while refusing to write files — confirms todos ≠ plan document.
- **Claude**: Live init under `--permission-mode plan` lists `TaskCreate*` and **omits** `TodoWrite` / `EnterPlanMode` / `ExitPlanMode` from the tool array (already in plan). ExitPlan still appears as `can_use_tool` in fixtures when leaving plan.
- **Codex**: `exec --json` returned assistant prose plan only; structured plan items need app-server + collaboration plan (documented in `codex/testdata/README.md`).

## Mapping rules (current code)

- `map/classify.rs`: `is_plan_document_label` → `PlanDocument`; todo/task labels + `todos[]` / `entries` → `Plan`; exit-plan labels → `Hide`.
- Providers fold `ClassifiedTool::Plan` → `AgentEvent::PlanUpdated`; `PlanDocument` → tool card `AgentToolKind::PlanDocument`.
- **Forbidden**: classifying PlanDocument from `plan`+`todos` input shape alone (Amp/OpenCode/Claude would mis-label).

## Recommended next steps (no broad heuristics)

1. **Cursor** — done; keep name + ExtMethod only.
2. **Grok** — keep ExitPlan as ApprovalCard; do not promote `todo_write` or plan.md `write` to PlanDocument.
3. **Claude** — keep Task*/TodoWrite as PlanUpdated; ExitPlan as permission. Only if product wants a document card: gate on `ExitPlanMode` / EnterPlan **by name**.
4. **Codex / OpenCode / Pi / Amp / Gemini** — no PlanDocument until a vendor ships an explicit createPlan-equivalent tool name or ExtMethod; re-probe Gemini/Amp when auth works; Codex app-server plan-mode live capture optional.
5. Do **not** commit classification changes from this probe; samples under `testdata/plan-probe/` are evidence only (no new unit tests required unless promoting a Cursor-parity name).
