---
name: Project Wiki Ask Integration
overview: "在 Project Wiki 中增加选中文本 Copy for AI，并在 Agent Chat Panel 增加 Wiki Ask 模式切换。Wiki Ask 使用 ACP Agent Chat，要求会话与默认聊天隔离，仅在 Project/Wiki 场景且 Wiki 已生成时可用，其他聊天能力复用现有实现。"
todos:
  - id: wiki-selection-copy
    content: 在 Wiki 预览区接入文本选择检测与 SelectionPopover，支持 Copy for AI（仅复制）
    status: pending
  - id: wiki-formatter
    content: 扩展 format-selection-for-ai 以支持 wiki 选择内容格式化
    status: pending
  - id: chat-mode-model
    content: 定义 Agent Chat 模式模型（default/wiki_ask）与上下文门禁规则
    status: pending
  - id: chat-mode-ui
    content: 在 AgentChatPanel 顶部历史按钮左侧添加模式切换按钮与禁用态提示
    status: pending
  - id: session-isolation
    content: 为 Wiki Ask 模式实现独立 session key、独立历史列表与独立恢复逻辑
    status: pending
  - id: open-chat-bridge
    content: 新增从 Wiki Copy for AI 到 Agent Chat 的桥接（仅复制，不自动发送）
    status: pending
  - id: wiki-guard-state
    content: 在 Wiki Store 暴露“wiki 是否已生成”可读状态供 Chat 模式门禁复用
    status: pending
  - id: qa-and-rollout
    content: 补充测试清单与灰度开关策略，确保不影响已有 Agent Chat 体验
    status: pending
isProject: false
---

# Project Wiki Ask 技术方案

## 1. 背景与目标

本方案覆盖两个能力：

1. 在 `Project Wiki` 查看页面中，用户选中文本后可弹出 `Copy for AI`，当前阶段只做复制到剪贴板，不做一键发送。
2. `Wiki Ask` 通过现有 `ACP Agent Chat` 能力实现，但需要在 `Agent Chat Panel` 中新增“模式切换”，并保证：
   - Wiki Ask 会话与默认聊天会话隔离；
   - 仅在 `Project/Wiki` 工作区域可用；
   - 必须已生成 Wiki（`.atmos/wiki` 存在）才可用；
   - 其余连接、权限、工具调用、历史加载等逻辑全部复用现有实现。

---

## 2. 现状调研结论（与现有代码对齐）

- Wiki 渲染主入口在 `apps/web/src/components/wiki/WikiContent.tsx`，预览态使用 `MarkdownRenderer`。
- 已存在可复用选择浮层组件：`apps/web/src/components/selection/SelectionPopover.tsx`，含 `Copy for AI`、动画与提示。
- 已存在选择格式化工具：`apps/web/src/lib/format-selection-for-ai.ts`，目前仅覆盖 `editor` 与 `diff`。
- 已存在聊天主面板：`apps/web/src/components/agent/AgentChatPanel.tsx`，历史按钮在头部右侧，且已支持按 context 恢复 session。
- 已存在 chat 连接 Hook：`apps/web/src/hooks/use-agent-session.ts`，具备会话创建/恢复/发送 prompt 的完整能力。

结论：本次应采取“新增 Wiki 模式元信息 + 复用现有 ACP 会话管线”的方案，避免复制一套 Chat UI。

---

## 3. 需求拆解与范围

### 3.1 In Scope

- Wiki 预览区文本选择 -> 弹 `Copy for AI`。
- 新增 `Wiki Ask` 聊天模式切换入口（放在历史按钮左侧）。
- Wiki Ask 与默认聊天的 session/history 隔离。
- 可用性门禁：仅 Project/Wiki 且 Wiki 已生成。
- 复制内容格式适配 Wiki 场景（包含 wiki 页路径/标题/选中文本）。

### 3.2 Out of Scope（本期不做）

- 从浮层“一键发送到 Agent Chat”。
- 多轮引用管理（如连续 snippets 自动拼接上下文）。
- ACP 后端协议扩展（本方案不新增 ws action）。

---

## 4. 交互设计

## 4.1 Wiki 页面选中复制

- 触发：用户在 Wiki 预览正文（`MarkdownRenderer` 容器）中选中文本。
- 行为：在选区附近出现简化浮层按钮 `Copy for AI`（可沿用 `SelectionPopover` 的 quick copy 交互）。
- 结果：写入剪贴板，toast 提示 `Selection copied for AI`。
- 退出：点击空白、滚动、Esc、选区取消。

复制内容建议模板（Markdown）：

```md
## Wiki Excerpt
- **Wiki Page**: `overview/architecture.md`
- **Section**: `Runtime Flow`  # 若可解析到最近 heading

~~~markdown
<selected_text>
~~~

## Ask
<optional note when expanded copy is used>
```

## 4.2 Agent Chat 模式切换

- 位置：`AgentChatPanel` 头部右侧操作区，置于 `History` 按钮左侧。
- 交互：点击后在 `default` / `wiki_ask` 之间切换（建议 Segmented 或轻量 Popover）。
- 状态：
  - `wiki_ask` 可用时：正常可点；
  - 不可用时：禁用 + tooltip 说明原因（不在 Wiki 区域 / 尚未生成 Wiki）。
- 标识：切到 `wiki_ask` 后，标题下方显示小标签 `Mode: Wiki Ask`。

---

## 5. 核心技术设计

## 5.1 聊天模式模型

新增前端模式枚举：

```ts
type AgentChatMode = "default" | "wiki_ask";
```

模式能力规则：

- `default`：现有行为不变。
- `wiki_ask`：仅改变“会话隔离键 + 默认 prompt 引导 + 可用性门禁”，ACP 会话连接、消息渲染、工具执行、权限确认等完全复用。

## 5.2 会话隔离策略

会话隔离采用“存储目录物理隔离 + 前端 key 逻辑隔离”双层方案。

### 目录级隔离（主策略）

- 默认 Chat 继续使用现有目录（保持兼容）。
- Wiki Ask 会话单独落在：
  - `~/.atmos/agent/wiki_ask_sessions/`
- 任何 `wiki_ask` 模式下的会话创建、恢复、列表查询都必须指向该目录，确保与默认会话在文件层面完全隔离。

后端建议实现方式（概念）：

- 在 agent session manager 增加 `session_scope` 或 `mode` 入参（`default` / `wiki_ask`）。
- 根据 mode 解析 session root：
  - `default` -> `<existing_session_root>`
  - `wiki_ask` -> `~/.atmos/agent/wiki_ask_sessions/`
- `createSession / resumeSession / listSessions / updateTitle` 统一走同一套路由分发，避免出现“创建在 A、查询在 B”的不一致。

### 前端 key 隔离（辅助策略）

`AgentChatPanel` 的 last-session 恢复 key 继续 mode-aware，避免 UI 侧误串会话：

```ts
getSessionContextKey(workspaceId, projectId, mode)
// workspace:<id>:default
// workspace:<id>:wiki_ask
// project:<id>:default
// project:<id>:wiki_ask
```

影响点：

- `LAST_SESSION_STORAGE_KEY` 下存储 map 的 key 改为 mode-aware。
- 会话相关 REST API 请求统一携带 mode，服务端据此路由到对应目录。
- `create new session`、`resume`、`auto restore` 全部基于当前 mode 进行。

### 会话切换体验约束（强约束）

- `default` 与 `wiki_ask` 需要各自维护“当前最新活跃 session”状态，互不影响。
- 用户在 mode 间切换时，不应每次都触发 `resumeSession` 并等待历史重放。
- 推荐策略：面板内维护双缓存（或多缓存）会话状态，切换 mode 时优先直接切换到已连接会话；仅在无可用会话时才创建/恢复。

可执行策略（前端）：

- 在 `AgentChatPanel` 维护 `activeSessionByMode`：
  - `default -> { sessionId, contextKey, status }`
  - `wiki_ask -> { sessionId, contextKey, status }`
- mode 切换流程：
  1. 若目标 mode 存在已连接且 context 匹配的会话，直接切换展示，不执行 resume。
  2. 若存在 sessionId 但未连接，后台静默恢复（非阻塞 UI）。
  3. 若不存在，则新建会话。

说明：为了满足“切换流畅”，应避免每次 mode 切换都清空 entries 并重新拉全量历史。

### Wiki Ask 的 context 级隔离（Project/Workspace）

Wiki Ask 除了与 default 隔离外，还必须在不同 Project/Workspace 间隔离：

- `wiki_ask` 会话绑定 `contextKey`（workspace 优先，fallback project）。
- 当打开 Wiki Ask 时，如果当前活跃 wiki_ask session 的 `contextKey` 与当前上下文不一致：
  - 必须自动新建 session；
  - 不得复用其他 Workspace 的 wiki_ask session。
- 同一 context 下可复用该 context 的最新 wiki_ask session。
- 用户手动点击“新建会话”始终允许，并覆盖该 context 的“最新活跃 session”指针。

## 5.3 Wiki Ask 可用性门禁

可用条件：

1. 当前存在有效 `projectId/workspaceId`（非全局 temp）。
2. UI 处于 Project/Wiki 工作语境（可由 `CenterStage` 当前 fixed tab + context 判断）。
3. `wikiExists === true`（复用 `use-wiki-store` 的状态）。

不可用行为：

- 模式按钮禁用并显示具体文案：
  - `Only available in Project Wiki`
  - `Generate Wiki first to use Wiki Ask`
- 若当前正在 `wiki_ask` 模式且门禁失效（如切走上下文），自动回退 `default` 并断开当前会话（避免跨场景污染）。

## 5.4 Wiki 选区复制实现策略

优先复用：

- `SelectionPopover`：复用 UI 与 copy 逻辑；
- `format-selection-for-ai.ts`：新增 `formatWikiSelectionForAI()`，或给 `formatEditorSelectionForAI` 增加 `sourceType = "wiki"` 分支。

在 `WikiContent` 增加：

- 选区监听（`mouseup` + `selectionchange`）。
- 选区归属判断（必须在 `#wiki-content-root` 内）。
- 浮层定位（基于 `Range.getBoundingClientRect()` + scroll 偏移）。
- `SelectionInfo` 组装：
  - `filePath`: `.atmos/wiki/<activePage>.md`
  - `selectedText`: 当前选中文本
  - `language`: `markdown`
  - `startLine/endLine`: 若无法稳定计算可先填 0（formatter 兼容）

---

## 6. 代码改造清单

## 6.1 主要修改文件

- `apps/web/src/components/wiki/WikiContent.tsx`
  - 接入文本选择监听与 `SelectionPopover` 渲染。
- `apps/web/src/components/selection/SelectionPopover.tsx`
  - `SelectionType` 扩展支持 `wiki`（或新增 `wiki` props 分支）。
- `apps/web/src/lib/format-selection-for-ai.ts`
  - 增加 Wiki 格式化函数。
- `apps/web/src/components/agent/AgentChatPanel.tsx`
  - 新增模式切换按钮、mode 状态、mode-aware session key、门禁处理。
- `apps/web/src/hooks/use-agent-session.ts`
  - 保持复用，仅接受上层 mode 透传的 session metadata（如需要）。
- `apps/web/src/hooks/use-wiki-store.ts`
  - 暴露稳定 `wikiExists` 读取能力供 Chat 面板判断。

## 6.2 可选扩展文件（如需最小后端配合）

- `apps/web/src/api/rest-api.ts`
  - 会话列表/创建/恢复 API 增加 `mode` 字段。
- Agent 后端会话管理实现（必要改造）
  - 基于 `mode` 将 Wiki Ask 会话持久化到 `~/.atmos/agent/wiki_ask_sessions/`。
  - 默认模式继续使用原路径，保持向后兼容。

---

## 7. 实施步骤（建议）

### Step 1：Wiki 选区复制（独立可交付）

- 在 `WikiContent` 预览态接入 selection 捕获。
- 复用 `SelectionPopover` 的 quick-copy 按钮。
- 新增 wiki 格式化模板并完成复制成功提示。

验收：在 Wiki 页面选中任意段落可复制为 AI 可读 Markdown。

### Step 2：Agent Chat 模式切换 UI

- 在历史按钮左侧新增模式切换按钮。
- 加入可用性门禁与禁用文案。
- 切换时更新本地 mode 状态。

验收：按钮位置正确，禁用态符合场景约束。

### Step 3：会话隔离与恢复逻辑

- 将 last session map key 改为 mode-aware。
- 历史列表、自动恢复、新建会话按当前 mode 独立。
- 切 mode 时清空当前 entries，并切到对应 mode 的上次会话（若存在）。

验收：default 与 wiki_ask 历史互不干扰，切换后上下文隔离。

### Step 4：门禁联动与回退策略

- 监听 wikiExists/context/tab 变化。
- 失效时自动回落 default，确保不可误用 wiki_ask。

验收：离开 Wiki 区域或 Wiki 不存在时无法继续 wiki_ask。

---

## 8. 测试计划

- **功能测试**
  - Wiki 选区复制：短文本/长文本/跨段落/包含代码块。
  - 模式切换：default -> wiki_ask -> default 循环。
  - 门禁：未生成 Wiki、非 Wiki tab、temp context。
- **隔离测试**
  - default 模式会话 A，wiki_ask 模式会话 B，互不出现在对方历史。
  - 刷新页面后，分别恢复到各自模式最近 session。
- **回归测试**
  - 现有 Agent Chat（权限弹窗、工具调用、停止生成、附件上传）不回归。
  - Wiki viewer 原有加载/编辑/更新流程不受影响。

---

## 9. 风险与应对

- 选区行号难准确：Wiki 先允许 `startLine/endLine=0`，避免阻塞一期。
- 历史过滤若需后端字段：先前端本地隔离 key + metadata，后续补服务端索引优化。
- 模式切换导致误断连：仅在 mode 变化时主动重置会话，普通渲染更新不触发 disconnect。

---

## 10. 里程碑与交付建议

- M1（0.5-1 天）：完成 Wiki Copy for AI。
- M2（1 天）：完成 Chat 模式按钮 + 门禁 + 本地模式状态。
- M3（1-1.5 天）：完成 session 隔离 + 历史隔离 + 回归测试。

建议按 M1->M3 顺序合并，确保每一步都可独立验证并可回滚。

