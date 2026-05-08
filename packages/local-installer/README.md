# `@atmos/local-web-runtime`

Install and run the local Atmos web runtime on your machine.

## Usage

```bash
npx @atmos/local-web-runtime
```

Or with Bun:

```bash
bunx @atmos/local-web-runtime
```

## What it does

- detects your platform
- downloads the matching `atmos-local-runtime-<target>.tar.gz` asset from GitHub Releases
- installs the runtime under `~/.atmos/runtime/current`
- installs the `atmos` CLI under `~/.atmos/bin/atmos`
- starts the local Atmos API + web runtime

## Options

```bash
npx @atmos/local-web-runtime --help
```
