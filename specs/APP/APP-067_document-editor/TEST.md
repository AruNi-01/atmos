# TEST · APP-067: Document Editor

> Test Plan · verification contract for PRD/TECH APP-067. Full scenario execution is filled during `atmos-specs-test-run`. Status values: `planned` until then.

## Test strategy

- **Package (`@atmos/md-live`)**: Bun tests for embed directive parse/format, fence extractor, `renderAgentPrompt` (copy citation vs headless output contract; `text` vs `markdown`), isolation (no forbidden imports).
- **Host**: Bun tests for Live-eligible helpers, D22 no-edit preserve bytes, stream lock, adapter payload construction. Structural grep: no `CenterTabKind` `"docs"`, no launchpad Docs item, no `terminal-current` adapter, no `@atmos/docs`.
- **Read-only**: `MarkdownPatchDiff` extracted; GitHub / review / `.atmos/reviews/**` still use `MarkdownRenderer`, never `MarkdownLiveEditor`.
- **WebSocket**: reuse existing `fs_*` and terminal tests; do **not** add `md_live_*` / `docs_*` actions.
- **UI**: agent-browser / manual for Live edit, slash focus routing, chips, streaming Accept/Reject, Copy Prompt citation. Playwright only if e2e already covers file tabs cheaply.
- **License**: lockfile has `@milkdown/kit` ≥ 7.22 and **no** `@blocknote/*`, `@tiptap-pro`, `@milkdown/crepe`.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 identity / naming | S1, S2 |
| M2 shell entry / default Live | S3, S4 |
| M3 worktree markdown | S5, S6, S7 |
| M4 no document DB | S8 |
| M5 live markdown | S9, S10, S11 |
| M6 basic blocks | S11 |
| M7 Live vs Source | S12, S12b |
| M8 save / dirty | S13, S14, S14b |
| M9 document slash | S15b |
| M10 selection toolbar | S23 |
| M11 shared composer | S15 |
| M12 default context | S16 |
| M13 mentions | S17 |
| M14 embeds | S18, S19, S18b |
| M15 adapters | S20, S21, S22 |
| M16 streaming + Accept/Reject | S24, S27, S28, S29 |
| M17 local FS | S5, S7 |
| M18 i18n | S25 |
| M19 Wiki unchanged | S26 |
| M20 read-only surfaces | S4b, S4c, S31 |
| N* deferred | not required to ship |

## Execution map

| Scenario | Level | Tool | Target | Fixture | Signals | Status |
|----------|-------|------|--------|---------|---------|--------|
| S1 | Bun | structural | `CodeMirrorEditor.tsx` | src | mounts `MarkdownLiveEditor` from `features/md-live` | planned |
| S2 | grep | review | messages + packages | en/zh, package.json | Live / Source sentence case; `@atmos/md-live`; **no** `@atmos/docs`; **no** product brand Docs | planned |
| S3 | agent-browser | web | `.md` file tab | workspace README | opens in **Live**, editable | planned |
| S4 | grep / Bun | structural | launchpad + `CenterTabKind` | source | **no** launchpad docs; **no** `"docs"` tab kind | planned |
| S4b | agent-browser | web | `.atmos/reviews/*.md` and `.mdx` | fixtures | `MarkdownRenderer`; **no** Live; **no** composer dock | planned |
| S4c | grep | structural | `features/github`, `features/code-review` | src | no import of `MarkdownLiveEditor` | planned |
| S5 | Bun | `bun test` | `nextUntitledMarkdownName` + new-note | temp dir | untitled tab (no write); Save as defaults `{root}/Untitled.md`; collision → `Untitled-1.md` | planned |
| S6 | Bun | `bun test` | no frontmatter | fixture | opens in Live | planned |
| S7 | Bun | existing fs tests | `fs_write_file` | worktree | no new WsAction | planned |
| S8 | grep | review | migrations | crates/infra | no `docs_` / `md_live_` / `editor_document` table | planned |
| S9 | lockfile | grep | package.json | — | `@milkdown/kit` ≥ 7.22; no `@blocknote/*`, `@tiptap-pro`, `@milkdown/crepe` | planned |
| S10 | Bun | isolation | `packages/md-live` | src | forbidden imports fail | planned |
| S11 | Bun | roundtrip | Milkdown fixtures | gfm+chips | serialize ≈ parse | planned |
| S12 | agent-browser | Live ↔ Source | one `.md` | same file | one editor mounted | planned |
| S12b | Bun | D22 | real README | open, no edits | disk unchanged; not dirty | planned |
| S13 | Bun / agent-browser | dirty | switch file | edited doc | save / discard / cancel | planned |
| S14 | agent-browser | Cmd-S | markdown tab | dirty file | disk matches Live | planned |
| S14b | Bun | stream lock | `mdLiveStreamLock` | in-flight | autosave/Cmd-S no-op until Accept/Reject | planned |
| S15 | grep / Bun | import | `MdLiveAgentDock` | source | `PromptComposer` from welcome; no Terminal send control | planned |
| S15b | agent-browser | focus | Live body vs dock | one `.md` | two different slash menus | planned |
| S16 | Bun | `renderAgentPrompt` | headless vs copy | fixture | headless has output contract; copy does **not** | planned |
| S17 | Bun / agent-browser | mentions | composer | mock lists | file/github/linear chips | planned |
| S18 | Bun | embed codec | format/parse | inline + card | `:md-live` / `::md-live`; `kind`+`url`/`path` survive | planned |
| S18b | Bun / agent-browser | GitHub card | Live | issue embed | card with title/state + Open; not a lone chip | planned |
| S19 | agent-browser | Open on card | Live | github embed | native GitHub surface; `https://example.com` stays a link | planned |
| S20 | Bun | copy adapter | clipboard | request | Context / Selection / References; **no** Output contract; **no** “do not modify the file” | planned |
| S21 | grep | review | `md-live-adapters.ts` | source | adapters are `copy` \| `headless` only | planned |
| S22 | manual / agent-browser | headless | installed agent | workspace | user stays on the markdown tab; Live streams; no tool trace in Live | planned |
| S23 | agent-browser | Live selection | paragraph | toolbar | Ask inserts `doc-selection`; no `SelectionPopover` on Live | planned |
| S24 | Bun + agent-browser | Rewrite markdown | fenced mock | paragraph | stream + Accept/Reject | planned |
| S27 | Bun | text hint + Esc | extractor + streaming | mock | `outputHint: text`; Esc restores | planned |
| S28 | Bun | diff + embeds | customBlockTypes | card fixture | Accept keeps `::md-live`; `mdLiveEmbedBlock` in customBlockTypes | planned |
| S29 | Bun | fence | `createFenceExtractor` | PTY-like chunks | inner payload only; no-fence abort; junk abort | planned |
| S25 | grep | i18n | en.json + zh.json | `mdLive` ns | zh translated | planned |
| S26 | agent-browser | Wiki | `.atmos/wiki/` | existing wiki | unchanged | planned |
| S31 | Bun / grep | `MarkdownPatchDiff` | markdown + github | src | extracted component; `MarkdownRenderer` uses it; Live editor does not | planned |

## Scenarios

### S1 — Code ownership
Live mounts from `features/md-live`. Source remains `BaseCodeMirrorEditor` and is unmounted while Live is shown.

### S2 — Naming
Toggle copy is **Live** / **Source**. Package is `@atmos/md-live`. No `@atmos/docs`. No Docs product brand in UI.

### S3 — Default Live
Opening a Live-eligible `.md` starts in Live.

### S4 — No second workbench
No launchpad Docs item. No `CenterTabKind` `"docs"`.

### S4b — Renderer-only file tabs
`.atmos/reviews/**` still shows the review metadata card + read-only preview. `.mdx` is not Milkdown Live. Neither docks the composer.

### S4c — GitHub / review code
`features/github` and `features/code-review` do not import `MarkdownLiveEditor`.

### S5 — New-note path
New note does not write disk and does not create `docs/`. Save as defaults to `{effectivePath}/Untitled.md`. If that file exists, `Untitled-1.md`, then `Untitled-2.md`. User can change directory and filename before confirm.

### S6 — Plain markdown
A README without `atmos` frontmatter opens in Live.

### S7 — Transport
No `docs_*` / `md_live_*` in `WsAction`.

### S8 — No table
No document / EditorAgent / md-live tables.

### S9 — License + engine
`@milkdown/kit` ≥ 7.22; no BlockNote / Tiptap Pro / Crepe.

### S10 — Package isolation
`@atmos/md-live` does not import api-*, apps, ui, shared.

### S11 — Blocks round-trip
Headings, lists, tasks, quote, fenced code, table, divider, image, canonical chip hrefs.

### S12 — Modes
Toggle Live ↔ Source. Only one editor mounted.

### S12b — No silent rewrite
Open README, do not type, close: disk unchanged.

### S13 — Dirty guard
Unsaved edits + switch document → save / discard / cancel.

### S14 — Save
Cmd-S writes the file.

### S14b — Stream lock
Autosave and Cmd-S do not write a half-stream.

### S15 — Composer reuse
`MdLiveAgentDock` imports `PromptComposer` from welcome. No Send to Terminal control. No `EditorPromptComposer.tsx`.

### S15b — Two slashes
Body `/` = GFM slash. Dock `/` = composer slash.

### S16 — Prompt sections
Headless `renderAgentPrompt` includes `[Output contract]` and the `atmos-md-live` fence. Copy prompt does not.

### S17 — Mentions
`@file` and at least one of `@github` / `@linear` when configured.

### S18 — Embed directive codec
`:md-live` (inline) and `::md-live` (card) round-trip. `kind`, `layout`, and `url` or `path` survive parse → format. A normal markdown link is not rewritten into a directive.

### S18b — GitHub card is a component
A `::md-live{kind=github-issue layout=card …}` node renders a card (title, state, **Open**), not a single chip. Button clicks do not move the caret.

### S19 — Open goes to the native surface
**Open** on a GitHub embed opens the existing GitHub surface. A plain `https://example.com` link stays a link.

### S20 — Copy Prompt is citation
Clipboard has Context / Selection / References. It does **not** tell the Agent to edit the file or wrap a fence.

### S21 — Adapters
Only `copy` and `headless`. No `terminal-current`.

### S22 — Headless stays in the editor
Run does not steal focus to Terminal. Live streams. Tool-call JSON never appears in Live.

### S23 — Live selection
Format + Ask / Rewrite toolbar. `SelectionPopover` is not shown on Live.

### S24 — Rewrite markdown then Accept / Reject
Mock fenced markdown chunks stream in. Accept commits. Reject restores. Save after Accept writes the file.

### S27 — Text output hint / cancel
`outputHint: "text"` streams as text. Esc restores the pre-stream document.

### S28 — Diff review + embeds
A streamed insert that includes `::md-live[GitHub #128]{kind=github-issue layout=card …}` still round-trips after Accept. `mdLiveEmbedBlock` is listed in diff `customBlockTypes`. Live does not register a `diffFence` custom type.

### S29 — Fence extractor
Only inner payload is emitted; no-fence and junk abort without Live mutation.

### S25 — i18n
`mdLive` keys in en and zh; zh is translated.

### S26 — Wiki unchanged
Wiki setup / viewer / generate / source-toggle as today.

### S31 — Dedicated patch component
`MarkdownPatchDiff` exists. `MarkdownRenderer` uses it for valid patches. `MarkdownLiveEditor` does not mount it. GitHub/review keep `MarkdownRenderer`.

## Exploratory agent-browser checks

- Live vs Source at desktop and a narrow width. Composer dock on Live-eligible tabs only.
- Live prose matches existing markdown preview; no Crepe Georgia/paper theme.
- Copy Prompt paste into a text editor: context only, no “do not modify the file”.
- Rewrite stays on the markdown tab; Accept / Reject sentence case.
- Open a review report and a GitHub issue: still read-only, no Live, no dock.
- A working note with a ` ```diff ` fence is fenced code in Live, not a review widget.
- GitHub `::md-live` card: Open button works; clicking the card chrome does not start a text selection in the middle of the atom.
- No obvious console errors when GitHub is disconnected (mentions degrade).

Before running agent-browser, load the Agent Browser skill or `agent-browser skills get core --full`. If unavailable, mark `not_run` here.

## Regression checklist

- [ ] `.md` file tabs still exist; Source is still CodeMirror.
- [ ] Hidden CodeMirror is **not** mounted during Live.
- [ ] Wiki `.atmos/wiki/` flows unchanged.
- [ ] Review reports still render the metadata card.
- [ ] GitHub issue/PR bodies still `MarkdownRenderer`.
- [ ] Canvas / PT Design launchpad items unchanged.
- [ ] Welcome / Terminal PromptComposer still submit.
- [ ] `just typecheck` and `@atmos/api-types` action check (no stray new actions).

## Acceptance criteria

- M1–M20 each have at least one scenario above.
- Markdown round-trip tests are green, including D22 no-edit preserve.
- Fence extractor tests are green (S29).
- Copy prompt tests prove citation-only (S16, S20).
- Adapters are copy + headless only (S21).
- `MarkdownPatchDiff` extracted (S31).
- No `@atmos/docs`; package is `@atmos/md-live`.
- No `@blocknote/*`; no `@milkdown/crepe`; no Tiptap Pro.
- No new Agent tables or `docs_*` / `md_live_*` WS actions.

## Manual verification steps

1. Open a Workspace `.md` → Live → type a heading and task list → Save.
2. Toggle Live / Source without edits → disk unchanged.
3. Copy Prompt with a selection + `@file` → paste elsewhere: context only, no edit instructions.
4. Rewrite a paragraph with an installed headless agent → stay on the markdown tab → Reject restores; run again → Accept → Save.
5. Insert a GitHub embed → card with Open → native GitHub tab; Source shows `::md-live`.
6. Open `.atmos/reviews/` markdown and a GitHub issue: read-only, no dock, no Live.
7. Confirm no “Send to current Terminal” in the markdown dock.

## Non-coverage

- ACP adapter (N1), Automation handoff (N6), hover previews (N3), mobile (N9).
- Multiplayer, Notion-like, BlockNote, Crepe, Tiptap AI Toolkit.
- Pixel-perfect Obsidian parity.
- Scraping interactive Terminal stdout into Live.
- Agent file-write as a product path.

## Coverage Status

Not run. Implementation has not started. Fill this section during `atmos-specs-test-run` with exact commands (`bun test` filters, `just typecheck`, agent-browser notes) and remaining gaps.
