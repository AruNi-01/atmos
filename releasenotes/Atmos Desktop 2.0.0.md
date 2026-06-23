Atmos Desktop 2.0.0 promotes the latest desktop line to a stable release with cleaner CLI distribution, more reliable local runtime startup, and stronger connection handling across Desktop, hosted web, and local API modes.

## New Features

- Added first-class standalone CLI management through the local API. Desktop and local runtime installs now converge on the canonical `~/.atmos/bin/atmos` location instead of treating bundled runtime files as another CLI source.
- Added release-manifest based CLI installs and updates from `install.atmos.land`, with GitHub release data kept as a fallback path. This gives Desktop a more predictable way to install or refresh the CLI without relying on GitHub API availability for the primary path.
- Extended the local web runtime installer so it can resolve and install the latest compatible Atmos CLI dynamically when setting up the runtime.

## Bug Fixes

- Fixed CLI update checks to use the R2-backed update manifest and select compatible platform assets, reducing GitHub API rate-limit failures during update checks.
- Fixed local service probing for IPv6 hosts by formatting IPv6 URLs correctly before health checks.
- Preserved prompt stash content when copying a prompt fails, avoiding lost prompt text in the diff workflow. See PR #130.
- Fixed hosted/local detection and retry layout details so local connection recovery remains available from the hosted web shell.
- Fixed existing project logo migration behavior for local runtime data.

## Improvements

- Routed terminal WebSocket URLs through the active runtime configuration, improving terminal connectivity across Desktop, hosted web, and local development modes.
- Refined session and workspace state handling so the app is less likely to show stale workspace/session data after runtime transitions.
- Simplified Desktop runtime packaging around `runtime/current/bin/api`, with CLI installation handled separately through the standalone CLI path.
- Improved Pages/static web output by bundling the Geist fonts used by the app shell, reducing dependency on external font loading.

## Other Changes

- Updated the bundled local runtime release line to `0.2.2`.
- Updated the standalone Atmos CLI release line to `0.2.2`.
- Included the latest code quality refactors from PR #130.
