# Research Briefing: 工作区生命周期

## Involved Concepts
- core-service
- workspace-lifecycle
- layered-architecture

## Role in the Project
工作区是 Atmos 的核心业务单元。该模块负责管理从项目创建到工作区启动、运行、停止及归档的全生命周期。它协调数据库状态、文件系统目录和底层 PTY 资源。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 workspace 的提交)

## Research Questions
1. `WorkspaceService` 是如何处理并发创建请求的？
2. 工作区的状态机是如何设计的（Pending, Running, Stopped, Archived）？
3. 工作区与项目 (Project) 之间的 1:N 关系是如何在代码中维护的？
4. 如何清理已停止工作区的残留资源？

## Required Source Files
- `crates/core-service/src/service/workspace.rs`
- `crates/core-service/src/service/project.rs`
- `crates/infra/src/db/repo/workspace_repo.rs`
- `crates/infra/src/db/entities/workspace.rs`
- `crates/core-service/src/lib.rs`
