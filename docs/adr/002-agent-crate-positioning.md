# ADR-002: Agent Crate 作为独立垂直模块

**状态**: ✅ 已采纳
**日期**: 2025-02-18
**相关**: [ADR-001: 采用 Monorepo 架构](./001-monorepo.md)

---

## 背景 (Context)

在实现 AI Agent 集成功能时，我们创建了 `crates/agent` 模块。该模块负责：
- ACP (Agent Client Protocol) 客户端实现
- Agent 生命周期管理（安装、卸载、配置）
- ACP Registry 集成
- API Key 安全存储

**问题**：`agent` 模块在现有分层架构（L1: infra → L2: core-engine → L3: core-service）中的位置不明确。

---

## 决策 (Decision)

**将 `agent` 定位为独立的垂直集成模块**，与 `infra` 和 `core-engine` 平行，但不属于核心分层架构。

### 架构位置

```
                apps/api
                    ↓
            core-service (L3)
                    ↓
        ┌───────────┼───────────┐
        │           │           │
    infra (L1)  core-engine  agent
                                   (独立垂直模块)
```

### 依赖规则

| 方向 | 规则 | 说明 |
|------|------|------|
| `agent` → 其他 crates | ❌ 禁止 | 不依赖 infra/core-engine/core-service |
| 其他 crates → `agent` | ✅ 允许 | core-service 和 apps/api 可使用 |
| `agent` → 外部库 | ✅ 允许 | tokio, serde, reqwest, keyring, ACP 库等 |

---

## 理由 (Rationale)

### 1. **外部集成，非核心能力**

Agent 管理涉及：
- 外部协议 (ACP)
- 外部命令 (npm, npx)
- 二进制下载
- 系统级操作 (keyring)

这些**不是核心系统能力**，而是与外部服务的集成。

### 2. **独立演进**

Agent 协议可能快速变化：
- ACP 版本更新
- 新的 Agent 协议出现
- 不同 Agent 提供商的集成

独立模块可以**自由演进**，不影响核心分层架构。

### 3. **避免架构污染**

如果将 `agent` 放入 `core-service` (L3)：
- L3 会变得臃肿
- 违反 L3 的"业务逻辑"定位
- 混淆"内部能力"和"外部集成"的界限

### 4. **依赖方向清晰**

```
core-service 依赖 agent  ✅ (服务层使用集成层)
agent 不依赖 core-service  ✅ (集成层独立)
```

如果强行作为 L4：
- 依赖方向会变成 L4 ← L3，违反分层原则

---

## 考虑的方案 (Alternatives)

### 方案 A：放入 `core-service` (L3)

**描述**：将 agent 相关代码作为 `core-service` 的一个子模块。

**优点**：
- 符合"服务层"的概念

**缺点**：
- L3 变得臃肿
- 混淆业务逻辑和外部集成
- 难以独立测试和演进

**评估**：❌ 不采纳

---

### 方案 B：作为 L4 (Domain Layer)

**描述**：在 L3 之上增加 L4，专门处理 AI Agent 领域。

**优点**：
- 语义上符合"领域层"概念

**缺点**：
- **依赖方向反了**：当前 `core-service` 依赖 `agent`
- L4 应该依赖 L3，而不是被 L3 依赖
- 增加分层复杂度

**评估**：❌ 不采纳

---

### 方案 C：作为独立垂直模块

**描述**：与 `infra` 和 `core-engine` 平行，但定位为"外部集成模块"。

**优点**：
- 职责清晰：专门处理外部服务集成
- 依赖单向：其他模块可使用 agent，agent 不依赖核心层
- 独立演进：不影响核心架构
- 易于测试：不依赖其他 crates

**缺点**：
- 需要额外的文档说明其定位

**评估**：✅ **采纳此方案**

---

## 后果 (Consequences)

### 正面影响 ✅

1. **职责清晰**：agent 专注于 AI Agent 集成
2. **架构纯粹**：核心分层保持简洁
3. **易于扩展**：未来可添加其他外部集成模块（如 `crates/lsp`）
4. **独立测试**：agent 可单独测试，不依赖其他模块

### 负面影响 ⚠️

1. **理解成本**：需要额外文档说明其定位
2. **使用规范**：需要明确 `apps/api` 可以直接使用 agent 类型

### 缓解措施

- 创建详细的 `crates/agent/README.md`
- 在主架构文档中明确标注其独立地位
- 在 AGENTS.md 中添加导航入口

---

## 实施细节

### 1. 模块结构

```
crates/agent/
├── Cargo.toml
├── README.md           # 本文档
└── src/
    ├── lib.rs          # 公共导出
    ├── models.rs       # 数据模型
    ├── manager.rs      # AgentManager
    └── acp_client/     # ACP 协议实现
```

### 2. 导出策略

**从 `agent` 导出**：
```rust
pub use acp_client::{AcpSessionEvent, AcpSessionHandle, ...};
pub use manager::AgentManager;
pub use models::{AgentId, KnownAgent, ...};
```

**从 `core-service` 重新导出** (可选，用于统一)：
```rust
// crates/core-service/src/lib.rs
pub use agent::{AcpSessionEvent, AcpSessionHandle, AgentId, ...};
```

### 3. 使用规范

**✅ 允许**：`apps/api` 直接导入 agent 类型（用于 WebSocket 处理）
```rust
use agent::{AcpSessionEvent, AcpSessionHandle};
```

**✅ 推荐**：业务逻辑通过 `core-service::AgentService` 访问
```rust
use core_service::AgentService;
```

---

## 未来考虑

### 可能的扩展

如果未来需要添加其他外部集成模块，可采用相同模式：

```
crates/
├── infra/          # L1: 基础设施
├── core-engine/    # L2: 技术能力
├── core-service/   # L3: 业务逻辑
├── agent/          # 独立: AI Agent 集成
├── lsp/            # 独立: LSP 协议集成 (未来)
└── plugin/         # 独立: 插件系统 (未来)
```

### 命名规范

独立模块应遵循：
- 单一职责（一个外部协议/服务）
- 不依赖其他 crates
- 可独立测试和演进

---

## 相关决策

- [ADR-001: 采用 Monorepo 架构](./001-monorepo.md)
- [Agent Crate README](../../crates/agent/README.md)

---

## 更新历史

- **2025-02-18**: 初始版本，状态: 已采纳
