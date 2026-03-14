# Desktop Local Build Scripts

This directory contains local scripts for building the Atmos desktop app on developer machines.

## Scripts

- `build-local-macos.sh`: Main local build entry for macOS.
- `prepare-sidecar.sh`: Builds API sidecar and copies static web output into Tauri binaries.
- `before-build.mjs`: Node-based prebuild script used by Tauri `beforeBuildCommand`.

## Prerequisites

- macOS
- `bun`
- Rust toolchain (`cargo`, `rustc`)
- Tauri prerequisites for macOS

Install project dependencies first:

```bash
bun install
```

## Build Locally (macOS)

Run with auto-detected target (Apple Silicon -> `aarch64-apple-darwin`, Intel -> `x86_64-apple-darwin`):

```bash
bash scripts/desktop/build-local-macos.sh
```

### Common options

Specify target explicitly:

```bash
bash scripts/desktop/build-local-macos.sh --target aarch64-apple-darwin
```

Build without creating installer bundle (faster smoke check):

```bash
bash scripts/desktop/build-local-macos.sh --no-bundle
```

Pass extra arguments to `bun tauri build`:

```bash
bash scripts/desktop/build-local-macos.sh -- --config src-tauri/tauri.debug.conf.json
```

Force ad-hoc signing when you want a locally signed artifact without Apple Developer credentials:

```bash
bash scripts/desktop/build-local-macos.sh --ad-hoc-sign
```

Disable the script's automatic ad-hoc signing fallback:

```bash
bash scripts/desktop/build-local-macos.sh --no-ad-hoc-sign
```

## Outputs

Bundle artifacts are generated under:

```text
apps/desktop/src-tauri/target/release/bundle
```

The script also creates a zip next to the `.app` bundle using `ditto`. Prefer sharing that zip or the generated `.dmg`. Do not send the raw `.app` bundle through chat tools or ad-hoc archive tools because macOS bundle metadata and signatures are easy to break in transit.

Sidecar binary and static web assets are prepared under:

```text
apps/desktop/src-tauri/binaries
```

## Related commands

From project root:

- `just dev-desktop`
- `just dev-desktop-tauri`
- `just dev-desktop-debug`
- `just build-desktop`

These commands already call `scripts/desktop/prepare-sidecar.sh`.

## Troubleshooting

- `command not found: bun`  
  Install Bun and ensure it is in `PATH`.

- Rust target missing  
  Install target with:
  `rustup target add aarch64-apple-darwin` or
  `rustup target add x86_64-apple-darwin`

- Tauri build fails due to macOS signing/notarization  
  For local self-use builds, run without signing setup. Distribution to others may require valid Apple signing and notarization.

- Recipients see “The app is damaged and can’t be opened”  
  This usually means one of two things:
  1. the app was not properly signed/notarized for distribution, or
  2. the `.app` bundle was repackaged/modified after signing.
  Use the generated `.dmg` or `ditto` zip, not the raw `.app`.

- Recipients can open only after using Privacy & Security  
  Ad-hoc signing helps local builds behave better, especially on Apple Silicon, but it is not a substitute for Developer ID signing + notarization. For a build that opens normally on other Macs, configure Tauri's Apple signing/notarization environment variables such as `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`, or the App Store Connect API key variables documented by Tauri.
