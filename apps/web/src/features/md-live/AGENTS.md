# md-live

Live markdown editor + Agent dock on the existing file tab (APP-067).

- Codec / fence / prompt: `@atmos/md-live`
- Generic Live engine (Milkdown, slash catalog, format commands): `@atmos/md-live/ui`
- `/` menu and selection toolbar: this feature, using `@workspace/ui` Command / DropdownMenu
- This feature owns Atmos-only host wiring: Agent dock, Save as, embeds that open native GitHub surfaces, terminal/PTY, file-tab mount
- Do not put md-live UI in `features/editor` beyond the `CodeMirrorEditor` mount point
- Wiki, GitHub issue/PR bodies, and review reports stay on `MarkdownRenderer`
