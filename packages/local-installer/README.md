# `@atmos/local-web-runtime`

Installer package for the local Atmos web runtime.

## Usage

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

The npm package is kept for the release pipeline, but end-user installs should use the shell installer until npm publishing is enabled.

## What it does

- detects your platform
- downloads the matching `atmos-local-runtime-<target>.tar.gz` asset from GitHub Releases
- installs the runtime under `~/.atmos/runtime/current`
- installs the `atmos` CLI under `~/.atmos/bin/atmos`
- starts the local Atmos API + web runtime

## Options

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash -s -- --help
```
