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

# 启动 Desktop (Tauri) 开发环境 (完整启动，前后端日志混合)
dev-desktop:
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run dev

# Desktop 分开启动: 仅前端 (用于单独查看前端日志)
# NEXT_PUBLIC_API_PORT 指向 Desktop sidecar 的固定端口，使浏览器也能连上
dev-desktop-frontend:
    NEXT_PUBLIC_API_PORT=30303 bun --filter web dev --port 3030

# Desktop 分开启动: 仅后端 (开发模式，使用 cargo run)
dev-desktop-backend:
    RUST_LOG=info cargo run --bin api

# Desktop 分开启动: 仅 Tauri 窗口 (需先启动 frontend，backend 会自动启动)
# --no-watch 防止修改 workspace 内其他 crate 的 Rust 代码时桌面端自动重启
dev-desktop-tauri:
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run tauri dev --no-watch --config src-tauri/tauri.debug.conf.json

# Desktop 调试模式：主窗口先显示，sidecar 异常弹窗提示（单命令）
dev-desktop-debug:
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && ATMOS_DESKTOP_DEBUG=true RUST_LOG=info bun run tauri dev --no-watch --config src-tauri/tauri.debug.conf.json --verbose

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

    if [[ -n "$port" ]]; then
        cargo run --bin api -- --port "$port" --cleanup-stale-clients "$cleanup_stale_clients"
    else
        cargo run --bin api -- --cleanup-stale-clients "$cleanup_stale_clients"
    fi

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

# 校验 Desktop 版本是否在 package / Cargo / Tauri 配置中保持一致
check-desktop-version:
    node ./scripts/release/check-desktop-version.mjs

# 同步更新 Desktop 版本
# 用法:
#   just bump-desktop-version 0.2.1
#   just bump-desktop-version 0.2.1 --dry-run
bump-desktop-version version *args:
    node ./scripts/release/bump-desktop-version.mjs "{{version}}" {{args}}

# Atmos Desktop 发布辅助
# 用法:
#   just release-desktop 0.2.1
#   just release-desktop 0.2.1 --dry-run
#   just release-desktop 0.5.0-rc.1 --prerelease
release-desktop version *args:
    node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs "{{version}}" {{args}}

# Atmos Desktop 发布预演
# 用法:
#   just release-desktop-dry-run 0.2.1
#   just release-desktop-dry-run 0.2.1 --allow-dirty
release-desktop-dry-run version *args:
    node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs "{{version}}" --dry-run {{args}}

# ============================================
# 构建命令 (Build)
# ============================================

# 构建 Desktop 应用
build-desktop:
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run build

# 构建 API 服务器 (release 模式)
build-api:
    cargo build --release --bin api

# 构建 CLI 工具 (release 模式)
build-cli:
    cargo build --release --bin atmos

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

# 安装 CLI 到系统
install-cli:
    cargo install --path apps/cli

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
alias ddf := dev-desktop-frontend
alias ddb := dev-desktop-backend
alias ddt := dev-desktop-tauri
alias dl := dev-landing
alias dlp := dev-landing-portless
alias d-d := dev-docs
alias da := dev-api
alias t := test
alias ta := test-api
alias l := lint
alias f := fmt
alias c := clean
