---
title: Quick Start Guide
section: getting-started
level: beginner
reading_time: 6
path: getting-started/quick-start
sources:
  - README.md
  - justfile
  - AGENTS.md
updated_at: 2026-02-11T12:00:00Z
---

# Quick Start Guide

Get up and running with ATMOS in under 10 minutes. This guide will walk you through installing dependencies, starting the development servers, and making your first terminal connection.

## Prerequisites

Before you begin, ensure you have the following tools installed:

### Required Tools

**Bun** - Fast JavaScript package manager and runtime
```bash
# Install Bun (macOS/Linux)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

**Rust** - Systems programming language for the backend
```bash
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify installation
rustc --version
cargo --version
```

**Just** - Command runner for executing development tasks
```bash
# Install Just (macOS)
brew install just

# Install Just (Linux)
cargo install just

# Verify installation
just --version
```

### Optional but Recommended

**Tmux** - Terminal multiplexer for persistent sessions
```bash
# Install Tmux (macOS)
brew install tmux

# Install Tmux (Linux)
sudo apt-get install tmux  # Ubuntu/Debian
sudo yum install tmux      # CentOS/RHEL

# Verify installation
tmux -V
```

**Git** - Version control system
```bash
# Git is usually pre-installed
# Verify installation
git --version
```

## Installation Steps

### Step 1: Clone the Repository

Start by cloning the ATMOS repository:

```bash
# Clone the repository
git clone https://github.com/AruNi-01/atmos.git
cd atmos
```

### Step 2: Install Dependencies

Install all project dependencies using the justfile:

```bash
# Install frontend and backend dependencies
just install-deps
```

This command runs:
```bash
bun install    # Install JavaScript/TypeScript dependencies
cargo fetch    # Fetch and cache Rust dependencies
```

*Source: `/Users/lurunrun/own_space/OpenSource/atmos/justfile`*

Alternatively, you can run the commands directly:

```bash
bun install
cargo fetch
```

## Starting Development Servers

ATMOS consists of multiple services that can be started independently or together.

### Option 1: Start Individual Services

**Start the Web Application**
```bash
just dev-web
```

This starts the Next.js development server on `http://localhost:3000`

**Start the API Server**
```bash
just dev-api
```

This starts the Axum API server on `http://localhost:8080`

**Run the CLI Tool**
```bash
just dev-cli
```

This displays the CLI help message with available commands

### Option 2: Start All Services

For a complete development environment, start both web and API servers:

```bash
just dev-all
```

This runs both `just dev-web` and `just dev-api` in parallel.

## Development Workflow

Once your servers are running, here's how to develop with ATMOS:

### 1. Access the Web Interface

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the ATMOS workspace interface.

### 2. Create Your First Workspace

In the web interface:
- Click "Create New Workspace"
- Enter a name (e.g., "Development")
- Select a base directory for your projects
- Click "Create"

### 3. Add a Project

Within your workspace:
- Click "Add Project"
- Enter a Git repository URL or local path
- Select a branch (default: main)
- Click "Add Project"

### 4. Start a Terminal Session

With your project added:
- Select the project from the sidebar
- Click "New Terminal" to open a persistent session
- Run commands as you would in any terminal
- Close the browser tab - your session continues running

### 5. Reconnect to Your Session

When you return:
- Open the web interface again
- Your previous terminal session will be listed
- Click to reconnect and see all your previous output

## Quick Commands Reference

Here are the essential commands you'll use during development:

```bash
# Dependency Management
just install-deps       # Install all dependencies
bun install            # Install frontend deps only
cargo fetch            # Cache Rust deps only

# Development Servers
just dev-web           # Start web app on :3000
just dev-api           # Start API server on :8080
just dev-cli           # Run CLI tool
just dev-all           # Start web + API together

# Building
just build-web         # Build web app for production
just build-api         # Build API server (release)
just build-cli         # Build CLI tool (release)
just build-all         # Build everything

# Code Quality
just lint              # Run all linters
just fmt               # Format all code
just test              # Run all tests

# Cleanup
just clean             # Remove all build artifacts
just fresh             # Clean + reinstall dependencies
```

*Source: `/Users/lurunrun/own_space/OpenSource/atmos/justfile`*

## Quick Aliases

The justfile includes convenient aliases for common tasks:

```bash
just dw    # Alias for dev-web
just da    # Alias for dev-api
just t     # Alias for test
just l     # Alias for lint
just f     # Alias for fmt
just c     # Alias for clean
```

## Verifying Your Setup

To ensure everything is working correctly:

### 1. Check Versions

```bash
just info
```

This displays versions of all required tools:
```
=== Bun Version ===
1.x.x

=== Cargo Version ===
1.x.x

=== Rust Version ===
1.x.x

=== Node Version ===
v20.x.x
```

### 2. Run Tests

```bash
just test
```

This runs both frontend and backend tests to verify your setup.

### 3. Access the Application

With `just dev-web` and `just dev-api` running:
- Open `http://localhost:3000` in your browser
- You should see the ATMOS web interface
- No console errors in the browser dev tools

## Troubleshooting

### Port Already in Use

If you see "port already in use" errors:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 PID
```

### Dependency Issues

If you encounter dependency errors:

```bash
# Clean everything and start fresh
just fresh

# Or manually:
just clean
just install-deps
```

### Rust Build Errors

If Rust compilation fails:

```bash
# Update Rust toolchain
rustup update

# Clean Rust build cache
cargo clean

# Rebuild
cargo build
```

### Frontend Issues

If the web app has errors:

```bash
# Clear node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
bun install

# Clear Next.js cache
rm -rf .next apps/web/.next
```

## Next Steps

Congratulations! You now have ATMOS running locally. Here's what to explore next:

### Learn the Architecture
- [Architecture Overview](./architecture) - Understand how ATMOS works
- [Key Concepts](./key-concepts) - Learn about workspaces, projects, and sessions

### Customize Your Setup
- [Configuration Guide](./configuration) - Customize ATMOS for your workflow
- [Development Workflow](../deep-dive/build-system) - Learn how to contribute

### Explore Features
- [Terminal Service](../deep-dive/core-service/terminal) - Deep dive into persistent sessions
- [Workspace Service](../deep-dive/core-service/workspace) - Multi-project management
- [API Routes](../deep-dive/api/routes) - Backend API documentation

## Development Tips

Here are some tips for productive development with ATMOS:

**Hot Reload**
- The web app supports hot reload - changes appear automatically
- The API server uses `cargo watch` for automatic recompilation
- Both services restart when you save changes

**Logging**
- API logs appear in your terminal
- Web app logs appear in browser dev tools
- Enable debug mode for verbose output

**Testing**
- Run `just test` before committing changes
- Use `just test-coverage` to see test coverage reports
- Integration tests require both API and web running

**Code Quality**
- Run `just pre-commit` before pushing
- This includes formatting, linting, and testing
- Set up git hooks to run this automatically

## Key Source Files

| File | Purpose |
|------|---------|
| `/Users/lurunrun/own_space/OpenSource/atmos/justfile` | All development commands |
| `/Users/lurunrun/own_space/OpenSource/atmos/README.md` | Project overview |
| `/Users/lurunrun/own_space/OpenSource/atmos/AGENTS.md` | Module navigation guide |
| `/Users/lurunrun/own_space/OpenSource/atmos/package.json` | Frontend dependencies |
| `/Users/lurunrun/own_space/OpenSource/atmos/Cargo.toml` | Backend dependencies |

Ready to dive deeper? Continue to [Installation & Setup](./installation) for detailed configuration options, or explore the [Architecture Overview](./architecture) to understand how everything fits together.
