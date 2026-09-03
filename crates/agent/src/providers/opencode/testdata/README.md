# OpenCode native adapter fixtures

Pin used for these recordings:

- **CLI / OpenAPI**: OpenCode server docs + `@opencode-ai/sdk` `types.gen.ts` on `anomalyco/opencode` `dev` as of 2026-09-01 (permission HTTP: `POST /session/{id}/permissions/{permissionID}` body `{ "response": "once"|"always"|"reject" }`). `POST /session` and `prompt_async` send selected mode as `agent`.
- **SSE event names**: APP-068 `native-opencode.md` / Orca ADR 0014 live spike (`permission.asked`, `message.part.delta`, `session.idle`). Current generated Event union also emits `permission.updated` and puts `delta` on `message.part.updated`; the adapter maps both.
- **`message.part.delta.field`**: this is the JSON field on the part (`text`), not `part.type`. Reasoning vs answer is `part.type` (`reasoning` | `text`) looked up by `partID`. Deltas can arrive before the first `message.part.updated` for that `partID`.
- **Question reply**: newer HttpApi `POST /session/{id}/question/{requestID}/reply` (204) and `…/reject`. Fallback: `POST /question/{requestID}/reply` if `/doc` only lists that. `openapi-doc.json` records the session-scoped paths.

CI does not spawn a live `opencode` binary. Re-record `openapi-doc.json` and SSE from `GET /doc` + `GET /event` when paths or event names move.

`remember` is **not** sent on permission replies: current `/doc` body is only `{ response }`; `always` is the remember dialect (do not send both).
