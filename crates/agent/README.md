# Agent Crate

> **独立的垂直集成模块** — 对接外部 Code Agent CLI。Chat 只通过 `AgentProvider` 说话；五个 native host + ACP fallback。`AgentManager` 负责安装、Registry 和 keyring。

Chat 业务（jsonl 转录、发送时拦截 `/fork` `/rewind`、`rewind_view`、fork 后新建 sibling `chat_id`）在 `core-service` 的 `AgentChatService`，不在本 crate。给 Agent 用的短地图见 [AGENTS.md](./AGENTS.md)。诚实表见 [APP-068 TECH](../../specs/APP/APP-068_agent_chat_arch_optimize/TECH.md) 与 [APP-069 TECH](../../specs/APP/APP-069_agent_chat_hits_and_session_ops/TECH.md)。

## 目录

- [定位](#定位)
- [职责](#职责)
- [Chat 如何走到这里](#chat-如何走到这里)
- [架构位置](#架构位置)
- [模块结构](#模块结构)
- [Spawn 路由](#spawn-路由)
- [依赖规则](#依赖规则)
- [使用示例](#使用示例)

---

## 定位

`agent` 与 `infra` / `core-engine` **平行**，不属于 L1–L3。它负责：

- 把各家 Code Agent CLI 收成统一的 `AgentProvider` / `AgentEvent` / `AgentAction`
- Agent 安装、ACP Registry、API Key（keyring）

**为什么独立？**

- 对接的是**外部进程和协议**，不是核心业务规则
- 需要 npm / 二进制下载 / 各家 stdio 或 HTTP
- native 与 ACP 可以各自演进，不污染 L1–L3

crate 独立性决策仍是 [ADR-002](../../docs/adr/002-agent-crate-positioning.md)。ADR 里旧的「只有 `acp_client`」目录是历史快照；当前运行时是 `AgentProvider`。

---

## 职责

### 1. Chat 契约（`contract/`）

```rust
pub use agent::{
    AgentAction, AgentEvent, AgentProvider, AgentRuntime, AgentRuntimeControl,
    canonicalize_chat_provider_id, capabilities_for_provider,
};
```

`AgentAction` 含 `Steer`、`SetConfig`、`RespondPermission`、`PrepareSessionOp`、`RespondSessionOp`。Fork Applied 通过 `AgentActionResult::forked` 带回 vendor `session_id`（以及可选新 cwd）。

ACP / 各家 RPC 类型**不是** Chat 公共 API。

### 2. Native + ACP hosts（`providers/`）

| 规范化 id | 类型 | 线路 |
|-----------|------|------|
| `claude` | Native | duplex `--input-format stream-json` |
| `codex` | Native | `codex app-server -c openai_base_url=""` |
| `opencode` | Native | OpenCode HTTP + SSE（适配器私有） |
| `pi` | Native | Pi JSONL RPC（无内建工具权限弹层） |
| `grok` | Native | `grok --permission-mode <selected\|default> agent stdio` + `_x.ai/*`（协议仍是 ACP JSON-RPC；不是 Cursor/registry ACP 适配器路径） |
| 其余 | ACP | `acp_client`（`amp`/`amp-acp`、`claude-acp`、`codex-acp`、`grok-build`、`gemini`、`cursor`、自定义名） |

Grok native 从 `agent::providers::grok::GrokNativeProvider` 引入（crate 根未 `pub use`）。不要加 Cargo `xai-grok-*`。

### 3. Options（`options/`）

`OptionsProbe`：native 走 `NativeOptionsProbe`，跳过 `AcpOptionsProbe`。产出 `AgentOptionsSnapshot`，再 apply 到 descriptor。Grok options overlay 不拉起 stdio。自定义 / 未知 id 仍走 ACP probe。Cursor CLI 变体归类 / ACP 线协议 ID 映射在 `options/probe/cli/cursor.rs`。

### 4. Agent 生命周期（`manager/`）

```rust
pub use agent::AgentManager;
// list_agent_status / install_agent / get_agent_config / set_agent_api_key
// list_registry_agents / install_registry_agent / get_registry_agent_launch_spec
```

API Key 进系统 keyring；配置目录检测（`~/.claude`、`~/.codex` 等）仍在这里。

### 5. ACP stdio（`acp_client/`）

通用 ACP 进程与 JSON-RPC。只做帧/状态/content/locations 透传，**不要**在这里猜 Read 或合成 `Tool: path`。Chat 的 ACP fallback 以及 Grok native 的帧封装会用到它；业务映射在 `providers/acp`（共享 `tool_map` + `overlays/`）。**不要**从 `apps/api` 直接拿 `AcpSessionHandle` 开会话。

---

## Chat 如何走到这里

```
apps/web  全局 Agent Chat（composer、session-op 卡片、search hits）
  → 主 /ws  agent_chat_*（不要给 Chat 加 REST）
apps/api  WsAction / DTO
  → AgentChatService
       发送时拦截 native `/fork` `/rewind`（不写入用户消息）
       rewind 只改 rewind_view；Atmos 不 git checkout / 不还原工作区文件
       fork：先拿 vendor 新 session，再新建 sibling chat_id
  → AgentProvider（本 crate；工厂在 core-service `agent_chat/acp_factory.rs`）
```

`AgentService` 只包 `AgentManager`（安装 / 状态 / Key），不负责 Chat 会话。

---

## 架构位置

```
┌─────────────────────────────────────────────────────────┐
│                      apps/api                           │
│           WS agent_chat_*  →  AgentChatService          │
│           HTTP 安装/Registry  →  AgentService           │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  core-service (L3)                      │
│  AgentChatService  →  AgentProvider                     │
│  AgentService      →  AgentManager                      │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐  ┌─────▼─────┐  ┌─────▼───────────┐
│    infra     │  │   core-   │  │     agent       │
│     (L1)     │  │  engine   │  │  (independent)  │
│ - DB         │  │ - PTY     │  │ - AgentProvider │
│ - Cache      │  │ - Git     │  │ - natives + ACP │
│              │  │ - FS      │  │ - AgentManager  │
└──────────────┘  └───────────┘  └─────────────────┘
```

**依赖关系**：

- `agent` **不依赖** `infra` / `core-engine` / `core-service`
- `core-service` 依赖 `agent`（Chat 工厂 + `AgentService`）
- `apps/api` 不要直接 spawn CLI；WS 只调 `AgentChatService`

本 crate **不**为 Chat rewind 调 `core-engine` Git。Grok worktree 只在 Grok 适配器里发 `_x.ai/git/worktree/create`。

---

## 模块结构

```
src/
├── lib.rs
├── models.rs              # 安装 / Registry 模型
├── contract/              # AgentProvider、Event、Action、descriptor
├── policy/                # canonicalize、诚实表、Atmos 权限映射
├── map/                   # classify_tool + JSON 抽取（适配器私有）
├── providers/
│   ├── mod.rs             # chat_provider_kind
│   ├── claude/ | codex/ | opencode/ | pi/ | grok/ | acp/
│   │   └── acp/overlays/  # DeepSeek / Grok-ACP 按 provider_id 补怪形状
│   └── */testdata/        # 钉死的协议夹具（CI 不拉活 CLI）
├── options/               # Options probe + cache；snapshot → descriptor
│   └── probe/             # run / plan + cli / acp / native
├── acp_client/            # 通用 ACP stdio / JSON-RPC
├── manager/               # 安装、Registry、二进制、keyring
└── testing.rs             # feature = "test-support"
```

---

## Spawn 路由

先 `canonicalize_chat_provider_id` 折 native 同义词（`claude-code` → `claude`），再 `chat_provider_kind`。只看 id，不看 argv。ACP Registry id（`claude-acp` / `codex-acp` / `grok-build`）不折进 native；Chat 选择器折叠只在 UI。

不要为了 Chat spawn 去改 Terminal 的 `resources/terminal-agents/builtin_agents.json` argv。

Grok rewind 请求必须带显式 `mode`：`conversation_only` | `files_only` | `all`。省略会默认 `all` 并还原文件。

---

## 依赖规则

### 允许

- Rust 标准库与通用第三方（`tokio`、`serde`、`reqwest`、`keyring`、`agent-client-protocol`）

### 禁止

- 依赖 `infra` / `core-engine` / `core-service`
- Cargo `xai-grok-*`（或把 Grok 嵌进进程）
- 把 ACP / 各家 RPC 类型当成 Chat 事件往外漏
- 为 rewind/fork 在本 crate 跑 `git checkout` / `git worktree`

### 谁依赖本 crate

- `core-service::AgentChatService` + `DefaultAgentProviderFactory`
- `core-service::AgentService`（`AgentManager`）

---

## 使用示例

### 安装 / Key（`AgentService`）

```rust
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

### Chat 选 host（工厂，在 core-service）

```rust
use agent::providers::{chat_provider_kind, ChatProviderKind};
use agent::{AgentProvider, ClaudeNativeProvider, CodexNativeProvider /* … */};
use agent::providers::grok::GrokNativeProvider;

fn route_provider(provider_id: &str) -> Arc<dyn AgentProvider> {
    match chat_provider_kind(provider_id) {
        ChatProviderKind::NativeClaude => Arc::new(ClaudeNativeProvider::new()),
        ChatProviderKind::NativeCodex => Arc::new(CodexNativeProvider::new()),
        ChatProviderKind::NativeOpenCode => Arc::new(OpenCodeNativeProvider::new()),
        ChatProviderKind::NativePi => Arc::new(PiNativeProvider::new()),
        ChatProviderKind::NativeGrok => Arc::new(GrokNativeProvider::new()),
        ChatProviderKind::Acp => /* LazyAcpProvider → AcpAgentProvider */,
    }
}
```

会话用 `AgentProvider::create_runtime` / `resume_runtime`，不要在 `apps/api` 里 `AcpSessionHandle::new(socket)`。完整工厂：`crates/core-service/src/service/agent_chat/acp_factory.rs`。

---

## 设计原则

1. **Chat 只认 `AgentProvider`** — ACP 与各家 RPC 停在适配器里
2. **诚实能力** — `capabilities_for_provider` / `descriptor.support`；不要给 ACP 的 agent 假装 native fork/rewind
3. **Atmos 不还原文件** — rewind 改视图；文件是否还原由 CLI 自己决定
4. **安全存储** — API Key 走 keyring
5. **夹具钉协议** — `providers/*/testdata/`，CI 不依赖本机装了哪家 CLI

---

## 相关文档

- [AGENTS.md](./AGENTS.md) — 给 Agent 的地图与 NEVER/ALWAYS
- [ACP 协议](https://agentclientprotocol.com/)
- [core-service AGENTS.md](../core-service/AGENTS.md)
- [ADR-002](../../docs/adr/002-agent-crate-positioning.md)
