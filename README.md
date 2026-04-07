<h1 align="center" style="border-bottom: none; padding-bottom: 0;">ATMOS</h1>
<p align="center" style="font-size: 1.25em; color: #666; margin-top: 8px;">Atmosphere for Agentic Builders</p>

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

<p align="center"><a href="./README.zh-CN.md">简体中文</a> | English</p>

![Atmos screenshot](./apps/landing/src/assets/img/atmos_preview.png)

## Features

- **Multi-Workspace Development** — Git worktree isolation for parallel agent execution across multiple environments.
- **Persistent Tmux Sessions** — Fault-tolerant terminal management with tmux; sessions survive interruptions and restarts.
- **Built-in Lightweight Editor** — File preview, inline editing, and switch back to manual coding mode anytime.
- **Integrated Git Workflow** — Diff view, commit assistance, code review, and GitHub PR management in one place.
- **Skill Management System** — Discover, enable/disable, and delete agent skills with one-click control.
- **Global Agent Chat Panel** — Start non-terminal conversations from anywhere, powered by ACP to reuse your Code Agent CLI.
- **Global Search & Command Palette** — Keyboard-driven workflow for searching and executing Atmos features.
- **Usage Analytics Dashboard** — Track AI coding subscription quotas, agent token consumption, and cost estimation.
- **Agent Status Notifications** — Hook-based status monitoring with native notifications and self-hosted push server support.
- **Cross-Platform & Remote Access** — Web and desktop apps, mobile app (planned), integrated tunneling (ngrok/Tailscale/Cloudflare Tunnel).

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

## Conflict Test
