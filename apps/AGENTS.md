# Applications Directory - AGENTS.md

> **🚀 Application Entry Points**: User-facing applications.

---

## 📁 Application List

| App | Tech Stack | Documentation |
|-----|------------|---------------|
| **api** | Rust (Axum) | [api/AGENTS.md](api/AGENTS.md) |
| **web** | Next.js 16 | [web/AGENTS.md](web/AGENTS.md) |
| **desktop** | Tauri 2.0 | [desktop/AGENTS.md](desktop/AGENTS.md) |
| **cli** | Rust (clap) | [cli/AGENTS.md](cli/AGENTS.md) |
| **docs** | Next.js + Fumadocs | [docs/AGENTS.md](docs/AGENTS.md) |
| **landing** | Next.js 16 | [landing/AGENTS.md](landing/AGENTS.md) |

---

## 🛠 Standard Flow for New Apps

1. **Init**: Create Next.js project
2. **Link UI**: Add `@workspace/ui` to dependencies
3. **Config**: Map paths in `tsconfig.json`

---

## Safety Rails

### NEVER
- Put business logic in apps — Backend logic goes in `crates/core-service`, frontend shared logic in `packages/shared`

### ALWAYS
- Consume dependencies via `workspace:*` protocol
- Keep apps thin — they are consumers, not libraries

---

## Commands

```bash
bun install             # Install all app dependencies
just dev-web            # Start web app
just dev-api            # Start API server
just dev-desktop        # Start desktop app
just dev-landing        # Start landing page
just dev-docs           # Start docs site
just test               # Run all tests
just lint               # Run all linters
```
