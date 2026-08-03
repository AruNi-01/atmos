# TECH - APP-023: Local Run Server Manager

> Technical Design - HOW. Implements PRD APP-023: Local Run Server Manager.

## Scope summary

This design adds an on-demand, Project/Workspace-scoped Local Services inventory. It addresses PRD M1-M9. The scanner may inspect local listeners, but the API and UI return only Atmos-attributed services by default. There is no new REST endpoint in v1; the interactive inventory uses WebSocket actions. Remote relay inventory, always-on full-machine monitoring, and unattributed diagnostics are deferred.

## PRD coverage

| PRD item | Technical coverage |
|----------|--------------------|
| M1 | OS listener scanner plus `core-service` Project/Workspace attribution. |
| M2 | Descendant path matching and deepest-root ownership. |
| M3 | Classification and default API filtering. |
| M4 | Footer setting and `Footer.tsx` left-side integration. |
| M5 | Footer popover grouping by owner DTO. |
| M6 | Dynamic Preview home with current-context Local Services and refresh. |
| M7 | Explicit open callback and Run terminal auto-detection removal. |
| M8 | Stop revalidation, protected process registry, and same-user guardrails. |
| M9 | Platform collectors with unsupported/low-confidence degradation. |

## Architecture overview

```text
apps/web
  -> apps/api WebSocket router
  -> crates/core-service local_services attribution/filtering
  -> crates/core-engine local_services OS socket inventory + HTTP probing
```

Layer responsibilities:

- `crates/core-engine`: platform-specific TCP listener inventory, process metadata collection, lightweight HTTP probing, guarded process signaling.
- `crates/core-service`: Project/Workspace root resolution, ownership attribution, classification, redaction, action eligibility, stop revalidation.
- `apps/api`: WebSocket actions and DTO adaptation.
- `apps/web`: Local Services store, footer item/popover, Preview home list, explicit open behavior, footer setting.

No database migration is required. Runtime scan results are transient. The only persisted setting is the footer visibility key under existing function settings.

## Module-by-module design

### crates/core-engine

Add a local service capability:

- `crates/core-engine/src/local_services/mod.rs`
- `crates/core-engine/src/local_services/scanner.rs`
- `crates/core-engine/src/local_services/probe.rs`
- `crates/core-engine/src/local_services/process.rs`
- export from `crates/core-engine/src/lib.rs`

Core types:

```rust
pub struct LocalTcpListener {
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub local_addr: String,
    pub port: u16,
    pub cwd: Option<PathBuf>,
    pub exe: Option<PathBuf>,
    pub command_line: Vec<String>,
    pub parent_pids: Vec<u32>,
    pub user_id: Option<String>,
}

pub struct LocalHttpProbeResult {
    pub url: String,
    pub protocol: LocalServiceProtocol,
    pub status_code: Option<u16>,
    pub content_type: Option<String>,
    pub title: Option<String>,
    pub browser_openable: bool,
}

pub enum LocalServiceProtocol {
    Http,
    Https,
    Unknown,
    NonHttp,
}
```

Platform collectors:

- **macOS**: start with `lsof -nP -iTCP -sTCP:LISTEN -Fpcn`, then `lsof -a -p <pid> -d cwd -Fn` and `ps` for parent/command metadata.
- **Linux**: parse `/proc/net/tcp` and `/proc/net/tcp6`, match socket inode to `/proc/<pid>/fd`, then read `/proc/<pid>/cwd`, `/proc/<pid>/cmdline`, and `/proc/<pid>/exe`.
- **Windows**: use PowerShell/CIM or equivalent command-backed collection for `Get-NetTCPConnection -State Listen` and process command metadata. CWD is best-effort and may be absent.

Scanner rules:

- Only include TCP `LISTEN` sockets.
- Normalize wildcard binds (`0.0.0.0`, `::`, `*`) to safe local browser candidates such as `127.0.0.1:<port>`.
- Dedupe IPv4/IPv6 duplicates by `(pid, port)` when they represent the same listener.
- Keep command-line collection bounded; engine returns raw tokens to service, but service controls UI redaction.
- Apply scan timeouts and concurrency limits so one slow process lookup does not block the full result.

HTTP probing:

- Probe only service-filtered candidates requested by `core-service`, not every listener on the machine.
- Try `HEAD /` with a short timeout; fall back to a bounded `GET /` only when needed for title/content-type detection.
- Do not crawl framework-specific paths in v1.
- Store probe status separately from listener identity because HTTP readiness can change without PID/port changing.

Process signaling:

- Provide `terminate_process(pid)` (listener leaf, graceful), `terminate_process_tree(root_pid)`, and `kill_process_tree(root_pid)` helpers. Do not encode Project/Workspace safety in engine.
- Provide `process_snapshot` / `ancestor_chain` for stop-escalation UI (pid, ppid, pgid, command, cwd, tty, user).
- Unix tree stop prefers process-group TERM/KILL when the root is the group leader (`pgid == pid` and `pgid > 1`); otherwise signals the root PID only.
- Windows tree stop uses `taskkill /T` (and `/F` for force).
- Engine returns structured errors for missing process, permission denied, and platform unsupported.
- Engine never signals pid ≤ 1.

### crates/core-service

Add:

- `crates/core-service/src/service/local_services.rs`
- export from `crates/core-service/src/service/mod.rs`
- public domain types in `crates/core-service/src/types.rs` if reused outside the service module

Service entrypoints:

```rust
pub struct LocalServicesService { /* scanner + project/workspace services */ }

impl LocalServicesService {
    pub async fn scan(&self, request: LocalServicesScanRequest) -> Result<LocalServicesScanResponse>;
    pub async fn stop(&self, request: LocalServiceStopRequest) -> Result<LocalServiceStopResponse>;
}
```

Root resolution:

- Build authoritative roots from existing Atmos Projects and Workspaces.
- Project root comes from the Project `main_file_path`.
- Workspace root comes from the Workspace `local_path`.
- Canonicalize roots when possible, but preserve original display path for UI details.
- A listener belongs to a root if any usable evidence path is equal to that root or is a descendant of it.
- Evidence paths include process cwd, parent cwd if available, executable path when meaningful, command-line path tokens, and future Atmos-managed process registry metadata.
- If multiple roots match, choose the deepest matching Project/Workspace root.
- A service launched from `<root>/apps/web` belongs to `<root>` unless `apps/web` is itself a separate Atmos Workspace root.

Classification:

```rust
pub enum LocalServiceKind {
    WorkspaceDevServer,
    LikelyWorkspaceServer,
    WorkspaceDependency,
    WorkspaceContainerProxy,
    ProtectedAtmosInternal,
}

pub enum LocalServiceStatus {
    Online,
    Probing,
    NotHttp,
    Stale,
    Protected,
    Unsupported,
}
```

Default API filtering:

- Return `WorkspaceDevServer` and `LikelyWorkspaceServer` for normal UI.
- Return `WorkspaceDependency`, `WorkspaceContainerProxy`, and `ProtectedAtmosInternal` only when the request includes diagnostics or when the UI needs to explain why a service is not openable.
- Never return unattributed local listeners in the default response.
- Do not rely on port number alone, HTTP response alone, or process name alone.
- Avoid substring matching for command names; use token-aware matching.

Protected-process registry:

- Mark the running Atmos API process, runtime supervisor, relay-related processes, and tmux server as protected when detectable.
- Protected services may be surfaced only as diagnostics and must have `can_stop = false`.

Command-line redaction:

- Return `process_name`, `pid`, `cwd_display`, `launch_dir_display`, and a short redacted `command_preview`.
- Redact token-like argv values, env-style `KEY=value` pairs with secret-looking keys, long bearer strings, and file paths outside the attributed root unless needed for attribution reasons.

Stop guardrails:

- `stop` accepts a service id, pid, port, owner identifiers, optional `mode` (`listener` default | `tree`), and optional `root_pid` (required for tree mode).
- **Step 1 (`mode: listener`)**: revalidate exact service_id + pid + port + owner; graceful TERM on the listening leaf only; wait ~1.6s; rescan listeners. Success only when the port is no longer LISTEN (`ok: true` is never returned solely because `kill` exited 0).
- **Escalation**: if the port still listens for a same-owner stoppable workspace service after Step 1, return `ok: false, needs_escalation: true` with process tree, orphan hints, and `recommended_root_pid` (highest safe launcher / workspace-attributed ancestor such as `just` / package manager / `next dev`). Never recommend pid 1, tmux, Atmos Server, or other protected processes.
- **Step 2 (`mode: tree`)**: requires explicit user confirmation and `root_pid`. Revalidate by port + owner (pid/service_id may have changed after respawn). Refuse roots not in the revalidated listener's ancestor chain or not marked stop-candidate. Graceful tree TERM, wait, then force tree KILL if still listening; success only when the port is free.
- `not_http` status does **not** block `can_stop` when ownership confidence is high (orphaned `next-server` with timed-out HTTP probe remains stoppable).
- Refuse root/system-owned processes, protected Atmos internals, unattributed listeners, stale listeners, and low-confidence matches.
- Tree kill is never automatic; it is always a second, explicit UI action.

Cache:

- Keep an in-memory scan cache inside the service or API layer with a 3-5 second TTL.
- `force = true` bypasses the cache for manual refresh.
- Cache keys include scan scope (`all` vs `context`) and requested Project/Workspace ids.

### apps/api

Extend WebSocket protocol in `apps/api/src/api/ws/message.rs`:

```rust
#[serde(rename_all = "snake_case")]
pub enum WsAction {
    // ...
    LocalServicesScan,
    LocalServicesStop,
}
```

Add DTOs near other WS request/response structs or in a new module imported by `message.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServicesScanRequest {
    #[serde(default)]
    pub scope: LocalServicesScope,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub include_diagnostics: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalServicesScope {
    AllAtmosProjects,
    CurrentContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalServiceStopRequest {
    pub service_id: String,
    pub pid: u32,
    pub port: u16,
    pub project_id: Option<String>,
    pub workspace_id: Option<String>,
}
```

Response shape:

```rust
pub struct LocalServicesScanResponse {
    pub scanned_at: String,
    pub cache_ttl_ms: u64,
    pub services: Vec<LocalServiceDto>,
    pub unavailable: Option<LocalServicesUnavailableDto>,
}

pub struct LocalServiceDto {
    pub id: String,
    pub owner: LocalServiceOwnerDto,
    pub kind: String,
    pub status: String,
    pub confidence: f32,
    pub reasons: Vec<String>,
    pub url: Option<String>,
    pub display_url: String,
    pub port: u16,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub command_preview: Option<String>,
    pub cwd_display: Option<String>,
    pub launch_dir_display: Option<String>,
    pub title: Option<String>,
    pub can_open: bool,
    pub can_stop: bool,
    pub protected: bool,
    pub last_seen_at: String,
}

pub struct LocalServiceOwnerDto {
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub root_path: String,
}
```

Router:

- Add `apps/api/src/api/ws/router/local_services.rs`.
- Register it in `apps/api/src/api/ws/router/mod.rs`.
- Route `WsAction::LocalServicesScan` to `LocalServicesService::scan`.
- Route `WsAction::LocalServicesStop` to `LocalServicesService::stop`.
- Listener success: `{ ok: true, service_id, mode: "listener" }` then frontend force-refresh.
- Listener escalation: `{ ok: false, needs_escalation: true, reason, port, attempted_pid, current_listener_pid, orphan_hints, process_tree, recommended_root_pid, service_id }` (WS success envelope; not a transport error).
- Tree success: `{ ok: true, service_id, mode: "tree" }` after verified port free.

Transport choice:

- Use WebSocket because this is an interactive app-state surface and follows Atmos transport rules.
- Do not add REST for local services in v1.

### apps/web

Add a feature-owned Local Services area:

- `apps/web/src/api/ws/local-services-api.ts`
- `apps/web/src/features/local-services/types.ts`
- `apps/web/src/features/local-services/store/local-services-store.ts`
- `apps/web/src/features/local-services/components/LocalServicesFooterItem.tsx`
- `apps/web/src/features/local-services/components/LocalServicesPopover.tsx`
- `apps/web/src/features/local-services/components/LocalServiceList.tsx`
- `apps/web/src/features/local-services/components/LocalServiceRow.tsx`
- `apps/web/src/features/local-services/components/LocalServiceStopEscalationDialog.tsx`
- `apps/web/src/features/local-services/components/LocalServicesPreviewPanel.tsx`

Update action typing:

- Add `"local_services_scan"` and `"local_services_stop"` to `apps/web/src/features/connection/hooks/use-websocket.ts`.
- `localServicesApi.scan(request)` calls `wsRequest<LocalServicesScanResponse>("local_services_scan", request)`.
- `localServicesApi.stop(request)` calls `wsRequest<LocalServiceStopResponse>("local_services_stop", request)`.
- Step 1 stop uses `mode: "listener"` (default). On `needs_escalation`, open escalation dialog with process tree + recommended root; user confirms → `mode: "tree"` + `root_pid`.

Store behavior:

- `useLocalServicesStore` caches by scope:
  - footer: `scope = "all_atmos_projects"`.
  - Preview home: `scope = "current_context"` with `projectId` and/or `workspaceId`.
- Manual refresh passes `force: true`.
- Visible-window refresh may run every 30 seconds while the footer popover or Preview home list is mounted. It must pause when hidden.
- Do not perform an always-on full-machine scanner loop from the web client.

Footer integration:

- Update `apps/web/src/features/settings/store/layout-settings-store.ts`:
  - add `showLocalServices: boolean`.
  - read `layout.footer_show_local_services !== false`.
  - default state is `true`.
  - add `setFooterShowLocalServices`.
- Update `apps/web/src/features/settings/components/LayoutSettingsSection.tsx`:
  - add a "Local Services" switch in Footer layout.
  - include it in `footerEnabledCount`.
- Update `apps/web/src/app-shell/Footer.tsx`:
  - read `showLocalServices`.
  - left-side order is `WebSocket status -> Local Services -> AI usage carousel`.
  - Local Services appears immediately to the right of WebSocket status when both are enabled.
  - Popover groups rows by Project/Workspace owner.
  - The compact footer trigger shows a count such as `Local 3`; when no services are found it can show `Local 0` or a muted empty state, but should not hide if the setting is enabled.

Preview home integration:

- Replace the static `renderPreviewHome(...)` usage for the empty Preview state with a dynamic component that can load Local Services.
- Recommended path: `apps/web/src/features/run-preview/components/PreviewHome.tsx`.
- Thread `projectId` and `workspaceId` through `RunPreviewPanel -> Preview -> PreviewViewport -> PreviewHome` if those props are not already available at the viewport.
- Simplify copy to a short title and one sentence. Avoid the current multi-card explanation as the primary empty state.
- Add `LocalServicesPreviewPanel` below the copy:
  - current Project/Workspace services only.
  - top-right action is refresh, not filter.
  - rows use compact dark UI: browser thumbnail fallback, title or `localhost:<port>`, display URL, status dot, and actions.
  - opening a row calls an explicit preview navigation callback.

Explicit open behavior:

- Keep the browser-tab creation/navigation logic in `apps/web/src/features/run-preview/hooks/use-preview-browser-state.ts`, but rename it away from detection semantics, for example `handleOpenSuggestedUrl`.
- Use that callback for Local Services rows and any future explicit suggestions.
- Remove terminal-output callers.

Run terminal auto-detection removal:

- Update `apps/web/src/features/run-preview/components/RunScript.tsx`:
  - remove `onDetectedUrl` from `RunScriptProps`.
  - remove ANSI stripping done solely for URL matching.
  - remove `localhost` regex matching and URL-detected console logs.
  - keep the Ctrl+C/running-state handling in `handleTerminalData`.
- Update `apps/web/src/features/run-preview/components/RunPreviewPanel.tsx`:
  - stop passing `onDetectedUrl`.
  - stop destructuring `handleDetectedUrl` unless renamed for explicit service opens.
- No Run terminal output should navigate Preview automatically.

## Data model

Frontend type shape mirrors API DTOs:

```ts
export type LocalServicesScope = "all_atmos_projects" | "current_context";
export type LocalServiceKind =
  | "workspace_dev_server"
  | "likely_workspace_server"
  | "workspace_dependency"
  | "workspace_container_proxy"
  | "protected_atmos_internal";

export type LocalServiceStatus =
  | "online"
  | "probing"
  | "not_http"
  | "stale"
  | "protected"
  | "unsupported";

export interface LocalService {
  id: string;
  owner: {
    project_id?: string | null;
    project_name?: string | null;
    workspace_id?: string | null;
    workspace_name?: string | null;
    root_path: string;
  };
  kind: LocalServiceKind;
  status: LocalServiceStatus;
  confidence: number;
  reasons: string[];
  url?: string | null;
  display_url: string;
  port: number;
  pid?: number | null;
  process_name?: string | null;
  command_preview?: string | null;
  cwd_display?: string | null;
  launch_dir_display?: string | null;
  title?: string | null;
  can_open: boolean;
  can_stop: boolean;
  protected: boolean;
  last_seen_at: string;
}
```

Stable service ids:

- Use a deterministic id from owner key, pid if present, port, normalized connect host, and kind.
- Stop must not trust the id alone; it revalidates pid, port, and ownership.

## Refresh strategy

- Initial footer scan happens after WS connection when `showLocalServices` is true and the footer item mounts.
- Opening the footer popover triggers an immediate refresh if cache is stale.
- Preview home scans on mount for the current Project/Workspace.
- Manual refresh in Preview and footer bypasses cache.
- Optional visible polling is capped to roughly 30 seconds and only while a Local Services surface is visible.
- No terminal-output URL event triggers Preview navigation. Future process-start hints may refresh Local Services, but must not open pages automatically.

## Security & privacy

- Do not expose raw full-machine listener inventory to the normal UI.
- Do not log full command lines by default.
- Redact secret-looking command-line fragments before returning DTOs.
- Stop/kill requires same-user, same-pid, same-port, same-owner revalidation.
- Refuse stop for Atmos API/runtime, relay, tmux, root/system, protected, stale, low-confidence, and unattributed services.
- Do not expose remote relay process inventory in v1.

## Rollout plan

1. Add `core-engine` scanner/probe abstractions with platform stubs and macOS implementation first; include Linux/Windows collectors behind the same interface.
2. Add `core-service` attribution/filtering with unit tests for Project/Workspace roots, descendant paths, and deepest-match ownership.
3. Add WS actions and API router wiring with scan cache and DTO redaction.
4. Add frontend API/store/types and footer Local Services item behind the default-on footer setting.
5. Replace Preview home with simplified copy plus current-context Local Services list and refresh action.
6. Remove Run terminal URL auto-detection and wire explicit service-row open to the preview navigation callback.
7. Add guarded stop action and confirmation after scan/open behavior is stable.

## Risks & tradeoffs

- **Tradeoff: on-demand scan over always-on monitor** - chosen because process inventory is privacy-sensitive and users only need fresh results when a Local Services surface is visible.
- **Tradeoff: WS over REST** - chosen because this is interactive client state and Atmos is WebSocket-first.
- **Risk: platform metadata gaps** - Windows and sandboxed processes may miss cwd; these results should be hidden or low-confidence rather than guessed from port/process name.
- **Risk: stop safety** - PID reuse and process managers make stop risky. Revalidation is mandatory before every signal.
- **Risk: container attribution** - host listeners may belong to Docker/Colima rather than the project. Treat as a separate bucket unless Project/Workspace evidence exists.
- **Rollback path** - hide the footer setting and Preview Local Services panel while leaving scanner code unused; Run terminal auto-detection remains removed per PRD M7.

## Dependencies & compatibility

- Requires local OS process/socket access on the machine running Atmos Server.
- macOS depends on `lsof` availability for the first implementation.
- Linux depends on readable `/proc` metadata.
- Windows collector is best-effort and may report fewer attributed services.
- External reference: Orca workspace port scanner and ownership model:
  - `https://github.com/stablyai/orca/blob/main/src/main/ports/local-workspace-port-scanner.ts`
  - `https://github.com/stablyai/orca/blob/main/src/main/ports/workspace-port-ownership.ts`

## Open questions

- [ ] Should diagnostics for unattributed listeners ship in Phase 1 or wait until after default filtering is validated?
- [x] Stop escalation: listener TERM first; if still listening, explicit "Stop process tree" confirmation runs tree TERM then auto-escalates to tree KILL within that confirmed action (no third dialog).
- [ ] Where should local user overrides live if N1 ships: function settings, a dedicated local JSON file, or a future settings store?
