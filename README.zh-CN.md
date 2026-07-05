<div align="center">

# ATMOS

Atmosphere for Agentic Builders

简体中文 | [English](./README.md)

</div>

<p align="center">
  <img src="./assets/readme/atmos-preview.png" alt="Atmos 截图" />
</p>

## 功能亮点

- **15+ 内置终端 Agent** — 统一管理 Claude Code、Codex、Gemini、Cursor、Devin、Antigravity 等主流编码 Agent，一个界面随时切换。
- **多工作区开发** — 基于 Git worktree 的环境隔离，实现多环境下的 Agent 并行执行。
- **Tmux 持久化会话** — 容错式终端管理，会话中断后可无缝恢复。
- **内置轻量级编辑器** — 文件预览与行内编辑，随时随地切换回原始人 coding 模式。
- **集成 Git 工作流** — Diff 视图、提交辅助、代码审查与 GitHub PR 管理一体化。
- **Review 工作流** — 在 Atmos 内置 Diff 界面中审查改动、在指定行留下行内评论，再交给 Code Agent 按评论修复。
- **全局 Agent 聊天面板** — 任意位置发起非终端 Chat 对话，基于 ACP 复用你的 Code Agent CLI。
- **终端侧聊** — 在终端 AI 输入框中通过 `/side` 快速发起侧聊，不打断终端工作流。
- **技能管理系统** — 一键启用/禁用或删除 Agent 技能，灵活控制能力集合。
- **全局搜索/命令面板** — 键盘驱动的工作流，快速搜索与执行 Atmos 功能。
- **Agent 状态与通知** — 通过 Agent Hooks 将运行中、空闲、等待授权、完成等状态实时同步到全站 UI；状态变化时推送通知，支持系统原生提醒及自托管推送（ntfy、Gotify 或自定义 Webhook）。
- **用量分析看板** — AI 编码订阅额度跟踪、各 Agent Token 消耗与费用预估。
- **Kanban 视图** — 在 Kanban 视图中快捷管理 Workspace 的状态、优先级、标签等信息。
- **Canvas** — 跨项目的无限画布：把任意工作区/项目的终端会话固定为卡片，在同一张持久化画板上排布；Code Agent 可操作画布，画示意图、便签与布局，无需离开 Agent 工作流。
- **Atmos Computer** — 将 VPS 或任意机器注册到 Atmos Register Center，随后在 Desktop、Web 中一键切换并连接，在该 Computer 上使用终端、工作区与 Canvas 等，无论设备部署在何处，都可使用你的 Atmos 运行环境。
- **浏览器元素检查器** — 在实时浏览器预览中悬停点击选取元素，自动定位 React、Vue、Angular、Svelte 项目中的源码位置。
- **跨平台与隧道连接器** — Web、桌面与移动端应用，集成内网穿透（Ngrok/Tailscale/Cloudflare Tunnel）。
- **自动化与 GitHub 触发器** — 基于 Atmos 终端 Agent 的本地定时自动化，可选配 GitHub App Webhook 事件触发。
- **Appshots** — 桌面端跨应用快照，轻量剪贴板引用，开发过程中快速记录。

## 开始使用

### 下载

当前最新桌面版： [查看最新 Release](https://github.com/AruNi-01/atmos/releases/latest)。

### Homebrew 安装

```bash
brew install --cask AruNi-01/tap/atmos
```

### 桌面端（macOS 安装脚本）

```bash
curl -fsSL https://install.atmos.land/install-desktop.sh | bash
```

此安装器仅适用于 **macOS**（Intel & Apple Silicon）。它会下载并将 App 解压至 `/Applications`。

**Linux/Windows** 用户请直接从 GitHub Releases 下载安装包：
[https://github.com/AruNi-01/atmos/releases](https://github.com/AruNi-01/atmos/releases)

### 本地 Web 运行时

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

### 快速上手

#### 桌面端

1. 通过 Homebrew 或安装脚本安装 Atmos。
2. 启动桌面端，创建或打开一个工作区。
3. 连接项目后，在同一界面中使用终端与 Agent。

#### 本地 Web 运行时

1. 通过安装脚本安装。
2. 运行时会自动启动（或手动执行 `~/.atmos/bin/atmos runtime ensure`）。
3. 在浏览器中打开显示的 URL（默认：`http://127.0.0.1:30303`）。
4. 创建工作区，开始使用 Agent。

### 从源码运行

> **前置依赖**：[just](https://github.com/casey/just) — `brew install just`（macOS）/ `cargo install just`

```bash
## 安装依赖
bun install
cargo fetch

## Web 运行
just dev-api
just dev-web

# Desktop 运行
just dev-web
just dev-desktop
```

**不使用 `just` 时：**

```bash
# API
cargo run --bin api -- --cleanup-stale-clients true

# Web
cd apps/web && bun x next dev --turbopack --port 3030

# Desktop
bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json
```

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
