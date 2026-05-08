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
- **Cross-Platform & Remote Access** — Web and desktop apps, mobile app (planned), integrated tunneling (Ngrok/Tailscale/Cloudflare Tunnel).
- **Kanban View** - Quickly manage Workspace status, priority, labels and other information in Kanban view.

## Get Started

### Download

Latest desktop release: [View the latest release](https://github.com/AruNi-01/atmos/releases/latest).

### Homebrew (Desktop App)

```bash
brew install --cask AruNi-01/tap/atmos
```

### Desktop App (Install Script)

```bash
curl -fsSL https://install.atmos.land/install-desktop.sh | bash
```

Supported platforms:
- **macOS** (Intel & Apple Silicon): Extracts to `/Applications`
- **Linux** (x64): Installs AppImage to `~/.local/bin/`
- **Windows** (x64): Runs silent installer

Options:
- `--version <tag>` - Install a specific release tag
- `--archive <path>` - Install from a local archive
- `--github-source` - Use GitHub Releases instead of custom domain

### Local Web Runtime

#### Option 1: Install Script

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

Options:
- `--version <tag>` - Install a specific release tag
- `--install-dir <path>` - Custom install directory (default: `~/.atmos`)
- `--port <port>` - Port for local runtime (default: `30303`)
- `--no-start` - Install only, do not start
- `--no-open` - Do not auto-open browser
- `--github-source` - Use GitHub Releases instead of custom domain

#### Option 2: npm/bun Package

```bash
# Using npm
npx @atmos/local-web-runtime

# Using bun
bunx @atmos/local-web-runtime
```

### Quick Use

#### Desktop App
1. Install Atmos via Homebrew or install script.
2. Launch the desktop app and create or open a workspace.
3. Connect your project, open a terminal, and work with agents in the same place.

#### Local Web Runtime
1. Install via install script or npm/bun package.
2. The runtime will start automatically (or run `~/.atmos/bin/atmos local start`).
3. Open your browser to the displayed URL (default: `http://127.0.0.1:30303`).
4. Create a workspace and start working with agents.

### Run From Source

```bash
## Install
bun install
cargo fetch

## Run in web
just dev-api
just dev-web

# Run in desktop
just dev-web
just dev-desktop-tauri
```

## License

MIT. See [LICENSE](./LICENSE).
