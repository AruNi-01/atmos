# PROGRESS · APP-035 TanStack Query Data Layer

Implementation handoff log (not a requirements source). See PRD/TECH/TEST for contracts.

## Status: implementation largely complete — deferred items remain by design

### Shipped

| Area | Notes |
|------|-------|
| Foundation | QueryClient, provider above WS, focus bridge, keys, scope epoch/auth/session revisions |
| Lifecycle | Target change cancel/remove + epoch bump; identity/session helpers; legacy reset registry |
| Reconnect | Selective invalidation of registered roots |
| Pilot | System REST queries, settings bootstrap via Query, usage overview + event bridge |
| Core | Project bootstrap Query-owned; Git status/changedFiles/branches Query-owned; File tree Query-owned |
| Extended | Token usage, skills, automations (+ events), GitHub PR lists, local services/models, agent registry, **review sessions** (primary consumer Query-owned; comments local) |
| Inventory | `api-operation-inventory.ts` + Bun validation tests |
| Tests | 66 Bun tests under `apps/web/src/api/query/__tests__/` covering isolation, enablement, events, inventory, races |

### Intentionally deferred (TECH)

- Canvas board transport consolidation
- ACP session infinite query design
- Terminal layout persistence redesign
- Agent Hooks live-lifecycle redesign
- Streams: PTY, Agent Chat, automation_run_output, commit message chunks
- Editor buffers / APP-034 terminal DOM cache / connection bootstrap orchestration
- Git `fileDiff` content still imperative in DiffViewer (optimization)
- Review comments full cutover (sessions Query-owned by `use-review-context`; optimistic comment UX remains local)
- Volatile GlobalSearch content debounce remains imperative
- Query Devtools / shared web–mobile key package

### Verification commands

```bash
cd apps/web && bun test src/api/query   # 66 pass
cd apps/web && bun typecheck            # only pre-existing tldraw/lezer errors
```

E2E smoke / agent-browser: not run in this cloud environment (no stateful app server for full journey).
