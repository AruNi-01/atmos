# AI Agent Navigation Guide

> **⏱ 60-Second Architecture Overview**: This project is a multi-layered monorepo combining a high-performance Rust backend (divided into infra, engine, and service) with a Next.js/Tauri frontend.

---

## 🎯 Quick Decision Tree

**I need to...**

| Task | Go To |
|------|-------|
| **Backend: Infrastructure** (DB, WS, Redis) | [crates/infra/AGENTS.md](crates/infra/AGENTS.md) |
| **Backend: Core Engine** (PTY, Git, FS) | [crates/core-engine/AGENTS.md](crates/core-engine/AGENTS.md) |
| **Backend: Business Logic** (Auth, Project, Workspace) | [crates/core-service/AGENTS.md](crates/core-service/AGENTS.md) |
| **Backend: Agent Integration** (ACP, Agent Manager) | [crates/agent/README.md](crates/agent/README.md) |
| **API Entry**: HTTP/WS Handlers & DTOs | [apps/api/AGENTS.md](apps/api/AGENTS.md) |
| **Frontend: Web App** (Next.js 16) | [apps/web/AGENTS.md](apps/web/AGENTS.md) |
| **Frontend: UI Library** (@workspace/ui) | [packages/ui/AGENTS.md](packages/ui/AGENTS.md) |
| **CLI Tool**: (atmos command) | [apps/cli/AGENTS.md](apps/cli/AGENTS.md) |

---

## 🏗 Monorepo Structure (Standardized)

```
atmos/
├── crates/                          # 🦀 Shared Rust Packages (Backbone)
│   ├── infra/                       # L1: Infrastructure (DB, WebSocket, Jobs)
│   ├── core-engine/                 # L2: Tech Capabilities (PTY, Git, FS)
│   ├── core-service/                # L3: Business Rules (Auth, Logic)
│   └── agent/                       # Independent: ACP Client, Agent Management
│
├── apps/                            # 🚀 Applications
│   ├── api/                         # Rust/Axum API Entry
│   ├── web/                         # Next.js Web Application
│   ├── cli/                         # Rust CLI (atmos)
│   ├── docs/                        # Documentation Site
│   └── landing/                     # Marketing Landing Page
│
├── packages/                        # 📦 Shared JS/TS Packages
│   ├── ui/                          # @workspace/ui (shadcn/ui)
│   ├── shared/                      # @workspace/shared (Hooks/Utils)
│   ├── config/                      # @workspace/config (ESLint/TS)
│   └── i18n/                        # @workspace/i18n (Translations)
│
├── docs/                            # 📖 Deep Design & Architecture
└── specs/                           # 📋 PRD & Technical Plans
```

---

## 🔄 Development Workflow

### 1. Backend Change Flow
`infra` (Data) → `core-engine` (Capability) → `core-service` (Business) → `api` (Endpoint)

### 2. Frontend Change Flow
`packages/ui` (Styles) → `apps/web/src/api` (API Client) → `apps/web` (Feature)

---

## 🎨 Component Conventions

- **UI Components**: Use `@workspace/ui/components/ui/*` for atomic parts.
- **Backend Access**: Each app manages its own `api/client.ts` and `types/api.ts`.
- **Rust Services**: Inject `core-service` into `apps/api` via `AppState`.

---

## 🔌 Transport Rules

- **WebSocket-first by default**: This project primarily uses WebSocket-driven flows, especially for chat, session state, streaming updates, and interactive app behavior.
- **Do not add new REST APIs by default**: Before introducing a new REST endpoint, first check whether the feature should be implemented on the existing WebSocket/event channel.
- **REST is the exception**: Use REST only for clearly non-streaming cases such as startup/bootstrap data, explicit settings persistence, one-off admin actions, or when an existing module is already REST-based.
- **Avoid duplicate transports**: Do not build a new REST path for a capability that already has, or should naturally have, a WebSocket message flow.
- **When unsure, prefer extending WS messages**: For new interactive product behavior, extend the existing WebSocket protocol rather than creating parallel REST endpoints.

---

## 🚀 Quick Commands

```bash
# General
bun install          # Frontend deps
just                 # List all commands

# Run Services
just dev-api         # Start API Server
just dev-web         # Start Web App
just dev-cli         # Run CLI
```

---

**Next Steps**: Choose your working area from the table above and open its specific `AGENTS.md`.
