# Control engine 0.19.2 protocol fixtures

Locked shapes for unit tests (no live TCC required). Pin: `cua-driver-rs-v0.19.2`.

## Call CLI

```
atmos-desktop-control call --socket <sock> [--screenshot-out-file <path>] <tool> <json-args>
```

- `--screenshot-out-file`: write first MCP image content block from the response to path.
- Tool input `screenshot_out_file` on `get_desktop_state` / `get_window_state`: write PNG instead of embedding base64.

## Real output shapes

1. **Success (MCP image)**: JSON with `content[]` image `{type, mimeType, data}` (base64).
2. **Success (file)**: JSON with `screenshot_file_path` (+ `screenshot_mime_type`).
3. **Failure (TCC/screencapture)**: **exit 0** + **plain non-JSON text** on stdout
   (see `get_desktop_state_fail_plain_text.txt`). Must NOT be treated as success.

## Browser tools (0.19+)

Canonical external Browser Use loop:

```text
start_session
browser_prepare (isolated_new default)
get_browser_state(pid, window_id)          # bind
get_browser_state(target_id, tab_id,
                  snapshot_format=semantic_v2)
browser_navigate | browser_click | browser_type
browser_pointer | browser_dialog | browser_download
```
