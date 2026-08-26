# TEST · APP-067: Document Editor

> Test Plan · verification contract for PRD/TECH APP-067. Full scenario execution is filled during `atmos-specs-test-run`. Status values: `planned` until then.

## Test strategy

- **Package (`@atmos/docs`)**: Bun tests for markdown round-trip, reference URIs, `renderAgentPrompt`, isolation (no forbidden imports).
- **Host**: Bun tests for path helpers, dirty/conflict logic, adapter payload construction, center-tab registration (`"docs"`).
- **WebSocket**: reuse existing `fs_*` and terminal tests; do **not** add `docs_*` actions. Contract check should stay green with zero new actions.
- **UI**: agent-browser / manual for Live edit, slash, chips, streaming Accept/Reject, Copy Prompt, Send to Terminal. Playwright only if e2e harness already covers file tabs cheaply (QUALITY-003).
- **License**: lockfile has no `@blocknote/*`, `@tiptap-pro`, or Tiptap Notion-like template. Milkdown (or chosen MIT markdown-first lib) is present.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 identity / naming | S1, S2 |
| M2 shell entry | S3, S4 |
| M3 worktree markdown | S5, S6, S7 |
| M4 no document DB | S8 |
| M5 live markdown | S9, S10, S11 |
| M6 basic blocks | S11 |
| M7 Live vs Source | S12 |
| M8 save / dirty | S13, S14 |
| M9 shared composer | S15 |
| M10 default context | S16 |
| M11 mentions | S17 |
| M12 references | S18, S19 |
| M13 AgentRequest | S16, S20 |
| M14 adapters | S20, S21, S22 |
| M15 selection actions | S23 |
| M16 streaming + Accept/Reject | S24, S27, S28 |
| M17 local FS | S5, S7 |
| M18 i18n | S25 |
| M19 Wiki unchanged | S26 |
| N* deferred | not required to ship |

## Execution map

| Scenario | Level | Tool | Target | Fixture | Signals | Status |
|----------|-------|------|--------|---------|---------|--------|
| S1 | Bun | `bun test` | live editor mounts from CodeMirror preview | src | `MarkdownLiveEditor` used when markdown preview | planned |
| S2 | grep | review | messages + launchpad | en/zh | label **Docs**, not EDITOR | planned |
| S3 | agent-browser | web | `.md` file tab | workspace | Live pane is editable | planned |
| S4 | Bun | structural | `CodeMirrorEditor.tsx` | source | mounts `MarkdownLiveEditor` in preview; no launchpad `docs` | planned |
| S5 | Bun | `bun test` | codec + fs helper | temp dir | writes `{root}/docs/{slug}.md` | planned |
| S6 | Bun | `bun test` | parse files w/o frontmatter | fixture | opens in Live | planned |
| S7 | Bun | existing fs tests | `fs_write_file` | worktree | no new WsAction | planned |
| S8 | grep | review | migrations | crates/infra | no `docs_` / `editor_document` table | planned |
| S9 | lockfile | grep | package.json | — | Milkdown (or successor); no `@blocknote/*`, no `@tiptap-pro` | planned |
| S10 | Bun | isolation | `packages/docs` | src | forbidden imports fail test | planned |
| S11 | Bun | roundtrip | fixtures | gfm+table+task | serialize ≈ parse | planned |
| S12 | agent-browser | Live ↔ Source | CodeMirrorEditor | one .md | same file; toggle works | planned |
| S13 | Bun | dirty | serialize equality | edited doc | switch prompts | planned |
| S14 | agent-browser | Cmd-S | markdown tab | dirty file | disk matches Live markdown | planned |
| S15 | grep / Bun | import | markdown live host | source | PromptComposer only if dock ships | planned |
| S16 | Bun | `renderAgentPrompt` | AgentRequest | fixture | path + body + workspace | planned |
| S17 | Bun / agent-browser | mentions | composer | mock lists | file/github/linear chips | planned |
| S18 | Bun | URI | `format/parse` | all kinds | round-trip | planned |
| S19 | agent-browser | click chip | Docs | github ref | native GitHub surface, not iframe | planned |
| S20 | Bun | copy adapter | clipboard text | request | contains Instructions + Document | planned |
| S21 | unit / manual | terminal-current | mock send_input | session | payload written | planned |
| S22 | manual / agent-browser | terminal-cli | installed agent | workspace | Terminal shows run; Docs has no tool trace | planned |
| S23 | agent-browser | selection | Docs | paragraph | composer gets `doc-selection` | planned |
| S24 | agent-browser | Rewrite selection | Live | paragraph | streams in place; highlight; Accept/Reject | planned |
| S27 | Bun / agent-browser | Generate at cursor | streaming plugin | mock chunks | insertAt cursor; Esc cancels restore | planned |
| S28 | Bun | diff + chips | customBlockTypes | docRef fixture | Accept keeps atmos:// link | planned |
| S25 | grep | i18n | en.json + zh.json | `docs` ns | zh is translated, not English paste | planned |
| S26 | agent-browser | file tab menu | `.md` | README.md | Open in Docs loads same path | planned |

## Scenarios

### S1 — Code ownership
Live editor is wired from the markdown file tab preview pane. Source remains `BaseCodeMirrorEditor`. Widgets/slash/AgentRequest may live in `features/docs` / `packages/docs`.

### S2 — Naming
Launchpad, tab, and empty states say **Docs**. No `uppercase` CSS on those labels.

### S3 — Launchpad
Docs item opens the Docs surface. With no Project/Workspace, empty state asks the user to open one (no `~/.atmos` library).

### S4 — Center tab
`CenterTabKind` includes `"docs"`. Tab is closable like `pt-design`.

### S5 — Default path
New document writes under `{effectivePath}/docs/` as `.md`.

### S6 — Plain markdown
A README without `atmos` frontmatter opens. Save may add frontmatter; body content is preserved.

### S7 — Transport
No `docs_*` in `WsAction`. Persistence uses `fs_*`.

### S8 — No table
No migration adding document or EditorAgent tables.

### S9 — License
Lockfile contains the chosen MIT markdown-first editor and **no** `@blocknote/*`, `@tiptap-pro`, paid Notion-like template, or Tiptap AI Toolkit.

### S10 — Package isolation
`@atmos/docs` does not import api-*, apps, ui, shared.

### S11 — Blocks round-trip
Headings, lists, tasks, quote, fenced code, table, divider, image alt/src, reference links survive parse → serialize → parse.

### S12 — Modes
Toggle Live ↔ Source keeps GFM + Atmos refs. Source is CodeMirror.

### S13 — Dirty guard
Unsaved edits + switch document → save / discard / cancel. Cancel keeps the buffer.

### S14 — Save
Cmd-S writes the file; dirty indicator clears.

### S15 — Composer reuse
Host imports `PromptComposer` from welcome; no `EditorPromptComposer.tsx`.

### S16 — Default context
Rendered prompt includes document path and current workspace/branch when known.

### S17 — Mentions
User can chip `@file` and at least one of `@github` / `@linear` when those APIs are configured. Unresolved free text is not silently treated as a resolved ref.

### S18 — URI codec and chip round-trip
Every `DocRef` kind formats and parses. Open → save of `[GitHub #128](atmos://doc-ref/github/issue/128)` keeps the same link. Live shows a chip, not a raw URL. A normal markdown link (`https://…`) is not hijacked into a chip.

### S19 — Navigation
Clicking a GitHub reference opens the existing GitHub surface, not an embedded issue UI.

### S20 — Copy Prompt
Copy places a structured prompt on the clipboard (Instructions / Document / References sections as applicable).

### S21 — Send to current Terminal
With an active terminal, adapter calls the existing input path. With none, the control is disabled with an explanation.

### S22 — Headless CLI
Run with an installed non-interactive agent opens/uses a Terminal in the current context. Docs does not render tool-call logs.

### S23 — Selection
Selection + Rewrite adds document selection context to the composer.

### S24 — Rewrite streams then Accept / Reject
Selection + Rewrite streams markdown into Live (highlighted). **Accept** commits the new span. **Reject** restores the original paragraph. Save after Accept writes the file.

### S27 — Generate at cursor / cancel
Generate at an empty paragraph streams blocks in place. Esc (or cancel) restores the pre-stream document. Tool-call JSON does not appear in Live.

### S28 — Diff + Atmos chips
A streamed insert that includes `[GitHub #128](atmos://doc-ref/github/issue/128)` still round-trips after Accept. `docRef` is listed in diff `customBlockTypes`.

### S25 — i18n
`docs` keys exist in en and zh; zh strings are real translations.

### S26 — Open in Docs
Opening a `.md` file tab uses Live preview as the editable default (same as today’s preview default). Source toggle still works.

## Exploratory agent-browser checks

- Live preview vs Source at desktop and a narrow width.
- Live prose matches existing markdown preview (Geist, 14px, dark invert); no Crepe Georgia/paper theme. Slash and Accept/Reject use Atmos buttons, not Milkdown default chrome.
- Streaming highlight + bottom Accept / Reject bar; English sentence case.
- Document-body slash and PromptComposer `/` are not the same menu.
- Empty `docs/` folder empty state.
- Conflict: dirty editor vs Agent-updated file (Keep mine / Load disk).
- No obvious console errors when opening Docs with GitHub disconnected (mentions degrade).

Before running agent-browser, load the Agent Browser skill or `agent-browser skills get core --full`. If unavailable, mark `not_run` here.

## Regression checklist

- [ ] `.md` file tabs still exist; Source is still CodeMirror.
- [ ] Wiki `.atmos/wiki/` flows unchanged.
- [ ] Canvas / PT Design launchpad items unchanged.
- [ ] Welcome / Terminal / Automations PromptComposer still submit.
- [ ] `just typecheck` and `@atmos/api-types` action check (no stray new actions).

## Acceptance criteria

- M1–M19 each have at least one scenario above.
- Markdown round-trip tests are green.
- Markdown live editor present; no `@blocknote/*`; no Tiptap Pro.
- No new Agent tables or `docs_*` WS actions.
- Copy Prompt works without any Agent binary installed.

## Manual verification steps

1. Open a Workspace `.md` file → Live → type a heading and task list → Save → confirm disk file.
2. Toggle Live / Source → content remains.
3. `@file` a source file in the composer → Copy Prompt → paste into an external editor; confirm path and document body.
4. Send to current Terminal with a running shell; confirm text arrives.
5. Insert a GitHub reference (if configured) → click → native GitHub tab.
6. Open README.md → Live is editable; toggle Source → raw markdown.

## Non-coverage

- ACP adapter (N1), Automation handoff (N6), hover preview richness (N3), mobile (N9).
- Multiplayer, Notion-like, BlockNote, cloud library, Tiptap AI Toolkit.
- Pixel-perfect Obsidian parity.
- Full Playwright coverage of every block type (package round-trip is the gate).

## Coverage Status

Not run. Implementation has not started. Fill this section during `atmos-specs-test-run` with exact commands (`bun test` filters, `just typecheck`, agent-browser notes) and remaining gaps.
