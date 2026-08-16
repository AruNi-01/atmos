# TECH · APP-062: PT Design (Prototype Design)

> Technical Design · HOW. Implements PRD APP-062. Addresses **M1–M20**. Nice-to-haves N1–N6 deferred unless noted.

## Scope summary

Ship a **full product**:

1. **`packages/pt-design`** (`@atmos/pt-design`) — Excalidraw prototype surface, **full** shadcn-aligned basic catalog, Blocks, variant UX, Design IR, headless Agent API, **MCP** + **Ink CLI + Skill**.
2. **Atmos embed (required)** — thin host in `apps/web`: **left sidebar** entry opens PT Design in **center stage** (center tool-tab pattern).

**Not**: main `/ws` IR ownership, codegen, live React on board, Atmos Rust CLI, merging with APP-014 Canvas, core logic in apps.

**Ship definition**: package complete (M1–M17, M19–M20) **and** Atmos left sidebar → center open (M18).

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Atmos shell (required host)                                              │
│  left sidebar ──open──► center stage tab "pt-design"                      │
│  apps/web features/pt-design + app-shell registration (thin)              │
└───────────────────────────────▲──────────────────────────────────────────┘
                                │ dynamic import public embed API
┌───────────────────────────────┴──────────────────────────────────────────┐
│  Agent runtimes (package-owned)                                           │
│  A) MCP ──stdio──► pt-design-mcp                                          │
│  B) Skill + shell ──► pt-design (Ink) ──file──► *.ptdesign.json           │
└───────────────────────────────▲──────────────────────────────────────────┘
                                │ shared tool-defs + agent facade
┌───────────────────────────────┴──────────────────────────────────────────┐
│  @atmos/pt-design                                                         │
│  Browser embed (@atmos/pt-design)     Headless (@atmos/pt-design/headless)│
│    PtDesignApp + Excalidraw             CLI + MCP + session               │
│         └──────────────┬─────────────────────┘                            │
│                        ▼                                                  │
│         PtDesignSession · templates · IR · catalog · file store           │
│  SoT = package scene JSON; Excalidraw = browser renderer only             │
└──────────────────────────────────────────────────────────────────────────┘
```

### Dual package entry (critical)

| Export | Used by | May import Excalidraw browser bundle? |
|--------|---------|----------------------------------------|
| `@atmos/pt-design` | Playground, host embed | Yes (client-only) |
| `@atmos/pt-design/headless` | CLI, MCP, Node tests | **No** — CI fails if headless graph imports browser-only modules |

**Template factories** produce package-owned plain element JSON (Excalidraw-compatible fields). `PtDesignSession` applies them without browser APIs. Do **not** rely on `convertToExcalidrawElements` alone for `customData` (known drop risk) — set `customData.pt` after skeleton creation.

### Isolation rules (M1, M13–M16)

| Rule | Detail |
|------|--------|
| Allowed runtime deps | React, ReactDOM, `@excalidraw/excalidraw` (browser path only), **ink**, MCP SDK, pure utils inside package |
| Forbidden imports | `@atmos/api-types`, `@atmos/api-client`, `@atmos/hub-client`, `@atmos/relay-client`, `@atmos/shared`, `@workspace/ui`, `apps/*` incl. **`apps/cli`** |
| Forbidden reverse | No deep imports of `@atmos/pt-design/src/**` |
| Types | IR/Agent DTOs stay in this package |
| CLI ownership | `bin` in this package only |
| Boundary check | Extend monorepo boundary script **and/or** package self-test on `src` + `package.json` |

`packages/AGENTS.md` decision tree row:

> **UI prototype wireframe / Design IR / PT Design MCP or CLI?** → `@atmos/pt-design` (APP-062). Not Canvas (APP-014), not `@workspace/ui`, not `apps/cli`.

## Package layout

```text
packages/pt-design/
  package.json                 # name: @atmos/pt-design
                               # exports: "." embed, "./headless"
                               # bin: pt-design, pt-design-mcp
  AGENTS.md
  README.md
  skills/pt-design/SKILL.md
  src/
    index.ts                   # browser-safe public barrel
    headless.ts                # Node public barrel
    embed/
    core/                      # session, commands, document, ids, custom-data
    ir/
    catalog/
      registry.ts
      shadcn-list.ts           # full basic pin (ship gate)
      priority-waves.ts        # optional impl order only
      blocks/                  # M19 block templates
      templates/               # plain JSON factories
    excalidraw/                # browser-only loaders / library inject
    host/
    agent/
      api.ts
      tool-defs.ts             # single source of names + JSON schemas + CLI map
      errors.ts                # stable error.code enum
    mcp/
    cli/                       # Ink + --json fast path
  playground/
  src/**/*.test.ts
  src/**/fixtures/
```

### Public API

```ts
// @atmos/pt-design — embed
export { PtDesignApp } from "./embed/PtDesignApp";
export type { PtDesignAppProps } from "./embed/PtDesignApp";

// @atmos/pt-design/headless — Node
export { createPtDesignSession } from "./core/session";
export { openDesignDocument, saveDesignDocument, initDesignDocument } from "./core/document";
export type { PtDesignSession, PtDesignCommand, PtDesignSnapshot } from "./core/session";
export type { DesignIR, DesignNode, DesignFrame } from "./ir/schema";
export { encodeDesignIR, applyDesignIR, buildHandoffPayload, normalizeIR } from "./ir/...";
export { listComponentTypes, getComponentTemplate } from "./catalog/registry";
export { PT_DESIGN_TOOL_DEFS } from "./agent/tool-defs";
export type { PersistenceAdapter, HandoffSink, PtTheme } from "./host/adapters";
```

| Binary | Role |
|--------|------|
| `pt-design` | Ink CLI |
| `pt-design-mcp` | MCP stdio |

**Closed names**: binaries as above; design file extension **`.ptdesign.json`**.

## Module-by-module design

### Scene core (M4, M7)

- **SoT**: scene document (elements + appState + files as needed).
- **Session**: `PtDesignSession` applies commands, notifies subscribers.
- **`instanceId`**: generated by session on `place` (UUID/ULID). Agents do not invent ids except when supplying them via `applyIR`.
- **`customData` placement**: **group root only** carries full `pt` block; members may omit or carry only `{ pt: { instanceId } }` reference. IR encode walks group from root.

```ts
type PtCustomData = {
  pt: {
    schemaVersion: 1;
    instanceId: string;
    componentType: string; // bare id: "button"
    catalogVersion: string;
    variant?: string;
    size?: "sm" | "default" | "lg" | string;
    props: Record<string, string | number | boolean | null>;
  };
};
```

- **Frames**: Excalidraw `frame`; IR frame name = frame name.
- **Frame resolution**: tools accept `frameId` **or** unique `frameName`; ambiguous name → structured error `FRAME_AMBIGUOUS`.

### Catalog (M5, M6, M19, M20)

- `catalog/shadcn-list.ts` — **full** basic pin list + `catalogVersion`. **Ship gate**: every id has a template factory and is placeable (no empty unlabeled stubs).
- Optional `catalog/priority-waves.ts` for implementation order only — **not** a reduced ship bar.
- Each type: template factory + allowed **props keys** + declared **variants** (for M20).
- `pt_update` / variant switch regenerates geometry from the matching template while preserving `instanceId`, position, and props when possible.
- **Blocks (M19)**: `catalog/blocks/*` with ids `block.auth-form`, `block.settings-shell`, `block.empty-state`, `block.nav-content` (names exact in registry). Place as grouped templates; IR `componentType` = block id.
- Unknown `componentType` on place → error `UNKNOWN_COMPONENT_TYPE`.

### Design IR (M8)

```ts
type DesignIRVersion = "pt-design-ir/1";

type DesignIR = {
  version: DesignIRVersion;
  catalogVersion: string;
  meta: { title?: string; exportedAt: string; source: "pt-design" };
  frames: DesignFrame[];
  freeNodes: DesignNode[];
};

type DesignFrame = {
  id: string;
  name: string;
  bbox: BBox;
  nodes: DesignNode[];
};

type DesignNode = {
  instanceId: string;
  componentType: string;
  variant?: string;
  size?: string;
  props: Record<string, string | number | boolean | null>;
  bbox: BBox;
  zIndex?: number;
  children?: DesignNode[];
};

type BBox = { x: number; y: number; w: number; h: number };
```

**Encode**: nodes with `pt` customData only; pure freehand may be omitted from IR; scene stays lossless.  
**On open file**: always **re-encode IR from scene**; ignore cached `ir` field for Agent reads (or verify via scene hash).  
**Precedence**: scene is SoT; IR is projection.

#### `applyIR` rules

| Mode | Behavior |
|------|----------|
| `merge` | Upsert by `instanceId`; unknown ids create; **does not delete** instances absent from IR; preserve non-`pt` decoration |
| `replace` | Replace **PT semantic** nodes from IR; **preserve** non-`pt` decoration by default in v1; unknown IR version → error |

Optional `dryRun?: boolean` on `pt_apply_ir`: return counts/diff, no write.

### File-backed documents (M11, M16)

```ts
type PtDesignFile = {
  format: "pt-design-file/1";
  revision: number;              // increments on each successful save
  catalogVersion: string;
  excalidrawCompat: string;      // pinned major, e.g. "0.17"
  scene: unknown;
  ir?: DesignIR;                 // non-authoritative cache only
};
```

- Extension: **`.ptdesign.json`**
- Save: write temp + atomic `rename` on same filesystem.
- **v1 concurrency**: **single-writer**. Concurrent writers unsupported. Optimistic check: if disk `revision` ≠ session revision → error `CONFLICT` (do not clobber).
- CLI Agent mode: each process is **open → mutate → save** (stateless); every mutation command requires `--file`.
- MCP: open file at start (or `PT_DESIGN_FILE`); default **auto-save on** after mutations; still expose `pt_doc_save`.
- **Init**: `pt_doc_init` / `doc init` creates empty valid file. `pt_doc_open` fails if missing unless `--create` / `create: true`.
- In-memory MCP without file: allowed for tests; Skill must warn that state dies with process.

### Shared tool-defs (M9, M14, M15)

Single source: names, JSON Schema, CLI argv mapping, MCP annotations (`readOnlyHint` / `destructiveHint` where SDK allows).

| Tool | CLI | Notes |
|------|-----|--------|
| `pt_catalog_list` | `pt-design catalog list` | readOnly |
| `pt_ir_get` | `pt-design ir get` | `--frame` / `--ids` |
| `pt_scene_get` | `pt-design scene get` | prefer IR; large |
| `pt_place` | `pt-design place <type>` | non-idempotent create |
| `pt_update` | `pt-design update` | by instanceId |
| `pt_delete` | `pt-design delete` | destructive |
| `pt_frame_create` | `pt-design frame create` | |
| `pt_frame_rename` | `pt-design frame rename` | |
| `pt_frames_list` | `pt-design frame list` | readOnly |
| `pt_apply_ir` | `pt-design apply-ir` | `mode` + optional `dryRun` |
| `pt_export` | `pt-design export` | IR default; image opt-in |
| `pt_handoff` | `pt-design handoff` | scopes below |
| `pt_doc_init` | `pt-design doc init` | |
| `pt_doc_open` | `pt-design doc open` | |
| `pt_doc_save` | `pt-design doc save` | |

**Internal only** (not tools): `replaceScene`, low-level select for UI.  
**Headless handoff scopes**: `frame` | `document` | `instanceIds[]`.  
**UI handoff**: also `selection` via app state.

```ts
type HandoffPayload = {
  version: 1;
  prompt?: string;
  ir: DesignIR;
  catalogVersion: string;
  sceneSubset?: unknown;
  image?: { mime: string; base64: string } | null;
  instructions: string; // fixed template below
};
```

**Fixed `instructions` (normative, ship as constant):**

> This is a PT Design wireframe prototype, not production UI. Implement using real components in the target project (prefer shadcn/ui if the repo already uses it). Use `componentType`, props, frames, and relative bbox/containment for structure and hierarchy — do not pixel-chase absolute coordinates with absolute CSS. Do not invent major sections absent from the IR. Visual wireframes are approximate. Prefer Design IR over screenshots; image is optional aid only.

### Agent workflow (Skill + docs)

1. Ensure design file exists (`doc init` if needed).  
2. `catalog list` → `ir get` (**get-before-set**).  
3. Mutate (`place` / `update` / `frame` / …).  
4. `ir get` again to verify.  
5. `handoff` or `export` for implement-later.  
6. Never use Atmos Rust `atmos` CLI for PT Design.

### MCP server (M14)

- `src/mcp/server.ts` + `bin.ts`; stdio; tool list from `tool-defs`.
- Config example:

```json
{
  "mcpServers": {
    "pt-design": {
      "command": "pt-design-mcp",
      "args": ["--file", "./designs/app.ptdesign.json"]
    }
  }
}
```

- Structured tool results JSON; errors use `error.code` from `agent/errors.ts`.
- Path handling: resolve with realpath; optional `--root` / `PT_DESIGN_ROOT` jail; reject escapes.

### CLI + Skill (M15)

- **Ink** for human help/list; **Agent mode**: `--json` or `CI=1` — no Ink chrome on stdout.
- **JSON envelope** (versioned):

```ts
type CliJsonOk<T> = { ok: true; data: T };
type CliJsonErr = { ok: false; error: { code: string; message: string } };
```

- **Exit codes**: `0` ok; `1` usage/validation; `2` not found (file/instance/frame); `3` conflict; `4` internal.
- Every Agent mutation requires `--file`.
- Allow `--props-file` / stdin for large JSON.
- Skill path: `packages/pt-design/skills/pt-design/SKILL.md`.

#### Skill required sections (normative)

1. When to use PT Design  
2. Install / run (`bunx` / monorepo path)  
3. File workflow (init/open/save, `.ptdesign.json`)  
4. Full tool ↔ CLI table  
5. JSON I/O + exit codes  
6. Get-before-set  
7. Handoff → implement-later rules (incl. fixed instructions meaning)  
8. MCP config snippet  
9. Non-goals (no live components, no Atmos `atmos` CLI, no codegen)

Prefer generating the command table from `tool-defs` or testing Skill ⊆ tool-defs.

### Host adapters (M12)

```ts
interface PersistenceAdapter {
  load(): Promise<{ scene: unknown } | null>;
  save(input: { scene: unknown }): Promise<void>;
}

interface HandoffSink {
  accept(payload: HandoffPayload): void | Promise<void>;
}

type PtDesignAppProps = {
  session?: PtDesignSession;
  persistence?: PersistenceAdapter;
  handoff?: HandoffSink;
  theme?: "light" | "dark" | "system";
  className?: string;
};
```

### Embed UI

- Client-only Excalidraw; Sidebar/host chrome for catalog place.
- Export / Copy IR / Give to Agent outside or via `renderTopRightUI`.
- Standalone handoff without sink: clipboard + download file.
- Do not fork Excalidraw.

### Atmos host (M18 — required)

Thin glue only. Reuse existing **center tool tab** patterns (`center-tool-tabs`, `useOpenToolCenterTab`, CenterStage panel switch).

```text
apps/web/src/features/pt-design/
  PtDesignCenterPanel.tsx      # client-only dynamic import of PtDesignApp
  persistence.ts               # host PersistenceAdapter (per context)
  handoff-to-agent.ts          # optional HandoffSink → agent context (N5)
  # i18n: apps/web/messages/{en,zh}.json

apps/web/src/app-shell/
  center-tool-tabs.ts          # PT_DESIGN_TAB_VALUE = "pt-design"
  CenterStage* / workspace-center-frame.tsx
                               # render panel when tab active
  left sidebar                 # control → openToolTab("pt-design")
```

| Concern | Decision |
|---------|----------|
| Entry | Left sidebar **PT Design** (i18n), icon + accessible name |
| Open | `openToolTab(contextId, "pt-design")` + URL `tab=pt-design` |
| Surface | **Center stage** tab/panel — not right-rail-only, not modal-only |
| Close | Standard center tab close |
| Context | One design per `effectiveContextId` (v1) |
| Persist | Host adapter key e.g. `pt-design:scene:{contextId}` |
| Theme | Pass Atmos light/dark into embed |
| SSR | `dynamic(..., { ssr: false })` |
| Desktop | Same web shell in Electron |

Host may depend on `@atmos/pt-design` public API only. No IR types in api-types. No Rust CLI. Copy says **PT Design**, never bare “Canvas.”

## Transport

| Path | Mechanism |
|------|-----------|
| Playground | In-process + localStorage |
| Atmos embed | Center tool tab + host PersistenceAdapter |
| Agent A | MCP stdio |
| Agent B | Ink CLI + Skill + file |
| Core | `PtDesignSession` |

No main `/ws` or REST for package core.

## Security & permissions

- Path: realpath + optional root jail; no ambient crawl.
- Limits (starting points): design file ≤ ~25MB; max elements soft warning; prop string length cap; image max bytes; `pt_scene_get` discouraged without frame filter.
- Validate tool inputs against tool-defs schemas.
- Handoff text untrusted when injected into agents.
- `--json`: errors on stderr (or sole `ok: false` JSON on stdout — **pick envelope above**; success never mixes Ink chrome).
- Image: default off for headless; failure → `image: null`, do not fail IR paths.

## Rollout plan

1. Package skeleton + **exports map** (browser/headless) + boundary checks + AGENTS.md.  
2. File document init/open/save + revision + atomic write.  
3. Session commands + Button template + IR encode + errors.  
4. `tool-defs` + agent facade.  
5. Ink CLI Agent mode (`--json`) + Skill draft.  
6. MCP stdio + parity fixtures + failure tests.  
7. Excalidraw embed playground + handoff UI.  
8. **Full basic catalog (M5)** + **variants (M20)** + **Blocks (M19)**.  
9. Docs / packages AGENTS row.  
10. **Atmos host (M18)**: center-tool-tabs value, left sidebar entry, center panel, host persistence, i18n.  
11. Optional Nice (remote MCP, multiplayer, multi-tab designs, deep agent sink).

**Spec done** = steps 1–10. Not package-only.

## Risks & tradeoffs

- **Headless vs browser**: dual exports + owned templates mitigate Excalidraw Node coupling.  
- **Single-writer files**: simpler than locks; document clearly.  
- **IR lossy vs scene**: agents use IR; artists keep freehand in scene.  
- **Dual Agent entry cost**: mitigated by tool-defs + parity tests.  
- **Ink not Rust CLI**: independence over monorepo CLI consolidation.  
- **Center stage crowding**: reuse center tool-tab open/close/focus; one tab value `"pt-design"`.  
- **Rollback**: remove package dep + host feature + tab registration; additive only.

## Dependencies & compatibility

| Depends on | Notes |
|------------|-------|
| APP-050 | Isolation |
| `@excalidraw/excalidraw` | Browser embed; pin major → `excalidrawCompat` |
| `ink` | CLI |
| MCP TS SDK | stdio server |
| React | peer for embed + Ink |

| Does not depend on | |
|--------------------|--|
| APP-014, main `/ws`, Hub, Relay, `apps/cli` | |

Retain Excalidraw + Ink MIT notices as required.

## Open questions (remaining)

- [x] Binaries `pt-design` / `pt-design-mcp`  
- [x] Extension `.ptdesign.json`  
- [x] componentType bare ids  
- [x] Full product includes Atmos embed (M18)  
- [x] Center tab id `"pt-design"`  
- [x] Headless handoff scopes  
- [ ] Exact left-sidebar visual placement (which section among existing tools) — match nearby tool entries  
- [ ] Host storage: IndexedDB vs existing UI pref hooks — prefer existing host storage patterns  
- [ ] Playground publish vs dev-only  
- [ ] Image export library choice (official Excalidraw export utils preferred in browser)  
- [ ] Full shadcn basic id pin snapshot date (freeze in `shadcn-list.ts` at implement time)

## PRD traceability

| PRD | TECH |
|-----|------|
| M1 | Isolation, boundary, exports |
| M2 | playground/ |
| M3 | Public embed + headless API |
| M4 | Excalidraw embed; naming |
| M5 | Full `shadcn-list` ship gate |
| M6 | catalog ownership |
| M7 | customData root + props schema |
| M8 | IR + scene + image contract |
| M9 | session + tool-defs + parity |
| M10 | handoff scopes + instructions |
| M11 | PtDesignFile + host PersistenceAdapter |
| M12 | host props |
| M13 | AGENTS.md |
| M14 | mcp/* |
| M15 | cli/* + Skill |
| M16 | offline package surfaces |
| M17 | error.code enum |
| M18 | Atmos left sidebar + center tool tab |
| M19 | block.* templates |
| M20 | variant templates + update |
