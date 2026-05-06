# AI Agent Guide

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
| **Write a Spec** (Brainstorm / PRD / TECH / TEST) | [specs/AGENTS.md](specs/AGENTS.md) |

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
└── specs/                     # 📋 Specs (Brainstorm / PRD / TECH / TEST)
    ├── AGENTS.md              # Specs conventions — read this before writing a spec
    ├── APP/                   # Atmos application (web/desktop/cli/api) specs
    │   └── APP-NNN_<title>/
    │       ├── BRAINSTORM.md
    │       ├── PRD.md
    │       ├── TECH.md
    │       └── TEST.md
    ├── Landing/               # apps/landing specs
    └── Docs/                  # apps/docs specs
```

---

## 🔄 Development Workflow

### Backend Change Flow
`infra` (Data) → `core-engine` (Capability) → `core-service` (Business) → `api` (Endpoint)

### Frontend Change Flow
`packages/ui` (Styles) → `apps/web/src/api` (API Client) → `apps/web` (Feature)

### Specs Flow
Every feature that needs planning lives under `specs/<APP|Landing|Docs>/<ZONE>-NNN_<title>/` with exactly four files: `BRAINSTORM.md` → `PRD.md` → `TECH.md` → `TEST.md`. The lifecycle is: brainstorm → PRD → TECH → test plan → implementation → test run. Each stage has a dedicated skill in [`.agents/skills/`](.agents/skills/):

- `atmos-specs-brainstorm` — explore problem space, write `BRAINSTORM.md`
- `atmos-specs-prd` — lock WHAT and WHY, write `PRD.md`
- `atmos-specs-tech` — design HOW, write `TECH.md`
- `atmos-specs-test-plan` — author scenario-level plan in `TEST.md`
- `atmos-specs-impl` — ship production code under `crates/` / `apps/` / `packages/`, keep regression gate green
- `atmos-specs-test-run` — write and run the real tests (`cargo test`, `bun test`), append Coverage Status to `TEST.md`

Full conventions (zones, naming, the 4-file rule, review checklist) live in [specs/AGENTS.md](specs/AGENTS.md). Read it before creating or editing a spec.

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

## 🪲 Debug Logging

The project has a ready-made debug logging infrastructure (Rust + TypeScript) that writes structured JSON-line logs to `./logs/debug/`. Use it whenever you need to instrument a lifecycle flow or diagnose a tricky bug.

→ **[Full usage guide](agents/references/debug-logging.md)**

---

## Compact Instructions

When compressing context, create a continuation-oriented coding handoff summary. Load the detailed rules only when context compression is needed.

→ **[Full usage guide](agents/references/compact-instructions.md)**

---

## Coding Behavioral Guidelines

**Tradeoff**: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.


### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

**Next Steps**: Remember Behavioral Guidelines, then choose your working area from the table above and open its specific `AGENTS.md`.

---
