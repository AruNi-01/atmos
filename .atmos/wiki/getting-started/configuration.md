---
title: Configuration Guide
section: getting-started
level: intermediate
reading_time: 8
path: getting-started/configuration
sources:
  - justfile
  - Cargo.toml
  - package.json
  - apps/api/src/config
  - crates/infra/src/db
updated_at: 2026-02-11T12:00:00Z
---

# Configuration Guide

This guide covers configuring ATMOS for development, testing, and production environments. Understanding the configuration system allows you to customize ATMOS to match your workflow and deployment requirements.

## Configuration Overview

ATMOS uses a layered configuration approach that combines environment variables, configuration files, and runtime defaults. This provides flexibility across different environments while maintaining sensible defaults.

```mermaid
graph TD
    CONFIG[Runtime Configuration]

    ENV[Environment Variables]
    FILES[Config Files]
    DEFAULTS[Code Defaults]

    ENV --> CONFIG
    FILES --> CONFIG
    DEFAULTS --> CONFIG

    CONFIG --> API[API Server]
    CONFIG --> WEB[Web App]
    CONFIG --> CLI[CLI Tool]

    style CONFIG fill:#e1f5ff
    style ENV fill:#fff4e1
    style FILES fill:#fff4e1
    style DEFAULTS fill:#f0f0f0
```

## Environment Configuration

### Environment Variables

Create a `.env` file in the project root for local development:

```bash
# Copy example configuration
cp .env.example .env
```

**Essential Variables**

```bash
# API Server Configuration
API_PORT=8080                    # Port for API server
API_HOST=0.0.0.0                # Bind address (0.0.0.0 for all interfaces)
API_CORS_ORIGINS=http://localhost:3000  # Allowed CORS origins

# Database Configuration
DATABASE_URL=sqlite:./data/atmos.db     # SQLite for development
# DATABASE_URL=postgresql://user:pass@localhost/atmos  # PostgreSQL for production

# WebSocket Configuration
WS_PORT=8081                     # WebSocket port
WS_PATH=/ws                      # WebSocket endpoint path

# Application
NODE_ENV=development             # development | production
RUST_LOG=debug                   # Log level: error, warn, info, debug, trace

# Security
JWT_SECRET=your-secret-key-here  # JWT signing secret
SESSION_TIMEOUT=3600             # Session timeout in seconds
```

**Advanced Variables**

```bash
# Performance
WORKER_THREADS=4                 # Number of worker threads
MAX_CONNECTIONS=100              # Max database connections
CONNECTION_TIMEOUT=30            # Connection timeout in seconds

# File System
MAX_FILE_SIZE=10485760          # Max file size in bytes (10MB)
WATCH_DEBOUNCE_MS=300           # File watch debounce in milliseconds

# Terminal
DEFAULT_SHELL=bash               # Default shell: bash, zsh, fish
TMUX_SOCKET_PATH=/tmp/atmos-tmux # Tmux socket path
SESSION_TIMEOUT_SECONDS=3600    # Terminal session timeout

# Cache
CACHE_TTL_SECONDS=300           # Cache time-to-live
CACHE_MAX_SIZE=1000             # Max cache entries
```

### Environment-Specific Configs

**Development (.env.development)**
```bash
NODE_ENV=development
RUST_LOG=debug
API_PORT=8080
DATABASE_URL=sqlite:./data/dev.db
```

**Production (.env.production)**
```bash
NODE_ENV=production
RUST_LOG=info
API_PORT=8080
DATABASE_URL=postgresql://user:pass@localhost/atmos_prod
```

**Testing (.env.test)**
```bash
NODE_ENV=test
RUST_LOG=warn
API_PORT=8081
DATABASE_URL=sqlite::memory:
```

## Rust Configuration

### Cargo Configuration

**Workspace Configuration** (`Cargo.toml`)
```toml
[workspace]
members = [
    "apps/api",
    "crates/*",
]
resolver = "2"

[workspace.dependencies]
# Unified dependency management
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
sea-orm = { version = "1.0", features = ["sqlx-sqlite", "runtime-tokio-rustls"] }
axum = { version = "0.7", features = ["ws"] }
```

*Source: `/Users/username/projects/atmos/Cargo.toml`*

**Cargo Config** (`.cargo/config.toml`)
```toml
[build]
# Use target directory for build artifacts
target-dir = "target"

[net]
# Use git CLI for fetching (more reliable)
git-fetch-with-cli = true

[http]
# Check for updates
check-releases = true

# Source replacement for faster builds
[source.crates-io]
replace-with = 'mirror'

[source.mirror]
registry = "https://mirrors.ustc.edu.cn/crates.io-index"
```

### Release Profiles

**Development Profile** (optimized for compile time)
```toml
[profile.dev]
opt-level = 0          # No optimization
debug = true           # Full debug info
split-debuginfo = "unpacked"  # Faster builds
incremental = true     # Incremental compilation
```

**Release Profile** (optimized for performance)
```toml
[profile.release]
opt-level = 3          # Maximum optimization
lto = true             # Link-time optimization
codegen-units = 1      # Better optimization at cost of compile time
strip = true           # Remove debug symbols
panic = "abort"        # Smaller binaries
```

**Custom Profiles**
```toml
[profile.dev-opt]
inherits = "dev"
opt-level = 1          # Some optimization for faster runtime

[profile.release-debug]
inherits = "release"
debug = true           # Keep debug info in release
strip = false
```

## Frontend Configuration

### Package Configuration

**Workspace Configuration** (`package.json`)
```json
{
  "name": "atmos",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "catalog": {
    "comment": "Unified dependency management",
    "next": "16.1.2",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

*Source: `/Users/username/projects/atmos/package.json`*

### Next.js Configuration

**Web App Config** (`apps/web/next.config.ts`)
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React features
  reactStrictMode: true,
  experimental: {
    reactCompiler: true,
  },

  // Performance
  swcMinify: true,
  compress: true,

  // Output
  output: 'standalone',  // For containerized deployment

  // Images
  images: {
    domains: ['localhost'],
    formats: ['image/avif', 'image/webp'],
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },

  // Environment variables exposed to browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8081',
  },
};

export default nextConfig;
```

### TypeScript Configuration

**TypeScript Config** (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Database Configuration

### SQLite (Development)

**Connection String**
```bash
DATABASE_URL=sqlite:./data/atmos.db?mode=rwc
```

**SeaORM Configuration**
```rust
// crates/infra/src/db/mod.rs
use sea_orm::{Database, DbErr, ConnectionTrait};

pub async fn establish_connection(database_url: &str) -> Result<DatabaseConnection, DbErr> {
    let db = Database::connect(database_url).await?;

    // Run migrations
    MigratorTrait::up(&db, None).await?;

    Ok(db)
}
```

### PostgreSQL (Production)

**Connection String**
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/atmos_prod?schema=public
```

**Connection Pool Configuration**
```rust
use sea_orm::{ConnectOptions, Database};

pub async fn establish_pool(url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut opt = ConnectOptions::new(url.to_string());
    opt.max_connections(100)
       .min_connections(5)
       .connect_timeout(Duration::from_secs(30))
       .idle_timeout(Duration::from_secs(600))
       .max_lifetime(Duration::from_secs(1800))
       .sqlx_logging(true);

    Database::connect(opt).await
}
```

**Migration Configuration**
```rust
// Migration file location
// crates/infra/src/migrations/src/lib.rs
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::<migrations::M20240101_000001_create_users::Migration>::default(),
            Box::<migrations::M20240101_000002_create_projects::Migration>::default(),
            Box::<migrations::M20240101_000003_create_terminals::Migration>::default(),
        ]
    }
}
```

## API Server Configuration

### Axum Server Config

**Server Initialization** (`apps/api/src/main.rs`)
```rust
use axum::{
    routing::{get, post},
    Router,
    http::HeaderMap,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    let config = Config::from_env()?;
    let db = establish_connection(&config.database_url).await?;

    // Build application state
    let app_state = AppState::new(config.clone(), db);

    // Build router
    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/terminals", post(create_terminal))
        .layer(
            CorsLayer::new()
                .allow_origin(config.cors_origins.clone())
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
                .allow_headers(HeaderMap::new())
        )
        .with_state(app_state);

    // Start server
    let listener = TcpListener::bind(format!("{}:{}", config.api_host, config.api_port)).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

**Configuration Struct** (`apps/api/src/config/mod.rs`)
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub api_host: String,
    pub api_port: u16,
    pub database_url: String,
    pub cors_origins: Vec<String>,
    pub jwt_secret: String,
    pub session_timeout_seconds: u64,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Config {
            api_host: env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            api_port: env::var("API_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            database_url: env::var("DATABASE_URL")?,
            cors_origins: env::var("API_CORS_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:3000".to_string())
                .split(',')
                .map(|s| s.to_string())
                .collect(),
            jwt_secret: env::var("JWT_SECRET")?,
            session_timeout_seconds: env::var("SESSION_TIMEOUT")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()?,
        })
    }
}
```

### WebSocket Configuration

**WebSocket Manager** (`crates/infra/src/websocket/manager.rs`)
```rust
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::protocol::Message;

pub struct WebSocketConfig {
    pub host: String,
    pub port: u16,
    pub path: String,
    pub heartbeat_interval: u64,
    pub max_connections: usize,
}

impl Default for WebSocketConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8081,
            path: "/ws".to_string(),
            heartbeat_interval: 30,
            max_connections: 1000,
        }
    }
}
```

## Tmux Configuration

### Tmux Integration

**Tmux Engine Config** (`crates/core-engine/src/tmux/config.rs`)
```rust
pub struct TmuxConfig {
    pub socket_path: Option<PathBuf>,
    pub session_name_prefix: String,
    pub default_shell: Option<String>,
    pub terminal_type: String,
}

impl Default for TmuxConfig {
    fn default() -> Self {
        Self {
            socket_path: None,  // Use default socket location
            session_name_prefix: "atmos-".to_string(),
            default_shell: None,  // Use user's default shell
            terminal_type: "screen-256color".to_string(),
        }
    }
}
```

**Environment Configuration**
```bash
# Default shell for tmux sessions
DEFAULT_SHELL=/bin/bash

# Tmux socket path (for custom location)
TMUX_SOCKET_PATH=/tmp/atmos-tmux

# Terminal type
TERM=screen-256color
```

## Logging Configuration

### Rust Logging

**RUST_LOG Configuration**
```bash
# Log level
RUST_LOG=info           # General logging
RUST_LOG=debug          # Detailed logging
RUST_LOG=trace          # Very detailed logging

# Module-specific logging
RUST_LOG=atmos=debug,sea_orm=warn  # Debug for atmos, warn for sea_orm

# Multiple modules
RUST_LOG=atmos::api=info,atmos::service=debug
```

**Structured Logging**
```rust
use tracing::{info, warn, error, debug};
use tracing_subscriber;

pub fn init_logging() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(true)
        .with_thread_ids(true)
        .init();
}

// Usage
info!(project_id = %id, "Created project");
warn!(session_id = %id, "Session timeout");
error!(error = %err, "Failed to create terminal");
```

### Frontend Logging

**Development Logging**
```typescript
// apps/web/src/lib/logger.ts
export const logger = {
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args: any[]) => {
    console.info('[INFO]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};
```

## Performance Tuning

### Rust Performance

**Tokio Runtime Configuration**
```rust
use tokio::runtime::Builder;

let runtime = Builder::new_multi_thread()
    .worker_threads(4)           // Number of worker threads
    .thread_name("atmos-worker")
    .thread_stack_size(3 * 1024 * 1024)  // 3MB stack
    .enable_io()
    .enable_time()
    .build()?;
```

**Database Connection Pool**
```rust
use sea_orm::{ConnectOptions, Database};

let mut opt = ConnectOptions::new(database_url);
opt.max_connections(100)        // Max connections
   .min_connections(5)          // Min connections
   .connect_timeout(Duration::from_secs(30))
   .acquire_timeout(Duration::from_secs(30))
   .idle_timeout(Duration::from_secs(600))
   .max_lifetime(Duration::from_secs(1800))
   .sqlx_logging(true);
```

### Frontend Performance

**Build Optimization**
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  // Enable React compiler for optimization
  experimental: {
    reactCompiler: true,
  },

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },

  // Compression
  compress: true,

  // SWC minification
  swcMinify: true,
};
```

## Security Configuration

### CORS Configuration

```rust
use tower_http::cors::{CorsLayer, Any};

let cors = CorsLayer::new()
    .allow_origin(Any)  // Or specific origins in production
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers(Any);
```

**Environment-Specific Origins**
```bash
# Development
API_CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Production
API_CORS_ORIGINS=https://app.atmos.dev,https://www.atmos.dev
```

### JWT Configuration

```rust
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};

pub struct JwtConfig {
    pub secret: String,
    pub expiration: u64,  // seconds
}

impl JwtConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            secret: env::var("JWT_SECRET")?,
            expiration: env::var("JWT_EXPIRATION")
                .unwrap_or_else(|_| "3600".to_string())
                .parse()?,
        })
    }
}
```

## Deployment Configuration

### Docker Configuration

**Dockerfile** (`.docker/Dockerfile`)
```dockerfile
# Build stage
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin api

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ca-certificates \
    tmux \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/api /app/api
COPY --from=builder /app/apps/web /app/web

EXPOSE 8080 8081
CMD ["/app/api"]
```

**Docker Compose** (`docker-compose.yml`)
```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "8080:8080"
      - "8081:8081"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/atmos
      - RUST_LOG=info
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=atmos
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
RUST_LOG=info

# Database (use PostgreSQL in production)
DATABASE_URL=postgresql://user:pass@localhost:5432/atmos_prod

# API Server
API_HOST=0.0.0.0
API_PORT=8080
API_CORS_ORIGINS=https://app.atmos.dev

# Security
JWT_SECRET=${JWT_SECRET}  # Use environment variable, not hardcoded
SESSION_TIMEOUT=3600

# Performance
WORKER_THREADS=4
MAX_CONNECTIONS=100

# WebSocket
WS_PORT=8081
WS_MAX_CONNECTIONS=1000
```

## Key Source Files

| File | Purpose |
|------|---------|
| `/Users/username/projects/atmos/justfile` | Build and development commands |
| `/Users/username/projects/atmos/Cargo.toml` | Rust workspace configuration |
| `/Users/username/projects/atmos/package.json` | JavaScript workspace config |
| `/Users/username/projects/atmos/apps/api/src/config` | API server configuration |
| `/Users/username/projects/atmos/crates/infra/src/db` | Database configuration |
| `/Users/username/projects/atmos/apps/web/next.config.ts` | Next.js configuration |

## Next Steps

With ATMOS configured to your needs, explore:

- [Development Workflow](../deep-dive/build-system) - Build and test procedures
- [API Routes](../deep-dive/api/routes) - Backend endpoint documentation
- [Terminal Service](../deep-dive/core-service/terminal) - Terminal configuration options
- [Deployment Guide](../deep-dive/build-system) - Production deployment strategies

For configuration templates and examples, refer to the `.env.example` file in the project root.
