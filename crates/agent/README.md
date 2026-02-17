# Agent Crate

> **独立的垂直集成模块** - 负责与外部 AI Agent 服务的集成

## 📋 目录

- [定位](#定位)
- [职责](#职责)
- [架构位置](#架构位置)
- [模块结构](#模块结构)
- [依赖规则](#依赖规则)
- [使用示例](#使用示例)

---

## 定位

`agent` 是一个**独立的垂直集成模块**，与 `infra` 和 `core-engine` 平行，但不属于核心分层架构（L1-L3）。它专门负责与外部 AI Agent 服务的集成，特别是基于 ACP (Agent Client Protocol) 的 Agent。

**为什么独立？**
- Agent 管理涉及**外部协议** (ACP)，不是核心系统能力
- 需要调用**外部命令** (npm, npx, 二进制下载)
- **独立演进** - 未来可以支持其他 Agent 协议
- 避免污染核心分层架构的纯粹性

---

## 职责

### 1. ACP (Agent Client Protocol) 客户端
```rust
pub use acp_client::{
    run_acp_session,      // 运行 ACP 会话
    AcpSessionHandle,     // 会话句柄
    AcpSessionEvent,      // 会话事件
    AtmosAcpClient,       // ACP 客户端
    AcpToolHandler,       // 工具调用处理器
};
```

### 2. Agent 生命周期管理
```rust
pub use manager::AgentManager;

// AgentManager 提供:
// - list_agent_status()           // 列出 Agent 状态
// - install_agent(id)             // 安装 Agent
// - get_agent_config(id)          // 获取配置
// - set_agent_api_key(id, key)    // 设置 API Key
```

### 3. ACP Registry 集成
```rust
// AgentManager 提供:
// - list_registry_agents()                    // 列出 Registry 中的 Agent
// - install_registry_agent(registry_id, ...)  // 从 Registry 安装
// - remove_registry_agent(registry_id)        // 卸载
// - get_registry_agent_launch_spec(...)       // 获取启动规格
```

### 4. 安全存储
- 使用系统 keyring 存储 API Key
- 检测配置文件 (`~/.claude`, `~/.codex` 等)

---

## 架构位置

```
┌─────────────────────────────────────────────────────────┐
│                      apps/api                           │
│                   (Axum HTTP/WS Entry)                  │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  core-service (L3)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AgentService                                     │  │
│  │  - 封装 AgentManager                              │  │
│  │  - 提供统一的服务层接口                            │  │
│  └───────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐  ┌─────▼─────┐  ┌─────▼───────────┐
│    infra     │  │   core-   │  │     agent       │
│     (L1)     │  │  engine   │  │  (independent)  │
│             │  │   (L2)    │  │                 │
│ - DB        │  │ - PTY     │  │ - ACP Client    │
│ - WebSocket │  │ - Git     │  │ - Agent Manager │
│ - Cache     │  │ - FS      │  │ - Registry      │
│             │  │ - Search  │  │ - Keyring       │
└─────────────┘  └───────────┘  └─────────────────┘
```

**依赖关系**：
- `agent` **不依赖** `infra` / `core-engine` / `core-service`
- `core-service` 可依赖 `agent`（通过 `AgentService` 封装）
- `apps/api` 可直接使用 `agent` 类型（仅用于类型转换/事件处理）

---

## 模块结构

```
src/
├── lib.rs              # 公共导出
├── models.rs           # 数据模型 (AgentId, KnownAgent, AgentStatus, etc.)
├── manager.rs          # AgentManager - Agent 生命周期管理
└── acp_client/         # ACP 协议实现
    ├── client.rs       # ACP 客户端
    ├── process.rs      # Agent 进程生成
    ├── runner.rs       # 会话运行器
    ├── tools.rs        # 工具调用处理
    └── types.rs        # ACP 协议类型
```

---

## 依赖规则

### ✅ 允许的依赖
- Rust 标准库 (`std`, `tokio`, `async-trait`)
- 通用第三方库 (`serde`, `anyhow`, `tracing`, `reqwest`, `keyring`)
- ACP 协议库 (`agent-client-protocol`)

### ❌ 禁止的依赖
- **不要依赖** `infra`
- **不要依赖** `core-engine`
- **不要依赖** `core-service`

### ✅ 被依赖
- `core-service::service::agent::AgentService` 封装本模块
- `apps/api` 可直接导入类型（如 `AcpSessionEvent`）

---

## 使用示例

### 在 core-service 中使用

```rust
// crates/core-service/src/service/agent.rs
use agent::{AgentManager, AgentId, AgentInstallResult};

pub struct AgentService {
    manager: AgentManager,
}

impl AgentService {
    pub async fn install_agent(&self, id: AgentId) -> Result<AgentInstallResult> {
        self.manager.install_agent(id).await
            .map_err(|e| ServiceError::Processing(e.to_string()))
    }
}
```

### 在 apps/api 中使用 (直接类型导入)

```rust
// apps/api/src/api/ws/agent_handler.rs
use agent::{AcpSessionEvent, AcpSessionHandle, StreamUsage};

pub async fn agent_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| async move {
        let mut handle = AcpSessionHandle::new(socket);
        // ...
    })
}
```

### 通过 core-service 间接使用 (推荐)

```rust
// 未来优化：通过 core-service 重新导出
use core_service::{
    AcpSessionEvent, AcpSessionHandle, AgentId, AgentLaunchSpec
};
```

---

## 设计原则

1. **协议隔离** - ACP 协议细节不泄露到其他模块
2. **外部集成** - npm、二进制下载等外部操作在此模块完成
3. **安全存储** - API Key 通过 keyring 安全存储
4. **可测试性** - `AgentManager` 提供同步接口，易于测试
5. **可扩展性** - 未来可支持其他 Agent 协议

---

## 相关文档

- [ACP 协议规范](https://agentclientprotocol.com/)
- [Agent Manager API](./src/manager.rs)
- [ACP Client 实现](./src/acp_client/)
- [主架构文档](../../README.md)
