# Roles and artifacts

| Role env | UI label | Artifact |
|----------|----------|----------|
| orchestrator | Planner | `mode_proposal.json` |
| criteria | Criteria | `specs/v{n}.json` |
| maker | Maker | code + `work_state.json` |
| verify | Verify | verdicts |

Atomic write: `*.json.tmp` → validate → rename.

Maker cannot write `specs/` or `verdicts/`.
