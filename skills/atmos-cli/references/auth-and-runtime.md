# Auth and runtime

```bash
atmos runtime ensure
atmos runtime status
atmos status
```

API base URL resolution (highest first):

1. `--api-url` / `ATMOS_API_URL`
2. `~/.atmos/client-session.json` (relay mode)
3. `~/.atmos/state/runtime_manifest.json` (local)

Token: `--api-token` → `ATMOS_API_TOKEN` → `ATMOS_LOCAL_TOKEN` → client-session `gateway_token`.

```bash
atmos computer status   # relay computer
atmos computer start    # register + ensure
```
