# Atmos Agent 状态监听技术设计文档

> 版本：v0.1
> 状态：草稿
> 范围：Claude Code、Codex CLI、opencode 三个工具的 Agent 状态感知，以及全局 Hook 安装的工程化方案

---

## 1. 背景与目标

Atmos 后端需要感知用户本地 Agent 工具的运行状态，统一抽象为以下三态：

| 状态 | 含义 |
| --- | --- |
| `idle` | Agent 空闲，等待用户输入 |
| `running` | Agent 正在处理任务（推理或执行工具） |
| `permission_request` | Agent 暂停，等待用户授权某个操作 |

前端只接入 Atmos 后端统一接口，由后端 Adapter 层负责各工具的适配。第一版覆盖上述三个工具。

架构总览：

```
用户本地
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Claude Code ──hook(HTTP)──┐                            │
│                            │                            │
│  Codex CLI   ──hook(HTTP)──┼──► Atmos 本地服务          │
│                            │    (localhost:atmos_port)  │
│  opencode    ──plugin──────┘         │                  │
│                                      │ WebSocket / SSE  │
└──────────────────────────────────────┼──────────────────┘
                                       ▼
                               Atmos 前端 / 远端

```

所有工具的 Hook 都以 HTTP POST 的方式上报事件到 Atmos 本地服务，由 Atmos 统一维护状态机，再向上推送给前端。

---

## 2. 统一状态机

### 2.1 状态定义

```
idle ──────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  用户提交 prompt                                                │
  ▼                                                                 │
running ◄──────────────────────────────────────────────────────────┤
  │  ▲                                                              │
  │  │ 工具执行前/后（permission 已解决）                            │
  │  │                                                              │
  ▼  │                                                              │
permission_request                                                  │
                                                                    │
           Agent 完成（Stop / session.idle）                        │
──────────────────────────────────────────────────────────────────►─┘

```

### 2.2 状态扭转事件映射

| 目标状态 | Claude Code | Codex CLI | opencode |
| --- | --- | --- | --- |
| `idle` | `Stop` / `SessionStart` | `Stop` / `SessionStart` | `session.idle` / `session.created` / `session.error` |
| `running` | `UserPromptSubmit` / `PreToolUse` | `UserPromptSubmit` / `PreToolUse` | `message.updated(role=user)` / `tool.execute.before` |
| `permission_request` | `Notification[permissionprompt]` | ❌ 不支持 | `permission.asked` |
| `running`（从 permission 恢复） | `PreToolUse` | ❌ 不支持 | `permission.replied` |

### 2.3 各工具状态机详述

#### Claude Code

```
SessionStart(startup/resume/clear/compact)    → idle

UserPromptSubmit                              → running

Notification[permissionprompt]                → permission_request
  注：使用 Notification 而非 PermissionRequest，
      原因是 PermissionRequest 对所有工具检查都触发（含自动批准），
      会产生状态抖动；Notification[permissionprompt] 只在
      真正需要用户交互时触发，语义更准确。

PreToolUse                                    → running
  作用：覆盖 permission_request 状态（用户批准后进入工具执行）
  注：若用户拒绝权限，不会触发 PreToolUse，
      由后续 Stop → idle 兜底

Stop                                          → idle（无条件，覆盖任何状态）

```

边缘情况：

- 用户拒绝权限后，Claude 可能直接 Stop → 状态从 `permission_request` 跳 `idle`，由 `Stop` hook 保证
- `SubagentStop` 不处理，主 Agent `Stop` 才是最终完成信号

#### Codex CLI

```
SessionStart(startup/resume)                  → idle

UserPromptSubmit                              → running

PreToolUse(Bash only)                         → running（维持）

PostToolUse(Bash only)                        → running（维持）

Stop                                          → idle

permission_request                            ❌ 无法感知
  注：Codex 没有 approval-requested hook，
      tui.notifications["approval-requested"] 是 TUI 内置通知，
      无法触发外部 hook。此版本降级处理，
      Codex adapter 只维护 idle / running 两态。

```

限制说明：

- Hooks 功能目前为实验性（`features.hooks = true` 需手动开启）
- PreToolUse / PostToolUse 只覆盖 Bash 工具，文件读写等工具暂不触发

#### opencode

```
session.created                               → idle

message.updated(properties.role == "user")    → running
  注：opencode 没有独立的 prompt submit 事件，
      通过监听 message.updated 并过滤 role=user 实现

tool.execute.before                           → running（维持）

tool.execute.after                            → running（维持）

permission.asked                              → permission_request ★

permission.replied                            → running
  注：无论用户选择 once / always / reject，
      permission.replied 都会触发，payload 包含决策结果

session.idle                                  → idle

session.error                                 → idle

```

opencode 是三者中状态感知最完整的：`permission_request` 可以精确进入和退出，无需依赖其他事件兜底。

---

## 3. Hook 安装方案

### 3.1 设计原则

- 全局安装，一次配置：atmos 安装时完成，对所有项目生效，不污染用户项目仓库
- HTTP 转发，逻辑集中：Hook 脚本只做转发，业务逻辑全在 Atmos 后端，升级无需更新 hook 配置
- 非侵入式合并：追加到用户已有的 hook 配置，不覆盖
- 可逆：卸载时完整清理

### 3.2 各工具安装位置

| 工具 | 全局配置文件 | 安装内容 |
| --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | 在 `hooks` 字段追加 HTTP hook 条目 |
| Codex CLI | `~/.codex/hooks.json` | 追加 hook 条目 + 开启 feature flag |
| opencode | `~/.config/opencode/plugins/atmos_plugin.ts` | 新建插件文件 |

### 3.3 Claude Code Hook 配置

在 `~/.claude/settings.json` 的 hooks 段追加以下条目（数组 append，不覆盖已有条目）：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/claude-code",
          "timeout": 5
        }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/claude-code",
          "timeout": 5
        }]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/claude-code",
          "async": true
        }]
      }
    ],
    "Notification": [
      {
        "matcher": "permissionprompt",
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/claude-code",
          "timeout": 5
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/claude-code",
          "async": true
        }]
      }
    ]
  }
}

```

注意：

- `PreToolUse` 和 `Stop` 使用 `async: true`，不阻塞 Agent 执行
- `ATMOS_PORT` 在安装时替换为实际端口号，写入文件后固定
- HTTP hook 在 Claude Code v2.x 支持，安装前需检查版本

### 3.4 Codex CLI Hook 配置

在 `~/.codex/hooks.json` 追加（文件不存在时创建）：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/codex",
          "timeout": 5
        }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/codex",
          "timeout": 5
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/codex",
          "async": true
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "http",
          "url": "http://localhost:{{ATMOS_PORT}}/hooks/codex",
          "async": true
        }]
      }
    ]
  }
}

```

同时在 `~/.codex/config.toml` 中开启 hooks feature flag：

```toml
[features]
hooks = true

```

### 3.5 opencode Plugin 文件

新建 `~/.config/opencode/plugins/atmos_plugin.ts`：

```typescript
import type { Plugin } from "@opencode-ai/plugin"

const ATMOS_PORT = "{{ATMOS_PORT}}"
const ATMOS_URL = `http://localhost:${ATMOS_PORT}/hooks/opencode`

async function post(event: object) {
  try {
    await fetch(ATMOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // 静默失败，不影响 Agent 正常运行
  }
}

export const AtmosPlugin: Plugin = async () => {
  return {
    event: async ({ event }) => {
      const type = event.type

      if (
        type === "session.created" ||
        type === "session.idle" ||
        type === "session.error" ||
        type === "permission.asked" ||
        type === "permission.replied" ||
        type === "tool.execute.before" ||
        type === "tool.execute.after"
      ) {
        await post(event)
      }

      // message.updated: 只转发 role=user 的消息
      if (type === "message.updated" && (event as any).properties?.role === "user") {
        await post(event)
      }
    },
  }
}

```

注意：

- 插件文件名全局唯一即可，`atmos_plugin.ts` 不会与用户其他插件冲突
- opencode 启动时自动加载 `~/.config/opencode/plugins/` 下所有文件，无需额外配置
- 使用 `AbortSignal.timeout(3000)` 防止 Atmos 服务未启动时阻塞插件初始化

---

## 4. Atmos 后端接收端设计

### 4.1 HTTP 接口

Atmos 本地服务暴露三个 hook 接收端点：

```
POST /hooks/claude-code    接收 Claude Code hook 事件
POST /hooks/codex          接收 Codex CLI hook 事件
POST /hooks/opencode       接收 opencode plugin 事件

```

Request body 为各工具原始 JSON payload，Adapter 层负责解析并映射到统一状态。

### 4.2 Adapter 映射逻辑

```
/hooks/claude-code
  payload.hook_event_name == "SessionStart"              → emit(idle)
  payload.hook_event_name == "UserPromptSubmit"          → emit(running)
  payload.hook_event_name == "Notification"
    && payload.notification_type == "permissionprompt"   → emit(permission_request)
  payload.hook_event_name == "PreToolUse"                → emit(running)
  payload.hook_event_name == "Stop"                      → emit(idle)

/hooks/codex
  payload.hook_event_name == "SessionStart"              → emit(idle)
  payload.hook_event_name == "UserPromptSubmit"          → emit(running)
  payload.hook_event_name == "PreToolUse"                → emit(running)
  payload.hook_event_name == "Stop"                      → emit(idle)

/hooks/opencode
  event.type == "session.created"                        → emit(idle)
  event.type == "message.updated" && role == "user"      → emit(running)
  event.type == "tool.execute.before"                    → emit(running)
  event.type == "permission.asked"                       → emit(permission_request)
  event.type == "permission.replied"                     → emit(running)
  event.type == "session.idle"                           → emit(idle)
  event.type == "session.error"                          → emit(idle)

```

### 4.3 状态推送

Atmos 维护每个 session 的当前状态，通过 WebSocket 或 SSE 向前端推送状态变更：

```json
{
  "session_id": "xxx",
  "tool": "claude-code",
  "state": "permission_request",
  "timestamp": "2026-03-29T12:00:00Z"
}

```

---

## 5. 安装与卸载流程

### 5.1 安装流程（`atmos install` 执行时）

```
1. 检测已安装的工具（claude, codex, opencode）
2. 获取 Atmos 本地服务端口（ATMOS_PORT）
3. 对每个检测到的工具：
   a. Claude Code：
      - 读取 ~/.claude/settings.json（不存在则创建空 {}）
      - 检查 hooks 字段中是否已存在 atmos 条目（通过 URL 匹配）
      - 若不存在，append 各事件的 hook 条目
      - 写回文件
   b. Codex CLI：
      - 读取 ~/.codex/hooks.json（不存在则创建）
      - append hook 条目（同上）
      - 写回文件
      - 检查 ~/.codex/config.toml，若 features.hooks != true 则追加
   c. opencode：
      - 确保 ~/.config/opencode/plugins/ 目录存在
      - 写入 atmos_plugin.ts（替换 ATMOS_PORT）
      - 若文件已存在且内容相同，跳过
4. 输出安装报告

```

### 5.2 升级流程（`atmos upgrade` 执行时）

- Claude Code / Codex：检查 hook URL 中的端口是否变化，变化则更新
- opencode：覆盖写入 `atmos_plugin.ts`（文件由 atmos 完全管理）

### 5.3 卸载流程（`atmos uninstall` 执行时）

```
1. Claude Code：
   - 读取 ~/.claude/settings.json
   - 从各事件的 hooks 数组中删除 URL 包含 atmos_port 的条目
   - 若某事件的 hooks 数组变为空，删除该事件键
   - 写回文件

2. Codex CLI：
   - 同上，清理 ~/.codex/hooks.json 中的 atmos 条目

3. opencode：
   - 删除 ~/.config/opencode/plugins/atmos_plugin.ts

```

---

## 6. 已知限制与后续迭代

| 限制 | 影响 | 后续方案 |
| --- | --- | --- |
| Codex 无 permission_request 感知 | Codex adapter 只有 idle/running 两态 | 待 Codex 官方支持 approval hook 后接入 |
| Codex hooks 为实验性功能 | 可能随版本变化 | 监控 Codex changelog，锁定最低支持版本 |
| Claude Code PermissionRequest 会对所有工具检查触发 | 若改用 PermissionRequest 替代 Notification 会有状态抖动 | 维持使用 Notification[permissionprompt] |
| Atmos 服务未启动时 hook 静默失败 | Agent 正常运行不受影响，但状态不更新 | 前端检测 Atmos 服务是否在线，离线时隐藏状态指示器 |
| opencode 的 message.updated 需过滤 role | 若 API 变更可能漏报 | 待 opencode 提供独立的 prompt submit 事件 |

---

## 7. 版本支持矩阵

| 工具 | 最低支持版本 | Hook/Plugin 机制 | 备注 |
| --- | --- | --- | --- |
| Claude Code | v2.x | HTTP hook (type: "http") | HTTP hook 在 v2.0 后支持 |
| Codex CLI | 最新版 | hooks.json（实验性） | 需 `features.hooks = true` |
| opencode | v1.x | JS/TS Plugin | 默认开启，无需额外配置 |
