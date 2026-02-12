# Research Briefing: Tmux 会话管理

## Involved Concepts
- core-engine

## Role in the Project
Tmux 管理模块允许 Atmos 在后台持久化运行终端会话。即使前端断开连接，Tmux 也能保持进程运行。该模块负责 Tmux 会话的创建、附加、分离以及窗口/面板的管理。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 tmux 的提交)

## Research Questions
1. Atmos 是如何通过 Rust 调用 `tmux` 命令行工具的？
2. 如何实现会话的持久化与恢复？
3. 如何在 Tmux 面板中捕获输出并推送到 PTY 流？
4. 如何处理 Tmux 未安装的情况？

## Required Source Files
- `crates/core-engine/src/tmux/mod.rs`
- `crates/core-service/src/service/terminal.rs`
- `apps/api/src/api/ws/terminal_handler.rs`
