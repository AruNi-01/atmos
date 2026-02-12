---
title: Web 应用架构
section: deep-dive
level: intermediate
reading_time: 12
path: deep-dive/frontend/web-app
sources:
  - apps/web/src/app/[locale]/layout.tsx
  - apps/web/src/app/[locale]/page.tsx
  - apps/web/src/components/layout/CenterStage.tsx
  - apps/web/src/components/layout/LeftSidebar.tsx
  - apps/web/src/components/providers/websocket-provider.tsx
  - apps/web/src/hooks/use-project-store.ts
  - packages/ui
updated_at: 2026-02-12T12:00:00Z
---

# Web 应用架构

本文深入介绍 ATMOS Web 应用的页面结构、布局组件、WebSocket Provider、状态管理（stores）以及与 `@workspace/ui` 的协作方式。

## Overview

应用采用三栏布局：左侧边栏（项目/工作区树）、中央主区域（Tab：欢迎页、工作区概览、终端、Wiki、编辑器）、可选的右侧边栏。WebSocket 通过 `WebSocketProvider` 在根布局注入，子组件通过 `useWebSocket` 访问。状态管理主要使用 zustand stores（`useProjectStore`、`useWorkspaceContext`、`useTerminalStore` 等）。

## Architecture

```mermaid
graph TB
    subgraph 布局
        Root[RootLayout]
        Sidebar[LeftSidebar]
        Center[CenterStage]
        Right[RightSidebar]
    end

    subgraph CenterStage Tabs
        Welcome[WelcomePage]
        Overview[OverviewTab]
        Terminal[TerminalGrid]
        Wiki[WikiTab]
        Editor[FileViewer]
    end

    Root --> Sidebar
    Root --> Center
    Root --> Right
    Center --> Welcome
    Center --> Overview
    Center --> Terminal
    Center --> Wiki
```

```mermaid
flowchart LR
    subgraph Providers
        Theme[ThemeProvider]
        Ws[WebSocketProvider]
        Tmux[TmuxCheckProvider]
    end

    Theme --> Ws --> Tmux --> App
```

```mermaid
sequenceDiagram
    participant U as User
    participant S as Sidebar
    participant C as CenterStage
    participant T as Terminal
    participant Ws as WebSocket

    U->>S: 选择工作区
    S->>C: 切换 Tab
    C->>T: 渲染 TerminalGrid
    T->>Ws: 建立 /ws/terminal
    Ws-->>T: 输出流
```

## 主题与语义色

AGENTS.md 要求使用语义 CSS 变量（`bg-background`、`text-muted-foreground` 等），避免硬编码颜色，确保 Light/Dark 模式一致。

## Key Source Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/layout.tsx` | 根布局、Provider |
| `apps/web/src/components/layout/CenterStage.tsx` | 中央 Tab 容器 |
| `apps/web/src/components/providers/websocket-provider.tsx` | WebSocket 注入 |
| `apps/web/src/hooks/use-project-store.ts` | 项目状态 |

## Next Steps

- **[终端服务](../core-service/terminal.md)** — 终端与后端的协作
- **[API 层](../api/index.md)** — REST 与 WS 端点
