# Development Guide

This guide covers how to set up your environment and start developing for ATMOS.

## Prerequisites

- **Node.js**: (Version compatible with Bun)
- **Bun**: `npm install -g bun`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Just**: `cargo install just` (or via other package managers)

## Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    bun install
    ```
3.  Check layout:
    ```bash
    just
    ```

## Development Workflows

### Web Development (`apps/web`)

```bash
just dev-web
```
Runs the Next.js development server.

### API Development (`apps/api`)

```bash
just dev-api
```
Runs the Rust API server.

### Desktop Development (`apps/desktop`)

```bash
just dev-desktop
```
Runs the Tauri application. The command runs `scripts/desktop/prepare-sidecar.sh` first, which builds `api`/`atmos` and lays out `apps/desktop/src-tauri/binaries/runtime/current/` (shared local runtime — see `crates/runtime-manager/README.md`).

If `cargo check -p atmos-desktop` fails with missing `binaries/runtime/current`, run the prepare script once manually.

## Testing

Run all tests:
```bash
just test
```

## Linting & Formatting

```bash
just lint
just fmt
```
