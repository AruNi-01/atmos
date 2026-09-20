---
name: atmos-automation
version: "1.0.0"
description: >
  Finish an Atmos Terminal or Chat automation run. Read instructions, write
  final.md, update memory only for durable facts, then call
  `atmos automation complete`. Not folded into atmos-cli. Do not use for
  headless process-runner jobs (those complete on process exit).
---

# Atmos automation

You are inside a **Terminal** or **Agent Chat** tab created by an Atmos
automation run. The run stays `running` until you mark it complete. Process or
TTY exit does **not** finish the job.

Details: [`references/cli.md`](references/cli.md).

## When to use

- The first prompt told you to read `~/.atmos/skills/.system/atmos-automation/SKILL.md`.
- You are doing a saved Atmos automation (job + run artifacts).

Do **not** use this skill to start automations from scratch, or for Headless
Spawn runs (the runner writes `final.md` / `run.json` on process exit).

## Flow

1. Call `atmos automation paths --run <run_guid>` (never guess paths).
2. Read `instructions.md` at `instructions_path`.
3. Do the job in the returned `cwd`.
4. Write the final result to `result_path` (`final.md`).
5. Update `memory.md` only for a durable fact a later run would miss.
6. Mark the run finished:
   - Success: `atmos automation complete --run <run_guid>`
   - Failure: `atmos automation complete --run <run_guid> --failed --message "<short reason>"`

Optional: `atmos automation status --run <run_guid>` to confirm.

## Rules

- Never guess file paths. Always call `paths` first.
- Never mark complete without a non-empty `final.md` unless `--failed`.
- Do not treat process exit, TTY close, or chat idle as done.
- Do not exec ad-hoc file writes outside the returned paths.
- Do not invent other CLI verbs. Only `complete`, `status`, and `paths` (plus `run` if a human asked to start a job).

## File locations

Typical layout under `~/.atmos/data/automations/`:

| Path | Meaning |
|------|---------|
| `definitions/{automation_guid}/` | Job home (`instructions.md`, `memory.md`) |
| `definitions/{automation_guid}/instructions.md` | Job instructions |
| `definitions/{automation_guid}/memory.md` | Durable memory |
| `runs/.../{run_guid}/` | This run (`prompt.md`, `final.md`, `run.json`) |
| `~/.atmos/skills/.system/atmos-automation/SKILL.md` | This skill |

`atmos automation paths --run <guid>` returns the concrete paths for this run.

## CLI verbs

| Intent | Command |
|--------|---------|
| Resolve paths | `atmos automation paths --run <guid>` |
| Check status | `atmos automation status --run <guid>` |
| Finish success | `atmos automation complete --run <guid>` |
| Finish failure | `atmos automation complete --run <guid> --failed --message "<reason>"` |
| Start a saved job | `atmos automation run --id <automation_guid>` |

These call Atmos Server (`POST /api/cli/invoke`). They are not a second data plane.
