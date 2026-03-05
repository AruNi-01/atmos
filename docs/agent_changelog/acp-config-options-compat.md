# ACP Session Config Options 兼容性适配

> **日期**: 2025-03-05  
> **范围**: `crates/agent`, `apps/api`, `apps/web`  
> **关联协议**: [Session Config Options](https://agentclientprotocol.com/protocol/session-config-options) | [Session Modes (Legacy)](https://agentclientprotocol.com/protocol/session-modes)

---

## 问题背景

ACP 协议中存在两代配置选项 API：

| 版本 | API | 说明 |
|------|-----|------|
| **新版** | `configOptions` / `session/set_config_option` | 统一的配置选项体系，支持 mode、model、thought_level 等任意选项 |
| **旧版** | `modes` + `models` / `session/set_mode` + `session/set_model` | 独立的 mode 和 model 选择 API |

不同 ACP Agent 实现的协议版本不同：
- **Claude Code**：使用新版 `configOptions`，在 `new_session` 响应中返回
- **opencode** 等：仍使用旧版 `modes` / `models`，不返回 `configOptions`

我们的实现之前只支持了新版 API，导致使用旧版 API 的 Agent 无法显示配置选项。

---

## 变更一览

### 1. 前端：移除硬编码的选项过滤

**文件**: `apps/web/src/components/agent/AgentChatPanel.tsx`

**问题**: 前端用 `['mode', 'model', 'thought_level'].map(id => configOptions.find(o => o.id === id))` 按 `id` 硬编码白名单过滤，只有 Claude Code 恰好使用这些 id，其他 Agent 的 config option id 不同则全被过滤。

**修复**: 改为显示所有 `type === 'select'` 且有可选项的 config options，完全遵循 ACP 规范——Agent 返回什么就展示什么。

```diff
- {['mode', 'model', 'thought_level']
-   .map(id => configOptions.find(o => o.id === id))
-   .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
+ {configOptions
+   .filter(opt => opt.type === 'select' && opt.options.length > 0)
```

### 2. 后端：接收 — 处理 `ConfigOptionUpdate` 通知

**文件**: `crates/agent/src/acp_client/client.rs`

**问题**: `session_notification` 中的 `SessionUpdate::ConfigOptionUpdate` 和 `SessionUpdate::CurrentModeUpdate` 被 `_ => {}` 静默丢弃。部分 Agent 通过通知（而非 session 响应）推送配置选项。

**修复**: 新增两个通知分支的处理：

```rust
// 新版：config_options_update 通知
acp::SessionUpdate::ConfigOptionUpdate(update) => {
    let out = map_config_options(update.config_options);
    event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(out));
}

// 旧版：current_mode_update 通知（Agent 运行中切换 mode）
acp::SessionUpdate::CurrentModeUpdate(update) => {
    // 仅更新 currentValue，保留已有的 options 列表
    let opt = AgentConfigOption {
        id: "mode", currentValue: update.current_mode_id, options: vec![], ...
    };
    event_tx.send(AcpSessionEvent::ConfigOptionsUpdate(vec![opt]));
}
```

### 3. 后端：接收 — 旧版 `modes` / `models` 转换为 `AgentConfigOption`

**文件**: `crates/agent/src/acp_client/runner.rs`

**问题**: `new_session` / `load_session` 响应只检查了 `response.config_options`，忽略了 `response.modes` 和 `response.models`。

**修复**: 引入 `emit_session_config()` 统一处理，优先使用 `configOptions`，回退到 `modes` + `models`：

```
if config_options → 新版，直接 map
else:
  if modes → map_modes_to_config_option → AgentConfigOption { id: "mode", category: "mode", ... }
  if models → map_models_to_config_option → AgentConfigOption { id: "model", category: "model", ... }
```

同时记录 `uses_legacy_modes` / `uses_legacy_models` 标志，用于后续发送时路由。

### 4. 后端：发送 — 根据 Agent 版本选择正确的 set 方法

**文件**: `crates/agent/src/acp_client/runner.rs`

**问题**: `SetConfigOption` 命令始终调用 `session/set_config_option`，旧版 Agent 不支持。

**修复**: 根据 session 初始化时记录的标志路由：

```
SetConfigOption(config_id, value):
  if uses_legacy_modes && config_id == "mode"  → conn.set_session_mode(...)
  if uses_legacy_models && config_id == "model" → conn.set_session_model(...)
  else                                          → conn.set_session_config_option(...)
```

同样的逻辑也应用于启动时的默认配置 (default_config) 应用。

### 5. 后端：`set_config_option` 响应也需转发

**问题**: 之前 `set_session_config_option` 成功后没有把响应中的完整配置列表转发给前端。

**修复**: 成功后将 `resp.config_options` 通过 `ConfigOptionsUpdate` 事件推送。

### 6. 前端：智能合并 config options 更新

**文件**: `apps/web/src/hooks/use-agent-session.ts`

**问题**: 收到 `config_options_update` 消息时直接全量替换 `configOptions` 状态。旧版 `CurrentModeUpdate` 只包含 currentValue 和空的 options 列表，会清空下拉选项。

**修复**: 改为按 `id` 智能合并：
- 如果 incoming 的 options 列表非空 → 完整替换该项
- 如果 incoming 的 options 列表为空 → 仅更新 currentValue，保留已有选项
- 新的 id 且有 options → 追加

### 7. 前端：Resume 时恢复正确的 Agent 信息

**文件**: `apps/web/src/components/agent/AgentChatPanel.tsx`

**问题**: 页面刷新后 auto-resume 路径没有调用 `setRegistryId(latestSession.registry_id)`，导致 Agent 名称和图标始终显示默认 Agent（Claude Code）。

**修复**: 在两处 auto-resume 路径中，resume 之前加上 `setRegistryId(latestSession.registry_id)`。

### 8. 启用 `unstable_session_model` feature

**文件**: `crates/agent/Cargo.toml`

`models` API 在 ACP SDK 中需要 `unstable_session_model` feature flag：

```diff
- agent-client-protocol = "0.9"
+ agent-client-protocol = { version = "0.9", features = ["unstable_session_model"] }
```

### 9. 日志可见性

**文件**: `apps/api/src/main.rs`

`agent` crate 未包含在 tracing filter 中，所有日志被静默过滤。

```diff
- "api=debug,infra=debug,core_service=debug,core_engine=debug,tower_http=debug"
+ "api=debug,infra=debug,core_service=debug,core_engine=debug,agent=debug,tower_http=debug"
```

---

## 数据流对比

### 新版 Agent (configOptions)

```
Agent                          Atmos Backend                    Frontend
  │                                │                               │
  │◄── new_session ──────────────►│                               │
  │   { configOptions: [...] }    │                               │
  │                                │── ConfigOptionsUpdate ──────►│
  │                                │                               │ 显示下拉框
  │                                │                               │
  │                                │◄── set_config_option ────────│ 用户选择
  │◄── set_config_option ────────│                               │
  │   { configOptions: [...] }    │── ConfigOptionsUpdate ──────►│
```

### 旧版 Agent (modes + models)

```
Agent                          Atmos Backend (转换层)            Frontend
  │                                │                               │
  │◄── new_session ──────────────►│                               │
  │   { modes: {...},              │  map_modes_to_config_option   │
  │     models: {...} }            │  map_models_to_config_option  │
  │                                │── ConfigOptionsUpdate ──────►│
  │                                │                               │ 显示下拉框（统一格式）
  │                                │                               │
  │                                │◄── set_config_option ────────│ 用户选择 mode
  │◄── set_session_mode ─────────│  (路由: id=="mode")            │
  │                                │                               │
  │                                │◄── set_config_option ────────│ 用户选择 model
  │◄── set_session_model ────────│  (路由: id=="model")           │
  │                                │                               │
  │── current_mode_update ───────►│  仅更新 currentValue          │
  │                                │── ConfigOptionsUpdate ──────►│ 合并更新
```

---

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `crates/agent/Cargo.toml` | 启用 `unstable_session_model` feature |
| `crates/agent/src/acp_client/runner.rs` | 新增 `map_modes_to_config_option`、`map_models_to_config_option`、`emit_session_config`；legacy 路由逻辑 |
| `crates/agent/src/acp_client/client.rs` | 新增 `ConfigOptionUpdate`、`CurrentModeUpdate` 通知处理 |
| `apps/api/src/main.rs` | tracing filter 增加 `agent=debug` |
| `apps/web/src/components/agent/AgentChatPanel.tsx` | 移除硬编码过滤；auto-resume 时恢复 registryId |
| `apps/web/src/hooks/use-agent-session.ts` | config options 智能合并逻辑 |
