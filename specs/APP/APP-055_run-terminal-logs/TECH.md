# TECH · APP-055: Run Terminal Logs

> Technical Design · HOW. Implements PRD APP-055: Run Terminal Logs.

## Scope summary

Addresses PRD **M1–M11**. Nice-to-haves N1–N5 deferred.

Two halves:

1. **Backend capture** — single-writer tee of Run tmux/PTY output into project-local plain-text files under `.atmos/run-logs/`, with rotation and prune.
2. **Frontend attach** — slash command **View Run Logs** inserts an AI-context chip; on send, expand to a short path-based agent instruction (no center log tab, no full-log inline).

No new REST endpoints. Prefer existing FS capabilities and the terminal session pipeline. Optional thin WS helpers only if path listing cannot be done safely on the client via existing `fsApi`.

## Architecture overview

```text
RunScript (right sidebar)
  └─ Terminal session, tmux window: run-main | run-{tabId}
         │
         ▼
  core-service terminal runtime
    spawn_pty_reader / control-mode stdout
         │
         ├──────────────────────► UI (xterm) via existing WS stream
         │
         └─ RunLogTee (new)
              · only if window name matches run-*
              · strip ANSI → text
              · append buffered to <project>/.atmos/run-logs/*.latest.log
              · rotate / prune

Slash "View Run Logs"
  → resolve latest path under project root
  → registerAiContextPrompt("run-log", shortInstruction)
  → composer chip only
  → on submit: materializeAiContextText → agent sees path + tips
```

**Sync model**: one-way projection. Terminal UI and log file share the PTY source; they are **not** bidirectional. Reattach must **not** re-dump full scrollback into the log (avoids duplication).

## Product decisions resolved in TECH

| Decision | Resolution |
|----------|------------|
| Tee location | Backend single-writer on PTY/control-mode output for Run windows |
| Path root | `currentProjectPath` / project root used by Run scripts |
| File layout | `.atmos/run-logs/{window}.latest.log` + `archive/` |
| Slash UX | Chip only via AI context kind `run-log`; no editor tab |
| Prompt content | Short path + "Atmos Run log" + tail/search tip; never inline full log |
| Multi-tab default | `run-main.latest.log` if exists; else newest `*.latest.log` by mtime |
| ANSI | Strip for agent-readable plain text |
| Default capture | On while session is busy / after Run start marker; tee while Run window produces output for that latest file (see lifecycle) |
| Git | Via `core_engine::ensure_project_atmos_dir`: create `.atmos/` and merge full managed `.atmos/.gitignore` (`attachments/`, `tmp/`, `run-logs/`). Features only call this helper (fallback); no per-feature ad-hoc rules. |

## Module-by-module design

### crates/core-service — `RunLogTee`

Add a focused module, e.g.:

```text
crates/core-service/src/service/terminal/run_log_tee.rs
```

Responsibilities:

- Given `(project_root, tmux_window_name, bytes)`, decide whether to tee.
- Maintain open append handles keyed by `(project_root, window_name)` with buffered flush (e.g. 64 KiB or 200 ms, whichever first).
- Rotate / prune helpers.
- Pure helpers unit-testable without full tmux.

Window filter:

```text
run-main          → run-main.latest.log
run-{tabId}       → run-{tabId}.latest.log
other windows     → no tee
```

Match existing `getRunTerminalWindowName` in `RunScript.tsx` (`run-main`, `run-${tabId}`).

#### Lifecycle

1. **Session attach** for a Run window: ensure directory exists; open or create `.latest` (do not rewrite history).
2. **Explicit run start** (preferred): when frontend sends the configured Run command, also notify backend (see Transport) with `{ project_root, window_name, command }` so tee can:
   - if current latest has content past header → rename into `archive/{utc}_{window}.log`
   - write new header block
3. **Output chunks**: append stripped text.
4. **CMD_END / stop / hard stop** (optional footer): append `--- run end ---` with timestamp when known; hard stop may mark `signal: hard-stop`. Missing exit codes are OK (`exit: unknown`).
5. **Session destroy**: flush + close handle; leave files on disk.

If explicit run-start notification is delayed, still tee output into the current latest (best effort). Rotation without notification can fall back to size-only rotate.

#### Header format (plain text)

```text
--- run start ---
time: 2026-03-20T15:30:12Z
command: bun run dev
tab: run-main
cwd: /Users/you/proj
---

```

Footer:

```text

--- run end ---
time: 2026-03-20T15:42:01Z
exit: unknown
---
```

#### Strip

Reuse or mirror frontend strip ideas from `terminal-ai-context-protocol.ts` (ANSI CSI/OSC + C0 controls except `\n` / `\t`). Prefer a shared Rust helper under `core-engine` or `core-service` tested with sample Next/Vite colored output.

#### Limits (defaults)

| Knob | Default |
|------|---------|
| Max latest file size | 8 MiB |
| On exceed | rotate to archive, open new latest with continuation header |
| Max archives per window | 8 |
| Max total under `.atmos/run-logs/` | 64 MiB |
| Flush interval | ≤ 200 ms when dirty |
| Prune timing | on rotate, on run start, opportunistic on attach |

When total budget exceeded: delete oldest archive files first across tabs.

### crates/core-service terminal runtime integration

Hook in the existing PTY read path so tee sees the same bytes as the UI stream:

- `spawn_pty_reader` / control-mode output loop in `crates/core-service/src/service/terminal/runtime.rs`
- Session metadata must carry:
  - `tmux_window_name` (already used for Run)
  - `project_root` or resolvable workspace/project path for log root

If session metadata today lacks project root, extend create-session params used by Run `Terminal` so the backend can resolve the write path without guessing.

**Invariant**: multiple clients attached to the same pane → tee still single-writer (session-side, not per-client).

### crates/core-engine · project `.atmos` layout

Canonical module: `crates/core-engine/src/project_atmos.rs`.

```rust
core_engine::ensure_project_atmos_dir(project_root)
// → creates <project>/.atmos
// → merges managed rules into <project>/.atmos/.gitignore
```

Managed ignore set (`PROJECT_ATMOS_IGNORED_ENTRIES`):

```text
# Managed by Atmos — local-only project artifacts under .atmos/
attachments/
tmp/
run-logs/
```

**Not ignored** (may be committed): `scripts/`, `wiki/`.

Policy:

- Full set is written/merged whenever `.atmos` is created or any feature calls the helper.
- Merge is additive: missing rules are appended; user lines preserved; never wipe.
- Feature code (Run logs, attachments, script save) only calls `ensure_project_atmos_dir` — no per-feature gitignore strings.
- Do **not** edit the user's root `.gitignore`.

### apps/api

Prefer **no new public API** if:

- Tee is fully driven by terminal session lifecycle + optional run-start command already on the terminal channel.
- Slash resolution uses client `fsApi` (`list` / `stat` under `.atmos/run-logs/`).

Optional WS actions (only if needed):

```text
run_log_start   { project_root, window_name, command? }
run_log_list    { project_root } → { latest: [{ window, path, size, mtime }] }
```

Do **not** add REST for this feature.

### apps/web — Run surface

`apps/web/src/features/browser/components/RunScript.tsx`:

- On successful `handleRunScript` (after `sendText`), call run-log start notifier so rotation header includes the actual command.
- Pass `tmuxWindowName` (already) and ensure project path is on the session create payload.
- No requirement to open log UI.

Optional later (N1): small toolbar control "Open latest log" — out of Phase 1.

### apps/web — AI context kind `run-log`

Extend `apps/web/src/shared/lib/ai-context-protocol.ts`:

```ts
// AI_CONTEXT_KINDS adds:
"run-log"

// KIND_DEFAULTS:
"run-log": {
  label: "Run log",          // sentence case; i18n overrides in chip renderer if needed
  tooltip: "Atmos Run log",
  tone: "emerald" | "orange", // pick existing tone; prefer terminal-adjacent
  icon: "terminal",
}
```

Chip token remains `[#ctx:run-log:{id}]` via existing `registerAiContextPrompt`.

**Stored `promptText` for the chip** (English template; load via i18n when building):

```text
This is an Atmos Run log (output from the project's Run terminal).

Log path: {absoluteOrProjectRelativePath}

Read this file with your file tools to diagnose issues. The log may be large — do not read the entire file at once. Start from the end (tail / last lines), or search for errors then read only the relevant sections.
```

If the file is missing:

```text
Atmos Run log is not available yet at:
{expectedPath}

No log file was found. Ask the user to start the project from the Run tab, then try again.
```

Rules:

- Do **not** embed log file contents in `promptText`.
- Path should be absolute when known (agent FS tools often need it); also fine to include project-relative form in the same block if useful.
- Chip label: **Run log** (or localized equivalent), not `VIEW RUN LOGS`.

### apps/web — Slash command

Add command id e.g. `view-run-logs` in both:

- Welcome slash list (`WelcomePage` / shared slash builders)
- Terminal AI Input slash list (`TerminalAgentInputOverlay`)

```ts
{
  id: "view-run-logs",
  label: "View Run Logs",       // menu label; sentence case
  description: "Attach latest Atmos Run log path for the agent",
}
```

On select:

1. Resolve project root (same as editor/project store).
2. Resolve latest log path:
   - Prefer `{root}/.atmos/run-logs/run-main.latest.log` if exists and size > 0 (or exists at all).
   - Else list `*.latest.log`, pick max mtime.
3. Build short instruction string (M8 / missing variants).
4. `registerAiContextPrompt("run-log", instruction)`.
5. Insert token into composer (existing chip insertion path).
6. **Do not** call open-file / center-stage tab APIs.

Filter: match queries like `run`, `log`, `view run`, `run log`.

### apps/web — i18n

Keys under something like `run.logs.*` and/or `terminal.agentInput.slash.viewRunLogs*`:

- slash label / description
- chip label / tooltip (if not only defaults)
- prompt templates (with `{path}` placeholder)
- missing-log template

Update **all** locales under `apps/web/messages/` (en + zh minimum per repo practice). Chinese must be real translation, not English paste.

## Data model (filesystem)

```text
<project-root>/
  .atmos/
    run-logs/
      run-main.latest.log
      run-{tabId}.latest.log
      archive/
        20260320T153012Z_run-main.log
        ...
```

No DB tables. No cloud objects.

Optional later `index.json` (N4) — not required for M1–M11.

## Transport

### Terminal session metadata (extend existing create/attach)

Ensure create payload includes enough for tee:

```ts
{
  // existing fields...
  tmuxWindowName: "run-main",
  // new or reuse:
  runLog?: {
    enabled: true,
    projectRoot: string,
  }
}
```

Only Run terminals set `runLog.enabled`.

### Optional WS: `run_log_start`

```ts
// request
{ action: "run_log_start", payload: {
  project_root: string,
  window_name: string,  // "run-main"
  command?: string,
}}
// response
{ ok: true, latest_path: string }
```

Justification: rotation must happen at Run click even if the next process line is delayed; keeps header command accurate. If the terminal service can detect Run inject another way, this can collapse into an internal call.

### Client FS for slash resolve

Reuse existing `fsApi` list/stat/read. No new REST.

## Security & permissions

- Logs may contain secrets from process output → local disk only, ignored by git, never uploaded by this feature.
- Tee only for windows Atmos itself named `run-*` for the Run feature — not arbitrary user-renamed center terminals unless they share that naming (they should not).
- Path confinement: `project_root` must be an Atmos-known project/workspace root; reject path traversal when joining `.atmos/run-logs`.
- Do not log full Run log contents into Atmos debug logs.

## Rollout plan

1. **Filesystem + strip + rotate helpers** (Rust unit tests) with temp dirs.
2. **Wire tee** into terminal runtime for sessions with `runLog.enabled`; dogfood with RunScript metadata.
3. **Run start notification** + header/footer lifecycle from `RunScript`.
4. **Git exclude** pattern for `.atmos/run-logs/`.
5. **AI context kind `run-log`** + prompt builder unit tests (Bun).
6. **Slash command** Welcome + terminal agent input; chip insert only.
7. **i18n** en/zh (and any other web locales).
8. **TEST.md scenarios** implemented via `atmos-specs-test-run`.

## Risks & tradeoffs

- **Tradeoff · full continuous tee vs command-block only**: Continuous tee during the latest file is simpler and catches post-start errors; rotation on Run click limits inter-run pollution. Accept some shell noise between commands inside one latest file.
- **Tradeoff · AI context kind vs custom protocol**: Reuse `[#ctx:…]` so PromptComposer / materialize path works without CHIP_TOKEN_PATTERN changes beyond kind registration.
- **Risk · missing project root on session**: If root is null, skip tee (and slash shows missing-log guidance) rather than writing under cwd guessing.
- **Risk · dual attach double tee**: Mitigated by session-scoped single writer.
- **Rollback**: Feature is additive; disable tee behind a code flag or stop setting `runLog.enabled` if critical issues appear.

## Dependencies & compatibility

- Depends on existing Run terminals (`RunScript`, window names).
- Complements APP-023 (ports) without coupling.
- Reuses APP-031-era AI context chip machinery.
- tmux + local Atmos Server required (same as Run today).

## Open questions

- [ ] Whether `run_log_start` is a distinct WS action or an internal method invoked from the same path that injects the Run command — implement whichever keeps fewer protocol surfaces.
- [ ] Exact icon/tone for `run-log` chip in the design system (use existing terminal defaults if unsure).
- [ ] Workspace-only context without project id: write under workspace root if that is what Run uses as cwd/project path today.
