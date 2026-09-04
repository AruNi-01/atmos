# TEST · APP-069: Agent Chat hits, Grok, fork/rewind

> Test Plan · verify typed search hits, native Grok Chat host, native composer probe (M14), and native `/fork` `/rewind`. References PRD APP-069 and TECH APP-069.

## Test strategy

- **Rust unit** (`cargo test -p agent`) owns `descriptor.support`, capability fork/rewind, Grok thinking overlay, catalog strategy (natives skip ACP), `extract_search_hits`, native rewind/fork codecs from fixtures, Grok `x.ai/*` map.
- **Rust service** (`cargo test -p core-service --lib agent_chat`) owns send intercept (no persist `/rewind`), `rewind_view` fold, fork new `chat_id`, options_probe_spec_for natives `acp: false`.
- **api-types** owns DTO/contract for `support`, `search_hits`, `agent_chat_session_op_respond`.
- **Bun** owns composer pickers from `support` + `permission_modes`, search-hit card, session-op chrome above the prompt, slash intercept not in the composer.
- **Playwright** optional smoke only. Live CLI spawn is manual.
- **agent-browser** explores rewind options above the prompt and composer picker visibility. Not a substitute for mapper tests.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S3, S4 |
| M3 | S4 |
| M14 | S5, S6, S7, S8 |
| M4 | S9 |
| M5 | S10 |
| M6 | S11, S12 |
| M7 | S13 |
| M8 | S14 |
| M9 | S15 |
| M10 | S16 |
| M11 | S17 |
| M12 | S18 |
| M13 | S11, S19 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust + Bun | `cargo test`, `bun test` | `extract_search_hits` + search card | grep stdout `path:line:snippet` | `result.type === search_hits`; card lists path/line | covered |
| S2 | Rust | `cargo test` | search extract fail | unparseable stdout | stays `Text`; not mixed with `web_search` | covered |
| S3 | Rust | `cargo test` | `chat_provider_kind` | `grok`, `grok-build`, `grok-acp`, `codex-acp` | `grok` NativeGrok; ACP registry ids ACP | covered |
| S4 | Rust | `cargo test` | grok spawn argv | Chat spawn | `grok agent stdio`; no `streaming-json -p`; no `xai-grok-*` in Cargo.toml | covered |
| S5 | Rust | `cargo test` | `options_probe_spec_for` | claude/codex/opencode/pi/grok | `acp: false`; strategies include Native not Acp | covered |
| S6 | Rust | `cargo test` | Grok thinking overlay | models `grok-4.5`, `grok-4.6`, `grok-composer` | 4.5 three levels; 4.6 four with `xhigh`; composer none | covered |
| S7 | Rust | `cargo test` | ACP probe mapper | `permission_mode` config option | fills Atmos `permission_modes`; Claude `support.modes` and `support.permission_modes` both Supported | covered |
| S8 | Bun | `bun test` | `descriptorToConfigOptions` | support flags + lists | hidden when Unsupported or empty; `permission_mode` leading | covered |
| S9 | Bun | `bun test` | composer | Chat chrome | no standing Fork/Rewind buttons; `/` lists commands | covered |
| S10 | Rust + Bun | `cargo test`, `bun test` | ACP send `/rewind` | ACP available_commands | persisted as user prompt; no session-op chrome | covered |
| S11 | Rust | `cargo test` | Claude rewind | control fixtures | conversation and/or files; no summarize subtype | covered |
| S12 | Rust | `cargo test` | Codex rewind | app-server | conversation revert only; no Restore code option | covered |
| S13 | Rust | `cargo test` | failed rewind | vendor error | `rewind_view` unchanged; jsonl intact | covered |
| S14 | Rust | `cargo test` | OpenCode unrevert | revert then unrevert | jsonl still has later turns; view restores | covered |
| S15 | Rust | `cargo test` | rewind files | any native | Atmos does not `git checkout` / write workspace files | covered |
| S16 | Rust | `cargo test` | fork | vendor success | new `chat_id`, `parent_chat_id`; parent unchanged | covered |
| S17 | Rust | `cargo test` | Grok worktree fork | `x.ai/git/worktree/create` then fork | Atmos does not run `git worktree` | covered |
| S18 | api-types | `bun test` | contract | extract | still `agent_chat_*`; one new `agent_chat_session_op_respond`; no REST | covered |
| S19 | Rust | `cargo test` | Grok rewind mode | omit vs explicit | omit would be `all`; adapter always sends explicit snake_case | covered |

## Scenarios

### S1 — Happy path: grep becomes search hits

- **Level**: Rust + Bun
- **Given**: a native/ACP search tool result whose stdout has `path:line:snippet` lines.
- **When**: the adapter maps `AgentToolKind::Search`.
- **Then**: `AgentToolResult::SearchHits` with path, optional line, optional snippet; the search card renders those hits.
- **Signals**: result type `search_hits`; UI list items.

### S2 — Edge: unparseable search stays text

- **Level**: Rust
- **Given**: search stdout that is not hit lines.
- **When**: extract returns zero hits.
- **Then**: result stays `Text`. `web_search` is still links, never workspace hits.
- **Signals**: no `search_hits` variant.

### S3 — Grok Chat is a native host

- **Level**: Rust
- **Given**: provider ids `grok`, `grok-build`, `grok-acp`, `codex-acp`.
- **When**: `chat_provider_kind` runs.
- **Then**: `grok` is `NativeGrok`; `grok-build`, `grok-acp`, and `codex-acp` are ACP.
- **Signals**: enum match in `providers/mod.rs` tests.

### S4 — Grok spawn is stdio host, not crate embed

- **Level**: Rust
- **Given**: Chat create/send for `grok`.
- **When**: native spawn runs.
- **Then**: argv is `grok agent stdio` (optional `--model` before `stdio`). Not Terminal `streaming-json -p`. `crates/agent/Cargo.toml` has no `xai-grok-*`.
- **Signals**: spawn unit test; Cargo.toml grep.

### S5 — Natives are not ACP-probed

- **Level**: Rust
- **Given**: `options_probe_spec_for` after alias fold for claude/codex/opencode/pi/grok.
- **When**: prefetch builds the spec.
- **Then**: `acp` is false; strategies include `Native` and not `Acp`. Gemini/custom still `Acp`.
- **Signals**: `catalog.rs` tests.

### S6 — Grok thinking is pinned per model family

- **Level**: Rust
- **Given**: CLI models `grok-4.5`, `grok-4.6-preview`, `grok-composer-2.5-fast`.
- **When**: overlay runs.
- **Then**: 4.5 → `low|medium|high`; 4.6 → those plus `xhigh`; composer → no thinking list.
- **Signals**: overlay unit test.

### S7 — ACP permission mode is not dropped; Claude has one picker

- **Level**: Rust
- **Given**: ACP `config_options` with `permission_mode`; Claude option support table.
- **When**: `probe_result_from_config_options` / `option_support_for_provider("claude")`.
- **Then**: ACP fills Atmos `permission_modes` (`default`/`on-request`/`ask` → `ask_always`; `acceptEdits` → `accept_edits`). Claude `support.modes` and `support.permission_modes` are both Supported.
- **Signals**: acp_probe + descriptor tests.

### S8 — Composer respects `descriptor.support`

- **Level**: Bun
- **Given**: descriptors with each support flag Unsupported vs Supported+empty vs Supported+list.
- **When**: `descriptorToConfigOptions` runs.
- **Then**: Unsupported or empty → no select. Permission-mode id `permission_mode` is leading; model/thinking trailing. Claude shows Mode and Permission together. Codex Permission is Yolo + Auto + Ask always (no Accept edits). Pi hides both.
- **Signals**: `agent-chat-thread` tests.

### S9 — Fork/rewind are slash, not buttons

- **Level**: Bun
- **Given**: Chat composer chrome.
- **When**: rendering a native session.
- **Then**: no standing Fork/Rewind buttons. Commands appear in `/`.
- **Signals**: composer tests; no new button component in the trailing toolbar.

### S10 — ACP `/rewind` is still send-as-prompt

- **Level**: Rust + Bun
- **Given**: ACP agent with `/rewind` in `available_commands`.
- **When**: user submits `/rewind`.
- **Then**: a user turn is persisted; no `session_op_requested`.
- **Signals**: send path test.

### S11 — Claude rewind maps both restore kinds

- **Level**: Rust
- **Given**: fixtures for `rewind_conversation` and `rewind_files`.
- **When**: user picks restore conversation / code / both.
- **Then**: matching control subtypes; no `subtype: rewind`; no summarize request.
- **Signals**: claude provider tests.

### S12 — Codex rewind is conversation-only

- **Level**: Rust
- **Given**: Codex session-op prepare.
- **When**: options are built.
- **Then**: no Restore code option; revert/rollback conversation only.
- **Signals**: option list assertion.

### S13 — Failed rewind does not change the view

- **Level**: Rust
- **Given**: vendor rewind returns failure or user cancels.
- **When**: session op resolves.
- **Then**: `rewind_view` unchanged; jsonl length unchanged.
- **Signals**: store/service tests.

### S14 — Rewind does not hard-delete jsonl

- **Level**: Rust
- **Given**: OpenCode revert then unrevert (or clear `rewind_view`).
- **When**: fold runs.
- **Then**: later turns still on disk; live view hides then shows them.
- **Signals**: jsonl line count; snapshot fold.

### S15 — Atmos never restores files

- **Level**: Rust
- **Given**: a file-rewind success path (Claude `rewind_files` or Grok `files_only`/`all`).
- **When**: service applies the op.
- **Then**: no `git checkout`, copy, or workspace write from Atmos.
- **Signals**: no core-engine/fs call in the session-op path (test spy / code search gate).

### S16 — Fork creates a new Atmos chat

- **Level**: Rust
- **Given**: native fork success with a new vendor session id.
- **When**: service completes the op.
- **Then**: new `chat_id`, `parent_chat_id` set, parent runtime unchanged.
- **Signals**: store create; `session_forked` event.

### S17 — Grok worktree fork does not run git in Atmos

- **Level**: Rust
- **Given**: user picks worktree.
- **When**: adapter forks.
- **Then**: `x.ai/git/worktree/create` then `x.ai/session/fork`; Atmos does not invoke `git worktree`.
- **Signals**: captured JSON-RPC methods.

### S18 — Transport stays main `/ws`

- **Level**: api-types
- **Given**: contract extract.
- **When**: APP-069 DTOs land.
- **Then**: `agent_chat_session_op_respond` exists; no REST conversation action; descriptor includes `support`.
- **Signals**: `packages/api-types` tests.

### S19 — Grok rewind always sends explicit mode

- **Level**: Rust
- **Given**: conversation-only / files / both choices.
- **When**: `x.ai/rewind/execute` is written.
- **Then**: `mode` is `conversation_only` | `files_only` | `all`; never omitted.
- **Signals**: grok rpc fixture.

## Performance & load budgets

- Catalog native probe stays in the existing prefetch TTL/timeout band (ACP probe ~15s, CLI ~8s, `GrokLineList` ~20s). No extra always-on Chat runtime for probe.

## Regression checklist

- [ ] APP-068 descriptor keys still load old meta (missing `support` / fork / rewind → Unsupported).
- [ ] Generic ACP agents still ACP-probe; natives do not.
- [ ] Claude composer does not show duplicate plan + permission pickers.
- [ ] Terminal `builtin_agents.json` Chat argv untouched.
- [ ] ACP `/rewind` in the slash list still sends as prompt.
- [ ] Search hits never applied to `web_search`.

## Exploratory agent-browser checks

Use after the composer/rewind UI lands. Load Agent Browser skill first (`agent-browser` / `agent-browser skills get core --full`).

1. Open Agent Chat on a stub native descriptor with models + thinking + permission_modes; confirm pickers and empty-support hide.
2. Trigger `/rewind` chrome above the prompt (same slot as permission); cancel; confirm transcript unchanged.
3. Narrow viewport: option card and composer not overlapping unusably.
4. Watch console/WS for unexpected REST chat calls.

## Acceptance criteria

- [x] Every Must Have M1–M14 has at least one passing scenario at the declared level.
- [x] Natives are not filled by generic ACP `session/new` catalog probe.
- [x] Grok 4.5/4.6 thinking matches the TECH table; other Grok ids have no invented thinking.
- [x] No new unconditional REST chat endpoint.
- [x] `atmos-specs-test-run` has updated Coverage Status after implementation.
- [ ] Full-repo `just lint` / `just test` not run; targeted `app069_` cargo + listed bun files + targeted clippy/eslint passed 2026-09-01.

## Manual verification steps

1. Live `grok agent stdio` Chat: models from `grok models`, thinking changes with 4.5 vs 4.6, rewind conversation-only does not revert files.
2. Live Claude `/rewind`: pick a user message, restore conversation vs code when the checkpoint has files.
3. Live Codex: rewind options have no Restore code.

## Non-coverage

- Compact / summarize-from-rewind (N2 / no Claude control subtype).
- Gemini/Cursor native (N3).
- ACP-handled session ops (N4).
- Mobile/CLI (N5).
- Pixel clone of vendor TUI rewind pickers.
- Live CLI on CI agents (fixture-gated).

## Coverage Status

_Last run: 2026-09-01 · review-fix re-verify. Targeted `app069_` Rust + listed Bun files green. S15 now also has a temp-workspace Applied rewind filesystem assertion. Full `just test` / `just lint` not run. Playwright optional smoke not run. Live CLI spawn manual._

Commands (exit 0 unless noted):

```text
cargo test -p agent --lib app069_ -- --test-threads=1
# 23 passed; 0 failed; 0 ignored; 259 filtered out

cargo test -p core-service --lib app069_ -- --test-threads=1
# 20 passed; 0 failed; 0 ignored; 484 filtered out

bun test \
  apps/web/src/features/agent/lib/__tests__/agent-chat-thread.test.ts \
  apps/web/src/features/agent/lib/tool-results/__tests__/parse-tool-result.test.ts \
  apps/web/src/features/agent/components/__tests__/agent-prompt-composer.test.ts \
  apps/web/src/features/agent/components/__tests__/agent-session-op-card.test.ts \
  apps/web/src/features/agent/components/__tests__/agent-chat-modal-frame.test.ts \
  apps/web/src/features/agent/lib/__tests__/composer-triggers.test.ts \
  packages/api-types/src/ws/dto/agent-chat.test.ts
# 66 pass; 0 fail; 268 expect(); 7 files; 867ms

cargo clippy -p agent --lib --tests -- -A dead_code
# exit 0; pre-existing production clippy warns only (no app069_ snake_case)

cargo clippy -p core-service --lib --tests -- -A dead_code
# exit 0; pre-existing unused_imports / non_shorthand_field_patterns

bun run --filter web lint -- \
  src/features/agent/lib/__tests__/agent-chat-thread.test.ts \
  src/features/agent/lib/tool-results/__tests__/parse-tool-result.test.ts \
  src/features/agent/components/__tests__/agent-prompt-composer.test.ts \
  src/features/agent/components/__tests__/agent-session-op-card.test.ts \
  src/features/agent/components/__tests__/agent-chat-modal-frame.test.ts \
  src/features/agent/lib/__tests__/composer-triggers.test.ts
# exit 0
```

`grep app069_S` → 0 hits (all Rust fns are `app069_s*`).

- S1 — ✅ `domain::tool_map::tests::app069_s1_extract_search_hits_parses_grep_and_glob_lines` + `providers::claude::tool_map::tests::app069_s1_grep_stdout_emits_search_hits` + bun `parse-tool-result.test.ts` `APP-069 S1 renders search_hits as a search body`
- S2 — ✅ `domain::tool_map::tests::app069_s2_extract_search_hits_zero_and_web_search_stay_empty` + `providers::claude::tool_map::tests::app069_s2_grep_empty_stdout_stays_text` + `app069_s2_web_search_result_is_never_search_hits` + bun `APP-069 S2 keeps workspace search as text when the result is Text` / `APP-069 S2 does not treat web_search as search_hits`
- S3 — ✅ `providers::tests::app069_s3_grok_aliases_are_native_my_grok_is_acp`
- S4 — ✅ `providers::grok::spawn::tests::app069_s4_chat_argv_is_agent_stdio_without_terminal_flags` + `app069_s4_chat_argv_puts_model_before_stdio` + `app069_s4_cargo_toml_has_no_xai_grok_crate_and_terminal_argv_untouched`
- S5 — ✅ `catalog::spec::tests::app069_s5_native_ids_skip_acp_in_default_strategies` + `app069_s5_apply_native_chat_options_plan_drops_acp` + `service::agent_chat::catalog::tests::app069_s5_grok_aliases_are_native_my_grok_and_gemini_stay_acp`
- S6 — ✅ `catalog::parse::tests::app069_s6_grok_thinking_overlay_is_pinned_per_family`
- S7 — ✅ `catalog::acp_probe::tests::app069_s7_maps_permission_mode_approval_into_permission_modes` + `domain::descriptor::tests::app069_s7_option_support_for_provider_matches_honesty_matrix`
- S8 — ✅ bun `agent-chat-thread.test.ts` `APP-069 S8 hides pickers…` / `emits a leading permission_mode picker…` / `hides Claude mode when support.modes is unsupported…`
- S9 — ✅ bun `agent-prompt-composer.test.ts` `APP-069 S9 has no standing Fork or Rewind composer buttons` + `composer-triggers.test.ts` `APP-069 S9 replaces a / query…` + `agent-session-op-card.test.ts` + `agent-chat-modal-frame.test.ts` `APP-069 S9 shows the session-op card…`
- S10 — ✅ `service::agent_chat::tests::app069_s10_native_rewind_is_session_op_not_user_turn` + `app069_s10_acp_send_rewind_goes_as_prompt` + `app069_s10_acp_send_fork_goes_as_prompt` + bun `APP-069 S9/S10 does not intercept /fork or /rewind…`
- S11 — ✅ `providers::claude::rpc::tests::app069_s11_rewind_control_frames_match_sdk_subtypes` + `providers::claude::tests::app069_s11_rewind_and_fork_session_ops_are_applied`
- S12 — ✅ `providers::codex::tests::app069_s12_codex_rewind_match_has_no_restore_code` + `app069_s12_fork_and_rewind_session_ops` + `service::agent_chat::tests::app069_s12_codex_rewind_chrome_has_no_restore_code`
- S13 — ✅ `app069_s13_cancel_session_op_does_not_set_rewind_view` + `app069_s13_failed_session_op_does_not_set_rewind_view_or_fork` + `app069_s13_failed_rewind_leaves_jsonl_and_view`
- S14 — ✅ `store::tests::app069_s14_rewind_view_omits_turns_after_until_id` + `app069_s14_opencode_redo_clears_view_without_deleting_jsonl`
- S15 — ✅ `app069_s15_session_op_path_does_not_restore_workspace_files`
- S16 — ✅ `app069_s16_applied_fork_creates_sibling_and_emits_session_forked`
- S17 — ✅ `providers::grok::tests::app069_s17_s19_grok_session_ops_send_underscored_xai_methods` (wire `_x.ai/git/worktree/create` then `_x.ai/session/fork`; no bare `x.ai/…`; Atmos does not spawn `git worktree`)
- S18 — ✅ `packages/api-types/src/ws/dto/agent-chat.test.ts` describe `APP-069 S18 Agent Chat stays on main /ws`
- S19 — ✅ same grok session-op test + `providers::grok::rpc::tests::app069_s19_rewind_execute_always_sends_explicit_snake_case_mode`

Regression checklist:

- old meta missing `support` / fork / rewind → Unsupported — ✅ `domain::descriptor::tests::app069_regression_missing_capability_and_support_fields_deserialize_unsupported` + `store::tests::app069_regression_old_meta_without_rewind_view_or_parent_loads`
- generic ACP still probed; natives not — ✅ S5
- Claude Mode + Permission stay independent; Plan is a Mode — ✅ S8 Claude both pickers
- Terminal `builtin_agents.json` argv untouched — ✅ S4 cargo/builtin gate
- ACP `/rewind` still send-as-prompt — ✅ S10
- search hits never applied to `web_search` — ✅ S2

Exploratory agent-browser — **`not_run`**. CLI is installed (`/opt/homebrew/bin/agent-browser` **0.26.0**), but this session has no running `just dev-web` / `just dev-api`, and TEST.md maps live Chat CLI + Playwright as manual / optional. Checks 1–4 need a live Agent Chat UI (pickers, `/rewind` chrome, narrow viewport, console/WS). Do not treat mapper tests as a browser pass.
