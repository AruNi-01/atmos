> **Beta release.** This build starts the 2026.7.6 desktop beta line and is intended for early validation before a stable desktop release.

Atmos Desktop 2026.7.6-beta.1 introduces key updates to the terminal AI experience, UI animations/layouts, internationalization, and settings/workspace management.

## New Features

- Added selection-based AI context chips in the terminal. When text is selected in the terminal, it can be instantly included in the AI context.
- Added a copy button to the terminal selection toolbar with auto-dismiss feedback.
- Added the `Cmd+Shift+G` hotkey shortcut to pin the AI input overlay in the terminal.
- Added scroll-driven `ScrollToc` component to improve table of contents navigation in the changelog.

## Bug Fixes

- Fixed terminal caret position and chip order when inserting selection AI context.
- Fixed prompt composer slash command handling.
- Fixed route-preserving refresh behavior and remote web launch configurations.

## Improvements

- Improved UI polish by moving the terminal AI send sweep animation directly into the input area.
- Improved toast alerts by placing status icons on the far right and animating them outward on dismissal.
- Improved Settings modal with dynamic internationalization support for sidebars and section headers.
- Improved workspace transition performance by optimizing the new workspace overlay transitions.
- Improved security policies by adding `blob:` resources to the Content Security Policy (CSP).

## Other Changes

- Removed obsolete workspace notes surfaces to clean up workspace views.
- Consolidated interactive agent command building to streamline backend execution.
- Configured local dev proxy settings to rewrite hooks.

- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-2026.7.3...desktop-2026.7.6-beta.1
