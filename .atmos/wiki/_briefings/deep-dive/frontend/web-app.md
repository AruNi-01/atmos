# Research Briefing: Web 应用结构与状态管理

## Involved Concepts
- frontend

## Role in the Project
前端应用是用户与 Atmos 交互的窗口。基于 Next.js 和 Zustand，它提供了一个类似 IDE 的复杂界面，包括多终端管理、文件浏览器和项目控制面板。

## Relevant Git History
- (请参考 _metadata/commit_details.txt 中关于 apps/web 的提交)

## Research Questions
1. 前端如何使用 Zustand 管理复杂的全局状态（如终端列表、当前选中的工作区）？
2. `Xterm.js` 是如何集成并与后端的 WebSocket 流对接的？
3. 布局系统如何支持多面板拖拽和缩放？
4. 国际化 (i18n) 方案是如何实现的？

## Required Source Files
- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/hooks/use-terminal-store.ts`
- `apps/web/src/components/terminal/Terminal.tsx`
- `apps/web/src/api/ws-api.ts`
- `apps/web/src/components/layout/PanelLayout.tsx`
