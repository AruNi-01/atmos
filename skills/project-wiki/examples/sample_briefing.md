# 研究简报：WebSocket Service Architecture

## 涉及的核心概念

- **real-time-messaging**: 项目通过 WebSocket 实现前后端实时双向通信，终端输出、文件变更通知等均依赖此通道
- **connection-lifecycle**: 从 HTTP 升级到断开，连接的生命周期管理（注册、心跳、清理）是稳定性的关键
- **concurrent-connection-registry**: 使用 RwLock + HashMap 维护连接映射，读多写少场景下优于 Mutex

## 在项目中的作用

WebSocket 是 ATMOS 的实时通信骨干。终端 PTY 输出、文件树变更、未来可能的协作编辑等，都通过 WebSocket 推送给前端。该模块分两层：infra 层提供连接管理的原语（WsManager、WsConnection），API 层处理 HTTP 升级和消息路由。理解该模块对开发任何实时功能都至关重要。

## 相关 Git 历史

- `a1b2c3d`: Add WsManager with RwLock for connection registry (2 weeks ago)
- `e4f5g6h`: Introduce heartbeat to detect zombie connections (1 month ago)
- `i7j8k9l`: Split WebClient and TerminalClient for routing (1 month ago)
- `m0n1o2p`: Add WsError enum and error handling (2 months ago)
- `q3r4s5t`: Initial WebSocket integration with Axum (3 months ago)

## 相关 PR / Issue（如有）

- PR #45: WebSocket heartbeat and connection timeout
- Issue #12: Reconnect after browser tab sleep causes duplicate messages

## 必须回答的研究问题

1. 这个模块/功能要解决什么问题？动机是什么？
2. 为什么选择当前的实现方式？考虑过哪些替代方案？有什么权衡？
3. 它如何与其他模块协作？数据怎么流动？
4. 它是如何演进至今的？最初设计和现在有什么不同？
5. 有哪些边界情况和已知限制？
6. 新贡献者最容易误解的地方是什么？

## 必读源文件

| 文件路径 | 阅读重点 |
|----------|----------|
| `crates/infra/src/websocket/manager.rs` | WsManager 实现，RwLock 使用、register/remove/send_to 的并发模型 |
| `crates/infra/src/websocket/connection.rs` | WsConnection 结构、last_heartbeat、client_type |
| `crates/infra/src/websocket/types.rs` | WsMessage、ClientType 定义 |
| `crates/infra/src/websocket/error.rs` | WsError 各变体及使用场景 |
| `apps/api/src/api/ws/handlers.rs` | HTTP 升级、socket 拆分、消息循环、心跳启动 |
| `apps/api/src/api/ws/mod.rs` | 路由注册 |
| `apps/api/src/main.rs` | WsManager 初始化、心跳配置 |

## 与其他概念的关联

- **依赖于**: http-upgrade — Axum WebSocketUpgrade 完成 HTTP 到 WebSocket 的协议切换
- **被使用于**: terminal-pty-bridge — 终端服务通过 WebSocket 将 PTY 输出推送给前端
- **被使用于**: file-tree-events — 文件树变更通知（若实现）将经 WebSocket 推送
