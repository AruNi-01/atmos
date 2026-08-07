# Brainstorm · APP-055: Run Terminal Logs

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

- **Trigger**: The right sidebar **Run** tab already starts project scripts in a dedicated terminal (`RunScript` → tmux window `run-main` / `run-*`). When a service fails, agents and users cannot reliably re-read that output later: the UI is ephemeral, scrollback is limited, and agents do not see the Run pane unless the user copies text.
- **Who feels it**: Agentic builders debugging `dev` / test / build failures; reviewers asking "why didn't the server start?".
- **Current workarounds**: Select terminal text + AI context (APP-031), paste into chat, or re-run the script hoping the error reproduces.
- **Why now**: Run is a stable product surface; local Agent Fix already writes under `.atmos/tmp/` for agent consumption; AI context chips already expand into labeled prompt blocks.

## Goals (draft)

- Persist Run terminal output as plain-text logs inside the user's local project tree so agents can open them with normal file tools.
- Give a low-friction slash command that injects a **chip** (not a log viewer tab) and expands into a short agent instruction on send.
- Keep volume bounded so long-running `dev` servers do not fill the disk.

## Options

### Option A — Server-side PTY tee for Run windows only (chosen direction)

When a Run-tagged tmux window streams output, the backend appends stripped text to `<project>/.atmos/run-logs/*.latest.log`, rotates on new Run, and prunes archives by size/count.

**Pros**: Complete even when the Run sidebar is collapsed or inactive; single writer; matches "local repo artifact" model.
**Cons**: Requires backend hooks on PTY/tmux output path; need project root resolution and gitignore hygiene.
**Unknown**: Exact attach point for control-mode vs simple PTY (decide in TECH).

### Option B — Frontend `onData` → `fsApi.append`

Client writes every chunk when the Run `Terminal` is mounted.

**Pros**: Faster to prototype.
**Cons**: Misses output when tab not mounted / context switch; reconnect races; multi-tab clients can double-write. Rejected for reliability.

### Option C — Periodic `capture_pane` dump

Poll scrollback and overwrite the log file.

**Pros**: Simple API reuse.
**Cons**: Duplicates, lost intermediate lines, TUI garbage frames, high cost. Rejected as primary path.

### Option D — Open center editor log tab from slash command

Slash command opens the file as a center-stage tab for the user.

**Pros**: Human can read logs without shell.
**Cons**: User explicitly does **not** want a log tab for v1; agents should read the path themselves. Deferred / out of scope for slash action (optional later "Open logs" control on Run toolbar is separate).

## Key forks in the road

- **Fork 1 · Where to write**: project `.atmos/run-logs/` (agent cwd-friendly) vs `~/.atmos/run-logs/<id>/`. → **PRD: project-local first**, fallback only if root unknown.
- **Fork 2 · Full shell transcript vs Run command block**: idle shell noise vs `CMD_START`…`CMD_END` blocks. → **PRD: prefer command blocks on Run script start**; continuous tee during busy run is OK.
- **Fork 3 · Slash UX**: open file / inject full log text / inject path chip. → **PRD: chip only**; short expanded prompt; agent reads file.
- **Fork 4 · Tee location**: frontend vs backend. → **TECH: backend single-writer tee**.
- **Fork 5 · Git**: user `.gitignore` vs Atmos-managed exclude. → **TECH: ensure ignored** (prefer managed exclude or documented pattern).

## Open questions

- [x] Slash opens editor tab? → **No**; chip only.
- [x] Prompt embeds full log? → **No**; path + short reading tip.
- [ ] Multi Run tabs: one chip for "latest active" vs picker? → Decide in PRD (prefer latest `run-main` then most recently updated `.latest`).
- [ ] Opt-out setting in v1? → Nice to Have; default on is fine if size-capped.
- [ ] Strip ANSI fully vs keep basic color codes? → Prefer strip for agent readability (TECH).

## References

- Existing Run UI: `apps/web/src/features/browser/components/RunScript.tsx`
- Terminal PTY reader: `crates/core-service/src/service/terminal/runtime.rs` (`spawn_pty_reader`, control-mode attach)
- Agent-local files: `apps/web/src/features/agent-fix/lib/agent-fix-prompt-file.ts` (`.atmos/tmp/agent-fix/`)
- AI context chips: `apps/web/src/shared/lib/ai-context-protocol.ts`
- Terminal selection context (chip expand pattern): [APP-031](../APP-031_terminal-selection-ai-context/PRD.md)
- Local services (complementary, not the same): [APP-023](../APP-023_local-run-server-manager/PRD.md)

## Ready to promote

- Promote to PRD: project-local Run logs; chip-only slash `View Run Logs`; short path-based agent prompt; size rotation; no full-log paste; no log tab from slash.
- Promote to TECH: backend tee for `run-*` windows; path layout; AI context kind or protocol token; ANSI strip; prune rules; i18n keys.
