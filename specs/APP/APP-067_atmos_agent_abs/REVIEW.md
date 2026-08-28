# REVIEW · APP-067: Atmos Agent Chat - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-28  
**Review scope**: functional review | quality review | architecture review  
**Related code**: `crates/agent/src/{domain,catalog,providers}`, `crates/core-service/src/service/conversation/`, `apps/api/src/api/ws/{message,router}/conversation.rs`, `packages/api-types/src/ws/{dto,contract}/conversation.ts`, `apps/web/src/features/agent/components/AgentChatWorkspace.tsx`, `e2e/tests/specs/APP-067_atmos-agent-chat.e2e.ts`  
**PR**: https://github.com/AruNi-01/atmos/pull/278 (`feat/APP-067-agent-chat`, HEAD `38255027e`)  
**Cross-review**: four parallel subagents (functional spec, architecture/quality, runtime bugs, frontend/WS contract), then parent synthesis.

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-018**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Verdict

Host/WS/file path for a Conversation workspace is real: Atmos ids, file SOT, restore-without-spawn, main `/ws` `conversation_*`, catalog worker with production `StdioAcpCatalogProbe`, Queue/Stop, old dedicated `/ws/agent` handler and REST session CRUD removed on the server, PR 278 CI green.

Review fixes landed 2026-08-28 on `feat/APP-067-agent-chat`: resume replay gate, turn mutex, permission option_id, prompt/queue failure rollback, pump death, catalog non-blocking get, cwd bounds, followup settings UI, live delta fold, Conversation-backed `AgentChatPanel`. REV-006 (full projector/queue file split) remains open as a follow-up refactor.

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-010 | P0 | backend | ACP v2 resume never clears replay gate; live events dropped | fixed |
| REV-011 | P0 | backend | No turn mutex; concurrent send/queue can double-prompt | fixed |
| REV-001 | P1 | frontend | M12 followup_policy has no settings UI | fixed |
| REV-002 | P1 | frontend | Live transcript reloads snapshot instead of folding deltas | fixed |
| REV-003 | P1 | frontend | Old ACP AgentChatPanel still mounted against deleted APIs | fixed |
| REV-013 | P1 | backend | Permission option_id collapsed to allow/reject + first/last ACP option | fixed |
| REV-014 | P1 | backend | Prompt/queue failure leaves RunningTurn or drops the queued item | fixed |
| REV-015 | P1 | backend | Agent process death never completes the in-flight turn | fixed |
| REV-016 | P1 | backend | Catalog get blocks the WS request; UI ignores catalog_updated | fixed |
| REV-017 | P1 | api | cwd/attachments not bounded to workspace/project | fixed |
| REV-004 | P2 | test | S15 ACP-schema guard only scans the new modules | fixed |
| REV-005 | P2 | test | TEST Coverage Status overstates S2/S6/S12/S16 levels | fixed |
| REV-006 | P2 | backend | TECH module split (projector/queue) not done; ConversationService is one file | open |
| REV-007 | P2 | backend | Terminal model catalog is still a second parser/cache | fixed |
| REV-008 | P2 | api | `conversation_subscribe.after_sequence` and `conversation_messages` pagination ignored | fixed |
| REV-012 | P2 | backend | `next_seq` rewrites meta.json + index.json on every token delta | fixed |
| REV-009 | P3 | frontend | Rename/queue edit use `window.prompt`; list is unscoped | fixed |

---

## REV-001 · M12 followup_policy has no settings UI

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

PRD M12 requires Queue vs Steer as a **global user setting** (default Queue). Backend get/update persist `followup_policy` on `AgentBehaviourSettings`, and Chat reads it. Settings UI (`CodeAgentBehaviourSettingsSection`) never shows or writes the field, so users cannot change Enter-while-busy from the default. Combined with production ACP `supports_steer = false` (TECH-locked for ACP v1), the one-shot Steer button never appears either.

### Evidence

- [PRD.md](./PRD.md) M12; [TECH.md](./TECH.md) “Follow-up policy” row.
- `apps/api/src/api/ws/router/settings.rs` — get returns `followup_policy`; update writes it.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:160` — `agentBehaviourSettingsApi.get()` only.
- `apps/web/src/features/settings/components/CodeAgentBehaviourSettingsSection.tsx` — idle timeout / attention summary only; no `followup_policy`.
- `crates/core-service/src/service/conversation/acp_factory.rs:134` and `:172` — `supports_steer: false` for live ACP.

### Required fix

Add Queue/Steer to Agent Behaviour settings (en+zh). Composer already routes on `policy`; keep ACP v1 hiding Steer when `supports_steer` is false.

### Acceptance

- [ ] Settings can set `followup_policy` to `steer` or `queue` and persist.
- [ ] Two open chats both follow the new Enter-while-busy default after update.
- [ ] `bun test` S12 helper still defaults to queue when unset.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-002 · Live transcript reloads snapshot instead of folding deltas

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH says the client appends `assistant_message_delta` into the current assistant part and re-renders Streamdown `MessageResponse`. `AgentChatWorkspace` ignores delta payloads for rendering: it records user rows in a ref that is never displayed, then `void load()` on **every** `conversation_event`, refetching `conversation_get`. That is correct enough to show messages after disk snapshots, but it misses token streaming, hammers get on high-frequency deltas, and can lose in-flight UI if get races.

### Evidence

- [TECH.md](./TECH.md) “Streaming: keep Streamdown… Client appends to the current assistant text part”.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:169-198` — event handler; `void load()` at 198.
- `apps/web/src/features/agent/lib/conversation-events.ts:23-35` — only folds `user_message`.
- Render path uses `turns` from snapshot (`AgentChatWorkspace.tsx:404-406`), not `liveUserRows`.

### Required fix

Fold `user_message` / `assistant_message_delta` / `thinking_delta` / tool/permission events into local turn state. Use `conversation_get` for initial hydrate and reconnect, not per-delta.

### Acceptance

- [ ] Typing a send shows the user row from the event without waiting for get.
- [ ] Assistant text grows from deltas; get is not called on each delta.
- [ ] Permission and turn_completed still update busy/stop chrome.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-003 · Old ACP AgentChatPanel still mounted on canvas/automation

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Center-stage + standalone use `AgentChatWorkspace` / `conversation_*`. `AgentChatPanel` + `use-agent-chat-session` + `agent-runtime-socket` remain and are still imported by canvas and automations. REST `createSession`/`resumeSession`/`listSessions` throw, and the old socket still opens `/ws/agent/${id}` which no longer exists. N5 is not a v1 layout goal, but shipping a panel that throws or 404s is a product bug. M18 said the old chat domain is not product behavior after this spec.

### Evidence

- `apps/web/src/features/canvas/components/widgets/CanvasAgentChatWidget.tsx:6` imports `AgentChatPanel`.
- `apps/web/src/features/automations/components/AutomationRunDrawer.tsx:27-30` and `AutomationHistoryPage.tsx:45-46`.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts` still calls `resumeSession`.
- `apps/web/src/api/rest-api.ts:831-864` throws “REST session create/resume/list is gone”.
- [PRD.md](./PRD.md) M18, N5.

### Required fix

Either (a) point those embeds at Conversation (later N5) and stop importing the ACP session hooks, or (b) document them as explicitly out of APP-067 and gate/disable the widgets until N5. Do not leave a dead REST-backed panel in the product.

### Acceptance

- [ ] No in-app surface still calls `agentApi.createSession` / `resumeSession` / `listSessions`.
- [ ] TECH/PRD note the chosen leftover policy if widgets stay disabled.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-004 · S15 ACP-schema guard only scans the new modules

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TEST S15: web Agent Chat modules must not import ACP schemas. The bun guard only walks `followup-policy`, `group-conversations`, `conversation-*`, `use-agent-chat-center-tabs`, and `AgentChatWorkspace`. `AgentChatPanel` and the old hooks are excluded, so S15 can pass while ACP identity remains in the feature folder.

### Evidence

- [TEST.md](./TEST.md) S15.
- `apps/web/src/features/agent/lib/__tests__/no-acp-schema.test.ts:22-29` filter.

### Required fix

Scan `apps/web/src/features/agent/**` (or an explicit allowlist of deleted-adapter files). Fail on `acp_session_id` / `/ws/agent` / `agent-client-protocol` outside that allowlist.

### Acceptance

- [ ] `bun test` S15 fails if `AgentChatPanel` or session hooks still import ACP chat identity, unless those files are listed as deferred N5 with a comment and PRD/TECH match.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-005 · TEST Coverage Status overstates S2/S6/S12 levels

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Execution map still says `planned` for every row, while Coverage Status claims pass. Playwright file only has S1 plus-menu and S16 send/fan-out — not S2 launcher/⌘N. S6 rename/delete is store-level, not `cargo test -p api` WS. S12 is bun helper + parse_followup_policy, not “two chats follow setting after update”.

### Evidence

- `e2e/tests/specs/APP-067_atmos-agent-chat.e2e.ts` — two tests (`S1`, `S16`).
- `crates/core-service/src/service/conversation/store.rs` `s6_rename_and_soft_delete`.
- `apps/web/src/features/agent/lib/__tests__/followup-policy.test.ts`.
- [TEST.md](./TEST.md) Coverage Status vs Execution map.

### Required fix

Align Coverage Status with the declared level, or add the missing tests. Mark S2/S6-WS/S12-WS as `gap` until they exist.

### Acceptance

- [ ] Execution map statuses are `pass` / `gap` / `not_run`, not leftover `planned`.
- [ ] Each claimed pass names a test that actually asserts that scenario’s Signals.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-006 · TECH module split not done; ConversationService is one file

| Field | Value |
|-------|--------|
| **Status** | open |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH lists `projector.rs` + `queue.rs` under `conversation/`. Implementation is `service.rs` (~1000 lines) owning spawn, pump, event persist, queue dispatch, permission, and emit. Store atomic JSON is separate and sound. The missing split is maintainability, not a missing behavior by itself.

### Evidence

- [TECH.md](./TECH.md) “Module-by-module design” `core-service` tree.
- `crates/core-service/src/service/conversation/` — `service.rs`, `store.rs`, `catalog.rs`, `acp_factory.rs`, `types.rs`; no `projector.rs` / `queue.rs`.

### Required fix

Extract `apply_event` / snapshot flush and queue dispatch from `ConversationService` without changing WS contracts.

### Acceptance

- [ ] Pump/projector and queue dispatch are separate modules with existing `cargo test -p core-service --lib conversation` still green.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.

---

## REV-007 · Terminal model catalog is still a second parser/cache

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH: `terminal_agent_model_catalog` becomes a facade over `crates/agent` catalog so Chat and Terminal do not grow a second parser zoo. `automation/agents.rs` still has its own TTL cache and `probe_terminal_agent_model_catalog`. Chat prefetch uses `CatalogEngine` separately.

### Evidence

- [TECH.md](./TECH.md) APP-024 facade paragraph.
- `crates/core-service/src/service/automation/agents.rs:422-449`.
- `crates/core-service/src/service/conversation/catalog.rs` + `crates/agent/src/catalog/engine.rs`.

### Required fix

Route APP-024 catalog get through `CatalogEngine` / `CatalogCache` (shape-map at the WS boundary if the Terminal DTO must stay).

### Acceptance

- [ ] One probe path for a given agent_id; Chat prefetch and Terminal picker share disk cache under `~/.atmos/data/agent/model_catalog/`.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-008 · subscribe after_sequence and messages pagination ignored

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH hydrate: snapshot then subscribe from `after_sequence`. DTO has `after_sequence`, `before_seq`, `limit`. Handler returns `last_event_seq` but does not replay missed events; `conversation_messages` dumps all turns and ignores pagination. Reconnect can miss deltas if the snapshot is taken between events.

### Evidence

- `packages/api-types/src/ws/dto/conversation.ts:23-27`, `:41-44`.
- `apps/api/src/api/ws/router/conversation.rs:96-104` (`let _ = req.before_seq; let _ = req.limit`).
- `apps/api/src/api/ws/router/conversation.rs:142-152` — subscribe does not read `after_sequence`.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:159` — `subscribe(conversationId)` without seq.

### Required fix

Honor `after_sequence` (replay or document that clients must get-then-subscribe with seq) and either implement messages pagination or drop the unused fields from the contract in the same PR as TECH.

### Acceptance

- [ ] A subscriber joining with `after_sequence = last_seen` receives later events or a snapshot covering them.
- [ ] TECH and DTO agree on pagination.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-009 · Rename/queue edit use window.prompt; list is unscoped

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P3 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

M7 rename/delete work, but rename and queue edit use `window.prompt`. History sidebar calls `conversationApi.list({})` with no workspace/project/cwd, so every conversation on the machine appears in every Chat tab. TECH asked to reuse `AgentChatHistorySidebar` cwd grouping chrome.

### Evidence

- `AgentChatWorkspace.tsx:153` `list({})`; `:311-317` `window.prompt` rename; `:459` queue edit prompt.
- [PRD.md](./PRD.md) M6/M7; [TECH.md](./TECH.md) frontend reuse table.

### Required fix

Inline rename; scope list to current workspace/project (plus cwd groups). Reuse existing sidebar chrome if cheaper than polishing the new list.

### Acceptance

- [ ] Rename does not use `window.prompt`.
- [ ] A chat opened in workspace A does not list workspace B conversations.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-010 · ACP v2 resume never clears replay gate; live events dropped

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Resume sets `replaying = true`. The adapter drops every ACP event except LoadCompleted / SessionReady / SessionClosed while that flag is set. Only `LoadCompleted` clears it. ACP v2 `session/resume` (no history replay) never emits `LoadCompleted`, so streams, tools, permissions, and turn-end are discarded for the rest of the session. The user message is already on disk; the agent reply never appears.

### Evidence

- `crates/agent/src/providers/acp/adapter.rs:158-174` drop-while-replaying; `:268-270` only `LoadCompleted` clears; `:373` `replaying: resume.is_some()`.
- `crates/agent/src/acp_client/runner.rs:340-348` prefers load, else `ResumeContextOnly`; `:862-870` resume-without-history; `:957-966` `LoadCompleted` only if `replayed_loaded_history`.
- `s7_continue_resumes_same_conversation` uses `FakeAgentProvider` (no replay gate).

### Required fix

Clear `replaying` on `SessionReady` when history was not replayed, or always emit `LoadCompleted` after resume-only. Add an adapter test that resume-without-load still forwards Stream/TurnEnd.

### Acceptance

- [ ] Resume-only agent: continue send streams assistant/tool/permission events.
- [ ] Load-with-history still does not persist ACP replay into Atmos transcript.
- [ ] `cargo test -p agent --lib` covers both restore methods.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-011 · No turn mutex; concurrent send/queue can double-prompt

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`send()` checks `current_turn_id` then drops the lock, persists `TurnStarted`, then `ensure_runtime` / `prompt`. `maybe_dispatch_queue` also starts a turn when `current_turn_id` is `None`. Two idle sends, or send overlapping queue dispatch, can both prompt. ACP receives overlapping `session/prompt`.

### Evidence

- `crates/core-service/src/service/conversation/service.rs:134-141` check without holding a turn gate; `:188-192` set `current_turn_id` after spawn; `:919-968` queue dispatch.

### Required fix

One per-conversation async mutex covering idle-check → persist → set `current_turn_id` → `prompt()`. Queue dispatch must take the same gate. Reject a second send while transcript or memory already has a running turn.

### Acceptance

- [ ] Two overlapping `send`s yield one running turn and one `prompt()`.
- [ ] Send vs queue dispatch cannot double-prompt.
- [ ] Targeted `cargo test -p core-service --lib conversation`.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-012 · next_seq rewrites meta.json + index.json on every token delta

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH: disk assistant snapshots at most every 100ms; WS still streams deltas. `emit` / `apply_event` call `store.next_seq()` on every outbound event including `assistant_message_delta`, which rewrites `meta.json` and full `index.json` (temp+fsync+rename). A long stream stalls the tokio worker on sync IO.

### Evidence

- `crates/core-service/src/service/conversation/service.rs:564-574`, `:611-620`.
- `crates/core-service/src/service/conversation/store.rs:147-159` `update_meta` always `upsert_index`.

### Required fix

Keep `last_event_seq` in memory or a tiny seq file. Flush seq with the 100ms snapshot / turn boundaries. Do not rewrite `index.json` unless list fields changed.

### Acceptance

- [ ] A 1k-token stream does not rewrite `index.json` per token.
- [ ] List still consistent after crash.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-013 · Permission option_id collapsed to allow/reject + first/last ACP option

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The host UI sends a selected `option_id`. The ACP adapter converts it to a boolean (`!contains("reject")`). The ACP client then picks the **first** option on allow and the **last** on deny, or synthesizes `"allow"`. `allow_once` vs `allow_always` is lost. Empty options become a host-invented Allow. Snapshot never appends `PermissionResolved` from the ACP adapter, so reload can revive the card.

### Evidence

- `crates/agent/src/providers/acp/adapter.rs:98-107`.
- `crates/agent/src/acp_client/client.rs:322-333` (first/last option).
- `AgentChatWorkspace.tsx:516-521` synthesizes `{ option_id: "allow" }` when options empty.
- Fake provider emits `PermissionResolved`; ACP adapter does not. `s14` cannot catch this.

### Required fix

Forward the selected ACP `option_id`. Do not boolean-collapse. Persist resolved permission on the transcript. Do not invent allow if the agent sent options.

### Acceptance

- [ ] Clicking option X sends X to the agent.
- [ ] Reload after allow does not reopen the same pending card.
- [ ] Empty options require an explicit mapped choice or deny.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-014 · Prompt/queue failure leaves RunningTurn or drops the queued item

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`send()` persists `TurnStarted` + `RunningTurn` before `prompt()`. Spawn failure rolls back; **prompt failure only clears `current_turn_id`**. Transcript stays running. Queue dispatch removes the item from `queue.json` before `prompt()`; on error the item is gone and `current_turn_id` can stay set.

### Evidence

- `crates/core-service/src/service/conversation/service.rs:141-217` persist-then-spawn; `:218-234` prompt error; `:932-968` queue remove-then-prompt.

### Required fix

On prompt error, append `TurnCompleted { Failed }`, set Ready/Detached, restore the queue item (or mark `in_flight` until prompt succeeds).

### Acceptance

- [ ] Failed `send` snapshot is `Failed`, not `Running`.
- [ ] Failed queue prompt restores the item as pending.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-015 · Agent process death never completes the in-flight turn

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

When `next_event()` ends, the pump always writes `Detached`, never `Closed`, and never `TurnCompleted`. Folded transcript still has a `running` turn. UI `busy` may clear from `runtime_status`, but `runningTurnId` can come back on `load()`. Next send can start a second open turn.

### Evidence

- `crates/core-service/src/service/conversation/service.rs:531-560` pump teardown; `:859-865` SessionClosed → Detached only.
- `AgentChatWorkspace.tsx:140-143` treats transcript `running` as current turn.

### Required fix

On pump end, complete any in-flight turn as failed/canceled. Use `Closed` when the provider closed cleanly. Treat transcript `Running` as busy even if the runtime map is empty.

### Acceptance

- [ ] Kill the agent mid-turn → snapshot shows failed/canceled, not stuck running.
- [ ] Continue starts a new turn on the same conversation id.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-016 · Catalog get blocks the WS request; UI ignores catalog_updated

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH: cache-first and instant; picker fills from `agent_model_catalog_updated`; refresh is background-safe. Cache miss / `refresh=true` holds the engine mutex for CLI+ACP on the WS request. Web never listens for `agent_model_catalog_updated` (one-shot `catalogGet`). Prefetch specs mark all builtins `acp: true` and probe serially.

### Evidence

- `crates/core-service/src/service/conversation/catalog.rs:112-149`, `:233-249`.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:206-214`.
- Grep: no web `onEvent("agent_model_catalog_updated")`.

### Required fix

Return cache or `probing` immediately; probe in the worker; emit `agent_model_catalog_updated`. UI subscribes. Prefetch only user-enabled Chat agents, concurrency 2.

### Acceptance

- [ ] `agent_model_catalog_get` does not wait on a 15s ACP probe on the request path.
- [ ] Picker updates from the event.
- [ ] Disabled/terminal-only agents are not temp-ACP probed.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.

---

## REV-017 · cwd/attachments not bounded to workspace/project

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Create cwd: non-empty client `cwd` wins; else workspace/project path; else `$HOME`/`/tmp`. `allow_file_access` is true if any workspace/project id is set, with `session_root = meta.cwd`. A client can pass a real workspace id and `cwd=/`. Upload still writes `{local_path}/.atmos/attachments`, not `conversations/{id}/attachments/`. Standalone create sends only `provider_id: "claude"` so cwd falls through to HOME.

### Evidence

- `apps/api/src/api/ws/router/conversation.rs:15-48`.
- `crates/core-service/src/service/conversation/service.rs:485-494`.
- `apps/api/src/api/agent/handlers.rs:46-80`.
- `AgentChatStandalonePage.tsx:20`.

### Required fix

Resolve cwd from workspace/project then `path_within_root`. Reject create/send/upload outside the root. Store attachments under the conversation dir. Standalone create must pass cwd/workspace once connected.

### Acceptance

- [ ] `cwd=/etc` with a workspace id fails validation.
- [ ] Upload cannot write outside the project.
- [ ] Standalone new chat is not `$HOME` with file tools off by accident (or is explicitly a no-files assistant).

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix.
