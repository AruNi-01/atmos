# Coding Conventions

**Analysis Date:** 2026-01-30

## Naming Patterns

**Files:**
- **TypeScript/TSX:** `kebab-case.ts` or `kebab-case.tsx`
  - Components: `PascalCase.tsx` (e.g., `PanelLayout.tsx`, `Header.tsx`)
  - Utilities: `kebab-case.ts` (e.g., `format-time.ts`, `use-terminal-websocket.ts`)
  - Hooks: `use-*` prefix (e.g., `useAppStorage`, `useGitInfoStore`)
  - Types: `types.ts` for centralized type definitions
- **Rust:** `snake_case.rs`
  - Modules: `snake_case.rs` or `mod.rs` for module roots
  - Tests: `tests.rs` or inline `#[cfg(test)]` modules

**Functions:**
- **TypeScript:** `camelCase` for all functions and methods
- **Rust:** `snake_case` for all functions and methods
- **React Components:** `PascalCase` (e.g., `PanelLayout`, `ResizeHandle`)
- **Custom Hooks:** `use` prefix with `camelCase` (e.g., `useTerminalWebSocket`)

**Variables:**
- **TypeScript:** `camelCase`
  - Constants: `UPPER_SNAKE_CASE` for true constants
  - React state: `is` prefix for booleans (e.g., `isLeftCollapsed`, `isDragging`)
- **Rust:** `snake_case`
  - Constants: `UPPER_SNAKE_CASE`

**Types/Interfaces:**
- **TypeScript:** `PascalCase` for interfaces and types
  - Props interfaces: `ComponentNameProps` (e.g., `PanelLayoutProps`)
  - Return types: `ComponentNameReturn` (e.g., `UseTerminalWebSocketReturn`)
- **Rust:** `PascalCase` for structs, enums, and type aliases

## Code Style

**Formatting:**
- **Frontend:** ESLint with Next.js config (`eslint-config-next`)
  - Config files: `apps/web/eslint.config.mjs`, `apps/landing/eslint.config.mjs`, `apps/docs/eslint.config.mjs`
  - No Prettier config detected - likely using ESLint's built-in formatting or defaults
- **Backend:** `rustfmt` (Rust standard)
  - Run via: `cargo fmt` (see `justfile` line 96)
  - Check without modifying: `cargo fmt --all --check` (line 101)

**Linting:**
- **Frontend:** ESLint with Next.js preset
  - Core Web Vitals rules enabled
  - TypeScript rules enabled (`eslint-config-next/typescript`)
  - Run via: `bun lint` or `just lint` (line 90)
- **Backend:** Clippy
  - Run via: `cargo clippy --workspace` (line 91)
  - Combined check: `just lint` runs both

## Import Organization

**Order:**
1. React and core framework imports (`import React from "react"`)
2. Third-party library imports (grouped alphabetically)
3. Workspace package imports (`@workspace/ui`, `@atmos/shared`)
4. Local imports with `@/` alias
5. Relative imports

**Path Aliases:**
- `@/*` → `./src/*` (app-specific, e.g., in `apps/web/tsconfig.json`)
- `@workspace/ui` → `../../packages/ui/src` (shared UI components)
- `@workspace/ui/*` → `../../packages/ui/src/*` (nested exports)

**Example from `apps/web/src/components/layout/PanelLayout.tsx`:**
```typescript
"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
  ChevronLeft,
  ChevronRight,
} from "@workspace/ui";
import { cn } from "@/lib/utils";
import { useAppStorage } from "@atmos/shared";
```

## Error Handling

**TypeScript:**
- Use optional chaining and nullish coalescing
- Toast notifications for user-facing errors (via `toastManager` from `@workspace/ui`)
- Console logging with context for debugging

**Pattern from `apps/web/src/components/layout/Header.tsx`:**
```typescript
try {
  const result = await gitApi.renameBranch(/* ... */);
  if (result.success) {
    toastManager.add({
      title: 'Branch Renamed',
      description: `Renamed branch to ${newBranch}`,
      type: 'success'
    });
  }
} catch (error: any) {
  console.error('Failed to rename branch:', error);
  toastManager.add({
    title: 'Rename Failed',
    description: error.message || 'Unknown error',
    type: 'error'
  });
}
```

**Rust:**
- Three-tier error hierarchy:
  1. `InfraError` - Infrastructure layer (`crates/infra/src/error.rs`)
  2. `EngineError` - Engine/capability layer (`crates/core-engine/src/error.rs`)
  3. `ServiceError` - Business logic layer (`crates/core-service/src/error.rs`)
- Use `thiserror` for error derivation
- Type alias `Result<T>` for crate-specific results
- `anyhow::Error` for application-level errors (service layer)

**Pattern from `crates/infra/src/error.rs`:**
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum InfraError {
    #[error("Database error: {0}")]
    Database(#[from] sea_orm::DbErr),

    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("{0}")]
    Custom(String),
}

pub type Result<T> = std::result::Result<T, InfraError>;
```

**Propagation:**
- Use `?` operator for idiomatic error propagation
- Use `.map_err()` to convert errors between layers
- Use `#[from]` attribute for automatic error conversion

## Logging

**Framework:**
- **Frontend:** `console` methods (no structured logging framework detected)
- **Backend:** `tracing` crate (Rust standard for structured logging)

**Patterns:**
- **Frontend:**
  - `console.error()` for error conditions with context
  - No centralized logging detected
- **Backend:**
  - `debug!()` for detailed debugging information
  - `info!()` for important events
  - `warn!()` for warning conditions
  - `error!()` for error conditions

**Example from `crates/core-service/src/service/terminal.rs`:**
```rust
use tracing::{debug, info, warn, error};

info!("Creating terminal session: {} for workspace: {}", session_id, workspace_id);
debug!("Existing windows for session '{}': {:?}", tmux_session, existing_names);
warn!("Failed to resize tmux pane: {}", e);
error!("PTY initialization failed");
```

## Comments

**When to Comment:**
- Module-level documentation (Rust: `//!`, TS: JSDoc)
- Complex algorithms or business logic
- TODO markers for future work
- Public API documentation

**JSDoc/TSDoc:**
- Used sparingly in observed code
- Component props documented via TypeScript interfaces
- Function parameters inferred from types

**Rust Documentation:**
- Module-level doc comments on most files
- Example from `crates/infra/src/websocket/handler.rs`:
```rust
//! WebSocket message handler - processes incoming messages.
//!
//! This module handles ping/pong and defines traits for business message handling.
//! Business logic is injected from upper layers (core-service), not called directly.
```

**TODO Comments:**
- Used for future implementations
- Found in:
  - `crates/infra/src/cache/mod.rs` - "TODO: Implement caching infrastructure"
  - `crates/infra/src/queue/mod.rs` - "TODO: Implement message queue infrastructure"
  - `crates/infra/src/jobs/mod.rs` - "TODO: Implement background job infrastructure"
  - `crates/core-service/src/service/ws_message.rs` - "TODO: Add name and sidebar_order update support"
  - `apps/web/src/components/layout/QuickOpen.tsx` - "TODO: Implement backend API to open app with path"

## Function Design

**Size:**
- No strict line limit observed
- Functions should be focused on single responsibility
- Large functions (>100 lines) exist for complex operations (e.g., `run_pty_session_with_tmux` at 185 lines)

**Parameters:**
- Prefer parameter objects for >3 parameters
- TypeScript: Use interfaces for complex parameters
- Rust: Use structs for configuration

**Example from `apps/web/src/components/terminal/use-terminal-websocket.ts`:**
```typescript
interface UseTerminalWebSocketOptions {
  url: string;
  sessionId: string;
  onOutput: (data: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onAttached?: (history?: string) => void;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  workspaceId?: string;
}
```

**Return Values:**
- TypeScript: Typed return interfaces for complex returns
- Rust: `Result<T>` for fallible operations, tuples for multiple values

## Module Design

**Exports:**
- **TypeScript:** Named exports preferred over default exports
- **Rust:** Explicit `pub use` re-exports in `lib.rs` for public API

**Barrel Files:**
- `index.ts` files for aggregating exports
- Example: `packages/ui/src/index.ts` exports UI components
- Example: `apps/web/src/components/terminal/index.ts`

**Rust Module Pattern:**
```rust
// lib.rs - re-export public API
pub mod cache;
pub mod db;
pub mod websocket;

pub use db::{DbConnection, Migrator, TestMessageRepo};
pub use websocket::{WsManager, WsMessage, WsService};
```

**TypeScript Workspace Pattern:**
- Shared packages export from `src/index.ts`
- Apps import via workspace alias: `@workspace/ui`

## React-Specific Conventions

**Component Structure:**
```typescript
"use client";  // Directive for client components (Next.js App Router)

import React, { useState, useEffect } from "react";
// ... imports

interface ComponentNameProps {
  // ... props
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // Hooks first
  const [state, setState] = useState();

  // Effects
  useEffect(() => {
    // ...
  }, []);

  // Event handlers
  const handleClick = () => {
    // ...
  };

  // Render
  return (
    // JSX
  );
}
```

**State Management:**
- Use `useState` for local component state
- Use Zustand stores for global state (`@atmos/shared`)
- Boolean state prefixed with `is`: `isLeftCollapsed`, `isDragging`

**Styling:**
- Tailwind CSS utility classes
- `cn()` utility for conditional class merging
- Component variants via `class-variance-authority` (CVA)

**Example from `packages/ui/src/components/ui/button.tsx`:**
```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        // ...
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        // ...
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

## Async Patterns

**TypeScript:**
- Async/await preferred over promises
- Proper error handling with try-catch
- Cleanup in useEffect returns

**Rust:**
- `async fn` for async functions
- `.await` for async operations
- Tokio runtime for async execution
- Channel-based communication for concurrent operations

## File Organization

**Rust Crate Structure:**
```
crate-name/
├── src/
│   ├── lib.rs           # Public API exports
│   ├── mod.rs           # Module declarations (if nested)
│   ├── error.rs         # Error types
│   ├── entities/        # Data models
│   ├── repo/            # Repository pattern
│   └── service/         # Business logic
└── Cargo.toml
```

**TypeScript App Structure:**
```
app-name/
├── src/
│   ├── app/             # Next.js App Router
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities
│   ├── types/           # Type definitions
│   └── api/             # API clients
└── package.json
```

---

*Convention analysis: 2026-01-30*
