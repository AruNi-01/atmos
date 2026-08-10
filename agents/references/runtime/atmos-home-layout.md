# `~/.atmos` layout

Canonical on-disk layout (no legacy root-level secret/config files).

```text
~/.atmos/
  credentials/          # secrets & machine identity (prefer mode 0600)
    computer-client.json
    linear_local_keys.json
    relay_identity.json

  state/                # sessions & discovery
    runtime_manifest.json
    client-session.json
    cli/update-check.json

  config/               # non-secret preferences
    function_settings.json
    agent/              # terminal_code_agent.json, acp_registry.json, …
    llm/providers.json

  data/                 # durable product data
    db/atmos.db
    workspaces/
    review/
    automations/
    desktop/            # Desktop ATMOS_DATA_DIR default
    desktop-use/
    browser-use/
    quota-usage/
    token-usage/
    local-model-runtime/
    agent/sessions/

  bin/ runtime/ shims/ skills/   # install artifacts
  logs/ cache/                   # ops
```

## Rules

| Kind | Directory | Examples |
|------|-----------|----------|
| Secrets | `credentials/` | device credential, Linear API keys, server_secret |
| Session / discovery | `state/` | runtime manifest, relay client session |
| Preferences | `config/` | function_settings, code agents, LLM providers |
| Large / feature data | `data/` | SQLite, workspaces, desktop-use |
| Install | top-level | `bin/`, `runtime/`, `skills/` |

- Hub OAuth tokens stay on **Hub**, not under `credentials/`.
- Path helpers: `runtime_manager::layout` (and matching crates that mirror the same relative paths).
- Do **not** reintroduce root-level `computer-client.json` / `runtime_manifest.json` / `function_settings.json`.
