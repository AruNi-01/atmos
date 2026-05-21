# ATMOS

Atmosphere for Agentic Builders

[简体中文](./README.zh-CN.md) | English

Atmos screenshot

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
- **Canvas** — A cross-project infinite canvas: pin terminal cards from any workspace or project onto one persistent board, and let Code Agents drive the canvas diagrams, notes, and layout without leaving your agent workflow.
- **Atmos Computer** — Register your VPS or any machine to the Atmos Register Center, then connect from Desktop, Web, and run terminals, workspaces, and Canvas on that computer—your Atmos environment, wherever the machine lives.
- **Review Workflow** — Review changes in Atmos's built-in diff UI, leave inline comments on specific lines, then hand off to your Code Agent to apply fixes.
- **Agent Status Tracking** — Real-time agent lifecycle sync via hooks (running, idle, waiting for permission, done) across the UI, with notifications on state changes—native alerts plus self-hosted push (ntfy, Gotify, or a custom webhook).
- **Lightweight Local Models** — One-click run llama-server for small Hugging Face models on your machine—ideal for light tasks such as session titles, workspace TODO extraction, and Git commit message generation without config a cloud API.

## Get Started

### Download

Latest desktop release: [View the latest release](https://github.com/AruNi-01/atmos/releases/latest).

### Homebrew (Desktop App)

```bash
brew install --cask AruNi-01/tap/atmos
```

### Desktop App (macOS Install Script)

```bash
curl -fsSL https://install.atmos.land/install-desktop.sh | bash
```

This installer is for **macOS only** (Intel & Apple Silicon). It downloads and extracts the app to `/Applications`.

For **Linux/Windows**, download the installer directly from GitHub Releases:
[https://github.com/AruNi-01/atmos/releases](https://github.com/AruNi-01/atmos/releases)

Options:

- `--version <tag>` - Install a specific release tag
- `--archive <path>` - Install from a local .app.tar.gz archive
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
2. The runtime will start automatically (or run `~/.atmos/bin/atmos runtime ensure`).
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
just dev-desktop
```

## License

MIT. See [LICENSE](./LICENSE).