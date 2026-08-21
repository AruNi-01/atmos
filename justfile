# ATMOS - Justfile
# 使用 Just (https://github.com/casey/just) 管理跨语言任务
# 安装: brew install just (macOS) / cargo install just

# 设置默认 shell
set shell := ["zsh", "-cu"]
set positional-arguments
# set shell := ["powershell.exe", "-c"]

# 显示所有可用命令
default:
    @just --list --unsorted

# ============================================
# 开发命令 (Development)
# ============================================

# 启动 Web 开发服务器
# 用法:
#   just dev-web
#   just dev-web --port 3001
#   just dev-web --web-port 3001 --api-port 4040
dev-web *args:
    #!/usr/bin/env bash
    set -euo pipefail

    web_port=3030
    api_port=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port|--web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --api-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                api_port="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-web [--port|-p <web-port>] [--web-port <web-port>] [--api-port <api-port>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$api_port" ]]; then
        cd apps/web && NEXT_PUBLIC_API_PORT="$api_port" bun x next dev --turbopack --port "$web_port"
    else
        cd apps/web && bun x next dev --turbopack --port "$web_port"
    fi

# 启动 Web 开发服务器 (使用 portless)
dev-web-portless:
    bun --filter web dev:portless

# 启动 landing 开发服务器
dev-landing:
    bun --filter landing dev

# 启动 landing 开发服务器 (使用 portless)
dev-landing-portless:
    bun --filter landing dev:portless

# 启动 docs 开发服务器
dev-docs:
    bun --filter docs dev

# 启动 Mobile Expo 开发服务器
dev-mobile:
    cd apps/mobile && bun run start

# ── Desktop (Electron is the production default shell) ──────────────────────
# prepare-sidecar stages shared Atmos Server + web static under the runtime layout.
# Faster re-run: ATMOS_DESKTOP_SKIP_WEB_BUILD=1 just dev-desktop
# Skip prepare if runtime already present: ATMOS_ELECTRON_SKIP_PREPARE=1 just dev-desktop
dev-desktop:
    cd apps/desktop-electron && bun run dev

# Alias kept for clarity / muscle memory
dev-desktop-electron:
    just dev-desktop

# Deprecated Tauri shell (apps/desktop) — local-only; not for release.
dev-desktop-tauri:
    @echo "⚠️  apps/desktop (Tauri) is deprecated. Prefer: just dev-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json

# Desktop 分开启动: 仅后端 (开发模式，使用 cargo run)
dev-desktop-backend:
    RUST_LOG=info cargo run --bin api

# Deprecated Tauri debug mode
dev-desktop-debug:
    @echo "⚠️  apps/desktop (Tauri) is deprecated. Prefer: just dev-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && ATMOS_DESKTOP_DEBUG=true RUST_LOG=info bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json --verbose

# Headless desktop smokes (no GUI): router + ensure Server + get_api_config
test-desktop-electron-smoke:
    cd apps/desktop-electron && bun run smoke:router && bun run smoke:boot

# Package production desktop installers (DMG/NSIS/AppImage). Requires prepare-sidecar first.
build-desktop:
    bash ./scripts/desktop/prepare-sidecar.sh
    cd apps/desktop-electron && bun run package

build-desktop-electron:
    just build-desktop

# Deprecated Tauri package (local only — do not use for shipping)
build-desktop-tauri:
    @echo "⚠️  Deprecated: Tauri package is not the production ship path. Prefer: just build-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh
    cd apps/desktop && bun run tauri build

# Bump production desktop version (apps/desktop-electron/package.json)
bump-desktop-version version *args:
    node ./scripts/release/bump-desktop-electron-version.mjs "{{version}}" {{args}}

bump-desktop-electron-version version *args:
    just bump-desktop-version {{version}} {{args}}

# Production desktop release (Electron ship path). Same as /atmos-desktop-release.
#   just release-desktop 2026.7.28
#   just release-desktop 2026.7.28 --dry-run
release-desktop version *args:
    node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs "{{version}}" {{args}}

release-desktop-electron version *args:
    just release-desktop {{version}} {{args}}

release-desktop-dry-run version *args:
    node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs "{{version}}" --dry-run {{args}}

release-desktop-electron-dry-run version *args:
    just release-desktop-dry-run {{version}} {{args}}

# 启动 API 服务器
# 直接 cargo run，Ctrl+C 信号能正确传播，避免 shell 先于 api 退出导致输出乱序
# 需要热重载时用 dev-api-watch
# 用法:
#   just dev-api
#   just dev-api --port 4040
#   just dev-api -p 4040
#   just dev-api --port 4040 --web-port 3001
#   just dev-api --port 4040 --cleanup-stale-clients false
dev-api *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=""
    web_port=""
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-api [--port|-p <port>] [--web-port <web-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$web_port" ]]; then
        export CORS_ORIGIN="http://localhost:${web_port},http://127.0.0.1:${web_port}"
    fi

    # Linear OAuth finish persists tokens on Hub (core-service). Prefer explicit env;
    # fall back to web's NEXT_PUBLIC_ / prod Hub so local API is not misconfigured.
    if [[ -z "${ATMOS_HUB_URL:-}" && -z "${NEXT_PUBLIC_ATMOS_HUB_URL:-}" ]]; then
        export ATMOS_HUB_URL="https://hub.atmos.land"
    fi

    if [[ -n "$port" ]]; then
        cargo run --bin api -- --port "$port" --cleanup-stale-clients "$cleanup_stale_clients"
    else
        cargo run --bin api -- --cleanup-stale-clients "$cleanup_stale_clients"
    fi

# 启动 Atmos Hub（Better Auth / devices / integrations；packages/hub wrangler dev）
# 用法:
#   just dev-hub
#   just dev-hub --port 8787
#   just dh
# 需要 packages/hub/.dev.vars（secrets）；默认 http://localhost:8787
dev-hub *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=8787

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-hub [--port|-p <port>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ ! -f packages/hub/.dev.vars ]]; then
        echo "Missing packages/hub/.dev.vars — copy from .dev.vars.example and fill secrets." >&2
        exit 1
    fi

    cd packages/hub
    echo "Atmos Hub → http://localhost:${port}  (BETTER_AUTH_URL in .dev.vars should match)"
    bunx wrangler dev --port "$port"

# 启动 API 服务器 (热重载，Ctrl+C 时 cargo watch 可能先退出导致输出乱序)
dev-api-watch *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=""
    web_port=""
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-api-watch [--port|-p <port>] [--web-port <web-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$web_port" ]]; then
        export CORS_ORIGIN="http://localhost:${web_port},http://127.0.0.1:${web_port}"
    fi

    if [[ -z "${ATMOS_HUB_URL:-}" && -z "${NEXT_PUBLIC_ATMOS_HUB_URL:-}" ]]; then
        export ATMOS_HUB_URL="https://hub.atmos.land"
    fi

    if [[ -n "$port" ]]; then
        cargo watch -x "run --bin api -- --port $port --cleanup-stale-clients $cleanup_stale_clients" -w apps/api -w crates
    else
        cargo watch -x "run --bin api -- --cleanup-stale-clients $cleanup_stale_clients" -w apps/api -w crates
    fi

# 运行 CLI 帮助
dev-cli:
    cargo run --bin atmos -- --help

# 同时启动所有开发服务器 (并行运行)
# 用法:
#   just dev-all
#   just dev-all --web-port 3001 --api-port 4040
#   just dev-all --web-port 3001 --api-port 4040 --cleanup-stale-clients false
dev-all *args:
    #!/usr/bin/env bash
    set -euo pipefail

    web_port=3030
    api_port=30303
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --api-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                api_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-all [--web-port <web-port>] [--api-port <api-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    echo "启动所有开发服务器... web=${web_port} api=${api_port}"
    just dev-web --web-port "$web_port" --api-port "$api_port" & just dev-api --port "$api_port" --web-port "$web_port" --cleanup-stale-clients "$cleanup_stale_clients"

# ============================================
# 版本命令 (Release / Version)
# ============================================

# 校验 production desktop 版本（apps/desktop-electron/package.json）
check-desktop-version:
    node -e "const p=require('./apps/desktop-electron/package.json'); if(!p.version) process.exit(1); console.log('desktop-electron version', p.version);"

# ============================================
# 构建命令 (Build)
# ============================================
# 构建 API 服务器 (release 模式)
build-api:
    cargo build --release --bin api

# 构建 CLI 工具 (release 模式)
build-cli:
    cargo build --release --bin atmos

# 构建本地 Web runtime 产物 (api + atmos + web)
build-local-runtime *args:
    node ./scripts/local-runtime/build-runtime.mjs {{args}}

# Pack vendored serve-sim into a darwin-arm64 archive (APP-060).
#   just pack-serve-sim
#   just pack-serve-sim --install
pack-serve-sim *args:
    bash scripts/serve-sim/pack.sh {{args}}

# 构建所有 Rust 项目
build-rust:
    cargo build --release --workspace

# 构建所有项目
build-all:
    bun run build
    cargo build --release --workspace

# ============================================
# 安装命令 (Install)
# ============================================

# 安装 CLI 到 cargo bin（~/.cargo/bin/atmos）
install-cli:
    cargo install --path apps/cli

# 一键用本仓库最新 CLI 替换本机 atmos
# 写入产品路径 ~/.atmos/bin/atmos；若存在 ~/.cargo/bin 则一并覆盖
# 用法: just use-local-cli
use-local-cli:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    cargo build --release -p atmos --manifest-path "${root}/apps/cli/Cargo.toml"
    src="${root}/target/release/atmos"
    if [[ ! -x "$src" ]]; then
      echo "error: release binary missing: ${src}" >&2
      exit 1
    fi
    dest_dir="${HOME}/.atmos/bin"
    mkdir -p "$dest_dir"
    install -m 755 "$src" "${dest_dir}/atmos"
    if [[ -d "${HOME}/.cargo/bin" ]]; then
      install -m 755 "$src" "${HOME}/.cargo/bin/atmos"
    fi
    hash -r 2>/dev/null || true
    echo "replaced: ${dest_dir}/atmos"
    if [[ -x "${HOME}/.cargo/bin/atmos" ]]; then
      echo "replaced: ${HOME}/.cargo/bin/atmos"
    fi
    echo -n "version: "
    "${dest_dir}/atmos" --version
    if command -v atmos >/dev/null 2>&1; then
      echo "path:    $(command -v atmos)"
    else
      echo "path:    atmos not on PATH — add export PATH=\"\$HOME/.atmos/bin:\$PATH\""
    fi

# 安装所有依赖
install-deps:
    bun install
    cargo fetch

# ============================================
# 代码质量 (Code Quality)
# ============================================

# 运行所有 lint 检查
lint:
    bun lint
    cargo clippy --workspace

# TypeScript 7 native typecheck across workspaces (QUALITY-005)
typecheck:
    bun run typecheck

# Typecheck wall-time vs QUALITY-005 baseline
typecheck-bench:
    bun run typecheck:bench

# 格式化所有代码
fmt:
    bun run prettier --write .
    cargo fmt --all

# 检查格式问题 (不修改文件)
fmt-check:
    bun run prettier --check .
    cargo fmt --all --check

# ============================================
# 测试 (Testing)
# ============================================

# 运行所有测试
test:
    bun test
    cargo test --workspace

# 运行 Playwright E2E 测试
test-e2e *args:
    bun run --cwd e2e test -- {{args}}

# 运行 Playwright E2E smoke 测试
test-e2e-smoke *args:
    bun run --cwd e2e test:smoke -- {{args}}

# 以 headed 模式运行 Playwright E2E 测试
test-e2e-headed *args:
    bun run --cwd e2e test:headed -- {{args}}

# 安装 Playwright Chromium 浏览器
install-e2e-browsers:
    bun run --cwd e2e install:browsers

# 打开最近一次 Playwright HTML 报告
e2e-report:
    bun run --cwd e2e report

# 仅运行前端测试
test-web:
    bun test

# 仅运行 Rust 测试
test-rust:
    cargo test --workspace

# 运行 API 测试
test-api:
    cargo test --package api

# 运行测试并显示覆盖率
test-coverage:
    cargo test --workspace -- --nocapture
    cargo tarpaulin --workspace --out Html

# ============================================
# 清理 (Clean)
# ============================================

# 清理所有构建产物
clean:
    rm -rf node_modules
    rm -rf .next
    rm -rf target
    bun pm cache rm

# 清理 Rust 构建产物
clean-rust:
    cargo clean

# 清理 Node 模块
clean-node:
    rm -rf node_modules
    rm -rf apps/*/node_modules
    rm -rf packages/*/node_modules

# ============================================
# 工具命令 (Utilities)
# ============================================

# 更新所有依赖
update:
    bun update
    cargo update

# 检查过时的依赖
outdated:
    bun outdated
    cargo outdated

# 运行安全审计
audit:
    bun audit
    cargo audit

# 显示项目信息
info:
    @echo "=== Bun 版本 ==="
    @bun --version
    @echo "\n=== Cargo 版本 ==="
    @cargo --version
    @echo "\n=== Rust 版本 ==="
    @rustc --version
    @echo "\n=== Node 版本 ==="
    @node --version

# ============================================
# 组合命令 (Composite)
# ============================================

# 完整的 CI 流程: lint + test + build
ci: lint test build-all
    @echo "CI 流程完成 ✓"

# 预提交检查: fmt + lint + test
pre-commit: fmt lint test
    @echo "预提交检查完成 ✓"

# 完整清理并重新安装
fresh: clean install-deps
    @echo "项目已刷新 ✓"

# ============================================
# 快捷别名 (Aliases)
# ============================================

alias dw := dev-web
alias dwp := dev-web-portless
alias dd := dev-desktop
alias dde := dev-desktop-electron
alias ddt := dev-desktop-tauri
alias bde := build-desktop-electron
alias ddb := dev-desktop-backend
alias dl := dev-landing
alias dlp := dev-landing-portless
alias d-d := dev-docs
alias dm := dev-mobile
alias da := dev-api
alias dh := dev-hub
alias t := test
alias te := test-e2e
alias tes := test-e2e-smoke
alias ta := test-api
alias tc := typecheck
alias l := lint
alias f := fmt
alias c := clean
