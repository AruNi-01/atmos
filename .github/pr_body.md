## Summary

修复 GitHub Kanban Import 功能的所有剩余 bug 并完成功能实现：

- **编译修复**：移除 `CreateWorkspaceDialog.tsx` 中的重复声明，添加 `WorkspaceKanbanView.tsx` 中缺失的导入
- **Kanban 数据加载**：实现 Kanban 视图加载包含 issue-only workspaces 的完整数据，同时保持侧边栏过滤
- **GitHub Issue 导入增强**：添加 `created_at`/`updated_at` 时间戳字段，支持排序和搜索参数
- **重复导入处理**：改进重复检测并添加用户反馈（跳过提示）
- **Build 模式优化**：锁定 Issue/PR 链接类型选择，防止误操作

## Related Issue

Closes #00ddc1

## Type of Change

- [x] Bug fix
- [x] New feature

## Validation

- [ ] `just lint`
- [ ] `just test`
- [ ] `just fmt`

## Checklist

- [x] I followed repository conventions and AGENTS.md guidance

## 主要变更文件

**Frontend:**
- `apps/web/src/components/dialogs/CreateWorkspaceDialog.tsx`
- `apps/web/src/components/dialogs/ImportGithubIssuesDialog.tsx`
- `apps/web/src/components/layout/sidebar/WorkspaceKanbanView.tsx`
- `apps/web/src/api/ws-api.ts`

**Backend:**
- `crates/core-engine/src/github/mod.rs`
- `crates/core-service/src/service/ws_message.rs`
- `crates/infra/src/websocket/message.rs`
