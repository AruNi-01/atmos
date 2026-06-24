# `@atmos-land/local-web-runtime`

Installer package for the local Atmos web runtime.

## Usage

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

You can also install through the npm entrypoint:

```bash
npx @atmos-land/local-web-runtime
```

## What it does

- detects your platform
- downloads the matching `atmos-local-runtime-<target>.tar.gz` asset
- installs the runtime under `~/.atmos/runtime/current`
- installs or keeps the latest standalone `atmos` CLI under `~/.atmos/bin/atmos`
- starts the local Atmos API + web runtime

## Options

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash -s -- --help
```
