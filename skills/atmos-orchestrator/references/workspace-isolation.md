# Workspace isolation

## Run home

User selects Project or Workspace when creating a run. That path is `home.cwd` for Planner, Criteria, Maker, and Verify by default.

## Child workspace

```text
workspace create → use (bind role) → work → merge | abandon
```

- `create_source` marker: `.atmos-orch-workspace` with `run_id`
- Parallel writers require `isolation=worktree` on graph nodes **and** child cwd bind
- Merge is explicit and user-visible

## Do not

- Create orphan worktrees outside CLI
- Write outside home/children (`ORCH_CWD_FORBIDDEN`)
