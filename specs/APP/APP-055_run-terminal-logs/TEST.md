# TEST · APP-055: Run Terminal Logs

> Test Plan · how we verify Run terminal logs and the View Run Logs chip flow. References PRD APP-055 and TECH APP-055.

## Test strategy

- **Rust unit**: ANSI strip, path naming, rotation, prune, header/footer formatting, path confinement.
- **Rust integration / service**: tee receives PTY-like chunks for `run-*` windows only; non-run windows produce no files; size rotate; run-start rotates latest → archive.
- **Bun unit**: `run-log` AI context kind registration, prompt template builder (path + tip, no full body), slash match helper, latest-path resolution (prefer `run-main`, else newest mtime).
- **Bun component (optional)**: slash select inserts `[#ctx:run-log:…]` chip; does not call open-tab APIs.
- **E2E / Playwright**: not required for v1 core correctness if service + unit cover tee and chip materialize; optional smoke later.
- **agent-browser**: exploratory check that slash inserts a chip and no log tab opens.
- **Manual**: real `dev` server verbose output + agent read path.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 local files | S1, S2 |
| M2 stable latest path | S1, S8 |
| M3 start markers & rotation | S3 |
| M4 volume limits | S4 |
| M5 plain-text strip | S5 |
| M6 git hygiene | S6 |
| M7 slash chip only | S7, S10 |
| M8 prompt expansion | S8, S9 |
| M9 missing log | S9 |
| M10 web/desktop Run scope | S2 (non-run no tee) |
| M11 localization | S11 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust unit/integration | `cargo test` | `TBD by test-run` (run_log_tee) | temp project dir | `.atmos/run-logs/run-main.latest.log` created with body | planned |
| S2 | Rust unit | `cargo test` | window filter | window `main` vs `run-main` | only `run-*` writes | planned |
| S3 | Rust unit | `cargo test` | rotate on run_start | two starts | archive count + new header | planned |
| S4 | Rust unit | `cargo test` | size/prune limits | oversized append | size ≤ cap; archive count capped | planned |
| S5 | Rust unit | `cargo test` | strip ANSI | colored bytes | no ESC sequences in file | planned |
| S6 | Rust unit / git | `cargo test` | exclude sync | repo fixture | `git check-ignore` or exclude block contains `.atmos/run-logs/` | planned |
| S7 | Bun | `bun test` | slash + composer | mock project path | chip token present; no open-file call | planned |
| S8 | Bun | `bun test` | materialize prompt | registered run-log payload | expanded text has path + tail tip; no multi-KB dump | planned |
| S9 | Bun | `bun test` | missing file | empty run-logs dir | missing-log instruction | planned |
| S10 | agent-browser / manual | agent-browser | local web app | project with Run | chip visible; no new center log tab | planned |
| S11 | Bun / manual | `bun test` or locale grep | messages en+zh | keys present | zh not English copy for descriptions | planned |

## Scenarios

### S1 — Happy path: Run output lands in latest log

- **Level**: Rust integration / unit with fake writer
- **Given**: a temp project root and a session marked `runLog.enabled` with window `run-main`
- **When**: tee receives plain text chunks `"hello\n"` then `"world\n"`
- **Then**: file `<root>/.atmos/run-logs/run-main.latest.log` exists and contains both lines (after any header)
- **Signals**: path exists; content includes `hello` and `world`

### S2 — Non-Run windows do not tee

- **Level**: Rust unit
- **Given**: same project root
- **When**: chunks arrive for window name `shell` or `agent-1` (not `run-*`)
- **Then**: no new files under `.atmos/run-logs/`
- **Signals**: directory empty or unchanged

### S3 — Run start rotates previous latest

- **Level**: Rust unit
- **Given**: latest file already contains a previous run body
- **When**: `run_log_start` (or equivalent) is invoked with a new command
- **Then**: previous content appears under `archive/` with a timestamped name; new latest starts with `--- run start ---` and includes the command when provided
- **Signals**: archive file count +1; latest size small and starts with header

### S4 — Size and archive prune

- **Level**: Rust unit
- **Given**: max latest size set low in test (e.g. 1 KiB) and max archives = 2
- **When**: tee appends beyond the limit repeatedly across many rotations
- **Then**: no single latest exceeds the cap (except transient write before rotate); archive count for that window ≤ 2; total dir size respects test budget
- **Signals**: file sizes and archive listing

### S5 — ANSI stripped

- **Level**: Rust unit
- **Given**: input bytes containing CSI color sequences and a bell character
- **When**: strip + tee
- **Then**: output file has human text without raw ESC sequences
- **Signals**: file does not contain `\x1b[`

### S6 — Git ignore hygiene

- **Level**: Rust unit or service-level around excludes
- **Given**: a git repo fixture where Atmos exclude sync runs
- **When**: exclude sync includes run-logs pattern
- **Then**: `.atmos/run-logs/` is ignored (check-ignore or managed exclude block content)
- **Signals**: pattern present; status does not list a sample log as untracked noise

### S7 — Slash inserts chip only

- **Level**: Bun unit / component
- **Given**: project root with an existing `run-main.latest.log`
- **When**: user selects slash command `view-run-logs` / View Run Logs
- **Then**: composer text contains a `[#ctx:run-log:…]` token (or equivalent chip token); open-center-file / add-tab APIs are not invoked
- **Signals**: token match; mock open-tab call count 0

### S8 — Materialized prompt is short and path-based

- **Level**: Bun unit
- **Given**: a registered `run-log` payload for path `/tmp/proj/.atmos/run-logs/run-main.latest.log`
- **When**: `materializeAiContextText` runs on the chip token + user text `"why failed?"`
- **Then**: result states Atmos Run log, includes the path, includes guidance to tail/search not full-read, and does not include multi-line dump of the log file body
- **Signals**: string contains path; contains tail/search guidance; length of context block stays small (e.g. < 1–2 KB)

### S9 — Missing log guidance

- **Level**: Bun unit
- **Given**: project root with no `.atmos/run-logs/*.latest.log`
- **When**: View Run Logs is selected
- **Then**: chip still usable or explicit missing instruction is registered; expanded text tells agent log is unavailable and user should Run first
- **Signals**: missing template phrases present

### S10 — Exploratory: no log tab flash

- **Level**: agent-browser / manual
- **Given**: web app with a project open
- **When**: open Welcome or terminal AI input, choose View Run Logs
- **Then**: chip appears in the composer; center stage does not switch to a log file tab
- **Signals**: visual chip; tab bar unchanged

### S11 — Locales

- **Level**: Bun / manual
- **Given**: en and zh message files
- **When**: inspecting keys for slash label, description, prompt templates
- **Then**: zh strings are localized (not English pasted into descriptive copy); English uses sentence case (`View Run Logs`, `Run log`)
- **Signals**: key presence; zh ≠ en for description strings

## Performance & load budgets

- Tee flush does not block PTY read loop beyond buffer handoff (append on async/worker or non-blocking buffered write).
- Writing a 4 KiB chunk should not add multi-digit millisecond stalls to the session hot path in unit benchmarks (best-effort; no hard CI SLA in v1 if flaky).
- Total default disk budget after prune: ≤ 64 MiB under `.atmos/run-logs/` (TECH default).

## Regression checklist

- [ ] Center-stage terminals that are not Run windows do not create run-logs.
- [ ] Collapsing the right sidebar while a Run process is active still appends to latest.
- [ ] Reattach / remount Run terminal does not duplicate entire scrollback into the log.
- [ ] Hard stop still leaves a readable latest file on disk.
- [ ] AI context materialize for other kinds (`code-selection`, `terminal-selection`, …) still works after adding `run-log`.
- [ ] Pasting raw text containing "View Run Logs" does not insert a chip.

## Exploratory agent-browser checks

Load Agent Browser skill or `agent-browser skills get core --full` before running.

1. Open a project, focus Welcome composer, type `/`, select **View Run Logs** — chip appears; no log tab.
2. With a prior Run that printed an error, attach chip + short question; confirm submit payload/materialized prompt is short and path-based (via debug or agent side if available).
3. Narrow viewport: slash popover and chip remain usable.
4. Watch console for FS/WS errors when run-logs dir is missing (should create on first tee, not crash slash).

## Acceptance criteria

- [ ] All Must Have PRD items M1–M11 have at least one planned scenario with a path to automation or explicit manual proof.
- [ ] S1–S5, S7–S9 automated at unit/service level before merge.
- [ ] S6 verified (exclude pattern or check-ignore).
- [ ] No new unconditional REST endpoints.
- [ ] Chip path never embeds full log body in the expanded prompt.
- [ ] Slash does not open a center log tab.
- [ ] `just lint` / scoped `cargo test` + `bun test` pass for touched packages, or gaps recorded in Coverage Status.
- [ ] Coverage Status filled by `atmos-specs-test-run` after implementation.

## Manual verification steps

1. Open a real project, set Run script to something that prints errors (or `echo fail; exit 1`).
2. Click Run; confirm `.atmos/run-logs/run-main.latest.log` appears under the project root with stripped output.
3. Click Run again; confirm previous file rotated into `archive/`.
4. In Welcome or terminal AI Input, `/` → View Run Logs → confirm chip only.
5. Send to an agent with "what failed?"; confirm agent is instructed to read the path and does not receive the full log inline.
6. `git status` does not list the new log as a noisy untracked file (after exclude sync).

## Non-coverage

- Perfect capture of full-screen TUI redraws.
- Mobile.
- Multi-user concurrent writers on a shared network FS.
- Cloud sync of logs.
- N1 editor open control and N2 multi-tab picker UI.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser results when used, and remaining gaps.
