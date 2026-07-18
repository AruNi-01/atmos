# PRD · APP-037: Canvas Local Documents

> Product Requirements · WHAT and WHY. Replace DB-backed single-board Canvas persistence with **named local document files** under `~/.atmos/canvas/`, browsable and switchable from Canvas chrome.

## Context

- **Problem**: Canvas stores one anonymous board in SQLite (`document_json`). Users cannot name boards, keep several working surfaces, or treat Canvas like a normal local document.
- **Why now**: No production users yet — clean break is allowed. Local-first Atmos should own canvas boards as files under a single managed directory. This unblocks multi-board workflows and later file-oriented features (export, scripts, agent “which doc is open”).
- **Related specs**:
  - Supersedes **APP-014** persistence model (M9 single default board in DB) for storage only; Canvas overlay, terminal cards, and tools remain.
  - Does not replace **APP-015** agent draw verbs; may extend status with active document identity (Nice).
  - Compatible with **APP-027** widgets: widget shapes live **inside** the document file like any other shapes.

## Goals

1. **Primary**: Canvas content (all pages, shapes, camera/session needed to restore the board) lives in **local files** `~/.atmos/canvas/*.atmos.tldr`.
2. **Primary**: Users can **save** a board with a **chosen document name**, and **open/switch** among all local canvas documents from a **Documents** control in the Canvas top-right toolbar.
3. **Primary**: Remove canvas board content from the database; no migration, no dual-write.
4. **Secondary**: Clear dirty/save feedback so switching documents does not silently discard work (unless the user confirms).

## Users & Scenarios

- **Primary persona**: Agentic Builder on Atmos Desktop / local Atmos Server who keeps multiple spatial boards (ops desk, architecture, incident).
- **Secondary persona**: Same user returning later — reopen a named board from the list without rebuilding layout.

### Key scenarios

1. First open Canvas → gets a usable empty or default board; can Save As “Ops Desk” → file appears under `~/.atmos/canvas/`.
2. User creates shapes on page 1 and page 2 of the same document → both pages persist in **one** `.atmos.tldr` file.
3. User opens the Documents popover → sees all `*.atmos.tldr` in the canvas directory → picks another → **current view is replaced** by that document.
4. User has unsaved edits, switches document → product prompts to save / discard / cancel (Must).
5. User renames via Save As to a new name → new file (or replace if same path rules in TECH); list updates.

## User Stories

- As a Canvas user, I want to save my board under a name I choose, so I can find it later among multiple boards.
- As a Canvas user, I want a Documents control that lists all my local canvas files, so I can switch boards without leaving Canvas.
- As a Canvas user, I want multiple tldraw pages inside one named document, so pagination is not confused with separate files.
- As a local Atmos user, I want boards on disk under `~/.atmos/canvas/`, so I can back up or browse them outside the app if needed.

## Functional Requirements

### Must Have

- **M1 — Document root**: All Atmos Canvas documents live under **`~/.atmos/canvas/`** (create the directory if missing). No other default root in v1.
- **M2 — Extension**: Documents use the **`.atmos.tldr`** suffix only for recognition in the product list (e.g. `Ops Desk.atmos.tldr`).
- **M3 — File is source of truth**: All canvas graphics, tldraw pages, and durable editor state required to restore the board are stored **in the document file**. The database **does not** store canvas `document_json` / board snapshot content.
- **M4 — Remove DB content store**: Drop the canvas board content persistence path (`canvas_board` content API / table usage for snapshots). **No** backward compatibility and **no** migration of old JSON rows.
- **M5 — Save with name**: User can save the current board. First save or Save As collects a **document name** (display title); product maps it to a file under the document root with `.atmos.tldr`.
- **M6 — Save current**: When a document already has a path, Save writes to that path without re-prompting for a name (unless Save As).
- **M7 — Documents control (toolbar)**: Canvas **top-right toolbar** includes a **Documents** button. Click opens a **popover** (not a full-page route).
- **M8 — List local documents**: Popover lists **all** `*.atmos.tldr` files in `~/.atmos/canvas/` (name + useful metadata such as modified time). Empty state when none exist.
- **M9 — Switch replaces view**: Choosing a document from the list **loads it into the current Canvas view**, replacing the previously shown document (not multi-document tabs in v1).
- **M10 — Dirty guard on switch**: If the current document has unsaved changes, switch/new/open must **not** discard silently — user can save, discard, or cancel.
- **M11 — New document**: User can start a **new** empty document from the Documents UI (and/or explicit New action). New document is dirty until saved to a path.
- **M12 — Active document chrome**: UI shows the **current document name** (and dirty indicator when applicable) so users know what is open.
- **M13 — Multi-page stays in-file**: tldraw **pages** remain pages inside the open document; adding a page does **not** create a new `.atmos.tldr` file.
- **M14 — Local runtime only**: Document list/load/save assume a **local filesystem** via the local Atmos stack (Desktop / local Server). There is **no** “no filesystem” product mode and **no** cloud document library in this spec.
- **M15 — Autosave or explicit save (product minimum)**: At least **explicit Save / Save As** work reliably. Autosave while editing is allowed and recommended in TECH but not required if explicit save + dirty guard are solid; if autosave ships, it must not invent filenames without user naming rules defined in TECH.

### Nice to Have

- **N1**: Rename document from the popover (in-place rename file + title).
- **N2**: Delete document from the popover (with confirm).
- **N3**: Duplicate document.
- **N4**: Reveal in Finder/Explorer / copy path.
- **N5**: `atmos canvas` status/docs verbs reporting active path and listing `~/.atmos/canvas/`.
- **N6**: Remember last-opened document path across app restarts (small local preference, not board content in DB).

## Out of Scope

- **Document script runtime / offline-style `main.js`** — separate future APP; this spec is storage + open/save/switch.
- **Cloud sync / multi-device document library**.
- **Import/export of third-party `.tldr` as a first-class format guarantee** — may round-trip internally; public import UX is not required.
- **Multiple documents open side-by-side or document tabs**.
- **Mobile canvas document manager**.
- **Migrating legacy `canvas_board` rows** — drop only.
- **Changing terminal/widget runtime** beyond persisting their shapes inside the file (APP-014/027 behavior otherwise unchanged).

## Success Metrics

- Leading: users create ≥2 named `.atmos.tldr` files and switch between them in one session.
- Lagging: zero reliance on `canvas_board.document_json` in code paths; board content recoverable only from files under `~/.atmos/canvas/`.
- Qualitative: “I know which board I’m on and where it lives on disk.”

## Risks & Open Questions

- **Risk**: Unsaved switch discards work — mitigated by M10.
- **Risk**: Invalid/corrupt file on open — show recoverable error; stay on previous doc or empty board (TECH).
- **Risk**: Filename collisions / illegal characters in display names — TECH defines sanitization.
- **Open (TECH)**: Exact file payload (tldraw store serialization format).
- **Open (TECH)**: Whether last-opened path uses existing UI prefs store (N6) vs none in v1.

## Milestones

- **Phase 1**: M1–M6, M11–M15 — file IO + save/load current path; remove DB content store.
- **Phase 2**: M7–M10, M12 — Documents toolbar button, list, switch, dirty guard, active name.
- **Phase 3 (optional)**: N1–N6 polish and CLI awareness.

## Decisions locked (from product)

| Topic | Decision |
|-------|----------|
| Source of truth | Document file |
| Directory | `~/.atmos/canvas/` |
| Extension | `.atmos.tldr` |
| DB JSON board content | Removed; no BC |
| FS-less mode | Not supported |
| Multi-page | Inside one document |
| Switch UX | Replace current view via popover |
| Toolbar | Top-right Documents button |
