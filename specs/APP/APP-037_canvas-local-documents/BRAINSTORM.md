# Brainstorm · APP-037: Canvas Local Documents

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Canvas today (APP-014) persists a single logical board as `canvas_board.document_json` in SQLite: a `canvas.v1` wrapper around a tldraw snapshot. Users cannot name boards, keep multiple boards, or browse local canvas files. That model blocks a file-first workflow (multiple named boards under a known directory, open/switch like documents) and diverges from how people already think about tldraw-style files.

Atmos is local-first (Desktop + local Atmos Server). Product direction: **documents on disk are the source of truth**; no dual-write to DB JSON; no “filesystem-less” product path. Related longer-term ideas (document scripts, richer agent exec) depend on a clean document identity first — this spec owns that foundation.

## Goals (draft)

- Primary: multiple named Canvas documents on disk under a fixed Atmos directory.
- Primary: user can save (with a name), list local documents, and switch the active view.
- Primary: remove DB-backed `document_json` for canvas; no backward compatibility (no users yet).
- Secondary: keep multi-page **inside** one document (tldraw pages ≠ new files).
- Non-goal here: document script runtime, cloud sync, mobile canvas FS.

## Options

### Option A — Single default board in DB (status quo)

Keep `canvas_board` + REST save of JSON wrapper.

**Pros**: already shipped; simple one-board product.  
**Cons**: no multi-doc, no user naming, no file portability, fights “document” mental model.  
**Unknown**: —

### Option B — File-backed documents under `~/.atmos/canvas/` (chosen)

Each board is a `*.atmos.tldr` file. Toolbar document control lists files; open replaces current view; save writes the active file (Save / Save As with name).

**Pros**: clear identity, multi-doc, Git/backup friendly, aligns with local-first Atmos.  
**Cons**: needs FS service via local Server; dirty/switch UX to design.  
**Unknown**: exact on-disk binary vs JSON snapshot packaging (TECH).

### Option C — DB rows per document (no files)

Multiple named boards still in SQLite, no filesystem.

**Pros**: no FS API.  
**Cons**: contradicts product decision; hard to “manage all canvas docs” as files; export/import extra work.  
**Unknown**: —

### Option D — Hybrid file + DB mirror

Files + full JSON copy in DB.

**Pros**: query index in SQL.  
**Cons**: dual-write bugs; product said no DB JSON. Rejected.

## Key forks in the road

- **Fork 1 — Storage truth**: DB JSON vs files → **files** (`~/.atmos/canvas/*.atmos.tldr`). Decide in PRD: locked.
- **Fork 2 — Multi-page vs multi-file**: tldraw pages stay in one document; new file only via New / Save As. Locked.
- **Fork 3 — Web without FS**: product says **not supported** as a path; Canvas document IO assumes local Atmos Server with home-dir FS (Desktop / local-web). Locked.
- **Fork 4 — Compatibility with `canvas.v1` / migrate old rows**: **no migration**, drop table/API. Locked.
- **Fork 5 — Document switch UX**: replace current view vs multi-tab open docs → **replace current view** via popover (user). Dirty prompt decide in PRD/TECH.
- **Fork 6 — Agent (`atmos canvas`) document awareness**: list/open/save verbs later or minimal status field — decide in PRD (Nice vs Must).

## Open questions

- [x] Document root path → `~/.atmos/canvas/`
- [x] Extension → `.atmos.tldr`
- [x] No DB JSON for board content
- [x] Toolbar document button + popover list + switch
- [ ] Dirty switch: block / prompt / autosave-only — **decide in PRD**
- [ ] Default document on first open (empty untitled vs auto `Untitled.atmos.tldr`) — **decide in PRD**
- [ ] Whether file format is tldraw-native archive or Atmos-owned JSON envelope inside `.atmos.tldr` — **decide in TECH**
- [ ] Session-only prefs (grid, camera) vs all in file — **decide in TECH** (prefer all durable state in file)

## References

- Existing code: `crates/core-service/src/service/canvas.rs`, `crates/infra/.../canvas_board*`, `apps/web/src/features/canvas/hooks/use-canvas-board.ts`, `apps/web/src/features/canvas/components/CanvasView.tsx`, `CanvasToolbarChrome.tsx`
- Related specs: `../APP-014_canvas/`, `../APP-015_canvas-terminal-agent-integration/`, `../APP-027_canvas-workspace-surfaces/`
- External: tldraw document / multi-page model; file-backed canvas documents

## Ready to promote

- Promote to PRD: file root, extension, save-with-name, document popover switch, remove DB content store, multi-page stays in-file, no FS-less path, no BC.
- Promote to TECH: FS service layout, remove `canvas_board`, REST or WS for list/load/save, toolbar UI wiring, dirty handling, file payload shape, first-run default doc.
- Defer (not this APP unless PRD pulls in): document script host, `atmos canvas exec`, cloud boards.
