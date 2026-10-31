# md-live

Live markdown editor + reused Agent Chat on the existing file tab (APP-067).

- Codec / fence / prompt / edit ops: `@atmos/md-live`
- Generic Live engine (Milkdown, slash catalog, format commands): `@atmos/md-live/ui`
- `/` menu and selection toolbar: this feature, using `@workspace/ui` Command / DropdownMenu
- This feature owns Atmos-only host wiring: Agent Chat host (`MdLiveAgentChat`), document-edit tools, Save as, embeds that open native GitHub surfaces, file-tab mount
- Primary Agent path is **reused Agent Chat** (selection popover + bottom hover bar). `MdLiveAgentDock` headless PTY + fence is unmounted
- Document bytes change only via `md_live_*` tools (`POST /api/md-live/agent/invoke`). Do not scrape Terminal into the doc
- Do not put md-live UI in `features/editor` beyond the `CodeMirrorEditor` mount point
- Automation Instructions and Memories mount an embedded live editor (no source toggle). Expand/collapse resizes that same editor in place (do not remount). Compact stays full-bleed; expanded adds `md-live--page-column` so the column matches the file-tab live markdown.
- Wiki, GitHub issue/PR bodies, and review reports stay on `MarkdownRenderer`
