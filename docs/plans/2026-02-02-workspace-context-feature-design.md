# Workspace Context Feature Design

> Created: 2026-02-02

## Overview

完善开发流程，为 Workspace 添加 Requirement 和 Task 追踪功能。

---

## 1. Overview Tab (Center Area)

**位置**: Center 区域第一个固定 Tab（Terminal 左边），不可关闭，Tab 名称 "Overview"

### 1.1 Context Info（紧凑两行）

**有 Workspace 时**：
```
Project: atmos    Workspace: feature-auth (🔀 feature/user-auth)
Path: ~/projects/atmos/workspaces/..    Created: 2026-02-01 14:30
```

**仅有 Project（main 分支开发）**：
```
Project: atmos    Branch: 🔀 main
Path: ~/projects/atmos
```

### 1.2 Requirement Section

- Markdown 预览，使用 Collapsible，默认折叠显示前几行
- Hover 时显示 Edit 按钮，点击在 monaco-editor 中打开 `.atmos/context/requirement.md`
- 若文件不存在，显示提示文案

### 1.3 Task Section

- 存储位置: `.atmos/context/task.md`
- 语法格式:
  - `- [ ] xxx` = TODO
  - `- [x] xxx` = DONE
  - `- [/] xxx` = PROGRESS
  - `- [-] xxx` = CANCELLED

**交互**:
- 状态图标可点击切换
- 双击文本可编辑
- Hover 显示删除按钮
- 底部 "Add Task" 按钮添加新任务

**视觉**:
- TODO: checkbox 空框图标
- PROGRESS: 进行中图标（如 loader 或半填充）
- DONE: checkbox 勾选图标，文本颜色变浅
- CANCELLED: 删除线，文本颜色变浅

---

## 2. Right Sidebar Agent Review

**位置**: Changes Tab > Source Control 行

**布局**: `[Agent Review ▼] [Create PR] [🔄]`

- Agent Review 占剩余宽度一半，带下拉菜单
- Create PR 占剩余宽度一半
- 刷新按钮在最右边

**Agent Review 下拉选项**（UI 先实现，功能后续）:
- 🤖 Code Agent Review
- 🔗 Qodo
- 🔗 Devin Review

---

## 3. Workspace Setup - Define Requirements Step

在 `WorkspaceSetupProgressView` 的 steps 中添加新步骤:

```
[Initialize Workspace] → [Setting up Environment] → [Define Requirements] → [Finalizing]
```

**Define Requirements 步骤**:
- 可选步骤，用户可跳过
- 显示 Markdown 编辑器
- 底部按钮: "Skip" 和 "Save & Continue"
- 提示文案: "需求将保存到 `.atmos/context/requirement.md`，可供后续上下文追踪以及引用给 Code Agent"

---

## Implementation Files

1. `apps/web/src/components/workspace/OverviewTab.tsx` - 新建 Overview Tab 组件
2. `apps/web/src/components/workspace/TaskList.tsx` - 新建 Task 列表组件
3. `apps/web/src/components/workspace/RequirementSection.tsx` - 新建 Requirement 区域组件
4. `apps/web/src/hooks/use-workspace-context.ts` - 新建 hook 管理 requirement/task 文件读写
5. `apps/web/src/components/layout/CenterStage.tsx` - 添加 Overview Tab
6. `apps/web/src/components/layout/RightSidebar.tsx` - 修改 Source Control 行
7. `apps/web/src/components/workspace/WorkspaceSetupProgress.tsx` - 添加 Define Requirements 步骤
