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

## Outputs

Bundle artifacts are generated under:

```text
apps/desktop/src-tauri/target/release/bundle
```

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
