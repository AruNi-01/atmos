# ATMOS
## 背景

开发者在 IDE、浏览器 PR 页面以及各类终端窗口之间频繁切换，导致了严重的上下文割裂（Context Fragmentation）与认知负荷过载。

ATMOS 项目旨在构建一个“可视化终端工作空间”（Visual Terminal Workspace），主要功能：
- **Projectspace 和 Workspace 管理多个项目的多个工作空间：每个项目可创建多个工作空间，工作空间通过 git 的 worktree 实现，每个 worktree 可绑定多个终端，终端使用 tmux 确保持久性**；
- **主窗口** 是终端 或 简单的编辑器（非专业代码编辑器， ATMOS 强调 Vibe 感，而非以代码编辑为主，编辑器只是为了方便必要时手动编辑）或 Changes（git  diff）或 Preview（浏览器快速预览效果）；
- **交互式 Diff 审查**：Accept / Reject / Comment（**Comment to Agent**）
- **直接使用终端运行现有的 Code Agent**（Claude Code、Codex、OpenCode、Droid、Amp 等），而不是使用 ACP 协议创造一个可视化页面（通过 ACP 创建可视化页面除了方便观看外，不如原生终端运行体验好、功能齐全，还需要不断适配 Code Agent 的新增功能。而随着 VibeCoding 的逐渐发展，人们的注意力将不再是 Agent 的执行过程，而且拿到结果，Review）。直接 **继承用户终端的 shell 配置**，让用户使用自己喜欢的终端配置工作。
- **终端持久化管理**：基于 tmux，即使退出也不会 kill 终端；
- **自带内网穿透功能**：方便用户在任何地方、任何设备上访问电脑上的 Agent。
- **ATMOS Cli**：让大模型自主控制 ATMOS（AI Native 功能），后续实现。
- **脚本自动化**：自定义配置 Setup Script（创建 workspace 后复制环境变量、下载依赖等）、Run Script（一键启动前后端服务等）、Purge Script（清理 worktree、workspace 文件等）。
- **一键唤起外部编辑器**：支持一键在 VS Code, Zed, Cursor, IDEA 等主流 IDE 中打开项目

本项目不仅是对现有工具链的整合，更是对编程环境“栖息地化”的哲学实践，强调环境的沉浸感与掌控力。

## Slogan

Atmosphere for Agentic Builders

## 技术选型

**Web 前端**：
- 基础技术：React、Nextjs、
- 终端：Xterm.js（渲染终端）；
- 文本编辑：monaco-editor（做简单代码/文件编辑）；
- 主区域：react-mosaic（https://github.com/nomcopter/react-mosaic，做窗口管理/布局）；
- git diff：diffs.com（https://diffs.com/docs，代码 diff、diff 接受/拒绝、diff 代码添加评论到 Agent）、Zustand（状态管理）、@tanstack/react-query（Data fetch）；
- UI 库：https://coss.com/ui/docs（主要 UI 组件）、https://animate-ui.com/（动画 UI，个别组件需要）、https://magicui.design/（coss ui 不满意或缺失时使用 magic ui 补充）；
- Icon：lucide-react；
- Hotkey：react-hotkeys-hook（https://github.com/JohannesKlauss/react-hotkeys-hook）
**电脑桌面端**（**本期不实现，需考虑扩展性**，为后续上桌面端做铺垫）：
- 桌面 App：Tauri，打包成桌面 App；

**服务端**：
- 语言：Rust；
- 伪终端 PTY：portable-pty，需继承用户终端的 shell 配置；
- 多终端管理和持久化: tmux；
- Git 操作：[git2-rs](https://github.com/rust-lang/git2-rs)；
- Git Diff Accept/Reject 操作：patch-apply-rs（前端 diffs.com 只是内存中接受/拒绝，需要使用 patch-apply-rs 操作本地文件）；
- HTTP Web 框架：axum（https://github.com/tokio-rs/axum）
- WebSocket：tokio-tungstenite（https://github.com/snapview/tokio-tungstenite）；
- 内网穿透：localtunnel（https://github.com/localtunnel/localtunnel）；

**数据库**（本地优先）：
- 本地轻量数据库：sqlite，存储结构化数据到本地；

## UI 布局

1. 顶部左边展示 logo 和Projectspace 文案，顶部右边展示快捷打开 IDE 的按钮和设置

2. 左边 sidebar 是 projectspace 和 workspace，可以导入多个不同的 git 项目，每个项目可以建多个 workspace

3. 每个 worktree 匹配一个终端，展示在中间，打开终端时可选 Claude Code、Codex、Gemini Cli、OpenCode、Droid、Amp 等终端 Agent。默认打开原始终端。diff changes 和 文件编辑也在中间展示，不同 tab

4. 右边上部分是项目文件目录浏览和代码变化 Changes。右边下部分是一个小终端，有一个固定的 workspace script （可配置运行 setup run purge 脚本)

## 参考

- https://deepwiki.com/superset-sh/superset/1-overview
- https://deepwiki.com/gbasin/agentboard/1-overview
