# Brainstorm · APP-050: Shared Package Layering

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Missing package roles for api-types and api-client; risk of junk-drawer shared and contradictory packages/AGENTS guidance (“API clients live in apps”).

## Options considered

| Option | Outcome |
|--------|---------|
| A Docs-only | Insufficient alone |
| B Docs + cheap gate | **Chosen** (M11) |
| C Merge api-types into shared | Rejected |
| D Move terminal to api-types now | Deferred N2 |

## Settled decisions (post-review)

- packages/AGENTS.md is the single boundary map; must **rewrite** API-client guidance.
- Full role table includes i18n, config, ui, relay, apps, channels.
- Dependency graph: apps→ui and apps→shared independent; shared ↛ api-types/api-client.
- Terminal stream exception in shared; main `/ws` never piggybacks.
- Desktop IPC → desktop-electron only.
- Global ship order with 048/049 documented in TECH.
- Minimal grep/import check required for agent-safe layering.

## References

- packages/AGENTS.md, shared/AGENTS.md, relay/AGENTS.md
- APP-048, APP-049, QUALITY-004

## Ready to promote

- All material promoted to PRD/TECH/TEST (revised after critical+important review).
