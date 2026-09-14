# Brainstorm · APP-073: PT Design Interactive Canvas

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.
>
> Source: [PT Design v2 产品与技术方案](./source/PT-Design-v2.md). **Greenfield rewrite** of `@atmos/pt-design` (no APP-062 compatibility).

## Context

APP-062 is a wireframe board: Excalidraw scene is SoT, components are drawings, Agents speak Design IR + layout tools, Interact is out of scope. That product is retired. This spec redesigns PT Design as an **Agent-native interactive canvas** with real DOM controls.

Constraint from product: **undo/redo must be Excalidraw’s native history** (it already works). We map/sync; we do not build a second stack.

## Goals (draft)

1. Agents read/write **PTX** only.
2. Humans get real UI in **Interact** (click only, no undo) and Excalidraw spatial tools + **native undo** in **Edit**.
3. One live board document: dragging and Agent apply in Edit share Excalidraw history. Interact commits persist but are not undo steps.
4. No migration from `.ptdesign.json` / Design IR / old tool names.

## Options (live truth)

### Option A — Scene is the live session; PTX is extract/project (favored)

Browser: Excalidraw elements (box + `customData.pt`) are the session. Undo is `CaptureUpdateAction`. PTX is extracted for Agents and files. Applying PTX writes elements with `IMMEDIATELY`. Headless: AST only (no undo).

**Pros**: Matches “use Excalidraw undo”; collab already ships scene; semantic payload rides on `customData`.
**Cons**: Must never keep a parallel PT store that can diverge; overlay is not an Excalidraw primitive.
**Unknown**: none for mode vs undo — Interact uses view-mode; Edit owns history.

### Option B — PT AST is live SoT; Excalidraw is a dumb projector

Our session owns undo. Rejected: duplicates Excalidraw history poorly.

### Option C — Drop Excalidraw; custom canvas

Rejected: throws away pan/zoom/select/undo/collab we already ship.

## Key forks in the road

- **Fork 1: Live vs file truth** — **Settled**: live board = Excalidraw scene; file/Agent = PTX extract; headless = AST. Mapping at extract/project boundaries only.
- **Fork 2: Undo** — **Settled**: Excalidraw history only. Programmatic writes use `captureUpdate: IMMEDIATELY`. Remote/load use `NEVER`. Typing uses `EVENTUALLY` then commit `IMMEDIATELY`.
- **Fork 3: Overlay** — **Settled**: one handle element per **page-level** PT node + DOM overlay. Nested catalog tags are `children` inside that overlay. No custom Excalidraw embeddable (0.18 has none for HTML controls). Overlay/popover types stay in-canvas (no `document.body` portal).
- **Fork 4: Compatibility** — **Settled: none.** New tools, new catalog, new persistence key, new `.ptd` bundle. Delete IR, wireframe templates, `pt_layout_*`, old `.ptdesign.json`.
- **Fork 5: Layout APIs** — **Settled**: no layout engine. Agents set `x`/`y` in PTX (like editing attributes in source).
- **Fork 8: Agent mutation** — **Settled: XML file edit is primary** (`pt_ptx_get` / write `document.ptx` / `pt_ptx_apply` full text). Not JSON node CRUD. Structured node tools are optional (N7). Reject only *orphan snippets* (a lone `<option>` with no document), which is not how saving a file works.
- **Fork 6: Collab** — **Settled**: existing encrypted scene room. PT payload in `customData` rides along. Remote applies with `NEVER`.
- **Fork 7: Package** — **Settled**: rewrite inside `@atmos/pt-design`. No extra npm packages.

## Open questions

- [x] Overlay vs embeddable — overlay.
- [x] Interact pan/zoom vs undo — **`viewModeEnabled`**. Interact is operate-UI only: no drag, no board Cmd+Z. Edit Mode is the only undo/redo surface.
- [x] `pt_ptx_apply` — Agent submits the **complete** PTX source after editing it (save file). Pretty, stable XML so diffs are readable. Not an orphan fragment API.
- [ ] Exact Select UI in Interact (must not use OS `<select>` popup). Try custom list in playground.

## References

- Excalidraw 0.18 `updateScene` + `CaptureUpdateAction` (`IMMEDIATELY` | `EVENTUALLY` | `NEVER`); `customData`; `history.clear`; `viewModeEnabled`.
- Code to replace: `packages/pt-design/` (session-as-scene, IR, catalog templates, `board-sync`).
- Keep: collab hub, live Agent invoke, Atmos sidebar embed, package isolation.

## Ready to promote

- PRD: greenfield interactive canvas; Excalidraw undo in Edit only; PTX for Agents/files; Edit/Interact; **full existing catalog** as real DOM (all `SHADCN_BASIC_IDS` + `REQUIRED_BLOCKS`); screenshot; no back-compat.
- TECH: extract/project; `customData.pt`; captureUpdate table; Interact = viewMode; delete APP-062 internals.
