# Research Briefing: Web 应用结构与状态管理

## Involved Concepts
- frontend
- wiki-system
- react-state

## Role in the Project
前端应用是用户与 Atmos 交互的窗口。基于 Next.js 和 Zustand，它提供了一个类似 IDE 的复杂界面，包括多终端管理、文件浏览器、项目控制面板和集成 Wiki 系统。

## Relevant Git History
- e1ee52e: feat(wiki): add specify-wiki section and enhance validation
- 007edae: feat(web): improve mermaid diagram modal - fill space, drag pan, custom zoom input
- bc9b348: feat(wiki): add commit count functionality and enhance Markdown navigation
- b036a26: refactor(wiki): enhance project wiki structure and documentation
- (更多提交请参考 _metadata/commit_details.txt 中关于 apps/web 的提交)

## Research Questions
1. 前端如何使用 Zustand 管理复杂的全局状态（如终端列表、当前选中的工作区）？
2. `Xterm.js` 是如何集成并与后端的 WebSocket 流对接的？
3. 布局系统如何支持多面板拖拽和缩放？
4. 国际化 (i18n) 方案是如何实现的？
5. Wiki 增量更新机制如何检测版本变化并仅更新受影响页面？
6. Wiki 多语言生成功能如何与 Claude Agent 集成？

## Required Source Files
- `apps/web/src/app/[locale]/page.tsx`
- `apps/web/src/hooks/use-terminal-store.ts`
- `apps/web/src/components/terminal/Terminal.tsx`
- `apps/web/src/api/ws-api.ts`
- `apps/web/src/components/layout/PanelLayout.tsx`
- `apps/web/src/hooks/use-wiki-store.ts`
- `apps/web/src/components/wiki/WikiSidebar.tsx`
- `apps/web/src/components/wiki/WikiSpecifyDialog.tsx`
- `apps/web/src/components/wiki/WikiUpdateDialog.tsx`
- `apps/web/src/components/markdown/MarkdownRenderer.tsx`
- `apps/web/src/components/wiki/wiki-languages.ts`
- `apps/web/src/components/wiki/wiki-utils.ts`
