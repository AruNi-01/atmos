<h1 align="center"> ATMOS </h1>

<h2 align="center">Atmosphere for Agentic Builders</h2>

<p align="center"><a href="./README.zh-CN.md">简体中文</a> | English</p>

<p align="center">
  <a href="https://github.com/AruNi-01/atmos/actions/workflows/release-desktop.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/AruNi-01/atmos/release-desktop.yml?branch=main&label=desktop%20release" alt="Desktop release workflow" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/releases/latest">
    <img src="https://img.shields.io/github/v/release/AruNi-01/atmos?display_name=tag&label=version" alt="Latest version" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/stargazers">
    <img src="https://img.shields.io/github/stars/AruNi-01/atmos?label=stars" alt="GitHub stars" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/AruNi-01/atmos?label=license" alt="License" />
  </a>
</p>

![Atmos screenshot](./apps/landing/src/assets/img/atmos_preview.png)

## Features

- AI agent workspace with streaming conversations, tool calls, and custom agent support.
- Persistent terminals backed by `tmux`, so sessions survive refreshes and restarts.
- Git and GitHub workflows in one place, including commit help, reviews, and pull requests.
- Project Wiki, global search, and quick actions for faster navigation.
- Cross-platform desktop app powered by a Rust backend, Next.js UI, and Tauri shell.

## Get Started

Latest desktop release: [View the latest release](https://github.com/AruNi-01/atmos/releases/latest).

### Download

| Platform | Package | Download |
| --- | --- | --- |
| macOS (Apple Silicon) | `.dmg` | [Latest release](https://github.com/AruNi-01/atmos/releases/latest) |
| macOS (Intel) | `.dmg` | [Latest release](https://github.com/AruNi-01/atmos/releases/latest) |
| Windows (x64) | `.exe` / `.msi` | [Latest release](https://github.com/AruNi-01/atmos/releases/latest) |
| Linux | `.AppImage` / `.deb` / `.rpm` | [Latest release](https://github.com/AruNi-01/atmos/releases/latest) |
| All releases | GitHub Releases | [View all releases](https://github.com/AruNi-01/atmos/releases) |

### Homebrew

```bash
brew install --cask AruNi-01/tap/atmos
```

### Quick Use

1. Install Atmos from one of the packages above.
2. Launch the desktop app and create or open a workspace.
3. Connect your project, open a terminal, and work with agents in the same place.

### Run From Source

```bash
bun install
cargo fetch
just dev-api
just dev-web
# optional
just dev-desktop
```

## License

MIT. See [LICENSE](./LICENSE).
