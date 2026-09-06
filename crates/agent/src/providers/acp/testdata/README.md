# ACP mapper fixtures

Recorded against `agent-client-protocol` 2.0.0 shapes used by `ToolCallUpdate.raw_input` / `raw_output`. CI does not need a live CLI.

`kind_title_content.json` is the DeepSeek Harness / standard ACP shape: protocol `kind` + human `title`, empty `rawInput`, result in `content` text.

`grok_background.json` is a Grok-ACP envelope (`type` / `Result` / `taskoutput`). Shared `tool_map` must not unwrap it; `overlays/grok_acp.rs` does, keyed by ACP registry ids such as `grok-build`. Native `grok` uses `providers/grok/tool_map.rs`.
