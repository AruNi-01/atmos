# Technology Stack

**Analysis Date:** 2026-01-30

## Languages

**Primary:**
- Rust 2021 Edition - Backend services, API server, CLI tool, desktop app (Tauri)
- TypeScript 5.x - Frontend applications and shared packages

**Secondary:**
- JavaScript (via TypeScript compilation) - Runtime for web applications

## Runtime

**Environment:**
- Node.js 20+ (via `@types/node": "^20"`)
- Bun - Frontend package manager and runtime

**Package Manager:**
- Bun (bun.lockb present) - Monorepo workspace management
- Cargo (Cargo.lock present) - Rust workspace management

**Lockfiles:**
- Frontend: bun.lockb (present)
- Backend: Cargo.lock (present)

## Frameworks

**Core:**

**Backend (Rust):**
- Axum 0.8 - HTTP/WebSocket server framework (`apps/api/Cargo.toml`)
- Tokio 1.0 - Async runtime (full features enabled)
- Sea-ORM 1.1 - Database ORM with SQLite backend
- Portable-PTY 0.9.0 - PTY process management for terminal emulation

**Frontend (TypeScript/React):**
- Next.js 16.1.2 - React framework for web app, landing page, and docs
- React 19.2.3 - UI library
- React DOM 19.2.3 - DOM rendering
- Tauri - Desktop application framework (references in justfile, commented in workspace)

**Testing:**
- Rust: Built-in `#[test]` and `tokio::test` attributes
- No JavaScript testing framework detected (no test files found)

**Build/Dev:**
- Just (justfile) - Task runner for cross-language build commands
- Next.js built-in compiler - Frontend bundling
- Cargo - Rust compilation and building

## Key Dependencies

**Critical:**

**Backend Infrastructure:**
- `sea-orm` 1.1 (sqlx-sqlite feature) - Database layer with SQLite
- `tokio-tungstenite` 0.28.0 - WebSocket client/server
- `tower` 0.5 - HTTP middleware stack
- `tower-http` 0.6 - HTTP utilities (CORS, tracing)
- `serde` 1.0 - Serialization/deserialization
- `serde_json` 1.0 - JSON handling
- `uuid` 1.0 - UUID generation

**Backend Utilities:**
- `tracing` 0.1 - Structured logging
- `tracing-subscriber` 0.3 - Log filtering and formatting
- `thiserror` 2.0 - Error handling
- `async-trait` 0.1 - Async trait support
- `chrono` 0.4 - Date/time handling
- `dirs` 6.0 / 5.0 - Cross-platform path resolution

**Frontend Core:**
- `next-intl` 4.7.0 - Internationalization (i18n)
- `next-themes` 0.4.6 - Theme management
- `zustand` 5.0.10 - State management
- `@monaco-editor/react` 4.7.0 - Code editor component
- `@xterm/xterm` 6.0.0 - Terminal emulator

**Frontend UI:**
- `@workspace/ui` (internal) - Shared UI components based on shadcn/ui
- `lucide-react` 0.562.0 - Icon library
- `@radix-ui/*` - Headless UI components (dialog, dropdown, checkbox, etc.)
- `@dnd-kit/*` - Drag and drop functionality
- `tailwindcss` 4 - CSS framework
- `tailwind-merge` 3.4.0 - Tailwind class merging
- `react-resizable-panels` 2.1.7 - Resizable layout panels

**Frontend Utilities:**
- `@headless-tree/*` 1.6.2 - Tree view components
- `@pierre/diffs` 1.0.7 - Diff visualization
- `react-mosaic-component` 6.1.1 - Mosaic/tiled layout
- `react-hotkeys-hook` 5.2.3 - Keyboard shortcuts
- `react-markdown` 10.1.0 - Markdown rendering
- `remark-gfm` 4.0.1 - GitHub Flavored Markdown

**Infrastructure:**
- `clap` 4.0 (derive feature) - CLI argument parsing (workspace dependency)
- `futures-util` 0.3 - Async utilities

**Documentation:**
- `fumadocs-core` 16.4.7 - Documentation framework
- `fumadocs-mdx` 14.2.5 - MDX processing
- `fumadocs-ui` 16.4.7 - Documentation UI components

## Configuration

**Environment:**
- No .env files detected in repository
- Environment-based configuration via `tracing_subscriber::EnvFilter::try_from_default_env()`
- Default logging: `api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug`

**Build:**
- `justfile` - Cross-language task automation (Just task runner)
- Next.js config: `apps/web/next.config.ts`, `apps/landing/next.config.ts`, `apps/docs/next.config.mjs`
- TypeScript configs: Monorepo-wide tsconfig in `packages/config/typescript/nextjs.json`
- Tailwind CSS 4 config via PostCSS (`@tailwindcss/postcss`)

**Monorepo:**
- Bun workspaces (`package.json` root: `"workspaces": ["apps/*", "packages/*"]`)
- Cargo workspace (`Cargo.toml` root: `members = ["apps/api", "crates/*"]`)

**Path Aliases (TypeScript):**
- `@/*` → `./src/*` (app-specific)
- `@workspace/ui` → `../../packages/ui/src/index.ts`
- `@workspace/ui/*` → `../../packages/ui/src/*`

## Platform Requirements

**Development:**
- Rust toolchain (latest stable)
- Bun runtime
- Node.js 20+
- Just task runner (`brew install just` or `cargo install just`)
- Git CLI (for git worktree operations)

**Production:**
- API Server: `0.0.0.0:8080` (hardcoded in `apps/api/src/main.rs`)
- Database: SQLite (local filesystem at `~/.atmos/db/atmos.db`)
- No cloud services required (self-contained architecture)

**Build Targets:**
- Web: Next.js static/dynamic hosting
- API: Rust binary (Linux/macOS/Windows)
- Desktop: Tauri app (not currently in workspace build)
- CLI: Rust binary (not currently in workspace build)

---

*Stack analysis: 2026-01-30*
