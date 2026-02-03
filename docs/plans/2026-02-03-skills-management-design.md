# Skills 管理功能设计

## 概述

为 ATMOS 添加 Skills 管理功能，支持查看已安装的 Code Agent Skills 和访问 Skills 市场。

## 功能入口

### Header 按钮
- **位置**：ThemeToggle 和 Fullscreen 按钮之间
- **图标**：`Puzzle` icon
- **交互**：点击打开全屏 Skills Modal

```tsx
// Header.tsx
<ThemeToggle ... />
<button onClick={() => setSkillsModalOpen(true)}>
  <Puzzle className="size-4" />
</button>
<button onClick={toggleFullScreen}>...</button>
```

## Skills 管理界面

### 布局结构

```
┌─────────────────────────────────────────────────┐
│  Skills                                    [X]  │
├─────────────────────────────────────────────────┤
│  [My Skills]  [Marketplace]                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  (Tab 内容区域)                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### My Skills Tab

扫描并展示用户已安装的 Skills，以卡片网格形式展示。

**Skill 卡片设计**

```
┌─────────────────────────────────────────┐
│  [icon]  Skill Name                     │
│          ┌───────┐ ┌────────┐           │
│          │Cursor │ │ Global │           │
│          └───────┘ └────────┘           │
│  ─────────────────────────────────────  │
│  Description text truncated to 2        │
│  lines with ellipsis...                 │
│                          [展开 ▼]       │
└─────────────────────────────────────────┘
```

**卡片内容**
- Skill icon (前端根据 agent 类型映射)
- Skill 名称
- Agent 来源标签 (Cursor / Claude Code / Droid 等，带颜色区分)
- 来源范围标签：
  - `Global` - 全局安装
  - `Project` - 项目级，hover 显示 tooltip: "来自项目: {projectName}"
- 描述 (截断 2 行，可展开查看完整内容)
- 展开后显示 skill 文件路径

### Marketplace Tab

- iframe 嵌入 `https://skills.sh/`
- 占满整个内容区域

## 支持的 Code Agents

扫描以下 Agent 的 skills 目录 (全局 `$HOME/` 和项目级)：

| Agent | 目录 |
|-------|------|
| Amp | `.agents/skills` |
| Antigravity | `.agent/skills` |
| Augment | `.augment/rules` |
| Claude Code | `.claude/skills` |
| OpenClaw | `skills` |
| Cline | `.cline/skills` |
| CodeBuddy | `.codebuddy/skills` |
| Codex | `.codex/skills` |
| Command Code | `.commandcode/skills` |
| Continue | `.continue/skills` |
| Crush | `.crush/skills` |
| Cursor | `.cursor/skills` |
| Droid (Factory) | `.factory/skills` |
| Gemini CLI | `.gemini/skills` |
| GitHub Copilot | `.github/skills` |
| Goose | `.goose/skills` |
| Junie | `.junie/skills` |
| iFlow CLI | `.iflow/skills` |
| Kilo Code | `.kilocode/skills` |
| Kimi Code CLI | `.agents/skills` |
| Kiro CLI | `.kiro/skills` |
| Kode | `.kode/skills` |
| MCPJam | `.mcpjam/skills` |
| Mistral Vibe | `.vibe/skills` |
| Mux | `.mux/skills` |
| OpenCode | `.opencode/skills` |
| OpenClaude IDE | `.openclaude/skills` |
| OpenHands | `.openhands/skills` |
| Pi | `.pi/skills` |
| Qoder | `.qoder/skills` |
| Qwen Code | `.qwen/skills` |
| Replit | `.agent/skills` |
| Roo Code | `.roo/skills` |
| Trae | `.trae/skills` |
| Windsurf | `.windsurf/skills` |
| Zencoder | `.zencoder/skills` |
| Neovate | `.neovate/skills` |
| Pochi | `.pochi/skills` |
| AdaL | `.adal/skills` |

## 数据结构

### WebSocket API

**请求**
```typescript
// Client -> Server
{ "type": "skills.list" }
```

**响应**
```typescript
// Server -> Client
{
  "type": "skills.list.response",
  "skills": [
    {
      "name": "git-commit-helper",
      "description": "Helps write better commit messages...",
      "agent": "cursor",
      "scope": "global" | "project",
      "projectId": string | null,
      "projectName": string | null,
      "path": "/Users/xxx/.cursor/skills/git-commit-helper"
    }
  ]
}
```

### 前端 Icon 映射

```typescript
// constants/agent-icons.ts
const AGENT_ICONS: Record<string, ComponentType> = {
  cursor: CursorIcon,
  claude: ClaudeIcon,
  factory: FactoryIcon,
  copilot: CopilotIcon,
  // ... 其他 agents
}

const DEFAULT_SKILL_ICON = PuzzleIcon;
```

## 扫描逻辑

1. **全局 Skills**：扫描 `$HOME/{agent_dir}/skills/` 目录
2. **项目 Skills**：扫描已导入项目的 `{project_path}/{agent_dir}/skills/` 目录
3. 合并去重，标注来源 (global/project)

## 文件结构

```
apps/web/src/
├── components/
│   └── skills/
│       ├── SkillsModal.tsx        # 全屏 Modal 主组件
│       ├── SkillsTab.tsx          # My Skills Tab
│       ├── MarketplaceTab.tsx     # Marketplace iframe Tab
│       ├── SkillCard.tsx          # Skill 卡片组件
│       └── constants.ts           # Agent 目录映射、icon 映射
├── hooks/
│   └── use-skills-store.ts        # Skills 状态管理
└── api/
    └── ws-api.ts                  # 新增 skills.list WebSocket API

crates/core-service/src/
└── skill/
    ├── mod.rs
    └── scanner.rs                 # Skills 目录扫描逻辑

apps/api/src/
└── ws/
    └── skills.rs                  # WebSocket handler
```

## 后续扩展

- **Tauri 桌面端**：将 iframe 替换为 WebView 获得更好的集成体验
- **Skill 操作**：添加删除、禁用、编辑功能
- **Skill 同步**：支持跨设备同步已安装的 skills
