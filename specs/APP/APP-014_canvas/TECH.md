# TECH · APP-014: Canvas

> Technical Design · HOW. Implements PRD `APP-014: Canvas`.

## Scope summary

This document implements **M1–M12** from the PRD:

- M1 global Canvas as an immersive full-screen overlay launched from Management Center
- M2 collapse / dismiss control inside the overlay
- M3 cross-workspace / cross-project terminal import
- M4 free movement, resize, and full tldraw default toolset (page menu, tools palette, style panel, minimap, undo/redo)
- M5 built-in tldraw shapes (notes, frames, drawings, geo, text, …)
- M6 clear source identity on each terminal card
- M7 live terminal interaction from the canvas
- M8 reveal source workspace/project
- M9 canvas document persistence across sessions
- M10 tldraw user preferences persistence across reloads
- M11 Atmos↔canvas theme sync with user override
- M12 acceptable performance with multiple cards

`N1` (fast add from existing terminal UI) is designed but lands after the core canvas path. `N2–N4` are deferred.

The key design choices are:

- use **tldraw** for the canvas layer, with the **full default tldraw UI** (no tools/actions/components are stripped). Custom Atmos behavior is layered via a custom shape util only.
- keep the existing **tmux + `/ws/terminal/:sessionId`** runtime for live terminal I/O
- use **REST** for canvas document bootstrap and persistence because this is explicit persisted state, not streaming session logic
- tldraw user preferences (theme/color scheme, page list state, snap mode, animation speed, …) are persisted by tldraw's default `getUserPreferences()` machinery in `localStorage` — Atmos does not need its own preferences store.
- Atmos theme (from `next-themes`) is propagated into tldraw via `editor.user.updateUserPreferences({ colorScheme })` so the two stay in sync. Users may still pick a different color scheme from tldraw's own menu; that override remains until the Atmos theme changes again.

## Architecture overview

```text
apps/web
  ├─ (app)/layout.tsx                 # mounts <CanvasOverlay />
  ├─ components/layout/LeftSidebar    # Management Center "Canvas" item
  ├─ components/canvas/CanvasOverlay  # full-screen overlay shell
  └─ components/canvas/CanvasView     # tldraw editor + import + theme bridge
       ├─ Tldraw editor (full default UI)
       ├─ custom canvas-terminal shape
       ├─ CanvasThemeBridge (next-themes ↔ tldraw user prefs)
       ├─ use-canvas-board.ts
       └─ existing terminal Terminal.tsx

apps/api
  └─ /api/canvas/default

crates/core-service
  └─ CanvasService

crates/infra
  └─ canvas_board table + repo

runtime terminal traffic
  CanvasView → existing /ws/terminal/:sessionId → terminal_handler.rs → TerminalService → tmux
```

### Existing code reused

- Global terminals entry: `apps/web/src/components/layout/CenterStage.tsx`
- Global terminals management screen: `apps/web/src/components/terminal/TerminalManagerView.tsx`
- Terminal runtime: `apps/web/src/components/terminal/Terminal.tsx`
- Terminal grid and pane metadata flow: `apps/web/src/components/terminal/TerminalGrid.tsx`
- Persisted workspace/project terminal layout state: `apps/web/src/hooks/use-terminal-store.ts`
- Terminal websocket backend: `apps/api/src/api/ws/terminal_handler.rs`
- Existing project/workspace layout persistence endpoints:
  - `apps/api/src/api/project/handlers.rs`
  - `apps/api/src/api/workspace/handlers.rs`

### Resolved decisions

- **D1**: Canvas is an immersive full-screen overlay, not a route. It lives at the app layout level (next to `<WorkspaceCreationOverlay />`) and is opened by setting the `canvas=true` URL query param. Trigger is the **Canvas** item in Management Center.
- **D2**: Canvas is *not* an embedded tab inside `/terminals`. The previous `manager / canvas` tab switch is removed; `/terminals` simplifies to just `TerminalManagerView`.
- **D3**: tldraw is the canvas engine. We start from the quick-start React integration (`Tldraw` + `tldraw.css`) and layer Atmos-specific behavior via a custom shape util only. **No** `components` / `overrides` / `tools` filtering is applied — the full default tldraw UI ships (main menu, page menu, tools palette, style panel, minimap, helpers, …).
- **D4**: V1 persists one logical board: `default`. The storage model allows rows, but the product surface only exposes one board.
- **D5**: Only the **active** terminal card mounts a full live xterm instance by default. Other cards render a lightweight placeholder shell. This satisfies M7 while protecting M12.
- **D6**: No new app-level `WsAction` variants are added in v1. Existing terminal websocket transport is reused as-is.
- **D7**: Viewport state (camera position and zoom) is persisted as part of the tldraw snapshot.
- **D8**: V1 import flow supports importing panes from all terminal tabs (both the default `"terminal"` tab and any custom `"terminal-tab:*"` tabs created by the user). The picker is rendered as a modal dialog opened from a `+` icon button on top of the overlay.
- **D9**: When a terminal card's referenced tmux window no longer exists, the card enters a "broken reference" state with a visual error indicator and a remove action. It does not attempt to mount a live terminal.
- **D10**: Multi-page support is enabled in tldraw. Users can create multiple pages within the canvas to organize different layouts. Pages are persisted as part of the tldraw snapshot.
- **D11**: Canvas user preferences (color scheme, snap mode, animation speed, page list view state, …) use tldraw's default `localStorage`-backed `TLUserPreferences`. No Atmos-side preferences store is introduced.
- **D12**: Atmos theme is the source of truth for canvas color scheme. A `CanvasThemeBridge` component inside `<Tldraw>` reads `useTheme()` from `next-themes` and on change calls `editor.user.updateUserPreferences({ colorScheme })`. Users may still override the canvas color scheme from tldraw's own preferences menu; that choice persists in tldraw's localStorage until the Atmos theme changes again, at which point Atmos re-asserts.
- **D13**: Schema name is `canvas.v1` (renamed from the earlier `terminal-canvas.v1`) and shape type is `canvas-terminal` (renamed from `terminal-canvas-terminal`). This keeps the naming aligned with the broader Canvas surface that may host non-terminal widgets in future phases.

## Module-by-module design

### crates/infra

#### DB schema changes

Add a new table for the persisted canvas document:

- file: `crates/infra/src/db/migration/m20260512_000024_create_canvas_board.rs`
- entity: `crates/infra/src/db/entities/canvas_board.rs`
- repo: `crates/infra/src/db/repo/canvas_board_repo.rs`

The table stores one JSON document per board row. V1 only uses the `default` row.

```sql
CREATE TABLE canvas_board (
  guid TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
```

Notes:

- This follows the repo's existing pattern of storing layout documents as serialized JSON strings.
- We deliberately do **not** normalize terminal cards into a second table in v1. The canvas document is edited as one unit.
- `slug = "default"` is seeded lazily by the service, not by a hard migration seed.

#### Repo API

`CanvasBoardRepo` should expose:

```rust
pub async fn get_by_slug(&self, slug: &str) -> Result<Option<canvas_board::Model>>;
pub async fn upsert_default(&self, name: &str, document_json: String) -> Result<canvas_board::Model>;
```

### crates/core-engine

No new engine capability is required in v1.

We intentionally reuse:

- `TmuxEngine`
- existing terminal session attach/create behavior
- existing project/workspace filesystem and path knowledge already surfaced into the web app

This keeps the engine layer clean: Canvas is a product-level orchestration feature, not a new terminal capability.

### crates/core-service

Add a dedicated service:

- file: `crates/core-service/src/service/canvas.rs`

Export from:

- `crates/core-service/src/service/mod.rs`
- `crates/core-service/src/lib.rs`

#### Service responsibilities

- load the default board
- lazily create the default board if it does not exist
- persist the full document blob
- validate the top-level schema wrapper before saving

#### Service API

```rust
pub struct CanvasBoardDto {
    pub guid: String,
    pub slug: String,
    pub name: String,
    pub document_json: String,
    pub updated_at: String,
}

pub struct SaveCanvasBoardReq {
    pub document_json: String,
}

impl CanvasService {
    pub async fn get_default_board(&self) -> Result<CanvasBoardDto>;
    pub async fn save_default_board(&self, req: SaveCanvasBoardReq) -> Result<CanvasBoardDto>;
}
```

#### Validation rules

- `document_json` must parse as JSON
- top-level `schema` must equal `canvas.v1`
- top-level `boardSlug` must equal `default`
- the service does **not** deeply validate every tldraw shape in v1; that stays frontend-owned

This mirrors the current terminal layout model where the backend stores the layout payload without owning every frontend detail.

### apps/api

Add a dedicated module:

- `apps/api/src/api/canvas/mod.rs`
- `apps/api/src/api/canvas/handlers.rs`

Wire routes in the main router next to other feature modules.

#### REST endpoints

```text
GET /api/canvas/default
PUT /api/canvas/default
```

#### DTOs

Add shared DTOs in `apps/api/src/api/dto.rs`:

```rust
#[derive(Debug, Serialize)]
pub struct CanvasBoardResponse {
    pub guid: String,
    pub slug: String,
    pub name: String,
    pub document_json: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCanvasBoardPayload {
    pub document_json: String,
}
```

#### Why REST is justified here

Canvas board state is explicit persisted document state, not streaming interactive state. This matches the repo rule that REST is acceptable for startup/bootstrap and settings persistence.

### apps/web

#### Route integration

The existing `/terminals` route remains the global terminals destination:

- route stub: `apps/web/src/app/[locale]/(app)/terminals/page.tsx`
- context resolver: `apps/web/src/hooks/use-context-params.ts`
- center-stage switch: `apps/web/src/components/layout/CenterStage.tsx`

Add a new container component:

- `apps/web/src/components/terminal/TerminalsView.tsx`

`CenterStage.tsx` changes from:

- `currentView === "terminals" -> <TerminalManagerView />`

to:

- `currentView === "terminals" -> <TerminalsView />`

#### URL state

Add a new nuqs group in `apps/web/src/lib/nuqs/searchParams.ts`:

```ts
export type TerminalsView = "manager" | "canvas";

export const terminalsParams = {
  terminalView: parseAsStringEnum<TerminalsView>(["manager", "canvas"]).withDefault("manager"),
};
```

This keeps the current `/terminals` destination stable while allowing direct links to the canvas mode.

#### tldraw integration baseline

The initial client integration follows the tldraw quick start:

```tsx
import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
```

Add the dependency to `apps/web/package.json`:

```json
{
  "dependencies": {
    "tldraw": "<latest compatible version>"
  }
}
```

Implementation lives in a client-only surface:

- `apps/web/src/components/canvas/CanvasView.tsx`

Render pattern:

```tsx
<div className="h-full w-full">
  <Tldraw ... />
</div>
```

The canvas must live inside an explicitly sized container; it should not assume full-window ownership.

#### New frontend files

Recommended structure:

```text
apps/web/src/components/canvas/
  CanvasView.tsx
  CanvasToolbar.tsx
  CanvasModeToggle.tsx
  TerminalSourcePickerDialog.tsx
  TerminalCardInner.tsx
  shapes/
    terminal-card-types.ts
    TerminalCardShapeUtil.tsx
  lib/
    canvas-document.ts
    canvas-import.ts
  hooks/
    use-canvas-runtime.ts
```

Also extract shared terminal-layout parsing out of `use-terminal-store.ts`:

- new file: `apps/web/src/lib/terminal-layout-document.ts`

That parser will be used by both:

- `use-terminal-store.ts`
- canvas import flow

This avoids duplicating the logic for reading persisted pane/layout documents from project/workspace contexts.

#### Canvas object model

Use built-in tldraw shapes where possible:

- notes: built-in `text`
- grouping: built-in `frame`

Add one custom shape type for live terminals:

```ts
export type CanvasTerminalSource =
  | {
      scope: "workspace";
      contextId: string;
      projectName: string;
      workspaceName: string;
      localPath?: string | null;
      terminalTabId: string;  // Preserved to track source tab
      paneId?: string | null;
      tmuxWindowName: string;
      label: string;
    }
  | {
      scope: "project";
      contextId: string;
      projectName: string;
      workspaceName: "Main";
      localPath?: string | null;
      terminalTabId: string;  // Preserved to track source tab
      paneId?: string | null;
      tmuxWindowName: string;
      label: string;
    };

export interface TerminalCardShapeProps {
  w: number;
  h: number;
  source: CanvasTerminalSource;
  title: string;
}

export interface CanvasBoardDocument {
  schema: "canvas.v1";
  boardSlug: "default";
  tldrawSnapshot: unknown;
}
```

`paneId` is a convenience snapshot for local reconciliation; `tmuxWindowName + contextId` remains the durable attach key.

#### Card rendering model

`TerminalCardShapeUtil.tsx` renders a card shell with:

- title bar
- source badge (`project / workspace`)
- actions: activate, reveal source, remove
- body

The body uses three rendering modes:

1. **inactive card**: lightweight placeholder, no live xterm mounted
2. **active card**: mounts `TerminalCardInner`, which mounts the existing `Terminal` component
3. **broken reference card**: when the referenced tmux window no longer exists, displays an error state with a remove action

**D9**: When a terminal card's referenced tmux window no longer exists (e.g., the window was deleted from tmux), the card enters a "broken reference" state. It should:
- Display a clear visual error indicator
- Show an error message explaining the window no longer exists
- Provide a remove/delete action to clean up the broken card
- Not attempt to mount a live terminal

This is the main M10 decision. We avoid mounting N xterm instances just because N cards are visible.

#### Active card registry

`use-canvas-runtime.ts` should keep ephemeral runtime state separate from persisted board state:

```ts
interface CanvasRuntimeState {
  activeShapeId: string | null;
  mountedSessions: Record<string, string>; // shapeId -> sessionId
}
```

This runtime state is **not** saved to the backend.

#### Source import flow

Importing terminals is a frontend orchestration flow:

1. open `TerminalSourcePickerDialog`
2. list projects and workspaces from `useProjectStore`
3. when a context is selected:
   - project → call existing `projectLayoutApi.getLayout(contextId)`
   - workspace → call existing `workspaceLayoutApi.getLayout(contextId)`
4. parse the returned persisted layout document using `terminal-layout-document.ts`
5. show the available panes from that context, organized by terminal tab
6. create one `terminal-card` shape per selected pane, preserving the `terminalTabId` in the shape metadata

**D8**: V1 import flow supports importing panes from all terminal tabs (both the default `"terminal"` tab and any custom `"terminal-tab:*"` tabs created by the user). The picker should display tabs as collapsible sections to make the organization clear.

This avoids inventing a backend catalog endpoint that would need to understand frontend-specific terminal layout internals.

#### Live terminal attachment

When a terminal card becomes active, `TerminalCardInner` mounts the existing `Terminal` component with the source metadata from the shape:

```tsx
<Terminal
  sessionId={crypto.randomUUID()}
  workspaceId={source.contextId}
  tmuxWindowName={source.tmuxWindowName}
  projectName={source.projectName}
  workspaceName={source.workspaceName}
  cwd={source.localPath ?? undefined}
  isNewPane={false}
/>
```

Important:

- terminal cards always **attach** to an existing tmux window in v1
- they do not create new windows from the canvas
- project-scoped cards set `workspaceName = "Main"` to match the current `TerminalGrid.tsx` naming convention

#### Reveal source

Reveal source is a pure router action:

- workspace → `/workspace?id=<guid>`
- project → `/project?id=<guid>`

This is implemented in `CanvasView.tsx` / `TerminalCardInner.tsx` via the existing app router helpers.

#### Persistence flow

`use-canvas-runtime.ts` loads once on entry:

```ts
const board = await canvasApi.getDefault();
```

Then saves debounced updates:

```ts
await canvasApi.updateDefault({ document_json });
```

Persistence is triggered on:

- shape create/delete
- shape move/resize
- note edits
- frame changes
- viewport changes (camera position, zoom)

**D7**: Viewport state (camera position and zoom) is persisted and restored in v1. This provides a better user experience when returning to the canvas.

#### Existing manager coexistence

`TerminalManagerView.tsx` stays intact.

`TerminalsView.tsx` provides:

- mode switch (`manager` / `canvas`)
- shared page frame for the `/terminals` destination

This avoids a new top-level navigation item while still making canvas discoverable.

### packages/ui

Prefer consuming existing primitives from `@workspace/ui` for:

- dialog
- buttons
- tooltips
- badges

Do **not** move tldraw-specific state or API logic into `packages/ui`.

## Data model

### Persisted backend record

```rust
pub struct CanvasBoard {
    pub guid: String,
    pub slug: String,          // "default"
    pub name: String,          // "Canvas"
    pub document_json: String, // serialized CanvasBoardDocument
}
```

### Persisted frontend document

```ts
interface CanvasBoardDocument {
  schema: "canvas.v1";
  boardSlug: "default";
  tldrawSnapshot: unknown;
}
```

### Embedded terminal shape props

```ts
interface TerminalCardShapeProps {
  w: number;
  h: number;
  source: {
    scope: "workspace" | "project";
    contextId: string;
    projectName: string;
    workspaceName: string;
    localPath?: string | null;
    terminalTabId: string;  // Preserved to track source tab
    paneId?: string | null;
    tmuxWindowName: string;
    label: string;
  };
  title: string;
}
```

### What is intentionally not persisted

- xterm instance state
- websocket session ids
- live terminal output buffer
- active mounted card registry

The source-of-truth terminal runtime remains tmux plus the existing terminal websocket attachment flow.

## Transport

### REST

```text
GET /api/canvas/default
PUT /api/canvas/default
```

Request / response shape:

```ts
// GET response
{
  guid: string;
  slug: "default";
  name: string;
  document_json: string;
  updated_at: string;
}

// PUT request
{
  document_json: string;
}
```

### Existing terminal websocket reuse

No new websocket protocol is introduced.

Live terminal cards continue using:

```text
/ws/terminal/:sessionId?workspace_id=...&tmux_window_name=...
```

This reuses the backend in `apps/api/src/api/ws/terminal_handler.rs`.

## Security & permissions

- No new secret material is introduced.
- The persisted canvas document must never store terminal output text or session transcripts.
- Notes are stored as canvas document data only.
- The backend treats `document_json` as opaque data and never renders it as HTML.
- Source reveal stays within existing app routes; no new external URL surfaces are added.

## Rollout plan

1. **Infra + service**: add `canvas_board` table, repo, service, and API endpoints.
2. **Canvas document client**: add `canvasApi`, `use-canvas-runtime`, and the shared `terminal-layout-document.ts` parser extraction.
3. **Terminals entry integration**: replace the `/terminals` center-stage branch with `TerminalsView` and add the manager/canvas URL param.
4. **tldraw shell**: mount `CanvasView` with notes and frames only, load/save the document successfully.
5. **Terminal card shape**: add import flow, custom shape util, active-card live attachment, and reveal-source action.
6. **Performance pass**: ensure inactive cards remain lightweight and only the active card mounts a live terminal.
7. **Phase 2 follow-up**: add fast-add actions from existing `TerminalGrid` surfaces (`N1`).

## Risks & tradeoffs

- **Tradeoff**: storing one JSON document is simpler than normalizing objects into relational tables. We accept weaker backend introspection in exchange for faster iteration and closer alignment with existing terminal layout persistence.
- **Tradeoff**: only the active card mounts a live terminal. This reduces "everything is live at once" fidelity, but protects canvas responsiveness and memory usage.
- **Risk**: tldraw custom shapes with embedded xterm content may expose edge cases around pointer events, focus capture, and resize loops.
- **Risk**: source pane metadata can drift if the workspace/project terminal layout changes after import. The durable attach key is `contextId + tmuxWindowName`, but labels may need periodic reconciliation. The broken reference handling (D9) mitigates this by providing a clear cleanup path when windows no longer exist.
- **If this breaks in production, the rollback path is**: keep `/terminals` defaulted to `manager`, disable the canvas switch in `TerminalsView`, and leave the backend table/API unused. Existing terminal runtime and layouts remain untouched.

## Dependencies & compatibility

- Depends on: `APP-014_canvas/PRD.md`
- External frontend dependency: `tldraw`
- Reuses existing dependencies already in `apps/web/package.json`:
  - `@xterm/xterm`
  - `react-mosaic-component`
  - `zustand`
- Minimum frontend compatibility: current Next 16 / React 19 workspace is acceptable; tldraw version selection must be React-19-compatible when added.
- No new Rust-side external binaries are required.

## Open questions

None. All open questions have been resolved:

- **D7**: Viewport position/zoom is persisted and restored in v1
- **D8**: V1 import flow supports importing panes from all terminal tabs (default + custom)
- **D9**: Broken tmux window references display an error state with a remove action
- **D10**: Multi-page support is enabled in tldraw for organizing different terminal layouts