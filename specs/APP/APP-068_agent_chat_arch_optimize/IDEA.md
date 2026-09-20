对，但**不要简单取并集**。

如果直接把 Claude、Codex、Pi、OpenCode 的所有能力做并集，最后一定会变成一个巨大的：

```ts
AgentRuntime {
  prompt()
  cancel()
  steer()
  fork()
  compact()
  rewind()
  approve()
  reject()
  askUser()
  ...
  // 以后继续加
}
```

这正是我们之前觉得过度复杂的地方。

我更推荐一个原则：

> **Runtime 收敛“生命周期和控制语义”，Event 收敛“用户可观察事实”；Agent 特有能力不要为了统一而统一。**

---

# 1. 不要把 Agent 的所有能力都收敛

比如：

```text
Claude
├── prompt
├── cancel
├── permission
├── subagent
├── plan
├── ...
│
Codex
├── prompt
├── cancel
├── approval
├── thread
├── turn
├── patch
├── ...
│
Pi
├── prompt
├── steer
├── follow_up
├── compaction
├── ...
```

真正有共同意义的可能只有：

```text
发送输入
取消
订阅事件
恢复/连接 Session
```

那就只统一这些。

---



# 2. Runtime 应该非常小

我甚至建议 Atmos 的核心 Runtime 只有：

```rust
trait AgentRuntime {
    fn start(&self, ...) -> ...
    fn send(&self, ...) -> ...
    fn cancel(&self, ...) -> ...
    fn subscribe(&self, ...) -> EventStream;
}
```

大概就这么几个。

不要一上来定义：

```text
fork
compact
rewind
permission
steer
model_switch
...
```

---



# 3. 那其他能力怎么办？

用：

```text
Capability
```

但不是把 Capability 变成一个巨大 interface。

例如：

```json
{
  "capabilities": [
    "steer",
    "permission",
    "model_selection"
  ]
}
```

然后 Runtime 可以提供：

```text
execute(capability, input)
```

或者更简单：

```rust
runtime.action(Action::Steer(...))
```

如果 Agent 不支持：

```text
Unsupported
```

就完事。

---



# 4. 甚至 Capability 不需要全部进入核心

这是我认为非常重要的一点。

假设 Codex 有：

```text
approval
```

Claude 有：

```text
permission
```

Pi 有：

```text
steer
```

不要马上定义：

```text
AgentRuntime.approve()
AgentRuntime.steer()
```

而应该先问：

> **这个能力是不是 Atmos 产品本身需要？**

如果 Web / Mobile / CLI 都需要：

→ 提升为公共能力。

如果只是某个 Agent 的特殊功能：

→ 留在 Adapter。

---



# 5. Event 则不一样

Event 我认为可以比 Runtime **稍微宽一点**。

因为 Event 的任务是：

> **告诉 Atmos “发生了什么”。**

例如所有 Agent 基本都会有：

```text
session_started
message
tool_call
tool_result
permission
status
error
session_finished
```

所以可以有：

```rust
enum AgentEvent {
    SessionStarted,
    Message(...),
    ToolCall(...),
    ToolResult(...),
    Permission(...),
    Status(...),
    Error(...),
    SessionFinished,
}
```

---



# 6. 但 Event 也不要追求完全统一

这是关键。

例如：

```text
Codex
command_execution
```

和：

```text
Claude
tool_use
```

可以映射成：

```text
AgentEvent::ToolCall
```

但不要因此把所有细节抹掉。

我会保留：

```rust
struct AgentEvent {
    id: EventId,
    session_id: SessionId,
    timestamp: Timestamp,

    kind: AgentEventKind,

    data: EventData,

    source: EventSource,
}
```

其中：

```rust
enum EventSource {
    Standard,
    Native {
        provider: String,
        event_type: String,
        payload: JsonValue,
    }
}
```

---



# 7. 这样就是“公共语义 + Native 扩展”

例如 Claude：

```json
{
  "kind": "tool_call",

  "data": {
    "name": "bash",
    "input": {}
  },

  "source": {
    "provider": "claude",
    "event_type": "tool_use",
    "payload": {}
  }
}
```

Codex：

```json
{
  "kind": "tool_call",

  "data": {
    "name": "command",
    "input": {}
  },

  "source": {
    "provider": "codex",
    "event_type": "command_execution",
    "payload": {}
  }
}
```

这样：

### Atmos UI

只关心：

```text
kind = tool_call
```



### 高级 UI

可以关心：

```text
source.provider = codex
```



### Persistence

全部保存。

不会丢。

---



# 8. 所以不是“取并集”，而是三个集合

这个思路我觉得非常适合 Atmos。

```text
                    Agent Capabilities
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       Common           Optional          Native
          │                │                │
      Core Runtime     Capability       Adapter
```



### Common

所有 Agent 都有：

```text
send
cancel
events
```

进入核心。

---



### Optional

多个 Agent 都有，而且 Atmos 产品需要：

```text
permission
steer
model selection
resume
```

进入 Capability。

---



### Native

只有某一个 Agent 有：

```text
Codex:
  thread fork
  specialized approval

Claude:
  ...
```

留在 Adapter。

---



# 9. Event 也可以这么处理

```text
             Agent Events
                  │
       ┌──────────┼──────────┐
       │          │          │
    Common     Optional    Native
       │          │          │
   message      permission  raw event
   tool         status
   error
```

所以：

> **Event 模型不是 Agent 协议的完整镜像，而是 Atmos 的观察模型。**

这个区别特别重要。

---



# 10. 为什么我不建议“取并集”

假设现在：

```text
Claude: 20 abilities
Codex: 25
Pi: 15
OpenCode: 18
```

并集：

```text
45 abilities
```

那么：

```ts
interface AgentRuntime {
  ...
  ability1()
  ability2()
  ...
  ability45()
}
```

结果就是：

```text
Claude → unsupported 17
Codex → unsupported 20
Pi → unsupported 30
```

这个接口就失去意义了。

---



# 11. 也不要取交集

反过来：

```text
Claude ∩ Codex ∩ Pi ∩ OpenCode
```

可能只剩：

```text
send
cancel
event
```

虽然干净，但又太弱。

Atmos UI 会无法利用：

```text
steer
permission
fork
model switching
```

这些真正有价值的能力。

---



# 12. 所以最好的其实是“交集 + Capability + Extension”

可以把它理解成：

```text
                 Agent Runtime
                       │
                ┌──────┴──────┐
                │             │
             Core          Extensions
                │             │
          ┌─────┴─────┐       │
          │           │       │
        Session      Event   Capability
```

核心：

```text
Session
Event
send
cancel
```

能力：

```text
Permission
Steer
Resume
ModelSelection
Fork
...
```

特殊：

```text
Native Extension
```

---



# 13. 对你现在 Atmos，我甚至建议不要有 `Turn`

结合你前面说的：

> `Conversation / Session / Message / Part / Turn` 太复杂。

我非常赞成继续砍。

可以直接：

```text
Session
  │
  └── AgentEvent[]
```

然后：

```text
AgentEvent
```

里面有：

```text
Message
Tool
Permission
Status
...
```

比如：

```text
Session
│
├── AgentEvent(message)
├── AgentEvent(tool_call)
├── AgentEvent(tool_result)
├── AgentEvent(message)
├── AgentEvent(permission)
├── AgentEvent(tool_call)
└── AgentEvent(session_end)
```

**不要人为构造 Turn。**

---



# 14. Message 甚至可以只是 EventData

比如：

```rust
enum AgentEventKind {
    Message,
    ToolCall,
    ToolResult,
    Permission,
    Status,
    Error,
}
```

然后：

```rust
struct AgentEvent {
    id: EventId,
    session_id: SessionId,
    sequence: u64,
    timestamp: DateTime,

    kind: AgentEventKind,
    data: JsonValue,

    source: Option<NativeEvent>,
}
```

这样极其简单。

---



# 15. Persistence 也因此非常漂亮

数据库甚至可以：

```text
agent_sessions
agent_events
```

就两张核心表。

```text
agent_sessions
--------------
id
agent
workspace
created_at
updated_at
status
```

```text
agent_events
------------
id
session_id
sequence
kind
data
source
created_at
```

然后：

```text
AgentEvent
```

就是：

```text
Runtime → Persistence
Runtime → UI
```

同一份。

这也正好解决我们前面讨论的：

> **不要再维护一份 ACP Message / Session。**

---



# 16. 最后一个非常关键的原则

我会给 Atmos 的架构定一个规则：

> **Don't normalize what you don't need.**

也就是：

**不要为了“统一”而统一。**

例如：

```text
Claude thinking
Codex reasoning
Pi thinking
```

如果 UI 都只需要：

```text
reasoning text
```

那统一。

如果 Codex 有特殊 reasoning metadata，而 Atmos 暂时不用：

**不要解析，不要设计抽象。**

直接：

```text
native payload
```

保存。

以后需要再暴露。

---



## 所以最终我建议 Atmos 是这个形态

```text
                     Agent Runtime
                           │
                    ┌──────┴──────┐
                    │             │
                 Core API      Capabilities
                    │             │
             ┌──────┼──────┐      │
             │      │      │      │
           start   send   cancel  ...
                    │
                    ▼
                AgentEvent
                    │
          ┌─────────┴─────────┐
          │                   │
       Common              Native
          │                   │
   message/tool/...       raw payload
          │                   │
          └─────────┬─────────┘
                    ▼
                Persistence
```

**不是并集。**

更准确地说是：

> **Runtime 取最小交集；产品需要的能力做 Capability；Agent 独有能力保留 Native Extension；Event 统一公共语义，但永远保留原始事件。**

我觉得这已经非常接近 Atmos 目前真正应该落地的最终抽象了，而且比我们前面讨论的 `Conversation → ChatSession → AgentSession → Turn → Message → Part` 那套要干净很多。



对 Atmos，我会进一步拆成 4 个概念

我觉得你后面设计 Agent Core 时，最好不要全部叫 capabilities：

```text
AgentDescriptor
│
├── identity
│   ├── id
│   ├── name
│   └── version
│
├── capabilities
│   ├── steer
│   ├── cancel
│   ├── fork
│   ├── rollback
│   ├── permission
│   └── computerUse
│
├── supportedOptions
│   ├── models
│   ├── reasoning
│   ├── modes
│   ├── serviceTiers
│   └── contextWindows
│
└── currentConfig
    ├── model
    ├── reasoning
    └── mode
```

这样语义会非常干净：

Capabilities = 它能干什么
SupportedOptions = 它允许你怎么配置它
Config = 现在实际选了什么

我觉得这个比单纯做一个 AgentCapabilities 要合理得多，尤其适合你 Atmos 后面同时接 ACP、Codex 原生协议、CLI、HTTP Agent。

