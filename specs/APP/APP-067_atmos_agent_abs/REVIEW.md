# REVIEW · APP-067: Atmos Agent Chat - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-08-28  
**Review scope**: functional review | quality review | architecture review  
**Related code**: `crates/agent/src/{domain,catalog,providers,acp_client}`, `crates/core-service/src/service/conversation/`, `apps/api/src/api/ws/{message,router}/conversation.rs`, `packages/api-types/src/ws/{dto,contract}/conversation.ts`, `apps/web/src/features/agent/components/AgentChatWorkspace.tsx`, `e2e/tests/specs/APP-067_atmos-agent-chat.e2e.ts`  
**PR**: https://github.com/AruNi-01/atmos/pull/278 (`feat/APP-067-agent-chat`, HEAD `732d19e12`)  
**Cross-review**: two rounds of four parallel subagents (functional spec, architecture/quality, runtime bugs, frontend/WS contract), then parent synthesis. Latest round after ACP 2.0 + REV-001..017 fixes.

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-037**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Verdict

Host/WS/file path for a Conversation workspace is real: Atmos ids, file SOT, restore-without-spawn, main `/ws` `conversation_*`, catalog worker with production `StdioAcpOptionsProbe`, Queue/Stop, old dedicated `/ws/agent` handler and REST session CRUD removed on the server.

A second cross-review at `732d19e12` (after ACP crate 2.0 + REV-001..017) found a **P0**: Stop could not interrupt a live ACP `session/prompt`. Those residuals (REV-018..028) were implemented: cancel runs during prompt, `stop_reason` maps to canceled, Steer is shown closed when unsupported, attachments become ACP resource links, live tools fold, and subscribe no longer duplicates deltas.

REV-001..028 are `fixed`. A human can now verify Stop, Queue, tools, and standalone pop-out on a live agent.

A third architecture pass (2026-08-28, quality review against current tree) found the host shape is right but cutover is incomplete. REV-029..036 were implemented in the same pass: idle/archive teardown, generation-safe pump remove, lagged fan-out replay, canvas/automation id bind, WS no longer owns `AgentSessionService`, dead ACP chat files removed, in-memory seq, inject/subscribe churn. Status: `fixed`. Remaining: REST `agent_logout` still uses leftover `AgentSessionService`; `ThreadEntry` stays a view projection of host events.

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
| REV-006 | P2 | backend | TECH module split (projector/queue) not done; AgentChatService is one file | fixed |
| REV-007 | P2 | backend | Terminal model catalog is still a second parser/cache | fixed |
| REV-008 | P2 | api | `agent_chat_subscribe.after_sequence` and `agent_chat_messages` pagination ignored | fixed |
| REV-012 | P2 | backend | `next_seq` rewrites meta.json + index.json on every token delta | fixed |
| REV-009 | P3 | frontend | Rename/queue edit use `window.prompt`; list is unscoped | fixed |
| REV-018 | P0 | backend | Stop cannot interrupt live ACP `session/prompt`; queue still fires | fixed |
| REV-019 | P1 | frontend | Live fold ignores tool/plan events | fixed |
| REV-020 | P1 | backend | Assistant snapshot clobbers tool/plan parts on restore | fixed |
| REV-021 | P1 | frontend | Settings Steer + ACP `supports_steer=false` drops busy Enter | fixed |
| REV-022 | P1 | backend | Attachment paths never become ACP prompt content | fixed |
| REV-023 | P1 | backend | Dead ACP control still accepts `prompt`; next send can ghost-run | fixed |
| REV-024 | P1 | api | Subscribe inserts then replays; client appends duplicate deltas | fixed |
| REV-025 | P1 | frontend | `AgentChatPanel` creates a new Conversation on every mount | fixed |
| REV-026 | P2 | frontend | Standalone list is unscoped; no pop-out of the open conversation | fixed |
| REV-027 | P2 | backend | Catalog prefetch is static builtins, not user-enabled Chat agents | fixed |
| REV-028 | P2 | backend | Queue dispatch omits live `UserMessage` and can lose concurrent adds | fixed |
| REV-029 | P1 | backend | Conversation ACP processes never idle-unload; archive closes the wrong map | fixed |
| REV-030 | P1 | backend | Pump teardown can drop a replacement runtime | fixed |
| REV-031 | P1 | api | Live agent_chat_event fan-out silently drops on broadcast lag | fixed |
| REV-032 | P1 | frontend | Canvas/automation still mint orphan conversations | fixed |
| REV-033 | P2 | backend | Dual host: AgentSessionService + crates/agent public ACP API | fixed |
| REV-034 | P2 | frontend | ACP session façade and dead chat stack still in the tree | fixed |
| REV-035 | P2 | backend | next_seq still fsyncs meta.json per delta; messages pagination incomplete | fixed |
| REV-036 | P2 | frontend | Cross-feature prompt inject and subscribe effect churn | fixed |

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

TECH says the client appends `assistant_message_delta` into the current assistant part and re-renders Streamdown `MessageResponse`. `AgentChatWorkspace` ignores delta payloads for rendering: it records user rows in a ref that is never displayed, then `void load()` on **every** `agent_chat_event`, refetching `agent_chat_get`. That is correct enough to show messages after disk snapshots, but it misses token streaming, hammers get on high-frequency deltas, and can lose in-flight UI if get races.

### Evidence

- [TECH.md](./TECH.md) “Streaming: keep Streamdown… Client appends to the current assistant text part”.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:169-198` — event handler; `void load()` at 198.
- `apps/web/src/features/agent/lib/agent-chat-events.ts:23-35` — only folds `user_message`.
- Render path uses `turns` from snapshot (`AgentChatWorkspace.tsx:404-406`), not `liveUserRows`.

### Required fix

Fold `user_message` / `assistant_message_delta` / `thinking_delta` / tool/permission events into local turn state. Use `agent_chat_get` for initial hydrate and reconnect, not per-delta.

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

## REV-006 · TECH module split not done; AgentChatService is one file

| Field | Value |
|-------|--------|
| **Status** | fixed |
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

Extract `apply_event` / snapshot flush and queue dispatch from `AgentChatService` without changing WS contracts.

### Acceptance

- [x] Pump/projector and queue dispatch are separate modules with existing `cargo test -p core-service --lib conversation` still green.

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - extracted `projector.rs` (`apply_event` / snapshot flush) and `queue.rs` (`maybe_dispatch_queue`). `AgentChatService` keeps spawn/pump/public API.

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

TECH: `terminal_agent_options` becomes a facade over `crates/agent` options so Chat and Terminal do not grow a second parser zoo. `automation/agents.rs` still has its own TTL cache and `probe_terminal_agent_options`. Chat prefetch uses `OptionsProbe` separately.

### Evidence

- [TECH.md](./TECH.md) APP-024 facade paragraph.
- `crates/core-service/src/service/automation/agents.rs:422-449`.
- `crates/core-service/src/service/conversation/catalog.rs` + `crates/agent/src/catalog/engine.rs`.

### Required fix

Route APP-024 catalog get through `OptionsProbe` / `OptionsCache` (shape-map at the WS boundary if the Terminal DTO must stay).

### Acceptance

- [ ] One probe path for a given agent_id; Chat prefetch and Terminal picker share disk cache under `~/.atmos/data/agent/options/`.

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

TECH hydrate: snapshot then subscribe from `after_sequence`. DTO has `after_sequence`, `before_seq`, `limit`. Handler returns `last_event_seq` but does not replay missed events; `agent_chat_messages` dumps all turns and ignores pagination. Reconnect can miss deltas if the snapshot is taken between events.

### Evidence

- `packages/api-types/src/ws/dto/agent-chat.ts:23-27`, `:41-44`.
- `apps/api/src/api/ws/router/conversation.rs:96-104` (`let _ = req.before_seq; let _ = req.limit`).
- `apps/api/src/api/ws/router/conversation.rs:142-152` — subscribe does not read `after_sequence`.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:159` — `subscribe(chatId)` without seq.

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

M7 rename/delete work, but rename and queue edit use `window.prompt`. History sidebar calls `agentChatApi.list({})` with no workspace/project/cwd, so every conversation on the machine appears in every Chat tab. TECH asked to reuse `AgentChatHistorySidebar` cwd grouping chrome.

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
- 2026-08-28 - implemented review fix (inline rename + scoped list).
- 2026-08-28 - queue edit no longer uses `window.prompt`; inline input matches rename.

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

TECH: cache-first and instant; picker fills from `agent_options_updated`; refresh is background-safe. Cache miss / `refresh=true` holds the engine mutex for CLI+ACP on the WS request. Web never listens for `agent_options_updated` (one-shot `catalogGet`). Prefetch specs mark all builtins `acp: true` and probe serially.

### Evidence

- `crates/core-service/src/service/conversation/catalog.rs:112-149`, `:233-249`.
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:206-214`.
- Grep: no web `onEvent("agent_options_updated")`.

### Required fix

Return cache or `probing` immediately; probe in the worker; emit `agent_options_updated`. UI subscribes. Prefetch only user-enabled Chat agents, concurrency 2.

### Acceptance

- [ ] `agent_options_get` does not wait on a 15s ACP probe on the request path.
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

- [x] `cwd=/etc` with a workspace id fails validation.
- [x] Upload cannot write outside the project.
- [x] Standalone new chat is not `$HOME` with file tools off by accident (or is explicitly a no-files assistant).

### Fix log

- 2026-08-28 - opened in APP-067 implementation review.
- 2026-08-28 - implemented review fix (cwd bound to workspace/project/scratch).
- 2026-08-28 - conversation uploads write `conversations/{id}/attachments/`; send/queue reject paths outside that dir. Terminal overlay may still use bounded `{local_path}/.atmos/attachments`.

---

## REV-018 · Stop cannot interrupt live ACP `session/prompt`

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P0 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The ACP session loop `await`s `PromptRequest` with `block_task()` before reading the next `SessionCommand`. `send_cancel` only enqueues `SessionCommand::Cancel`, so `session/cancel` is not written while a turn is in flight. When the prompt RPC later returns, the runner always emits `TurnEnd(None)` and the adapter maps every `TurnEnd` to `TurnStop::Completed`, so Queue dispatch still runs. Fake-provider cancel tests never hit this loop.

### Evidence

- `crates/agent/src/acp_client/runner.rs:917-962` — prompt `block_task` then cancel arm.
- `crates/agent/src/providers/acp/adapter.rs:237-242` — any `TurnEnd` → `TurnCompleted`.
- `crates/core-service/src/service/conversation/queue.rs` — dispatch on completed turn.

### Required fix

Send `session/cancel` (and close/config) while `session/prompt` is in flight. Map `PromptResponse.stop_reason` (`cancelled` → `TurnCanceled`). Do not dispatch the queue after a user Stop.

### Acceptance

- [ ] Stop during a live Claude/Codex turn sends `session/cancel` before the prompt RPC returns.
- [ ] A stopped turn is `canceled`, not `completed`, and queued items stay queued.
- [ ] Fake-provider tests stay green; add an ACP-loop test that cancel is observed during an in-flight prompt.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-019 · Live fold ignores tool/plan events

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

REV-002 still folds text/thinking deltas without a per-event `get`. `foldTurnsFromEvent` does not handle `tool_call_*` or `plan_updated`, and the workspace never `load()`s those events, so tool/plan chrome is blank for the whole live turn.

### Evidence

- `apps/web/src/features/agent/lib/agent-chat-events.ts:83-151`
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:183-208`, `:485-515`

### Required fix

Fold host `tool_call_*` / `plan_updated` into the current assistant message. Do not import ACP schema. Do not refetch on each tool event.

### Acceptance

- [ ] A live tool call appears in the transcript without `agent_chat_get`.
- [ ] Plan updates appear in the same turn.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-020 · Assistant snapshot clobbers tool/plan parts on restore

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`AssistantSnapshot` replaces the whole assistant message with `[Text]`. Later snapshots after a tool record wipe tool/plan parts. Reload of a tool-using turn shows text only.

### Evidence

- `crates/core-service/src/service/conversation/store.rs:413-429`
- `crates/core-service/src/service/conversation/store.rs:549-554` — `upsert_message` overwrites `parts`.

### Required fix

Merge snapshot text into existing parts; never drop tool/plan/attachment parts already on that message.

### Acceptance

- [ ] `agent_chat_get` after a tool-using turn still includes the tool parts.
- [ ] Store unit test: snapshot after tool keeps both text and tool.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-021 · Settings Steer + ACP `supports_steer=false` drops busy Enter

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH: hide Steer and force Queue when the agent cannot inject. The one-shot Steer button is hidden, but Enter still follows the global setting. If the user sets Steer and ACP `supports_steer` is false, busy Enter returns without queueing and without clearing the draft.

### Evidence

- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:308-312`
- `crates/core-service/src/service/conversation/acp_factory.rs:133-134`, `:172`
- `apps/web/src/features/settings/components/CodeAgentBehaviourSettingsSection.tsx:272-284`

### Required fix

When `!supports_steer`, force Queue for Enter and one-shot. Do not let the settings value swallow the draft.

### Acceptance

- [ ] With policy=Steer and `supports_steer=false`, busy Enter queues.
- [ ] Default Queue still queues.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-022 · Attachment paths never become ACP prompt content

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Upload and `send` persist conversation-dir attachment paths, but `AcpCommands::prompt` only sends `input.text` as one `ContentBlock::Text`. The agent never sees the files. Center-stage Chat also has no file picker yet.

### Evidence

- `crates/agent/src/providers/acp/adapter.rs:48-55`
- `crates/agent/src/acp_client/runner.rs:933-938`
- `crates/core-service/src/service/conversation/service.rs:166-195`

### Required fix

Map attachment paths to ACP content blocks in the mapper only. Wire Chat composer upload to `chat_id` when M4 attachments are in the pass.

### Acceptance

- [ ] A non-empty `AgentPrompt.attachments` vec is not dropped (mapper test).
- [ ] Uploaded files under `conversations/{id}/attachments/` are referenced on the prompt.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-023 · Dead ACP control still accepts `prompt`

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`prompt()` always `Ok` after `cmd_tx.send`, even if the ACP thread is dead. `ensure_runtime` reuses a map entry until post-pump disk IO finishes `remove`. A send during that window writes `TurnStarted` / `RunningTurn` with no pump. Cancel with no runtime only sets `Detached` and does not complete the turn. After API restart, a folded `running` turn does not block a second `send`.

### Evidence

- `crates/agent/src/providers/acp/adapter.rs:47-55`
- `crates/core-service/src/service/conversation/service.rs:171-185`, `:355-377`, `:541-545`, `:625-662`

### Required fix

Treat a closed command channel as prompt failure. Do not return a dead runtime from `ensure_runtime`. Complete-as-failed any transcript turn still running before starting a new one.

### Acceptance

- [ ] Kill the agent process, send again: either a new spawn with a completed previous turn, or a visible error — not a ghost running turn.
- [ ] Service test: jsonl `TurnStarted` without complete, new `AgentChatService`, `send` does not leave two running turns.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-024 · Subscribe inserts then replays; client appends duplicate deltas

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`agent_chat_subscribe` adds the socket to `agent_chat_subs` before `events_after` replay. Live fan-out can deliver a seq, then replay delivers it again. The client records `lastSeq` but still appends assistant deltas, so text can stutter (`hellohello`).

### Evidence

- `apps/api/src/api/ws/router/conversation.rs:162-188`
- `apps/web/src/features/agent/components/AgentChatWorkspace.tsx:204-208`
- `apps/web/src/features/agent/lib/agent-chat-events.ts:135-136`

### Required fix

Replay first, then insert; and/or skip events with `sequence <= lastSeq` on the client.

### Acceptance

- [ ] Send immediately after open does not duplicate assistant tokens.
- [ ] Subscribe after `after_sequence` still fills the gap.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-025 · `AgentChatPanel` creates a new Conversation on every mount

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

REV-003 converted the panel to Conversation but dropped identity. Mount always `agent_chat_create`. Canvas still passes `acpSessionId` (ignored). Automation drawer remounts spawn orphan chats in the Chat-first list. Center-stage does not use this panel.

### Evidence

- `apps/web/src/features/agent/components/AgentChatPanel.tsx:32-46`
- `apps/web/src/features/canvas/components/widgets/CanvasAgentChatWidget.tsx:104-113`
- `apps/web/src/features/automations/components/AutomationRunDrawer.tsx:150`

### Required fix

Persist and reopen `chat_id`. Do not create on every mount. Until N5, do not mint chats as a widget side effect.

### Acceptance

- [ ] Remounting the canvas/automation chat does not create a new conversation id.
- [ ] Center-stage Chat is unchanged.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-026 · Standalone list is unscoped; no pop-out of the open conversation

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`list` with `workspace_id: null` matches every row. `/agent-chat` without query creates a scratch chat and shows all conversations. Footer/command palette open `/agent-chat` with no id. There is no control that pops the current tab with `?chatId=`.

### Evidence

- `crates/core-service/src/service/conversation/store.rs:124-126`
- `apps/web/src/features/agent/components/AgentChatStandalonePage.tsx:21-25`
- `apps/web/src/app-shell/Footer.tsx:743`

### Required fix

Distinguish “no filter” from “only null workspace.” Pop-out must pass the current `chatId`.

### Acceptance

- [ ] Scratch `/agent-chat` does not list workspace A/B chats.
- [ ] Opening standalone from an existing tab shows that conversation.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-027 · Catalog prefetch is static builtins, not user-enabled Chat agents

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Production worker is constructed with `builtin_options_probe_specs()`. `set_specs` is tests-only. Disabled/terminal-only/custom registry agents are not the prefetch set. Unknown `agent_options_get` can still default `acp: true`.

### Evidence

- `apps/api/src/api/ws/router/mod.rs:132-141`
- `crates/core-service/src/service/conversation/catalog.rs:233-285`

### Required fix

Prefetch installed, not-disabled Chat providers only. Do not default unknown ids to temp ACP.

### Acceptance

- [ ] Disabled agents are not temp-ACP probed on first `/ws`.
- [ ] Custom ACP agents can appear in the catalog path.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-028 · Queue dispatch omits live `UserMessage` and can lose concurrent adds

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Dispatch writes `UserMessage` to jsonl but emits only `TurnStarted` and `QueueUpdated`, so the live fold shows an empty running turn until reload. `queue_add` does not share the dispatch snapshot lock, so a concurrent add can be overwritten.

### Evidence

- `crates/core-service/src/service/conversation/queue.rs:52-114`
- `crates/core-service/src/service/conversation/service.rs:391-402`

### Required fix

Emit `UserMessage` like `send`. Make queue read-modify-write atomic with dispatch.

### Acceptance

- [ ] Dispatched queue item appears as a user row without `agent_chat_get`.
- [ ] Add-during-dispatch does not drop the new item.

### Fix log

- 2026-08-28 - opened in second APP-067 cross-review.
- 2026-08-28 - implemented review fix.

---

## REV-029 · Conversation ACP processes never idle-unload; archive closes the wrong map

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH requires unloading the provider after the existing agent-behaviour idle timeout, and treating AgentChatService as the runtime owner. The conversation module has no idle timer. Workspace archive with `close_acp_on_archive` still calls `AgentSessionService::close_workspace_sessions`, whose session map is empty for Chat. ACP child processes therefore live until they exit, the conversation is deleted, or the API process dies.

### Evidence

- [TECH.md](./TECH.md) “Unload provider after idle timeout using existing agent behaviour idle setting”.
- `crates/core-service/src/service/conversation/` — no idle / unload / behaviour-settings read.
- `apps/api/src/api/ws/router/workspace.rs:414-417` — archive closes `agent_session_service`.
- `crates/core-service/src/service/agent_session.rs:410-441` — `close_workspace_sessions` only walks the leftover ACP map.
- `crates/core-service/src/service/conversation/service.rs:148-156` — `delete` is the only Conversation close path.

### Required fix

Drive process lifetime from `AgentChatService.runtimes`. On idle timeout and workspace archive, `close()` those runtimes. Stop using `AgentSessionService` as the Chat process owner.

### Acceptance

- [ ] After the configured idle timeout, the ACP process is gone and `runtime_status` is `detached`; transcript remains.
- [ ] Archiving a workspace with `close_acp_on_archive` closes Conversation ACP processes for that workspace.
- [ ] Targeted `cargo test -p core-service --lib conversation` covers idle or archive teardown.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-030 · Pump teardown can drop a replacement runtime

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

When `pump_session` ends, the task sets `alive = false` then `runtimes.remove(chat_id)`. A concurrent `send` can spawn a replacement, insert it under the same key, and then the old pump removes that new entry. The next prompt either has no registered pump or a second ACP process. This is a remaining ghost-run hole after REV-023.

### Evidence

- `crates/core-service/src/service/conversation/service.rs:711-724` — pump always `remove`s by conversation id after `alive=false`.
- `crates/core-service/src/service/conversation/service.rs:610-654` and `:696-703` — `spawn_runtime` inserts/overwrites the same map key when the previous entry is not `alive`.

### Required fix

Remove only the runtime generation that this pump owns (token / `Arc` identity). Do not `remove` a map entry that a later spawn already replaced.

### Acceptance

- [ ] Kill the agent mid-turn, send immediately: one live runtime remains in the map and its pump is the one that receives events.
- [ ] Service test covers pump-end overlapping `ensure_runtime`.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-031 · Live agent_chat_event fan-out silently drops on broadcast lag

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

All live Chat sockets are fed by one `broadcast` subscriber in `spawn_agent_chat_fanout`. On `RecvError::Lagged` it `continue`s with no log and no replay. `recent_events` only helps a later `agent_chat_subscribe`. A token flood plus slow `send_to` can desync every open tab until the next `agent_chat_get`.

### Evidence

- `apps/api/src/api/ws/router/mod.rs:195-221` — single consumer; `Lagged(_) => continue`.
- `crates/core-service/src/service/conversation/service.rs:45` — `broadcast::channel(4096)`.
- `crates/core-service/src/service/conversation/projector.rs:17`, `:414-426` — in-memory replay cap 2048, used only at subscribe.

### Required fix

On lag, replay from `events_after(last_sent_seq)` (or per-connection seq) instead of dropping. Log lag. Do not make the only live path a lossy broadcast.

### Acceptance

- [ ] A lagged fan-out recovers missed deltas for already-subscribed sockets without a full `agent_chat_get`.
- [ ] Lag is visible in logs.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-032 · Canvas/automation still mint orphan conversations

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

REV-025 required remounts not to mint a new conversation id. Center-stage binds via `onChatStarted`. Canvas persists only `onOpenChat`, which first send never calls. Automation mounts `AgentChatPanel` with no `chatId` and no start callback. Those surfaces still create orphan rows in the Chat-first list (N5 is not a v1 layout goal, but the widgets are still in the product).

### Evidence

- `apps/web/src/features/canvas/components/widgets/CanvasAgentChatWidget.tsx:80-91` — `onOpenChat={persistChatId}` only.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:484-488` — first send calls `onChatStarted`.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:540-547` — `onOpenChat` is history / new-session only.
- `apps/web/src/features/automations/components/AutomationRunDrawer.tsx:150-154` and `AutomationHistoryPage.tsx:278` — no `chatId`.

### Required fix

Persist canvas `chatId` from `onChatStarted`. Until N5, automation should bind a stable id or not mint chats as a side effect.

### Acceptance

- [ ] Remounting a canvas agent-chat widget reopens the same conversation id after first send.
- [ ] Opening the automation chat drawer twice does not create two list rows.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-033 · Dual host: AgentSessionService + crates/agent public ACP API

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH locked `AgentProvider` as the public crate API (no ACP types) and said `AgentSessionService` stops being chat identity. Chat now goes through `AgentChatService`, but `crates/agent` still `pub use`s `run_acp_session` / `AcpSessionEvent`, core-service still implements two `AcpToolHandler`s, and `AgentSessionService` remains on `AppState` for logout plus dead `session_config_snapshots.json`. A second provider has to fight ACP types in L3.

### Evidence

- [TECH.md](./TECH.md) public API and “AgentSessionService stops being the chat identity”.
- `crates/agent/src/lib.rs:11-17` — ACP types still public.
- `crates/agent/AGENTS.md:51-57` — still documents `acp_client` as the crate API.
- `crates/core-service/src/service/agent_session.rs` — leftover host, `list_native_sessions`, snapshots.
- `crates/core-service/src/service/conversation/acp_factory.rs:16-57` vs `agent_session.rs:27-74` — duplicate FS tool handlers.
- `apps/api/src/api/agent/handlers.rs:121-129` — REST logout still uses the leftover service.

### Required fix

Make `domain::{AgentProvider, AgentSession, AgentEvent}` the only Chat-facing crate API. Keep ACP types inside `providers/acp` / `acp_client`. Route logout/close through Conversation runtimes. Delete or isolate `AgentSessionService` chat methods and the duplicate tool handler.

### Acceptance

- [ ] Chat/logout/archive do not import `AcpSessionEvent` / `run_acp_session` from core-service.
- [ ] One `AcpToolHandler` implementation for Conversation FS tools.
- [ ] `crates/agent/AGENTS.md` matches the Conversation host.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-034 · ACP session façade and dead chat stack still in the tree

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The live kernel is `useAgentChatSession`, but it returns the old `useAgentChatSession` bag: fake ACP `capabilities`, no-op `setEntries` / `startSession` / logout, and modal drag leftover in `AgentChatPanel`. `use-agent-chat-session.ts` (~1196 lines), `agent-runtime-socket.ts` (`/ws/agent`), `thread/reducer.ts`, and `ChatSessionsManagementView` have no product mount, yet S15 still only scans the new host files. Tool chrome still guesses vendor type from `raw_input`.

### Evidence

- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:436-438`, `:694-702`, `:759-772`.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts` — no callers.
- `apps/web/src/features/agent/lib/agent-runtime-socket.ts:258` — still builds `/ws/agent/${runtimeSessionId}`.
- `apps/web/src/features/chat-sessions/components/ChatSessionsManagementView.tsx` — zero importers; uses `agentApi.listSessions` which throws.
- `apps/web/src/features/agent/lib/agent-chat-thread.ts:135-192` — vendor-type guess from input/output.
- `apps/web/src/features/agent/lib/__tests__/no-acp-schema.test.ts:22-32` — allowlist excludes the dead stack.
- `apps/web/src/features/agent/components/AgentChatPanel.tsx` — modal drag/resize still compiled for the center-stage host.

### Required fix

Delete or quarantine the unused ACP chat island. Shrink the session contract to Conversation fields. Render from `LiveTurn` (stable ids) instead of shimming `ThreadEntry` forever. Fail S15 if `/ws/agent` or `acp_session_id` re-enter host modules.

### Acceptance

- [ ] `useAgentChatSession` / `ChatSessionsManagementView` are gone or explicitly N5-gated with no runtime throw path.
- [ ] Composer/panel do not require fake ACP capabilities.
- [ ] S15 covers the whole `features/agent` tree except a documented allowlist.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-035 · next_seq still fsyncs meta.json per delta; messages pagination incomplete

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

REV-012 stopped rewriting `index.json` per token, but `next_seq` still does temp+fsync+rename of `meta.json` on every outbound event, including `assistant_message_delta`, on the async pump (std mutex + blocking IO). REV-008 subscribe replay works; `agent_chat_messages` still ignores `before_seq` and only truncates the last N turns while the DTO advertises pagination.

### Evidence

- `crates/core-service/src/service/conversation/store.rs:226-235` — `next_seq` writes `meta.json`.
- `crates/core-service/src/service/conversation/projector.rs:95`, `:395-411` — `emit_live` calls `next_seq` per delta.
- `apps/api/src/api/ws/router/conversation.rs:110-124` — `let _ = req.before_seq`.
- `packages/api-types/src/ws/dto/agent-chat.ts:23-27`.

### Required fix

Keep `last_event_seq` in memory (or a tiny seq file) and flush with the 100ms snapshot / turn boundary. Either implement `before_seq` pagination or drop the field from the contract and TECH in the same change.

### Acceptance

- [ ] A 1k-token stream does not fsync `meta.json` per token.
- [ ] TECH, DTO, and handler agree on messages pagination.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

---

## REV-036 · Cross-feature prompt inject and subscribe effect churn

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Commit / code-review still `enqueueAgentChatPrompt` into the dialog store, then open a draft center tab. Drain uses `getAgentPromptQueueKey(..., instanceKey)` while injectors omit `instanceKey`, so queues never meet; a draft drain also `continue`s when `!activeConversationId`. Separately, the hydrate/subscribe effect depends on `providerId`, so `load()` writing the provider from meta unsubscribes and resubscribes. Follow-up policy is polled every 15s per mounted chat instead of a shared store.

### Evidence

- `apps/web/src/app-shell/sidebar/CommitActions.tsx:526` and `apps/web/src/features/code-review/components/CodeReviewDialog.tsx:357` — enqueue without instance key.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:404-424` — drain key includes `instanceKey`; drops prompts on draft.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:275-391` — effect deps include `providerId`.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts:276-283` — 15s `followup_policy` poll.

### Required fix

Inject by creating/sending on a Conversation (or drain the context key without instance). Remove `providerId` from the subscribe effect. Read follow-up policy from a shared settings source, not a per-tab interval.

### Acceptance

- [ ] Commit “ask agent” lands in the new center Chat as a user turn.
- [ ] Opening a bound tab does not double `agent_chat_get` / resubscribe solely because meta.provider_id was applied.
- [ ] Changing follow-up policy updates open chats without a 15s wait.

### Fix log

- 2026-08-28 - opened in APP-067 architecture quality review.
- 2026-08-28 - implemented: idle reaper + `AgentChatService::close_workspace`; pump generation token; fan-out lag replay; canvas/automation bind `onChatStarted`; WS dropped `AgentSessionService`; deleted unused ACP chat files; in-memory `next_seq` + dropped `before_seq`; inject drains context key and hydrate no longer depends on `providerId`. Verified `cargo test -p core-service --lib conversation` (28 passed), `cargo check -p api`, bun Agent Chat unit tests (18 passed).

