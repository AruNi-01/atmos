# ATMOS 技术方案文档

**最后更新**: 2026-01-17
**版本**: 1.1（更新前端架构为 Monorepo）
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
│                         ATMOS System                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Apps Layer (Monorepo)                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│  │  │   Web    │  │  Desktop │  │    CLI   │  │   API Service    │  │  │
│  │  │ (Next.js)│  │ (Tauri)  │  │   (atmos)   │  │   (Rust/Axum)    │  │  │
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
└─────────────────────────────────────────────────────────────────────────┘
```

### 分层设计

| 层级           | 技术栈                                  | 职责              |
| ------------ | ------------------------------------ | --------------- |
| **表现层**      | React, Next.js, TypeScript           | UI 组件、状态管理、用户交互 |
| **终端渲染**     | Xterm.js                          | 高性能终端模拟与渲染      |
| **窗口管理**     | react-resizable-panels + @dnd-kit    | 灵活的面板布局与拖拽      |
| **编辑与 Diff** | monaco-editor, diffs.com             | 文本编辑与代码审查       |
| **通信层**      | WebSocket (Axum + tokio-tungstenite) | 实时双向通信          |
| **业务逻辑**     | Rust (Axum)                          | 项目/工作区管理、Git 操作 |
| **终端管理**     | PTY (portable-pty) + tmux            | 伪终端创建与会话持久化     |
| **数据持久化**    | SQLite (SeaORM)                      | 本地元数据与配置存储      |

### 项目目录结构

所有项目组件统一组织在 Monorepo 中，便于版本管理、依赖协调和 AI Agent 访问：

```
atmos/
│
├── crates/                          # 🔧 Rust 共享包
│   ├── infra/                       # 🔧 基础设施层（DB、WebSocket、缓存、定时任务、消息队列等）
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── db/                  # 数据库相关
│   │   │   │   ├── mod.rs
│   │   │   │   ├── entities/        # SeaORM Entity 定义
│   │   │   │   │   ├── mod.rs
│   │   │   │   │   ├── base.rs      # 🌟 基础 Entity（guid、create_time、update_time、is_deleted）
│   │   │   │   │   ├── user.rs
│   │   │   │   │   ├── project.rs
│   │   │   │   │   ├── workspace.rs
│   │   │   │   │   └── terminal.rs
│   │   │   │   ├── repo/            # 数据访问层（Repo）
│   │   │   │   │   ├── mod.rs
│   │   │   │   │   ├── base.rs      # BaseRepo trait
│   │   │   │   │   ├── user.rs
│   │   │   │   │   ├── project.rs
│   │   │   │   │   └── workspace.rs
│   │   │   │   ├── migration/       # 数据库迁移脚本
│   │   │   │   │   ├── mod.rs
│   │   │   │   │   ├── m20250101_000001_create_user_table.rs
│   │   │   │   │   ├── m20250101_000002_create_project_table.rs
│   │   │   │   │   └── m20250101_000003_create_workspace_table.rs
│   │   │   │   ├── pool.rs          # DB 连接池初始化
│   │   │   │   └── error.rs         # DB 层错误定义
│   │   │   │
│   │   │   ├── websocket/           # 🌟 WebSocket 管理层
│   │   │   │   ├── mod.rs
│   │   │   │   ├── manager.rs       # 全局连接管理器
│   │   │   │   ├── connection.rs    # WebSocket 连接抽象
│   │   │   │   ├── message.rs       # 消息定义和类型
│   │   │   │   ├── subscription.rs  # 订阅管理
│   │   │   │   ├── heartbeat.rs     # 心跳检测
│   │   │   │   └── error.rs         # WebSocket 错误定义
│   │   │   │
│   │   │   ├── cache/               # (未来) 缓存层
│   │   │   │   ├── mod.rs
│   │   │   │   └── redis.rs
│   │   │   │
│   │   │   ├── jobs/                # (未来) 定时任务调度器
│   │   │   │   ├── mod.rs
│   │   │   │   ├── scheduler.rs
│   │   │   │   └── tasks.rs
│   │   │   │
│   │   │   ├── queue/               # (未来) 消息队列
│   │   │   │   ├── mod.rs
│   │   │   │   └── rabbitmq.rs
│   │   │   │
│   │   │   └── config.rs            # 基础设施配置
│   │   │
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   ├── core-engine/                 # 技术引擎层（跨应用复用的技术能力）
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── pty/                 # 伪终端引擎
│   │   │   │   ├── mod.rs
│   │   │   │   ├── session.rs       # PTY 会话状态
│   │   │   │   ├── manager.rs       # PTY 进程池管理
│   │   │   │   └── error.rs
│   │   │   ├── git/                 # Git 操作封装
│   │   │   │   ├── mod.rs
│   │   │   │   ├── repo.rs          # Git 仓库操作
│   │   │   │   ├── clone.rs         # 克隆仓库
│   │   │   │   └── error.rs
│   │   │   ├── tmux/                # Tmux 会话管理
│   │   │   │   ├── mod.rs
│   │   │   │   ├── session.rs
│   │   │   │   └── error.rs
│   │   │   ├── fs/                  # 文件系统操作
│   │   │   │   ├── mod.rs
│   │   │   │   ├── watcher.rs       # 文件监听
│   │   │   │   └── error.rs
│   │   │   ├── types.rs             # 通用类型定义
│   │   │   └── error.rs             # 统一错误处理
│   │   │
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   └── core-service/                # 业务逻辑层（可复用的业务规则）
│       ├── src/
│       │   ├── lib.rs
│       │   ├── auth.rs              # 认证业务逻辑
│       │   │                        # - validate_password()
│       │   │                        # - issue_token()
│       │   │                        # - refresh_token()
│       │   ├── project.rs           # 项目业务逻辑
│       │   │                        # - validate_project_name()
│       │   │                        # - create_project()
│       │   │                        # - list_user_projects()
│       │   ├── workspace.rs         # 工作区业务逻辑
│       │   │                        # - create_workspace()
│       │   │                        # - init_git_worktree()
│       │   ├── terminal.rs          # 终端业务逻辑
│       │   │                        # - open_pty_session()
│       │   │                        # - handle_terminal_resize()
│       │   ├── error.rs             # 业务错误定义
│       │   └── types.rs             # 业务相关类型
│       │
│       ├── Cargo.toml
│       └── README.md
│
├── apps/                            # 应用程序
│   │
│   ├── api/                         # 🌐 Web API 服务 (Rust/Axum)
│   │   ├── src/
│   │   │   ├── main.rs              # 应用入口
│   │   │   ├── lib.rs               # 库导出
│   │   │   ├── app_state.rs         # 应用状态（DB、Service 实例等）
│   │   │   ├── error.rs             # API 层错误处理 (impl IntoResponse)
│   │   │   │
│   │   │   ├── service/             # 🔹 API 特定业务逻辑层
│   │   │   │   ├── mod.rs
│   │   │   │   ├── auth_srv.rs      # API 认证服务
│   │   │   │   │                    # - api_login()
│   │   │   │   │                    # - 权限检查
│   │   │   │   │                    # - 审计日志
│   │   │   │   ├── project_srv.rs   # API 项目服务
│   │   │   │   ├── workspace_srv.rs # API 工作区服务
│   │   │   │   └── terminal_srv.rs  # API 终端服务
│   │   │   │
│   │   │   ├── api/                 # 🔹 HTTP 接入层
│   │   │   │   ├── mod.rs           # 路由聚合
│   │   │   │   ├── dto.rs           # 🌟 全局共享 DTO
│   │   │   │   │                    # - BaseReq, BasePageReq
│   │   │   │   │                    # - BasePageResp, ApiResult<T>
│   │   │   │   │                    # - BaseLocaleDesc 等
│   │   │   │   ├── auth/
│   │   │   │   │   ├── handlers.rs  # login, logout, refresh_token
│   │   │   │   │   └── dto.rs       # LoginReq, LoginResp
│   │   │   │   ├── project/
│   │   │   │   │   ├── handlers.rs  # create, list, get, update, delete
│   │   │   │   │   └── dto.rs       # CreateProjectReq, ProjectResp
│   │   │   │   ├── workspace/
│   │   │   │   │   ├── handlers.rs
│   │   │   │   │   └── dto.rs
│   │   │   │   └── terminal/
│   │   │   │       ├── handlers.rs  # 调整窗口大小等 HTTP 接口
│   │   │   │       ├── ws.rs        # WebSocket 握手与消息泵
│   │   │   │       └── dto.rs
│   │   │   │
│   │   │   ├── middleware/          # 中间件
│   │   │   │   ├── mod.rs
│   │   │   │   ├── auth.rs          # JWT 认证
│   │   │   │   ├── logging.rs       # 请求日志 (tracing)
│   │   │   │   ├── context.rs       # Request ID, Timer
│   │   │   │   └── error.rs         # 错误处理中间件
│   │   │   │
│   │   │   ├── config/              # 配置管理
│   │   │   │   ├── mod.rs
│   │   │   │   └── app_config.rs    # 配置结构体 (serde + dotenv)
│   │   │   │
│   │   │   ├── utils/               # 工具函数
│   │   │   │   ├── mod.rs
│   │   │   │   ├── id_gen.rs        # ID 生成（NanoID/UUID）
│   │   │   │   ├── jwt.rs           # JWT 相关函数
│   │   │   │   └── password.rs      # 密码哈希函数
│   │   │   │
│   │   │   └── tests/               # 集成测试
│   │   │       ├── common.rs        # 测试工具函数
│   │   │       ├── auth_test.rs
│   │   │       └── project_test.rs
│   │   │
│   │   ├── .env                     # 环境变量
│   │   ├── .env.example             # 环境变量模板
│   │   ├── Cargo.toml
│   │   ├── AGENT.md                 # AI 代理相关文档
│   │   └── README.md
│   │
│   ├── web/                         # 💻 Web 应用 (Next.js)
│   │   ├── src/
│   │   │   ├── app/                 # Next.js App Router
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── projects/
│   │   │   │   ├── workspace/
│   │   │   │   └── api/             # API 路由（可选）
│   │   │   ├── components/          # Web 专有组件
│   │   │   ├── hooks/               # Web 自定义 Hooks
│   │   │   ├── types/               # Web 类型定义
│   │   │   │   └── api.ts           # API 类型定义
│   │   │   ├── api/                 # Web 客户端
│   │   │   │   └── client.ts        # API 客户端
│   │   │   └── lib/                 # Web 工具函数
│   │   ├── public/                  # 静态资源
│   │   ├── components.json          # shadcn 别名配置
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── desktop/                     # 🖥️ Tauri 桌面应用
│   │   ├── src/                     # React 前端入口
│   │   │   ├── main.tsx
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   ├── App.tsx
│   │   │   ├── types/
│   │   │   │   └── commands.ts      # 由 build.rs 自动生成
│   │   │   └── styles/
│   │   ├── src-tauri/               # Tauri 原生层 (Rust)
│   │   │   ├── src/
│   │   │   │   ├── main.rs          # Tauri 应用入口
│   │   │   │   ├── commands         # 与 React 前端通信的命令，手写 Rust Command
│   │   │   │   │   ├── auth.rs      # 用户认证相关命令
│   │   │   │   │   ├── project.rs   # 项目管理相关命令
│   │   │   │   │   ├── workspace.rs # 工作区管理相关命令
│   │   │   │   ├── state.rs         # Tauri 状态管理
│   │   │   │   └── error.rs         # 错误定义
│   │   │   ├── cmd_build.rs         # 生成 TypeScript 类型 command 的脚本
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                         # 🛠️ CLI 工具 (atmos 命令)
│   │   ├── src/
│   │   │   ├── main.rs              # CLI 入口
│   │   │   ├── commands/            # 子命令实现
│   │   │   │   ├── mod.rs
│   │   │   │   ├── project.rs       # atmos project create/list/delete
│   │   │   │   ├── workspace.rs     # atmos workspace new/list
│   │   │   │   └── terminal.rs      # atmos terminal start
│   │   │   ├── config.rs            # CLI 配置管理
│   │   │   ├── ui.rs                # 终端输出格式（TUI 可选）
│   │   │   └── error.rs
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   ├── docs/                        # 📚 文档站点 (可选)
│   │   └── ...
│   │
│   └── landing/                     # 🏠 官方主页
│       └── ...
│
├── packages/                        # 🎁 JavaScript 共享包
│   ├── ui/                          # UI 组件库 (@workspace/ui)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/              # shadcn 原子组件
│   │   │   │   ├── coss/            # Coss UI 风格组件
│   │   │   │   └── animate/         # 动画类 UI 组件
│   │   │   ├── lib/                 # 工具函数 (cn 等)
│   │   │   └── styles/
│   │   │       └── globals.css      # Tailwind v4 + 主题 tokens
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   └── package.json
│   │
│   ├── shared/                      # 通用工具和 Hooks (@workspace/shared)
│   │   ├── src/
│   │   │   ├── hooks/               # React Hooks (useAsync, useLocalStorage 等)
│   │   │   ├── utils/               # 工具函数 (cn, formatDate 等)
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── config/                      # 共享配置 (@workspace/config)
│   │   ├── tailwind/
│   │   ├── eslint/
│   │   └── package.json
│   │
│   └── i18n/                        # 国际化配置 (@workspace/i18n)
│       ├── src/
│       │   ├── locales/
│       │   │   ├── en.json
│       │   │   └── zh.json
│       │   └── index.ts
│       └── package.json
│
├── docs/                            # 📖 项目文档
│   ├── README.md                    # 项目概述
│   ├── architecture/                # 架构文档
│   │   ├── overview.md              # 整体架构
│   │   ├── backend-layers.md        # 后端分层说明
│   │   ├── data-flow.md             # 数据流
│   │   └── database-schema.md       # 数据库架构
│   ├── api/                         # API 文档
│   │   ├── auth.md
│   │   ├── project.md
│   │   ├── workspace.md
│   │   ├── terminal.md
│   │   └── openapi.json             # OpenAPI 规范
│   ├── development/                 # 开发指南
│   │   ├── setup.md                 # 本地开发环境搭建
│   │   ├── architecture.md          # 开发架构说明
│   │   ├── testing.md               # 测试指南
│   │   └── contribution.md          # 贡献指南
│   └── deployment/                  # 部署指南
│       ├── docker.md
│       ├── env-vars.md
│       └── scaling.md
│
├── specs/                           # 📋 项目规格与设计文档
│   ├── design/                      # UI/UX 设计相关
│   │   ├── ui-mockups/              # UI 原型、设计稿
│   │   ├── design-system.md         # 设计系统文档
│   │   └── brand.md                 # 品牌规范
│   ├── prd/                         # 产品需求文档
│   │   ├── mvp-scope.md             # MVP 范围定义
│   │   ├── PRD-V1.0.md              # 产品需求文档 v1.0
│   │   ├── PRD-V1.1.md              # (未来版本)
│   │   └── features/                # 功能规格
│   ├── tech/                        # 技术规格和技术方案
│   │   ├── TechPlan-V1.0.md         # 技术方案 v1.0
│   │   ├── TechPlan-V1.1.md         # 技术方案 v1.1
│   │   ├── database-schema.md       # 数据库设计
│   │   ├── api-design.md            # API 设计规范
│   │   └── architecture.md          # 架构设计文档
│   └── changelog.md                 # 规格变更日志
│
├── scripts/                         # 🔧 脚本和工具
│
├── docker/                          # 🐳 Docker 相关
│   ├── Dockerfile.api               # API 容器化
│   ├── Dockerfile.web               # Web 容器化（可选 SSR）
│   └── docker-compose.yml
│
├── .github/                         # GitHub 配置
│   ├── workflows/
│   │   ├── test.yml                 # 测试流程
│   │   ├── lint.yml                 # 代码检查
│   │   └── release.yml              # 发布流程
│   └── pull_request_template.md
│
├── .gitignore
├── .env.example                     # 全局环境变量模板
├── .toolversions                    # 版本管理 (asdf/mise)
├── package.json                     # Bun workspace 配置
├── Cargo.toml                       # Rust workspace 配置
├── Cargo.lock
├── justfile                         # 任务运行器
├── CONTRIBUTING.md                  # 贡献指南
├── LICENSE
└── README.md                        # 项目主说明

**结构设计原则**：

- **Monorepo 架构**：前端使用 Bun workspace，Rust 使用 Cargo workspace
- **代码共享**：Web/Desktop/Landing 共享 `packages/*`，API/CLI/Desktop-tauri 共享 `crates/*`
- **UI 统一管理**：所有原子 UI 组件统一存放在 `packages/ui/components/ui`
- **清晰边界**：`apps/` 与 `packages/` 职责分离，各自独立构建
- **文档优先**：`docs/` 目录作为项目知识中枢，便于 Agent 理解项目上下文

---

## 核心技术栈

### 前端 (Monorepo)

| 层级 | 组件 | 技术 | 用途 | 关键特性 |
|------|------|------|------|---------|
| **应用层** | Web | Next.js 16 + React 19 + Tailwind CSS 4 | 主 Web 应用 | SSR/SSG、路由、API routes |
| Desktop | Tauri | 桌面应用 | 复用 Web 前端 + 原生 OS 集成 |
| CLI | Rust (clap) | 命令行工具 | Agent/LLM 友好 (JSON/Table 输出) |
| **共享 UI 包** | 原子组件 | shadcn/ui (zinc color) | 基础 UI 组件 | 统一存放于 `@workspace/ui/components/ui` |
| 风格组件 | Coss UI | Coss 风格组件 | 存放于 `@workspace/ui/components/coss` |
| 动画组件 | Animate UI | 交互动画 | 存放于 `@workspace/ui/components/animate` |
| 工具函数 | `packages/ui/lib/utils.ts` | cn 拼接等 | 供所有前端应用共享 |
| 主题 | next-themes | 深色/浅色主题 | 供所有前端应用共享 |
| **共享逻辑包** | 状态管理 | Zustand | 全局状态 | 存放于 `packages/shared` |
| 数据获取 | TanStack Query | 异步数据管理 | 缓存、重试、实时更新 |
| 国际化 | next-intl | 多语言支持 | 存放于 `packages/i18n` |
| 工具函数 | `packages/shared/src/utils/` | 共享工具 | 供所有前端应用共享 |
| **基础组件** | 终端 | Xterm.js / xterm.js | 终端渲染 | 完整 ANSI 支持 |
| 编辑器 | monaco-editor | 代码编辑 | 语法高亮、快速响应 |
| 窗口管理 | react-resizable-panels + @dnd-kit | 动态面板布局 | 拖拽/Resize 调整、持久化 |
| 窗口多 Pane 管理 | react-grid-layout | 窗口多 Pane 管理 | 多 Pane/Window 管理，支持拖拽调整位置，快速水平/垂直 split |
| Project Workspace Sidebar | @dnd-kit/sortable | 拖拽排序 | 项目/工作区列表排序 |
| File Tree | headless-tree | 文件树 | 拖拽、重命名、搜索 |
| Tabs | Coss UI - Tabs | 已开窗口管理 | 拖拽调整位置 |
| Diff | diffs.com | 代码变更审查 | Accept/Reject/Comment |
| 快捷键 | react-hotkeys-hook | 键盘快捷操作 | 全局热键管理 |
| 图标 | lucide-react | 矢量图标 | 一致的视觉风格 |
| **工程化** | 包管理 | Bun | 依赖管理 | 高性能 workspace 支持 |
| 构建 | Next.js/Turbo | 应用构建 | 按需编译、增量构建 |
| 类型 | TypeScript 5 | 类型安全 | 严格模式 |


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

## Websocket 架构

完整的 WebSocket 架构：

```text
┌─────────────────────────────────────────────────────┐
│                    Producers                         │
│  (任何地方产生消息的代码)                             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│          infra/websocket/manager.rs                  │
│  (广播/单播/主题订阅)                                 │
│  - WsManager                                         │
│  - WsConnection                                      │
│  - WsMessage                                         │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┼──────────┬────────────┐
        │          │          │            │
        ▼          ▼          ▼            ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │  API   │ │Desktop │ │  CLI   │ │Mobile? │
    │ (HTTP  │ │(Tauri  │ │(HTTP   │ │(HTTP   │
    │Upgrade)│ │IPC or  │ │轮询)   │ │Upgrade)│
    │        │ │ HTTP)  │ │        │ │        │
    └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │          │
        └──────────┴──────────┴──────────┘
                   │
          (所有连接都在 WsManager 中)
```

消息流向：

```text
用户操作（Web/Desktop/API）
    ↓
core-service / API service （业务逻辑）
    ↓
infra/websocket/manager （分发消息）
    ↓
所有订阅了该主题的连接 （接收消息）
    ↓
Web 页面 / Desktop 窗口 / CLI 输出
```

## 模块设计与实现

这里只保留模块职责和流程，不包含具体代码。

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

- 基于 `react-resizable-panels` + `@dnd-kit` 构建自定义布局系统，布局模型支持以下节点类型：
  - `SplitNode`：水平/垂直分割节点，包含子节点数组。
  - `TabGroupNode`：Tab 组节点，包含 tabs 列表和 activeTabId。
  - `LeafNode`：叶子节点，包含类型（终端、编辑器、diff、preview、files、mini-terminal）及绑定的资源（workspaceId、terminalId、filePath 等）。
- 每个 pane 包含类型及绑定的资源。
- 布局状态存于：
  - 前端全局状态（Zustand）。
  - 后端持久化（SQLite + SeaORM），按 workspace 维度保存。

#### 4.2 使用策略

- 初次进入 workspace 使用默认布局：
  - 左大终端，右上文件/Changes，右下空或 Preview。

- 用户可：
  - 拆分/合并 pane（水平/垂直）。
  - 改变 pane 类型（终端 ↔ 编辑器等）。
  - 拖拽 pane 到边缘 → Dock 吸附。
  - 拖拽 pane 到 tab bar → 合并到 Tab 组。
  - 拖拽 pane 到新区域 → 创建浮动窗口。
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

- ATMOS 只负责：
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

### Phase 1：基础架构（4–6 周）

**目标**：建立 Monorepo 基础架构，打通 Web 应用与 API 通信。

- 搭建 Bun workspace + Cargo workspace 基础结构。
- 完善 `packages/ui` 基础组件库（shadcn 原子组件）。
- Axum 服务、WebSocket 通道、PTY+tmux 管理。
- Project/Workspace CRUD + git worktree。
- 前端基础布局（Topbar / Sidebar / Main Area / 右侧小终端）。
- 终端 WebSocket 通信打通。

### Phase 2：核心功能（4–6 周）

**目标**：完成 Web 应用核心功能，提升日常开发体验。

- Changes + Diff 面板、Accept/Reject、Comment to Agent。
- Setup/Run/Purge 脚本配置与执行。
- react-resizable-panels + @dnd-kit 完整集成与布局持久化。
- 文件树浏览 + 编辑 + 简单 Preview。
- `packages/shared` 完善（共享类型、工具函数）。

### Phase 3：多端与高级功能（4–6 周）

**目标**：产品化、多端支持与远程能力。

- ATMOS CLI (`atmos`) 开发，让大模型远程控制 workspace。
- Tauri 桌面端集成，共享 Web 前端代码。
- 内网穿透（localtunnel），远程访问 UI 和 Agent。
- 一键唤起外部 IDE（VS Code、Zed、Cursor、IDEA）。
- `packages/i18n` 国际化支持。

---

## 关键技术细节（方案级）

### Shell 配置继承

- 采用「启动登录/交互式 shell」策略，让 shell 自己加载配置文件，而不是手写解析。
- 支持 bash / zsh / fish 等主流 shell。

### Tmux 集成

- 每个终端对应独立 session/window。
- 提供创建、发送命令、结束会话的统一封装。

### Xterm.js 替代方案

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

ATMOS 基于 Monorepo 架构，通过前后端分离、WebSocket 实时通信，提供了一个「可视化终端工作空间」。核心特性包括：

- **Monorepo 架构**：Bun workspace 管理 Web/Desktop/Landing，Cargo workspace 管理 API/CLI/Desktop-tauri，共享 `packages/*` 和 `crates/*`
- **多项目、多工作区、多终端隔离**：每个 workspace 对应独立 Git worktree
- **持久化终端**：基于 tmux，支持断线重连
- **交互式 Diff 审查**：前端接受/拒绝，后端落盘
- **脚本自动化**：Setup / Run / Purge 贯穿 workspace 生命周期
- **灵活布局**：react-resizable-panels + @dnd-kit 支持自由拆分/合并面板、Dock 吸附、Tab 合并、浮动窗口
- **原生 Agent 体验**：直接在终端内运行各类 Code Agent，而不单独建 UI
- **多端支持**：Web、Desktop (Tauri)、CLI 三端统一代码基础

实施分三个阶段（基础架构 → 核心功能 → 多端与高级功能），总耗时约 12–18 周，可逐步交付。
