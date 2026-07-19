> **Beta release.** Beta 2 supersedes Beta 1. It carries all Beta 1 content plus the fixes below. Please report any issues before the stable release.

## Changes Since Beta 1

- Fixed Canvas document action handling and bridge payload types so the Desktop web export completes its TypeScript check and release builds.

---

## New Features

- Added local Canvas documents with automatic drafts, document management, autosave, and document scripts for interactive Canvas tools. ([#162](https://github.com/AruNi-01/atmos/pull/162))
- Added Canvas widgets for GitHub pull requests and Actions, plus improved agent diagrams, follow controls, and screenshot previews. ([#160](https://github.com/AruNi-01/atmos/pull/160), [#161](https://github.com/AruNi-01/atmos/pull/161))
- Added center-stage browser tabs and concurrent isolated browser windows for Desktop.
- Added workspace note summaries and clearer separation between Canvas agent chats.

## Bug Fixes

- Fixed Canvas document writes, renames, deletes, autosave, keyboard input scopes, and replacement documents so content remains isolated and reliable.
- Fixed Chinese labels for recent Canvas controls, including copying hovered styles, framing selections, and page-menu controls.
- Fixed stale workspace note updates, terminal mouse tracking after reattachment, long browser-tab labels, and transformed file-tree context menus.

## Improvements

- Improved Canvas viewport focus, pinned terminal targeting, GitHub widget details, and document-script capability handling.
- Improved the sidebar workspace list with pagination controls and clearer browser-tab separators.

## Other Changes

- Refined end-to-end report retention and GitHub Pages reporting behavior.
