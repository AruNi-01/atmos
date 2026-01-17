# Applications Directory - AGENTS.md

> **🚀 Application Entry Points**: This directory contains all user-facing applications.

---

## 📁 Application List

| App | Tech Stack | Responsibility | Documentation |
|-----|------------|----------------|---------------|
| **api** | Rust (Axum) | Backend logic & WS entry | [api/AGENTS.md](api/AGENTS.md) |
| **web** | Next.js 16 | Main web workspace | [web/AGENTS.md](web/AGENTS.md) |
| **desktop** | Tauri 2.0 | Cross-platform desktop app | [desktop/AGENTS.md](desktop/AGENTS.md) |
| **cli** | Rust (clap) | `vh` command line tool | [cli/AGENTS.md](cli/AGENTS.md) |
| **landing** | Next.js 16 | Marketing site | [landing/README.md](landing/README.md) |

---

## 🛠 Standard Flow for New Apps

When creating a new frontend application:
1. **Init**: Create Next.js project.
2. **Link UI**: Add `@workspace/ui` to dependencies.
3. **Config**: Map paths in `tsconfig.json`.

---

## 🚦 Architecture Rule
- Apps are **consumers**. They should contain minimal business logic.
- Backend logic → `crates/core-service`
- Frontend logic → `packages/shared` or app-specific libs.
