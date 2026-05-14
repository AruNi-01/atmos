# Atmos Desktop 1.1.0-rc.9

## Changes Since 1.1.0-rc.8

### New Features
- **Project Logo Upload**: Added project logo upload and display functionality with drag-and-drop support ([#113](https://github.com/AruNi-01/atmos/pull/113))
- **Canvas Terminal Pins**: Implemented terminal pinning to canvas shapes with source deep links and scroll isolation
- **Gitignore Dirs Configuration**: Added workspace-level gitignore directories configuration for better project management ([#111](https://github.com/AruNi-01/atmos/pull/111))

### Improvements
- **Canvas Theme System**: Converted tldraw theme from CSS to TypeScript for dynamic theme support with semantic CSS variables ([#112](https://github.com/AruNi-01/atmos/pull/112))
- **Canvas Performance**: Added terminal rendering limit with LRU eviction for performance optimization
- **Terminal Title Detection**: Added pipeCommand support for terminal title detection with echo commands
- **Left Sidebar Resize**: Improved left sidebar resize smoothness and added two-column toggle

### Bug Fixes
- **Desktop Cleanup**: Removed tray and menu icons, renamed API sidecar for cleaner desktop experience
- **Workspace Setup**: Cached workspace setup plan to prevent client hangs ([13b0b332](https://github.com/AruNi-01/atmos/commit/13b0b332))
- **Settings Cache**: Force true server refresh in loadSettings by invalidating cache to prevent drift
- **Settings Stability**: Fixed settings drift and malformed record crashes
- **Layout Settings**: Resolved race conditions and state inconsistencies in layout settings
- **Migration Safety**: Prevented unsafe migration rollback and made workspace compensation best-effort
- **macOS Traffic Lights**: Added padding for macOS traffic lights in non-fullscreen mode
- **Pin Button**: Improved pin button visual feedback in TerminalGrid
- **Skills Auto-Load**: Auto-load file content when backend returns null

### Other Changes
- Bumped desktop version to 1.1.0-rc.9

---

## Changes Since 1.1.0-rc.7

### New Features
- **Canvas**: Implemented Terminal Canvas feature with tldraw integration, allowing visual organization and pinning of terminals to canvas shapes ([#107](https://github.com/AruNi-01/atmos/pull/107))
- **Canvas Auto-Save**: Added configurable auto-save with manual save support for canvas documents
- **Experiments Settings**: Added experiments settings for terminals, agents, and wiki tab with gated feature flags ([#110](https://github.com/AruNi-01/atmos/pull/110))
- **CodeMirror Git Integration**: Wired CodeMirror Git integration to git_file_diff for improved editor experience ([#105](https://github.com/AruNi-01/atmos/pull/105))
- **GitHub CLI Status**: Added GitHub CLI status checking endpoint ([#951d4636](https://github.com/AruNi-01/atmos/commit/951d4636))

### Improvements
- **Canvas Rename**: Renamed Terminal Canvas to Canvas across the stack for broader applicability ([#109](https://github.com/AruNi-01/atmos/pull/109))
- **Canvas UI**: Restored full default tldraw UI in canvas overlay with immersive experience
- **Canvas Multi-Page**: Enabled tldraw multi-page support for better organization
- **Canvas Theme**: Added dark theme support for tldraw via CSS
- **Git Diff Panel**: Improved git diff panel with multi-hunk support, word-level highlighting, and selection gutter
- **Desktop Updates**: Implemented version-type-isolated update detection for desktop app

### Bug Fixes
- **Canvas Modal**: Fixed modal width, z-index, and overflow issues for better content visibility
- **Canvas Events**: Prevented event propagation from terminal to tldraw for proper interaction handling
- **Canvas Auto-Save**: Fixed tldraw reload on every auto-save by not updating document state during auto-save
- **Canvas Animation**: Synced Canvas overlay animation when canvas query clears externally
- **Wiki URL Race**: Fixed wiki URL race condition before experiment preferences load ([#110](https://github.com/AruNi-01/atmos/pull/110))
- **Terminal Focus**: Auto-focus adjacent terminal after cmd+w close
- **Welcome Page**: Prevented new workspace overlay from opening on welcome page
- **Git Gutter**: Improved git gutter interaction and styling
- **CodeMirror Stability**: Improved CodeMirror editor stability and settings UX
- **Path Prefix**: Fixed strict path prefix for editor git diff and breadcrumbs

### Other Changes
- Bumped desktop version to 1.1.0-rc.8
- Reorganized AGENTS.md and added cross-cutting references
- Updated release workflows and build scripts
- Added Tldraw license key configuration

---

## Changes Since 1.1.0-rc.6

### New Features
- **Slash Commands**: Added `/` command in new workspace composer for quick access to Skills, Projects, and Code Agents ([#104](https://github.com/AruNi-01/atmos/pull/104), closes [#102](https://github.com/AruNi-01/atmos/issues/102))
- **CLI Auto-Update**: Added CLI auto-update capability and shell config injection for easier installation
- **CommandCode Integration**: Added CommandCode provider implementation for AI usage quota (disabled at entry) ([#103](https://github.com/AruNi-01/atmos/pull/103), closes [#101](https://github.com/AruNi-01/atmos/issues/101))

### Bug Fixes
- **Terminal Focus**: Restored terminal focus after closing overlays and after switching/creating tabs
- **Keyboard Shortcuts**: Enabled Global/Workspace shortcuts to work inside terminal
- **Slash/Mention Trigger**: Fixed trigger offset to use caret-scoped serialized text
- **CLI Review Comments**: Added file_path to review comment anchor for better reference
- **Icon Updates**: Changed Add Project button icon from Plus to FolderPlus; updated puzzle.svg icon with correct shape

### Other Changes
- Added BlocksIcon and TmuxIcon components to UI library
- Bumped desktop version to 1.1.0-rc.7

---

## Changes Since 1.1.0-rc.5

### Bug Fixes
- **Keyboard Shortcuts**: Prevented system Cmd+W from closing the Tauri window and Cmd+Shift+F from triggering find
- **PR Files Tab**: Improved resize handle hover area for easier panel resizing
- **PR File Comments**: Contained inline-size on comment threads to prevent diff column overflow
- **Diff Navigation**: Improved target scrolling with shadow DOM support and polling for more reliable navigation
- **Review Tab Icon**: Replaced ScanSearch with FileDiff icon for the Review tab
- **Agent Review**: Added report output path to the agent review prompt

### Other Changes
- Extracted DiffFilePathLabel component, enabled file access for projects, and included review skill path in prompts
- Bumped CLI version to 0.1.1
- Removed publish-npm job and fixed publish-release condition in local runtime workflow

---

## Changes Since 1.1.0-rc.4

### New Features
- **Settings Shortcuts Section**: Added a dedicated Shortcuts section in Settings with keyboard icon and categorized keybindings
- **Terminal Context Menu**: Added right-click context menu to terminal with Previous Panel, Next Panel, and additional shortcuts
- **PR Files Changed Tab**: Added Files Changed tab with file tree, virtualized diff rendering, and inline review comments
- **PR Collapsible Comments**: Comment threads now collapse/expand with icon swap on hover and no height limit
- **PR Resizable Panels**: Added drag-to-resize split between file tree and diff area in Files Changed tab
- **PR Description Tabs**: Added Description, Discussion, and Commits tabs to PR detail view
- **Landing Page Updates**: Added Devin to agent list, tabbed installation methods, and R2 download support
- **Review Session Metadata**: Agent review reports now embed session metadata
- **Disk Cache Utility**: Added generic disk cache at ~/.atmos/cache/ for improved performance

### Performance
- **Skills Disk Cache**: Skills directory now uses disk caching with SWR pattern and proactive invalidation
- **Skills Lazy Loading**: Added ScanMode::Lazy to skip non-main file content reads for skills
- **Diff Rendering**: Offloaded diff rendering to Web Worker and added render chunk yielding for smoother UI
- **Web Request Reduction**: Reduced redundant requests on page refresh

### Bug Fixes
- **Terminal Polish**: Removed border-radius artifacts, fixed toolbar corner issues, and stabilized title restoration
- **PR Comment Fixes**: Fixed comment annotation overflow, word wrap, alignment, and scroll behavior
- **PR Diff Fixes**: Fixed initial diff layout measurement, horizontal scroll, and theme issues
- **PR List Fixes**: Fixed PR branch name copy button, comment counts, and state cleanup on navigation
- **Skills Badge Fixes**: Fixed Atmos Built-in skill badge rendering with proper opacity and contrast
- **File Tree Fixes**: Repaired show-hidden toggle and related tree bugs

### Other Changes
- Refactored release skills to unified naming (atmos-desktop-release, atmos-local-web-release)
- Standardized local runtime tag prefixes to use -v<version> suffix
- Simplified desktop installer to macOS only with Cloudflare R2 custom domain support
- Various CI improvements for Cloudflare R2 sync and release workflows

---

## What's Changed

### Layout Improvements

- **Right Sidebar Tabs Refactor**: Replaced the nested Changes/PR + Run/Preview tabs with a single top-level icon-only tabs bar (Changes, Review, Run/Preview, PR, Actions).
- **Project Files Side Setting**: Added a new Layout section in Settings to choose whether the project file tree appears in the Left or Right Sidebar.
- **Shared File Tree Panel**: When files are set to Right Sidebar, the file tree displays in the right panel with the same toolbar (show/hide hidden files, refresh).
- **Consistent Top Bar Heights**: Aligned the top bar height (h-10) across left sidebar, center stage, and right sidebar for a cleaner visual line.
- **Add Project Button**: Always-visible Add Project button in the left sidebar bottom bar.
