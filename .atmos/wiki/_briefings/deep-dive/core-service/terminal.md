# Research Briefing: 终端服务实现

## Involved Concepts
- core-service
- terminal-streaming
- websocket-communication

## Role in the Project
终端服务层将底层的 PTY 能力转化为业务可用的终端会话。它负责管理多个终端实例，处理输入输出流的路由，并与 WebSocket 处理器对接。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 terminal 的提交)

## Research Questions
1. `TerminalService` 如何维护活跃终端的内存映射？
2. 如何实现终端输出的广播（如果支持多个观察者）？
3. 如何处理终端进程的异常退出？
4. 终端数据流是如何从 `core-engine` 传递到 `core-service` 再到 `api` 的？

## Required Source Files
- `crates/core-service/src/service/terminal.rs`
- `crates/core-service/src/service/ws_message.rs`
- `apps/api/src/api/ws/terminal_handler.rs`
- `crates/core-engine/src/pty/mod.rs`
