# Envelope

```json
{
  "ok": true,
  "command": "atmos project list",
  "result": { },
  "next_actions": [
    {
      "command": "atmos workspace create --project <project-id> --name <name>",
      "description": "…",
      "params": {
        "project-id": { "value": "…", "required": true }
      }
    }
  ]
}
```

Failure:

```json
{
  "ok": false,
  "command": "…",
  "error": { "message": "…", "code": "SERVER_UNREACHABLE" },
  "fix": "Start the server: atmos runtime ensure",
  "next_actions": [ ]
}
```

- stdout: JSON only  
- exit `0` only when `ok: true`  
- large lists may set `truncated: true` and `total`  
