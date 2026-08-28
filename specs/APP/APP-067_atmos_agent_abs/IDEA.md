# Atmos Agent Chat 架构重构 Prompt

你现在需要直接修改 Atmos 项目代码，完成一次以长期可扩展性为目标的 Agent Chat 架构重构。

## 目标

把 Atmos 当前与 ACP Session / ACP Message 强耦合的 Chat 架构，重构为：

```text
Web / Mobile / CLI / Tauri
          │
          ▼
   Atmos Conversation API
          │
          ▼
   Conversation / Message / Turn
          │
          ▼
      Agent Session
          │
          ▼
   Agent Provider Abstraction
      ┌────┼────┐
      ▼    ▼    ▼
     ACP  CLI  SDK
      │    │    │
      ▼    ▼    ▼
 Third-party Agents
```

核心原则：

1. 第三方 Agent 仍然是实际的推理和执行主体。
2. ACP 只是当前一种 Provider / Transport，不得成为 Atmos Chat 的领域模型。
3. Atmos 自己持久化 Conversation History，作为 Atmos Chat History 的 source of truth。
4. 第三方 Agent 自己的 native session/history 只负责 Agent runtime context、resume 和 provider-specific state。
5. Atmos 的 Conversation、Message、Turn、ToolCall、Permission、Model、Mode、Event 等核心抽象不能依赖 ACP schema。
6. Web、Mobile、CLI、Tauri 都应该使用相同的 Atmos Chat API 和 Event Protocol。
7. 允许完全重构当前实现，不需要向后兼容旧架构、旧协议、旧数据模型。
8. 能复用的代码尽量复用，但不要为了复用旧代码而保留错误的架构边界。
9. 不重新实现 LLM 或 Agent Framework；只建立稳定的宿主层 Agent abstraction。

---

# 一、先完整阅读项目

先完整阅读代码，再开始修改。

重点覆盖：

- `crates/agent`
- `crates/core-service`
- `crates/core-engine`
- `apps/api`
- `apps/web`
- Agent session / WebSocket
- Chat UI
- Agent history / restore
- Permission
- Tool Call
- Model / Mode / Config
- Agent process lifecycle
- storage / database / migrations
- 当前 ACP adapter

重点搜索：

- `AcpSessionEvent`
- `AcpSessionHandle`
- `acp_session_id`
- `AgentServerMessage`
- `ThreadEntry`
- `restoreReplay`
- `session/resume`
- `session/load`
- `session/list`
- `tool_call`
- `permission_request`
- `plan_update`
- `usage_update`
- `stream`
- `turn_end`

先搞清楚当前完整调用链、数据流、持久化边界，再开始改。

不要先写代码再倒推架构。

---

# 二、最终架构

推荐目标结构：

```text
                    ┌───────────────────────┐
                    │      Client Apps      │
                    │ Web / Mobile / CLI    │
                    │ Tauri                 │
                    └───────────┬───────────┘
                                │
                        Atmos Chat Protocol
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Conversation Domain   │
                    │                       │
                    │ Conversation          │
                    │ Message               │
                    │ MessagePart           │
                    │ Turn                  │
                    │ ToolCall              │
                    │ Permission            │
                    │ Attachment            │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Agent Session Layer   │
                    │                       │
                    │ AgentProvider         │
                    │ AgentSession          │
                    │ AgentEvent            │
                    │ AgentCapabilities     │
                    │ AgentModel            │
                    │ AgentMode             │
                    │ PersistenceHandle     │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
          ACP Provider      CLI Provider       SDK/API Provider
              │                 │                  │
              ▼                 ▼                  ▼
       Claude / Codex / ...  Other Agents       Future Providers
```

其中最关键的边界：

```text
ACP                          Atmos
----------------------------------------------------
ACP Session                  AgentSession
ACP SessionUpdate            AgentEvent
ACP ToolCall                 AgentToolCall
ACP Permission               AgentPermissionRequest
ACP Model                    AgentModel
ACP Mode                     AgentMode
ACP Session ID               ProviderPersistenceHandle
ACP History                 Provider runtime history
```

ACP schema 只能存在于 ACP Adapter 内部。

---

# 三、Conversation 是 Atmos 自己的一等公民

不要再让：

```text
ACP Session
```

承担：

```text
Conversation Identity
History Identity
UI Identity
```

建立独立的：

```text
ConversationId
AgentSessionId
ProviderPersistenceHandle
```

关系：

```text
Conversation
   │
   ├── Turns
   ├── Messages
   ├── ToolCalls
   ├── Permissions
   │
   └── AgentSession
          │
          └── ProviderPersistenceHandle
                  │
                  └── ACP/native session id
```

例如：

```text
chat_id = conv_xxx
agent_session_id = agent_session_xxx
provider = claude
native_session_id = claude_xxx
```

不要出现：

```text
chat_id == acp_session_id
```

---

# 四、Atmos 自己持久化完整 Chat History

Atmos 必须成为自己的 Chat History source of truth。

至少支持：

```text
Conversation
Message
MessagePart
Turn
ToolCall
PermissionRequest
Attachment
AgentSession
```

建议的数据关系：

```text
Conversation
 ├── metadata
 ├── turns
 └── messages

Turn
 ├── user messages
 ├── assistant messages
 ├── reasoning
 ├── tool calls
 ├── plan
 ├── usage
 └── status

Message
 └── MessagePart[]
```

Message 不要设计成只有：

```text
role + text
```

需要支持结构化内容。

例如：

```rust
enum MessagePart {
    Text,
    Thinking,
    ToolCall,
    ToolResult,
    Plan,
    Attachment,
    Error,
}
```

具体类型根据现有代码和实际需求设计，不要机械照抄。

---

# 五、Agent Native History 与 Atmos History 必须分离

这是本次重构的核心。

Atmos History：

```text
Conversation
Message
ToolCall
Thinking
Plan
Permission
```

用途：

- Chat UI
- Mobile
- CLI
- History
- Search
- Export
- Timeline
- UI restore

Provider Native Session：

```text
PersistenceHandle
nativeSessionId
nativeThreadId
provider metadata
```

用途：

- resume
- continue
- provider context
- provider-specific lifecycle

不要依赖第三方 Agent 的 history 来作为 Atmos UI history 的唯一来源。

也不要强制 Atmos 完整复制第三方 Agent 的内部 context 数据结构。

---

# 六、Agent Provider 抽象

在 `crates/agent` 建立稳定的、Provider-independent API。

推荐思路：

```rust
trait AgentProvider {
    fn id(&self) -> &str;

    async fn capabilities(
        &self,
        context: &AgentCatalogContext,
    ) -> Result<AgentCapabilities, AgentError>;

    async fn list_models(
        &self,
        context: &AgentCatalogContext,
    ) -> Result<Vec<AgentModel>, AgentError>;

    async fn list_modes(
        &self,
        context: &AgentCatalogContext,
    ) -> Result<Vec<AgentMode>, AgentError>;

    async fn create_session(
        &self,
        config: AgentSessionConfig,
    ) -> Result<Box<dyn AgentSession>, AgentError>;

    async fn resume_session(
        &self,
        handle: AgentPersistenceHandle,
        config: AgentSessionConfig,
    ) -> Result<Box<dyn AgentSession>, AgentError>;
}
```

统一 Session：

```rust
trait AgentSession {
    async fn prompt(
        &mut self,
        input: AgentPrompt,
    ) -> Result<AgentTurnHandle, AgentError>;

    async fn cancel(&mut self) -> Result<(), AgentError>;

    async fn close(&mut self) -> Result<(), AgentError>;

    async fn set_config(
        &mut self,
        update: AgentSessionConfigUpdate,
    ) -> Result<(), AgentError>;

    fn events(&mut self) -> AgentEventStream;

    fn persistence_handle(&self) -> Option<AgentPersistenceHandle>;

    fn runtime_info(&self) -> AgentRuntimeInfo;
}
```

接口可以根据当前实际代码调整，但必须满足：

- 不暴露 ACP 类型
- 不把 ACP session id 当成核心 session identity
- Provider 可以使用 ACP、CLI、SDK、HTTP 等不同实现
- Provider-specific capability 可以扩展
- Provider 替换不能修改 Conversation domain

---

# 七、统一 Agent Event

建立 Atmos 自己的 canonical `AgentEvent`。

它是 Runtime 和 Conversation Projector 的唯一输入。

可以包含：

```rust
enum AgentEvent {
    SessionStarted,
    TurnStarted,

    UserMessage,

    AssistantMessageDelta,
    AssistantMessageCompleted,

    ThinkingDelta,
    ThinkingCompleted,

    ToolCallStarted,
    ToolCallUpdated,
    ToolCallCompleted,
    ToolCallFailed,

    PlanUpdated,

    PermissionRequested,
    PermissionResolved,

    UsageUpdated,

    ModeChanged,
    ModelChanged,

    TurnCompleted,
    TurnFailed,
    TurnCanceled,

    SessionClosed,
}
```

每个事件至少需要合理的：

```text
chat_id
agent_session_id
turn_id
message_id
sequence
created_at
```

具体哪些字段放在哪种 event 中根据实际语义设计。

关键原则：

```text
Provider Event
      ↓
Provider Adapter
      ↓
Atmos AgentEvent
      ↓
Conversation Projector
      ↓
Persistence
      ↓
Client Event Stream
```

而不是：

```text
ACP Event
 ↓
WebSocket
 ↓
Frontend
```

---

# 八、Conversation Projector / Persistence

建立清晰的：

```text
AgentEvent
    ↓
Conversation Projector
    ↓
Conversation state
    ↓
persistence
```

例如：

```text
AssistantMessageDelta
    ↓
找到对应 Message
    ↓
追加 MessagePart
    ↓
persist
    ↓
broadcast
```

Tool Call：

```text
ToolCallStarted
ToolCallUpdated
ToolCallCompleted
```

应该更新同一个 ToolCall，而不是生成三个独立 ToolCall。

必须处理：

- duplicate event
- out-of-order event
- reconnect
- process crash
- client reload
- duplicate prompt
- turn completion
- cancel
- failed turn

事件应该支持幂等。

建议具备：

```text
event_id
sequence
turn_id
message_id
chat_id
```

必要时设计 event journal / append log，但不要为了复杂而复杂。

---

# 九、WebSocket 只是 Transport

当前如果存在：

```text
AgentServerMessage
```

不要继续让它成为 ACP event 的直接映射。

改成：

```text
AgentEvent
   ↓
Atmos Server Event Envelope
   ↓
WebSocket / SSE / future transport
```

例如：

```json
{
  "type": "agent.event",
  "chat_id": "conv_xxx",
  "event_id": "evt_xxx",
  "sequence": 123,
  "payload": {
    "type": "assistant_message_delta",
    "message_id": "msg_xxx",
    "delta": "hello"
  }
}
```

WebSocket、HTTP、CLI 都只是 transport。

Client 不应该 import ACP schema。

---

# 十、Conversation API

建立与 Agent Provider 无关的 API。

至少支持：

```text
create conversation
list conversations
get conversation
get messages
send message
cancel turn
respond permission
resume conversation
archive conversation
delete conversation
```

实时层：

```text
subscribe conversation events
```

协议必须能够同时服务：

```text
Web
Mobile
CLI
Tauri
```

不要让 Mobile / CLI 再直接操作 ACP。

---

# 十一、History Restore

新的 history restore 不应该依赖 ACP replay 作为主路径。

正确逻辑：

```text
Client
  ↓
Get Conversation
  ↓
Atmos persisted messages
  ↓
Render history
```

立即显示历史。

只有用户真正继续对话时，才需要：

```text
Conversation
  ↓
AgentSession
  ↓
ProviderPersistenceHandle
  ↓
resume native Agent
```

因此严格区分：

```text
History Restore
≠
Agent Runtime Restore
```

---

# 十二、ACP Provider

把现有 ACP 代码重构成一个明确的 Provider Adapter。

推荐结构：

```text
crates/agent/src/
    provider/
        mod.rs
        types.rs

    providers/
        acp/
            client.rs
            session.rs
            process.rs
            mapper.rs
```

ACP adapter 内部可以继续大量复用当前：

- ACP process spawn
- stdio transport
- permission bridge
- filesystem bridge
- session resume
- model/mode discovery
- logging

但 ACP 类型不得泄漏到：

- Conversation domain
- persistence model
- public chat protocol
- frontend
- Mobile / CLI API

也就是说：

```text
ACP schema
   ↓
ACP mapper
   ↓
Atmos Agent types
```

必须成为单向边界。

---

# 十三、Model / Mode / Capability

建立 Atmos 自己的：

```text
AgentModel
AgentMode
AgentCapability
AgentFeature
```

不要直接使用：

```text
ACP SessionModelState
ACP SessionModeState
ACP SessionConfigOption
```

Provider 可以通过：

```text
static manifest
runtime probe
CLI introspection
ACP discovery
SDK API
```

提供模型信息。

最终全部转换成统一的：

```text
AgentModel[]
AgentMode[]
AgentFeature[]
```

---

# 十四、Model Catalog

建立独立于 Conversation 的 Agent Catalog。

```text
Agent Provider
     ↓
Catalog
 ├── models
 ├── modes
 ├── features
 └── capabilities
```

用户应该能够在创建 Conversation 前选择：

```text
Agent
Model
Mode
Thinking
Features
```

只有 provider 无法静态提供 catalog 时，才做 runtime probe。

Probe 必须：

- 明确是 ephemeral
- 不创建 Atmos Conversation
- 不创建 Atmos Agent History
- 不进入用户历史
- 完成后立刻释放
- 最好缓存结果

不要把正式用户 Session 和 Catalog Probe 混在一起。

---

# 十五、Permission

统一：

```text
AgentPermissionRequest
AgentPermissionResponse
```

不要暴露 ACP Permission schema。

流程：

```text
Provider Permission
       ↓
Atmos Permission
       ↓
Web / Mobile / CLI
       ↓
Atmos Permission Response
       ↓
Provider Adapter
       ↓
Provider Permission Response
```

Permission 需要至少能够识别：

```text
conversation
turn
request
provider
kind
tool
input
options/actions
metadata
```

---

# 十六、Tool Call

前端不能再根据 ACP raw input 猜 Tool 类型。

建立：

```text
AgentToolCall
ToolCallDetail
```

至少支持：

```text
shell
read
edit
write
search
fetch
sub-agent
worktree
plan
custom
```

Tool Call 应支持生命周期：

```text
running
completed
failed
canceled
```

Provider-specific 数据放入：

```text
metadata
```

而不是污染核心 domain schema。

---

# 十七、UI Render Model 与 Domain Model 分离

如果当前存在：

```text
ThreadEntry
```

不要继续让它充当 persistence/domain model。

正确关系：

```text
Persisted Conversation
      ↓
Domain Model
      ↓
UI Projection
      ↓
ThreadEntry / Render Model
      ↓
React
```

`ThreadEntry` 可以继续存在，但它应该是 UI representation，而不是系统 source of truth。

---

# 十八、Frontend

前端最终只应该理解：

```text
Conversation
Message
MessagePart
Turn
ToolCall
Permission
AgentEvent
AgentModel
AgentMode
```

不应该理解：

```text
ACP SessionNotification
ACP ToolCall
ACP PermissionOption
ACP SessionUpdate
```

前端不应该根据 ACP schema 自己做协议转换。

---

# 十九、CLI / Mobile

最终支持：

```text
Atmos Chat API
Atmos Agent Event Protocol
Atmos Permission Protocol
```

Mobile：

```text
GET conversation
GET messages
subscribe events
send message
permission response
```

CLI：

```text
atmos chat
atmos conversation list
atmos conversation open
atmos message send
```

CLI 不应该自己启动 ACP。

Agent Provider 的选择和 lifecycle 统一由 Atmos server/runtime 管理。

---

# 二十、数据持久化

可以根据当前项目现有数据库/存储能力选择最佳实现。

重点保证：

- conversation 可分页
- message 可分页
- turn 可查询
- tool call 可独立更新
- permission 可查询
- attachment 可独立管理
- sequence 有序
- event 幂等
- crash recovery
- concurrent append 安全

不要为了兼容旧表结构而保留糟糕的 schema。

允许直接设计新 schema。

---

# 二十一、旧架构处理方式

不要为了兼容保留旧设计。

可以直接：

- 删除旧 `AgentServerMessage`
- 删除旧 ACP-specific Chat domain model
- 删除旧 replay-driven history architecture
- 删除旧 session/message 强绑定
- 删除不再需要的旧 WebSocket message types
- 删除过渡代码
- 删除已经没有意义的 compatibility layer

如果旧 API / 类型与新架构冲突，直接移除。

不要为了“少改代码”而继续保留架构债务。

能复用底层能力就复用：

- process manager
- ACP transport
- permission executor
- filesystem security
- terminal service
- git service
- logging
- existing storage infrastructure

但不要复用错误的 domain boundary。

---

# 二十二、推荐代码分层

最终尽量形成：

```text
crates/agent
│
├── domain
│   ├── provider
│   ├── session
│   ├── event
│   ├── model
│   ├── mode
│   ├── permission
│   └── tool
│
├── providers
│   └── acp
│       ├── client
│       ├── session
│       ├── process
│       └── mapper
│
└── runtime
    ├── session-manager
    ├── catalog
    └── event-dispatch

crates/core-service
│
├── conversation
│   ├── service
│   ├── projector
│   ├── persistence
│   └── repository
│
└── agent
    └── orchestration

apps/api
│
└── conversation
    ├── http
    └── realtime

apps/web
│
├── conversation
├── chat
└── agent
```

具体目录可以根据现有代码结构调整。

不要为了符合这个树而机械移动代码。

---

# 二十三、实时与持久化顺序

一个 turn 至少应该保证逻辑顺序：

```text
User sends prompt
      ↓
Create/append user message
      ↓
persist
      ↓
start Agent turn
      ↓
receive AgentEvent
      ↓
project event into Conversation
      ↓
persist
      ↓
broadcast
```

尽量避免：

```text
broadcast first
persist later
```

否则 reconnect / crash 时容易产生状态差异。

---

# 二十四、错误处理

必须区分：

```text
Provider unavailable
Agent process failed
ACP protocol error
Permission denied
Tool failed
Turn canceled
Persistence failure
Client disconnected
```

Provider-specific error 不能直接泄漏到公共 Chat domain。

设计统一的：

```text
AgentError
ConversationError
```

必要时保留 provider diagnostic metadata。

---

# 二十五、测试

增加完整测试。

### Domain

- conversation create
- message append
- message parts
- turn lifecycle
- tool lifecycle
- permission lifecycle
- event idempotency

### Persistence

- restart recovery
- pagination
- concurrent append
- duplicate event
- crash recovery
- partial turn

### Agent abstraction

- provider registration
- session lifecycle
- event normalization
- persistence handle
- model/mode discovery

### ACP adapter

- ACP → AgentEvent
- ACP ToolCall → AgentToolCall
- ACP Permission → AgentPermissionRequest
- ACP Session → PersistenceHandle
- stream handling
- process failure
- cancel

### API

- create conversation
- send message
- receive events
- reconnect
- history query
- permission response
- resume

### E2E

完整验证：

```text
Web
 ↓
Conversation API
 ↓
Agent abstraction
 ↓
ACP Provider
 ↓
Third-party Agent
 ↓
stream / thinking / tool / permission
 ↓
Atmos persistence
 ↓
reload
 ↓
history restored
 ↓
resume native provider session
 ↓
continue conversation
```

---

# 二十六、关键设计检查

重构完成后，必须明确回答：

1. Atmos Conversation History 的 source of truth 是什么？
2. Provider Native Session 的 source of truth 是什么？
3. UI history 是否完全可以脱离 ACP history 恢复？
4. Web / Mobile / CLI 是否共享同一套 Conversation API？
5. frontend 是否完全不依赖 ACP schema？
6. Conversation domain 是否完全不依赖 ACP schema？
7. 新增非 ACP Provider 是否需要修改 Conversation schema？
8. ACP Session ID 是否只是 provider persistence handle 的一部分？
9. Model / Mode / Capability 是否已经独立于 ACP？
10. Tool Call / Permission 是否已经独立于 ACP？
11. Catalog Probe 是否与正式 Conversation 完全隔离？
12. Agent process 重启后是否可以通过 persistence handle resume？
13. WebSocket reconnect 后是否不会产生重复消息？
14. 一个 Agent Turn 的事件是否能够幂等恢复？
15. 是否存在不必要的完整历史双写？如果存在，为什么？

---

# 二十七、最终实现要求

不要只输出设计文档。

直接修改代码，完成完整实现。

允许删除旧架构、重命名类型、重新设计数据库和 API。

优先目标顺序：

```text
正确的架构
> 长期可扩展性
> 清晰的数据边界
> 正确的持久化
> Provider 解耦
> Web/Mobile/CLI 复用
> 代码复用
> 最小改动
```

不要为了减少 diff 而保留架构问题。

不要为了“未来可能支持”引入大量没有真实用途的抽象。

最终报告：

## Architecture Before

```text
...
```

## Architecture After

```text
...
```

## Domain Model

列出 Conversation / Message / Turn / AgentSession / ProviderPersistenceHandle / AgentEvent 的关系。

## Provider Boundary

说明 ACP 具体被隔离在哪一层。

## Persistence

说明哪些数据由 Atmos 持久化，哪些数据由第三方 Agent 持久化，以及为什么。

## API

列出主要 HTTP / realtime / CLI interface。

## Changed Files

列出所有修改、删除、新增文件以及原因。

## Tests

列出执行过的测试及结果。

## Remaining Risks

只列出真实存在且未解决的问题。
