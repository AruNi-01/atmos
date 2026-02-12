---
title: 工作区服务
section: deep-dive
level: advanced
reading_time: 13
path: deep-dive/core-service/workspace
sources:
  - crates/core-service/src/service/workspace.rs
  - crates/infra/src/db/repo/workspace_repo.rs
  - crates/infra/src/db/entities/workspace.rs
  - crates/core-engine/src/git/mod.rs
  - crates/core-service/src/utils/workspace_name_generator.rs
  - apps/api/src/api/workspace/handlers.rs
updated_at: 2026-02-12T12:00:00Z
---

# 工作区服务

工作区服务是 ATMOS 的核心业务之一，负责工作区的创建、删除、归档、固定以及 worktree 协调。本文深入介绍数据流、名称生成、worktree 异步创建与错误处理。

## Overview

`WorkspaceService` 依赖 `WorkspaceRepo`、`ProjectRepo` 和 `GitEngine`。创建工作区时，先在 DB 中预留 name，再由后台任务 `ensure_worktree_ready` 调用 `create_worktree` 创建实际目录，避免阻塞 API 响应。工作区名称支持 Pokemon 风格自动生成或用户指定，需通过冲突检测确保唯一性。

## Architecture

```mermaid
graph TB
    subgraph API
        CreateHandler[POST /workspace]
    end

    subgraph WorkspaceService
        Create[create_workspace]
        Ensure[ensure_worktree_ready]
    end

    subgraph 数据层
        WorkspaceRepo[WorkspaceRepo]
        ProjectRepo[ProjectRepo]
        GitEngine[GitEngine]
    end

    CreateHandler --> Create
    Create --> WorkspaceRepo
    Create --> ProjectRepo
    Create --> Ensure
    Ensure --> GitEngine
```

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Handler
    participant S as WorkspaceService
    participant R as Repo
    participant G as GitEngine

    C->>H: create_workspace(project_guid, name)
    H->>S: create_workspace(...)
    S->>R: insert workspace (name reserved)
    R-->>S: model
    S->>S: spawn ensure_worktree_ready
    S-->>H: WorkspaceDto
    H-->>C: 201

    Note over S,G: async
    S->>G: create_worktree(repo, name, base)
    G-->>S: path
```

```mermaid
flowchart LR
    subgraph 名称逻辑
        Empty{name 空?}
        Gen[generate_workspace_name]
        User[使用用户 name]
        Conflict[冲突检测]
    end

    Empty -->|是| Gen
    Empty -->|否| User
    Gen --> Conflict
    User --> Conflict
```

## 创建流程

1. 根据 project_guid 获取项目与仓库路径
2. 收集已有分支与 DB 工作区名称，用于冲突检测
3. 确定最终 name：空则用 generator 生成，否则用用户输入
4. 在 DB 中插入 workspace 记录（name 已预留）
5. 后台 spawn `ensure_worktree_ready`，调用 `create_worktree`
6. 返回 `WorkspaceDto`（含 local_path）

## 错误处理

- 名称冲突超过 MAX_ATTEMPTS：返回 Validation 错误
- Worktree 已存在：GitEngine 返回错误
- 项目不存在：NotFound
- 数据库错误：通过 ServiceError 包装

## Key Source Files

| File | Purpose |
|------|---------|
| `crates/core-service/src/service/workspace.rs` | WorkspaceService 实现 |
| `crates/infra/src/db/repo/workspace_repo.rs` | 仓库方法 |
| `crates/core-engine/src/git/mod.rs` | create_worktree 调用 |
| `crates/core-service/src/utils/workspace_name_generator.rs` | 名称生成 |

## Next Steps

- **[终端服务](terminal.md)** — 工作区下的终端会话
- **[Git 引擎](../core-engine/git.md)** — worktree 技术细节
- **[数据库与 ORM](../infra/database.md)** — workspace 实体与迁移
