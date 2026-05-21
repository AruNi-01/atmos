# Desktop Local Build Scripts

This directory contains local scripts for building the Atmos desktop app on developer machines.

## Scripts

- `build-local-macos.sh`: Main local build entry for macOS.
- `prepare-sidecar.sh`: Builds `api` + `atmos`, **rebuilds** web static export (`build-web-static.mjs`), and lays out the **unified local runtime** bundle.
- `build-web-static.mjs`: `next build` with `BUILD_TARGET=desktop` and copy to `binaries/web-out`.
- `layout-runtime-bundle.sh`: Creates `apps/desktop/src-tauri/binaries/runtime/current/` (`bin/api`, `bin/atmos`, `web/`, `system-skills/`).
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

Runtime bundle and legacy sidecar artifacts are prepared under:

```text
apps/desktop/src-tauri/binaries/
  runtime/current/     # unified layout consumed by Desktop + runtime-manager
  atmos-sidecar-*      # legacy filename (optional; layout copies from target/release/api)
  web-out/
  system-skills/
  atmos-cli/
```

These paths are **gitignored** except `.gitkeep` stubs — run `prepare-sidecar.sh` after clone.

## Related commands

From project root:

- `just dev-desktop`
- `just dev-desktop-debug`
- `just build-desktop`

These commands already call `scripts/desktop/prepare-sidecar.sh` (includes a fresh web static build each time).

Set `ATMOS_DESKTOP_SKIP_WEB_BUILD=1` to reuse an existing `apps/web/out` when only changing Rust/API.

## Troubleshooting

- Desktop shows an old UI after code changes  
  You need a new static export — run `just dev-desktop` again (or `node scripts/desktop/build-web-static.mjs`). Do not rely on `apps/web/out` from days ago; `prepare-sidecar` now rebuilds it by default.


- `command not found: bun`  
  Install Bun and ensure it is in `PATH`.

- Rust target missing  
  Install target with:
  `rustup target add aarch64-apple-darwin` or
  `rustup target add x86_64-apple-darwin`

- Tauri build: `resource path binaries/runtime/current doesn't exist`  
  Run `bash scripts/desktop/prepare-sidecar.sh` (or `layout-runtime-bundle.sh` after `cargo build --bin api --bin atmos`).

- `bundled runtime layout missing` at Desktop startup  
  Same as above — `binaries/runtime/current/bin/api` must exist before `tauri dev` / `tauri build`.
