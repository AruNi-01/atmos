Atmos Desktop now uses calendar-based release versions across the desktop app, CLI, and local runtime release paths. This release also carries the recent desktop workbench, preview, and standalone-window refinements from the current mainline.

## New Features

- Added calendar release naming for Atmos release pipelines, using tags such as `desktop-2026.7.2` without an extra `v` prefix.
- Added desktop preview developer tools and improved standalone browser tab preservation for preview workflows.
- Improved standalone agent chat handoff so chat windows preserve session state more reliably.

## Bug Fixes

- Fixed native preview overlay behavior when app overlays or loading states are active.
- Stabilized shared app helpers, preview browser behavior, and standalone preview windows.
- Fixed locale-free GitHub setup return URLs and right-sidebar file reveal behavior.

## Improvements

- Switched the workbench locale flow to runtime locale handling.
- Reduced canvas browser viewport lag and refined preview fullscreen interactions.
- Kept Windows MSI packaging compatible with calendar app versions by mapping `2026.7.2` to the MSI-safe `26.7.2` installer version.
