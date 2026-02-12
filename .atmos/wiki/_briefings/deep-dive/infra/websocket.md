# Research Briefing: WebSocket 系统设计

## Involved Concepts
- websocket-communication
- terminal-streaming
- infra

## Role in the Project
WebSocket 系统是 Atmos 前后端实时交互的核心。它不仅负责终端数据的传输，还负责系统事件（如工作区状态变更）的推送。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 websocket 的提交)

## Research Questions
1. `WebSocketManager` 如何管理数千个并发连接？
2. 如何实现基于主题 (Topic) 的消息订阅机制？
3. 心跳检测和自动重连逻辑是如何在服务端实现的？
4. 消息的序列化与反序列化性能优化措施有哪些？

## Required Source Files
- `crates/infra/src/websocket/manager.rs`
- `crates/infra/src/websocket/handler.rs`
- `crates/infra/src/websocket/message.rs`
- `apps/api/src/api/ws/mod.rs`
- `crates/infra/src/websocket/service.rs`
