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
  - [Usage & Token Observability](#usage--token-observability)
  - [Desktop Integration](#desktop-integration)
- [Architecture](#architecture)
- [Monorepo Layout](#monorepo-layout)
- [Quick Start](#quick-start)
- [Development Commands](#development-commands)
- [Environment Variables](#environment-variables)
- [Communication Model](#communication-model)
- [Contributing](#contributing)
- [License](#license)

---

## Why Atmos

Most AI coding tools solve only one part of the workflow. Atmos is designed as a complete operating surface for engineering teams and power users:

- Manage multiple projects and workspaces with branch-aware context.
- Run long-lived terminal sessions without losing state.
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
- tmux attach/create behavior with fallback handling.
- Multi-session terminal management for workspace-centric development.
- Startup cleanup of stale tmux client sessions to prevent PTY exhaustion.

### Skills System

- Skills list/detail/enable-disable/delete management.
- System skill synchronization on startup and manual re-sync APIs.
- Built-in checks for Wiki, code review, and git-commit related system skills.

### Usage & Token Observability

- Usage overview querying and provider-level switching.
- Token usage aggregation with broadcast updates for live UI refresh.
- Configurable auto-refresh and manual provider setup paths.

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
- **Web app (`apps/web`)**: Next.js 16 + React 19, WebSocket-first UX.
- **Desktop app (`apps/desktop`)**: Tauri shell with local sidecar integration.

---

## Monorepo Layout

```text
atmos/
├── apps/
│   ├── api/         # Axum API entry (HTTP + WS)
│   ├── web/         # Next.js application
│   ├── desktop/     # Tauri desktop shell
│   ├── docs/        # docs website
│   └── landing/     # marketing site
├── crates/
│   ├── infra/       # DB/WS/infra concerns
│   ├── core-engine/ # PTY/Git/FS/tmux capabilities
│   ├── core-service/# business workflows
│   └── agent/       # ACP/agent integration
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
just dev-desktop
```

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
