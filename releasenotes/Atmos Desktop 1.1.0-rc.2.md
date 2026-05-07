> **Release candidate.** RC2 supersedes RC1. It carries all RC1 content plus the fixes below so the Windows MSI installer can build successfully. Please report any issues you encounter so we can land them before the stable release.

## Changes Since RC1

- **Desktop Release Pipeline** — Fixed the RC1 release failure where the Windows MSI bundler rejected the SemVer pre-release version (`optional pre-release identifier must be numeric-only`). The desktop `bundle.windows.wix.version` is now auto-derived from the top-level version on every bump (e.g. `1.1.0-rc.2` → `1.1.0.2`), and `check-desktop-version.mjs` validates the override in CI.
- **Web Build** — Resolved TypeScript errors that were blocking the desktop build (carried over from the `fix(web): resolve TypeScript errors blocking desktop build` commit on RC1).

---

Atmos 1.1.0 turns the workspace surface into a real workplace: a new Kanban board with drag-and-drop, labels and priority, GitHub issue import, workspace creation wizard, and grouped/pinned sidebar workspaces. Code Review gets a full overhaul with inline comments living in diff headers and gutters, threads that inherit across revisions, and a dedicated sidebar view. A managed local model runtime ships for lightweight on-device tasks (with custom Hugging Face GGUF imports), more code agents are now first-class (Cursor, Gemini CLI, Factory Droid, Kiro, Devin, Windsurf), and the welcome page, terminal, footer, and tab system all received substantial polish.

## New Features

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

- **Web Access** — A Remote Access button is now available in the web access popover.

## Bug Fixes

- **Workspace Setup Hang** — Fixed a setup script step that could hang forever when the PTY reader never received EOF. ([#73](https://github.com/AruNi-01/atmos/issues/73))

- **Workspace Setup Flow** — Distinguished PR vs Issue setup paths, removed an artificial `sleep`, fixed the PR label, dropped a misleading "Additional Notes" prompt, synced `requirement.md`, and stopped truncating long GitHub issue titles in the create dialog.

- **Welcome Page** — Many composer fixes: textarea cursor height, advanced panel position, attachment chip and thumbnail sync, attachment preview portal, attachment X button, zoom preview, mention popover positioning and dismissal, role=button on attachment thumbnails to avoid nested buttons, and queueing commands until the tmux session is input-ready.

- **Terminal** — Fixed Tauri desktop paste, Shift+Enter, clipboard image handling, scrollback resync on `CMD_END`, resync artifacts (removed `sendResize`, added a resize cooldown), prevented closing inactive terminal tabs via the hidden close button, stable ATMOS_PANE_ID for agent status after reconnect, and removed Ctrl+B d fallbacks in the PTY close handler.

- **Diff Viewer** — Recoverable errors are now discriminated correctly so transient failures no longer look fatal, and an early-return bug in `find_latest_cli_tag` is fixed.

- **Workspace UI** — Fixed kanban card cursor style, workspace navigation from Kanban cards, hover metadata popover stealing focus, label source handling on the API side, and review/metadata regressions.

- **Welcome Composer Hotkeys** — Hotkeys now fire correctly on `contentEditable` elements, mention popovers close immediately when typing past `@`, and mention candidate tooltips are pinned to the right-bottom of the popover.

- **AI Usage** — Refined usage display calculations, fixed OpenCode Go cloud usage and sub-quota fetching, switched to a napping bot icon for the idle footer agent state, and synced overview updates across the popover and footer.

- **Light Mode** — Improved light-mode color contrast and fixed prompt card corner rendering.

- **Skills** — Reset scroll position when switching files in the skill editor and the Center pane.

- **UI Polish** — Aligned skills/agents card surfaces, constrained the custom JSON editor, fixed footer carousel provider glyph size alignment, replaced the Devin icon, scoped browser navigation and quick-open hotkeys correctly, and prevented the welcome page from accidentally scrolling.

- **Workspace Archive** — Workspace archive now honors archive behavior settings.

## Improvements

- **Footer Status Bar** — Redesigned the global agent status bar with a ticker and per-session context; isolated Term tab agent status per tab and fixed an infinite loop in agent status lookup.

- **Persistence** — Pinned workspace ordering, sidebar pin collapsed state, sidebar grouping, and the AI usage footer carousel all persist across sessions.

- **Toasts** — Removed non-essential success toasts (pin/unpin, common project actions) where the UI already provides feedback.

- **Refresh Iconography** — Unified refresh-button icons and loading direction across the app; `RotateCw` is used for static action icons and `LoaderCircle` is reserved for spinning states.

- **Tmux Session Identification** — Sessions are now identified by an `@atmos_managed` user option and per-connection session IDs, removing proactive eviction of same-window sessions and dropping the per-window grouped name from the close path.

- **Welcome Overlay** — Refined the welcome overlay, prompt notch, and tab content animations; tab body is preserved during the collapse animation.

- **Diff Sidebar** — Tree view for sidebar diffs, gutter utility button after session creation, and a clearer Reviewed button placement.

- **Performance & Stability** — Optimized local model manifest fetching and build pipeline, repackaged official llama runtime releases, and fixed a number of stale closures, destructive drains, and missing rename broadcasts uncovered in review.

## Other Changes

- **Workspace Backend** — New `source` field on workspace labels, an `agent_run_guid` migration, and updated workspace handlers for label source support.

- **Specs Lifecycle** — Reorganized `specs/` into `APP/`, `Landing/`, and `Docs/` zones with a 4-file standard (BRAINSTORM/PRD/TECH/TEST) and added matching agent skills.

- **CLI Release Workflow** — Added a standalone Atmos CLI release workflow and improved release scripts.

- **Documentation** — Updated README, FAQ, repository description, and review system design docs for the new comment model.
