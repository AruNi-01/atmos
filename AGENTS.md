# AI Agent Guide

> **⏱ 60-Second Architecture Overview**: Multi-layered monorepo with Rust backend (infra/engine/service layers), Next.js/Tauri frontend, and Expo mobile app.

---

## 🎯 Quick Decision Tree

**I need to...**

| Task | Go To |
|------|-------|
| **Cross-Cutting References** (Shortcuts, Debug, etc.) | [agents/AGENTS.md](agents/AGENTS.md) |
| **Design System / UI Visual Language** | [DESIGN.md](DESIGN.md) |
| **Marketing Creative Production** (video/audio/social assets) | [marketing/AGENTS.md](marketing/AGENTS.md) |
| **Rust crates index** (layer map) | [crates/AGENTS.md](crates/AGENTS.md) |
| **Backend: Infrastructure** (DB, Cache, Queue, Jobs) | [crates/infra/AGENTS.md](crates/infra/AGENTS.md) |
| **Backend: Core Engine** (PTY, Git, FS) | [crates/core-engine/AGENTS.md](crates/core-engine/AGENTS.md) |
| **Backend: Business Logic** (Auth, Project, Workspace) | [crates/core-service/AGENTS.md](crates/core-service/AGENTS.md) |
| **Backend: Agent Integration** (ACP, Agent Manager) | [crates/agent/AGENTS.md](crates/agent/AGENTS.md) |
| **Backend: AI Usage Tracking** | [crates/ai-usage/AGENTS.md](crates/ai-usage/AGENTS.md) |
| **Backend: Token Usage Tracking** | [crates/token-usage/AGENTS.md](crates/token-usage/AGENTS.md) |
| **Backend: LLM Integration** | [crates/llm/AGENTS.md](crates/llm/AGENTS.md) |
| **Local runtime** (manifest, supervisor, relay identity) | [agents/references/runtime/AGENTS.md](agents/references/runtime/AGENTS.md) |
| **API Entry**: HTTP/WS Handlers & DTOs | [apps/api/AGENTS.md](apps/api/AGENTS.md) |
| **Frontend: Web App** (Next.js 16) | [apps/web/AGENTS.md](apps/web/AGENTS.md) |
| **Desktop** (Tauri + shared local API) | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) |
| **Mobile** (Expo / React Native) | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |
| **Frontend: UI Library** (@workspace/ui) | [packages/ui/AGENTS.md](packages/ui/AGENTS.md) |
| **Terminal agent built-ins** (shared Rust/TS manifest) | [resources/terminal-agents/AGENTS.md](resources/terminal-agents/AGENTS.md) |
| **CLI Tool** (atmos command) | [apps/cli/AGENTS.md](apps/cli/AGENTS.md) |
| **Relay** (Cloudflare Worker) | [packages/relay/AGENTS.md](packages/relay/AGENTS.md) |
| **Write/Edit Specs** (planning + optional logs) | [specs/AGENTS.md](specs/AGENTS.md) |

---

## 🏗 Monorepo Structure

```
atmos/
├── agents/                    # 📚 Cross-Cutting References
│   ├── AGENTS.md              # Reference index and usage guide
│   └── references/            # Detailed references (shortcuts, debug, etc.)
│
├── crates/                    # 🦀 Rust Packages (see crates/AGENTS.md)
│   ├── infra/                 # L1: Infrastructure (DB, Cache, Queue, Jobs)
│   ├── core-engine/           # L2: Tech Capabilities (PTY, Git, FS)
│   ├── core-service/          # L3: Business Rules
│   ├── agent/                 # Agent capability (ACP Client)
│   ├── ai-usage/              # AI Usage Tracking
│   ├── token-usage/           # Token Usage Tracking
│   ├── llm/                   # LLM capability
│   ├── local-model-runtime/   # Local model runtime capability
│   ├── tunnel-connector/         # Tunnel connector capability
│   └── runtime-manager/       # Local runtime manifest, supervisor, relay registration
│
├── apps/                      # 🚀 Applications
│   ├── api/                   # Rust/Axum API Entry
│   ├── web/                   # Next.js Web Application
│   ├── desktop/               # Tauri Desktop App
│   ├── mobile/                # Expo / React Native Mobile App
│   ├── cli/                   # Rust CLI (atmos)
│   ├── docs/                  # Documentation Site
│   └── landing/               # Marketing Landing Page
│
├── marketing/                 # 🎬 Creative production and distribution assets
│   ├── creative/              # Source projects, renders, channel exports
│   └── distribution/          # Social copy, launch plans, channel notes
│
├── packages/                  # 📦 Shared JS/TS Packages
│   ├── ui/                    # @workspace/ui (shadcn/ui)
│   ├── shared/                # @atmos/shared (Hooks/Utils)
│   ├── config/                # @atmos/config (TS Config)
│   ├── i18n/                  # @workspace/i18n (Translations)
│   └── relay/                 # Atmos Computer relay + Relay (Workers / D1)
│
├── resources/                 # 📄 Cross-runtime product manifests
│   └── terminal-agents/       # Built-in terminal agent defaults shared by Rust + TS
│
├── docs/                      # 📖 Deep Design & Architecture
└── specs/                     # 📋 Specs (Brainstorm / PRD / TECH / TEST + optional logs)
    ├── AGENTS.md              # Specs conventions — read this before writing a spec
    ├── APP/                   # Atmos application (web/desktop/cli/api) specs
    │   └── APP-NNN_<title>/
    │       ├── BRAINSTORM.md
    │       ├── PRD.md
    │       ├── TECH.md
    │       ├── TEST.md
    │       ├── PROGRESS.md        # Optional implementation handoff
    │       ├── REVIEW.md          # Optional implementation review fixes
    │       └── IMPROVEMENT.md     # Optional post-ship log
    ├── Landing/               # apps/landing specs
    └── Docs/                  # apps/docs specs
```

---

## 🔄 Development Workflow

### Backend Change Flow
`infra` (data/foundation) → `core-engine` (technical capability) → `core-service` (business/application) → `apps/api` (HTTP/WS/relay entry)

### Frontend Change Flow
`packages/ui` (Styles) → `apps/web/src/api` (API Client) → `apps/web` (Feature)

### Mobile Change Flow
`apps/mobile/src/api` (Relay/relay/WS clients) → `apps/mobile/src/stores` (session/UI state) → `apps/mobile/src/features` (Expo UI screens). Fresh-machine native setup lives in [agents/references/mobile/dev-setup.md](agents/references/mobile/dev-setup.md).

### Specs Flow
Every feature that needs planning lives under `specs/<APP|Landing|Docs>/<ZONE>-NNN_<title>/` with four standard planning files: `BRAINSTORM.md` → `PRD.md` → `TECH.md` → `TEST.md`. Optional sibling logs such as `PROGRESS.md`, `REVIEW.md`, and `IMPROVEMENT.md` can track implementation handoff, post-implementation review fixes, and post-ship learnings without becoming requirements sources. The lifecycle is: brainstorm → PRD → TECH → test plan → implementation → test run. Each stage has a dedicated skill in [`.agents/skills/`](.agents/skills/):

- `atmos-specs-brainstorm` — explore problem space, write `BRAINSTORM.md`
- `atmos-specs-prd` — lock WHAT and WHY, write `PRD.md`
- `atmos-specs-tech` — design HOW, write `TECH.md`
- `atmos-specs-test-plan` — author scenario-level plan in `TEST.md`
- `atmos-specs-impl` — ship production code under `crates/` / `apps/` / `packages/`, keep regression gate green
- `atmos-specs-test-run` — write and run the real tests (`cargo test`, `bun test`), append Coverage Status to `TEST.md`
- `atmos-specs-review` — review implemented specs, write/update `REVIEW.md` findings for functional completeness and code quality

Full conventions (zones, naming, the 4-file rule, optional spec logs, review checklist) live in [specs/AGENTS.md](specs/AGENTS.md). Read it before creating or editing a spec.

---

## 🎨 Component Conventions

- **UI Components**: Use `@workspace/ui/components/ui/*` for atomic parts
- **Mobile UI**: Use Expo UI native controls in `apps/mobile` where practical; do not import `@workspace/ui` into mobile.
- **Backend Access**: Each app manages its own `api/client.ts` and `types/api.ts`
- **Rust Services**: Inject `core-service` into `apps/api` via `AppState`; HTTP and browser WebSocket protocols are owned by `apps/api`

---

## 🔌 Transport Rules

**WebSocket-first by default** — This project primarily uses WebSocket-driven flows for chat, session state, streaming updates, and interactive app behavior.

- **Do not add new REST APIs by default** — Check whether the feature should use the existing WebSocket/event channel first
- **REST is the exception** — Use REST only for: startup/bootstrap data, explicit settings persistence, one-off admin actions, or when an existing module is already REST-based
- **Avoid duplicate transports** — Do not build a new REST path for capabilities that should use WebSocket
- **When unsure, prefer extending WS messages** — Extend the existing WebSocket protocol rather than creating parallel REST endpoints
- **Inbound WebSocket lives in `apps/api`** — browser/client WebSocket connection management, auth, message parsing, protocol DTOs, and action routing belong under `apps/api/src/api/ws`; `infra` does not own inbound user transports.

---

## ⌨️ Keyboard Shortcuts & Overlay Focus

Guidelines for implementing keyboard shortcuts, global hotkeys, and overlay focus management.

→ **[Full reference](agents/references/keyboard-shortcuts.md)**

---

## 🚀 Commands

```bash
just                    # List all available commands
bun install             # Install frontend dependencies
just dev-api            # Start API server (writes runtime_manifest.json)
just dev-web            # Start web app
just dev-mobile         # Start Expo mobile dev server
just dev-desktop        # Desktop (rebuilds web static + prepare-sidecar + tauri dev --no-watch)
just test               # Run all tests
just lint               # Run all linters
```

For a fresh iOS/Android mobile environment, follow [agents/references/mobile/dev-setup.md](agents/references/mobile/dev-setup.md) before running native dev builds.

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
- **When implementing any feature, ask the user when uncertain—do not make blind assumptions or speculations.**


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
