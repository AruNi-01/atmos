# Brainstorm - APP-023: Local Run Server Manager

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

The current Run Preview flow only auto-detects preview URLs from the active Run terminal output. In `RunScript.tsx`, detection strips ANSI codes and matches `http://localhost`, `http://127.0.0.1`, or `http://0.0.0.0` with a port. That misses services launched in another terminal, another app, another workspace, or with output formats that do not print those hostnames.

The product idea is a Project/Workspace-scoped local run server manager: inspect locally listening services across the machine, but only surface and manage services that can be attributed to an Atmos Project or Workspace. Unrelated app, system, editor, browser, proxy, or dependency listeners are background noise for filtering, not product-managed services.

Initial research suggests this is feasible, but not as a pure frontend feature and not with equal fidelity on every OS:

- macOS: `lsof -nP -iTCP -sTCP:LISTEN -FpcnT` can map listening TCP sockets to PID, process name, address, port, and TCP state. `lsof -a -p <pid> -d cwd -Fn` can resolve cwd for accessible processes. `ps` can fill user, parent PID, command, and arguments.
- Linux: `/proc/net/tcp*` plus `/proc/<pid>/fd` socket inode matching can map sockets to PIDs, then `/proc/<pid>/cwd`, `/proc/<pid>/cmdline`, and `/proc/<pid>/exe` can fill process metadata.
- Windows: `Get-NetTCPConnection` exposes local port/state and owning process. Command line and executable can come from process APIs/WMI, but current working directory is not generally reliable after launch.
- HTTP-ness is separate from port listening. A scan can find ports, but should probe lightly before showing "open in browser" as the main action.

One real macOS developer-machine scan found 22 listening records. Only `node` on `:3030` under an Atmos project was a clear project preview target. Atmos API on `:30303` was a real development process but should be classified as protected/internal. The rest were background, proxy, editor, app helper, or dependency listeners.

That scan is a calibration sample, not a product rule. The product needs a workspace-attribution classifier that works across different developers, OSes, package managers, editors, company tools, and app ecosystems. The sample exposed two reusable false-positive traps:

- Port number is weak. `:5000`, `:7000`, `:8440`, and `:8989` can be app/system listeners even when they return HTTP.
- String matching must be token-aware. `redis-server` contains `serve`, but Redis is not a browser preview server.

## Goals (draft)

- Discover locally listening servers for Atmos Projects/Workspaces even when they were not launched from the Run tab.
- Show enough context to choose the right workspace target: port, URL candidate, PID, process name, command, owner workspace, and confidence.
- Let users open a discovered server in the Atmos Preview/browser without copying a URL.
- Let users stop a selected workspace-owned local server with explicit confirmation and guardrails.
- Do not manage unrelated local listeners. They may be inspected internally to avoid false positives, but should not become normal rows or actions.
- Prefer local-only behavior by default; do not leak process inventory through remote relay paths unless explicitly designed.

## Detection strategy research

### What to detect first

Start from TCP `LISTEN` sockets, not terminal text. The OS-level scan may inspect all accessible listeners, but the product result should keep only listeners that can be attributed to an Atmos Project/Workspace:

- Keep only local listeners: loopback (`127.0.0.1`, `::1`, `localhost`) and wildcard binds (`0.0.0.0`, `*`, `[::]`) that can be reached from the local machine.
- Normalize wildcard binds to safe browser candidates such as `http://127.0.0.1:<port>` rather than trying to open `0.0.0.0`.
- Dedupe IPv4/IPv6 duplicates for the same PID and port.
- Keep UDP out of v1 unless a concrete previewable use case appears; browser preview is HTTP/TCP-centered.

Per OS discovery shape:

- macOS: `lsof -nP -iTCP -sTCP:LISTEN -FpcnT` for PID, command, socket name, and LISTEN state. Then `lsof -a -p <pid> -d cwd -Fn` or process metadata for cwd.
- Linux: parse `/proc/net/tcp` and `/proc/net/tcp6`, match socket inode to `/proc/<pid>/fd`, then read `/proc/<pid>/cwd`, `/proc/<pid>/cmdline`, `/proc/<pid>/exe`.
- Windows: `Get-NetTCPConnection -State Listen` gives local address, port, state, and owning PID. Process name, executable, and command line can be added, but cwd should be treated as mostly unavailable or low-confidence.

### How to decide "Atmos workspace server" vs unrelated local listener

Do not use a single allowlist, denylist, or port list. The primary classifier question is narrower than "is this a developer service?": **can this listener be attributed to an Atmos Project/Workspace with enough confidence to show and manage it?** If not, it should be ignored or shown only in diagnostics.

General classifier shape:

- **Inputs**: socket listener, process metadata, cwd/executable/args, parent process chain, known Atmos Project/Workspace roots, Atmos-managed terminal/process registry, lightweight HTTP probe, user overrides, and protected Atmos process IDs.
- **Output**: workspace-attributed candidate bucket, attribution confidence, URL candidates, reason chips, redacted process metadata, and allowed actions.
- **Policy**: an HTTP response, common dev port, or dev-looking process name is not enough without Atmos Project/Workspace evidence. The default product list should require `cwd`, command-line path, parent/session metadata, or Atmos-managed registry evidence that points to a known workspace.
- **Learning loop**: users should be able to correct attribution for local workspace paths, e.g. `associate this port with workspace`, `ignore this workspace port`, or `trust this project root`. These local preferences should adjust ranking without becoming global hardcoded product rules.

Positive signals:

- **Known project path match**: process cwd, parent cwd, executable path, or command args are the known Atmos Project/Workspace root **or any descendant path under it**. This should be the strongest non-Atmos-managed signal because monorepo services often launch from `apps/web`, `apps/api`, `packages/*`, or another nested package directory.
- **Deepest path ownership**: when multiple known roots or nested workspaces match, attribute to the deepest matching Atmos Project/Workspace path. A service launched from `<workspace>/apps/web` belongs to the parent workspace if `apps/web` is not itself a separate Atmos workspace. The subdirectory can be retained as attribution detail, but it should not create a separate UI group.
- **User repo root match**: a detected Git/package root under normal user source locations can add confidence, but package-manager roots such as `/opt/homebrew`, app containers, and system/application directories should not count as user projects.
- **Dev command match**: argv tokens or executable names match common launchers/frameworks such as `npm`, `pnpm`, `yarn`, `bun`, `node`, `vite`, `next`, `webpack`, `astro`, `nuxt`, `svelte-kit`, `storybook`, `python`, `uvicorn`, `flask`, `django`, `rails`, `puma`, `cargo`, `go run`, `gradle`, or `mvn`. Avoid substring-only matches.
- **HTTP probe match**: a light probe returns an HTTP response that looks browser-openable, especially HTML, JSON API docs, framework dev pages, hot-reload client markers, or known dev server titles. HTTP alone is not sufficient without workspace attribution.
- **Known dev port weak signal**: ports such as `3000`, `3001`, `5173`, `4173`, `8000`, `8080`, `5000`, `5174`, and similar only add weak confidence. They must not be enough by themselves.
- **Atmos-managed signal**: the process or terminal session is connected to an Atmos Run terminal, tmux pane, or future process registry. This can be stronger than cwd when process managers or wrappers obscure the real working directory.
- **Parent process signal**: parent chain includes a shell, terminal, tmux, Atmos, Code/Cursor/Zed, or another developer tool.

Negative signals:

- **No Atmos workspace evidence**: cwd, command line, parent chain, and registry metadata do not point to a known Atmos Project/Workspace. This should exclude the listener from normal management even if it is HTTP.
- **System/app path**: executable or cwd is under `/System`, `/Library`, `/Applications`, app bundles, app containers, `/opt/homebrew` service roots, or Windows `Program Files`, and no known project path match exists.
- **Background app shape**: the listener belongs to a GUI app bundle, OS service path, app helper process, browser helper, editor extension host, updater, proxy helper, or container/runtime helper, and has no project path match.
- **Non-browser protocol**: probe fails as HTTP or points to Redis/Postgres/MySQL/MongoDB/SSH/CUPS-style service ports. If it is workspace-attributed, it can be a workspace dependency row; otherwise ignore it.
- **Root/system owner**: process owner is root/system or cannot be inspected without elevated privileges.
- **Secret-risk command**: command line contains tokens or long env-like values; display should redact or hide details by default.

Candidate buckets:

- **Protected Atmos internal**: Atmos API/runtime/relay/tmux-related processes. These may be shown for debugging but should never be normal kill targets.
- **Workspace dev server**: strong Atmos workspace attribution plus HTTP probe, advertised URL, or dev command.
- **Likely workspace server**: workspace attribution exists but protocol/readiness is ambiguous; visible below clear preview targets.
- **Workspace dependency service**: Redis/Postgres/MySQL/MongoDB or similar service whose process can be attributed to a workspace. Useful for diagnostics, not Preview.
- **Workspace container/proxy service**: host listener is owned by a container/proxy process, but terminal/process metadata ties it to an Atmos workspace.
- **Unattributed local listener**: real listener with no Atmos workspace evidence. Not a managed item; optionally show only in a diagnostics/debug view for port-conflict troubleshooting.

Classifier guardrails:

- Do not ship a fixed denylist of app names as the main mechanism. App names vary by country, company, editor, and user setup.
- Use path shape, process ownership, parent chain, HTTP probe result, known project roots, and user overrides as primary evidence.
- Keep a small protected-process registry for Atmos-owned processes; this is not a general app denylist.
- Keep common database/proxy ports as protocol hints only. They help choose buckets but should not be the whole decision.
- Return low-confidence workspace candidates in a secondary/debug section instead of hiding them completely. Unattributed listeners can be omitted from the product list unless the user explicitly opens diagnostics.

### HTTP probing shape

The socket scan only proves that a process listens; it does not prove that Atmos can open it in Preview.

- Probe only candidates that pass a cheap workspace-attribution prefilter. Do not spend probe budget on unrelated app/system listeners by default.
- Prefer `HEAD /` first with a short timeout, then `GET /` only when needed to detect HTML/title/dev markers.
- Limit concurrency and use a total scan timeout so the popover feels instant.
- Never crawl paths deeply by default. Optional fingerprints like `/_next/`, `/@vite/client`, or `/webpack-dev-server` should be future work or used only after a positive root-page signal.
- Store probe status separately from process identity because HTTP readiness can change while PID and port remain stable.

### Refresh strategy

Default to on-demand plus short-lived cache:

- Run a scan when the user opens the Local Run Servers popover/page, lands on Preview home with no active URL, or views workspace-level port affordances.
- Cache results briefly, around 3-5 seconds, so repeated popover opens are cheap.
- While the popover/page is visible, refresh periodically or via manual refresh; pause when hidden. A slower visible-window poll, such as Orca's 30-second workspace port scanner, is an acceptable alternative if the status bar owns the surface.
- Do not run an always-on global background scanner by default. Process inventory is privacy-sensitive and can be expensive on macOS/Linux.
- Use event hints for Atmos-managed terminals: when the Run terminal receives output or a configured run command starts/stops, refresh the active workspace candidate list.
- Prefer incremental UI updates while visible, but do not push unsolicited process-inventory notifications when the Local Run Servers UI is closed.
- Before a kill action, revalidate that the same PID still owns the same port to avoid PID reuse mistakes.

### Filtering and UI policy

Default view should optimize for "what can I open for this Atmos workspace now":

- Show workspace-matched HTTP candidates first, with one-click open in Preview.
- Group services only by Atmos Project/Workspace. Do not create separate UI groups for monorepo subdirectories such as `apps/web`; those are still services of the parent workspace.
- Collapse "likely dev server" below exact project matches within the same workspace group.
- Show protected Atmos internal services only in a separate diagnostics row or hidden-by-default section.
- Show workspace dependency services as diagnostics, not preview cards.
- Hide unattributed app/system listeners by default.
- Provide optional diagnostics for "unattributed local listeners" only if debugging port conflicts is in scope.
- Show confidence labels and reason chips, e.g. `cwd under workspace`, `HTTP HTML`, `vite command`, `system app path`. Nested launch directories such as `apps/web` can appear in a details view or tooltip, not as a primary grouping label.
- Keep destructive actions unavailable for unattributed app/system services, even if a diagnostics view reveals them.

### Kill semantics

"Kill port" is risky and needs a product decision:

- Safer default: stop only workspace-attributed same-user processes, with Atmos-managed process trees as the highest-confidence subset.
- For workspace-attributed external processes: offer a confirm flow that names PID, command, cwd, workspace, port, and signal behavior.
- Never kill protected processes: Atmos API, relay/runtime supervisor, tmux server, OS services, root-owned processes, known app/system background listeners, or any listener that cannot be attributed to an Atmos workspace.
- Prefer graceful stop first where possible; force kill should be a separate explicit action.

### Container and proxy caveat

Docker, Colima, Kubernetes port-forward, and reverse-proxy processes may own the host port while the real project lives elsewhere. Their cwd may point to the container runtime, not the repo. Treat these as a separate "workspace container/proxy" bucket only when Atmos terminal/session metadata, command args, or user override can tie the port to a known workspace.

## Options

### Option A - Harden terminal-output detection only

Improve the existing Run tab detection and keep it scoped to Atmos-managed terminals.

Concrete shapes:

- Expand URL matching to `https`, `::1`, LAN IPs, `.localhost`, and framework-specific output like `Local:` / `Network:`.
- Track detected URLs per Run terminal tab and expose them as quick-open suggestions in the Preview toolbar.
- Combine terminal title/cwd metadata from `TerminalService` with detected URL history.

**Pros**: Lowest implementation risk; builds on existing `RunScript.tsx`, `Terminal`, and preview tab state.

**Cons**: Does not solve the user's main problem: workspace services started outside Atmos or without terminal output are still missed.

**Unknown**: Whether this is still worth doing as a fallback after a real port scanner exists.

### Option B - On-demand workspace port inventory

Add a local API-owned scanner that lists listening TCP ports, enriches each result with process and directory metadata when available, and returns only ports attributable to Atmos Projects/Workspaces.

Concrete shapes:

- User opens "Local Run Servers" or Preview home; Atmos performs a fresh scan.
- Scanner maps socket -> PID -> process metadata -> cwd/project/workspace match, treating cwd descendants of a workspace root as workspace-owned.
- UI groups candidates by Atmos Project/Workspace and exposes actions like open, refresh, copy URL, and stop. Nested monorepo paths are attribution details only.
- Unattributed listeners are discarded from the normal result set.

**Pros**: Directly solves workspace services launched outside the Run tab; works without terminal output; keeps the product surface focused and can keep expensive OS inspection on demand.

**Cons**: OS-specific implementation; cwd can be missing or misleading; command/process inventory is privacy-sensitive and needs careful display. Services launched from process managers may be missed until Atmos has stronger session metadata.

**Unknown**: Whether the first version should be desktop/macOS only or run in the API process for all local entry points.

### Option C - Visible workspace port monitor

Keep a lightweight watcher while relevant UI is visible that refreshes the workspace-attributed port inventory periodically and pushes changes to the web app.

Concrete shapes:

- Preview home and the workspace status bar show live workspace candidates.
- Run Preview auto-focuses the newest likely server for the active workspace.
- Stale workspace services disappear or move to an inactive bucket after failed probes.
- Opening the port popover triggers an immediate refresh; terminal advertised URL events can trigger a short settle refresh.

**Pros**: Feels live without managing unrelated local services; avoids users pressing refresh; matches Orca's visible-window polling plus popover refresh pattern.

**Cons**: More moving parts; polling can be noisy if it keeps running while no port UI is visible; process inventory still needs privacy-sensitive handling.

**Unknown**: Best refresh cadence and whether users need an explicit enablement setting.

### Option D - Atmos-managed registry plus workspace attribution scan

Keep OS-level discovery, but also actively register servers started from Atmos-managed terminals so workspace attribution does not rely only on cwd.

Concrete shapes:

- Shell shims or terminal hooks record commands, cwd, and process tree for Atmos-launched dev servers.
- Scanner reconciles registered servers with OS-level listening ports.
- Manager labels entries as Atmos-managed workspace, externally launched workspace, workspace dependency, workspace container/proxy, or unattributed/ignored.

**Pros**: Highest confidence for Atmos-launched servers while still catching external services; better kill semantics because Atmos knows the process tree it started.

**Cons**: More scope than a scanner alone; terminal hooks may not catch every package manager or nested process.

**Unknown**: Whether active registration should wait until after the basic scanner proves useful.

### Option E - Minimal active-workspace preview launcher

Instead of an app-wide workspace ports surface first, add a launcher that finds ports attributable to the active workspace only.

Concrete shapes:

- Preview home shows "servers for this workspace" only.
- Workspace match can use cwd, parent cwd, command path hints, and known Atmos project roots; nested monorepo directories under a workspace count as owned by that workspace.
- Ambiguous services stay hidden unless a diagnostics toggle is enabled.

**Pros**: Smallest product surface; reduces noise from system apps and unrelated local services; maps well to the current Run Preview panel.

**Cons**: Less useful for monorepos, Docker, process managers, or services launched from parent directories.

**Unknown**: Whether users need all Atmos workspaces in one popover or only the active workspace.

## Key forks in the road

- **Scope**: active workspace only vs all Atmos Projects/Workspaces in one ports surface - decide in PRD. Managing unrelated local services is out of scope.
- **Transport**: WS request/notification vs REST system diagnostics route - decide in TECH. Atmos defaults to WebSocket for interactive state, but existing terminal overview uses REST for system diagnostics.
- **Runtime owner**: API process scanner vs Tauri native command vs shared core crate - decide in TECH.
- **OS support**: macOS-first vs macOS/Linux/Windows in v1 - decide in PRD/TECH.
- **Directory confidence**: cwd equal to or descended from a workspace root should be strong evidence; command-line or parent/session path inference needs confidence labels - decide in PRD.
- **Kill behavior**: kill only Atmos-managed process trees vs allow externally launched but workspace-attributed same-user PIDs with confirmation - decide in PRD/TECH.
- **Remote relay**: expose inventory for an Atmos Computer remote host vs keep local desktop only - decide in PRD/security review.
- **HTTP probing**: include all workspace-attributed listeners as diagnostics vs only show browser-openable HTTP(S) services - decide in PRD.

## Open questions

- [ ] PRD: Is the primary surface Preview home, Run Preview toolbar, a workspace status popover, or a new workspace ports panel?
- [ ] PRD: Should the default surface show only the active workspace, or all Atmos Projects/Workspaces grouped by workspace?
- [ ] PRD: Does "kill port service" mean graceful stop, force kill, process tree kill, or just free the port?
- [ ] PRD: Should the default view show only browser-openable workspace candidates, or include workspace-attributed databases/proxies as diagnostics?
- [ ] PRD: Should protected Atmos internal services be visible by default, or only in diagnostics/show-all mode?
- [ ] PRD: Do we need an unattributed-listener diagnostics view at all, or should unrelated local listeners be completely omitted?
- [ ] PRD: What user controls are needed for correcting workspace attribution mistakes, e.g. associate port with workspace, ignore workspace port, or trust project root?
- [ ] PRD: What confidence threshold is required before auto-suggesting a newly discovered service for the active project?
- [ ] TECH: Can `core-engine` own OS-specific socket inventory, with `core-service` applying product filters and actions?
- [ ] TECH: Should macOS use `lsof` command parsing first, `libproc`/native APIs first, or a fallback chain?
- [ ] TECH: Should HTTP probing read only headers/status, or is a bounded root-page body read acceptable for dev server fingerprints?
- [ ] TECH: Which Atmos Project/Workspace roots are authoritative for attribution, how should deepest-match attribution work, and where should nested launch-path evidence such as `apps/web` appear in non-primary details?
- [ ] TECH: How should local user overrides be stored and scoped so a correction on one machine does not become a global product rule?
- [ ] TECH: How should Docker/Colima containers, reverse proxies, and port-forwarding processes be represented when cwd points to the runtime, not the Atmos workspace?
- [ ] TECH: How do we avoid killing the Atmos API process, relay-related processes, tmux server, or protected system daemons?
- [ ] TECH: How much command-line information is safe to return to the UI by default?

## References

- Existing code: `apps/web/src/features/run-preview/components/RunScript.tsx`
- Existing code: `apps/web/src/features/run-preview/components/RunPreviewPanel.tsx`
- Existing code: `apps/web/src/features/run-preview/components/Preview.tsx`
- Existing code: `apps/desktop/src-tauri/src/commands.rs` (`preview_bridge_probe_url`)
- Existing code: `apps/api/src/api/ws/terminal_handler.rs`
- Existing code: `crates/core-service/src/service/terminal.rs`
- Existing code: `crates/core-service/src/service/terminal_overview.rs`
- Existing code: `apps/api/src/api/system/handlers.rs` (`GET /api/system/terminal-overview`)
- Existing code: `crates/runtime-manager/src/supervisor.rs`
- Related specs: `specs/APP/APP-010_preview-element-select/`
- Related specs: `specs/APP/APP-011_preview-cross-origin-extend/`
- Related specs: `specs/APP/APP-016_atmos-computer/`
- External: lsof documentation - `https://lsof.readthedocs.io/en/latest/manpage`
- External: Linux procfs documentation - `https://www.kernel.org/doc/html/latest/filesystems/proc.html`
- External: Linux `/proc/net/tcp` documentation - `https://docs.kernel.org/networking/proc_net_tcp.html`
- External: Microsoft Get-NetTCPConnection - `https://learn.microsoft.com/powershell/module/nettcpip/get-nettcpconnection`
- External: Apple XNU/libproc source tree - `https://github.com/apple-oss-distributions/xnu`
- External: Rust `sysinfo::Process` metadata - `https://docs.rs/sysinfo/latest/sysinfo/struct.Process.html`
- External implementation reference: Orca workspace port scanner - `https://github.com/stablyai/orca/blob/main/src/main/ports/local-workspace-port-scanner.ts`
- External implementation reference: Orca workspace port ownership and kill guardrails - `https://github.com/stablyai/orca/blob/main/src/main/ports/workspace-port-ownership.ts`
- External implementation reference: Orca workspace port refresh component - `https://github.com/stablyai/orca/blob/main/src/renderer/src/components/ports/WorkspacePortScanner.tsx`

## Ready to promote

- Promote to PRD: A workspace-attributed Local Run Servers surface should show port, process, owner workspace, confidence, and open/stop actions; monorepo subdirectories should not create separate UI groups.
- Promote to PRD: First-class value is discovering Atmos workspace services launched outside Atmos-managed Run terminals.
- Promote to PRD: Destructive actions need explicit confirmation and clear process identity.
- Promote to PRD: Default filtering should show workspace-matched/browser-openable candidates first and omit unrelated app/system listeners from normal management.
- Promote to PRD: Protected Atmos internal services and workspace dependency services are separate from previewable dev servers.
- Promote to PRD: Users need local correction controls because workspace attribution can fail on process managers, containers, and unusual launch flows.
- Promote to TECH: Build an OS-specific local socket inventory capability plus Atmos workspace attribution rather than expanding terminal output regex as the primary mechanism.
- Promote to TECH: Treat cwd/project attribution as confidence-scored metadata, not a guaranteed fact.
- Promote to TECH: Treat cwd descendants of an Atmos Project/Workspace root as workspace-owned, with deepest matching root wins for nested workspace cases.
- Promote to TECH: Make command matching token-aware and avoid hardcoded app-name denylist as the primary classifier.
- Promote to TECH: Store classifier explanations and local user overrides alongside scan results.
- Promote to TECH: Use Orca-style `cwd` first, command-line path second attribution as a concrete baseline for the first implementation.
- Promote to TECH: Reuse existing preview navigation and desktop probe behavior for browser-openable candidates.
- Promote to TECH: Use on-demand scan with short-lived cache as the default refresh model; periodic polling should be scoped to visible workspace port UI.
