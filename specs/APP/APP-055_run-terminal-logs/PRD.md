# PRD · APP-055: Run Terminal Logs

> Product Requirements · WHAT and WHY. Settled direction for persisting right-sidebar Run terminal output as local project logs and exposing them to agents via a chip-based slash command.

## Context

- **Problem**: Run terminal output is the primary signal when a configured project script fails, but it lives only in an interactive terminal. Agents cannot reliably inspect it without the user copying text or re-running the command.
- **Why now**: Run is already the place users start services; agents already read workspace files; AI context chips already carry short path/instruction payloads without dumping large blobs into the composer.
- **Related specs**:
  - [APP-023 Local Run Server Manager](../APP-023_local-run-server-manager/PRD.md) — discovers running services; does **not** replace process stdout logs.
  - [APP-031 Terminal Selection AI Context](../APP-031_terminal-selection-ai-context/PRD.md) — selection chips; this spec is whole-Run log artifacts.
  - [APP-026 Agent Fix Launcher](../APP-026_agent-fix-launcher/PRD.md) — local `.atmos` files for agent consumption.

## Goals

1. Persist Run terminal output as plain-text files under the user's local project so agents and users can re-read failures without copying from the terminal.
2. Let users attach the latest Run log to a prompt with a slash command that only inserts a **chip** (no center log tab).
3. Keep disk and prompt cost bounded: logs rotate; the expanded prompt points at a path and tells the agent **not** to read the entire file blindly.

## Users & Scenarios

- **Primary persona**: Agentic Builder who starts a service from the Run tab and asks a terminal or welcome agent to diagnose a crash.
- **Secondary persona**: Human developer who wants a stable on-disk transcript of the last Run without opening external tools.

### Key scenarios

1. User configures Run as `bun run dev`, clicks Run, the server errors on boot. They type `/` → **View Run Logs**, a chip appears, they type "why did this fail?" and send. The agent receives a short instruction with the log path and reads the **tail** of the file.
2. User re-runs after a fix. The previous `.latest` log is archived; the new run writes a fresh `.latest`. The slash chip resolves to the new latest path.
3. User has extra Run terminal tabs. Slash picks a sensible default (main Run first, else most recently updated latest log) without opening a picker in v1.
4. Long-running verbose server fills many megabytes. Rotation keeps total size under a hard budget; the agent tip still applies.

## User Stories

- As a developer, I want Run output saved under my project, so that I can inspect or share the last failure without re-running.
- As an agentic builder, I want a slash command that attaches Run log context as a chip, so that I can diagnose failures without pasting walls of text.
- As a user sending that chip, I want the agent to be told the path and to start from the end or search first, so that large logs do not waste context.

## Functional Requirements

### Must Have

- **M1 · Local Run log files**: While a right-sidebar Run terminal session produces output, Atmos writes a plain-text projection of that output into the current Project root under `.atmos/run-logs/`. Writing must not depend on the Run sidebar remaining visible.

- **M2 · Stable latest path**: Each Run terminal tab maps to a predictable latest file (at minimum `run-main.latest.log` for the default Run tab; additional tabs use a stable id-based name). Agents and the slash command use the latest path by default.

- **M3 · Run start markers & rotation**: When the user starts a configured Run script (or an equivalent new Run invocation that Atmos treats as a new run), Atmos closes the previous latest file into `archive/` (if non-empty) and opens a fresh latest file with a short header (time, command if known, tab id).

- **M4 · Volume limits**: Logs are size-capped and archives are pruned (per-file max, max archives per tab, optional total directory budget). Atmos must not unbounded-grow project disks from Run logging alone.

- **M5 · Plain-text projection**: Log content is text suitable for agent file tools: strip ANSI/control sequences; do not require replaying a TTY. Binary noise should not corrupt the file for normal UTF-8 readers.

- **M6 · Git hygiene**: Run logs must not show up as normal untracked project noise. Atmos ensures `.atmos/run-logs/` is ignored for git status purposes (managed exclude and/or documented project ignore pattern).

- **M7 · Slash command · View Run Logs**: Welcome and terminal AI Input slash menus expose **View Run Logs**. Selecting it inserts a removable **chip** into the composer. It does **not** open a center-stage log tab, file viewer, or dedicated logs panel.

- **M8 · Chip → prompt expansion**: On send, the chip expands to a **short** instruction block that:
  - states this is an **Atmos Run log** (not arbitrary user paste);
  - includes the absolute or project-relative path to the chosen latest log file;
  - tells the agent to **read the log itself** with file tools;
  - warns that the log may be large — **do not read the whole file at once**; prefer the **end (tail)** first, or **search then read** relevant sections.

  The expanded prompt must **not** inline the full log contents.

- **M9 · Empty / missing log behavior**: If no log file exists yet, the slash command still inserts a chip (or shows recoverable inline feedback) that explains no Run log is available and that the user should Run a script first. Prefer clear guidance over a silent no-op.

- **M10 · Scope · Web/Desktop Run surface**: Applies to the right-sidebar Run terminals for Project/Workspace contexts on web and desktop local runtime. Mobile is out of scope.

- **M11 · Localization**: Slash label/description, chip label/tooltip, empty-state copy, and expanded prompt template strings are localized in every web locale (English UI uses sentence case; not ALL CAPS).

### Nice to Have

- **N1 · Run toolbar "Open latest log"**: Optional human action on the Run panel to open the file in the editor (separate from slash).
- **N2 · Multi-tab picker**: Slash submenu to choose among `run-main` / other Run tabs when several latest logs exist.
- **N3 · User setting to disable Run log capture**: Off switch under settings if dogfood shows unwanted disk use.
- **N4 · Structured index**: `index.json` listing tab → path, mtime, size, last command for richer UI.
- **N5 · Auto-attach on Agent Fix from Run failures**: Future wiring if Run surfaces an error action.

## Out of Scope

- **Opening a log tab from the slash command** — v1 is chip-only by product decision.
- **Inlining full log text into the agent prompt** — agents read the file path.
- **Logging all center-stage terminals** — only right-sidebar Run windows (`run-*`), not every terminal tab.
- **Cloud upload / relay of Run logs** — local project (or local machine fallback) only.
- **Replacing APP-023 Local Services** — port discovery is separate from stdout logs.
- **Perfect TUI recording** — interactive full-screen TUIs may be incomplete or noisy; v1 optimizes for typical script/`dev` server output.
- **Mobile Run log UI**.
- **New REST APIs** unless TECH proves no viable WS/FS path (prefer existing FS + PTY path).

## Success Metrics

- **Leading**: After a failed Run, a dogfood user can attach **View Run Logs** and get a useful agent diagnosis without pasting terminal text.
- **Reliability**: Log writing continues while the Run sidebar is collapsed; reopening Run does not lose the on-disk latest file for the active run.
- **Safety**: Project git status does not flood with run-log files in normal dogfood repos.
- **Resource**: With a chatty `dev` server for 8 hours, total `.atmos/run-logs/` size stays within the documented budget after prune.

## Risks & Open Questions

- **Risk · Secrets in logs**: Dev servers often print tokens/env. Mitigation: local-only, gitignored, no cloud upload; chip prompt should not claim the log is sanitized.
- **Risk · Disk fill**: Mitigated by M4 hard limits; default-on only if prune is reliable.
- **Risk · Duplicate writers**: Multiple UI attaches to the same tmux window must not double-append (single backend writer).
- **Risk · Path resolution on workspace vs project main**: Prefer Project root used by Run scripts; document workspace-linked path in TECH.
- **Decision · Default log selection for slash**: Use `run-main.latest.log` if present; else the most recently modified `*.latest.log` under `.atmos/run-logs/`.

## Milestones

- **Phase 1**: M1–M6 — backend tee, paths, rotation, prune, gitignore hygiene, plain-text strip.
- **Phase 2**: M7–M11 — slash command, chip, prompt expansion, empty state, i18n, tests.
- **Phase 3 (optional)**: N1–N5 as dogfood demands.
