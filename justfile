# ATMOS - Justfile
# 使用 Just (https://github.com/casey/just) 管理跨语言任务
# 安装: brew install just (macOS) / cargo install just

# 设置默认 shell
set shell := ["zsh", "-cu"]
# set shell := ["powershell.exe", "-c"]

# 显示所有可用命令
default:
    @just --list --unsorted

# ============================================
# 开发命令 (Development)
# ============================================

# 启动 Web 开发服务器
dev-web:
    bun --filter web dev

# 启动 landing 开发服务器
dev-landing:
    bun --filter landing dev

# 启动 docs 开发服务器
dev-docs:
    bun --filter docs dev

# 启动 Desktop (Tauri) 开发环境
dev-desktop:
    cd apps/desktop && bun tauri dev

# 启动 API 服务器
# 直接 cargo run，Ctrl+C 信号能正确传播，避免 shell 先于 api 退出导致输出乱序
# 需要热重载时用 dev-api-watch
dev-api:
    cargo run --bin api

# 启动 API 服务器 (热重载，Ctrl+C 时 cargo watch 可能先退出导致输出乱序)
dev-api-watch:
    cargo watch -x 'run --bin api' -w apps/api -w crates

# 运行 CLI 帮助
dev-cli:
    cargo run --bin atmos -- --help

# 同时启动所有开发服务器 (并行运行)
dev-all:
    @echo "启动所有开发服务器..."
    @just dev-web & just dev-api

# ============================================
# 构建命令 (Build)
# ============================================

# 构建 Desktop 应用
build-desktop:
    cd apps/desktop && bun tauri build

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
alias dd := dev-desktop
alias dl := dev-landing
alias d-d := dev-docs
alias da := dev-api
alias t := test
alias ta := test-api
alias l := lint
alias f := fmt
alias c := clean
