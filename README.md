# ATMOS

**Deepmind-style AI-first Workspace Ecosystem** | Next.js 16 + React 19 + Rust + Tauri

---

## 🏗 System Architecture (Monorepo)

Following the **L1 -> L2 -> L3 -> App** layered design:

### 🦀 Backend (Rust)
*   **[L1: Infrastructure](crates/infra/)**: Database (SeaORM), WebSocket Engine, Cache, Jobs.
*   **[L2: Core Engine](crates/core-engine/)**: Technical capabilities (PTY, Git, FS Watcher, Tmux).
*   **[L3: Core Service](crates/core-service/)**: Business logic and domain rules.
*   **[Agent Integration](crates/agent/)**: ACP client, agent management, external service integration (independent vertical module).
*   **[App: API](apps/api/)**: Axum HTTP/WS entry point.

### 🚀 Frontend & Shared
*   **[web](apps/web/)**: Next.js 16 web application.
*   **[desktop](apps/desktop/)**: Tauri 2.0 cross-platform app.
*   **[ui](packages/ui/)**: Shared shadcn/ui components (@workspace/ui).
*   **[shared](packages/shared/)**: Shared utils & hooks (@atmos/shared).

---

## ⚡ Quick Start

### Prerequisites
- [Bun](https://bun.sh) (Frontend manager)
- [Rust](https://www.rust-lang.org/) (Backend runtime)
- [Just](https://github.com/casey/just) (Task runner)

### Installation
```bash
bun install
```

### Development
```bash
just dev-web    # Start Web UI
just dev-api    # Start Backend API
just dev-cli    # Run CLI tool
```

---

## 📚 Navigation for AI Agents
Please refer to **[AGENTS.md](./AGENTS.md)** for a 60-second architecture overview and deep-dive routing.

---

## 📝 Document Hierarchy
- **[specs/](./specs/)**: PRDs and Technical Specifications.
- **[docs/](./docs/)**: High-level design and Architecture Decision Records (ADR).
- **[crates/*/README.md](./crates/)**: Specific documentation for each backend layer.
