> **Beta release.** Beta.8 supersedes beta.7. It carries all beta.7 content plus the fixes below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.7

- **Canvas viewport stability** — Fixed a reproducible issue where clicking around the canvas (including empty areas) could blank the viewport while tldraw chrome stayed visible. Session loading no longer reloads the full document on connection switches, persisted cameras are sanitized, and invalid zoom is recovered automatically.

---

> **Beta release.** Beta.7 supersedes beta.6. It carries all beta.6 content plus the improvements below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.6

- **Faster first screen after splash** — While the splash screen is visible, the hidden main window now prefetches connection bootstrap, WebSocket, and project/workspace data so the home screen is ready sooner after launch.
- **Clear loading states on first launch** — The welcome surface and sidebar show skeleton loading instead of an empty “add a project” state while data is still fetching, matching the web app’s loading experience.
- **Docs site refresh** — Rebuilt documentation IA with App/CLI tabs, feature guides, and CLI reference pages ([#119](https://github.com/AruNi-01/atmos/pull/119)).

---

> **Beta release.** Beta.6 supersedes beta.5. It carries all beta.5 content plus the improvements below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.5

- **Canvas Agent Activity Tracking** — Improved agent activity tracking with refined overlay components for better visual feedback during agent operations.
- **Canvas Top Chrome Fix** — Fixed the canvas layout to offset the top chrome instead of pushing the entire canvas down on desktop, improving screen real estate usage.
- **CLI Version Bump** — Bundled CLI updated to `0.2.0-beta.5`.

---

> **Beta release.** Beta.5 supersedes beta.4. It carries all beta.4 content plus the improvements below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.4

- **Canvas Agent Layout Commands** — Agent can now issue layout commands, extract text from shapes, trigger focus pulse animations, show copy overlays, and read terminal context settings for richer canvas-agent interactions.
- **Canvas Agent Feed Store** — Added an in-memory feed store with batching, labels, and summarization for cleaner canvas-agent activity tracking.
- **Canvas Agent Crash Boundary** — Agent activity is now wrapped in a crash boundary, with a Dynamic Island–style activity overlay replacing the previous presence markers for a lighter, more resilient canvas surface.
- **Canvas Chrome Preferences** — Added a reactive `useCanvasChromePrefs` hook backed by localStorage for consistent canvas chrome preference handling.
- **Canvas-Agent Refactor** — Extracted error, mutate, shape-patch, and validate modules for better maintainability.
- **UI Components** — Added a Dotmatrix loader component for richer loading states.
- **Bundled Runtimes** — Bumped CLI to `0.2.0-beta.4` and local-web-runtime installer to `0.2.0-beta.4`.

---

> **Beta release.** Beta.4 supersedes beta.3. It carries all beta.3 content plus the improvements below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.3

- **Hosted Web Reliability** — Fixed hosted bootstrap on `app.atmos.land` and refined hosted onboarding loading and connection UX so first-run on Pages feels smoother and less fragile.
- **Floating Agent Chat** — Floating agent chat is now gated behind the management agents experiment for a safer staged rollout.
- **Canvas & Relay Preferences** — Canvas chrome visibility and canvas preferences are persisted, with relay-scoped storage so hosted and local sessions keep the right defaults.
- **Terminal Quality** — Bracketed paste and Shift+Enter behave correctly across terminals; split actions remember the last agent you used for quicker repeats.
- **UI Components** — Added a tabbed CodeBlock presentation with copy support for clearer reading of multi-snippet content.
- **Bundled Skills** — Bumped the bundled `atmos-canvas-agent` skill to 1.0.1.
- **Local Web Runtime Installer** — Bumped the `@atmos/local-web-runtime` installer metadata to `0.2.0-beta.3` so the hosted and local-web paths stay aligned.

---

> **Beta release.** Beta.3 supersedes beta.2. It carries all beta.2 content plus the improvements below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since 1.2.0-beta.2

- **Hosted Web Connection Mode** — The web app now supports a standalone hosted connection flow through Cloudflare Pages, allowing you to connect a local or remote Atmos Server without running the Tauri desktop. A redesigned onboarding experience with loading gates, TextShimmer hero, and improved layout smoothes the first-run flow across desktop and web entry points.
- **Improved Footer** — Footer now surfaces richer agent info with a refined layout, making agent status and session context more visible at a glance.
- **Canvas Activity Overlay** — Agent presence markers on the canvas have been replaced with a lighter activity-based overlay, keeping the collaboration surface cleaner.
- **Relay Connection Reliability** — The relay now uses WebSocket ping keepalive with structured reconnection logic for more stable remote computer connections. The WebSocket layer on the infra side has been simplified and the heartbeat module removed in favor of relay-side keepalive.
- **CI Fix** — Cloudflare Pages project is now created before the first web deploy to prevent deployment failures on fresh environments.

---

Atmos 1.2.0-beta.2 includes the complete 1.1.0 feature set — Kanban board with drag-and-drop, GitHub issue import, workspace creation wizard, overhauled Code Review with inline comments, managed local model runtime, expanded code agent support, and extensive UI polish — plus new Atmos Computer capabilities for remote connectivity and relay control. The workspace surface becomes a real workplace with comprehensive project management tools, and now you can also access your Atmos workspace remotely through the Atmos Computer relay system.

## Changes Since 1.2.0-beta.1

- **Canvas tldraw v5 Migration** — Canvas now uses tldraw v5 richText format for improved text handling and compatibility.
- **Git Worktree Excludes Fix** — Improved worktree-local excludes via `core.excludesFile` for better Git integration.
- **Workspace Name Generation Refactor** — Separated scope from handle in workspace name generation for cleaner architecture.

## New Features

- **Atmos Computer (APP-016)** — Remote access to your Atmos workspace through the relay control plane, with computer registration, access token management, and unified local runtime manifest. VPS setup commands are available in settings, and `computer start --daemon` enables background relay operation. ([#115](https://github.com/AruNi-01/atmos/pull/115))

- **Workspace Kanban Board** — A new Kanban board view with drag-and-drop, labels, priority, and per-status columns. Create workspaces directly from a Kanban column, pin workspaces with stable ordering, and group your sidebar by manual workflow status. ([#77](https://github.com/AruNi-01/atmos/pull/77))

- **GitHub Kanban Import** — Import GitHub issues straight into a project as issue-only workspaces, with search, sort, and a refined import dialog. Workspace labels now track their source so imported labels stay tied to GitHub. ([#97](https://github.com/AruNi-01/atmos/pull/97))

- **Workspace Creation Wizard** — A new wizard and overlay walks you through creating workspaces, with PR linking, GitHub issue selection, target branch handling, configurable branch prefix, and skippable setup steps when something fails.

- **Code Review Overhaul** — Review now has inline comments anchored to diff headers and gutters, threaded conversations that inherit across revisions, a sidebar Review view with a switcher, in-place revision snapshots, a session rename flow, a terminal-based fix runner, sorted revision history, and a tree view for sidebar diffs. Review artifacts now live in a global `~/.atmos/review` directory. ([#87](https://github.com/AruNi-01/atmos/pull/87))

- **Managed Local Model Runtime** — Run lightweight AI tasks on a managed local llama runtime, with custom Hugging Face GGUF imports, optimized manifest fetching, and a universal `context_window` truncation strategy that replaces the previous small-model prompt fork. ([#93](https://github.com/AruNi-01/atmos/pull/93))

- **More Code Agents** — Added first-class support for Cursor, Gemini CLI, Factory Droid, and Kiro agent hooks, plus Devin and Windsurf as terminal/quick-open code agents. Idle agent sessions now auto-clean up with a configurable timeout. ([#92](https://github.com/AruNi-01/atmos/pull/92))

- **Grouped Center Stage Tabs** — A grouped tab navigator for center stage tabs with sortable popover order, keyboard drag-and-drop, and keyboard shortcuts for tab and sidebar actions. ([#79](https://github.com/AruNi-01/atmos/pull/79), [#91](https://github.com/AruNi-01/atmos/pull/91))

- **Footer AI Usage Carousel** — A new AI Usage carousel in the footer with hover behavior, persisted state across sessions, and a redesigned global agent status bar with a ticker and per-session context. ([#81](https://github.com/AruNi-01/atmos/pull/81))

- **Welcome Page Redesign** — A refreshed welcome surface with `@` mention chips, image paste in the prompt composer, an article welcome page, unified Issue/PR linking tabs with Load/refresh animations, an advanced panel, and a `⌘⇧↵` shortcut. The PixelBlast background and CircleDot GitHub Issue icon are back.

- **Sidebar Polish** — Pin/unpin workspaces with a collapsible divider that persists across sessions, hover text morphing, kanban filters in the sidebar, and persisted sidebar grouping in function settings.

- **Terminal Pane System** — Pane focus tracking, scoped hotkeys, idle-shell close behavior, an agent icon in the toolbar (replacing the colored dot), command/cursor-agent alias support, and an immutable `label` field that separates display name from the tmux identifier. ([#80](https://github.com/AruNi-01/atmos/pull/80))

- **Persistent Terminal Tabs** — Run terminal tabs are now persisted via tmux, with the transport refactored to tmux control mode for a tighter, more reliable connection. ([#82](https://github.com/AruNi-01/atmos/pull/82), [#83](https://github.com/AruNi-01/atmos/pull/83))

- **Diff Viewer** — Conflict resolution is now inline in the unified editor, the Reviewed button moved to the diff header bar with a collapse animation, and a gutter utility button is available after a session is created.

- **Git & GitHub Tools** — Interactive soft reset and discard, an expanded Git history sidebar showing full commit data, project-level target branch and branch switching, and a clearer error toast when the upstream branch has diverged on publish. ([#75](https://github.com/AruNi-01/atmos/pull/75))

- **Atmos CLI Version Check** — Settings modal now surfaces the installed Atmos CLI version and offers an update check, backed by a new CLI version-check API endpoint and improved review CLI commands.

- **Settings Improvements** — Show all agent hook statuses with a collapsible section, idle session timeout configuration, archive behavior settings with a confirmation dialog, and configurable workspace deletion cleanup.

- **Skills Editor** — YAML frontmatter is now visible in the SKILL.md editor and rendered as a code block in preview mode. Skill markdown previews intercept relative path links so they resolve correctly.

- **Notifications** — Test actions for notification channels and a real default icon for browser notifications. ([#78](https://github.com/AruNi-01/atmos/pull/78))

- **Global Search** — Quick access to usage and settings actions from global search.

- **AI Usage Providers** — Added a Xiaomi MiMo provider with browser cookie auth, switched OpenCode Go subscription detection to local SQLite, and stabilized Factory auth detection. ([#89](https://github.com/AruNi-01/atmos/pull/89))

- **Management Center** — Added a Kanban entry, moved New Workspace into the management center, and added a New Workspace button to the Kanban toolbar.

- **Browser Access** — A Tunnel Connector button is now available in the web access popover.

## Bug Fixes

- **Workspace Setup Hang** — Fixed a setup script step that could hang forever when the PTY reader never received EOF. ([#73](https://github.com/AruNi-01/atmos/issues/73))

- **Workspace Setup Flow** — Distinguished PR vs Issue setup paths, removed an artificial `sleep`, fixed the PR label, dropped a misleading "Additional Notes" prompt, synced `requirement.md`, and stopped truncating long GitHub issue titles in the create dialog.

- **Welcome Page** — Many composer fixes: textarea cursor height, advanced panel position, attachment chip and thumbnail sync, attachment preview portal, attachment X button, zoom preview, mention popover positioning and dismissal, role=button on attachment thumbnails to avoid nested buttons, and queueing commands until the tmux session is input-ready.

- **Terminal** — Fixed Tauri desktop paste, Shift+Enter, clipboard image handling, scrollback resync on `CMD_END`, resync artifacts (removed `sendResize`, added a resize cooldown), prevented closing inactive terminal tabs via the hidden close button, stable `ATMOS_PANE_ID` for agent status after reconnect, and removed Ctrl+B d fallbacks in the PTY close handler.

- **Diff Viewer** — Recoverable errors are now discriminated correctly so transient failures no longer look fatal, and an early-return bug in `find_latest_cli_tag` is fixed.

- **Workspace UI** — Fixed kanban card cursor style, workspace navigation from Kanban cards, hover metadata popover stealing focus, label source handling on the API side, and review/metadata regressions.

- **Welcome Composer Hotkeys** — Hotkeys now fire correctly on `contentEditable` elements, mention popovers close immediately when typing past `@`, and mention candidate tooltips are pinned to the right-bottom of the popover.

- **AI Usage** — Refined usage display calculations, fixed OpenCode Go cloud usage and sub-quota fetching, switched to a napping bot icon for the idle footer agent state, and synced overview updates across the popover and footer.

- **Light Mode** — Improved light-mode color contrast and fixed prompt card corner rendering.

- **Skills** — Reset scroll position when switching files in the skill editor and the Center pane.

- **UI Polish** — Aligned skills/agents card surfaces, constrained the custom JSON editor, fixed footer carousel provider glyph size alignment, replaced the Devin icon, scoped browser navigation and quick-open hotkeys correctly, and prevented the welcome page from accidentally scrolling.

- **Workspace Archive** — Workspace archive now honors archive behavior settings.

- **Atmos Computer** — Fixed Desktop relay HTTP request handling, restored Duration imports after relay_http_request removal, unified access token storage on disk, and hardened computer/relay paths from security review findings. ([#115](https://github.com/AruNi-01/atmos/pull/115))

- **Desktop Build** — Fixed ApiEnvelope typing for desktop release build and typed persisted Atmos Computer store slice for desktop compatibility.

## Improvements

- **Footer Status Bar** — Redesigned the global agent status bar with a ticker and per-session context; isolated Term tab agent status per tab and fixed an infinite loop in agent status lookup.

- **Persistence** — Pinned workspace ordering, sidebar pin collapsed state, sidebar grouping, and the AI usage footer carousel all persist across sessions.

- **Toasts** — Removed non-essential success toasts (pin/unpin, common project actions) where the UI already provides feedback.

- **Refresh Iconography** — Unified refresh-button icons and loading direction across the app; `RotateCw` is used for static action icons and `LoaderCircle` is reserved for spinning states.

- **Tmux Session Identification** — Sessions are now identified by an `@atmos_managed` user option and per-connection session IDs, removing proactive eviction of same-window sessions and dropping the per-window grouped name from the close path.

- **Welcome Overlay** — Refined the welcome overlay, prompt notch, and tab content animations; tab body is preserved during the collapse animation.

- **Diff Sidebar** — Tree view for sidebar diffs, gutter utility button after session creation, and a clearer Reviewed button placement.

- **Performance & Stability** — Optimized local model manifest fetching and build pipeline, repackaged official llama runtime releases, and fixed a number of stale closures, destructive drains, and missing rename broadcasts uncovered in review.

- **Atmos Computer** — Isolated browser UI preferences by connection instance, proxied control-plane HTTP requests via local API for improved security, and merged sidebar grouping into filter popover for better UX. ([#115](https://github.com/AruNi-01/atmos/pull/115))

- **UI Theme** — Default UI theme now defaults to dark instead of system for consistent experience.

## Other Changes

- **Workspace Backend** — New `source` field on workspace labels, an `agent_run_guid` migration, and updated workspace handlers for label source support.

- **Specs Lifecycle** — Reorganized `specs/` into `APP/`, `Landing/`, and `Docs/` zones with a 4-file standard (BRAINSTORM/PRD/TECH/TEST) and added matching agent skills.

- **CLI Release Workflow** — Added a standalone Atmos CLI release workflow and improved release scripts.

- **Documentation** — Updated README, FAQ, repository description, and review system design docs for the new comment model.

- **CI/CD** — Added deploy-relay workflow for manual dispatch, required Node 22 for wrangler deploy operations, and bumped GitHub Actions to Node 24–compatible versions. ([#116](https://github.com/AruNi-01/atmos/pull/116), [#117](https://github.com/AruNi-01/atmos/pull/117), [#118](https://github.com/AruNi-01/atmos/pull/118))

---

_Beta release — ready for external testing._
