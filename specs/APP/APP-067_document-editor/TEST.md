# TEST · APP-067: Document Editor

> Test Plan · verification contract for PRD/TECH APP-067. Full scenario execution is filled during `atmos-specs-test-run`. Status values: `planned` until then.

## Test strategy

- **Package (`@atmos/md-live`)**: Bun tests for embed directive parse/format, fence extractor (legacy), edit-op apply, popover anchor, `renderAgentPrompt` (copy citation vs headless output contract; `text` vs `markdown`), isolation (no forbidden imports).
- **Host**: Bun tests for Live-eligible helpers, D22 no-edit preserve bytes, stream lock, Agent Chat helpers, edit-tool allowlist. Structural grep: no `CenterTabKind` `"docs"`, no launchpad Docs item, no `terminal-current` adapter, no `@atmos/docs`, dock unmounted.
- **Read-only**: `MarkdownPatchDiff` extracted; GitHub / review / `.atmos/reviews/**` still use `MarkdownRenderer`, never `MarkdownLiveEditor`.
- **WebSocket**: reuse existing `fs_*`. Bridge actions `md_live_bridge_*` / `md_live_agent_dispatch_result` are transport (like Canvas), not a document DB. Do **not** add `docs_*` document CRUD.
- **UI**: agent-browser / manual for Live edit, slash focus routing, chips, streaming Accept/Reject, Copy Prompt citation. Playwright only if e2e already covers file tabs cheaply.
- **License**: lockfile has `@milkdown/kit` ≥ 7.22 and **no** `@blocknote/*`, `@tiptap-pro`, `@milkdown/crepe`.

## Coverage map

| PRD item                      | Scenario IDs            |
| ----------------------------- | ----------------------- |
| M1 identity / naming          | S1, S2                  |
| M2 shell entry / default Live | S3, S4                  |
| M3 worktree markdown          | S5, S6, S7              |
| M4 no document DB             | S8                      |
| M5 live markdown              | S9, S10, S11            |
| M6 basic blocks               | S11                     |
| M7 Live vs Source             | S12, S12b               |
| M8 save / dirty               | S13, S14, S14b          |
| M9 document slash             | S15b                    |
| M10 selection toolbar         | S23                     |
| M11 shared Agent Chat         | S15, S32, S33           |
| M12 default context           | S16                     |
| M13 mentions                  | S17                     |
| M14 embeds                    | S18, S19, S18b          |
| M15 adapters                  | S20, S21, S22, S34      |
| M16 streaming + Accept/Reject | S24, S27, S28, S29, S34 |
| Bottom bar / Working          | S35, S36                |
| M17 local FS                  | S5, S7                  |
| M18 i18n                      | S25                     |
| M19 Wiki unchanged            | S26                     |
| M20 read-only surfaces        | S4b, S4c, S31           |
| N* deferred                   | not required to ship    |

## Execution map

| Scenario | Level                  | Tool                | Target                                    | Fixture             | Signals                                                                                        | Status  |
| -------- | ---------------------- | ------------------- | ----------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun                    | structural          | `CodeMirrorEditor.tsx`                    | src                 | mounts `MarkdownLiveEditor` from `features/md-live`                                            | planned |
| S2       | grep                   | review              | messages + packages                       | en/zh, package.json | Live / Source sentence case; `@atmos/md-live`; **no** `@atmos/docs`; **no** product brand Docs | planned |
| S3       | agent-browser          | web                 | `.md` file tab                            | workspace README    | opens in **Live**, editable                                                                    | planned |
| S4       | grep / Bun             | structural          | launchpad + `CenterTabKind`               | source              | **no** launchpad docs; **no** `"docs"` tab kind                                                | planned |
| S4b      | agent-browser          | web                 | `.atmos/reviews/*.md` and `.mdx`          | fixtures            | `MarkdownRenderer`; **no** Live; **no** composer dock                                          | planned |
| S4c      | grep                   | structural          | `features/github`, `features/code-review` | src                 | no import of `MarkdownLiveEditor`                                                              | planned |
| S5       | Bun                    | `bun test`          | `nextUntitledMarkdownName` + new-note     | temp dir            | untitled tab (no write); Save as defaults `{root}/Untitled.md`; collision → `Untitled-1.md`    | planned |
| S6       | Bun                    | `bun test`          | no frontmatter                            | fixture             | opens in Live                                                                                  | planned |
| S7       | Bun                    | existing fs tests   | `fs_write_file`                           | worktree            | no `docs_*` document CRUD; bridge WS allowed                                                   | planned |
| S8       | grep                   | review              | migrations                                | crates/infra        | no `docs_` / `md_live_` / `editor_document` **table**                                          | planned |
| S9       | lockfile               | grep                | package.json                              | —                   | `@milkdown/kit` ≥ 7.22; no `@blocknote/*`, `@tiptap-pro`, `@milkdown/crepe`                    | planned |
| S10      | Bun                    | isolation           | `packages/md-live`                        | src                 | forbidden imports fail                                                                         | planned |
| S11      | Bun                    | roundtrip           | Milkdown fixtures                         | gfm+chips           | serialize ≈ parse                                                                              | planned |
| S12      | agent-browser          | Live ↔ Source       | one `.md`                                 | same file           | one editor mounted                                                                             | planned |
| S12b     | Bun                    | D22                 | real README                               | open, no edits      | disk unchanged; not dirty                                                                      | planned |
| S13      | Bun / agent-browser    | dirty               | switch file                               | edited doc          | save / discard / cancel                                                                        | planned |
| S14      | agent-browser          | Cmd-S               | markdown tab                              | dirty file          | disk matches Live                                                                              | planned |
| S14b     | Bun                    | stream lock         | `mdLiveStreamLock`                        | in-flight           | autosave/Cmd-S no-op until Accept/Reject                                                       | planned |
| S15      | grep / Bun             | import              | `MdLiveAgentChat`                         | source              | one `useAgentChatSession`; dock unmounted; no Terminal send                                    | planned |
| S15b     | agent-browser          | focus               | Live body vs dock                         | one `.md`           | two different slash menus                                                                      | planned |
| S16      | Bun                    | `renderAgentPrompt` | headless vs copy                          | fixture             | headless has output contract; copy does **not**                                                | planned |
| S17      | Bun / agent-browser    | mentions            | composer                                  | mock lists          | file/github/linear chips                                                                       | planned |
| S18      | Bun                    | embed codec         | format/parse                              | inline + card       | `:md-live` / `::md-live`; `kind`+`url`/`path` survive                                          | planned |
| S18b     | Bun / agent-browser    | GitHub card         | Live                                      | issue embed         | card with title/state + Open; not a lone chip                                                  | planned |
| S19      | agent-browser          | Open on card        | Live                                      | github embed        | native GitHub surface; `https://example.com` stays a link                                      | planned |
| S20      | Bun                    | copy adapter        | clipboard                                 | request             | Context / Selection / References; **no** Output contract; **no** “do not modify the file”      | planned |
| S21      | grep                   | review              | `md-live-adapters.ts`                     | source              | adapters are `copy` \| `headless` only                                                         | planned |
| S22      | manual / agent-browser | headless            | installed agent                           | workspace           | user stays on the markdown tab; Live streams; no tool trace in Live                            | planned |
| S23      | agent-browser / Bun    | Live selection      | paragraph                                 | toolbar             | Chat opens popover bottom-right; `doc-selection`; no `SelectionPopover` on Live                | planned |
| S32      | Bun                    | helpers             | `md-live-agent-chat.ts`                   | src                 | popover bottom-right; same `instanceKey` for both placements                                   | planned |
| S33      | Bun                    | structural          | `MdLiveAgentChat.tsx`                     | src                 | one session; popover + bar mutually exclusive; Working expand/minimize                         | planned |
| S34      | Bun                    | edit host           | `md-live-edit-host.ts`                    | fake API            | only mutating `md_live_*` change the buffer; `fs_write` denied                                 | planned |
| S35      | Bun                    | bar mode            | `nextMdLiveBarMode`                       | helpers             | hover → collapsed; focus/draft → focused; Working without hover stays visible; expand          | planned |
| S36      | Bun                    | Working             | `MdLiveAgentChat.tsx`                     | src                 | Working pill `setExpanded(true)`; minimize `setExpanded(false)`                                | planned |
| S24      | Bun + agent-browser    | Rewrite markdown    | fenced mock                               | paragraph           | stream + Accept/Reject                                                                         | planned |
| S27      | Bun                    | text hint + Esc     | extractor + streaming                     | mock                | `outputHint: text`; Esc restores                                                               | planned |
| S28      | Bun                    | diff + embeds       | customBlockTypes                          | card fixture        | Accept keeps `::md-live`; `mdLiveEmbedBlock` in customBlockTypes                               | planned |
| S29      | Bun                    | fence               | `createFenceExtractor`                    | PTY-like chunks     | inner payload only; no-fence abort; junk abort                                                 | planned |
| S25      | grep                   | i18n                | en.json + zh.json                         | `mdLive` ns         | zh translated                                                                                  | planned |
| S26      | agent-browser          | Wiki                | `.atmos/wiki/`                            | existing wiki       | unchanged                                                                                      | planned |
| S31      | Bun / grep             | `MarkdownPatchDiff` | markdown + github                         | src                 | extracted component; `MarkdownRenderer` uses it; Live editor does not                          | planned |

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

No `docs_*` document CRUD in `WsAction`. Live Agent **bridge** actions (`md_live_bridge_register`, `md_live_bridge_unregister`, `md_live_agent_dispatch_result`) are allowed as transport, matching Canvas / PT Design. No `md_live_*` document tables.

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

### S15 — Agent Chat reuse

`MdLiveAgentChat` mounts exactly one `useAgentChatSession` and `AgentPromptComposer`. `MdLiveAgentDock` is unmounted. No Send to Terminal control. No `EditorPromptComposer.tsx`.

### S15b — Two slashes

Body `/` = GFM slash. Composer `/` = Agent Chat slash.

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

### S22 — Agent stays in the editor

Run does not steal focus to Terminal. Thoughts / tool traces stay in Chat. Live mutates only via `md_live_*`.

### S23 — Live selection

Format + **Chat** / Rewrite / Summarize toolbar. Chat opens the Agent Chat popover anchored to the **bottom-right** of the selection. `SelectionPopover` is not shown on Live.

### S24 — Rewrite then Accept / Reject

The agent calls `md_live_replace_selection`. Host streams markdown into Live. Accept commits. Reject restores. Save after Accept writes the file.

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

### S32 — Popover anchor + session continuity

`mdLiveSelectionPopoverStyle` / `mdLivePopoverAnchorStyle` place the popover at `(rect.bottom + gap, rect.right - width)`. `mdLiveAgentChatInstanceKey(path)` is `md-live:{path}` for both popover and bottom bar.

### S33 — One session, two placements

`MdLiveAgentChat` has a single `useAgentChatSession`. `data-md-live-agent-placement` is `"popover"` or `"bottom"`. Popover hides the bottom bar.

### S34 — Edit tool only mutates the document

`applyMdLiveAgentTool` applies `md_live_replace_selection` / `md_live_insert` / `md_live_replace_document`. `md_live_get` is read-only. `fs_write` / unknown tools return `UNKNOWN_TOOL` and leave the buffer unchanged.

### S35 — One-line bar expands

`nextMdLiveBarMode`: hidden by default; hover or working → `collapsed`; focus or draft → `focused`; `expanded` when the Working pill was clicked. Typing / focus with content uses the focused/expanded height.

### S36 — Working expand / minimize

Working pill (`data-md-live-working-pill`) calls `setExpanded(true)`. Minimize calls `setExpanded(false)`. Working keeps the collapsed bar visible without hover so the pill remains clickable.

### S37 — `source: md-live` + overlay UX

Create persists `source: "md-live"` on index and `AgentChatMetaWire`. `agent_chat_list` / store `list` default-exclude that source (`exclude_sources: []` includes). Empty overlay is composer-only; with content, Minimize + Pin (top-left), `+` (top-right), and a Live source badge. Unpinned click-outside docks to the bottom bar.

## Exploratory agent-browser checks

- Live vs Source at desktop and a narrow width. Agent Chat chrome on Live-eligible tabs only.
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
- [ ] `just typecheck` and `@atmos/api-types` action check (bridge WS catalog matches Rust).

## Acceptance criteria

- M1–M20 each have at least one scenario above.
- Markdown round-trip tests are green, including D22 no-edit preserve.
- Fence extractor tests are green (S29).
- Copy prompt tests prove citation-only (S16, S20).
- Adapters stay `copy` \| `headless` in the citation helper (S21); primary run path is Agent Chat + edit tools (S34).
- `MarkdownPatchDiff` extracted (S31).
- Popover anchor, session continuity, bar expand, Working expand/minimize (S32–S36).
- No `@atmos/docs`; package is `@atmos/md-live`.
- No `@blocknote/*`; no `@milkdown/crepe`; no Tiptap Pro.
- No new Agent tables or `docs_*` document CRUD. Bridge WS is catalogued.

## Manual verification steps

1. Open a Workspace `.md` → Live → type a heading and task list → Save.
2. Toggle Live / Source without edits → disk unchanged.
3. Copy Prompt with a selection + `@file` → paste elsewhere: context only, no edit instructions.
4. Select a paragraph → **Chat** → popover anchors under the bottom-right of the selection → send a rewrite → thoughts stay in chat → document changes only after the edit tool → Accept / Reject.
5. Hover the bottom of Live → one-line **Send follow-up** bar. Type → bar grows. Send → **Working** pill appears; click it to expand the thread; minimize collapses it. Follow-ups reuse the same session.
6. Insert a GitHub embed → card with Open → native GitHub tab; Source shows `::md-live`.
7. Open `.atmos/reviews/` markdown and a GitHub issue: read-only, no Live Agent Chat, no Live editor.
8. Confirm no “Send to current Terminal” and that `MdLiveAgentDock` is not mounted.

## Non-coverage

- ACP adapter (N1), Automation handoff (N6), hover previews (N3), mobile (N9).
- Multiplayer, Notion-like, BlockNote, Crepe, Tiptap AI Toolkit.
- Pixel-perfect Obsidian parity.
- Scraping interactive Terminal stdout into Live.
- Agent file-write as a product path.

## Coverage Status

Run 2026-10-29 during implementation (not a full `just test` / agent-browser pass).

### Automated (pass)

- `bun run --filter @atmos/md-live test` — 83 pass (edit ops, popover anchor, isolation, fence legacy, copy citation).
- `bun run --filter @atmos/api-types test` — 25 pass. `check-actions` 353. `check-events` 40 (`md_live_bridge_*`, `md_live_agent_dispatch_result`, `md_live_agent_dispatch`).
- Host: `bun test` on `md-live-agent-chat.test.ts`, `md-live-edit-host.test.ts`, `md-live-structural.test.ts`, `code-mirror-live-mount.test.ts`, `active-composer-terminal-context.test.ts` — popover bottom-right, session `instanceKey`, edit-tool allowlist (`fs_write` denied), bar hover/focus/Working expand-minimize, dock unmounted.
- `packages/ui` compact capsule test (`compact one-line capsule`) — pass.
- `cargo check -p api`
- `cargo test -p infra system_skill` — 6 pass, including `atmos-md-live-agent` registration.
- `cargo test -p api --bin api -- agent_chat` — 18 pass (third `CanvasAgentRelay` constructor).

### Not run

- Full `just typecheck` / `just lint` / `just test`.
- agent-browser Live UI (needs a signed-in Workspace with a Live `.md` tab). Playwright file-tab coverage was not extended.

### Known unrelated (also fails on `main`)

- Three `PromptAgentConfigMenu` source-string tests in `packages/ui/src/components/agents/prompt-input-view.test.ts` (effort chip / Context submenu / group padding). Not introduced by this change.

### Remaining gaps

- A live Agent Chat turn that POSTs `/api/md-live/agent/invoke` and streams into Milkdown is **manual** (see Manual verification steps).
