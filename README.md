# Atmos

[简体中文](./README.zh-CN.md) | English

> **ATMOS - Atmosphere for Agentic Builders**

Atmos is an AI-native coding workspace that combines a Rust backend, a Next.js web app, and a Tauri desktop shell. It is built to keep your full development loop in one place: **project/workspace orchestration, terminal sessions, agent workflows, GitHub operations, and developer automation**.

---

## Table of Contents

- [Why Atmos](#why-atmos)
- [Feature Highlights](#feature-highlights)
  - [AI Agent Workspace](#ai-agent-workspace)
  - [Project Wiki Workflow](#project-wiki-workflow)
  - [Global Search & Quick Actions](#global-search--quick-actions)
  - [Run Preview](#run-preview)
  - [Git Intelligence (Commit Message + Auto Review)](#git-intelligence-commit-message--auto-review)
  - [GitHub Collaboration](#github-collaboration)
  - [Terminal + tmux Session Orchestration](#terminal--tmux-session-orchestration)
  - [Skills System](#skills-system)
  - [Lightweight LLM Providers](#lightweight-llm-providers)
  - [Usage & Token Observability](#usage--token-observability)
  - [Desktop Integration](#desktop-integration)
- [Architecture](#architecture)
- [Monorepo Layout](#monorepo-layout)
- [Quick Start](#quick-start)
- [Install via Homebrew Cask (macOS)](#install-via-homebrew-cask-macos)
- [Development Commands](#development-commands)
- [Environment Variables](#environment-variables)
- [Communication Model](#communication-model)
- [Contributing](#contributing)
- [License](#license)

---

## Why Atmos

Most AI coding tools solve only one part of the workflow. Atmos is designed as a complete operating surface for engineering teams and power users:

- Manage multiple projects and workspaces with branch-aware context.
- Keep long-lived terminal sessions recoverable across refreshes, reconnects, and app restarts with tmux-backed persistence.
- Reattach to the exact workspace terminal window you were using instead of spawning disposable shells.
- Surface smarter terminal context with shell-shim title detection, so panes reflect the active command or working directory instead of generic labels.
- Bring AI agents into real development tasks (not just chat output).
- Go from code change to PR and CI operations in the same interface.

---

## Feature Highlights

### AI Agent Workspace

- Agent panel with streaming responses, tool call updates, permission prompts, and cancellation.
- Agent manager with install/config flows for local and registry-based agents.
- Custom ACP agent support (add/remove/edit JSON manifests).
- Multi-agent integration paths for different vendor adapters.

### Project Wiki Workflow

- Dedicated Project Wiki tab with setup, catalog loading, and page rendering.
- Wiki generation/update flow integrated with terminal automation.
- URL-synced wiki page state for navigation and deep-linking.

### Global Search & Quick Actions

- Unified command surface for navigation, workspace actions, and theme/system actions.
- File tree search and code-content search from the same search modal.
- Quick open app actions for local tools/editors (e.g. Finder/Terminal/Cursor/VS Code/iTerm/JetBrains family).
- Keyboard-driven UX for fast context switching.

### Run Preview

- Built-in Run Preview panel for command/script preview workflows.
- Preview components designed for rapid “run-and-verify” loops in app context.

### Git Intelligence (Commit Message + Auto Review)

- AI-assisted commit message generation from changed files/diff context.
- Streaming commit message events over WebSocket.
- Automated code-review workflow via built-in review dialog + skill selection.
- Review output persistence under project-scoped `.atmos` paths.

### GitHub Collaboration

- Pull request lifecycle operations: list, detail, create, comment, merge/close/reopen.
- Draft/Ready-for-review transitions and open-in-browser shortcuts.
- GitHub Actions/CI status, run details, and rerun actions.

### Terminal + tmux Session Orchestration

- WebSocket terminal transport with input, resize, close, and destroy controls.
- Tmux-backed terminals detach cleanly on close while preserving the underlying window for later reattachment.
- Reattach to existing tmux sessions/windows by window name or index, with fallback to creating a new window when the target is missing.
- Each project/workspace uses a stable base tmux session, while each terminal panel maps to its own tmux window and each live connection gets an isolated grouped client session.
- Shell shims inject dynamic title signals so terminal tabs can intelligently show the active command while running and the current directory when idle.
- Bash, Zsh, and Fish are shim-aware, and the injected startup path preserves the user's normal shell config instead of replacing it.
- Startup cleanup of stale tmux client sessions to prevent PTY exhaustion.

### Skills System

- Skills list/detail/enable-disable/delete management.
- System skill synchronization on startup and manual re-sync APIs.
- Built-in checks for Wiki, code review, and git-commit related system skills.

### Lightweight LLM Providers

- Lightweight BYOK provider config for short automation tasks such as ACP session titles and git commit generation.
- OpenAI-compatible and Anthropic-compatible providers with saved `base_url`, `api_key`, and model routing.
- Configurable manual provider setup paths for lightweight side-process flows.

### Usage & Token Observability

- Usage quota querying with provider-level switching and auto-refresh controls.
- Token usage aggregation with broadcast updates for live UI refresh.
- Dedicated visualization panels for usage and token consumption.

### Desktop Integration

- Tauri desktop app launching local API sidecar.
- Native tray behavior, notifications, and external editor launching.
- Desktop-safe runtime handling for PATH and UTF-8 locale normalization.
- Optional static web bundle serving from API for packaged desktop flow.

---

## Architecture

- **Backend**: Rust, Axum, Tokio, SeaORM migration.
- **Infra layer (`crates/infra`)**: database, migrations, WebSocket protocol/service, system skill sync.
- **Core engine (`crates/core-engine`)**: PTY, tmux, Git, filesystem, app open/search primitives.
- **Service layer (`crates/core-service`)**: project/workspace/agent/terminal/GitHub business orchestration.
- **Agent crate (`crates/agent`)**: ACP client/session bridge and agent manager capabilities.
- **LLM crate (`crates/llm`)**: lightweight provider config, BYOK routing, and inference clients.
- **Usage crates (`crates/ai-usage`, `crates/token-usage`)**: provider usage collection and token accounting.
- **CLI app (`apps/cli`)**: `atmos` command-line interface.
- **Web app (`apps/web`)**: Next.js 16 + React 19, WebSocket-first UX.
- **Desktop app (`apps/desktop`)**: Tauri shell with local sidecar integration.

---

## Monorepo Layout

```text
atmos/
├── apps/
│   ├── api/         # Axum API entry (HTTP + WS)
│   ├── cli/         # atmos command-line interface
│   ├── web/         # Next.js application
│   ├── desktop/     # Tauri desktop shell
│   ├── docs/        # docs website
│   └── landing/     # marketing site
├── crates/
│   ├── infra/       # DB/WS/infra concerns
│   ├── core-engine/ # PTY/Git/FS/tmux capabilities
│   ├── core-service/# business workflows
│   ├── agent/       # ACP/agent integration
│   ├── llm/         # lightweight provider abstraction + BYOK config
│   ├── ai-usage/    # provider usage aggregation
│   └── token-usage/ # token accounting services
├── packages/
│   ├── ui/          # shared UI primitives
│   ├── shared/      # shared frontend utilities
│   ├── i18n/        # i18n package
│   └── config/      # shared config package
└── docs/            # architecture/design docs
```

---

## Quick Start

### 1) Prerequisites

- Rust (stable)
- Bun
- Node.js
- `just` (`brew install just` on macOS, or `cargo install just --locked`)
- tmux (recommended for full terminal features)

### 2) Install dependencies

```bash
bun install
cargo fetch
```

### 3) Run services

```bash
just dev-api
just dev-web
# optional
just dev-cli
just dev-desktop
```

---

## Install via Homebrew Cask (macOS)

You can install the desktop app with Homebrew Cask.

### Option 1: one-line install from the shared tap

```bash
brew install --cask AruNi-01/tap/atmos
```

This installs the latest published `Atmos.app` through the shared `homebrew-tap` repository.

### Option 2: tap first, then install

```bash
brew tap AruNi-01/tap
brew install --cask atmos
```

Homebrew will use the shared tap repository and install the desktop app from the GitHub Releases DMG assets.

### Upgrade

```bash
brew upgrade --cask atmos
```

### Uninstall

```bash
brew uninstall --cask atmos
```

### Notes

- This is intended for first-time macOS desktop installation.
- The Homebrew Cask installs the packaged desktop app, not the development environment.
- If you only want to run Atmos from source, follow the Quick Start steps above instead.

---

## Development Commands

```bash
just                 # list all tasks
just fmt             # format code
just lint            # run lint checks
just test            # run tests
just build-all       # build web + rust targets
```

---

## Environment Variables

Common runtime variables:

- `ATMOS_PORT`: API listen port.
- `ATMOS_LOCAL_TOKEN`: local API token (used by desktop sidecar integration).
- `ATMOS_STATIC_DIR`: path to exported static web assets served by API.
- `ATMOS_DATA_DIR`: runtime data directory for desktop mode.

---

## Communication Model

Atmos is **WebSocket-first** for interactive behavior:

- Terminal streaming.
- Agent streaming and tool-call events.
- Live usage/token update broadcasts.
- Workspace progress and state notifications.

REST endpoints are kept for non-streaming/bootstrap style operations.

---

## Contributing

Issues and PRs are welcome.

Recommended pre-submit checks:

```bash
just fmt
just lint
just test
```

For larger changes, include:

- Motivation and scope.
- Affected areas (`apps/*`, `crates/*`, `packages/*`).
- Validation steps and regression notes.

---

## License

[MIT](./LICENSE)
