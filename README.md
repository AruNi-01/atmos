

<div align="center">

# ATMOS

Atmosphere for Agentic Builders

[简体中文](./README.zh-CN.md) | English

</div>

<p align="center">
  <img src="./assets/readme/atmos-preview.png" alt="Atmos screenshot" />
</p>


## Features

<table>
  <tr>
    <td width="48%" valign="middle">
      <strong>15+ Built-in Terminal Agents</strong><br />
      Launch and manage Claude Code, Codex, Gemini, Cursor, Devin, Antigravity, and more from one unified terminal interface.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/built-in-terminal-agents.gif" alt="Built-in Terminal Agents" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/multi-workspace-dev.gif" alt="Multi-Workspace Development" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Multi-Workspace Development</strong><br />
      Git worktree isolation for parallel agent execution across multiple environments.
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Built-in Lightweight Editor</strong><br />
      File preview, inline editing, and switch back to manual coding mode anytime.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/built-in-lightweight-editor.gif" alt="Built-in Lightweight Editor" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/integrated-git-workflow.gif" alt="Integrated Git Workflow" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Integrated Git Workflow</strong><br />
      Diff view, commit assistance, code review, and GitHub PR management in one place.
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Terminal Side Chat</strong><br />
      Quick <code>/side</code> conversations from the terminal AI input without leaving your terminal workflow.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/terminal-side-chat.gif" alt="Terminal Side Chat" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/skill-manager.gif" alt="Skill Management System" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Skill Management System</strong><br />
      Discover, enable/disable, and delete agent skills with one-click control.
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Global Search &amp; Command Palette</strong><br />
      Keyboard-driven workflow for searching and executing Atmos features.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/global-search-command-panel.gif" alt="Global Search and Command Palette" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/agent-status-notifications.gif" alt="Agent Status and Notifications" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Agent Status &amp; Notifications</strong><br />
      Real-time agent lifecycle tracking via hooks (running, idle, waiting for permission, done) across the UI, with native notifications and self-hosted push server support (ntfy, Gotify, or a custom webhook).
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Usage Analytics Dashboard</strong><br />
      Track AI coding subscription quotas, agent token consumption, and cost estimation.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/usage-analytics-dashboard.gif" alt="Usage Analytics Dashboard" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/kanban-view.gif" alt="Kanban View" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Kanban View</strong><br />
      Quickly manage Workspace status, priority, labels and other information in Kanban view.
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Canvas</strong><br />
      A cross-project infinite canvas: pin terminal cards from any workspace or project onto one persistent board, and let Code Agents drive the canvas diagrams, notes, and layout without leaving your agent workflow.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/canvas.gif" alt="Canvas" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/browser-element-inspector.gif" alt="Browser Element Inspector" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Browser Element Inspector</strong><br />
      Hover and click to select elements in live browser preview, locating source code in React, Vue, Angular, and Svelte projects.
    </td>
  </tr>
  <tr>
    <td width="48%" valign="middle">
      <strong>Automations &amp; GitHub Triggers</strong><br />
      Scheduled local automation runs powered by Atmos terminal agents, with optional GitHub App webhook triggers.
    </td>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/automation.gif" alt="Automations and GitHub Triggers" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="52%" align="center" valign="middle">
      <img src="./assets/readme/features/appshots.gif" alt="Appshots" width="100%" />
    </td>
    <td width="48%" valign="middle">
      <strong>Appshots</strong><br />
      Cross-app desktop snapshots as lightweight clipboard references for quick capture during development.
    </td>
  </tr>
</table>

Also included:

- **Persistent Tmux Sessions** — Fault-tolerant terminal management with tmux; sessions survive interruptions and restarts.
- **Review Workflow** — Review changes in Atmos's built-in diff UI, leave inline comments on specific lines, then hand off to your Code Agent to apply fixes.
- **Global Agent Chat Panel** — Start non-terminal conversations from anywhere, reusing your Code Agent CLI (native hosts + ACP).
- **Remote Access** — Register your VPS or any machine to the Atmos Register Center, then connect from Desktop, Web, and Mobile to run terminals, workspaces, and Canvas on that computer. Integrated tunnel connector (Ngrok/Tailscale/Cloudflare Tunnel) for remote access.

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

### Local Web Runtime

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

### Quick Use

#### Desktop App

1. Install Atmos via Homebrew or install script.
2. Launch the desktop app and create or open a workspace.
3. Connect your project, open a terminal, and work with agents in the same place.

#### Local Web Runtime

1. Install via the install script.
2. The runtime will start automatically (or run `~/.atmos/bin/atmos runtime ensure`).
3. Open your browser to the displayed URL (default: `http://127.0.0.1:30303`).
4. Create a workspace and start working with agents.

### Run From Source

> **Prerequisite**: [just](https://github.com/casey/just) — `brew install just` (macOS) / `cargo install just`<br />
> **Prerequisite**: [Bun](https://bun.sh) — required for installing JavaScript dependencies (`bun install`) and running dev servers.<br />
> **Prerequisite**: [Rust & Cargo](https://rustup.rs/) — required for compiling the Rust backend and fetching crate dependencies.

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

**Or without `just`:**

```bash
# API
cargo run --bin api -- --cleanup-stale-clients true

# Web
cd apps/web && bun x next dev --turbopack --port 3030

# Desktop
bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json
```

## License

See [LICENSE](./LICENSE).
