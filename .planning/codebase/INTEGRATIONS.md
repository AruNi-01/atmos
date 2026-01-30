# External Integrations

**Analysis Date:** 2026-01-30

## APIs & External Services

**Version Control:**
- Git CLI - Native git operations via std::process::Command
  - Implementation: Direct command execution in `crates/core-engine/src/git/mod.rs`
  - Operations: worktree creation/removal, status, commit, push, pull, fetch, branching, staging
  - No SDK used - shell commands to system git binary

**Terminal Emulation:**
- PTY (Pseudo-Terminal) - Portable PTY library
  - Package: `portable-pty` 0.9.0
  - Location: `crates/core-service/Cargo.toml`
  - Used for: Terminal session management in workspaces

**Editor:**
- Monaco Editor - VS Code editor component
  - Package: `@monaco-editor/react` 4.7.0
  - Location: `apps/web/package.json`
  - Used for: In-browser code editing

## Data Storage

**Databases:**
- SQLite (via Sea-ORM + SQLx)
  - Connection: `sqlite://~/.atmos/db/atmos.db?mode=rwc`
  - Client: Sea-ORM 1.1 (sqlx-sqlite feature)
  - ORM: Sea-ORM with migrations
  - Implementation: `crates/infra/src/db/connection.rs`
  - Entities: Workspace, Project, TestMessage
  - Migrations: `crates/infra/src/db/migration/`

**File Storage:**
- Local filesystem only
  - Workspaces: `~/.atmos/workspaces/{workspace_name}`
  - Database: `~/.atmos/db/atmos.db`
  - Implementation: Rust std::fs and dirs crate

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom/None
  - No external auth providers detected
  - No OAuth, JWT, or session management libraries found
  - Application appears to be local/desktop-focused without user accounts

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Bugsnag, or similar detected)

**Logs:**
- Structured logging via `tracing` crate
  - Framework: tracing 0.1, tracing-subscriber 0.3
  - Configuration: Env-based filter with debug defaults
  - Implementation: `apps/api/src/main.rs`
  - No external log aggregation (local console output only)

## CI/CD & Deployment

**Hosting:**
- Not detected (no Vercel, Netlify, AWS configs found)
- Local development focus (Just task runner for builds)

**CI Pipeline:**
- None detected (no .github/workflows, no GitLab CI, no Jenkins files)
- Just provides `ci` command for local validation: `just ci` (runs lint, test, build-all)

## Environment Configuration

**Required env vars:**
- `RUST_LOG` - Optional, for overriding default log levels
  - Default fallback: `api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug`
- No database connection strings (hardcoded local path)
- No API keys detected
- No external service credentials

**Secrets location:**
- No secrets management detected
- No .env files in repository
- All configuration appears to be code-based or local filesystem

## Webhooks & Callbacks

**Incoming:**
- WebSocket endpoints only
  - Path: `/ws` (inferred from Axum WebSocket setup)
  - Implementation: `apps/api/src/api/`, `crates/infra/src/websocket/`
  - No REST API endpoints documented in integrations

**Outgoing:**
- None detected
  - No external HTTP client libraries for webhooks
  - No third-party API integrations

## Internal Services

**WebSocket Communication:**
- Custom WebSocket implementation
  - Server: Axum with ws feature
  - Client: Browser WebSocket API via `apps/web/src/hooks/use-websocket.ts`
  - Protocol: Custom JSON message format defined in `crates/infra/src/websocket/message.rs`
  - Features: Heartbeat monitoring (10s interval), connection timeout (30s)

**Database Migrations:**
- Sea-ORM Migrations
  - Runner: `Migrator::up()` in `apps/api/src/main.rs`
  - Location: `crates/infra/src/db/migration/`
  - Auto-applied on API server startup

**Git Operations:**
- Shell command execution
  - Git binary must be available in system PATH
  - Workspaces managed as git worktrees
  - Operations include: status, commit, push, pull, fetch, branching

## Third-Party UI Components

**Component Libraries:**
- shadcn/ui (via `@workspace/ui`)
  - Base: Radix UI primitives
  - Styling: Tailwind CSS
  - Location: `packages/ui/src/components/ui/`

**Specialized Components:**
- `@xterm/*` - Terminal emulator with WebGL, fit, search, web-links addons
- `@headless-tree/*` - File tree visualization
- `@pierre/diffs` - Diff display
- `react-mosaic-component` - Tiled panel layout

---

*Integration audit: 2026-01-30*
