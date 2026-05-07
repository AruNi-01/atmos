# Atmos Desktop 1.1.0-rc.4

## Changes Since 1.1.0-rc.3

### New Features
- **Local Model Download Progress**: Added topbar download progress indicator for local model runtime downloads
- **TerminalGrid Enhancements**: Updated TerminalGrid component with more features and improved user experience for working tree changes
- **Project-Level Review Sessions**: Implemented project-level review sessions (APP-013) with improved code review workflow

### Bug Fixes
- **Double Popover Fix**: Prevented double popover from appearing when a directory has a single file in the changes tree
- **Code Review Fixes**: Addressed additional code review findings for project-level sessions

### Other Changes
- Updated dependencies
- Ignored atmos-cli binaries in desktop sidecar to prevent conflicts
- Fixed CI issue where prerelease was stealing the latest tag

---

## What's Changed

### Layout Improvements

- **Right Sidebar Tabs Refactor**: Replaced the nested Changes/PR + Run/Preview tabs with a single top-level icon-only tabs bar (Changes, Review, Run/Preview, PR, Actions).
- **Project Files Side Setting**: Added a new Layout section in Settings to choose whether the project file tree appears in the Left or Right Sidebar.
- **Shared File Tree Panel**: When files are set to Right Sidebar, the file tree displays in the right panel with the same toolbar (show/hide hidden files, refresh).
- **Consistent Top Bar Heights**: Aligned the top bar height (h-10) across left sidebar, center stage, and right sidebar for a cleaner visual line.
- **Add Project Button**: Always-visible Add Project button in the left sidebar bottom bar.
