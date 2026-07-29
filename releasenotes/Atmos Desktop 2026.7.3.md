Atmos Desktop 2026.7.3 adds terminal side chats, richer preview inspection, cleaner agent hook context, Appshots workflow polish, and desktop runtime reliability updates.

## New Features

- Added tmux-backed terminal side chats. Use `/side` from terminal AI Input to start a separate agent conversation seeded with bounded terminal context, without sending the tangent into the source terminal.
- Added side chat persistence and restore handles so hidden side chats can be restored from their source terminal surface while the underlying tmux window still exists.
- Added an explicit side chat Agent selector when the parent terminal has not detected an Agent, reusing the welcome composer Agent selector and run configuration flow instead of silently falling back to the first Claude option.
- Added follow-cursor preview hover labels across the preview overlay/runtime so hovered elements can be identified with a lighter inspection flow.
- Added version-managed agent hooks that carry terminal context into hook notifications and status navigation, including side chat terminals.
- Added dedicated breakout error pages for app-level errors and not-found states.

## Bug Fixes

- Restored the macOS Appshots focus handoff after global shortcut captures so the main Atmos window is brought forward again when a capture completes.
- Fixed terminal AI Input interactions in canvas and side chat modal surfaces, including Cmd/Ctrl+G handling, hover-to-focus input behavior, `/` and `@` popover keyboard selection, and side chat modal resizing.
- Fixed terminal AI Input shortcut and focus handling so global app shortcuts, quick-open surfaces, and terminal grid focus do not steal common terminal input flows.
- Fixed Desktop browser web runtime launch configuration so the desktop shell refreshes and uses the expected runtime settings.
- Fixed Cursor built-in agent launches to use the intended interactive yolo mode.
- Fixed desktop runtime labeling so local runtime surfaces consistently refer to Atmos Server across Desktop, CLI, and web UI.
- Fixed skill agent icon mapping in skill cards and installed skill lists.
- Fixed workspace overview text constraints so longer overview sections stay within their layout.

## Improvements

- Smoothed the Appshots capture popover countdown with hover-to-pause behavior and animated badge expansion, while keeping the compact countdown state tight when it is not paused.
- Improved terminal side chat state handling with scoped record merges, scoped status updates, local modal state preservation, split terminal side chat workflow support, and backend cleanup for stale side chat registry records.
- Finished more terminal side chat action wiring through the WebSocket flow and refined the surrounding terminal UX and desktop launcher integration.
- Improved app interaction polish across workspace header controls, workspace/sidebar cards, usage badges, review/chat surfaces, and prompt composer Appshot paste coverage.
- Improved local Atmos Computer switching with clearer fallback behavior, better connection hydration, and updated copy around connected computer state.
- Improved preview transport support for hover labels across same-origin and extension-backed preview sessions.
- Stabilized desktop startup and release checks for the publishing path.
- Refreshed product docs and documentation layout for current app, CLI, feature, and workflow coverage.

## Other Changes

- Added specs and architecture notes for terminal side chats and architecture review work.
- Updated internal docs-writing/spec-visualization skills and refreshed landing changelog content.
- Removed an obsolete review CLI reference from the release line.
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-2026.7.2...desktop-2026.7.3
