# Brainstorm · APP-067: Document Editor

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

Source material (moved from Downloads):

- [source/Atmos-Editor-PRD-v1.md](./source/Atmos-Editor-PRD-v1.md) — product vision: Tiptap Notion-like / Simple + Agent-in-document + Atmos references
- [source/Atmos-Editor-PRD-v2.md](./source/Atmos-Editor-PRD-v2.md) — architectural correction: Editor is Prompt + Context + Execution Adapter; do not grow a second Agent runtime

## Context

Atmos already has a **CodeMirror file editor** (`apps/web/src/features/editor`), a **read-mostly Project Wiki** (`.atmos/wiki/` markdown viewer), **Canvas** (spatial ops desk), **PT Design** (prototype IR), and a shared **PromptComposer** used by Welcome, Terminal, and Automations.

What is missing is a **document-centric writing surface**: a place to author requirements, plans, and notes, attach real Atmos objects as context, and hand that packet to an existing Agent — without cloning Git, Diff, Terminal, GitHub, Linear, Canvas, or Agent Runtime into a Notion clone.

The two source PRDs agree on the job; they disagree on how Agent work is implemented. v1 leans on Tiptap AI Toolkit as a document AI engine. v2 treats the Editor as a **context builder** that dispatches to Terminal CLI / ACP / current Terminal / Copy Prompt. PRD/TECH **narrow** that: composer + **headless CLI in this editor** + Copy Prompt as citation. No send-to-current-Terminal. No agent file writes.

## Goals (draft)

Primary:

1. Let a builder **write a working document** in the current Project / Workspace without leaving Atmos.
2. Let that document **name real Atmos objects** (file, workspace, branch, GitHub, Linear, …) as references and Agent context — not as pasted blobs.
3. Let the user **run or export** a structured prompt (document + selection + refs) through existing Agent infrastructure.

Secondary:

4. Live preview vs source on **one markdown file**.
5. Stay a file in the worktree, not a second IDE or a Notion clone.

## Critique of the source PRDs

**Keep from both**

- Editor is a **context layer**, not a second workbench.
- Light reference / preview / navigate; heavy tools stay on native pages.
- Shared PromptComposer rather than a third input box.
- No `EditorAgentService`, no Editor-owned Agent catalog, no second Skill/CLI.
- Agent document edits should be reviewable (preview / accept / reject) when they land in the doc.

**Reject or narrow from v1**

- Treating **Tiptap AI Toolkit** as Atmos's document Agent runtime. That binds writing to a paid Tiptap product and duplicates ACP / terminal-agent sessions.
- Shipping the **paid Notion-like template** (Tiptap Start plan / Pro License) as a v1 dependency. Core Tiptap is MIT; the Notion-like template and AI Toolkit are not. Atmos already refuses copyleft/proprietary lock-in without an explicit product decision.
- Under-specified persistence (JSON vs markdown, where files live).

**Reject or narrow from v2**

- v1 P0 that includes ACP + headless CLI + selector + hover previews + automation handoff all at once. That is several products.
- `packages/editor` **or `packages/docs`** as the code name. `features/editor` is CodeMirror; `docs` reads as a document library / Wiki. Locked name: **`@atmos/md-live`** + `features/md-live`.
- Dispatching into the user’s **current Terminal** as a first-class editor action. Editor Agent UX is the docked composer only.
- Embedding a full Execution Selector and Automation/Skill handoff in the first ship.

**The important missing decision (neither PRD locked it)**

Where does the document **live**, and what is the **source of truth**? Canvas uses `~/.atmos/canvas/*.atmos.tldr`. Wiki uses `{project}/.atmos/wiki/`. PT Design uses `~/.atmos/data/pt-design`. A development document that Agents must read should be a **normal markdown file in the worktree**, so `@file` and every terminal agent already understand it.

## Options

### Option A — Tiptap Cloud stack (v1 literal)

Paid Notion-like template + Tiptap AI Toolkit. Documents as Tiptap JSON. Toolkit streams edits into the editor.

**Pros**: Fastest “looks like Notion + AI” demo; official templates for slash / drag / AI preview.
**Cons**: Paid Pro License; AI runtime split from Atmos Agents; JSON files are hostile to git and to CLI agents; NOTICE / license review required.
**Unknown**: Whether a Start-plan subscription is an accepted product dependency.

### Option B — Obsidian-like live markdown (recommended, settled)

Keep the existing `.md` file tab. Today it **opens in CodeMirror Source**; preview is an opt-in read-only `MarkdownRenderer` (auto-on only for `.atmos/reviews/**`). v1 **defaults Live-eligible `.md` to an editable WYSIWYM preview**. File on disk stays UTF-8 `.md`. Light `/` inserts markdown constructs. Selection toolbar turns paragraphs into headings/lists and sends Ask/Rewrite into the docked composer / streaming path. Atmos objects are **`md-live` directives** rendered as inline embeds or block cards (React Node Views) — not hijacked `<a>` chips, and not embedded GitHub/Diff apps.

**Pros**: Matches how Atmos already opens markdown; agents and git see the same file; no Notion-like product; reuses `MarkdownRenderer`, CodeMirror source toggle, Wiki `SelectionPopover`.
**Cons**: Live preview must map caret/selection back to markdown offsets; some GFM (complex tables) stays easier in source.
**Unknown**: none for engine — TECH locks Milkdown (MIT markdown-first); custom Atmos chips via `$node` + React `$view`, not BlockNote / not Tiptap JSON.

### Option B2 — BlockNote / Notion-like (rejected)

Slash, drag handles, nested blocks as a document model.

**Rejected**: Atmos is not a document product. BlockNote markdown is officially lossy. Two slash systems. Wrong comparison set (Notion vs Cursor).

### Option C — Source-only CodeMirror + composer dock (too small)

Leave preview read-only; edit only in source.

**Rejected**: The user pain is exactly “preview can only be looked at.” Composer-on-source does not fix that.

### Option D — Make Wiki writable and Agent-native

Fold this into APP-006 Wiki.

**Pros**: One markdown surface.
**Cons**: Wiki is generated project knowledge (catalog, setup agent, incremental update). Mixing authored working docs with generated wiki will corrupt both jobs.

## Key forks in the road

- **Fork 1 — Persistence**: worktree markdown vs `~/.atmos/data/docs` library vs Tiptap JSON in SQLite. **Decided in PRD:** worktree markdown; New note is untitled then Save as at `{effectivePath}/Untitled.md`; no `docs/` default; no document table.
- **Fork 2 — Writing engine**: Notion-like / BlockNote vs **editable markdown preview** vs source-only. **Decided in PRD:** editable Live preview; CodeMirror as Source; no BlockNote.
- **Fork 3 — Agent runtime**: BlockNote XL AI / Tiptap AI Toolkit vs existing Atmos adapters. **Decided in PRD:** composer + headless CLI in this editor; Copy Prompt is citation; no Terminal send; no agent file writes; stream `text` \| `markdown` + Accept/Reject.
- **Fork 4 — Shell entry**: launchpad overlay (Canvas-style) vs left-sidebar + center tab (PT Design) vs Wiki-style pinned tab only. **Decided in PRD:** existing `.md` file tab; no launchpad; no `"docs"` center kind. Default view becomes Live.
- **Fork 5 — Code name**: `editor` vs `docs`. **Decided in PRD/TECH:** `@atmos/md-live` + `features/md-live`. User-facing **Live** / **Source**. Never steal `features/editor`. Never brand Docs.
- **Fork 6 — Two modes**: Notion-like vs Simple. **Decided in PRD:** dropped. Live vs Source on the file tab (Live becomes the default for eligible `.md`).
- **Fork 7 — New WS APIs**: document CRUD messages vs reuse `fs_read_file` / `fs_write_file`. **Decided in TECH:** reuse `fs_*`; PTY tap only; no Editor session tables.
- **Fork 8 — Wiki / CodeMirror coexistence**: steal `.md` tabs vs separate Docs surface. **Decided in PRD:** Live only on Live-eligible `.md` tabs; review / GitHub / diffs stay dedicated read-only components; Wiki unchanged.

## Open questions

- [x] Zone / number — APP-067 (next after APP-066).
- [x] Default new-file — untitled buffer; Save as `{effectivePath}/Untitled.md` (Canvas `Untitled-N`); no `docs/` folder (PRD M3, TECH D4/D33).
- [x] ACP as v1 Must Have or Nice — Nice (N1). Streaming v1 = headless PTY + `atmos-md-live` fence (TECH D24–D26).
- [x] md-live MCP/CLI in v1 — **no**. Canonical hrefs + worktree markdown are the Agent API.
- [x] Mobile Live markdown — out of v1 (N9).
- [x] How CLI output becomes Live markdown — fence extractor; no Terminal send; Copy is citation-only.

## References

- Existing CodeMirror editor: `apps/web/src/features/editor/`
- Wiki: `apps/web/src/features/wiki/`, APP-006 / APP-007 / APP-008
- Shared composer: `apps/web/src/features/welcome/components/PromptComposer.tsx`
- Terminal composer reuse: `apps/web/src/features/terminal/components/TerminalAgentInputOverlay.tsx`
- AI context chips: `apps/web/src/shared/lib/ai-context-protocol.ts`
- Automations headless runs: APP-017; terminal agent run config: APP-024
- ACP: APP-004, APP-018
- Canvas local files: APP-037 (`~/.atmos/canvas`)
- PT Design shell + isolation: APP-062
- Package boundaries: APP-050, `packages/AGENTS.md`
- FS contract: `packages/api-types/src/ws/contract/fs.ts` (`fs_read_file`, `fs_write_file`, `fs_list_dir`)
- Launchpad: `apps/web/src/app-shell/LeftSidebarLaunchpad.tsx`

## Ready to promote

- Promote to PRD: Live markdown + Agent composer (headless only) + Copy as citation; M20 read-only surfaces; Wiki untouched.
- Promote to TECH: `@atmos/md-live`; Milkdown kit ≥ 7.22; default Live; one mounted editor; `atmos-md-live` fence; `text` \| `markdown`; `MarkdownPatchDiff`; no Terminal send; no `docs_*` WS.
