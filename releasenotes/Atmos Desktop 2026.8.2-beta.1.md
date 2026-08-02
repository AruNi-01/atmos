> **Beta release.** For dogfooding and regression testing. Please report issues before the next stable cut.

Atmos Desktop 2026.8.2-beta.1 deepens the GitHub workbench with Issues, Actions, and PR Checks surfaces, ships a durable local event queue for more resilient desktop runs, and polishes PR conflict handling, reviewer navigation, and shell reliability since 2026.7.31-beta.1.

## New Features

- GitHub Issues get a dedicated sidebar, center detail view, and list UX polish so you can triage and inspect issues without leaving the workbench. ([#193](https://github.com/AruNi-01/atmos/pull/193))
- GitHub Actions workflow graph and commit detail center tabs make run structure and commit context visible in-product. ([#191](https://github.com/AruNi-01/atmos/pull/191))
- Dedicated PR Checks tab with merge controls and Agent Fix, plus hover-to-open Actions from the checks sidebar.
- Editable PR assignees and labels directly in the PR sidebar.
- PR conflict files listed via local git merge-tree (with shallow-clone deepen and current base tip), so conflict review stays accurate.
- Jump from PR reviewers to the matching Files changed line comments for faster review follow-through.
- Local durable event queue (SQLite-backed LocalPersistentQueue / APP-051) so critical desktop event work survives restarts more reliably. ([#187](https://github.com/AruNi-01/atmos/pull/187))

## Bug Fixes

- Restored vertical scroll on the automations list page.
- Cleared stuck OSC terminal titles caused by shell preexec noise.
- Stopped expected WebSocket connect cancels from showing as Runtime Errors.
- Fixed PR conflict listing against the current base tip and merge-tree contents; deepened shallow clones when needed for conflict file listing.
- Made all PR reviewers clickable for Files jump and improved scroll reliability to line comments.
- Fixed fullwidth / parenthetical tab meta badges so inactive tabs keep discussion counts and similar labels readable.
- Loaded React Flow styles so Actions workflow graphs render correctly.
- Distinguished Actions pending vs in-progress badges and grouped PR Checks status rings by color.
- Synced right-sidebar changes state and polished PR/Action toolbars plus Terminal Rich Input settings.

## Improvements

- Electron desktop releases now sync to Homebrew and R2 latest selectors so install/upgrade paths stay current. ([#185](https://github.com/AruNi-01/atmos/pull/185))
- Convert-to-draft moved outside the Checks merge card for a clearer PR actions layout.
- Conflict resolver no longer shows Pierre’s default change icon noise.
- Sentence-case PR detail sidebar titles and tighter Checks fail-action presentation.

## Other Changes

- Release tag: `desktop-electron-2026.8.2-beta.1`
- Full comparison: https://github.com/AruNi-01/atmos/compare/desktop-electron-2026.7.31-beta.1...desktop-electron-2026.8.2-beta.1
