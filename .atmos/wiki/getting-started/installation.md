---
title: Installation & Setup
section: getting-started
level: beginner
reading_time: 8
path: getting-started/installation
sources:
  - README.md
  - justfile
  - Cargo.toml
  - package.json
updated_at: 2026-02-11T12:00:00Z
---

# Installation & Setup

This comprehensive guide covers installing and configuring ATMOS on your system. Whether you're setting up for development or deployment, we'll walk through each step to ensure a smooth installation experience.

## System Requirements

### Minimum Requirements

**Operating System**
- macOS 11+ (Big Sur or later)
- Ubuntu 20.04+ or equivalent Linux distribution
- Windows 10+ with WSL2 (Windows Subsystem for Linux)

**Hardware**
- 4GB RAM minimum (8GB recommended for development)
- 10GB free disk space
- Modern multi-core processor

**Network**
- Internet connection for downloading dependencies
- Git access for cloning repositories

### Recommended Development Environment

For the best development experience:
- 16GB RAM or more
- SSD storage
- Multiple cores for parallel builds
- Stable internet connection

## Prerequisites Installation

### 1. Bun (JavaScript Runtime)

Bun is required for managing frontend dependencies and running web applications.

**macOS**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Linux**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows (WSL2)**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Verify Installation**
```bash
bun --version
# Expected output: 1.x.x or higher
```

**Configuration**
Bun automatically configures itself. No additional setup needed.

### 2. Rust Toolchain

Rust is required for building and running the backend services.

**Using rustup (Recommended)**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**During Installation**
- Choose option 1 (default installation)
- Allow rustup to modify your PATH

**Reload Your Shell**
```bash
source $HOME/.cargo/env
```

**Verify Installation**
```bash
rustc --version
# Expected output: rustc 1.x.x

cargo --version
# Expected output: cargo 1.x.x
```

**Optional: Nightly Toolchain**
Some features may require the nightly toolchain:
```bash
rustup install nightly
rustup default nightly
```

### 3. Just (Command Runner)

Just executes tasks defined in the justfile.

**macOS**
```bash
brew install just
```

**Linux**
```bash
# Download latest binary
curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash

# Or build from source
cargo install just
```

**Windows (WSL2)**
```bash
cargo install just
```

**Verify Installation**
```bash
just --version
# Expected output: just 1.x.x
```

### 4. Git (Version Control)

Git is required for cloning the repository and worktree features.

**macOS**
```bash
# Git is included with Xcode Command Line Tools
xcode-select --install
```

**Linux**
```bash
sudo apt-get install git  # Ubuntu/Debian
sudo yum install git      # CentOS/RHEL
```

**Windows (WSL2)**
```bash
sudo apt-get install git
```

**Verify Installation**
```bash
git --version
# Expected output: git version 2.x.x
```

### 5. Tmux (Terminal Multiplexer)

Tmux is optional but highly recommended for persistent terminal sessions.

**macOS**
```bash
brew install tmux
```

**Linux**
```bash
sudo apt-get install tmux  # Ubuntu/Debian
sudo yum install tmux      # CentOS/RHEL
```

**Windows (WSL2)**
```bash
sudo apt-get install tmux
```

**Verify Installation**
```bash
tmux -V
# Expected output: tmux 3.x or higher
```

**Configuration**
Create a basic tmux configuration:
```bash
# Create config directory
mkdir -p ~/.tmux.conf

# Basic configuration
cat > ~/.tmux.conf << 'EOF'
# Enable mouse mode
set -g mouse on

# Set default terminal
set -g default-terminal "screen-256color"

# Increase scrollback buffer
set -g history-limit 10000
EOF
```

## Project Installation

### Step 1: Clone the Repository

Choose a location for the ATMOS source code:

```bash
# Navigate to your preferred directory
cd ~/dev  # or any directory you prefer

# Clone the repository
git clone https://github.com/AruNi-01/atmos.git

# Enter the directory
cd atmos
```

### Step 2: Install Dependencies

Use the justfile to install all dependencies:

```bash
just install-deps
```

This executes:
```bash
bun install    # Install frontend dependencies
cargo fetch    # Cache Rust dependencies
```

*Source: `/Users/lurunrun/own_space/OpenSource/atmos/justfile`*

**Expected Output**
```
Installing frontend dependencies...
✓ Installed 1234 packages

Caching Rust dependencies...
✓ Downloaded 56 crates
```

**Installation Time**
- First time: 5-15 minutes depending on network speed
- Subsequent installs: 1-2 minutes

### Step 3: Verify Installation

Run the info command to check all tools:

```bash
just info
```

Expected output:
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

### Step 4: Run Tests

Verify everything works by running tests:

```bash
just test
```

This runs:
- Frontend tests via `bun test`
- Backend tests via `cargo test`

**Expected Output**
```
Running frontend tests...
✓ All tests passed

Running backend tests...
✓ All tests passed
```

## Platform-Specific Setup

### macOS

**Additional Requirements**
```bash
# Install Xcode Command Line Tools (includes git)
xcode-select --install

# Install Homebrew (package manager)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**System Preferences**
- Allow terminal apps to access your directories in Security & Privacy
- Configure firewall to allow local development ports (3000, 8080)

### Linux (Ubuntu/Debian)

**System Dependencies**
```bash
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    curl \
    git
```

**Permission Setup**
You may need to add your user to required groups:
```bash
# Add to dialout group for serial device access
sudo usermod -aG dialout $USER
```

### Windows (WSL2)

**WSL2 Setup**
```powershell
# Enable WSL
wsl --install

# Set WSL 2 as default
wsl --set-default-version 2
```

**Inside WSL2**
```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install required packages
sudo apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    curl \
    git \
    tmux
```

**Windows Integration**
- Access Windows files from `/mnt/c/`
- Share clipboard between WSL and Windows
- Configure VS Code to use WSL for development

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Create from example
cp .env.example .env

# Edit configuration
nano .env
```

**Common Configuration Options**
```bash
# API Configuration
API_PORT=8080
API_HOST=0.0.0.0

# Database
DATABASE_URL=sqlite:./data/atmos.db

# WebSocket
WS_PORT=8081

# Development
NODE_ENV=development
RUST_LOG=debug
```

### Rust Configuration

**Cargo Config**
Create or edit `.cargo/config.toml`:
```toml
[build]
target-dir = "target"

[net]
git-fetch-with-cli = true
```

**Toolchain Preferences**
```bash
# Set stable as default
rustup default stable

# Add components
rustup component add rust-analyzer
rustup component add clippy
rustup component add rustfmt
```

### Bun Configuration

**Bunfig**
Create `~/.bunfig.toml`:
```toml
[install]
# Use global cache cache
globalCacheDir = "~/.bun/install/cache"
# Lockfile format
lockfile = "yarn"

[install.scopes]
# Configure scoped packages
"@atmos" = "https://registry.npmjs.org"
```

### Git Configuration

**Global Git Config**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
git config --global init.defaultBranch main
git config --global core.autocrlf input  # Linux/macOS
git config --global core.autocrlf true   # Windows
```

**Project-Specific**
```bash
# In the atmos directory
git config core.fileMode false  # Ignore permission changes
```

## Build Configuration

### Development Build

For development with hot reload:
```bash
just dev-web    # Web app with hot reload
just dev-api    # API server with watch mode
```

### Production Build

For optimized production builds:
```bash
just build-all
```

This builds:
- Next.js web app (optimized, minified)
- Rust API server (release mode, full optimizations)
- CLI tool (release binary)

### Custom Build Options

**Web App Only**
```bash
bun --filter web build
```

**API Server Only**
```bash
cargo build --release --bin api
```

**CLI Tool Only**
```bash
cargo build --release --bin atmos
```

## IDE Setup

### Visual Studio Code

**Recommended Extensions**
```json
{
  "recommendations": [
    "rust-lang.rust-analyzer",
    "tauri-apps.tauri-vscode",
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

**Workspace Settings**
```json
{
  "rust-analyzer.cargo.features": "all",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ],
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

### JetBrains IDEs

**IntelliJ IDEA / RustRover**
- Install Rust plugin
- Enable Tailwind CSS plugin
- Configure Bun as Node.js runtime

### Neovim / Vim

**Essential Plugins**
- `rust-analyzer` for Rust
- `nvim-lspconfig` for LSP support
- `tailwindcss-colorizer` for Tailwind
- `typescript-vim` for TypeScript

## Troubleshooting Installation

### Common Issues

**Issue: "Permission Denied"**
```bash
# Fix file permissions
chmod +x scripts/setup.sh
./scripts/setup.sh
```

**Issue: "Port Already in Use"**
```bash
# Find and kill process on port
lsof -ti:3000 | xargs kill -9  # Web
lsof -ti:8080 | xargs kill -9  # API
```

**Issue: "Rust Build Fails"**
```bash
# Clean and rebuild
cargo clean
cargo build
```

**Issue: "Bun Install Fails"**
```bash
# Clear cache and retry
rm -rf node_modules
bun pm cache rm
bun install
```

### Getting Help

If you encounter issues:
1. Check the [troubleshooting section](./quick-start#troubleshooting)
2. Review logs in `logs/` directory
3. Open an issue on GitHub with details
4. Join our community Discord for help

## Verification Checklist

After installation, verify each component:

- [ ] Bun installed and accessible (`bun --version`)
- [ ] Rust toolchain installed (`rustc --version`)
- [ ] Just command runner available (`just --version`)
- [ ] Git configured (`git --version`)
- [ ] Tmux installed (optional but recommended)
- [ ] Project dependencies installed (`just install-deps`)
- [ ] Tests passing (`just test`)
- [ ] Web app starts (`just dev-web`)
- [ ] API server starts (`just dev-api`)
- [ ] Can access http://localhost:3000

## Next Steps

With ATMOS successfully installed, explore:

### Learn the System
- [Architecture Overview](./architecture) - Understand the system design
- [Key Concepts](./key-concepts) - Master core terminology

### Configuration
- [Configuration Guide](./configuration) - Customize your setup
- [Environment Variables](../deep-dive/build-system) - Advanced configuration

### Development
- [Development Workflow](../deep-dive/build-system) - Start contributing
- [API Documentation](../deep-dive/api/routes) - Backend endpoints

## Key Source Files

| File | Purpose |
|------|---------|
| `/Users/lurunrun/own_space/OpenSource/atmos/justfile` | All installation commands |
| `/Users/lurunrun/own_space/OpenSource/atmos/Cargo.toml` | Rust workspace config |
| `/Users/lurunrun/own_space/OpenSource/atmos/package.json` | JavaScript dependencies |
| `/Users/lurunrun/own_space/OpenSource/atmos/README.md` | Quick start guide |
| `/Users/lurunrun/own_space/OpenSource/atmos/AGENTS.md` | Project navigation |

Congratulations! You now have ATMOS installed and ready to use. Continue to [Architecture Overview](./architecture) to understand how everything works together.
