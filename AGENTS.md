# AI Agent Navigation Guide

> **⏱ 60-Second Architecture Overview**: Multi-layered monorepo with Rust backend (infra/engine/service layers) and Next.js/Tauri frontend.

---

## 🎯 Quick Decision Tree

**I need to...**

| Task | Go To |
|------|-------|
| **Backend: Infrastructure** (DB, WS, Redis) | [crates/infra/AGENTS.md](crates/infra/AGENTS.md) |
| **Backend: Core Engine** (PTY, Git, FS) | [crates/core-engine/AGENTS.md](crates/core-engine/AGENTS.md) |
| **Backend: Business Logic** (Auth, Project, Workspace) | [crates/core-service/AGENTS.md](crates/core-service/AGENTS.md) |
| **Backend: Agent Integration** (ACP, Agent Manager) | [crates/agent/AGENTS.md](crates/agent/AGENTS.md) |
| **Backend: AI Usage Tracking** | [crates/ai-usage/AGENTS.md](crates/ai-usage/AGENTS.md) |
| **Backend: Token Usage Tracking** | [crates/token-usage/AGENTS.md](crates/token-usage/AGENTS.md) |
| **Backend: LLM Integration** | [crates/llm/AGENTS.md](crates/llm/AGENTS.md) |
| **API Entry**: HTTP/WS Handlers & DTOs | [apps/api/AGENTS.md](apps/api/AGENTS.md) |
| **Frontend: Web App** (Next.js 16) | [apps/web/AGENTS.md](apps/web/AGENTS.md) |
| **Frontend: UI Library** (@workspace/ui) | [packages/ui/AGENTS.md](packages/ui/AGENTS.md) |
| **CLI Tool**: (atmos command) | [apps/cli/AGENTS.md](apps/cli/AGENTS.md) |

---

## 🏗 Monorepo Structure

```
atmos/
├── crates/                    # 🦀 Rust Packages
│   ├── infra/                 # L1: Infrastructure (DB, WebSocket, Jobs)
│   ├── core-engine/           # L2: Tech Capabilities (PTY, Git, FS)
│   ├── core-service/          # L3: Business Rules
│   ├── agent/                 # Agent Integration (ACP Client)
│   ├── ai-usage/              # AI Usage Tracking
│   ├── token-usage/           # Token Usage Tracking
│   └── llm/                   # LLM Integration
│
├── apps/                      # 🚀 Applications
│   ├── api/                   # Rust/Axum API Entry
│   ├── web/                   # Next.js Web Application
│   ├── desktop/               # Tauri Desktop App
│   ├── cli/                   # Rust CLI (atmos)
│   ├── docs/                  # Documentation Site
│   └── landing/               # Marketing Landing Page
│
├── packages/                  # 📦 Shared JS/TS Packages
│   ├── ui/                    # @workspace/ui (shadcn/ui)
│   ├── shared/                # @atmos/shared (Hooks/Utils)
│   ├── config/                # @atmos/config (TS Config)
│   └── i18n/                  # @workspace/i18n (Translations)
│
├── docs/                      # 📖 Deep Design & Architecture
└── specs/                     # 📋 PRD & Technical Plans
```

---

## 🔄 Development Workflow

### Backend Change Flow
`infra` (Data) → `core-engine` (Capability) → `core-service` (Business) → `api` (Endpoint)

### Frontend Change Flow
`packages/ui` (Styles) → `apps/web/src/api` (API Client) → `apps/web` (Feature)

---

## 🎨 Component Conventions

- **UI Components**: Use `@workspace/ui/components/ui/*` for atomic parts
- **Backend Access**: Each app manages its own `api/client.ts` and `types/api.ts`
- **Rust Services**: Inject `core-service` into `apps/api` via `AppState`

---

## 🔌 Transport Rules

**WebSocket-first by default** — This project primarily uses WebSocket-driven flows for chat, session state, streaming updates, and interactive app behavior.

- **Do not add new REST APIs by default** — Check whether the feature should use the existing WebSocket/event channel first
- **REST is the exception** — Use REST only for: startup/bootstrap data, explicit settings persistence, one-off admin actions, or when an existing module is already REST-based
- **Avoid duplicate transports** — Do not build a new REST path for capabilities that should use WebSocket
- **When unsure, prefer extending WS messages** — Extend the existing WebSocket protocol rather than creating parallel REST endpoints

---

## 🚀 Commands

```bash
just                    # List all available commands
bun install             # Install frontend dependencies
just dev-api            # Start API server
just dev-web            # Start web app
just test               # Run all tests
just lint               # Run all linters
```

---

**Next Steps**: Choose your working area from the table above and open its specific `AGENTS.md`.

---

## Cursor Cloud specific instructions

### Services overview

| Service | Port | Start command | Notes |
|---------|------|---------------|-------|
| **Rust API** | 30303 | `cargo run --bin api` | Embedded SQLite at `~/.atmos/db/atmos.db`; auto-migrates on startup |
| **Next.js Web** | 3030 | `cd apps/web && bun x next dev --turbopack --port 3030` | Connects to API via REST + WebSocket |

No external databases, Redis, or Docker services are required. tmux must be installed (used for terminal session management).

### Bun install gotcha

The `bun.lock` file in this repo can cause `bun install` to hang indefinitely in containerized/overlay-fs environments. **Workaround**: temporarily rename `bun.lock` before install, then restore it:

```bash
mv bun.lock bun.lock.bak
bun install --ignore-scripts --no-save
mv bun.lock.bak bun.lock
```

Bun will resolve from `pnpm-lock.yaml` instead and complete successfully.

### Rust build notes

- The Cargo workspace includes `apps/desktop/src-tauri` which requires GTK3/GDK dev libraries (`libgtk-3-dev`, `libwebkit2gtk-4.1-dev`). These are only needed if building/linting the desktop app.
- To lint/test without desktop: `cargo clippy --workspace --exclude atmos-desktop` and `cargo test --workspace --exclude atmos-desktop`.
- The `justfile` defaults to `zsh` shell (`set shell := ["zsh", "-cu"]`), so `zsh` must be installed.

### Standard dev commands

See `justfile` and root `AGENTS.md` Commands section. Key shortcuts:

- `just dev-api` / `just dev-web` / `just dev-all` for starting services
- `just lint` for `bun lint` + `cargo clippy --workspace`
- `just test` for `bun test` + `cargo test --workspace`
- `just fmt` for formatting
