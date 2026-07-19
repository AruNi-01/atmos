# TEST · APP-037: Canvas Local Documents

> Test Plan · verify file-backed Canvas documents under `~/.atmos/canvas/*.atmos.tldr`, toolbar list/switch, and removal of DB board JSON. References PRD APP-037 and TECH APP-037.

## Test strategy

- **Rust unit/service**: path allowlist, stem sanitize, write/read round-trip, list only `.atmos.tldr`, reject traversal.
- **API-level**: list/get/put documents against temp canvas dir (env override in tests if TECH adds `ATMOS_CANVAS_DIR` for tests — if not, use service-level with injected root).
- **Bun/frontend**: dirty flag, filename mapping helpers, snapshot envelope parse.
- **E2E / agent-browser**: Documents popover, Save As, switch with dirty guard (Desktop or local web with real FS).
- **Manual**: multi-page in one file; confirm no `canvas_board` content path remains.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2 |
| M2 | S1, S2 |
| M3 | S3, S4 |
| M4 | S12 |
| M5 | S5 |
| M6 | S6 |
| M7 | S7 |
| M8 | S7, S8 |
| M9 | S9 |
| M10 | S10 |
| M11 | S11 |
| M12 | S7, S5 |
| M13 | S4 |
| M14 | S1 (service root) |
| M15 | S5, S6 |
| N1–N6 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust unit | `cargo test` | `CanvasDocumentService` path/list tests | temp dir as canvas root | dir created; only `.atmos.tldr` listed | planned |
| S2 | Rust unit | `cargo test` | sanitize + reject `../` | malicious names | Err validation; no write outside root | planned |
| S3 | Rust unit | `cargo test` | write/read `AtmosCanvasFile` | minimal tldrawDocument JSON | file on disk; schema round-trip | planned |
| S4 | Bun or manual | `bun test` / manual | multi-page snapshot in file | editor snapshot with 2 pages | reload shows both pages | planned |
| S5 | E2E or agent-browser | Playwright / agent-browser | Save As flow | empty canvas | file `Name.atmos.tldr` exists; title updates | planned |
| S6 | E2E or Bun | Playwright / bun | Save existing path | already saved doc | second save no rename prompt; dirty clears | planned |
| S7 | E2E / agent-browser | Playwright / agent-browser | open Documents popover | ≥1 file on disk | list visible; active name on button | planned |
| S8 | Rust/API | `cargo test` | list empty dir | empty canvas dir | `items: []` | planned |
| S9 | E2E / agent-browser | Playwright / agent-browser | switch document | two files A/B | view shows B content; button title B | planned |
| S10 | E2E / agent-browser | Playwright / agent-browser | dirty switch | edit then switch | modal Save/Discard/Cancel; Cancel keeps A | planned |
| S11 | E2E / agent-browser | Playwright / agent-browser | New document | any | untitled; empty/default board; dirty after edit | planned |
| S12 | Rust/grep CI | `cargo test` + search | no canvas_board content API | codebase | table dropped; no document_json board save | planned |

## Scenarios

### S1 — Canvas directory and list

- **Level**: Rust unit
- **Given**: a temp directory used as canvas root (test inject).
- **When**: `ensure_canvas_dir` + `list_documents` after writing `a.atmos.tldr` and `notes.txt`.
- **Then**: list contains only `a.atmos.tldr`; root path ends with `.atmos/canvas` in production config.
- **Signals**: list length 1; file_name suffix `.atmos.tldr`.

### S2 — Path traversal rejected

- **Level**: Rust unit
- **Given**: service rooted at temp canvas dir.
- **When**: read/write with `../secrets.atmos.tldr` or absolute path.
- **Then**: validation error; no file created outside root.
- **Signals**: `Err`; filesystem outside root unchanged.

### S3 — File round-trip is source of truth

- **Level**: Rust unit
- **Given**: valid `AtmosCanvasFile` with schema `atmos-canvas-file.1` and a tiny `tldrawDocument`.
- **When**: write then read same file_name.
- **Then**: schema/title/document equal; bytes live on disk under canvas root.
- **Signals**: deep equality of DTO; `std::fs::metadata` size > 0.

### S4 — Multi-page single file

- **Level**: Bun integration or manual
- **Given**: document with two tldraw pages and shapes on each.
- **When**: save and reload file.
- **Then**: both pages and shapes restore; still **one** `.atmos.tldr` file.
- **Signals**: page count 2 after load; single file in directory for that board.

### S5 — Save As with name

- **Level**: E2E / agent-browser
- **Given**: untitled board with at least one shape.
- **When**: user Save As name `Ops Desk`.
- **Then**: `~/.atmos/canvas/Ops Desk.atmos.tldr` (or test root) exists; chrome title `Ops Desk`; dirty false.
- **Signals**: file exists; toolbar title text.

### S6 — Save without re-naming

- **Level**: E2E / Bun
- **Given**: document already saved to path P.
- **When**: user edits and Save.
- **Then**: same path overwritten; no name dialog; dirty false.
- **Signals**: mtime/size change; path unchanged.

### S7 — Documents button and popover list

- **Level**: E2E / agent-browser
- **Given**: Canvas open; ≥1 file on disk.
- **When**: user clicks top-right Documents control.
- **Then**: popover lists local documents; current doc highlighted; button shows current name.
- **Signals**: popover visible; list items match list API.

### S8 — Empty library

- **Level**: Rust/API
- **Given**: empty canvas directory.
- **When**: list documents.
- **Then**: empty array (UI empty state when wired).
- **Signals**: `items.length === 0`.

### S9 — Switch replaces view

- **Level**: E2E / agent-browser
- **Given**: files A and B with distinct shape text; A open, clean.
- **When**: user selects B in popover.
- **Then**: canvas shows B’s content; active title B; A not shown until reopened.
- **Signals**: shape text from B visible; title B.

### S10 — Dirty guard

- **Level**: E2E / agent-browser
- **Given**: A open; user makes unsaved edit; B exists.
- **When**: user selects B.
- **Then**: modal offers Save / Don’t Save / Cancel.
  - Cancel → still A, dirty remains.
  - Don’t Save → B loads; A edits discarded.
  - Save → A written then B loads.
- **Signals**: modal; post-conditions on title and file contents.

### S11 — New document

- **Level**: E2E / agent-browser
- **Given**: any open doc.
- **When**: user chooses New (with dirty guard if needed).
- **Then**: untitled board; path null until Save As.
- **Signals**: title Untitled (i18n); no file yet.

### S12 — DB content store gone

- **Level**: Rust + static check
- **Given**: codebase after migration.
- **When**: run migrations on fresh DB; grep for board document_json save path.
- **Then**: `canvas_board` absent; no API saving board snapshot to DB.
- **Signals**: migration success; tests fail if old `CanvasService::save_default_board` remains.

## Performance & load budgets

- List ≤ 200 documents returns < 200ms on local SSD (soft).
- Save of a typical board (< 5MB JSON) < 1s perceived.

## Regression checklist

- [ ] Terminal cards on a saved board still resolve sessions after reload (shape props intact).
- [ ] Widget shapes survive save/load (APP-027).
- [ ] Canvas agent bridge still works while a file-backed doc is open (APP-015).
- [ ] Switching documents does not leave stale agent selection ids without recovery via get-state.
- [ ] i18n: Documents UI strings in en + zh, zh not English-copied for descriptive words.
- [ ] No write outside `~/.atmos/canvas`.

## Exploratory agent-browser checks

Load Agent Browser skill or `agent-browser skills get core --full` before running.

1. Open Canvas → Save As a named board → kill/reopen app → open from Documents list → board restored.
2. Create two boards; switch back and forth; confirm titles and content match.
3. Edit, attempt switch, exercise Cancel / Don’t Save / Save once each.
4. Add a second tldraw page, save, reopen — both pages present.
5. Narrow window: Documents popover not clipped off-screen; dirty modal readable.
6. Watch console for failed `/api/canvas/documents` calls.

## Acceptance criteria

- [ ] All Must Have PRD items M1–M15 have at least one scenario with signals.
- [ ] S1–S3 and S12 pass automated where feasible.
- [ ] S5–S11 verified via E2E, agent-browser, or recorded manual with reason.
- [ ] No remaining production path saves canvas board content to SQLite.
- [ ] Documents live under `~/.atmos/canvas/` with `.atmos.tldr` suffix.
- [ ] `just lint` / scoped tests pass for touched crates/apps.
- [ ] Coverage Status updated after implementation (`atmos-specs-test-run`).

## Manual verification steps

1. Desktop: Save As `Test Board` → confirm `ls ~/.atmos/canvas/*.atmos.tldr`.
2. Open file in editor: JSON has `schema: atmos-canvas-file.1`.
3. Multi-page edit → save → re-open from popover.
4. Confirm DB has no `canvas_board` table (or empty/unused) after migrate.

## Non-coverage

- Cloud sync, mobile FS, document scripts, CLI docs verbs (N5), rename/delete in popover (N1–N2).
- Concurrent multi-window writers on the same file (last write wins; acceptable v1).
- Import of third-party tldraw.com files.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact commands and remaining gaps.
