# REVIEW · APP-069: Agent Chat hits, Grok, fork/rewind - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-09-01  
**Review scope**: functional review + quality review (backend + web)  
**Related code**: `crates/agent/src/providers/**`, `crates/agent/src/catalog/**`, `crates/agent/src/domain/**`, `crates/agent/src/acp_client/**`, `crates/core-service/src/service/agent_chat/**`, `apps/api/src/api/ws/**`, `packages/api-types/src/ws/**`, `apps/web/src/features/agent/**`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-009**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

## Cross-check (2026-09-01)

Implementation slices S0–S8 are done. Review findings REV-001–008 were fixed the same day and re-verified with targeted `app069_` / bun suites (agent 23, core-service 20). This log stays source-backed against PRD M1–M14 and TECH.

**Must Haves that hold in code**

| ID | Result |
|----|--------|
| M1 search hits | Pass — extract + UI; `web_search` not mixed |
| M2 / M3 Grok native | Pass — `grok agent stdio`; no `xai-grok-*` crate |
| M14 native probe | Pass — natives `acp: false`; Grok thinking overlay; `descriptor.support` |
| M4 slash not buttons | Pass — composer has no standing Fork/Rewind |
| M5 native intercept vs ACP | Pass — ACP `send` still prompt; ACP commands not filtered |
| M6 vendor-true chrome | Pass — REV-002 gated Restore code/files on vendor preview |
| M7 / M8 rewind view | Pass — Applied conversation rewind sets `rewind_view`; code restore does not |
| M9 no Atmos file restore | Pass — grep plus temp-workspace Applied `rewind_code` leaves files unchanged |
| M10 / M11 fork + worktree | Pass — sibling `chat_id`; Grok `_x.ai/git/worktree/create` then fork |
| M12 APP-068 transport | Pass — one WS action `agent_chat_session_op_respond`; no REST chat |
| M13 protocol map | Pass — Claude `checkpoint_id` persisted and rehydrated on resume |

**Not claimed**

- Full-repo `just test` / `just lint`
- Live CLI (Grok/Claude/Codex rewind)
- agent-browser exploratory 1–4 (`not_run`: no local web/api)

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | backend | Claude checkpoint uuid never persisted; rewind fails after respawn | verified |
| REV-002 | P1 | backend | Phase-2 Restore code/files not gated on vendor dry_run / `has_file_changes` | verified |
| REV-003 | P2 | test | S15 proves no file restore only via source grep | verified |
| REV-004 | P2 | backend | Pi `/fork` chrome lacks vendor entry picker | verified |
| REV-005 | P2 | test | No core-service Applied rewind → `rewind_view` integration test | verified |
| REV-006 | P2 | backend | Failed session op drops vendor error; UI only clears the card | verified |
| REV-007 | P3 | frontend | New composer picker group names stay hardcoded English | verified |
| REV-008 | P3 | docs | TEST.md execution map Status still `planned` after Coverage Status | verified |

---

## REV-001 · Claude checkpoint uuid never persisted; rewind fails after respawn

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH requires each Claude user turn’s transcript `uuid` to be persisted as `checkpoint_id` so rewind targets survive process unload/resume. `FoldedMessage.checkpoint_id` exists but is never written. Claude only maps Atmos `turn_id` → vendor uuid in in-memory `turn_to_uuid` / `user_uuids`. After idle unload / fresh `ensure_runtime`, those maps are empty. Chrome then sends Atmos `turn.id`; `resolve_checkpoint` cannot find it, so live `/rewind` after respawn cannot hit `rewind_conversation` / `rewind_files`.

Persisting `checkpoint_id` alone is not enough: `resolve_checkpoint` still requires the token to be in `turn_to_uuid` or `user_uuids`. Resume must rehydrate those lists (from jsonl and/or Claude user frames) or accept a stored vendor uuid as a valid target and rebuild the walk list.

### Evidence

- [TECH.md](./TECH.md) Claude section — persist user transcript `uuid` as `checkpoint_id`.
- `crates/core-service/src/service/agent_chat/types.rs` — field exists; `Default` always `None`.
- Grep of `checkpoint_id =` under `crates/core-service` — no assignment. `TranscriptEvent::UserMessage` has no uuid field.
- `crates/core-service/src/service/agent_chat/service.rs` — chrome uses `checkpoint_id` or falls back to `turn.id`.
- `crates/agent/src/providers/claude/mod.rs` — `resolve_checkpoint` only consults in-memory maps.
- `crates/agent/src/providers/claude/mod.rs` — `capture_user_checkpoint` fills those maps only.

### Required fix

1. Persist Claude user-frame top-level `uuid` onto the folded user message / transcript as `checkpoint_id`.
2. On Claude resume, rebuild `user_uuids` (and `turn_to_uuid` when Atmos turn ids are known) from persisted checkpoints or replayed user frames.
3. Prefer the vendor uuid as `target_message_uuid` / `user_message_id` after respawn.

### Acceptance

- [x] After a Claude turn, folded user message (or jsonl) carries vendor `uuid` as `checkpoint_id`.
- [x] Unload runtime, `ensure_runtime` again, `/rewind` to that turn still sends the vendor uuid.
- [x] `cargo test -p agent --lib app069_` and `cargo test -p core-service --lib app069_` pass.

### Fix log

- Persist `AgentEvent::UserCheckpoint` onto jsonl (`TranscriptEvent::UserCheckpoint`); fold stamps `FoldedMessage.checkpoint_id`.
- `spawn_runtime` copies those into `AgentRuntimeConfig.checkpoints`; Claude `open_runtime` rebuilds `user_uuids` / `turn_to_uuid`.
- Chrome uses `turn:{checkpoint_id}` after resume.
- Verified 2026-09-01: `cargo test -p agent --lib app069_ -- --test-threads=1` (23 passed); `cargo test -p core-service --lib app069_ -- --test-threads=1` (`app069_checkpoint_id_persists_and_rehydrates_on_resume`, `app069_live_user_checkpoint_event_folds_onto_user_message`).

---

## REV-002 · Phase-2 Restore code/files not gated on vendor dry_run / `has_file_changes`

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

M6 / TECH two-phase chrome: after turn pick, offer Restore code / Restore files / both **only when the vendor says that checkpoint has file changes**. Service `rewind_restore_options` always emits code/files + both for Claude and Grok.

Claude adapter later no-ops `rewind_files` when dry_run has no changes, so the UI invents a Restore code action that does nothing. Grok TECH says restore files only if `has_file_changes`; points are fetched at execute time, not used to build chrome.

### Evidence

- [TECH.md](./TECH.md) Claude — omit Restore code / both when dry_run has no `filesChanged`. Grok — restore files if `has_file_changes`.
- `crates/core-service/src/service/agent_chat/service.rs` — always pushed `rewind_code` and `rewind_both` for Claude and Grok.
- No `dry_run` / `filesChanged` / `has_file_changes` usage under `crates/core-service/src/service/agent_chat/` when building options.
- Claude dry_run preview only after the user already chose an option.
- Grok `rewind/points` used to resolve prompt index, not to filter chrome.

### Required fix

Before emitting phase-two options, call Claude `rewind_files` dry_run (and Grok points `has_file_changes` for the selected turn) and omit code/files/both when there are no file changes.

### Acceptance

- [x] Checkpoint with no file changes → phase-two options are conversation + cancel only.
- [x] Checkpoint with file changes → conversation, code/files, and both are present.
- [x] Fixture/integration test covers both cases for Claude; Grok points fixture covers `has_file_changes: false`.

### Fix log

- Phase two calls `PrepareSessionOp` Rewind with the selected target. Claude dry-runs `rewind_files`; Grok reads `_x.ai/rewind/points` `hasFileChanges`.
- `rewind_restore_options` omits `rewind_code` / `rewind_both` when `has_file_changes == Some(false)`.
- Verified 2026-09-01: `app069_phase_two_omits_restore_files_when_vendor_has_none`, `app069_phase_two_includes_restore_files_when_vendor_has_changes`, Grok `PrepareSessionOp` on `turn-b` / `turn-a`.

---

## REV-003 · S15 proves no file restore only via source grep

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TEST.md S15 claims Atmos does not `git checkout` / write workspace files on rewind. The covering test only greps three core-service source files for string literals. Production session-op path still looks free of Atmos-side restore, but the test does not prove runtime behavior.

### Evidence

- `crates/core-service/src/service/agent_chat/tests.rs` — `app069_s15_session_op_path_does_not_restore_workspace_files` uses `include_str!` + `contains("git checkout")`.
- Scope is `service.rs` / `apply_event.rs` / `store.rs`; does not assert filesystem side effects.

### Required fix

Keep the grep as a cheap guard if useful. Add a behavioral assertion: apply a native rewind (fake or fixture) against a temp workspace and assert Atmos did not mutate tracked files / did not spawn `git checkout` / `git worktree`.

### Acceptance

- [x] S15 (or successor) fails if session-op finish path writes under chat cwd via Atmos code.
- [x] TEST.md Coverage Status notes the stronger signal.

### Fix log

- Kept the source grep. Added `app069_s15_applied_rewind_does_not_mutate_workspace_files`: marker file in chat cwd, Applied `rewind_code`, bytes unchanged.
- Verified 2026-09-01: both S15 tests in `cargo test -p core-service --lib app069_`.

---

## REV-004 · Pi `/fork` chrome lacks vendor entry picker

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TECH Pi fork chrome: `get_fork_messages` + fork-at-entry options. Service `fork_options` for non-Grok natives only offers a single `fork` button. Pi `PrepareSessionOp` is `Unsupported` (ignored by `begin_session_op`). `fork_session` can call `cmd_fork(entry_id)` when a target is present, but chrome never supplies one, so Pi always `clone`s.

### Evidence

- [TECH.md](./TECH.md) Pi section — `/fork` chrome via `get_fork_messages` + `fork` `{entryId}`.
- Service `fork_options` for non-Grok natives was one `fork` option.
- Pi `PrepareSessionOp` unsupported; `cmd_fork` only when `target` is set.

### Required fix

For Pi, prepare fork options from `get_fork_messages` and pass the selected `entryId` as `RespondSessionOp` target. If product accepts clone-only as v1, document that in TECH (do not leave the honesty table claiming entry pick).

### Acceptance

- [x] Pi `/fork` shows vendor entry choices, **or** TECH is updated to clone-only.
- [x] Selected entry reaches `cmd_fork` in a fixture test (if chrome is kept).

### Fix log

- Pi `PrepareSessionOp` Fork → `get_fork_messages` options (`fork` = Fork here, `fork_entry:{id}`).
- Service uses prepared options when non-empty. `fork_entry:` respond calls `cmd_fork`.
- Verified 2026-09-01: `app069_prepare_fork_lists_vendor_entries`, `app069_fork_entry_sends_cmd_fork`, `app069_pi_fork_chrome_uses_vendor_entry_options`.

---

## REV-005 · No core-service Applied rewind → `rewind_view` integration test

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

M7 is implemented in `finish_session_op_applied`, but `FakeAgentProvider::RespondSessionOp` only returns Applied when `applied_fork_session_id` is set (always a fork result). Service tests cover cancel/fail leaving `rewind_view` unset; they never assert a successful conversation rewind sets `until_turn_id` and folds messages. Store fold tests set `rewind_view` manually.

### Evidence

- `crates/agent/src/testing.rs` — RespondSessionOp → forked or Unsupported.
- `crates/core-service/src/service/agent_chat/tests.rs` — `app069_s13_*` cancel/fail only; `app069_s14_*` store fold.
- `crates/core-service/src/service/agent_chat/service.rs` — Applied rewind does set `rewind_view` for conversation restore.

### Required fix

Extend the fake provider so RespondSessionOp can return unit Applied for rewind, then assert `meta.rewind_view` and folded snapshot after respond.

### Acceptance

- [x] Service test: Applied `rewind_conversation` / turn pick sets `rewind_view.until_turn_id` and hides later turns.
- [x] Applied `rewind_code` does not set `rewind_view`.

### Fix log

- Fake provider `set_applied_rewind(true)` returns unit Applied for rewind.
- `app069_applied_conversation_rewind_sets_view_code_does_not` covers both option ids.
- Verified 2026-09-01: `cargo test -p core-service --lib app069_`.

---

## REV-006 · Failed session op drops vendor error; UI only clears the card

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Domain `SessionOpOutcome::Failed { message }` exists, but `fail_session_op` takes `_message` and emits a closed `Failed` with no text. Web `session_op_resolved` only clears `pendingSessionOp`. A failed `/rewind` after respawn (REV-001) or a vendor error looks like a silent dismiss.

### Evidence

- `crates/core-service/src/service/agent_chat/service.rs` — `_message` unused.
- `crates/core-service/src/service/agent_chat/types.rs` — `AgentChatSessionOpOutcome` has no message.
- `apps/web/src/features/agent/hooks/use-agent-chat-session.ts` — resolved → `setPendingSessionOp(null)` only.

### Required fix

Surface the vendor/service error on `session_op_resolved` (or a nearby inline error) so cancel vs fail are distinguishable. Do not toast success.

### Acceptance

- [x] Failed rewind shows an error next to the composer or on the card.
- [x] Canceled still clears with no error.
- [x] jsonl and `rewind_view` remain unchanged (existing M7 tests still pass).

### Fix log

- `session_op_resolved` carries optional `error`. Failed ops set it; cancel/applied omit it. jsonl is not appended (S13 intact).
- Web `session_op_resolved` failed → `setSendError`; new `session_op_requested` clears it.
- Verified 2026-09-01: `app069_s13_failed_session_op_does_not_set_rewind_view_or_fork` asserts error text; `app069_s13_failed_rewind_leaves_jsonl_and_view` still equal.

---

## REV-007 · New composer picker group names stay hardcoded English

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P3 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

M14 added a `permission_mode` picker. Group label `"Permission mode"` and Grok thinking `"Extra high"` are hardcoded in `descriptorToConfigOptions` / `thinkingLevelLabel`. Session-op card titles are i18n’d; these picker names are not. `Mode` / `Model` / `Thinking` were already English in the same helper (APP-068), so this is not a new architecture, but APP-069’s new strings follow the same gap.

### Evidence

- `apps/web/src/features/agent/lib/agent-chat-thread.ts` — `THINKING_LEVEL_LABELS` including `"Extra high"`.
- `apps/web/src/features/agent/lib/agent-chat-thread.ts` — `name: "Permission mode"`.
- `apps/web/messages/en.json` / `zh.json` — `sessionOpRequested` / `sessionOpFork` / `sessionOpRewind` exist; no `permissionMode` group key.

### Required fix

Wire new APP-069 picker labels through `useTranslations` (or pass translated names from the panel) and add zh keys. Do not ALL-CAPS.

### Acceptance

- [x] zh locale shows translated “Permission mode” / “Extra high” (or equivalent).
- [x] en remains sentence case.

### Fix log

- `Agent.components.chatPanel.pickers` in en/zh. Dropdown and composer thinking slider use `useTranslations`. en is sentence case (`Permission mode`, `Extra high`); zh is `权限模式` / `极高`.
- Verified 2026-09-01: bun `agent-chat-thread`, `config-option-dropdown`, `agent-prompt-composer` tests.

---

## REV-008 · TEST.md execution map Status still `planned` after Coverage Status

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P3 |
| **Area** | docs |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

TEST.md Coverage Status lists S1–S19 as passing, but the Execution map `Status` column is still `planned` for every row. That makes the plan section look unimplemented if read without the appendix.

### Evidence

- [TEST.md](./TEST.md) Execution map — all `planned`.
- Same file Coverage Status — S1–S19 ✅ dated 2026-09-01.

### Required fix

When next editing TEST.md for coverage, set execution-map Status to `covered` (or `covered (see Coverage Status)`) for S1–S19. Do not rewrite scenario bodies.

### Acceptance

- [x] Execution map Status matches Coverage Status for S1–S19.

### Fix log

- Execution map S1–S19 Status set to `covered`. Scenario bodies unchanged.
