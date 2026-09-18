# Brainstorm · APP-075: Agent Sessions

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Agentic builders run Claude Code, Codex, OpenCode, Pi, Grok, and Cursor Agent both inside Atmos Chat and in ordinary terminals. Those CLIs already persist transcripts under their own home directories. Atmos Chat only knows conversations it created (`~/.atmos/data/agent/chats/`). Finding an older CLI session today means hunting jsonl/sqlite by hand, then either `claude --resume` in a TTY or starting a disconnected Atmos chat.

`/agents` already lists **Atmos-owned** chats (`AgentChatSessionsView`). That is not this feature. Agent Sessions is a **host-file browser**: scan local CLI transcripts, preview them, tag rows that already have an Atmos chat, and resume either into Atmos Chat or into a TUI.

Local on-disk layouts for the v1 hosts were inspected from each CLI’s home directory and from two local-first session browsers cloned **outside** this repo for research only. Those clones are not a dependency and must not be named in product code.

## Goals (draft)

- **Primary**: One left-sidebar surface that lists local host sessions for Atmos native agents plus Cursor Agent.
- **Primary**: Preview without copying transcripts onto Atmos chat disk.
- **Primary**: Resume in Atmos Chat only when the user asks and Atmos has no matching chat yet; otherwise open the existing chat. Resume in TUI always uses the host CLI.
- **Secondary**: Filters by agent and by project; virtualized lists; cheap scan.

## Options

### Option A — Preview-only browser, no resume
Scan and show transcripts. User copies an id and resumes in a terminal themselves.

**Pros**: Smallest. No chat import. No PTY spawn.
**Cons**: Misses the actual job: continue work.
**Unknown**: none.

### Option B — Import every scanned session into Atmos chats on first scan
Normalize all host files into `chats/{id}/` up front.

**Pros**: One SOT. Existing chat UI works unchanged.
**Cons**: Writes thousands of files the user never opened. Fights APP-068 (chat jsonl is for Atmos conversations). Duplicates still-growing CLI files. Scan becomes a migration.
**Unknown**: how to stay in sync as CLIs append.

### Option C — Dedicated Agent Sessions sidebar; lazy convert only on Atmos Chat resume
Launchpad item **Agent Sessions**. Left sidebar is the session list (not the workspace tree). Center is the selected transcript. Viewing uses an in-memory host adapter. Atmos jsonl is written only on **Resume in Chat** when no matching `persistence_handle` exists. **Resume in TUI** spawns the host CLI. Rows that already match an Atmos chat get an **Atmos Chat** tag.

**Pros**: Matches the requested product. Respects APP-067/068 restore ≠ resume. Reuses `AgentProvider::resume_runtime` and terminal spawn.
**Cons**: Two resume paths. Preview fold must share event kinds with chat without sharing disk.
**Unknown**: Cursor IDE composer vs Cursor Agent CLI (see forks).

### Option D — Merge into `/agents` Atmos chat list
Add host rows into `AgentChatSessionsView`.

**Pros**: One list.
**Cons**: Mixes Atmos SOT with foreign files. Existing list is chat-identity based (`chat_id`). Filters and empty states collide. User asked for a **separate** left sidebar.

## Key forks in the road

- **Fork 1**: Persist on scan vs persist only on Atmos Chat resume — **settled: lazy convert** (Option C). Decide remaining details in TECH.
- **Fork 2**: Resume always Atmos Chat vs Chat **or** TUI — **settled: both**. PRD.
- **Fork 3**: Replace left-sidebar body vs keep workspace tree and put the list in center — **settled: dedicated left sidebar** named Agent Sessions. PRD / TECH.
- **Fork 4**: Cursor Agent CLI transcripts only vs also Cursor IDE Composer `state.vscdb` — **decide in PRD** (lean CLI-only for v1).
- **Fork 5**: Preview DTO as a new slim message vs fold host files to the same `AgentMessage` chat UI uses — **decide in TECH** (lean one fold → `AgentMessage`).
- **Fork 6**: Durable scan index on disk vs in-memory + watcher — **decide in TECH**.

## Open questions

- [x] Do we convert on view? **No.**
- [x] Do we convert on Atmos Chat resume if a chat already exists? **No; open that chat.**
- [x] TUI resume? **Yes, host CLI in a terminal.**
- [x] v1 hosts? **Native chat hosts + Cursor Agent. Adapter trait reserved for later hosts.**
- [ ] Should a TUI resume prefer an existing workspace terminal mosaic when `cwd` maps to a workspace? → TECH.
- [ ] Subagent / internal Codex threads in the top-level list? → TECH (hide internals; nest or omit children).

## References

- Existing code: `apps/web/src/app-shell/LeftSidebar.tsx`, `LeftSidebarLaunchpad.tsx`, `left-sidebar-controls.tsx`, `features/settings/lib/launchpad-items.ts`
- Existing code: `apps/web/src/features/agent/components/AgentChatSessionsView.tsx` (Atmos chats on `/agents` — do not merge)
- Existing code: `apps/web/src/features/agent/components/AgentChatTranscriptList.tsx` (`@tanstack/react-virtual`)
- Existing code: `crates/agent` `AgentProvider::resume_runtime`, `map/classify.rs`, `providers/*/event_map.rs` (live wires ≠ disk files)
- Existing code: `crates/core-service/src/service/agent_chat/` APP-068 jsonl SOT
- Related specs: APP-067, APP-068, APP-069, APP-004, APP-036, APP-039, APP-048/064
- External: host CLI homes under `~/.claude`, `~/.codex`, `~/.local/share/opencode`, `~/.pi`, `~/.grok`, `~/.cursor` (research clones live outside this repo)

## Search (2026-09-17)

List search today only `includes()` already-fetched titles / cwd / agent labels. Users cannot find a session by a user prompt or assistant reply that is not in the title.

### Options

### Option A — Keep client-side title filter
**Pros**: Already shipped. **Cons**: Does not search transcripts. **Rejected.**

### Option B — One FTS blob per session
Concatenate title + all text into one document (256KB cap).
**Pros**: Few rows. **Cons**: Cannot jump to a message; a cap drops later turns; title weight mixes with body.

### Option C — Per-message FTS rows + title row (settled)
Index `title` as its own row. Index each visible user/assistant text message as its own row, chunked at 32KB. Store a locator (`message_id` + flatten `seq`) so a hit opens the drawer and scrolls to that message. SQLite FTS5 trigram in `atmos.db` for CJK + English. Cheap `list()` stays metadata-only; body index is a background catchup after scan.

**Pros**: Matches “search then jump”; reuses atmos.db / `parse_at` / fold; no new search engine.
**Cons**: First catchup parses jsonl (background). Cursor/Grok parse ids are unstable — `seq` is the fallback.

### Option D — Tantivy / jieba
**Pros**: Stronger ranking / Chinese segmentation. **Cons**: New crate and index directory; worse CJK substring and mixed code. **Rejected** — reuse SQLite.

## Key forks in the road

- **Fork 7**: Client title filter vs server transcript search — **settled: server FTS** (Option C). PRD M13–M16 / TECH.
- **Fork 8**: One blob vs per-message rows — **settled: per-message + title row, 32KB/chunk**. PRD / TECH.
- **Fork 9**: unicode61 vs trigram vs jieba — **settled: FTS5 trigram**. TECH.

## Ready to promote

- Promote to PRD: Option C; separate left sidebar; Atmos Chat tag; lazy convert; TUI + Chat resume; v1 host set; `/agents` stays Atmos-only; full-text search with jump-to-message.
- Promote to TECH: host adapter trait; path table; cheap scan; `host_session_*` WS; fold-to-`AgentMessage` for preview; import path into `AgentChatStore`; TUI spawn; launchpad + `CurrentView`; virtual lists; no third-party product names in code; FTS5 trigram per-message index + locator.
