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
    simulator/              # APP-060 claims / leases (not under data/desktop/)

  config/               # non-secret preferences
    function_settings.json   # product preferences (not center layout)
    agent/              # terminal_code_agent.json, acp_registry.json, chat_prefs.json, …
    llm/providers.json

  data/                 # durable product data
    db/atmos.db
    workspaces/
    review/
    automations/
    desktop/            # Desktop shell-only ATMOS_DATA_DIR (NOT product feature data)
    desktop-use/
    browser-use/
    quota-usage/        # always here — never under data/desktop/
    token-usage/        # always here — never under data/desktop/
    permission-access/  # consent.json — never under data/desktop/
    local-model-runtime/
    agent/sessions/
    pt-design/          # saved Prototype Design documents (*.ptdesign.json)
    layout/             # durable UI layouts
      center/           # per-workspace/project space mosaics
        saved-layouts.json
        {hostId}/space-layout.json

  bin/ runtime/ shims/ skills/   # install artifacts
                                 # runtime/serve-sim/<version>/  (APP-060 helper)
  logs/ cache/                   # ops
                                 # cache/serve-sim/  (APP-060 download parts)
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

### `ATMOS_DATA_DIR` (Desktop)

Desktop may set `ATMOS_DATA_DIR=~/.atmos/data/desktop` for **shell-scoped** Server process data only.

**Do not** nest product feature stores under it. These always resolve to fixed layout paths (with optional feature-specific env overrides for tests):

| Feature | Canonical path | Override env |
|---------|----------------|--------------|
| Token usage | `~/.atmos/data/token-usage` | `ATMOS_TOKEN_USAGE_DIR` |
| Quota usage | `~/.atmos/data/quota-usage` | `ATMOS_QUOTA_USAGE_DIR` |
| Permission Access | `~/.atmos/data/permission-access` | `ATMOS_PERMISSION_ACCESS_DIR` |
| SQLite | `~/.atmos/data/db/atmos.db` | (infra path) |
| Workspaces | `~/.atmos/data/workspaces` | — |
| Prototype Design | `~/.atmos/data/pt-design` | `ATMOS_PT_DESIGN_DIR` |
| Center layout | `~/.atmos/data/layout/center` | `ATMOS_CENTER_LAYOUT_DIR` |

Wrong (historical): `$ATMOS_DATA_DIR/token-usage` → `data/desktop/token-usage`.
