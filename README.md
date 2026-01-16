# Vibe Habitat

Deepmind-style AI-first Workspace.

## Overview

Vibe Habitat is a modern, AI-integrated workspace ecosystem designed for maximum productivity and developer experience. It adopts a monorepo structure combining high-performance Rust backend services with a cutting-edge Next.js frontend and Tauri-based desktop application.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) (Frontend Package Manager)
- [Rust](https://www.rust-lang.org/) (Backend / CLI)
- [Just](https://github.com/casey/just) (Command Runner)

### Installation

```bash
# Install dependencies
bun install
```

### Development

```bash
# Start Web App
just dev-web

# Start API Server
just dev-api

# Run CLI
just dev-cli

# Build All
just build-all
```

For more available commands, run `just`.

## 📚 Documentation

- [Development Guide](docs/development.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## 🏗 Structure

This project follows a Monorepo structure:

- `apps/`: Applications (Web, Desktop, CLI, API)
- `packages/`: Shared frontend packages (UI, Logic, Config)
- `crates/`: Shared Rust crates
- `docs/`: Developer documentation
- `specs/`: Product and Technical specifications

See [docs/architecture.md](docs/architecture.md) for details.
