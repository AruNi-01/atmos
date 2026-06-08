# PRD - APP-023: Local Run Server Manager

> Product Requirements - WHAT and WHY. Define a Project/Workspace-scoped local service surface for Atmos.

## Context

- **Problem**: Run Preview currently depends on Run terminal text matching for `localhost` URLs. That misses services launched from another terminal, an editor, a monorepo subdirectory, or a process manager.
- **Why now**: Atmos already knows Projects and Workspaces, and Preview is a natural place to open local dev servers. The missing piece is reliable attribution from local listener to Atmos Project/Workspace.
- **Related specs**: Builds on Preview work in `APP-010_preview-element-select`, `APP-011_preview-cross-origin-extend`, and local runtime boundaries in `APP-016_atmos-computer`.

## Goals

1. Let users find and open local dev services that belong to an Atmos Project or Workspace, even when those services were not started from the Run tab.
2. Keep the product surface scoped to Atmos-owned work: unrelated app, system, editor, proxy, and browser-helper listeners should not become managed Local Services.
3. Provide a footer-level status entry and Preview-home list so users can discover services without copying URLs.
4. Make destructive actions safe enough for daily use by limiting them to strongly attributed same-user workspace services.

## Users & Scenarios

- **Primary persona**: developers using Atmos to manage local Projects, Workspaces, and Preview.
- **Monorepo developer**: starts `pnpm dev` from `apps/web`; Atmos should show that service under the parent Project/Workspace, not as a separate subdirectory group.
- **External-terminal user**: starts a local server in iTerm, VS Code, Cursor, or a shell outside Atmos; Preview should still list it if its process metadata points to an Atmos Project/Workspace.
- **Multi-project user**: has several Atmos Projects open; the footer should summarize all detected Project/Workspace services and group them by owner.
- **Safety-conscious user**: sees other local ports on the machine but does not want Atmos to manage unrelated application services.

## User Stories

- As a developer, I want Preview to list the current Project/Workspace local services, so I can open the right localhost app without reading terminal output.
- As a monorepo developer, I want services launched from nested directories to belong to the parent Atmos Project/Workspace, so `apps/web` and similar packages do not fragment the UI.
- As a multi-project user, I want the footer to show Local Services next to connection status, so I can see whether any Atmos Project/Workspace has a running server.
- As a user who customizes the footer, I want Local Services to be controlled by Footer Settings, so I can hide it when I want a quieter chrome.
- As a user stopping a dev server, I want Atmos to show what process it will stop and refuse unsafe targets, so I do not accidentally kill system or Atmos runtime processes.

## Functional Requirements

### Must Have

- **M1: Project/Workspace-attributed discovery** - Atmos can scan local TCP listeners and return services only when they can be attributed to an Atmos Project or Workspace. A process whose cwd, parent cwd, command path, or equivalent process evidence is at or under a known Project/Workspace root counts as owned by that root.
- **M2: Monorepo descendant ownership** - Services launched from Project/Workspace child directories, including paths such as `apps/web`, `apps/api`, `packages/*`, or nested package folders, belong to the parent Atmos Project/Workspace. The UI must not group by those subdirectories.
- **M3: Filtering and classification** - Unattributed listeners are hidden from the normal product surface. Protected Atmos internal processes, workspace dependencies, and container/proxy listeners are not treated as primary previewable dev servers.
- **M4: Footer Local Services entry** - The app footer shows a Local Services item on the left side, immediately to the right of WebSocket connection status when both are visible. It is controlled by Footer Settings, defaults to visible, and can be hidden without affecting scanning APIs or Preview.
- **M5: Footer grouping** - The footer Local Services popover summarizes services for Atmos Projects/Workspaces and groups rows by Project/Workspace owner. Monorepo subdirectories may appear as detail text or tooltips, not group headings.
- **M6: Preview home service list** - The Preview empty state uses simpler copy and shows the current Project/Workspace Local Services list. The list includes a refresh button so users can manually re-scan and see local changes.
- **M7: Explicit open only** - Opening a service in Atmos Preview is a user action from the Local Services UI. Run terminal output must no longer auto-detect URLs and auto-navigate Preview.
- **M8: Safe stop action** - Stop/kill is available only for strongly attributed, same-user Project/Workspace services after explicit confirmation. Protected Atmos runtime services, root/system services, and unattributed listeners cannot be stopped from this UI.
- **M9: Cross-platform product behavior** - The feature targets macOS, Linux, and Windows developer machines with platform-specific fidelity. When process metadata is unavailable, Atmos should degrade to a clear unavailable or low-confidence state instead of inventing ownership.

### Nice to Have

- **N1: Local attribution corrections** - Let users locally ignore a workspace service or associate a detected port with a Project/Workspace when automatic attribution is wrong.
- **N2: Diagnostics view** - Offer an explicitly labeled diagnostics mode for unattributed listeners when users are debugging port conflicts.
- **N3: Container-aware enrichment** - Improve attribution for Docker, Colima, Kubernetes port-forwarding, and reverse proxies when host process cwd is not the repository.
- **N4: Service thumbnails** - Capture lightweight thumbnails or titles for browser-openable services to make the Preview list easier to scan.

## Out of Scope

- **General local port manager** - Atmos is not a replacement for Activity Monitor, `lsof`, or system service managers. Non-Atmos listeners are not managed in the default UI.
- **Always-on global scanning** - Continuous full-machine process inventory is out of scope for v1 because it is privacy-sensitive and can be expensive.
- **Remote Computer inventory through Relay** - v1 focuses on local loopback Atmos Server usage. Exposing process inventory for a remote Atmos Computer needs a separate security review.
- **Automatic Preview navigation** - Newly detected services should not steal focus or navigate Preview without a user click.
- **Directory-level UI grouping** - Monorepo package paths are attribution details, not first-class grouping units.

## Success Metrics

- **Discovery latency**: A visible Local Services refresh completes within 3 seconds on a typical developer machine with fewer than 100 listening TCP sockets.
- **False-positive quality**: Internal dogfood reports no unrelated app/system listeners in the default managed list across macOS, Linux, and Windows samples.
- **Preview usefulness**: Users can open a current Project/Workspace local service from Preview home without typing or copying a URL.
- **Footer control**: The Local Services footer setting persists across reloads and defaults to visible for new users.
- **Safety**: Stop actions never target protected Atmos runtime processes or unattributed listeners in manual and automated tests.

## Risks & Open Questions

- **Risk: incomplete metadata** - Windows and sandboxed processes may not expose cwd, which can reduce attribution confidence.
- **Risk: container/proxy indirection** - Docker and port-forwarding tools can own the host port while the real app runs elsewhere.
- **Risk: command-line privacy** - Process command lines can contain secrets; UI must avoid exposing raw arguments by default.
- **Open: diagnostics scope** - Decide whether N2 is part of the first implementation or a follow-up after the main Project/Workspace list lands.
- **Open: user correction UX** - Decide whether ignore/associate controls live in the footer popover, Preview home, or a later settings surface.

## Milestones

- **Phase 1** - M1-M7: attributed scan, footer entry, Preview home list, manual refresh, explicit open, and removal of Run terminal auto-detection.
- **Phase 2** - M8-M9: safe stop action, stronger platform coverage, and guarded degraded states.
- **Phase 3** - N1-N4: local corrections, diagnostics, container enrichment, and service thumbnails.
