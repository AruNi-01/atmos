---
name: atmos-cli
version: "1.0.0"
description: >
  Operate Atmos product state via the `atmos` CLI (projects, workspaces, terminals,
  runs, settings, git, headless control). Use when the agent must create or manage
  Atmos resources without the UI. Do not use for desktop GUI capture/click
  (atmos-desktop-use), in-page browser DOM (atmos-browser-use), or canvas drawing
  (atmos-canvas-agent).
---

# Atmos CLI (product control)

Control Atmos **product state** with the `atmos` binary. Prefer **typed L1 resource
commands**. Use `atmos call` only as an escape hatch when no L1 verb exists.

```text
Default path:  status → project/workspace L1 → terminal/run → settings
Escape hatch:  atmos call <wire_action> --data '{…}'
Not this skill: canvas · desktop-use · browser-use
```

---

## Prerequisites

1. `atmos` on `PATH` (`atmos --version`).
2. Atmos Server up (`atmos runtime ensure` or Desktop).
3. Auth when required: `--api-token` / `ATMOS_API_TOKEN` / `ATMOS_LOCAL_TOKEN`.
4. Fresh shell per tool call — re-run full commands.

---

## Envelope (always JSON)

Every command prints **one JSON object** to stdout:

| Field | Meaning |
|-------|---------|
| `ok` | success |
| `command` | what ran |
| `result` | payload when `ok` |
| `error.code` / `error.message` | when failed |
| `fix` | plain-language recovery |
| `next_actions` | suggested next commands (templates + params) |

Exit code `0` iff `ok: true`. Prefer following `next_actions` and `fix`.

Details: [`references/envelope.md`](references/envelope.md).

---

## Decision tree (load references on demand)

| Intent | Commands | Load reference |
|--------|----------|----------------|
| Server ready? | `atmos status` | [`auth-and-runtime.md`](references/auth-and-runtime.md) |
| Auth / start server | `atmos runtime ensure` | [`auth-and-runtime.md`](references/auth-and-runtime.md) |
| Project / workspace / group | `atmos project …` / `workspace …` / `group …` | [`project-workspace.md`](references/project-workspace.md) |
| Terminal / run logs | `atmos terminal …` / `run …` | [`terminal-run.md`](references/terminal-run.md) |
| Settings | `atmos settings …` | [`settings.md`](references/settings.md) |
| Git via Atmos | `atmos git …` | [`git.md`](references/git.md) |
| No typed command | `atmos call` / `actions list` | [`call-escape-hatch.md`](references/call-escape-hatch.md) |
| Canvas diagram | **other skill** | `atmos-canvas-agent` |
| Screenshot / click OS UI | **other skill** | `atmos-desktop-use` |
| Page DOM / CDP | **other skill** | `atmos-browser-use` |

---

## Golden path (headless)

```bash
atmos status
atmos project validate-path --path /path/to/git/repo
atmos project create --name my-app --path /path/to/git/repo
# use project guid from result / next_actions:
atmos workspace create --project <project-guid> --name feature-x --branch feature-x
atmos context set --project <project-guid> --workspace <workspace-guid>
atmos terminal create --workspace <workspace-guid>
atmos settings bootstrap
```

Destructive deletes require **`--yes`**.

---

## Critical rules

1. **Prefer L1** (`project create`, not inventing WebSocket clients).
2. **Follow `next_actions`** — IDs are often pre-filled in `params`.
3. **`--yes` for delete/destroy** or you get `CONFIRMATION_REQUIRED`.
4. Set context with `atmos context set` or flags `--project` / `--workspace` / env.
5. Do **not** start every task with `actions list` + `call`.

---

## Anti-patterns

- ❌ Driving the Web UI (or desktop-use) for basic project/workspace CRUD  
- ❌ Dumping the full wire-action catalog into context  
- ❌ Using `atmos call` when an L1 command exists  
- ❌ Omitting `--yes` on deletes then retrying blindly without reading `fix`  
- ❌ Mixing this skill with canvas/desktop-use without need  

---

## Errors (short)

| Code | Recovery |
|------|----------|
| `SERVER_UNREACHABLE` | `atmos runtime ensure` |
| `UNAUTHORIZED` | set token flags / env |
| `CONFIRMATION_REQUIRED` | re-run with `--yes` |
| `CONTEXT_REQUIRED` | pass `--project` / `--workspace` or `context set` |
| `UNKNOWN_ACTION` | `atmos actions list --filter …` then fix `call` name |

More: [`references/errors.md`](references/errors.md).

---

## Related skills

| Skill | When |
|-------|------|
| `atmos-canvas-agent` | Live canvas drawing |
| `atmos-desktop-use` | Local OS GUI capture/click |
| `atmos-browser-use` | Page CDP control |
| `atmos-review-fix` | Review-session agent flows |

---

## References (on-demand)

| File | Load when |
|------|-----------|
| [`references/envelope.md`](references/envelope.md) | Envelope details |
| [`references/auth-and-runtime.md`](references/auth-and-runtime.md) | API URL, token, runtime |
| [`references/project-workspace.md`](references/project-workspace.md) | project / workspace / group / context |
| [`references/terminal-run.md`](references/terminal-run.md) | terminal / run |
| [`references/settings.md`](references/settings.md) | settings |
| [`references/git.md`](references/git.md) | git |
| [`references/call-escape-hatch.md`](references/call-escape-hatch.md) | `call` / actions list |
| [`references/errors.md`](references/errors.md) | error codes |
| [`references/command-index.md`](references/command-index.md) | compact L1 index |

Skill source: `skills/atmos-cli/` (synced to `~/.atmos/skills/.system/atmos-cli/` with other system skills).
