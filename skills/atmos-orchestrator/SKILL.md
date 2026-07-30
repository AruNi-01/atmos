---
name: atmos-orchestrator
version: "1.0.0"
description: "Operate Atmos Orchestrator multi-step agent runs (Loop/Graph) via `atmos orchestrator` CLI: create runs, Judgment Specs, evidence, workspace isolation, and context. Use for multi-step coding with explicit completion criteria."
license: MIT
---

# Atmos Orchestrator Agent Skill

Drive **multi-step Loop / Graph runs** with `atmos orchestrator`.  
Do **not** invent “done” without a Judgment Spec + sensors.  
Do **not** use ordinary Canvas (`atmos canvas`) to simulate orchestration.

```text
Default:  run create → spec draft → confirm → start → poll run get → done
Optional: workspace create/use/merge for isolation
Runtime owns Loop/Graph advancement (no public tick verb).
```

---

## Prerequisites

1. `atmos` on `PATH`.
2. Local Atmos Server running (`atmos runtime ensure` / dev-api).
3. CLI auth same as other `atmos` commands.
4. Run **home** = user Project/Workspace path (or standalone).

`atmos orchestrator skill-dir` prints this directory after system skill sync.

---

## Decision tree

| Intent | Action | Reference |
|--------|--------|-----------|
| Multi-step fix with tests | Loop + sensor Spec | this file |
| Real parallel/branch work | Graph + compile | `references/workspace-isolation.md` |
| Full flags / errors | — | `references/command-reference.md` |
| Role artifacts | — | `references/roles-and-artifacts.md` |

---

## Default workflow

1. `atmos orchestrator status`
2. `atmos orchestrator run create --goal "…" --mode loop --workspace <guid> --home-cwd <path>`  
   (or `--target-kind project --project <guid>`)
3. Write Spec JSON (sensors first), then:  
   `atmos orchestrator spec draft --run <id> --file spec.json`
4. `atmos orchestrator spec confirm --run <id> --version 1` if required
5. `atmos orchestrator run start --run <id>`  
   (Runtime advances Loop/Graph with fixture or worker agents — agents do **not** call tick)
6. Poll: `atmos orchestrator run get --run <id>` / `context get` until terminal status
7. On need for isolation: see workspace section below
8. Report `stop_reason`, Spec version, evidence paths

### Forced mode

`--mode loop|graph` **skips planner**. Auto requires `mode_proposal.json` (planner).

---

## Working directory (critical)

- **Default cwd for every role** = run **home** (user’s Project/Workspace).
- Use `atmos orchestrator context get --run <id>` — field `home.cwd`.
- **Never** invent a random home directory.

### When to isolate

Create a **child workspace** only when the task needs it:

- parallel writers
- speculative / risky changes
- branch-per-feature before merge

```text
atmos orchestrator workspace create --run <id> --purpose "parallel experiment"
atmos orchestrator workspace use --run <id> --workspace <guid> --role maker
# … work …
atmos orchestrator workspace merge --run <id> --workspace <guid>
# or abandon
```

Do **not** run raw `git worktree` outside this CLI (orphans forbidden).

---

## Compact verbs

| Verb | Purpose |
|------|---------|
| `skill-dir` | Local skill path |
| `status` | API health |
| `run create\|list\|get\|start\|cancel` | Lifecycle |
| `spec draft\|get\|confirm\|update` | Judgment Spec |
| `evidence attach\|list` | Evidence files |
| `graph compile\|get\|step` | Graph |
| `workspace get\|list\|create\|use\|merge\|abandon` | Home + children |
| `context get` | Agent context pack |
| `agents` | Agent ids |

Full flags: `references/command-reference.md`.

---

## Anti-patterns

- ❌ Complete because maker said “done”
- ❌ Maker edits Spec or sensor files to force green
- ❌ Multi-maker write on home without isolation
- ❌ Start without Spec
- ❌ Simulate Loop via `atmos canvas` scripts
- ❌ Use ACP / random LLM API as Orchestrator brain

---

## Errors (short)

| Code | Recovery |
|------|----------|
| `ORCH_SPEC_REQUIRED` | `spec draft` |
| `ORCH_SPEC_CONFIRM_REQUIRED` | `spec confirm` |
| `ORCH_GRAPH_COMPILE_FAILED` | fix graph or use `--mode loop` |
| `ORCH_WORKSPACE_NOT_CHILD` | `workspace list` |

---

## Reporting

- Run id, mode, Spec version, `stop_reason`
- `home.cwd` + any child workspaces
- Evidence paths under run artifact dir
