# Architecture Design

## Overview

Vibe Habitat uses a Monorepo architecture to manage full-stack capabilities efficiently.

## Directory Structure

```text
vibe-habitat/
├── apps/                       # Applications
│   ├── web/                    # Next.js Web App
│   ├── desktop/                # Tauri Desktop App
│   ├── cli/                    # Rust CLI Tool
│   ├── api/                    # Rust Backend API
│   ├── docs/                   # Documentation Site
│   └── landing/                # Landing Page
├── packages/                   # Shared Frontend Packages
│   ├── ui/                     # Shadcn/UI Components
│   ├── shared/                 # Shared Utilities (TS)
│   └── config/                 # Shared Configurations
├── crates/                     # Shared Rust Crates
│   ├── common/                 # Business Logic
│   ├── db/                     # Database Interactions
│   └── models/                 # Data Models
└── docs/                       # Developer Documentation
```

## Tech Stack

- **Frontend Core**: Next.js 16, React 19, Tailwind CSS 4.
- **Desktop**: Tauri (Rust + Web Frontend).
- **Backend/CLI**: Rust (Axum/Actix for API, Clap for CLI).
- **Package Management**: Bun (JS/TS), Cargo (Rust).

## Dependencies

- Frontend apps (`apps/web`, `apps/desktop`) depend on `packages/ui` and `packages/shared`.
- Rust apps (`apps/api`, `apps/cli`) depend on `crates/models`, `crates/db`, `crates/common`.

## Key Decisions

See [ADR](adr/) folder for detailed architectural decision records.
