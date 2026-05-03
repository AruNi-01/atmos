<h1 align="center" style="border-bottom: none; padding-bottom: 0;">ATMOS</h1>
<p align="center" style="font-size: 1.25em; color: #666; margin-top: 8px;">Atmosphere for Agentic Builders</p>

<p align="center">
  <a href="https://github.com/AruNi-01/atmos/actions/workflows/release-desktop.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/AruNi-01/atmos/release-desktop.yml?branch=main&label=desktop%20release" alt="Desktop release workflow" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/releases/latest">
    <img src="https://img.shields.io/github/v/release/AruNi-01/atmos?display_name=tag&label=version" alt="Latest version" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/stargazers">
    <img src="https://img.shields.io/github/stars/AruNi-01/atmos?label=stars" alt="GitHub stars" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/AruNi-01/atmos?label=license" alt="License" />
  </a>
</p>

<p align="center">简体中文 | <a href="./README.md">English</a></p>

![Atmos 截图](./apps/landing/src/assets/img/atmos_preview.png)

## 功能亮点

- **多工作区开发** — 基于 Git worktree 的环境隔离，实现多环境下的 Agent 并行执行。
- **Tmux 持久化会话** — 容错式终端管理，会话中断后可无缝恢复。
- **内置轻量级编辑器** — 文件预览与行内编辑，随时随地切换回原始人 coding 模式。
- **集成 Git 工作流** — Diff 视图、提交辅助、代码审查与 GitHub PR 管理一体化。
- **技能管理系统** — 一键启用/禁用或删除 Agent 技能，灵活控制能力集合。
- **全局 Agent 聊天面板** — 任意位置发起非终端 Chat 对话，基于 ACP 复用你的 Code Agent CLI。
- **全局搜索/操作控制面板** — 键盘驱动的工作流，快速搜索与执行 Atmos 功能。
- **用量分析看板** — AI 编码订阅额度跟踪、各 Agent Token 消耗与费用预估。
- **Agent 状态通知** — 基于钩子的状态监控，支持原生通知与自托管推送服务。
- **跨平台与远程访问** — Web 与桌面应用，移动端（规划中），集成内网穿透（Ngrok/Tailscale/Cloudflare Tunnel）。
- **Kanban 视图** - 在 Kanban 视图中快捷管理 Workspace 的状态、优先级、标签等信息。

## 开始使用

### 下载

当前最新桌面版： [查看最新 Release](https://github.com/AruNi-01/atmos/releases/latest)。

### Homebrew 安装

```bash
brew install --cask AruNi-01/tap/atmos
```

### 如何开始使用

1. 先按你的系统下载安装 Atmos。
2. 打开桌面端，创建或打开一个工作区。
3. 连接项目后，就可以在同一界面里使用终端、Agent 和 GitHub 工作流。

### 从源码运行

```bash
## 下载依赖
bun install
cargo fetch

## Web 运行
just dev-api
just dev-web

# Desktop 运行
just dev-web
just dev-desktop-tauri
```

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
