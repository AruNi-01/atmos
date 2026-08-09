Atmos Desktop 2026.8.10 ships the new Tasks surface for Atmos and GitHub work, nested right-drawer issue/PR review with stack peeks, Launchpad naming, center-tab MRU restore, deeper GitHub PR/Actions review, and a simpler branch/PR-oriented workspace model.

## New Features

- **Tasks surface** — `/tasks` unifies Atmos and GitHub issues/PRs with filters, sort, pagination, assignees, linked issue↔PR chips, and create-issue (templates + markdown write/preview).
- **Nested GitHub drawers** — open issues, PRs, commits, and Action runs in a right-drawer stack with left peeks, parallel exit restore, and working portaled menus (settings, selects, popovers).
- **Create Issue from Tasks** — repository templates, project/repo context, and TanStack Form-backed create flow with list refresh after publish.
- **Linked workspace actions** — Enter or Create workspace from issue/PR drawers when a matching workspace exists or should be started.
- **Launchpad** — Management Center is renamed Launchpad across the shell, settings, and navigation.
- **Center-tab MRU restore** — return to the previous center surface from a most-recently-used activation stack.
- **GitHub Actions job log tails** — read step-level job log tails from Action runs without leaving Atmos.
- **PR merged-state checks** — expanded merged-state detection so open vs merged stays accurate in list and detail chrome.

## Bug Fixes

- **Markdown agent tags** — sanitize rendered markdown HTML so unknown agent tags do not leak into the page.
- **Landing hero preview** — keep hero preview sides visible on wide screens and stretch the preview slightly taller at 16:9.
- **Token Usage charts** — tighten trend chart axes and page canvas so usage graphs read more cleanly.
- **Nested drawer menus** — keep drawer z-index aligned with DropdownMenu / Popover / Select so settings and other portaled controls work inside nested sheets.
- **Workspace PR detection** — discover branch PRs even when stored `githubPr` metadata is missing so sidebar and header status stay in sync.

## Improvements

- **Kanban cards & filters** — clearer workspace kanban cards with isolated sidebar filters.
- **GitHub timeline chrome** — denser, more consistent PR timeline presentation.
- **Workspace model** — issue-only workspaces and the GitHub issue import path are removed so create/enter flows stay branch- and PR-oriented.
- **GitHub search reliability** — multi-arg `gh` queries, dotted repo names via `--repo`, draft-field handling, and empty multi-repo REST fallback.

## Other Changes

- Release tag: `desktop-electron-2026.8.10`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.8.9...desktop-electron-2026.8.10

<!-- atmos-desktop-download -->
<details>
<summary><strong>Download</strong></summary>

### macOS

- [Apple Silicon](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.10/Atmos_2026.8.10_aarch64.dmg) (recommended)
- [Intel](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.10/Atmos_2026.8.10_x64.dmg)

### Windows

- [64-bit installer](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.10/Atmos_2026.8.10_x64-setup.exe)

### Linux

- [64-bit AppImage](https://github.com/AruNi-01/atmos/releases/download/desktop-electron-2026.8.10/Atmos_2026.8.10_x64.AppImage)

</details>
