# Escape hatch (`call`) — secondary

Use only when **no L1 command** covers the need.

```bash
atmos actions list [--filter project]
atmos call project_list --data '{}'
atmos call workspace_create --data '{"project_guid":"…","name":"x","branch":"x"}'
atmos call <action> --file ./payload.json
```

Wire names are snake_case `WsAction` values. Prefer discovering with L1 + `atmos` root tree first.
