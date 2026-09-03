# Brainstorm · APP-069: Agent Chat hits, Grok, fork/rewind

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

APP-068 shipped the Atmos descriptor, small runtime, tool/event contract, and native hosts for Claude Code / Codex / OpenCode / Pi. Three follow-ons were explicitly deferred:

- **N1** — workspace grep/glob results stay `Text`; no typed hit lists or file trees.
- **N3** — Gemini / Cursor / Grok stay ACP. HUMAN now wants **Grok Build** as a first-class Chat host (open-source Rust: [xai-org/grok-build](https://github.com/xai-org/grok-build)), and asked whether Atmos can **embed their crates**.
- **N4** — `AgentAction` stays `Steer` / `RespondPermission` / `SetConfig`. HUMAN wants **fork** and **rewind** as Atmos-unified chrome, shown only when that agent’s descriptor supports them.

Terminal Grok already exists as APP-036 (`grok-build` / `grok`). This spec is **Agent Chat**, not Terminal Agent Select.

Trigger: APP-068 v1 is implemented; the deferred items are now product-desired.

## Goals (draft)

- **Primary** — Workspace `search` results can render as Atmos-owned hits (path / line / snippet), not a blob of text, when the adapter can extract them.
- **Primary** — Chat can fork and rewind through **one Atmos control surface**. Composer hides a control when `capabilities.*` is unsupported. Do not add a Claude button, a Codex button, and a Grok button.
- **Primary** — Grok Build in Chat is hosted as well as the APP-068 four, without pulling Grok’s TUI/agent-loop into the Atmos process.
- **Secondary** — Compact / summarize stays out unless PRD promotes it (HUMAN named fork + rewind as the main verbs).

## Options

### Grok hosting

#### Option A — Embed `xai-grok-*` crates in-process

Link Grok’s runtime (`xai-grok-shell`, tools, workspace, auth, …) into `crates/agent` and drive it as a library.

**Pros**: Same language; Apache 2.0; can theoretically call rewind/fork without ACP loss.
**Cons**: `xai-grok-shell` is a full product (TUI-adjacent shell, ACP gateway, MCP, git2, axum, auth, compaction, worktrees). Crates are **path/workspace** members, not a published host SDK. Upstream **does not accept external PRs** and syncs from an internal monorepo — pin/drift risk. Atmos would run **two hosts** (Atmos Chat + Grok’s tool/workspace loop) in one process. APP-068 already rejected embedding vendor SDKs (TS or otherwise); this is the same shape.
**Unknown**: No stable `pub` “embed Atmos as the only UI” API; official editor embed path is **ACP**.

#### Option B — Spawn `grok` and speak its published host wire (recommended)

Same pattern as Claude/Codex/OpenCode/Pi: Chat **overrides** argv; Terminal APP-036 `params` stay untouched. Map Grok frames (ACP + documented `x.ai/*` extensions for rewind/fork/worktree) into Atmos events/actions. Do not depend on `xai-grok-shell` as a crate.

**Pros**: Matches APP-068 native-adapter rule; process isolation; pin a CLI version in testdata; capability honesty.
**Cons**: Grok’s documented embed path is ACP-shaped, so this is “Grok-aware ACP + extensions,” not a second undocumented RPC. Some TUI-only slash commands may have no host method.

#### Option C — Keep generic ACP; only improve tool maps

**Pros**: Smallest diff.
**Cons**: Does not meet “first-class Grok” or N4 mapping for `/rewind` `/fork`.

### N1 workspace hits

#### Option A — Enrich `search` result with typed `hits[]`

Keep kind `search`. Result becomes `SearchHits { query, hits: [{ path, line?, snippet? }] }` when extractable, else today’s `Text`.

**Pros**: No new kind; existing search card grows.
**Cons**: Glob/file-tree vs grep line hits may not share one shape.

#### Option B — New result variant + optional `tree` for glob

**Pros**: Grep vs tree stay honest.
**Cons**: More UI surface.

### N4 fork / rewind

#### Option A — Close the capability set with `fork` and `rewind`; add `AgentAction` variants

Descriptor grows two flags. UI reads descriptor only. Each native/ACP adapter implements or returns `Unsupported`.

**Pros**: Same honesty model as steer.
**Cons**: Vendor **meanings differ** (see forks below). Compact still deferred.

#### Option B — Atmos-only fork (copy transcript → new `chat_id`) without vendor fork

**Pros**: Works for every agent.
**Cons**: Vendor context/session id may not fork; rewind of vendor history still needs a vendor verb.

#### Option C — Also ship compact in this spec

**Pros**: Completes original APP-068 N4.
**Cons**: HUMAN did not ask for it as a primary; another composer control.

## Key forks in the road

- **Fork 1 (Grok)**: Embed crates vs spawn CLI vs stay generic ACP — decide in PRD. Recommendation: **Option B**. Use the open repo as **protocol/fixture source**, not as a Cargo dependency.
- **Fork 2 (Rewind meaning)**: Grok `/rewind` truncates **conversation** and **does not restore files**. Claude `rewind_files` is a **file** undo. Codex/Pi/OpenCode each have their own. Decide in PRD whether Atmos `rewind` = conversation-only, files-only, or **two capabilities**. Do not pretend they are the same verb.
- **Fork 3 (Fork meaning)**: Grok `/fork` copies the session (optional git worktree). Codex `thread/fork`. Atmos already owns `chat_id`. Decide in PRD: new Atmos conversation always, vendor fork when the protocol has it, worktree isolation in/out of v1.
- **Fork 4 (Scope)**: One spec (this directory) vs three specs. Default: **one** APP-069 so descriptor/action/UI stay one change set. Split only if Grok native slips.
- **Fork 5 (Compact)**: In or out of v1 — decide in PRD. Draft: **out**.

## Open questions

- [ ] Confirm Grok Chat host is spawn+map (B), not crate embed (A)? — **decide in PRD**
- [ ] Atmos rewind = conversation truncate, file restore, or two flags? — **decide in PRD**
- [ ] Fork always creates a new Atmos `chat_id`? Vendor worktree in v1? — **decide in PRD**
- [ ] Compact in this spec? — **decide in PRD**
- [ ] N1: grep hits only, or glob file trees too? — **decide in PRD**
- [ ] Gemini/Cursor native still out (N3 remainder)? — **decide in PRD** (draft: out)

## References

- APP-068: `specs/APP/APP-068_agent_chat_arch_optimize/{PRD,TECH,reference}/` — N1/N3/N4 deferred; closed capabilities; no embed SDKs
- APP-036: Terminal Grok Build CLI (`grok-build`), not Chat native
- APP-067: conversation id ≠ provider handle; restore ≠ spawn
- Grok Build: https://github.com/xai-org/grok-build (Apache 2.0; TUI + `xai-grok-shell`; official embed = ACP; `/fork`, `/rewind` conversation-only, `/compact`)
- Grok sessions guide: `crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md` upstream
- Current Chat Grok: `chat_provider_kind` → ACP; `capabilities_for_provider("grok")` steer unsupported
- `crates/agent/src/domain/{descriptor.rs,action.rs}` — four capabilities; three actions

## Ready to promote

- Promote to PRD: N1 typed search hits; Grok as fifth Chat host **without** embedding crates; fork + rewind as descriptor-gated Atmos actions; honesty (hide when unsupported); rewind/fork product meanings; compact out unless HUMAN overrides.
- Promote to TECH: extend `AgentCapabilities` / `AgentAction`; Grok provider tree vs ACP-extension mapper; search result schema; WS names stay `agent_chat_*` plus new actions if needed; Terminal argv freeze.
