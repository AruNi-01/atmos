# Atmos Editor｜最终产品需求文档

**版本**：v1.0  
**产品**：Atmos Editor  
**定位**：Agent-native development document editor  
**核心技术方向**：Tiptap + Tiptap Notion-like / Simple Template + Atmos Agent / Context 能力

---

## 1. 产品定位

Atmos Editor 不是一个独立的 Notion，也不是把 Atmos 中已有的 Git、Diff、Terminal、Canvas、GitHub、Linear、Agent 等功能重新做一遍。

Atmos Editor 的核心职责是：

> **让用户以文档为中心表达需求、组织开发上下文，并让 Agent 直接参与文档的理解、生成和修改。**

Editor 负责：

- 写作
- 内容组织
- AI 辅助编辑
- Agent 协作
- 开发上下文引用
- 外部对象概览

Atmos 原有页面负责：

- 完整 Git 操作
- Diff / Review
- Terminal
- GitHub / Linear 管理
- Workspace 操作
- Canvas
- Agent Runtime 详细过程

因此 Editor 与 Atmos 其他模块形成：

```text
                    Atmos
                      │
       ┌──────────────┼──────────────┐
       │              │              │
     Editor         Workspace       Canvas
       │              │              │
       │              │              │
    表达/上下文       执行/操作       空间化思考
```

Editor 是**上下文层**，不是第二个工作台。

---

# 2. 核心产品理念

## 2.1 Agent-first，而不是 AI add-on

Agent Editor 是 Atmos Editor 的主能力。

用户不是先进入普通文档，再额外打开 AI。

而是：

> **文档天然就是 Agent 工作空间的一部分。**

Agent 可以：

- 阅读当前文档
- 理解文档结构
- 理解用户选中的内容
- 根据上下文生成内容
- 修改当前文档
- 插入新的结构化内容
- 总结 / 重写 / 扩展
- 根据文档生成计划
- 根据文档内容执行开发任务
- 使用 Atmos 中已经存在的 workspace / file / git / GitHub 等上下文

---

## 2.2 Editor 不复制 Atmos 能力

必须遵守：

> **嵌入轻量信息，复杂操作跳转原页面。**

例如：

| 能力 | Editor 中的表现 |
|---|---|
| File | 文件引用 / 简介 |
| Workspace | Workspace 概览 |
| Branch | Branch 状态 |
| GitHub Issue | Issue 卡片 / inline reference |
| Linear Issue | Issue 卡片 / inline reference |
| Diff | changed files / summary |
| Review | review summary |
| Agent | Agent 状态 / 结果 |
| Canvas | Canvas 缩略图 / 引用 |
| Terminal | Command / result 概览 |
| Git | 状态摘要 |

这些对象在 Editor 中只负责：

**识别 → 理解 → 跳转**

完整操作仍然进入 Atmos 原页面。

---

# 3. Editor 模式

Atmos Editor 提供两种文档编辑模式：

## 3.1 Notion-like Mode

默认推荐模式。

定位：

> **现代块编辑器，适合需求、设计、技术方案、Agent Task、知识文档。**

视觉和交互参考 Notion：

- 块结构
- Slash Command
- Drag & Drop
- Floating Toolbar
- Block Menu
- 大内容区
- 清晰的文档层级
- 低干扰阅读体验

适合：

- PRD
- Technical Spec
- Requirement
- Agent Plan
- Project Notes
- Architecture Documentation
- Meeting / Research Notes

---

## 3.2 Simple Mode

定位：

> **轻量、快速、低干扰的纯文本编辑器。**

特点：

- 极简 Toolbar
- 更少视觉层级
- 更少 Block UI
- 更接近 Markdown / Text Editor
- 减少页面上的装饰
- 更适合快速输入

适合：

- 简单 Notes
- Quick Draft
- Prompt
- 简短任务描述
- 临时记录

Simple Mode 与 Notion-like Mode 使用相同底层 Document Model，因此文档可以无损切换模式。

---

# 4. Agent Editor

## 4.1 Agent Editor 是默认能力

Atmos Editor 默认集成 Agent，不需要安装独立 AI 插件。

核心交互：

```text
Document
   │
   ├── Select text
   │       ↓
   │    Ask Agent
   │
   ├── Slash /
   │       ↓
   │    Agent Commands
   │
   └── Bottom Agent Input
           ↓
        Agent
```

Agent 输入框默认存在于 Editor 环境中，但不能干扰正常阅读和输入。

---

# 5. Agent 输入框

Agent Editor 默认提供一个低干扰的 Agent Prompt：

```text
┌─────────────────────────────────────────────┐
│ ✦ Ask Agent about this document...       ↑ │
└─────────────────────────────────────────────┘
```

输入框支持：

### 当前文档

Agent 默认可以理解：

- 当前文档
- 当前选区
- 当前段落
- 当前标题 / Section

### Atmos Context

用户可以显式加入：

```text
@file
@workspace
@branch
@github
@linear
@agent
@canvas
```

例如：

```text
Analyze @file(src/auth/**)
and implement the requirement described above.
```

---

# 6. Agent 能力

## 6.1 文档级操作

Agent 可以：

- 总结文档
- 改写文档
- 扩写文档
- 压缩内容
- 调整结构
- 生成标题
- 生成目录
- 转换语气
- 翻译
- 修正语法

---

## 6.2 选区级操作

用户选中内容后，可以：

```text
Explain
Rewrite
Improve
Expand
Shorten
Translate
Generate code
Generate requirements
Generate tests
Ask Agent
```

Agent 的修改默认使用：

> **Preview → Accept / Reject**

而不是直接覆盖。

---

## 6.3 结构生成

Agent 可以根据自然语言生成：

- Paragraph
- Heading
- List
- Checklist
- Table
- Code Block
- Quote
- Callout

例如：

> “把上面的需求整理成一个 implementation checklist”

Agent 直接在当前位置生成对应 Block。

---

# 7. Agent + Developer Context

Atmos Editor 最大的特色不是普通 AI Writing，而是：

> **Agent 能理解开发环境。**

Agent 可以结合：

```text
Current Document
+
Selected Content
+
Referenced Files
+
Current Workspace
+
Current Branch
+
Git Context
+
GitHub / Linear References
```

进行工作。

例如：

```text
Implement this requirement based on:

@github #128
@file src/auth/**
@workspace auth-service
@branch feature/oauth
```

Agent 应该能够理解这些 Reference，而不是把它们当作普通字符串。

---

# 8. Slash Command

Tiptap 已经提供成熟 Slash Command / Menu 能力，Atmos 不重复造底层组件，只负责注册 Atmos 自己的命令。

Slash Command 分为三类。

## Basic

```text
Text
Heading
Bullet List
Numbered List
Task
Quote
Code
Table
Callout
Divider
Image
```

## Agent

```text
Ask Agent
Generate
Rewrite
Summarize
Create Plan
Create Requirement
Create Checklist
Explain Selection
```

## Atmos

```text
File Reference
Workspace Reference
GitHub Reference
Linear Reference
Branch Reference
Agent Reference
Canvas Reference
```

---

# 9. Atmos Reference

这是 Atmos Editor 的核心特色之一。

Reference 不是把完整的 Atmos 页面嵌入文档，而是：

> **在文档中建立对 Atmos 对象的语义引用。**

支持：

```text
@file
@workspace
@branch
@github
@linear
@agent
@canvas
```

最终呈现为轻量 UI：

```text
📄 src/auth/github.ts
🐙 #128 Implement GitHub OAuth
🌿 feature/github-oauth
🤖 OAuth implementation
🎨 Authentication Architecture
```

---

# 10. Reference 的交互

Reference 支持：

### Inline

```text
Implement based on 🐙 #128.
```

### Block

```text
┌────────────────────────────────────┐
│ 🐙 #128                            │
│ Implement GitHub OAuth             │
│ Open →                             │
└────────────────────────────────────┘
```

具体形态根据对象选择。

---

## 10.1 Hover Preview

Hover 时可以查看：

- Title
- Status
- Owner
- 时间
- 简短描述
- 关键状态

不加载完整应用。

---

## 10.2 Click Navigation

点击后进入 Atmos 对应页面。

例如：

```text
GitHub Reference
        ↓
Atmos GitHub Page
```

```text
Diff Reference
        ↓
Atmos Diff Page
```

```text
Canvas Reference
        ↓
Atmos Canvas
```

---

# 11. 哪些能力允许真正嵌入 Editor

必须控制范围。

## 允许嵌入

因为它们属于文档内容：

```text
Text
Heading
List
Task
Code
Image
Table
Quote
Callout
AI-generated content
AI suggestion
```

以及少量轻量开发内容：

```text
Command
File attachment
Agent result
```

---

# 12. 哪些能力只提供概览

以下对象只提供轻量 Preview：

```text
GitHub
Linear
Workspace
Branch
Agent
Canvas
Review
Diff
```

例如：

```text
8 files changed
+284 −73

Review changes →
```

而不是把整个 Diff 页面嵌进 Editor。

---

# 13. 哪些能力必须跳转 Atmos 页面

以下属于重交互能力：

```text
Diff Review
Terminal
Git Graph
GitHub Management
Linear Management
Canvas Editing
Agent Runtime
Workspace Management
Advanced Git Operations
```

原则：

> **Editor 中只能理解和引用，深入操作回到原生页面。**

---

# 14. Agent Result

Agent 执行完成后，Editor 里展示轻量结果。

例如：

```text
┌─────────────────────────────────────────┐
│ ✨ Agent Result                         │
│                                         │
│ GitHub OAuth implementation completed.  │
│                                         │
│ 8 files changed                         │
│ Tests: 42 passed                        │
│                                         │
│ Review changes →                        │
└─────────────────────────────────────────┘
```

Agent 运行期间：

```text
🤖 Agent is working...
View Agent →
```

完整 Tool Calls、Terminal、思考过程、执行日志等进入 Atmos Agent 页面。

---

# 15. Agent 对文档的修改

Agent 修改文档必须支持：

```text
Preview
Accept
Reject
```

对于较大的修改支持：

```text
Apply
Apply Section
Reject
Ask Agent to revise
```

用户应该始终知道：

> Agent 修改了什么。

---

# 16. Document Context

每个文档可以拥有 Context。

Context 可以来源于：

```text
Explicit References
+
Current Workspace
+
Current Branch
+
Document Metadata
```

例如：

```text
Context

Workspace
auth-service

Branch
feature/oauth

References
🐙 #128
📄 src/auth/**
🔵 LIN-283
```

Agent 可以直接使用 Context，而不需要用户重复描述。

---

# 17. Context 不应该污染正文

正文保持干净：

```text
# GitHub OAuth

Implement OAuth login...
```

Context 通过：

- Side Panel
- Agent Input
- Inline Reference
- Hover UI

表达。

而不是到处插入：

```text
Workspace: ...
Branch: ...
Project: ...
```

---

# 18. Document Structure

底层使用 Tiptap Document Model。

推荐：

```text
@atmos/editor
```

作为独立 package。

建议结构：

```text
packages/editor/
├── core
├── extensions
│   ├── atmosphere-reference
│   ├── agent
│   └── attachment
├── components
│   ├── notion-like
│   ├── simple
│   ├── agent-input
│   ├── slash-menu
│   └── reference-preview
├── ai
├── context
└── serialization
```

Tiptap 负责底层编辑能力，Atmos 只维护真正属于 Atmos 的扩展。

---

# 19. 与 Atmos API 架构的关系

Editor 不应该直接自己实现 Agent / Git / Workspace API。

使用现有：

```text
@atmos/api-client
@atmos/api-types
```

例如：

```text
Editor
  ↓
Atmos Agent Adapter
  ↓
@atmos/api-client
  ↓
WsSession
  ↓
Atmos Runtime
```

Reference 同样通过 Atmos 已有 API 获取数据。

这样 Editor 不产生第二套 API Client。

---

# 20. 与 Tiptap AI Toolkit 的关系

Tiptap AI Toolkit 负责：

```text
Document manipulation
AI document editing
Streaming insertion
Review / preview
Schema awareness
Agent → document tools
```

Atmos Agent 负责：

```text
Developer context
Workspace
File
Git
Terminal
GitHub
Linear
Agent runtime
```

整体关系：

```text
                Atmos Agent
                     │
             ┌───────┴────────┐
             │                │
      Atmos Context      Tiptap AI Tools
             │                │
       Workspace/         Document
       File/Git/...       Read/Edit
```

Atmos 不重复实现 Tiptap 已经成熟的 Editor AI 能力。

---

# 21. Notion-like Mode

## 目标

提供完整、舒适的块编辑体验。

## UI

```text
Document Header
      ↓
Editor Surface
      ↓
Floating Toolbar
      ↓
Slash Menu
      ↓
Agent Input
```

特征：

- 最大化内容区域
- 文档型排版
- 块间距自然
- Drag Handle
- Slash Command
- Floating Toolbar
- AI actions
- Reference Preview

适合长文档。

---

# 22. Simple Mode

## 目标

> 让用户“打开就写”。

UI 尽可能简单：

```text
┌─────────────────────────────────┐
│ title                           │
│                                 │
│ Start writing...                │
│                                 │
│                                 │
├─────────────────────────────────┤
│ ✦ Ask Agent...                 │
└─────────────────────────────────┘
```

减少：

- Floating UI
- 多余 Toolbar
- Block decorations
- 大量边框
- 复杂文档导航

但依然保留：

- Markdown
- Slash
- Agent
- Reference
- AI editing

---

# 23. 两种模式必须共享底层文档

```text
             Document Model
                  │
        ┌─────────┴──────────┐
        ↓                    ↓
  Notion-like             Simple
```

用户可以：

```text
Notion-like
    ↓
Simple
    ↓
Notion-like
```

而不会丢失：

- Formatting
- Blocks
- References
- Agent changes
- Attachments
- Metadata

---

# 24. 移动端策略

Mobile 不复制 Desktop Editor 的复杂 UI。

移动端优先：

```text
Document
   ↓
Reading / Writing
   ↓
Agent
```

保留：

- Basic formatting
- Slash
- Agent
- Reference
- Selection actions

复杂能力：

```text
Diff
Terminal
Canvas
Git
Review
```

通过 Navigation 进入对应页面。

---

# 25. 非目标

V1 不做：

- 完整 Git 客户端嵌入
- 完整 Diff Viewer
- 完整 Terminal
- 完整 GitHub UI
- 完整 Linear UI
- 完整 Canvas
- 完整 Agent Runtime
- 第二套 Workflow System
- 第二套 API Client
- 自研富文本编辑引擎
- 自研 AI Document Engine

核心原则：

> **能复用 Tiptap 就不重写，能跳转 Atmos 就不嵌入。**

---

# 26. MVP

## P0：基础 Editor

- Tiptap
- Notion-like Mode
- Simple Mode
- Toolbar
- Slash Menu
- Drag & Drop
- Markdown / JSON serialization
- Basic blocks
- Responsive layout

## P0：Agent

- Agent Input
- Select → Ask Agent
- Document-level Agent
- AI Generate
- AI Rewrite
- AI Summarize
- AI Continue
- Preview / Accept / Reject
- Agent-generated blocks

## P0：Atmos Context

- File Reference
- Workspace Reference
- Branch Reference
- GitHub Reference
- Linear Reference
- Agent Reference

## P1：开发体验

- Context Panel
- Hover Preview
- Open in Atmos
- Agent Context
- File attachments
- Agent result card
- Git / Diff summary

## P1：高级 Agent

- Requirement → Plan
- Plan → Agent
- Agent → Document
- Document → Agent context
- Multi-step document editing
- Agent-generated structured content

---

# 27. 成功标准

Atmos Editor 不以“功能数量”作为成功标准。

核心指标应该是：

### 1. 写作体验

用户能够快速：

> 创建 → 编辑 → 整理文档

### 2. Agent 体验

用户能够自然：

> 写一句话 → Agent 理解 → 修改文档 / 生成内容

### 3. Context 体验

用户能够：

> 在文档里引用开发对象，而无需复制粘贴上下文。

### 4. 页面协同

用户能够：

> 从文档快速进入 Atmos 中真正负责复杂操作的页面。

### 5. 视觉体验

Editor 不应该让用户觉得：

> “这里又塞了一个 IDE。”

而应该感觉：

> **“这是一个懂我当前项目的开发文档。”**

---

# 28. 最终产品模型

最终 Atmos Editor 应该形成：

```text
                    ATMOS EDITOR
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     Document          Agent           Context
        │                │                │
   Tiptap Engine      AI Toolkit       References
        │                │                │
        └────────────────┼────────────────┘
                         │
                 Atmos Development
                    Environment
                         │
       ┌──────────┬──────┼──────┬──────────┐
       ↓          ↓      ↓      ↓          ↓
    Workspace    Git   GitHub  Linear    Canvas
       │
       ↓
    Agent Runtime
```

**一句话总结：**

> **Atmos Editor = Tiptap 的优秀文档编辑体验 + Agent-first 文档交互 + Atmos 开发上下文引用。**
>
> 它不是第二个 Atmos，也不是 Notion Clone，而是一个**能够理解当前项目、能够和 Agent 一起工作的开发文档编辑器**。