# Atmos Editor｜最终产品需求文档

**版本**：v2.0  
**产品**：Atmos Editor  
**定位**：Agent-native development document editor  
**状态**：产品方向已收敛，进入技术设计阶段

---

## 1. 产品定位

Atmos Editor 是一个面向开发工作的 **Agent-native Document Editor**。

它不是：

- 第二个 IDE
- 第二个 Canvas
- 第二个 Git/Diff/Terminal
- 第二个 Agent Runtime
- Notion 的复制品

它的核心职责只有三件事：

```text
表达内容
   ↓
组织上下文
   ↓
驱动 Agent
```

Editor 负责用户在“文档语境”中的思考、编写和 Agent 协作；复杂的开发操作继续交给 Atmos 现有页面和基础设施。

因此：

```text
Document
   │
   ├── Text / Blocks
   ├── References
   ├── Context
   └── Agent Prompt
          │
          ▼
     Agent / Atmos
          │
          ├── Terminal
          ├── Workspace
          ├── Git
          ├── Diff
          ├── GitHub
          ├── Linear
          ├── Canvas
          └── PT Design
```

---

# 2. 核心设计原则

## 2.1 Agent 是主能力，但 Editor 不负责实现 Agent Runtime

Atmos 已经具备成熟的 Agent 基础设施：

- Terminal Agent CLI
- 非交互 / headless Agent 执行
- Automation
- ACP Agent 集成
- Terminal Agent Input
- CLI + Skill
- Canvas Agent Dispatch
- PT Design Agent
- Agent Fix / Action 类能力

Automation 已经采用“在目标 Project / Workspace 中创建 tmux Terminal，并以非交互模式运行选定的 terminal agent”的模式。

Atmos 的 ACP 方案则将外部 Agent CLI 作为真正的 Agent Runtime，由 Atmos 负责 Session、工具路由、权限和执行。

Canvas 已经验证了“Agent → CLI/Skill → Atmos API → 浏览器中的实际产品对象”这类 Agent 操作模型；CLI 使用 HTTP 请求，Web 通过现有 `/ws` 接收 dispatch，最终由真实 Canvas Editor 执行，而不是把 Canvas 逻辑复制到 Agent 层。

**因此 Editor 不创建新的 `EditorAgentService`、新的 Agent SDK 或新的 Agent Runtime。**

Editor 的 Agent 能力本质上是：

> **Prompt + Context + Execution Adapter**

---

# 3. Agent Editor

## 3.1 默认开启

Atmos Editor 默认就是 Agent Editor。

用户打开文档后，不需要额外进入 AI 模式。

底部默认存在一个轻量 Agent Input：

```text
┌──────────────────────────────────────────────┐
│ ✦ Ask Agent about this document...        ↑ │
└──────────────────────────────────────────────┘
```

它应该是 Editor 的主交互，而不是一个可选插件。

---

## 3.2 Agent Input 不重新设计

Atmos 当前 Terminal 已经存在完整的 `TerminalAgentInputOverlay`，并且内部已经复用 `PromptComposer`；`PromptComposer` 已经具备：

- `@` Mention
- `/` Slash Command
- Context Chip
- File Mention
- Skill
- Side Chat
- Spawn
- Terminal Selection Context
- Skill Disable
- AI Context Protocol
- Attachment 等能力。

因此 Editor **直接复用现有 Prompt Composer 能力**。

目标不是：

```text
Terminal Input
+
Editor Input
+
Welcome Input
```

三套输入框。

而是：

```text
                Shared Agent Composer
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Welcome        Terminal        Editor
        │              │              │
   @ / commands   @ / commands   @ / commands
```

其中：

> **输入框的交互、Chip、补全、键盘行为、附件、上下文协议尽可能统一；只有不同 Surface 注册不同的 `@` / `/` Command Provider。**

---

# 4. Composer 架构

建议把现有 `PromptComposer` 从“Welcome 专属组件”逐渐演进成一个通用 Composer。

不要复制：

```text
EditorPromptComposer.tsx
TerminalPromptComposer.tsx
WelcomePromptComposer.tsx
```

而是：

```text
Shared Prompt Composer
        │
        ├── core input behavior
        ├── chip rendering
        ├── keyboard behavior
        ├── attachments
        ├── context protocol
        └── trigger engine
               │
        ┌──────┼─────────┐
        ↓      ↓         ↓
     Welcome Terminal   Editor
```

Surface 只提供配置：

```ts
type ComposerSurface =
  | "welcome"
  | "terminal"
  | "editor";
```

以及：

```ts
interface ComposerCommandRegistry {
  mentions: MentionProvider[];
  slashCommands: SlashCommandProvider[];
  contextResolvers: ContextResolver[];
  submitModes: SubmitMode[];
}
```

这样 Editor 可以拥有自己的：

```text
@file
@workspace
@branch
@github
@linear
@selection
@document
```

和：

```text
/agent
/plan
/summarize
/rewrite
/context
/file
/github
/linear
```

同时 Terminal 继续保留：

```text
/side
/spawn
/skill
/browser-use
/desktop-use
/view-run-logs
...
```

这与当前 Terminal `PromptComposer` 已经采用的 context protocol / slash / mention 模型高度一致。

---

# 5. Agent 执行模型

Editor 不定义一个唯一的“Agent 类型”。

同一个 Prompt 可以通过多个 **Execution Adapter** 执行。

```text
                    Editor Agent Prompt
                           │
                 Context + Instructions
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ↓                ↓                ↓
   Terminal CLI         ACP Chat         Atmos Action
    / headless            session          / skill
          │                │                │
          ↓                ↓                ↓
     tmux Agent        AgentService      Product API
```

---

## 5.1 Terminal CLI / Headless

这是 Editor 最重要的默认执行方式之一。

用户可以选择一个现有 Terminal Agent：

```text
Claude Code
Codex
Gemini CLI
...
```

Editor 生成：

```text
Prompt
+
Document Context
+
Referenced Context
+
Project / Workspace Context
```

然后：

```text
→ 使用现有 Terminal Agent 定义
→ 使用现有 CLI command
→ 使用现有 non-interactive flags
→ 在目标 Workspace / Project 中执行
```

这直接复用 Automation 当前的 Agent resolver 和 terminal-agent 定义，不再维护第二套 Agent Catalog。

用户体验上可以是：

```text
Run with
  Claude Code
  Codex
  Gemini CLI
  ...
```

执行结果可以进入：

```text
Agent Result
```

但完整运行过程仍然在：

> Terminal / Agent Runtime

中查看。

---

# 6. ACP Chat

对于需要长生命周期、权限控制、流式事件和 Agent Session 的场景，可以：

```text
Editor
   ↓
ACP Chat
   ↓
Atmos AgentService
   ↓
External Agent CLI
```

ACP 本身已经是 Atmos 的既有 Agent Runtime 方向：外部 Agent CLI 通过 ACP 与 Atmos 通信，Atmos 负责工具执行、权限和 Session。

因此 Editor 只需要：

> **发起 / 继续一个 ACP Session**

而不应该重新实现 ACP。

---

# 7. Send to Terminal

有时候用户根本不想让 Atmos “接管” Agent。

例如：

> “我只是想把这个 Prompt 给当前 Terminal 里的 Claude Code。”

那么 Editor 应支持：

```text
Send to Terminal →
```

行为：

```text
生成 Prompt
    ↓
写入 / 发送到当前 Terminal
    ↓
用户继续在原 Agent 中操作
```

这和：

> “把 Prompt 复制给任何地方的任何 Agent”

是同一种能力。

---

# 8. Copy Prompt

这是非常重要、而且非常轻的功能。

Editor 永远不应该强迫用户使用 Atmos Agent。

用户可以：

```text
Copy Prompt
```

得到：

```text
[Instructions]

...

[Document Context]

...

[Referenced Files]

...

[Workspace Context]
...
```

然后用户可以：

- 粘贴到 Claude Code
- 粘贴到 Codex
- 粘贴到 Gemini
- 粘贴到 ChatGPT
- 粘贴到任意 CLI
- 粘贴到任意 Agent

因此：

> **Editor 是 Prompt / Context Builder，而不是 Agent Vendor Lock-in。**

---

# 9. Atmos Action / Skill

有些能力并不需要完整 Agent。

例如：

```text
Fix this component
Generate a PT Design variant
Apply this transformation
Create this Canvas object
Run this Atmos action
```

这种场景可以直接调用 Atmos 已有的：

```text
CLI
+
Skill
+
API
+
WS Action
```

Canvas 已经验证了这种模式：

```text
Agent
 ↓
Skill / CLI
 ↓
Atmos API
 ↓
实际产品对象
```



PT Design 同样采用“Agent read/write 同一个 Design IR”的设计，并提供 MCP + CLI/Skill 两条 Agent 入口。

因此 Editor 不需要自己做：

```text
EditorAgentTool
```

而可以直接：

```text
Editor Action
      ↓
existing Atmos Skill / CLI / API
```

---

# 10. Agent Execution Selector

底部 Agent Input 可以提供一个轻量的执行目标选择器：

```text
[ Agent ▾ ]       Ask about this document...        ↑
```

展开：

```text
Run with

● Claude Code
  Terminal / headless

○ Codex
  ACP

○ Current Terminal
  Send to active terminal

○ Copy Prompt
  Use anywhere
```

默认选择：

> **当前推荐 Agent / 当前已有 Agent 上下文**

但不能让这个 selector 变成一个复杂的 Agent 管理页面。

Agent 管理继续由 Atmos Agent / Settings / Terminal 页面承接。

---

# 11. Agent Context

Editor 的另一个核心能力是：

> **把文档内容变成 Agent Context。**

默认上下文：

```text
Current document
Current selection
Current section
```

可选上下文：

```text
@file
@folder
@workspace
@branch
@github
@linear
@agent
@canvas
@pt-design
```

例如：

```text
Implement the requirement above based on:

@github#128
@file src/auth/**
@workspace auth-service
@branch feature/oauth
```

---

# 12. Context 与 Reference 的关系

Context 与 Reference 是两个不同概念。

### Reference

主要为了：

> 文档阅读 / 跳转

例如：

```text
🐙 #128 Implement GitHub OAuth
```

### Context

主要为了：

> Agent 执行

例如：

```text
@github#128
@file src/auth/**
```

两者可以共享同一个底层对象模型，但 UI 和语义不同。

---

# 13. 文档里的 Atmos 对象应该非常轻

必须避免把已有 Atmos 页面复制到 Editor。

---

## GitHub / Linear

显示：

```text
🐙 #128 Implement GitHub OAuth
```

点击：

```text
→ Atmos GitHub
```

---

## File

显示：

```text
📄 src/auth/github.ts
```

点击：

```text
→ Editor / File viewer
```

---

## Workspace / Branch

显示：

```text
🌿 feature/github-oauth
```

点击：

```text
→ Workspace
```

---

## Diff

显示：

```text
8 files changed · +284 −73

Review changes →
```

不要嵌入完整 Diff。

---

## Canvas / PT Design

显示：

```text
🎨 Authentication Flow
Open →
```

必要时增加缩略图。

不要把完整 Canvas / PT Design 嵌进 Editor。

---

## Agent

显示：

```text
🤖 OAuth implementation
Running · Open Agent →
```

不要在 Editor 中显示完整 Tool Call / Terminal / Permission / Runtime 面板。

---

# 14. Agent Result

Agent 完成任务后，Editor 可以留下轻量结果。

例如：

```text
┌──────────────────────────────────────┐
│ ✦ Agent result                       │
│                                      │
│ Added GitHub OAuth callback.         │
│ 8 files changed · 42 tests passed   │
│                                      │
│ Review changes →                     │
└──────────────────────────────────────┘
```

完整执行日志：

```text
Open Agent →
```

或：

```text
Open Terminal →
```

---

# 15. Agent 对文档的修改

这里可以使用 Tiptap 的文档编辑能力 / AI Toolkit 作为**文档编辑工具层**。

职责划分：

```text
Tiptap
  ↓
Document read / insert / update / review

Atmos Agent
  ↓
Development context / filesystem / git / terminal
```

因此：

> **Tiptap AI Toolkit 可以作为 Agent 修改 Document 的工具能力，但不作为 Atmos 的 Agent Runtime。**

这样既能利用 Tiptap 已经提供的 Agent-aware document editing，也不会把 Atmos Agent 架构绑到 Tiptap AI Toolkit 上。

---

# 16. 修改预览

Agent 修改文档后：

```text
Preview Changes
```

支持：

```text
Accept
Reject
Regenerate
Ask Agent
```

文档修改应该尽可能属于：

> Document Change

而不是代码 Diff。

如果 Agent 修改的是代码：

```text
Editor
   ↓
Agent
   ↓
Code changes
   ↓
Atmos Diff
```

继续进入 Atmos 原有 Diff / Review。

---

# 17. Slash Command

Editor Slash Command 分成三个层级。

## Document

```text
/text
/heading
/list
/task
/code
/table
/quote
/callout
/image
```

具体名称由 Tiptap 模板能力承接。

---

## Agent

```text
/agent
/ask
/rewrite
/summarize
/expand
/translate
/plan
/checklist
```

这些主要是：

> 生成 Prompt / 触发 Agent Action

不是另一套 Agent Runtime。

---

## Atmos

```text
/file
/workspace
/branch
/github
/linear
/agent
/canvas
/pt-design
/context
```

这些主要用于：

> 插入 Reference / Context

---

# 18. @ Mention

Editor 的 `@` 不复制 Terminal 全部能力，而是使用相同 Composer 基础设施 + 不同 Provider。

Editor 默认支持：

```text
@file
@folder
@workspace
@branch
@github
@linear
@agent
@canvas
@pt-design
```

Terminal 可以继续保持自己的：

```text
@issue
@pr
@file
@skill
@side
...
```

因此：

> **共享 Composer，隔离 Command Registry。**

这是比维护两套输入框更合理的设计。

---

# 19. Notion-like Mode

Atmos Editor 必须同时提供两种模式。

## Notion-like

默认推荐。

特点：

- 块式文档
- Slash Menu
- Drag & Drop
- Floating Toolbar
- Block Menu
- 宽松阅读布局
- 文档级层次
- 适合长文档

使用 Tiptap 官方 Notion-like Editor 基础能力。

Atmos 只增加：

- Agent Input
- Atmos References
- Atmos Context
- Agent Actions

---

# 20. Simple Mode

Simple Mode 是：

> **快速写，而不是“简化版 Notion”。**

特点：

- 更少 Toolbar
- 更少块视觉装饰
- 更少 hover UI
- 更紧凑
- 更接近纯文本编辑
- 依然支持 Agent

Simple Mode 中 Agent Input 仍然存在。

---

# 21. 两种模式共享同一 Document Model

```text
             Document Model
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
   Notion-like              Simple
```

切换模式不会改变：

- 文档内容
- Reference
- Context
- Agent Result
- Attachment
- 文档结构

只是改变：

> **编辑器 UI 表现。**

---

# 22. Editor 不负责完整开发工作流

明确禁止以下功能在 Editor 中重新实现：

```text
完整 Diff
完整 Terminal
完整 Git
完整 Git Graph
完整 GitHub
完整 Linear
完整 Canvas
完整 PT Design
完整 Agent Runtime
完整 Automation 管理
完整 Workspace 管理
```

只提供：

```text
Reference
Preview
Context
Action
Navigation
```

---

# 23. Automation 与 Editor 的关系

Editor 不新建“文档自动化 Agent”。

如果用户要：

> “每天自动执行这个任务。”

Editor 可以提供：

```text
Create Automation →
```

然后调用现有 Automation。

最终：

```text
Editor
  ↓
Automation definition
  ↓
existing AutomationService
  ↓
existing terminal agent
  ↓
existing tmux / artifacts / run history
```

Automation 仍然保持自己的：

- scheduler
- run history
- terminal evidence
- artifacts
- notifications

Editor 只负责定义 / 修改 instructions。

Automation 已经采用同一套 shared terminal-agent definitions、non-interactive execution 和 tmux-backed runs，因此不要新增 Editor 专属 Agent Catalog。

---

# 24. CLI + Skill 与 Editor 的关系

Editor 中可以提供：

```text
Copy for Agent
```

以及：

```text
Copy Atmos Skill Prompt
```

但不应该再次实现 Skill 系统。

Atmos 当前 Agent-first CLI 已经明确把 `atmos-cli` 定位成：

> Agent 操作 Atmos 产品的统一入口。

同时 Canvas / Browser / Desktop / Review 等能力保持独立 Skill。

Editor 应遵循这个边界。

---

# 25. Agent Execution 的最终模型

```text
                       Editor
                          │
                  Prompt + Context
                          │
             ┌────────────┼─────────────┐
             │            │             │
             ▼            ▼             ▼
         CLI/headless   ACP Chat    Copy / Terminal
             │            │             │
             ▼            ▼             ▼
        Terminal Agent  AgentService   Any Agent
             │            │
             └──────┬─────┘
                    │
                    ▼
             Development Context
                    │
          ┌─────────┼─────────┐
          ↓         ↓         ↓
       Workspace   Git      Files
```

另外，对于结构化 Atmos 能力：

```text
Editor
  ↓
Skill / CLI / API
  ↓
Canvas / PT Design / Atmos Action
```

---

# 26. Editor 的 Agent 不应该拥有自己的状态体系

Editor 不创建：

```text
EditorAgentSession
EditorAgentRun
EditorAgentHistory
```

除非未来明确证明需要。

优先复用：

- Terminal session
- ACP session
- Automation run
- Atmos Agent session
- Existing CLI result

Editor 只保存：

```text
Document
References
Context
Agent result reference
```

这样不会形成第二套 Agent 数据模型。

---

# 27. 包与代码边界

建议：

```text
packages/editor/
```

负责：

```text
Tiptap integration
Notion-like
Simple
Document schema
Atmos reference node
Document serialization
Editor-specific UI
```

但 Agent Runtime 不进入 `packages/editor`。

Editor 只定义：

```text
AgentRequest
AgentContext
AgentExecutionAdapter
```

实际 adapter 仍由 `apps/web` / Atmos existing services 提供。

---

# 28. 推荐 Adapter 接口

概念上：

```ts
interface AgentExecutionAdapter {
  id: string;
  label: string;

  canRun(context: AgentExecutionContext): boolean;

  execute(request: AgentRequest): Promise<AgentExecutionResult>;

  cancel?(executionId: string): Promise<void>;
}
```

第一阶段可以实现：

```text
terminal-cli
acp
terminal-current
copy
atmos-action
```

其中：

### `terminal-cli`

调用现有 terminal agent / headless 模式。

### `acp`

连接现有 ACP Agent session。

### `terminal-current`

将 prompt 发送给当前 Terminal。

### `copy`

生成最终 prompt 并复制到 clipboard。

### `atmos-action`

调用已有 Atmos CLI / Skill / API。

---

# 29. Agent Prompt 结构

Editor 最终发送的并不是简单：

```text
user text
```

而是结构化：

```text
AgentRequest
├── instruction
├── document
├── selection
├── references
├── context
├── workspace
├── branch
├── execution
└── output
```

其中：

### instruction

用户输入。

### document

当前文档内容 / 结构。

### selection

当前选区。

### references

用户显式引用的 Atmos 对象。

### context

当前自动上下文。

### workspace

当前 Atmos Workspace。

### branch

当前 Branch。

### execution

```text
terminal-cli
acp
terminal
copy
```

### output

```text
document-edit
text
action
navigation
```

这样未来换 Agent Runtime 不需要重新设计 Editor。

---

# 30. V1 必须完成的功能

## P0 Editor

- Tiptap
- Notion-like Mode
- Simple Mode
- Toolbar
- Slash
- Drag & Drop
- Markdown / JSON serialization
- 基础 Block
- Undo / Redo

## P0 Agent

- 默认 Agent Input
- 复用现有 PromptComposer
- Selection → Agent
- Document → Agent
- Agent Generate
- Agent Rewrite
- Agent Summarize
- Agent Context
- Copy Prompt

## P0 Execution

- Terminal CLI / headless
- Current Terminal
- Copy Prompt
- 基础 ACP 入口

## P0 Context

- `@file`
- `@folder`
- `@workspace`
- `@branch`
- `@github`
- `@linear`

## P0 Navigation

- File
- Workspace
- Branch
- GitHub
- Linear
- Agent
- Diff
- Canvas / PT Design

全部采用轻量 Reference。

---

# 31. P1

- Agent Result
- Document Change Preview
- Accept / Reject
- Agent Execution Selector
- Automation Handoff
- Atmos CLI / Skill Handoff
- Agent Context Panel
- Reference Hover Preview
- Agent session resume
- `/context`
- `/plan`
- `/checklist`

---

# 32. P2

- Tiptap AI Toolkit 深度集成
- Agent-driven document editing
- Agent-generated structured content
- Multi-step Agent interaction
- Document → Automation
- Document → PT Design
- Document → GitHub Issue
- Document → Linear Issue
- Document → Agent Task

---

# 33. 非目标

V1 明确不做：

- 自研 Agent Runtime
- 自研 ACP implementation
- 自研 Terminal Agent executor
- Editor 专属 Agent history
- Editor 专属 Automation engine
- 完整 Git UI
- 完整 Diff
- 完整 Terminal
- 完整 Canvas
- 完整 PT Design
- 完整 GitHub / Linear 页面
- 第二套 Skill system
- 第二套 CLI
- 第二套 Agent catalog

---

# 34. 最终产品结构

Atmos Editor 最终应该是：

```text
                         ATMOS EDITOR
                              │
                  ┌───────────┴───────────┐
                  │                       │
              Document                  Agent
                  │                       │
          ┌───────┴───────┐       Prompt + Context
          │               │               │
     Notion-like       Simple             │
          │               │               │
          └───────┬───────┘               │
                  │                       │
                  └───────────┬───────────┘
                              │
                     Existing Atmos
                    Agent Infrastructure
                              │
       ┌──────────────┬───────┼────────┬──────────────┐
       ↓              ↓       ↓        ↓              ↓
   Terminal CLI      ACP    Terminal  Skill/CLI     Atmos API
       │              │
       └──────────────┴─────────┐
                                ↓
                        External Agent
```

而文档中的开发对象：

```text
GitHub
Linear
File
Workspace
Branch
Diff
Agent
Canvas
PT Design
```

只作为：

```text
Reference
+
Context
+
Navigation
```

存在。

---

# 35. 最终产品定义

> **Atmos Editor 是一个 Agent-native 的开发文档编辑器。**
>
> 它使用 Tiptap 提供成熟的 Notion-like / Simple 编辑体验，以现有 Atmos Prompt Composer 作为 Agent 输入基础，通过统一的 `@` / `/` Provider 提供文档级 Context，并把用户 Prompt 交给已有的 Terminal CLI、ACP、Terminal、CLI/Skill 或 Atmos Action 执行。
>
> Editor 不重新实现 Atmos 已有的开发工具，而是把这些工具变成文档中的轻量 Reference、Context 和入口。
>
> **文档负责思考，Agent 负责执行，Atmos 页面负责深入操作。**

---

## 36. 最重要的边界

最终把 Atmos Editor 压缩成三个词：

```text
Document
Context
Agent
```

而不是：

```text
Document
+ Git
+ Diff
+ Terminal
+ Canvas
+ GitHub
+ Linear
+ Agent
+ Automation
+ ...
```

这会让 Editor 成为 Atmos 的**上层工作语言**，而不是又一个工作台。