# Codebase Structure

**Analysis Date:** 2026-01-30

## Directory Layout

```
atmos/
├── crates/                          # 🦀 Rust workspace (shared backend libraries)
│   ├── infra/                       # L1: Infrastructure layer
│   │   └── src/
│   │       ├── db/                  # Database entities, migrations, repos
│   │       ├── websocket/           # WebSocket framework, message protocol
│   │       ├── cache/               # Caching abstraction (placeholder)
│   │       ├── queue/               # Job queue (placeholder)
│   │       └── jobs/                # Background jobs (placeholder)
│   ├── core-engine/                 # L2: Technical capabilities
│   │   └── src/
│   │       ├── fs/                  # File system operations
│   │       ├── git/                 # Git operations
│   │       ├── tmux/                # Tmux session management
│   │       ├── pty/                 # PTY operations (placeholder)
│   │       └── test_engine.rs       # Testing framework
│   └── core-service/                # L3: Business logic
│       └── src/
│           ├── service/             # Business service implementations
│           ├── error.rs             # Service error types
│           └── types/               # Shared types
│
├── apps/                            # 🚀 Applications (Rust + TypeScript)
│   ├── api/                         # Rust API server (Axum)
│   │   └── src/
│   │       ├── api/                 # HTTP/WebSocket route handlers
│   │       │   ├── dto.rs           # Shared DTOs
│   │       │   ├── project/         # Project routes
│   │       │   ├── workspace/       # Workspace routes
│   │       │   ├── terminal/        # Terminal WebSocket
│   │       │   └── ws/              # General WebSocket handler
│   │       ├── middleware/          # Auth, logging, etc.
│   │       ├── config/              # Environment config
│   │       ├── app_state.rs         # DI container
│   │       └── main.rs              # Entry point
│   ├── web/                         # Next.js web application
│   │   └── src/
│   │       ├── app/[locale]/        # Localized routes
│   │       ├── components/          # React components
│   │       │   ├── layout/          # Layout components (Header, Sidebar)
│   │       │   ├── terminal/        # Terminal UI
│   │       │   ├── editor/          # Monaco editor wrapper
│   │       │   ├── dialogs/         # Modal dialogs
│   │       │   ├── providers/       # Context providers
│   │       │   └── files/           # File tree component
│   │       ├── hooks/               # Custom React hooks
│   │       ├── api/                 # API client functions
│   │       ├── types/               # TypeScript types
│   │       ├── utils/               # Utility functions
│   │       └── constants/           # App constants
│   ├── cli/                         # Rust CLI tool
│   ├── desktop/                     # Tauri desktop app
│   ├── docs/                        # Documentation site (Astro)
│   └── landing/                     # Marketing landing page (Next.js)
│
├── packages/                        # 📦 Shared TypeScript packages
│   ├── ui/                          # @workspace/ui (shadcn/ui components)
│   │   └── src/
│   │       ├── components/ui/       # shadcn/ui primitives
│   │       ├── components/websocket/
│   │       ├── components/animate/
│   │       ├── lib/                 # Utility functions
│   │       └── assets/              # Icons, file icons
│   ├── shared/                      # @workspace/shared (Hooks & utils)
│   │   └── src/
│   │       ├── hooks/               # Shared React hooks
│   │       └── utils/               # Shared utilities
│   ├── config/                      # @workspace/config (ESLint, TypeScript)
│   │   └── typescript/              # Shared TSConfig
│   └── i18n/                        # @workspace/i18n (Translations)
│       └── src/                     # Locale files (en, zh)
│
├── docs/                            # 📖 Architecture & design docs
│   ├── adr/                         # Architecture Decision Records
│   ├── architecture/                # Architecture diagrams
│   ├── development/                 # Development guides
│   ├── frontend_impl_eg/            # Frontend implementation examples
│   └── agent_changelog/             # AI agent changelog
│
├── specs/                           # 📋 Product & technical specs
│   ├── prd/                         # Product requirements
│   ├── design/                      # Design specifications
│   └── tech/                        # Technical plans
│
├── justfile                         # Just commands (task runner)
├── Cargo.toml                       # Rust workspace config
└── package.json                     # Bun workspace config
```

## Directory Purposes

**crates/infra:**
- Purpose: Foundation for all backend services - database, WebSocket, low-level utilities
- Contains: Database layer (entities, migrations, repos), WebSocket message protocol, connection management
- Key files: `crates/infra/src/db/mod.rs`, `crates/infra/src/websocket/mod.rs`, `crates/infra/src/lib.rs`

**crates/core-engine:**
- Purpose: Technology-agnostic wrappers for system capabilities (files, git, tmux)
- Contains: Engine implementations that shell out to CLI tools or use system APIs
- Key files: `crates/core-engine/src/fs/mod.rs`, `crates/core-engine/src/git/mod.rs`, `crates/core-engine/src/tmux/mod.rs`

**crates/core-service:**
- Purpose: Business logic layer - orchestrates engines and repositories to implement features
- Contains: Service implementations for projects, workspaces, terminals, testing
- Key files: `crates/core-service/src/service/mod.rs`, `crates/core-service/src/service/project.rs`, `crates/core-service/src/service/terminal.rs`

**apps/api:**
- Purpose: Entry point for all backend functionality - HTTP and WebSocket server
- Contains: Route handlers, DTOs, middleware, dependency injection setup
- Key files: `apps/api/src/main.rs`, `apps/api/src/app_state.rs`, `apps/api/src/api/mod.rs`

**apps/web:**
- Purpose: Main web application - user interface for all features
- Contains: Next.js app with app router, React components, hooks, API clients
- Key files: `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/hooks/use-websocket.ts`, `apps/web/src/api/ws-api.ts`

**packages/ui:**
- Purpose: Shared UI component library based on shadcn/ui
- Contains: Reusable components, animations, WebSocket components, file icons
- Key files: `packages/ui/src/components/ui/`, `packages/ui/src/lib.ts`

**packages/shared:**
- Purpose: Shared TypeScript utilities and hooks for all frontend apps
- Contains: Custom hooks, utility functions
- Key files: `packages/shared/src/hooks/`, `packages/shared/src/utils/`

**packages/i18n:**
- Purpose: Internationalization support - translations and locale configuration
- Contains: Translation files for English and Chinese
- Key files: `packages/i18n/src/locales/`

## Key File Locations

**Entry Points:**
- `apps/api/src/main.rs`: API server startup
- `apps/web/src/app/[locale]/page.tsx`: Web app home page
- `apps/cli/src/main.rs`: CLI tool entry point

**Configuration:**
- `Cargo.toml`: Rust workspace definition
- `package.json`: Bun workspace definition and scripts
- `justfile`: Development commands (dev, build, test, etc.)
- `apps/api/src/config/`: API-specific configuration

**Core Logic - Backend:**
- `crates/core-service/src/service/`: All business services
- `crates/core-engine/src/`: Engine implementations
- `crates/infra/src/db/repo/`: Database repositories

**Core Logic - Frontend:**
- `apps/web/src/components/`: React components organized by feature
- `apps/web/src/hooks/`: Custom hooks (WebSocket, terminal, editor stores)
- `apps/web/src/api/`: API client functions (REST and WebSocket)

**Testing:**
- `crates/*/src/**/tests.rs` or `tests/` modules: Rust unit tests
- Backend tests run via `cargo test`
- Frontend tests would be in `apps/web/src/__tests__/` (not yet detected)

## Naming Conventions

**Files:**
- Rust: `snake_case.rs` (e.g., `app_state.rs`, `ws_message.rs`)
- TypeScript: `kebab-case.ts` or `camelCase.ts` (e.g., `use-websocket.ts`, `rest-api.ts`)
- Components: `PascalCase.tsx` (e.g., `Terminal.tsx`, `FileTree.tsx`)

**Directories:**
- Lowercase with hyphens for multi-word: `core-engine`, `core-service`
- Feature-based grouping: `components/terminal/`, `api/workspace/`

**Rust Crates:**
- Hyphenated names: `core-engine`, `core-service`
- Library files: `lib.rs` in each crate `src/` directory

**TypeScript/JavaScript:**
- Files use `.ts` extension, React components use `.tsx`
- Test files use `.test.ts` or `.spec.ts` (not yet extensively used)

## Where to Add New Code

**New Backend Feature (e.g., new entity type):**
- Database layer: `crates/infra/src/db/entities/[entity].rs`
- Repository: `crates/infra/src/db/repo/[entity]_repo.rs`
- Service: `crates/core-service/src/service/[feature].rs`
- API routes: `apps/api/src/api/[feature]/`
- Re-export: Update `crates/*/src/lib.rs` as needed

**New Frontend Feature:**
- Components: `apps/web/src/components/[feature]/`
- Hooks: `apps/web/src/hooks/use-[feature].ts`
- API client: `apps/web/src/api/[feature]-api.ts`
- Types: `apps/web/src/types/types.ts` or dedicated types file

**New Shared UI Component:**
- Implementation: `packages/ui/src/components/ui/[component].tsx`
- Export: `packages/ui/src/lib.ts`

**New Utility/Hook:**
- Utilities: `packages/shared/src/utils/[name].ts`
- Hooks: `packages/shared/src/hooks/use-[name].ts`

## Special Directories

**target/:**
- Purpose: Rust build output (compiled binaries, libraries)
- Generated: Yes
- Committed: No (gitignored)

**node_modules/:**
- Purpose: npm/Bun dependency installation
- Generated: Yes
- Committed: No (gitignored)

**.next/ (in apps/web, apps/landing):**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (gitignored)

**docs/:**
- Purpose: Architecture documentation, design docs, implementation guides
- Generated: No
- Committed: Yes

**specs/:**
- Purpose: Product requirements, technical specifications, design mockups
- Generated: No
- Committed: Yes

**.planning/:**
- Purpose: GSD command planning documents (this file lives here)
- Generated: Yes (by AI agents)
- Committed: Yes (for team visibility)

---

*Structure analysis: 2026-01-30*
