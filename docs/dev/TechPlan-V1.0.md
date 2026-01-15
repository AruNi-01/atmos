# VibeHabitat 技术方案文档

**最后更新**: 2026-01-14  
**版本**: 1.0（去除代码示例版）  
**状态**: 设计阶段 - 可指导实施  

---

## 目录

1. 系统架构概览  
2. 核心技术栈  
3. 模块设计与实现  
4. 数据流与通信  
5. 实施路线图  
6. 关键技术细节  
7. 性能与扩展性  
8. 部署与运维  

---

## 系统架构概览

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VibeHabitat System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Web Frontend (React + Next.js)                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │  TopBar  │  │  Sidebar │  │Main Area │  │  Right Sidebar   │  │  │
│  │  │(Logo+    │  │(Project/ │  │(Mosaic   │  │(Files + Changes/ │  │  │
│  │  │ IDE Btn) │  │ Workspace)  │ Layout)  │  │ Mini Terminal)   │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │  │
│  │       │            │               │                │               │  │
│  │       └────────────┴───────────────┴────────────────┘               │  │
│  │                          │                                           │  │
│  │                  WebSocket Connection                               │  │
│  └──────────────────────────┼──────────────────────────────────────────┘  │
│                             │                                             │
│                      ┌──────┴──────┐                                      │
│                      │             │                                      │
│  ┌───────────────────▼───────────────────────────────────────────────┐   │
│  │              Backend Server (Rust + Axum)                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │   │
│  │  │ WebSocket    │  │  Git         │  │  PTY/Shell   │            │   │
│  │  │ Manager      │  │  Operations  │  │  Manager     │            │   │
│  │  │(Broadcast &  │  │  (git2-rs,   │  │(portable-pty,│            │   │
│  │  │ Terminal Mgmt)  │  patch-apply) │  │ tmux, shell) │            │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘            │   │
│  │       │                  │                  │                     │   │
│  │       └──────────────────┴──────────────────┘                     │   │
│  │                          │                                        │   │
│  │  ┌──────────────────────┴──────────────────────┐                 │   │
│  │  │           Local Storage Layer               │                 │   │
│  │  │  ┌─────────────────────────┐  ┌─────────┐  │                 │   │
│  │  │  │   sqlite(SeaORM)        │  │  Tmux   │  │                 │   │
│  │  │  │(Metadata, Structured)   │  │Sessions │  │                 │   │
│  │  │  └─────────────────────────┘  └─────────┘  │                 │   │
│  │  └──────────────────────────────────────────────┘                 │   │
│  │                                                                    │   │
│  │  ┌──────────────────────────────────────────────────────────┐    │   │
│  │  │        Optional Features                                 │    │   │
│  │  │  • Localtunnel (内网穿透)                                │    │   │
│  │  │  • Code Agent Integration (Claude, Codex, etc.)         │    │   │
│  │  └──────────────────────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │          Desktop Application Layer (Future - Tauri)               │  │
│  │  Wraps Web Frontend + Native OS Integration                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 分层设计

| 层级           | 技术栈                                  | 职责              |
| ------------ | ------------------------------------ | --------------- |
| **表现层**      | React, Next.js, TypeScript           | UI 组件、状态管理、用户交互 |
| **终端渲染**     | Ghostty-Web                          | 高性能终端模拟与渲染      |
| **窗口管理**     | react-mosaic                         | 灵活的面板布局与拖拽      |
| **编辑与 Diff** | monaco-editor, diffs.com             | 文本编辑与代码审查       |
| **通信层**      | WebSocket (Axum + tokio-tungstenite) | 实时双向通信          |
| **业务逻辑**     | Rust (Axum)                          | 项目/工作区管理、Git 操作 |
| **终端管理**     | PTY (portable-pty) + tmux            | 伪终端创建与会话持久化     |
| **数据持久化**    | SQLite (SeaORM)                      | 本地元数据与配置存储      |

### 项目目录结构

所有项目组件统一组织在单一仓库中，便于版本管理、依赖协调和 AI Agent 访问：

```
vibe-habitat/
├── docs/                        # 项目文档（设计文档、API 文档、用户手册等）
├── README.md                    # 项目概述与快速开始
├── vibe-habitat-server/         # Rust 后端服务（精简分层架构）
│   ├── Cargo.toml               # 依赖管理 (Axum, Tokio, SeaORM, Tracing, Portable-pty)
│   ├── .env                     # 环境变量 (DATABASE_URL, LOG_LEVEL)
│   ├── .env.example             # 环境变量模板
│   └── src/
│       ├── main.rs              # [入口] 启动 Runtime, 初始化 Tracing, 绑定端口
│       ├── lib.rs               # [库入口] 导出模块，方便集成测试引用
│       ├── app_state.rs         # [状态注入] 存放 DB Pool, Service 实例, Core Engine 实例
│       ├── error.rs             # [统一错误] AppError 枚举 (impl IntoResponse)
│       ├── api/                 # [接入层] HTTP/WebSocket 接口
│       │   ├── mod.rs           # 路由聚合 (router.nest)
│       │   ├── auth/            # 认证模块
│       │   │   ├── mod.rs
│       │   │   ├── handlers.rs  # 解析参数 -> 调用 Service -> 返回 JSON
│       │   │   └── dto.rs       # LoginReq, TokenResp (高内聚：DTO 放这里)
│       │   ├── project/         # 项目模块
│       │   │   ├── mod.rs
│       │   │   ├── handlers.rs
│       │   │   └── dto.rs
│       │   ├── workspace/       # 工作区模块
│       │   │   ├── mod.rs
│       │   │   ├── handlers.rs
│       │   │   └── dto.rs
│       │   └── terminal/        # 终端模块
│       │       ├── mod.rs
│       │       ├── handlers.rs  # HTTP 接口 (如：调整窗口大小)
│       │       ├── ws.rs        # WebSocket 握手与消息泵
│       │       └── dto.rs
│       ├── service/             # [业务流程层] 处理业务逻辑，编排 Core 和 Repo
│       │   ├── mod.rs
│       │   ├── auth_srv.rs      # 登录逻辑 (校验密码, 签发 JWT)
│       │   ├── project_srv.rs   # 项目逻辑 (创建记录 + 初始化 Git 仓库)
│       │   ├── workspace_srv.rs # 工作区逻辑 (创建 worktree + 配置终端)
│       │   └── terminal_srv.rs  # 终端逻辑 (权限校验 + 调用 Core 打开 PTY)
│       ├── core/                # [技术引擎层] 纯 Rust 底层实现 (不依赖 Axum)，后续 CLI/Tauri 直接复用
│       │   ├── mod.rs
│       │   ├── pty/             # 伪终端引擎
│       │   │   ├── session.rs   # 单个 PTY 会话状态
│       │   │   └── manager.rs   # PTY 进程池管理
│       │   ├── git/             # Git 操作封装 (git2-rs / cli wrapper)
│       │   ├── tmux/            # tmux 会话管理
│       │   └── fs/              # 文件系统操作 (Workspace 文件读写/监听)
│       ├── entity/              # [SeaORM 实体] 通过 sea-orm-cli 生成，或手动定义
│       │   ├── mod.rs
│       │   ├── project.rs       # 项目实体 (Model, ActiveModel, Entity)
│       │   ├── workspace.rs     # 工作区实体
│       │   ├── terminal.rs      # 终端实体
│       │   └── user.rs          # 用户实体
│       ├── migration/           # [SeaORM 迁移] 数据库迁移文件
│       │   ├── mod.rs
│       │   ├── m20250101_000001_create_user_table.rs
│       │   ├── m20250101_000002_create_project_table.rs
│       │   └── m20250101_000003_create_workspace_table.rs
│       ├── repo/                # [数据访问层] 使用 SeaORM Entity 进行 CRUD
│       │   ├── mod.rs
│       │   ├── user_repo.rs     # 用户数据访问
│       │   ├── project_repo.rs  # 项目数据访问
│       │   └── workspace_repo.rs # 工作区数据访问
│       ├── middleware/          # [中间件]
│       │   ├── mod.rs
│       │   ├── auth.rs          # JWT 拦截器
│       │   ├── logging.rs       # 日志（tracing）
│       │   └── context.rs       # Request ID, Timer
│       ├── config/              # [配置]
│       │   ├── mod.rs
│       │   └── app_config.rs    # 配置结构体（serde+dotenv）
│       └── utils/               # [工具]
│           ├── mod.rs
│           └── id_gen.rs        # NanoID/UUID 生成
├── vibe-habitat-web/            # Next.js 前端应用
│   ├── app/                     # Next.js App Router
│   ├── components/              # React 组件
│   │   ├── layout/              # 布局组件（Topbar/Sidebar/Mosaic）
│   │   ├── terminal/            # 终端组件（Ghostty-Web/xterm.js）
│   │   ├── editor/              # Monaco 编辑器
│   │   ├── diff/                # Diffs.com 集成
│   │   └── workspace/           # 工作区相关组件
│   ├── lib/                     # 工具函数与 WebSocket 客户端
│   ├── stores/                  # Zustand 状态管理
│   ├── hooks/                   # 自定义 React Hooks
│   ├── package.json
│   └── README.md
├── .git/                        # Git 版本控制元数据
├── .gitignore                   # Git 忽略规则（依赖、构建产物、本地配置）
└── .github/                     # GitHub Actions CI/CD 配置
```

**结构设计原则**：

- **统一仓库**：前后端代码集中管理，减少协调成本
- **清晰边界**：`server/` 与 `web/` 目录物理分离，各自独立构建部署
- **文档优先**：`docs/` 目录作为项目知识中枢，便于 Agent 理解项目上下文
- **可扩展性**：未来可添加 `desktop/`（Tauri）、`cli/` 等子目录

---

## 核心技术栈

### 前端

| 组件          | 技术                              | 用途           | 关键特性                  |
| ----------- | ------------------------------- | ------------ | --------------------- |
| **框架**      | React 18 + Next.js 15           | 构建响应式 Web 应用 | SSR/SSG、路由、API routes |
| **终端**      | Ghostty-Web                     | 高性能终端渲染      | GPU 加速、完整 ANSI 支持     |
| **编辑器**     | monaco-editor                   | 轻量级代码编辑      | 语法高亮、快速响应             |
| **Sidebar**     | @dnd-kit/sortable              | 拖拽排序           | 拖拽排序、自定义排序算法     |
| **窗口管理**    | react-mosaic + react-resizable-panels | 动态面板布局 | 拖拽调整、resize 调整、持久化布局            |
| **Tabs 管理** | coss ui - Tabs(Underline Variant) | 已开窗口 Tabs 布局 | 拖拽调整位置                |
| **Diff 评审** | diffs.com                       | 代码变更查看       | Accept/Reject/Comment |
| **状态管理**    | Zustand                         | 全局状态         | 轻量、高效                 |
| **数据获取**    | @tanstack/react-query           | 异步数据管理       | 缓存、重试、实时更新            |
| **UI 组件库**  | Coss UI + Magic UI + Animate UI | 一致的界面        | 动画、辅助功能               |
| **图标**      | lucide-react                    | 矢量图标         | 一致的视觉风格               |
| **快捷键**     | react-hotkeys-hook              | 键盘快捷操作       | 全局热键管理                |
| **通信**      | WebSocket API                   | 实时通信         | 原生浏览器支持               |
| **包管理**     | Bun                             | 依赖包管理        | 高性能                   |

### 后端

| 组件 | 技术 | 用途 | 关键特性 |
|------|------|------|---------|
| **语言** | Rust | 高性能、内存安全 | 无 GC、强类型系统 |
| **Web 框架** | Axum | 现代异步 Web 框架 | 高性能、中间件灵活 |
| **异步运行时** | Tokio | 异步任务执行 | 高效并发、多线程 |
| **WebSocket** | tokio-tungstenite | 双向实时通信 | 高并发支持 |
| **PTY/Shell** | portable-pty | 伪终端创建 | 跨平台支持 |
| **会话管理** | tmux | 终端持久化 | 分离/附加会话 |
| **Shell 集成** | libc/nix | 继承用户 Shell 配置 | 环境与别名保留 |
| **Git 操作** | git2-rs | 编程式 Git 控制 | worktree 管理、提交 |
| **Patch 应用** | patch-apply-rs/patch | Diff 接受/拒绝 | 精确 patch 应用 |
| **HTTP 服务** | Axum Router | RESTful API | CORS、日志、错误处理 |
| **内网穿透** | localtunnel | 远程访问 | 快速隧道建立 |

### 数据存储

| 层级         | 技术              | 数据类型 | 使用场景            |
| ---------- | --------------- | ---- | --------------- |
| **元数据**    | SQLite (SeaORM) | 行表型  | 项目列表、工作区配置、布局状态 |
| **结构化数据**  | SQLite (SeaORM) | 行表型  | 工作历史、脚本配置、用户偏好  |
| **会话状态**   | tmux + 内存       | 进程状态 | 活跃终端、命令历史       |
| **Git 数据** | 本地 Git 库        | 二进制  | 代码版本、worktree   |

---

## 模块设计与实现

这里只保留模块职责和流程，不再包含具体代码。

### 1. 项目与工作区管理模块

#### 1.1 概念与数据模型（方案级）

- **Project**：
  - id、名称、本地路径、gitUrl、创建时间、配置（脚本模板等）。
  - 关联多个 Workspace。

- **Workspace**：
  - id、所属 Project、名称、worktree 路径。
  - 关联多个终端；关联 setup/run/purge 脚本；可选描述、布局配置。

- **Terminal**：
  - id、所属 Workspace、名称。
  - Agent 类型（Claude、Codex、Gemini CLI、OpenCode、Droid、Amp 或原生）。
  - tmux 会话标识、Shell 配置快照。

#### 1.2 API 设计（抽象）

- **Project 相关**：
  - 创建/列出/查看/删除项目。
  - 导入已有 Git 项目。

- **Workspace 相关**：
  - 在指定项目下创建/列出/查看/删除 workspace。
  - 创建时可指定分支与脚本配置。

- **Terminal 相关**：
  - 为 workspace 创建终端。
  - 终端生命周期管理、重连。

- **Script 执行**：
  - 针对 workspace 触发 setup/run/purge。
  - 通过 WebSocket 返回执行输出。

#### 1.3 创建工作区流程（逻辑）

1. 校验 Project 是否存在，路径为合法 Git 仓库。
2. 通过 git2-rs 创建 worktree 目录并挂在主 repo 下。
3. 可选：检出指定分支或 commit。
4. 写入 Workspace 元数据（SQLite + SeaORM）。
5. 如配置了 setup 脚本，触发执行，并将输出流向 Mini Terminal。

---

### 2. 终端与 PTY 管理模块

#### 2.1 架构设计

```
┌─────────────────────────────────────────────┐
│  Web Frontend Terminal Component           │
│  (终端渲染 + 用户输入)                     │
└────────────────┬──────────────────────────┘
                 │ WebSocket
┌────────────────▼──────────────────────────┐
│  Axum WebSocket Handler                   │
│  (消息路由，转发输入/输出)                │
└────────────────┬──────────────────────────┘
                 │
┌────────────────▼──────────────────────────┐
│  PTY Manager (Rust)                       │
│  (创建/管理 PTY)                          │
└────────────────┬──────────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
    ┌────▼────┐      ┌────▼────┐
    │  tmux   │      │ Shell   │
    │ Session │      │ Process │
    └─────────┘      └─────────┘
```

#### 2.2 关键设计点（无代码）

- 每个终端对应一个 tmux session/window 与一个 PTY。
- WebSocket 连接与终端会话一一或一对多映射（允许多个客户端监听同一终端）。
- 终端输出通过广播机制推送给所有订阅该终端的 Web 客户端。
- **Shell 配置继承**：
  - 通过启动登录/交互式 Shell，让其自动加载 `.bashrc` / `.zshrc` 等配置，而不是手写解析。

---

### 3. Git 与 Diff 管理模块

#### 3.1 Worktree 管理（概念）

- 针对每个 Project：
  - 维护一个主 Git 仓库路径。
  - 对每个 Workspace 创建一个独立 worktree 目录。

- 支持的操作：
  - 创建指定名称与分支的 worktree。
  - 列出所有 worktree（供管理/清理）。
  - 删除 worktree，对应清理 Workspace 数据。

#### 3.2 Diff 与 Patch（方案）

- **Diff 获取**：
  - 工作区全局 diff：用于 Changes 面板。
  - 单文件 diff：用于 Diff 面板。

- **Accept**：
  - 前端在 diffs.com 中选择接受的 hunk/文件。
  - 将 diff 或变更描述传回后端。
  - 后端在 worktree 中应用 patch 修改文件。

- **Reject**：
  - 对指定文件/变更使用 git 操作或反向 patch 恢复到 HEAD 状态。

- **错误处理**：
  - 对 patch 失败（冲突、上下文不匹配）场景返回详细错误，提示用户手动处理。

#### 3.3 Changes 视图（无代码）

- **展示内容**：
  - 文件路径、变更类型（修改/新增/删除/重命名）。
  - 是否暂存（staged/unstaged）。

- **交互**：
  - 点击文件 → 打开 Diff 面板。
  - 多选文件 → 批量 Accept/Reject。
  - 在某一行/块添加 Comment，可选择发送给 Agent。

---

### 4. 窗口布局管理模块

#### 4.1 布局状态

- 以 react-mosaic 的布局树表示 pane 分布。
- 每个 pane 包含类型（终端、编辑器、diff、preview、files、mini-terminal）及绑定的资源（workspaceId、terminalId、filePath 等）。
- 布局状态存于：
  - 前端全局状态（Zustand）。
  - 后端持久化（SQLite + SeaORM），按 workspace 维度保存。

#### 4.2 使用策略

- 初次进入 workspace 使用默认布局：
  - 左大终端，右上文件/Changes，右下空或 Preview。

- 用户可：
  - 拆分/合并 pane（水平/垂直）。
  - 改变 pane 类型（终端 ↔ 编辑器等）。
  - 保存当前布局为 workspace 默认布局。

- 支持一键恢复默认布局。

---

### 5. 编辑与代码审查模块

#### 5.1 编辑器（monaco-editor）

- **主要用途**：
  - 查看和轻度编辑文件内容（不追求 VS Code 级别 IDE 体验）。

- **功能点**：
  - 从后端拉取文件内容，支持多语言高亮。
  - 保存时调用后端文件写入接口。
  - 与 Changes 集成，在有未保存修改时提示。

#### 5.2 Diffs.com 集成

- VibeHabitat 只负责：
  - 提供 diff 数据给前端。
  - 接收用户在 diffs.com 交互后的「接受/拒绝/评论」结果。

- **业务规则**：
  - 单个 hunk 级别的 Accept/Reject。
  - 文件级 Accept/Reject。
  - Comment to Agent 按行号+上下文传回后端，用于触发 Agent。

---

### 6. 脚本自动化模块

#### 6.1 脚本类型与职责

- **Setup Script**：
  - 触发时机：创建 workspace 后自动或手动。
  - 用途：安装依赖、复制 env 文件、生成配置。

- **Run Script**：
  - 用于启动常驻进程（前端 dev server / 后端服务等）。
  - 通常与主终端配合使用，也可以绑定 mini-terminal。

- **Purge Script**：
  - 用于清理工作目录、缓存和中间产物。
  - 可选：删除 worktree + workspace 本身。

#### 6.2 配置与执行策略

- **配置来源**：
  - Project 级默认脚本。
  - Workspace 覆盖配置。

- **执行**：
  - 后端在对应 workspace worktree 路径下执行脚本命令。
  - 脚本输出通过 WebSocket 流式推送到 Mini Terminal。

- **状态反馈**：
  - 结束后更新 workspace 状态（如「已初始化」、「运行中」、「已清理」），供 UI 展示。

---

## 数据流与通信

### 整体数据流（概念）

```
User Input
   │
   ▼
React Component (事件处理)
   │
   ▼
Zustand Store（局部/全局状态）
   │
   ▼
API / WebSocket 请求
   │
   ▼
Axum 路由与 WebSocket Handler
   │
   ▼
业务逻辑层（Project / Workspace / Terminal / Git / Script）
   │
   ▼
数据层（SQLite + SeaORM / tmux / Git Repo）
```

### WebSocket 协议（方案）

- **消息基本结构**：
  - id：用于请求/响应匹配。
  - action：操作类型，如 terminal_input、terminal_output 等。
  - data：具体载荷。
  - error：错误信息（如果有）。

- **典型 action**：
  - 终端：terminal_input / terminal_output / terminal_resize。
  - 脚本：script_execute / script_output / script_status。
  - 状态：file_change / workspace_updated / project_list。
  - 心跳：ping / pong。

### 实时同步策略

- 使用 react-query 做数据缓存。
- 收到 file_change / workspace_updated 等 WebSocket 事件时，使对应 query 失效重新拉取。
- 对终端和脚本输出使用纯 WebSocket 流，不走 HTTP 轮询。

---

## 实施路线图

### Phase 1：MVP（4–6 周）

**目标**：有可用的多 workspace + 持久终端 + 基础 UI。

- Axum 服务、WebSocket 通道、PTY+tmux 管理。
- Project/Workspace CRUD + git worktree。
- 前端基础布局（Topbar / Sidebar / Main Area / 右侧小终端）。
- 终端 WebSocket 通信打通。

### Phase 2：增强功能（4–6 周）

**目标**：提升日常开发体验。

- Changes + Diff 面板、Accept/Reject、Comment to Agent。
- Setup/Run/Purge 脚本配置与执行。
- react-mosaic 完整集成与布局持久化。
- 文件树浏览 + 编辑 + 简单 Preview。

### Phase 3：高级功能（4–6 周）

**目标**：产品化与远程能力。

- 内网穿透（localtunnel），远程访问 UI 和 Agent。
- 一键唤起外部 IDE（VS Code、Zed、Cursor、IDEA）。
- VibeHabitat CLI（让大模型远程控制 workspace）。
- 为 Tauri 桌面端预留接口并做初步封装。

---

## 关键技术细节（方案级）

### Shell 配置继承

- 采用「启动登录/交互式 shell」策略，让 shell 自己加载配置文件，而不是手写解析。
- 支持 bash / zsh / fish 等主流 shell。

### Tmux 集成

- 每个终端对应独立 session/window。
- 提供创建、发送命令、结束会话的统一封装。

### Ghostty-Web 替代方案

- 若短期不可用，以 xterm.js 作为 Web 终端渲染替代方案。

### Git Patch 应用

- 使用 patch-apply-rs 或系统 patch 命令应用/回滚 diff。
- 对冲突与失败做出清晰错误提示。

---

## 性能与扩展性

### 性能优化点

- WebSocket 连接合理管理，避免单连接超大消息。
- 终端输出做分片与节流。
- 对大文件列表使用虚拟滚动。
- 按需加载项目/工作区数据（懒加载）。

### 扩展性设计

- Agent 抽象为「终端模式」，未来可扩展为统一的 Agent 接口。
- 预留插件机制，可让第三方扩展脚本模板、布局预设、Agent 集成。

---

## 部署与运维（方案）

### 部署形态

- 本地开发：直接运行 Rust 后端 + Next.js 前端 dev 模式。
- 生产/个人使用：推荐 Docker 打包（Rust 后端 + 构建后的静态前端），端口统一由反向代理暴露。

### 环境变量配置

- Server 端口、数据目录、Git 仓库根目录、tmux sock 路径等。
- 可选：localtunnel 开关与默认 subdomain。

### 日志与监控

- 后端使用结构化日志记录关键操作（终端创建、脚本执行、Git 操作失败）。
- 可选接入简单 metrics（连接数、脚本执行次数等）。

---

## 总结

VibeHabitat 通过前后端分离、WebSocket 实时通信，提供了一个「可视化终端工作空间」。核心特性包括：

- **多项目、多工作区、多终端隔离**：每个 workspace 对应独立 Git worktree。
- **持久化终端**：基于 tmux，支持断线重连。
- **交互式 Diff 审查**：前端接受/拒绝，后端落盘。
- **脚本自动化**：Setup / Run / Purge 贯穿 workspace 生命周期。
- **灵活布局**：react-mosaic 支持自由拆分/合并面板。
- **原生 Agent 体验**：直接在终端内运行各类 Code Agent，而不单独建 UI。

实施分三个阶段（MVP → 增强 → 高级），总耗时约 12–18 周，可逐步交付。
