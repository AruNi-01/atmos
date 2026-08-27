# md-live

Live markdown editor + Agent dock on the existing file tab (APP-067).

- Codec / fence / prompt: `@atmos/md-live`
- Host UI: this feature (`MarkdownLiveEditor`, embeds, Save as, composer dock)
- Do not put md-live UI in `features/editor` beyond the `CodeMirrorEditor` mount point
- Wiki, GitHub issue/PR bodies, and review reports stay on `MarkdownRenderer`
