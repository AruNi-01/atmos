# Orchestrator CLI command reference

Base HTTP: `/api/orchestrator/v1` (authenticated).

Global: `--api-url`, token env, `--json`, `--timeout-ms`.

| CLI | HTTP |
|-----|------|
| `status` | `GET /status` |
| `agents` | `GET /agents` |
| `run create` | `POST /runs` |
| `run list` | `GET /runs` |
| `run get` | `GET /runs/{id}` |
| `run start` | `POST /runs/{id}/start` |
| `run cancel` | `POST /runs/{id}/cancel` |
| `tick` | `POST /runs/{id}/tick` |
| `spec draft` | `POST /runs/{id}/spec/draft` |
| `spec get` | `GET /runs/{id}/spec` |
| `spec confirm` | `POST /runs/{id}/spec/confirm` |
| `spec update` | `PATCH /runs/{id}/spec` |
| `evidence attach` | `POST /runs/{id}/evidence` |
| `context get` | `GET /runs/{id}/context` |
| `graph compile` | `POST /runs/{id}/graph/compile` |
| `graph step` | `POST /runs/{id}/graph/step` |
| `workspace create` | `POST /runs/{id}/workspaces` |
| `workspace use` | `POST /runs/{id}/workspace/use` |
| `workspace merge` | `POST /runs/{id}/workspaces/{ws}/merge` |
| `workspace abandon` | `POST /runs/{id}/workspaces/{ws}/abandon` |
| `skill-dir` | local only |

Exit non-zero on HTTP 4xx/5xx. Validation messages may include `ORCH_*` codes.
