# cua-driver 0.17.0 engine protocol fixtures

Locked from the pinned binary (no live TCC required for unit tests).

## Call CLI

```
cua-driver call --socket <sock> [--screenshot-out-file <path>] <tool> <json-args>
```

- `--screenshot-out-file`: write first MCP image content block from the response to path.
- Tool input `screenshot_out_file` on `get_desktop_state`: write PNG instead of embedding base64.

## Real output shapes

1. **Success (MCP image)**: JSON with `content[]` image `{type, mimeType, data}` (base64).
2. **Success (file)**: JSON with `screenshot_file_path` (+ `screenshot_mime_type`).
3. **Failure (TCC/screencapture)**: **exit 0** + **plain non-JSON text** on stdout
   (see `get_desktop_state_fail_plain_text.txt`). Must NOT be treated as success.

## Phantom keys (absent in 0.17.0 binary)

Verified via `strings` on `cua-driver` 0.17.0:

- no `screenshot_base64`
- no `png_base64` (Atmos may inject after extract)
- has `screenshot_file_path`, `screenshot_mime_type`, `screenshot_out_file`
