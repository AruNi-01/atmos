# Atmos Desktop 1.1.0-rc.7

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
