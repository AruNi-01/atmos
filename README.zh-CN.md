# ATMOS

Atmosphere for Agentic Builders

简体中文 | [English](./README.md)

Atmos 截图

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
- **Canvas** — 跨项目的无限画布：把任意工作区/项目的终端会话固定为卡片，在同一张持久化画板上排布；Code Agent 可操作画布，画示意图、便签与布局，无需离开 Agent 工作流。
- **Atmos Computer** — 将 VPS 或任意机器注册到 Atmos Register Center，随后在 Desktop、Web 中一键切换并连接，在该 Computer 上使用终端、工作区与 Canvas 等，无论设备部署在何处，都可使用你的 Atmos 运行环境。
- **Review Workflow** — 在 Atmos 内置 Diff 界面中审查改动、在指定行留下行内评论，再交给 Code Agent 按评论修复。
- **Agent 状态追踪** — 通过 Agent Hooks 将运行中、空闲、等待授权、完成等状态实时同步到全站 UI；状态变化时推送通知，支持系统原生提醒，以及自托管推送（ntfy、Gotify 或自定义 Webhook）。
- **轻量级本地模型** — 一键启动 llama server，运行 Hugging Face 上的小参数模型，用于会话标题生成、工作区 TODO 抽取、Git 提交说明等轻量任务，无需为小事而配置云端 API。

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