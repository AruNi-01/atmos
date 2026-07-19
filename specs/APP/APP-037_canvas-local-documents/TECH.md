# TECH · APP-037: Canvas Local Documents

> Technical Design · HOW. Implements PRD APP-037: Canvas Local Documents. Addresses **M1–M15**. N1–N6 deferred unless cheap.

## Scope summary

Replace APP-014’s SQLite `canvas_board.document_json` persistence with **file-backed** documents under `~/.atmos/canvas/*.atmos.tldr`. Add Canvas chrome for listing and switching documents. **No** migration, **no** dual-write, **no** filesystem-less mode.

**Also ships (post-PRD expansion):** durable **document scripts** (`script` on `AtmosCanvasFile`), browser `DocumentScriptHost` (`export default function ({ editor, helpers, signal })`), agent/CLI `script-get|put|status|clear` and one-shot `exec`. Cloud docs remain out of scope.

## Architecture overview

```text
apps/web  features/canvas
  ├─ CanvasDocumentsControl (toolbar popover)
  ├─ use-canvas-document (active path, dirty, load/save)
  └─ CanvasView (tldraw snapshot load/replace)

apps/api  /api/canvas/documents/*
  REST justified: bootstrap + explicit file persistence (same class as old board save)

crates/core-service  CanvasDocumentService
  list / read / write / ensure_dir / sanitize_name

crates/core-engine or service FS helpers
  read/write under expanded ~/.atmos/canvas only (path allowlist)

crates/infra
  DROP canvas_board usage (migration drops table)
  NO board content columns reintroduced
```

**Why REST for documents**: APP-014 already used REST for board bootstrap/save (explicit persisted state, not streaming). List/load/save of files is the same class. Live agent draw remains WS relay (APP-015); unchanged except optional active path in status later (N5).

**Why Server owns FS**: WebView cannot reliably use arbitrary `~/.atmos` without native bridges; Desktop and local-web already talk to loopback Atmos Server. One FS implementation in Rust serves both.

## Resolved decisions

| ID | Decision |
|----|----------|
| D1 | Document root = `dirs::home_dir()/.atmos/canvas` (expand `~` consistently with other Atmos paths). |
| D2 | Extension = `.atmos.tldr` (case-sensitive match on list: prefer lowercase suffix). |
| D3 | File payload = **JSON** `AtmosCanvasFile` envelope (below), not opaque zip, for debuggability and tests. Can evolve later. |
| D4 | Display name = filename stem (strip `.atmos.tldr`). Save As prompts for stem; service sanitizes to safe filename. |
| D5 | First Canvas open: if last-opened path missing (N6 not shipped), open **in-memory untitled** (no path, dirty=false until edit) OR if directory has exactly one file, open it — **prefer untitled empty** for predictability. |
| D6 | Switch = full editor remount or `loadSnapshot` replace; abort any future script host; clear selection. |
| D7 | Dirty = editor store changed since last successful save (or since load if never saved). |
| D8 | Remove `CanvasService` board JSON API; replace with `CanvasDocumentService`. |
| D9 | Drop `canvas_board` table via new migration. |
| D10 | Autosave: **optional Phase 2** — if implemented, debounce ~1s writes only when `path` is set; never autosave untitled without path. Phase 1 may be explicit Save only. |

## Module-by-module design

### crates/infra

- Add migration e.g. `mYYYYMMDD_drop_canvas_board.rs`:
  - `DROP TABLE IF EXISTS canvas_board;`
- Remove entity `canvas_board.rs`, repo `canvas_board_repo.rs`, exports.
- **Do not** add a new table for document content.
- Optional later (N6): last path can live in existing client UI prefs (`localStorage` / ui-pref store), not infra.

### crates/core-service

New service (name: `CanvasDocumentService`):

```rust
pub struct CanvasDocumentService { /* no DbConnection required for content */ }

impl CanvasDocumentService {
    pub fn canvas_dir() -> PathBuf; // ~/.atmos/canvas
    pub fn ensure_canvas_dir(&self) -> Result<()>;
    pub fn list_documents(&self) -> Result<Vec<CanvasDocumentListItem>>;
    pub fn read_document(&self, file_name: &str) -> Result<CanvasDocumentFileDto>;
    pub fn write_document(&self, file_name: &str, body: &AtmosCanvasFile) -> Result<CanvasDocumentListItem>;
    pub fn sanitize_stem(name: &str) -> Result<String>;
}
```

**Path safety**:
- Only allow access to files whose canonical path is **inside** `canvas_dir()`.
- API takes **file name** (e.g. `Ops Desk.atmos.tldr`) or stem; reject `..`, absolute paths, nested dirs in v1 (flat directory only).

**Sanitize stem**:
- Trim; reject empty.
- Replace path separators and reserved chars with `-` or strip.
- Max length e.g. 120 chars.
- Ensure final name ends with `.atmos.tldr`.

**List item**:
```rust
pub struct CanvasDocumentListItem {
    pub file_name: String,    // "Ops Desk.atmos.tldr"
    pub title: String,        // "Ops Desk"
    pub modified_at: String,  // RFC3339 or millis
    pub size_bytes: u64,
}
```

### apps/api

Replace old canvas board routes under `apps/api/src/api/canvas/`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/canvas/documents` | List `*.atmos.tldr` in canvas dir |
| `POST` | `/api/canvas/documents/new` | Create Untitled / Untitled-N |
| `POST` | `/api/canvas/documents/sanitize-name` | Sanitize display name → file name |
| `GET` | `/api/canvas/documents/:file_name` | Read file JSON body |
| `PUT` | `/api/canvas/documents/:file_name` | Write full file (`overwrite` query) |
| `DELETE` | `/api/canvas/documents/:file_name` | Delete file |
| `POST` | `/api/canvas/documents/:file_name/rename` | Rename file |
| `POST` | `/api/canvas/documents/:file_name/duplicate` | Duplicate file |
| ~~GET/PUT~~ | ~~`/api/canvas/default`~~ | **Removed** (no legacy clients) |

Auth: same as existing local API auth for canvas board routes.

DTO request/response use the `AtmosCanvasFile` schema below.

**Justification for REST**: explicit document bootstrap/persistence; not interactive session stream.

### apps/web

#### State hook — replace `use-canvas-board.ts`

`use-canvas-document.ts` (or rename in place):

```ts
type CanvasDocumentState = {
  path: string | null;          // file_name in canvas dir, null = untitled
  title: string;                // display
  dirty: boolean;
  file: AtmosCanvasFile | null; // last loaded/saved envelope
  // plus loading/error
}
```

- Load: `GET` document → apply `tldrawDocument` + `session` into editor (reuse `createCanvasSnapshot` patterns; **drop** `schema: canvas.v1` / `boardSlug` wrapper).
- Save: serialize current editor snapshot into `AtmosCanvasFile` → `PUT`.
- New: reset editor to empty snapshot; `path=null`; `dirty=false` until edit.
- Switch: if dirty → modal; else load selected file and **replace** snapshot.

#### Toolbar — Documents control

- Location: Canvas **top-right** chrome (alongside existing collapse / Atmos toolbar actions in `CanvasView` / `CanvasToolbarChrome` region — implement as a dedicated control in the same top-right cluster, **not** inside tldraw’s leftmost tool dock).
- Control: button showing current `title` + dirty `•` / icon “Documents”.
- Popover content:
  - Search optional (N, skip v1)
  - List sorted by `modified_at` desc
  - Highlight active `file_name`
  - Actions: **New**, row click = open/switch, footer **Save** / **Save As** if not only in main menu
- Save As: dialog for name → sanitize → `PUT` → set path/title
- i18n: `apps/web/messages/en.json` + `zh.json` under `Canvas.documents` (or `canvas.documents`) — update **both** locales; no English pasted into zh.

#### Editor replace

On successful load of another document:

1. Stop listening / flush pending save timers.
2. `editor.loadSnapshot(...)` or remount `Tldraw` with new `snapshot` key=`file_name`.
3. Prefer **keyed remount** (`key={activeFileName ?? 'untitled'}`) to avoid stale custom shape state for terminal/widget cards.

#### Dirty tracking

- Subscribe to store changes (`editor.store.listen`) after load/save; set dirty on document changes.
- Ignore transient selection-only if easy; if hard, treat any store change as dirty (acceptable v1).

#### Remove

- Calls to old `canvasApi.getDefaultBoard` / `saveDefaultBoard`.
- `CANVAS_SCHEMA = canvas.v1` / `boardSlug` validation on client.
- Any seed of default board via DB.

### apps/cli (optional N5)

Out of Phase 1. If touched: `atmos canvas status` may include `active_document: file_name | null` from bridge — not required for M1–M15.

### apps/desktop

No special case beyond local Server already exposing home FS. Ensure `~/.atmos` is the same data home as other Atmos paths (`ATMOS_DATA_DIR` only if product already redirects home-relative dirs — **prefer real user home `~/.atmos/canvas`** as PRD states; do not bury under app support unless TECH audit shows all Atmos user files already do — **lock: use `HOME/.atmos/canvas`** consistent with skills dir `~/.atmos/skills`).

## Data model

### On-disk file: `AtmosCanvasFile`

```json
{
  "schema": "atmos-canvas-file.1",
  "title": "Ops Desk",
  "tldrawDocument": { },
  "session": { "version": 0, "isGridMode": true }
}
```

| Field | Notes |
|-------|-------|
| `schema` | Constant `atmos-canvas-file.1`; reject unknown on read with clear error |
| `title` | Display title; usually equals stem; may be updated on Save As |
| `tldrawDocument` | tldraw document store snapshot (same shape as today’s normalized document) |
| `session` | tldraw session slice needed for restore (grid, etc.) |

**Pages**: all tldraw pages live inside `tldrawDocument` — no per-page files.

**Terminal/widget shapes**: remain records inside `tldrawDocument` (APP-014/027); file does not embed terminal scrollback.

### Removed

```sql
-- dropped
-- canvas_board (guid, slug, name, document_json, ...)
```

### Filename mapping

| Display name (user) | File name |
|---------------------|-----------|
| `Ops Desk` | `Ops Desk.atmos.tldr` |
| `a/b` | sanitized e.g. `a-b.atmos.tldr` |

Collision on Save As: if target exists and is not the current file → error or confirm overwrite (product: **confirm overwrite** in UI).

## Transport

### REST

```http
GET /api/canvas/documents
→ { items: CanvasDocumentListItem[] }

GET /api/canvas/documents/{file_name}
→ AtmosCanvasFile
  (file_name URL-encoded)

PUT /api/canvas/documents/{file_name}
Content-Type: application/json
Body: AtmosCanvasFile
→ { item: CanvasDocumentListItem }
```

Errors:

| Code / status | When |
|---------------|------|
| 400 | invalid name, bad schema, path escape |
| 404 | read missing file |
| 409 | optional: overwrite refused |
| 500 | IO failure |

### WebSocket

No new WS messages required for M1–M15.

## Security & permissions

- **Allowlist directory**: only `~/.atmos/canvas` flat files.
- Reject `../`, absolute paths, symlinks that escape dir (canonicalize + prefix check).
- Auth: same as other local API routes (loopback / session).
- Do not log full file bodies at info level (size can be large).

## Frontend UX details

### Dirty modal (M10)

Copy keys (i18n):

- Title: unsaved changes
- Actions: Save / Don’t Save / Cancel
- If untitled and user chooses Save → open Save As name dialog first, then switch.

### Documents popover empty state

- Message: no documents yet; use Save As to create one under `~/.atmos/canvas`.

### Active indicator (M12)

- Button label = `title` or “Untitled”
- Dirty suffix `•` or filled dot

## Rollout plan

1. **Infra**: migration drop `canvas_board`; remove entity/repo.
2. **Service**: `CanvasDocumentService` + unit tests (sanitize, path allowlist, round-trip write/read in temp dir).
3. **API**: new document routes; delete default board routes; wire `AppState`.
4. **Web API client**: replace canvas board client methods.
5. **Web hook + CanvasView**: load/save/new/dirty without popover.
6. **Toolbar Documents control**: list + switch + dirty modal + Save As.
7. **i18n** en/zh.
8. **Remove dead tests** for `canvas.v1` / board repo; add new tests.
9. Manual dogfood on Desktop: multi-file switch, multi-page save.

## Risks & tradeoffs

- **Tradeoff**: JSON envelope vs binary `.tldr` — JSON wins for testability; larger on disk OK for v1.
- **Risk**: Keyed remount drops ephemeral terminal focus — acceptable; sessions reattach by shape props.
- **Risk**: Large boards slow PUT — acceptable; consider compression later.
- **Rollback**: re-introduce table only by reverting PR; no dual support window.
- **If save fails**: keep dirty=true; toast/inline error; do not clear path.

## Dependencies & compatibility

- Depends on: APP-014 Canvas shell (overlay, tldraw mount), local Atmos Server with FS.
- Supersedes: APP-014 M9 DB persistence approach.
- Breaks: any external tool writing `canvas_board` — none expected.
- Minimum: no BC with `canvas.v1` documents in DB.

## Open questions

- [x] Root, extension, no DB content — product locked.
- [ ] Autosave debounce timing if enabled in Phase 1 — default 1000ms when path set.
- [ ] Overwrite confirm UX copy — use existing dialog primitives.
