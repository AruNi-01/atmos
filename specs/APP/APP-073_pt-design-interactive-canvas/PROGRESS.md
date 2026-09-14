# PROGRESS · APP-073: PT Design Interactive Canvas

> Implementation Progress · current state, handoff notes, blockers, and verification status. This file is not a requirements source.

## Status

- **State**: done
- **Branch**: `feat/pt-design-interactive-canvas`
- **Last updated**: 2026-09-14
- **Current owner**: long-task parent (orchestrator)
- **Current phase**: TEST coverage closed — Playwright **10/10** (S5/S6/S9/S10/S11/S21/S29/S30/S31/S33)

## Snapshot

- **Done**: S0–S12 review-pass. Live `:3130`+`:31303` official Playwright **10/10** including S5 dialog+auth-form, S30 apply undo, S33 PNG. bun `src` **241 pass / 1 skip**.
- **Next**: none for impl. S24 agent-browser still blank hydrate (Playwright covers Edit/Interact). S27 dual-client not run (source NEVER + crypto).
- **Blocked**: none
- **Must not touch from parent**: `packages/**`, `apps/**`, `crates/**` (parent is orchestrator only)

## Implementation Checklist

- [x] Wave 0 — PTX protocol (`parse` / `serialize` / `validate` / `extract` / `project` / bundle)
- [x] Wave 1 — headless session + form + overlay component groups
- [x] Wave 2 — display + block component groups
- [x] Wave 3 — component registry glue (every frozen id has a Renderer)
- [x] Wave 4 — live board + overlay + Edit/Interact
- [x] Wave 5 — Agent PTX tools + Skill + host persistence/i18n + collab `NEVER`
- [x] Wave 6 — delete IR/old tools; barrels; `AGENTS.md`
- [x] `atmos-specs-test-run` against TEST.md (Coverage Status: e2e 10/10; S24 agent-browser not_run; S27 source-level)
- [x] Wave 8 — Load PTX-only persist → overlay handles (bun only; live Chromium still empty)
- [x] Wave 9 — Live Excalidraw restore/onChange keeps `customData.pt` (E2E overlay ids)
- [x] Wave 10 — Edit drag extract + Cmd+Z (TEST S9/S21/S30/S31)
- [x] Wave 11 — Overlay viewport origin = Excalidraw canvas (live Edit drag)
- [x] Wave 12 — Cmd+Z after pt_ptx_apply reverts extract (TEST S30 bun fake-host)
- [x] Wave 13 — Live Excalidraw Cmd+Z after `pt_ptx_apply` reverts extract (TEST S30 Playwright 8/8 on `:3130`+`:31303`)

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `packages/pt-design/src/protocol/**` | hot files; `src/agent/**`; `src/embed/**`; `src/index.ts`; `src/headless.ts`; `src/catalog/**` except read `shadcn-list.ts` | — | done | ok | pass | `cd packages/pt-design && bun test src/protocol` |
| S1 | 1 | `packages/pt-design/src/core/headless-session.ts`, `packages/pt-design/src/core/headless-session.test.ts` | `headless.ts`; `index.ts`; `src/protocol/**` | S0 | done | ok | pass | `cd packages/pt-design && bun test src/core/headless-session` |
| S2a | 1 | `packages/pt-design/src/components/groups/form/**` | `registry.ts`; other groups; hot files | S0 | done | ok | pass | `cd packages/pt-design && bun test src/components/groups/form` |
| S2b | 1 | `packages/pt-design/src/components/groups/overlay/**` | `registry.ts`; other groups; hot files | S0 | done | ok | pass | `cd packages/pt-design && bun test src/components/groups/overlay` |
| S2c | 2 | `packages/pt-design/src/components/groups/display/**` | `registry.ts`; other groups; hot files | S0 | done | ok | pass | `cd packages/pt-design && bun test src/components/groups/display` |
| S2d | 2 | `packages/pt-design/src/components/groups/blocks/**` | `registry.ts`; other groups; hot files | S0 | done | ok | pass | `cd packages/pt-design && bun test src/components/groups/blocks` |
| S2e | 3 | `packages/pt-design/src/components/registry.ts`, `packages/pt-design/src/components/index.ts`, `packages/pt-design/src/components/types.ts`, `packages/pt-design/src/components/registry.test.ts` | group folders; hot files | S2a–S2d | done | ok | pass | `cd packages/pt-design && bun test src/components/registry.test.ts` |
| S3 | 4 | `packages/pt-design/src/embed/live-board.ts`, `packages/pt-design/src/embed/overlay/**`, `packages/pt-design/src/excalidraw-bridge/**`, `packages/pt-design/src/editor/**` | `PtDesignApp.tsx`; `ExcalidrawBoard.tsx`; `index.ts` | S0, S2e | done | ok | pass | `cd packages/pt-design && bun test src/embed/live-board src/embed/overlay src/excalidraw-bridge src/editor` |
| S4 | 5 | see S4 card Owns | IR delete (S5) | S1, S3 | done | ok | pass | scoped bun tests + i18n key grep |
| S5 | 6 | see S5 card Owns | `shadcn-list.ts`; `protocol/**`; `components/groups/**`; APP-062 specs | S4 | done | ok | pass | `cd packages/pt-design && bun test src` |
| S6 | 7 | see S6 card Owns | protocol; groups; e2e skip logic | S5 | done | ok | pass | unskip S17 bun assert + `bun test src/embed/live-board` |
| S7 | 8 | see S7 card Owns | protocol; groups; e2e skip-as-green | S6 | done | ok | pass | bun load `{ptx}` → overlay ids; no max-update-depth |
| S8 | 9 | see S8 card Owns | protocol; groups; e2e skip-as-green | S7 | done | ok | pass | bun restore-drop + delayed empty onChange still extract overlay ids |
| S9 | 10 | see S9 card Owns | protocol; groups; e2e skip-as-green | S8 | done | ok | pass | bun: Edit drag extract spatial; apply IMMEDIATELY undoable; Interact no canvas undo |
| S10 | 11 | see S10 card Owns | protocol; groups; e2e skip-as-green | S9 | done | ok | pass | bun: overlay origin = canvas; Edit handle not locked; viewMode false |
| S11 | 12 | see S11 card Owns | protocol; groups; e2e skip-as-green | S10 | done | ok | pass | bun: undo after applyPtx restores previous extract payload |
| S12 | 13 | see S12 card Owns | protocol; groups; e2e skip; TEST.md bodies | S11 | done | ok | pass | #20 live S30 green (8/8) |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

**Impl**: `—` · `running` · `ok` · `blocked`
**Review**: `—` · `running` · `pass` · `fail`

## Slice Cards

### S0 — PTX protocol

- **Wave**: 0 (serial)
- **Goal**: Land frozen protocol: parse/serialize/validate PTX (full catalog tags + nested children), extract/project fake handles, bundle IO. Smoke tests covering TEST S1, S2, S4, S7, S8, S13-orphan-parse, S15-protocol, S19, S35, S36, S37, and every frozen catalog id as a parseable type.
- **Out of scope**: React renderers, Excalidraw, Agent tools, `index.ts` / `headless.ts` re-exports, editing `agent/errors.ts`, deleting IR.
- **Owns**: `packages/pt-design/src/protocol/**` (create the directory)
- **Forbids**: `packages/pt-design/src/index.ts`, `packages/pt-design/src/headless.ts`, `packages/pt-design/src/embed/**`, `packages/pt-design/src/agent/**`, `packages/pt-design/src/catalog/**` (read `shadcn-list.ts` only), `apps/**`, `**/AGENTS.md`, this `PROGRESS.md`
- **Reads (read-only)**: `packages/pt-design/src/catalog/shadcn-list.ts`, `packages/pt-design/src/isolation.test.ts` (must stay green: protocol must not import `@excalidraw/excalidraw` or forbidden `@atmos/*`), TECH.md Wave 0 contract, TEST.md S1/S2/S4/S7/S8/S35/S36/S37
- **Depends**: —
- **Invariants** (from TECH): see dispatch brief
- **Verify**: `cd packages/pt-design && bun test src/protocol`
- **Review checklist**:
  1. `protocol/index.ts` does not import `node:fs` and does not re-export bundle; `bundle.ts` is the only protocol file using `node:fs`.
  2. Every `SHADCN_BASIC_IDS` + `REQUIRED_BLOCKS` id round-trips via `catalogIdToXmlTag` / `xmlTagToCatalogId`; `block.auth-form` serializes as `<block-auth-form>`.
  3. Nested catalog tags become `children`; `projectDocument` creates one handle per page-level node; freehand (no `customData.pt`) is preserved; missing pt ids are dropped.
  4. Orphan `<option>` (no `<page>`) → `invalid_ptx`; option missing `value` → `invalid_option`; unknown tag → `invalid_ptx`.
  5. No import of `@excalidraw/excalidraw` or `agent/errors.ts`. Error codes are lowercase TECH strings.
  6. `FILES` ⊆ Owns.
- **HUMAN open questions**: none

### S1 — Headless PTX session

- **Wave**: 1
- **Goal**: `getPtx` / `applyPtx` on an in-memory + disk AST session using protocol. No Excalidraw.
- **Out of scope**: live board, tools registration, barrel re-exports
- **Owns**: `packages/pt-design/src/core/headless-session.ts`, `packages/pt-design/src/core/headless-session.test.ts`
- **Forbids**: `headless.ts`, `index.ts`, `src/protocol/**`, embed, agent
- **Depends**: S0
- **Verify**: `cd packages/pt-design && bun test src/core/headless-session`
- **Review checklist**: apply invalid PTX leaves previous doc; get returns pretty XML; no `@excalidraw/excalidraw`

### S2a — Form group renderers

- **Wave**: 1
- **Goal**: Real Interact renderers + `defaultNode` for: `button`, `button-group`, `checkbox`, `combobox`, `date-picker`, `field`, `form`, `input`, `input-group`, `input-otp`, `label`, `native-select`, `radio-group`, `select`, `slider`, `switch`, `textarea`, `toggle`, `toggle-group`, `calendar`. Select/combobox/native-select = in-overlay lists, not OS popups / `document.body` portals.
- **Owns**: `packages/pt-design/src/components/groups/form/**`
- **Forbids**: `src/components/registry.ts`, other `groups/**`, hot files
- **Depends**: S0
- **Verify**: `cd packages/pt-design && bun test src/components/groups/form`

### S2b — Overlay group renderers

- **Wave**: 1
- **Goal**: In-place canvas panels for: `alert-dialog`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `hover-card`, `menubar`, `navigation-menu`, `popover`, `sheet`, `toast`, `sonner`, `tooltip`, `command`. No `document.body` portals.
- **Owns**: `packages/pt-design/src/components/groups/overlay/**`
- **Forbids**: `registry.ts`, other groups, hot files
- **Depends**: S0
- **Verify**: `cd packages/pt-design && bun test src/components/groups/overlay`

### S2c — Display group renderers

- **Wave**: 2
- **Goal**: Remaining `SHADCN_BASIC_IDS` not in S2a/S2b (**32**): accordion, alert, aspect-ratio, attachment, avatar, badge, breadcrumb, bubble, card, carousel, chart, collapsible, data-table, direction, empty, item, kbd, marker, message, message-scroller, pagination, progress, questionnaire, resizable, scroll-area, separator, sidebar, skeleton, spinner, table, tabs, typography.
- **Owns**: `packages/pt-design/src/components/groups/display/**`
- **Depends**: S0
- **Verify**: `cd packages/pt-design && bun test src/components/groups/display`

### S2d — Block trees

- **Wave**: 2
- **Goal**: `block.auth-form`, `block.settings-shell`, `block.empty-state`, `block.nav-content` as PTX trees (`defaultNode` emits nested children of existing types).
- **Owns**: `packages/pt-design/src/components/groups/blocks/**`
- **Depends**: S0
- **Verify**: `cd packages/pt-design && bun test src/components/groups/blocks`

### S2e — Registry glue

- **Wave**: 3 (serial)
- **Goal**: Merge group maps; **every** frozen id has a Renderer + defaultNode. Missing id fails the test.
- **Owns**: `packages/pt-design/src/components/registry.ts`, `packages/pt-design/src/components/index.ts`, `packages/pt-design/src/components/types.ts`, `packages/pt-design/src/components/registry.test.ts`
- **Depends**: S2a, S2b, S2c, S2d
- **Verify**: `cd packages/pt-design && bun test src/components`

### S3 — Live board mapping (new files)

- **Wave**: 4 (serial)
- **Goal**: `LiveBoard` extract/project; overlay follows handles; Edit vs Interact pointer rules; captureUpdate IMMEDIATELY vs NEVER as TECH table. Do not edit `PtDesignApp.tsx` / `ExcalidrawBoard.tsx` yet.
- **Owns**: `packages/pt-design/src/embed/live-board.ts`, `packages/pt-design/src/embed/overlay/**`, `packages/pt-design/src/excalidraw-bridge/**`, `packages/pt-design/src/editor/**`
- **Depends**: S0, S2e
- **Verify**: targeted bun tests under those dirs

### S4 — Hot files + host + tools

- **Wave**: 5 (serial)
- **Goal**: Wire embed chrome, new tools (`pt_ptx_get` / `pt_ptx_apply` / …), v2 persistence, i18n Edit/Interact, collab remote `NEVER`.
- **Owns**:
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/use-collab.ts`
  - `packages/pt-design/src/isolation.test.ts`
  - `packages/pt-design/src/agent/tool-defs.ts`
  - `packages/pt-design/src/agent/session-tools.ts`
  - `packages/pt-design/src/agent/api.ts`
  - `packages/pt-design/src/agent/mutating.ts`
  - `packages/pt-design/src/index.ts`
  - `packages/pt-design/src/headless.ts`
  - `packages/pt-design/src/host/adapters.ts`
  - `apps/web/src/features/pt-design/**`
  - `apps/web/messages/en.json`
  - `apps/web/messages/zh.json`
- **Depends**: S1, S3
- **Verify**: scoped package tests + locale keys `ptDesign.mode.edit` / `interact`
- **Review checklist**:
  1. `FILES` ⊆ Owns；未删 `src/ir`；未改 `protocol/**` / `groups/**` / `**/AGENTS.md`
  2. 直播板无平行 session store：`PtDesignApp` 用 `createLiveBoard`，不 `replaceSession` / `createPtDesignSession` 当 SoT
  3. `PersistenceAdapter` = `PtPersistV2 { ptx, canvas?, files? }`；key 前缀 `pt-design/v2/`；旧 `{ scene }` / `pt-design:scene:` 忽略不 throw
  4. Load：restore canvas `NEVER` → 缺 handle `project` `NEVER` → `clearHistoryOnLoad`；Save：`extractPtx` + scene dump
  5. Capture：`pt_ptx_apply` / Palette `IMMEDIATELY`；Overlay commit / collab remote / theme / `setMode` `NEVER`
  6. Interact `viewModeEnabled` true；Edit false；ModeToggle 文案 Edit / Interact（i18n 注入）
  7. 新工具 `pt_ptx_get` / `pt_ptx_apply` / `pt_catalog_list` XML 示例；非法 apply → `invalid_ptx` 且文档不变；`mutating.ts` 含 `pt_ptx_apply`。旧 `pt_ir_*` 可仍存在（S5 删）
  8. Browser `index.ts` 不 export / import `createHeadlessSession`；`isolation.test.ts` 断言新 chrome 且 embed 无 `node:fs`
  9. Web `storage-key` 为 v2；center panel 不再 persist `{ scene }`；`en.json`+`zh.json` 有 `ptDesign.mode.edit` / `interact`，中文非英文复制

### S5 — Delete APP-062 internals

- **Wave**: 6 (serial)
- **Goal**: Remove IR, old tool names, wireframe templates-as-API. Keep `shadcn-list.ts`. Update package AGENTS.md, packages/AGENTS.md (pt-design rows), and `skills/atmos-pt-design-agent` to PTX-only.
- **Owns**:
  - `packages/pt-design/**` except forbids
  - `skills/atmos-pt-design-agent/**`
  - `packages/AGENTS.md` (pt-design row + decision-tree item 11 only)
  - `apps/web/src/features/pt-design/**`
  - `apps/web/messages/en.json`
  - `apps/web/messages/zh.json`
- **Forbids**:
  - `packages/pt-design/src/catalog/shadcn-list.ts` (frozen ids; import only)
  - `packages/pt-design/src/protocol/**`
  - `packages/pt-design/src/components/groups/**`
  - `packages/pt-design/src/core/headless-session.ts` (AST/PTX contract; import only)
  - `specs/**`
  - `packages/relay/AGENTS.md`
- **Depends**: S4
- **Verify**: `cd packages/pt-design && bun test src` plus S18 unknown-tool test
- **Review checklist**:
  1. `src/ir/` gone; no public export of Design IR / `createPtDesignSession` as Agent API
  2. ToolName 仅 TECH 表：`pt_ptx_get/apply`, `pt_catalog_list`, `pt_screenshot`, `pt_doc_*`, `pt_tools_list`。`pt_ir_get` / `pt_layout_*` → `unknown_tool`，无 mutation
  3. `shadcn-list.ts` 未改；wireframe `templates.ts` / `pt_place` API 已删
  4. CLI/MCP/Skill 指向 PTX 源文件循环，不写 Excalidraw JSON / IR
  5. 公开错误码为 protocol 小写串；browser `index.ts` 仍不 import headless
  6. `packages/pt-design/AGENTS.md` 与 `packages/AGENTS.md` 不再把产品写成 APP-062 wireframe/IR
  7. `FILES` ⊆ Owns；`bun test src` 绿

### S6 — OverlayHost onAction (TEST S17)

- **Wave**: 7 (serial)
- **Goal**: Interact clicks emit `{ nodeId, event, action }` to the host. `PtDesignApp` must pass `onAction` into `OverlayHost`. Playground logs; Atmos island records the payload. Unskip the S17 source test.
- **Owns**:
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/live-board.test.ts`
  - `packages/pt-design/playground/main.tsx`
  - `apps/web/src/features/pt-design/PtDesignCenterPanel.tsx`
  - `apps/web/src/features/pt-design/PtDesignGuestStage.tsx`
  - `apps/web/src/features/pt-design/lib/pt-design-agent-feed-labels.ts`
  - `apps/web/src/features/pt-design/__tests__/pt-design-agent-feed-labels.test.ts`
  - `apps/web/messages/en.json`
  - `apps/web/messages/zh.json`
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; `src/core/headless-session.ts`; `e2e/**`; `specs/APP/APP-073*/TEST.md` scenario bodies
- **Depends**: S5
- **Verify**: `cd packages/pt-design && bun test src/embed/live-board.test.ts` (S17 OverlayHost onAction test no longer skipped)
- **Review checklist**:
  1. `PtDesignApp` 的 `<OverlayHost` 带 `onAction=`
  2. payload 形状 `{ nodeId, event, action: { type: "agent", name } }`；Interact commit 仍 NEVER
  3. CenterPanel 把 payload 接到现有 island/feed，不新建平行 runtime store
  4. `live-board.test.ts` S17 OverlayHost 测试不再 `test.skip`
  5. `FILES` ⊆ Owns；未改 protocol / groups / e2e skip 逻辑

### S7 — Load PTX-only persist onto overlay

- **Wave**: 8 (serial)
- **Goal**: E2E seeds `{ ptx }` at `pt-design/v2/global` with no canvas. After load, OverlayHost must emit `data-pt-overlay-id` for each page-level node. TECH: restore NEVER; project missing handles NEVER; `history.clear` only on load.
- **Owns**:
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/scene-bridge.ts`
  - `packages/pt-design/src/embed/live-board.ts` (only if needed to keep customData through updateScene)
  - colocated `*.test.ts` under those paths
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; skip-as-green in `e2e/**`; TEST.md scenario bodies
- **Depends**: S6
- **Verify**: bun test that ptx-only load/project yields overlay node ids; `cd packages/pt-design && bun test src/embed`
- **Review checklist**:
  1. `{ ptx }` without canvas still `applyPtx`/`project` + overlay ids
  2. Excalidraw elements keep `customData.pt`
  3. No max-update-depth from onChange → setOverlayDoc → overlay remount
  4. Load capture NEVER; history.clear only on load
  5. FILES ⊆ Owns

### S8 — Live Excalidraw keeps overlay handles

- **Wave**: 9 (serial)
- **Goal**: After seeding `{ ptx }` with no canvas, the **live** Chromium board must render `[data-pt-overlay-id="model|prompt|run"]`. S7 bun fake host already extracts those ids; Playwright still sees `overlayIds=[]` with `[data-pt-overlay]` attached (empty `pages[0].nodes`). Production bug: Excalidraw restore / delayed empty `onChange` drops `customData.pt`, so `extractDocument` returns no nodes and `syncOverlay` writes `EMPTY_DOC`.
- **Out of scope**: protocol parse/project; catalog renderers; skip-as-green E2E; S24 agent-browser; S27 collab; parent Playwright re-run (after review pass)
- **Owns**:
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/scene-bridge.ts`
  - `packages/pt-design/src/embed/live-board.ts`
  - colocated `*.test.ts` under those paths (`PtDesignApp.test.ts`, `live-board.test.ts`, `scene-bridge.test.ts`, plus new colocated tests if needed)
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; `src/catalog/shadcn-list.ts`; skip-as-green in `e2e/**`; TEST.md scenario bodies; `PROGRESS.md`; commit
- **Reads (read-only)**: `src/protocol/scene.ts` (`extractDocument` skips elements without `customData.pt`); `src/embed/overlay/OverlayHost.tsx` (maps `document.pages[0].nodes` → `data-pt-overlay-id`); `src/embed/apply-gate.ts`; `src/embed/theme-palette.ts` (`applyThemeInkToElements`); TECH.md live SoT + customData; TEST.md S6 seed
- **Depends**: S7
- **Invariants** (from TECH): see dispatch brief
- **Verify**: `cd packages/pt-design && bun test src/embed` — must include a restore-drop / delayed-empty-onChange case that S7's in-memory host does not cover
- **Review checklist**:
  1. FILES ⊆ Owns; no e2e skip-as-green; no protocol/groups edits
  2. Overlay / `pt_ptx_get` still **extract** from scene handles — no second PT document as live SoT
  3. After convert **and** after live restore/`onChange`, elements keep `customData.pt`; extract includes seeded `model`/`prompt`/`run`
  4. A delayed empty `onChange` after `loadPersist({ ptx })` must not leave OverlayHost with zero nodes (do not persist an empty extract over the seed during load)
  5. Load capture `NEVER`; `history.clear` only on load; Interact commit still `NEVER`
  6. Verify command green; tests must not only use a host that keeps whatever `updateScene` stored

### S9 — Edit drag extract + native undo

- **Wave**: 10 (serial)
- **Goal**: TEST S9/S21/S30/S31. After overlay projects, Edit-mode drag of `run` must change extract x/y; Cmd+Z restores. `pt_ptx_apply` in Edit is `IMMEDIATELY` and Cmd+Z reverts XML. Interact Cmd+Z must not canvas-undo. Playwright after S8: S6/S10/S29 pass; S21 Δx=0 and Excalidraw Undo disabled; S30 apply writes `deepseek` but Undo still disabled.
- **Out of scope**: leftover `:30303` CLIENT_NOT_FOUND env; S24 agent-browser; S27 collab; skip-as-green E2E; protocol/groups
- **Owns**:
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/scene-bridge.ts`
  - `packages/pt-design/src/embed/live-board.ts`
  - `packages/pt-design/src/embed/overlay/**`
  - colocated `*.test.ts` under those paths
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; `src/catalog/shadcn-list.ts`; skip-as-green in `e2e/**`; TEST.md scenario bodies; `PROGRESS.md`; commit
- **Depends**: S8
- **Verify**: `cd packages/pt-design && bun test src/embed`
- **Review checklist**:
  1. FILES ⊆ Owns
  2. Overlay still extracts from scene; no second PT store
  3. Live handle x/y after Edit drag appear in extract (not frozen `lastProjected` geometry)
  4. `pt_ptx_apply` / palette `IMMEDIATELY` is undoable; `history.clear` only on load; Interact commit / load `NEVER`; Interact does not canvas-undo
  5. S8 overlay ids / restore-drop / delayed empty onChange still pass

### S10 — Overlay origin matches canvas handles

- **Wave**: 11 (serial)
- **Goal**: Live Edit drag of `[data-pt-overlay-id="run"]` must move the Excalidraw handle and change extract x/y (TEST S9/S21/S31). Playwright after S9: overlay projects, Edit is on, `run` shows a selection box, drag Δx=0, Undo stays disabled — drag is selecting (marquee) not moving the handle. Cause class: overlay screen rect ≠ handle screen rect, or handle not hittable (`locked` / `viewModeEnabled`).
- **Out of scope**: leftover `:30303`; S24/S27; skip-as-green; protocol; groups; S30 (already E2E green)
- **Owns**:
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/overlay/**`
  - `packages/pt-design/src/excalidraw-bridge/**`
  - colocated tests under those paths
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; e2e skip-as-green; TEST.md scenario bodies; `PROGRESS.md`; commit
- **Depends**: S9
- **Verify**: `cd packages/pt-design && bun test src/embed src/excalidraw-bridge`
- **Review checklist**:
  1. FILES ⊆ Owns
  2. Overlay (0,0) is Excalidraw scene→viewport origin (canvas), not board chrome
  3. Edit: viewModeEnabled false; handles unlocked; overlay descendants pointer-events none (keep S9)
  4. Interact overlay still pointer-events auto; S10 spatial unchanged still holds in bun
  5. S8 restore-drop / S9 extract-follows-live-geometry / S30 IMMEDIATELY still pass

### S11 — Undo after pt_ptx_apply reverts XML

- **Wave**: 12 (serial)
- **Goal**: TEST S30. Live: `pt_ptx_apply` writes `deepseek`, Excalidraw Undo **enables**, overlay click + `Meta+z` leaves extract still containing `deepseek`. Drag undo (S21) already green. Suspect: undo restores geometry-only elements, then `fillMissingPtCustomData` / `lastProjected` re-stamps the applied payload; or a NEVER hydrate after apply is the stack entry Cmd+Z pops.
- **Out of scope**: leftover `:30303` S6 CLIENT_NOT_FOUND; S24/S27; skip-as-green; protocol; groups
- **Owns**:
  - `packages/pt-design/src/embed/live-board.ts`
  - `packages/pt-design/src/embed/scene-bridge.ts`
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - colocated tests under those paths
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; `src/excalidraw-bridge/**`; `src/embed/overlay/**` (read-only); e2e skip; TEST.md bodies; `PROGRESS.md`; commit
- **Depends**: S10
- **Verify**: `cd packages/pt-design && bun test src/embed`
- **Review checklist**:
  1. FILES ⊆ Owns
  2. After applyPtx IMMEDIATELY, a host undo/restore of previous elements makes extract drop the applied payload (not refilled from lastProjected)
  3. fillMissing only copies payload when live has no `customData.pt`; must not resurrect undone Agent XML
  4. history.clear only on load; apply still IMMEDIATELY; Interact commit NEVER
  5. S8 restore-drop, S9 live geometry, S21-equivalent drag undo tests still pass

### S12 — Live Cmd+Z after pt_ptx_apply reverts extract (TEST S30)

- **Wave**: 13 (serial)
- **Goal**: Playwright TEST S30 on worktree `:3130`+`:31303`. `pt_ptx_apply` writes `deepseek` (poll true), Excalidraw Undo is enabled, overlay click + `Meta+z`, extract must **not** contain `deepseek`. S11 bun tests strip `customData` on fake undo and stay green; live still keeps the applied option.
- **Out of scope**: leftover `:30303`; S24/S27; skip-as-green E2E; protocol; groups; changing TEST.md scenario bodies
- **Owns**:
  - `packages/pt-design/src/embed/live-board.ts`
  - `packages/pt-design/src/embed/scene-bridge.ts`
  - `packages/pt-design/src/embed/PtDesignApp.tsx`
  - `packages/pt-design/src/embed/ExcalidrawBoard.tsx`
  - colocated `*.test.ts` under those paths
- **Forbids**: `src/protocol/**`; `src/components/groups/**`; `src/excalidraw-bridge/**`; `src/embed/overlay/**` (read-only); e2e skip; TEST.md bodies; `PROGRESS.md`; commit
- **Depends**: S11
- **Verify**: `cd packages/pt-design && bun test src/embed`
- **Review checklist**:
  1. FILES ⊆ Owns
  2. Live-shaped undo (Excalidraw restores previous **full** elements, not only stripped `customData`) makes extract drop the applied option
  3. `getSceneElements` restamp / `lastHydrated` merge must not resurrect applied payload after undo
  4. apply still `IMMEDIATELY`; `history.clear` only on load; Interact commit NEVER; S21 drag undo still holds in bun
  5. No e2e skip-as-green

## Progress Log

### 2026-09-02

- Promoted full catalog into PRD M4 / TECH Wave 0 / TEST S5, S36, S37.
- Wrote this kanban. Dispatched S0.
- S0 impl returned ok (12 files under `src/protocol/**` only). Review dispatched.
- S0 review pass. Wave 1 dispatched: S1, S2a, S2b.
- S1 impl ok (2 files). Review dispatched.
- S1 review pass. Headless session is the CLI/MCP AST+PTX contract.
- S2a impl ok (form group only). Review dispatched.
- S2a review pass. 20 form types are real DOM (in-tree select, switch).
- S2b impl ok (overlay group only). Review dispatched.
- S2b review pass. Wave 2 dispatched: S2c display, S2d blocks.
- S2d impl ok (blocks group only). Review dispatched.
- S2d review pass. Four REQUIRED_BLOCKS are nested PTX trees.
- S2c impl ok (display group only). Review dispatched.
- S2c review pass. Wave 3 S2e registry dispatched.
- S2e impl ok. Review dispatched. Parent re-ran registry tests: 5 pass.
- S2e review pass. S3 live board dispatched.
- S3 impl ok. Review dispatched.
- S3 review pass. S4 hot-file glue dispatched.
- S4 impl ok (LiveBoard wired; `pt_ptx_get`/`apply`; v2 persist). Review dispatched.
- S4 review pass. S5 cleanup dispatched.
- S5 impl ok (IR/old tools gone; 152 tests). Review dispatched.
- S5 review pass. All impl slices done. Dispatched atmos-specs-test-run.
- Test-run: bun 168 pass / 2 skip. E2E 8 skipped (board hydrate). S17 OverlayHost `onAction` production gap. S6 glue dispatched.
- S6 impl ok (OverlayHost onAction wired; live-board 9 pass / 0 skip). Review dispatched.
- S6 review pass. Impl slices S0–S6 closed.
- E2E re-run: 8 failed, 0 skipped. Board chrome hydrates; overlay ids empty. S7 load-project dispatched.
- S7 impl ok (ptx-only project; embed 49 pass / 1 skip). Review dispatched.
- S7 review pass. Re-run Playwright dispatched.
- Playwright re-run: 8 failed / 0 skipped. Board chrome + seeded PTX present; `overlayIds=[]`. bun embed still 49 pass / 1 skip. Production bug on live Excalidraw, not selector/timing. S8 dispatched.
- S8 impl ok (restore-drop + delayed empty onChange; embed 56 pass / 1 skip). Review dispatched.
- S8 review pass. Re-run Playwright dispatched.
- Playwright after S8: 3 passed / 5 failed. Overlay projects (S6/S10/S29). S21/S30 Undo disabled; Edit drag extract Δx=0. S9 impl dispatched.
- S9 impl ok (Edit overlay pointer-none; extract follows live geometry; apply IMMEDIATELY; embed 63 pass / 1 skip). Review dispatched.
- S9 review pass. Re-run Playwright dispatched.
- Playwright after S9: S6/S10/S11/S29/S30 pass (API alive). S9/S21/S31 Edit drag Δx=0, Undo disabled, selection box without move. S10 overlay-origin dispatched.
- S10 impl ok (canvas origin + hittable unlocked handles; embed+bridge 76 pass / 1 skip). Review dispatched.
- S10 review pass. Re-run Playwright dispatched.
- Playwright after S10: 6 passed / 2 failed. S9/S21/S31 drag+undo green. S6 env leftover API. S30 apply Cmd+Z does not revert XML. S11 dispatched.
- S11 impl ok (fillMissing versionNonce snapshots; embed 70 pass / 1 skip). Review dispatched.
- S11 review pass. Re-run Playwright dispatched.
- Playwright after S11: 5 passed / 3 failed, all three leftover `:30303` CLIENT_NOT_FOUND (env). S6/S9/S10/S29/S31 green. S11/S21/S30 not reached. No new impl slice.
- Bound Playwright `E2E_API_PORT=31303` + Next `:3130`. bun `src` **201 pass / 1 skip**. E2E **7 passed / 1 failed**: S6/S9/S10/S11/S21/S29/S31 green. **S30 impl**: apply `deepseek` then `Meta+z` extract still has `deepseek`. S12 dispatched.
- S12 impl ok (no second bump; nonce restamp; focus `.excalidraw` after IMMEDIATELY). Review pass (chrome.test nit). Re-run Playwright: **still S30 red**, same assertion. Bundle contains `createPtRestampState`. bun fake `setElements` is not Excalidraw History. S12 → rework.
- S12 rework: Edit `handleKeyboardGlobally=true`. Review pass. bun embed 78 pass. Playwright again **7/8 S30 red** with `editModeHandlesKeyboardGlobally` in the Next chunk. Keyboard-on-document did not make extract drop `deepseek`. Further rework: History never captures apply, or undo restores then extract still has applied payload.
- S12 rework #3–#5: clone `customData`; Shape C; in-place `rec.version = 1`; remove apply `scrollToContent`. bun/review pass. Live S30 still red.
- S12 rework #6 impl ok (`newElementWith` after hydrate; no `rec.version = 1`). Review **pass** (P2). bun `src/embed` 85 pass / 1 skip. Official Playwright `:3130`+`:31303` **7/8, S30 still red**.
- S12 rework #8: skip theme-ink in the IMMEDIATELY tick + identical canonical XML skip. Review pass. bun 88 pass. Official S30 still red. Re-diag **still two increments** (z1 keeps deepseek). Identical skip cannot catch two `applyPtx` in one tick before extract updates. Rework #9: reentrancy lock on IMMEDIATELY `applyPtx` + `request_id` dedupe in the live tool handler.
- S12 rework #10: skip vs extract(lastProjected). Review pass. Official Playwright S30 still red. Rework #11: `lastImmediateCanonical` = incoming `serializePtx(doc)`.
- S12 rework #11: review pass. Official Playwright `:3130`+`:31303` **7 passed / 1 failed**, only S30. S6 green. Double-apply skip did not fix live History. `/tmp` Playwright without e2e global setup times out on `pt-design-center` — not a product skip.
- S12 #13–#16: undo-click trim. Sync trim no-op (`button.disabled` stale). First-rAF trim **eats apply** (poll never sees `deepseek`; same-tick redo dead). Double-rAF + deferred redo: poll sees `deepseek`, user Cmd+Z still keeps it.
- S12 #17 NEVER snapshot-align: poll sees `deepseek`; Cmd+Z still keeps it (`updateSnapshot` does not pop History).
- S12 #19: removed apply peel and bindHost `newElementWith` second bump. Official **7/8, only S30**. S21 still green. Extra visible History increment is not from the second bump.
- S12 live dump after #19: apply → `undo=1` payload `customData` only. Overlay force-click → `undo=2` + `selectedElementIds.el_run`. z#1 pops selection (`deepseek` stays). z#2 pops payload. Dispatched rework #20: Edit Cmd+Z skip unchanged-extract selection decoy. No apply-path peel. No overlay pointer-events change.
- S12 #20 impl ok (`undoThroughSelectionDecoy` on Edit Cmd+Z; apply path unchanged). Review pass. Official Playwright `:3130`+`:31303` **8 passed / 0 failed**, including S21/S30/S31. bun `src` **239 pass / 1 skip**. S12 → done.

## Decisions Since TECH

| ID | Decision | Why | Source update |
|----|----------|-----|---------------|
| D1 | M4 = all `SHADCN_BASIC_IDS` + `REQUIRED_BLOCKS` | Product: ship existing catalog, not seven controls | PRD M4, TECH components + data model |
| D2 | Nested catalog tags → `children`; one handle per page-level node | Blocks/cards are trees; overlay types stay in-canvas | TECH Wave 0 grammar |
| D3 | XML tag: `.` → `-` | Valid XML for `block.auth-form` | TECH catalog XML tags |

## Verification Status

| Area | Command / Method | Last result | Notes |
|------|------------------|-------------|-------|
| Protocol | `cd packages/pt-design && bun test src/protocol` | pass | S0 review: 24 tests |
| Headless | `cd packages/pt-design && bun test src/core/headless-session` | pass | S1 review: 4 tests |
| Form group | `cd packages/pt-design && bun test src/components/groups/form` | pass | S2a review: 11 tests |
| Overlay group | `cd packages/pt-design && bun test src/components/groups/overlay` | pass | S2b review: 9 tests |
| Blocks group | `cd packages/pt-design && bun test src/components/groups/blocks` | pass | S2d review: 7 tests |
| Display group | `cd packages/pt-design && bun test src/components/groups/display` | pass | S2c review: 7 tests |
| Registry | `cd packages/pt-design && bun test src/components/registry.test.ts` | pass | S2e review: 5 tests |
| Package tests | `cd packages/pt-design && bun test src` | pass | S5 review: 152 tests |
| E2E / manual | Playwright APP-073 | pass | `:3130`+`:31303`: **10/10** (added S5 + S33). S24 agent-browser not_run. S27 source NEVER + crypto |
| Test-run bun | `cd packages/pt-design && bun test src` | pass | 239 pass / 1 skip (S33 live png skip) |
| S6 onAction | `bun test src/embed/live-board.test.ts` | pass | S6 review: 9 pass / 0 skip |
| S4 glue | `bun test src/embed/live-board src/isolation.test.ts src/agent` | pass | S4 review: 38 tests |

## Known Blockers

- [ ] none

## Handoff Notes

### Task goal

Greenfield rewrite of `@atmos/pt-design`: PTX XML Agent source, Excalidraw live scene, Edit-only native undo, Interact real DOM, **full current catalog** as operable UI.

### Current progress

S0–S12 done. Parent re-ran official e2e **10 passed / 0 failed** (~22s) on `:3130`+`:31303`: S5/S6/S9/S10/S11/S21/S29/S30/S31/S33. bun **241 pass / 1 skip**. S24 agent-browser still cannot mount `pt-design-center` (150s wait; `bodyChildren=8` empty text). S27 dual-browser skipped.

### Next steps

None for production. Optional: dual-client S27; agent-browser S24 if that CLI ever hydrates Next.

### Relevant files/symbols

- Spec: `specs/APP/APP-073_pt-design-interactive-canvas/`
- Catalog ids: `packages/pt-design/src/catalog/shadcn-list.ts`
- New: `packages/pt-design/src/protocol/**`

## Changed Areas

- `specs/APP/APP-073_pt-design-interactive-canvas`: PRD/TECH/TEST/BRAINSTORM/PROGRESS
- `packages/pt-design`, `apps/web` pt-design, `skills/atmos-pt-design-agent`, `e2e/tests/specs/APP-073_*.e2e.ts`
