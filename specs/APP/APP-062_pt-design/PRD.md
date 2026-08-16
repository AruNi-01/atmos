# PRD · APP-062: PT Design (Prototype Design)

> Product Requirements · WHAT and WHY. **Full product**: standalone package (playground + Agent surfaces) **and** first-class Atmos shell embed (left sidebar → center stage).

## Context

- **Problem**: Layout and UI structure are hard to specify in natural language alone (especially non-grid layouts). Builders need a drawable prototype that both humans and Agents can understand and edit, then implement with real UI libraries (shadcn or others) outside the prototype surface.
- **Why now**: Atmos is Agent-centric; Agents already implement UI from prompts. Missing piece is a **shared visual prototype language** with stable component identity, not another ops board or live code playground.
- **Product name**: **PT Design** (Prototype Design). Package path: **`packages/pt-design`**. npm: **`@atmos/pt-design`**.
- **Agent binaries** (package-owned): **`pt-design`** (Ink CLI), **`pt-design-mcp`** (MCP stdio).
- **Ship bar (full product)**: Complete package surface (playground, full basic catalog, IR, MCP, CLI+Skill, blocks + variant UX) **plus** Atmos embed: entry in the **left sidebar**, content opens in the **center stage** (tool/center tab pattern). Not a package-only MVP.
- **Related specs**:
  - [APP-050](../APP-050_shared-package-layering/PRD.md) — package isolation; PT Design core must not pollute shared/ui/ws types. Host glue lives under `apps/web` (and desktop shell if it hosts the same web UI).
  - [APP-014](../APP-014_canvas/PRD.md) — existing **Canvas** is an ops desk (terminals). **PT Design is a different product**. Do not merge them; do not brand PT Design as “Canvas.”
- **Settled**: Excalidraw wireframes (not live React); Agent read + write; dual Agent entry (MCP + CLI/Skill, Ink, not Atmos Rust CLI); self-built shadcn-aligned **full basic** catalog; common Block frames; Atmos left sidebar → center open.

## Goals

1. **Primary**: Ship a complete prototype design product where users assemble **all basic UI components** (and a small set of common Blocks) into product mockups without writing code.
2. **Primary**: **Agent-first** — Agents read Design IR and place/edit the same scene humans edit, via **MCP** and **CLI + Skill**.
3. **Primary**: Package **`@atmos/pt-design`** is independently runnable (playground + Agent binaries) and is the only place for canvas/catalog/IR/MCP/CLI core.
4. **Primary**: **Embed in Atmos**: discoverable from the **left sidebar**; opens in the **center** area as a first-class work surface (alongside other center tools), without forking the package.
5. **Secondary**: Agents get enough structure to implement with real UI libraries (structure over pixel fidelity).
6. **Secondary**: Clear naming so PT Design never collides with APP-014 Canvas.

## Users & Scenarios

- **Primary persona**: Agentic Builder in Atmos — opens PT Design from the left sidebar, prototypes in center, hands off to Agent to implement with shadcn/other libs.
- **Secondary persona**: Standalone user of package playground / CLI / MCP without Atmos runtime.
- **Secondary persona**: External Agent via MCP or Skill + CLI on a design file.

### Key scenarios

1. In Atmos: user clicks **PT Design** (or equivalent label) in the **left sidebar** → a **center-stage tab/panel** opens → places Button / Input / Card, lays out a login frame, exports IR or Give to Agent.
2. User draws a non-obvious layout, scopes a frame, hands off (clipboard/file and/or Atmos agent sink when host wires it).
3. Agent uses **MCP** or **CLI + Skill** against a `.ptdesign.json` file; human reviews the same design in Atmos center or playground.
4. Standalone: developer runs package playground and/or `pt-design` / `pt-design-mcp` without Atmos API/Hub.
5. Switching away from the center tab and back restores the open design document for that workspace/context (host persistence adapter).

## User Stories

- As a builder in Atmos, I want PT Design in the **left sidebar**, so I can open it like other primary tools without hunting menus.
- As a builder in Atmos, I want the prototype board in the **center stage**, so it uses the main work area (tabs, focus, close) consistently with other center surfaces.
- As a builder, I want the **full basic component catalog** and useful **Block starters**, so I can sketch real product UIs.
- As a builder, I want stable semantic types and Design IR export, so Agents can implement later.
- As a builder, I want Agents to draw/edit the same scene via MCP or CLI, so collaboration is bidirectional.
- As a builder, I want one-click handoff of selection/frame/document to an Agent-facing payload.
- As a maintainer, I want core logic isolated in `@atmos/pt-design`, with only thin host glue in `apps/web`.
- As a standalone user, I want playground + MCP + CLI without Atmos processes.

## Functional Requirements

### Must Have

#### Package product (complete)

- **M1 · Isolated package**: `packages/pt-design` as **`@atmos/pt-design`**. Core must not import `@atmos/api-types`, `@atmos/api-client`, `@atmos/hub-client`, `@atmos/relay-client`, `@atmos/shared`, `@workspace/ui`, or `apps/*` (including **`apps/cli`**). Consumers use public exports / bins only.
- **M2 · UI standalone**: Local **playground** mounts the full prototype surface without Atmos web/api/Hub/Relay.
- **M3 · Embed API**: Export React embed entry + headless session/IR/document APIs. Hosts must not copy source or reimplement catalog.
- **M4 · Prototype surface**: Infinite freeform board (pan/zoom, select, group, undo/redo, frames). Engine: **Excalidraw**. User-facing name **PT Design / Prototype** — never brand as Atmos **Canvas** (APP-014).
- **M5 · Full basic component library**: First-party wireframe library covering **all** public shadcn/ui **basic** components for a pinned catalog version. Each type:
  - stable bare `componentType` (e.g. `button`, `input`, `card`);
  - **recognizable** grouped visual approximation (not empty unlabeled stubs);
  - registered in package with version pin.
  Implementation may still ship in waves, but **product complete / v1 ship** requires full basic list, not only a high-frequency subset.
- **M6 · Self-built catalog**: Owned by PT Design; no third-party commercial wireframe packs as core.
- **M7 · Semantic metadata**: `componentType`, optional variant/size, catalog-defined display props, frame membership, bbox; survives save/load/export.
- **M8 · Design export**: Design IR + full scene document; optional image (aid only; failure must not fail IR/export/handoff).
- **M9 · Agent write path (sole truth)**: Headless API for catalog, place/update/delete, frames, IR/scene, apply IR, open/save. MCP and CLI are adapters only; **parity** of IR semantics across session / MCP / CLI.
- **M10 · Handoff payload**: Scopes — UI: selection | frame | document; headless: frame | document | `instanceIds[]`. Standalone works without Atmos sink; host may supply `HandoffSink`. Fixed implementer `instructions`.
- **M11 · Persistence**: Pluggable adapters. Playground: local storage. CLI/MCP: `.ptdesign.json` on disk. Atmos host: per workspace/context document via host adapter (see M18). Single-writer file model for disk files.
- **M12 · Host boundary**: Host supplies theme, persistence, handoff sink, navigation only — not catalog or Excalidraw fork.
- **M13 · Docs**: Package `AGENTS.md` (API, edges, binaries, Skill). Host feature briefly documented in web AGENTS or feature README.
- **M14 · MCP server**: Full tool surface; stdio; package-owned; no Atmos runtime required.
- **M15 · CLI + Skill**: Ink CLI `pt-design` (not Rust `atmos`); full tool parity with MCP in Agent `--json` mode; Skill with full sections; offline.
- **M16 · Offline package surfaces**: Playground, MCP, CLI work without Atmos API/Hub/Relay/Rust CLI.
- **M17 · Agent error contract**: Structured errors for unknown type, missing ids, missing file, bad JSON; never silent success.
- **M19 · Common Block frames**: Ship a small, documented set of starter Blocks (at least: Auth form, Settings shell, Empty state, Simple nav + content). Blocks use `block.*` ids; not mixed into “basic” catalog metrics but **required for full product**.
- **M20 · Variant UX**: Users and Agents can switch key variants (e.g. Button default/secondary/outline/ghost/destructive; Badge variants) and wireframe geometry updates from templates.

#### Atmos shell embed (complete product)

- **M18 · Atmos left sidebar → center stage**:
  - **Entry**: A clear **left sidebar** control (icon + accessible name **PT Design** / localized label) opens PT Design.
  - **Open target**: Content opens in the **center stage** as a first-class surface (center tool tab or equivalent center tab), **not** only a right-rail drawer or modal.
  - **Behavior**: Open focuses the center surface; user can close the center tab; re-open restores the last design for the current workspace/project context when host persistence is available.
  - **Host glue only**: Thin feature under `apps/web` (e.g. `features/pt-design` + app-shell registration) that dynamic-imports `@atmos/pt-design` client-only. Desktop Electron that hosts the same web UI inherits the same entry.
  - **Isolation**: Host must not move catalog/IR/MCP/CLI into apps; only navigation, persistence adapter, theme, and optional handoff sink into Atmos agent context.
  - **Naming**: Sidebar and tab labels say **PT Design** (or translation), never bare “Canvas.”

### Nice to Have

- **N1 · MCP remote/SSE** beyond stdio.
- **N2 · Catalog coverage dashboard** for maintainers.
- **N3 · Collaborative multiplayer** realtime co-edit.
- **N4 · Rich interactive Ink dashboard** beyond required Agent subcommands.
- **N5 · Deep Atmos agent auto-wire**: one-click handoff injects into an active terminal agent session without user paste (host-only; package already produces payload).
- **N6 · Multiple concurrent PT Design center tabs** (multiple design documents per context).

## Out of Scope

- **Live shadcn/React components on the board**.
- **Production codegen / TSX export** as a required deliverable (Agents implement from IR).
- **Merging with APP-014 Canvas**.
- **Pixel-perfect Figma parity**.
- **Third-party commercial wireframe packs** as the built-in catalog.
- **Absorbing `@workspace/ui`** into PT Design.
- **Main `/ws` ownership of Design IR** in api-types for v1 (host may persist blobs locally without new multi-client wire types unless a second client needs them).
- **Atmos Rust CLI** for PT Design operations.
- **Realtime multiplayer** (N3).
- **IR completeness for freehand** — may omit pure strokes from IR; scene lossless.
- **Mobile-first** prototype UX.
- **Runnable interaction states** as live UI.

## Success Metrics

- **Leading**: Full basic catalog placeable; IR export + scene round-trip keeps semantic ids.
- **Leading**: Session / MCP / CLI parity on normalized IR for multi-component frames.
- **Leading**: Boundary checks green (package isolation + no `apps/cli`).
- **Leading**: Skill + CLI and MCP work offline.
- **Leading**: In Atmos, left sidebar entry opens center-stage PT Design; design survives context reload via host persistence.
- **Leading**: Standalone handoff works without host sink; Atmos may optionally sink to agent.
- **Lagging**: Builders use PT Design as Agent implementation context (dogfood).
- **Qualitative**: Called “prototype for Agent,” not “Canvas” or “Figma clone.”

## Risks & promoted requirements

- **Messaging**: Wireframe → implement outside; not production UI.
- **Catalog quality**: Full basic list must stay recognizable; no empty stubs marked done.
- **Naming**: Never bare “Canvas” in user-facing strings.
- **Path safety**: Only user/agent paths; no ambient crawl.
- **Shell UX risk**: Center stage already crowded — PT Design must reuse existing center tool-tab patterns (open/close/focus) rather than invent a third chrome system.
- **Persistence risk**: Atmos context switch must not silently wipe designs — host adapter required for M18.
- **Closed**: npm `@atmos/pt-design`; binaries; bare `componentType`; dual Agent entry; Ink not Rust CLI; **full product includes Atmos embed**.
- **TECH details**: exact sidebar placement (which left-rail section), center tab value id, host storage key schema.

## Milestones

Ship is **full product**, but engineering can still sequence:

- **Phase 0**: Package skeleton, dual exports, boundary checks, empty surface + playground.
- **Phase 1**: File + session + IR + errors + tool-defs.
- **Phase 1b**: MCP + Ink CLI + Skill + parity/failure tests.
- **Phase 2**: Full basic catalog (M5) + variants (M20) + Blocks (M19).
- **Phase 3**: **Atmos embed** — left sidebar entry, center stage panel, host persistence + theme + optional handoff sink.
- **Phase 4**: Polish (N*), desktop parity if needed via same web shell.

**Definition of done for this spec**: Phases 0–3 complete (package complete product + Atmos left sidebar → center open). Nice-to-haves optional.

## Resolved product forks

| Fork | Decision |
|------|----------|
| Canvas engine | Excalidraw embed (MIT) |
| Component model | Static wireframes + semantic metadata |
| Public component ids | Bare catalog ids (`button`) |
| Catalog completeness | **Full basic list required for ship** |
| Blocks | **Required** small set (M19) |
| Variant UX | **Required** (M20) |
| Agent entry | MCP + CLI/Skill (Ink); not Atmos Rust CLI |
| Atmos embed | **Required** — left sidebar → center stage (M18) |
| MVP-only package ship | **Rejected** — full product including Atmos embed |
| Relation to APP-014 | Separate product; no “Canvas” branding |
| Code export | Out of scope |
| File concurrency | Single-writer v1 |
