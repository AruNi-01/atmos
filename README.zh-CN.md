# Atmos

[English](./README.md) | 简体中文

> **ATMOS - Atmosphere for Agentic Builders**

Atmos 是一个面向 AI 编程场景的开发工作台，整合了 Rust 后端、Next.js Web 前端与 Tauri 桌面壳，目标是在一个统一界面内完成从编码到协作交付的完整闭环。

---

## 目录

- [为什么选择 Atmos](#为什么选择-atmos)
- [功能亮点](#功能亮点)
  - [AI Agent 工作流](#ai-agent-工作流)
  - [Project Wiki 工作流](#project-wiki-工作流)
  - [全局搜索与快速操作](#全局搜索与快速操作)
  - [Run Preview](#run-preview)
  - [Git 智能能力（Commit Message + 自动 Review）](#git-智能能力commit-message--自动-review)
  - [GitHub 协作能力](#github-协作能力)
  - [终端与 tmux 会话编排](#终端与-tmux-会话编排)
  - [Skills 体系](#skills-体系)
  - [Usage 与 Token 可观测性](#usage-与-token-可观测性)
  - [桌面应用集成](#桌面应用集成)
- [技术架构](#技术架构)
- [Monorepo 结构](#monorepo-结构)
- [快速开始](#快速开始)
- [开发命令](#开发命令)
- [环境变量](#环境变量)
- [通信模型](#通信模型)
- [贡献指南](#贡献指南)
- [License](#license)

---

## 为什么选择 Atmos

许多 AI 编程工具只覆盖了单点能力，Atmos 则聚焦完整开发流程：

- 多项目、多工作区、分支上下文统一管理。
- 内置终端支持长期会话，不丢上下文。
- Agent 不止对话，还能参与真实开发动作。
- 在同一界面内完成代码修改、PR 与 CI 处理。

---

## 功能亮点

### AI Agent 工作流

- Agent 聊天支持流式输出、工具调用状态、权限申请与任务取消。
- Agent 管理支持安装/配置（本地与 registry 来源）。
- 支持自定义 ACP Agent（增删与 JSON 清单编辑）。
- 前端具备多 Agent/多厂商适配路径。

### Project Wiki 工作流

- 提供独立 Project Wiki 标签页，覆盖初始化、目录加载、页面渲染。
- Wiki 生成/更新可与终端流程联动。
- Wiki 页面状态可与 URL 同步，支持深链分享。

### 全局搜索与快速操作

- 统一命令面板：导航、工作区动作、主题/系统动作等。
- 在同一入口中支持文件搜索和代码内容搜索。
- 内置快速打开应用能力（Finder、Terminal、Cursor、VS Code、iTerm、JetBrains 等）。
- 键盘优先交互，适合高频切换场景。

### Run Preview

- 内置 Run Preview 面板，支持快速预览与执行相关流程。
- 适配“改完就跑、跑完即验”的高频反馈循环。

### Git 智能能力（Commit Message + 自动 Review）

- 基于变更上下文智能生成 Commit Message。
- Commit Message 支持 WebSocket 流式生成事件。
- 内置自动代码审查对话流程（技能选择 + 执行）。
- Review 报告可按项目上下文落盘到 `.atmos` 目录。

### GitHub 协作能力

- PR 全生命周期：列表、详情、创建、评论、合并/关闭/重开。
- Draft/Ready for review 状态切换与浏览器快捷跳转。
- GitHub Actions/CI：状态、详情、重跑。

### 终端与 tmux 会话编排

- WebSocket 双向终端通道（输入、resize、关闭、销毁）。
- 支持 tmux attach/create 与失败回退。
- 支持工作区级多终端会话管理。
- 启动时清理 stale tmux client，防止 PTY 资源耗尽。

### Skills 体系

- Skills 的列表、详情、启停、删除等管理能力。
- 支持启动时系统技能自动同步，及手动重新同步。
- 内置 Wiki / Code Review / Git Commit 相关系统技能检查。

### Usage 与 Token 可观测性

- Usage 概览查询、provider 开关、手动配置与自动刷新。
- Token usage 独立聚合并支持实时广播更新。
- 便于前端做跨页面实时数据刷新。

### 桌面应用集成

- Tauri 桌面应用可拉起本地 API sidecar。
- 支持系统托盘、通知、外部编辑器唤起。
- 内置 PATH 与 UTF-8 locale 兼容处理。
- 支持 API 直接托管静态前端资源用于打包分发。

---

## 技术架构

- **Backend**：Rust + Axum + Tokio + SeaORM migration
- **Infra (`crates/infra`)**：数据库、迁移、WebSocket 协议/服务、系统技能同步
- **Core Engine (`crates/core-engine`)**：PTY、tmux、Git、文件系统、搜索与应用打开能力
- **Core Service (`crates/core-service`)**：项目/工作区/Agent/终端/GitHub 业务编排
- **Agent (`crates/agent`)**：ACP 客户端、会话桥接、Agent 管理
- **Web (`apps/web`)**：Next.js 16 + React 19，WebSocket-first
- **Desktop (`apps/desktop`)**：Tauri 桌面壳 + 本地 sidecar API

---

## Monorepo 结构

```text
atmos/
├── apps/
│   ├── api/         # Axum API 入口（HTTP + WS）
│   ├── web/         # Next.js Web 应用
│   ├── desktop/     # Tauri 桌面端
│   ├── docs/        # 文档站
│   └── landing/     # 官网
├── crates/
│   ├── infra/       # DB/WS/基础设施
│   ├── core-engine/ # PTY/Git/FS/tmux 能力
│   ├── core-service # 业务服务层
│   └── agent/       # ACP/Agent 集成
├── packages/
│   ├── ui/          # 共享 UI
│   ├── shared/      # 共享前端工具
│   ├── i18n/        # 国际化包
│   └── config/      # 共享配置
└── docs/            # 架构与设计文档
```

---

## 快速开始

### 1) 前置环境

- Rust stable
- Bun
- Node.js
- tmux（推荐，获得完整终端体验）

### 2) 安装依赖

```bash
bun install
cargo fetch
```

### 3) 启动服务

```bash
just dev-api
just dev-web
# 可选
just dev-desktop
```

---

## 开发命令

```bash
just                 # 查看任务列表
just fmt             # 代码格式化
just lint            # 静态检查
just test            # 测试
just build-all       # 构建
```

---

## 环境变量

常见变量：

- `ATMOS_PORT`：API 监听端口
- `ATMOS_LOCAL_TOKEN`：本地 API token（桌面 sidecar 常用）
- `ATMOS_STATIC_DIR`：API 托管静态资源目录
- `ATMOS_DATA_DIR`：桌面模式运行数据目录

---

## 通信模型

Atmos 采用 **WebSocket-first**：

- 终端流式数据
- Agent 流式输出与工具调用事件
- Usage/Token 实时广播
- 工作区进度与状态通知

REST 主要用于非流式、初始化类场景。

---

## 贡献指南

欢迎提 Issue / PR。提交前建议执行：

```bash
just fmt
just lint
just test
```

建议在较大改动中补充：

- 改动动机与范围
- 受影响模块（`apps/*`, `crates/*`, `packages/*`）
- 验证与回归步骤

---

## License

[MIT](./LICENSE)
