# Fix Workflow

用于 `automations/review/comment-fix/INSTRUCTION.md` 的分支、修复、验证、提交和推送阶段。只有存在可验证、可修复评论时读取并执行。

## 分支与工作区规则

默认策略：修复应推回触发评论所在的原 PR 分支，让原 PR 更新，而不是另开无关 PR。

执行步骤：

1. `git status --short` 检查工作树。
2. 如果有本次 automation 之外的未提交改动，停止并说明阻塞；不要 stash、reset 或覆盖。
3. 获取 PR metadata：base branch、head branch、head repo、head SHA、是否可向 head branch push。
4. 检出 PR head branch。优先使用 `gh pr checkout <PR_NUMBER>`。
5. 确认当前 HEAD 与 PR head SHA 一致或是其后续提交；如果 PR 在运行中被更新，重新评估评论是否仍适用。
6. 如果没有权限推送原 PR 分支，创建独立分支 `codex/review-comment-fix/pr-<PR_NUMBER>-YYYY-MM-DD-HHMM`，并在最终输出中说明需要人工决定如何合并。

禁止：

- force push
- rebase 原 PR 分支
- 修改 PR base branch
- 把 unrelated cleanup 混入修复
- 修改其他 automation 的结果历史文件，除非本次明确要记录结果

## 修复原则

- 优先做最小正确修复，保持 PR 原意。
- 每条修复都要能追溯到具体评论 URL。
- 评论要求如果存在多种解释，选择最小且与代码上下文一致的解释；不确定时跳过并说明。
- 不为了满足 review agent 而引入复杂抽象。
- 不改变公共 API、数据 schema、WebSocket 协议或用户行为，除非评论指出的 bug 必须这样修。
- 如果修复触及 Rust 分层，遵守 `infra -> core-engine -> core-service -> apps/api` 方向。
- 如果修复触及前端，遵守现有 feature/module 边界和 UI 组件约定。

## 验证规则

根据改动范围运行最小可靠验证：

- Rust：`cargo fmt`，目标 crate 的 `cargo test` 或 `cargo check`
- Web：`bun --filter web typecheck`，针对改动文件的 lint
- Relay/package：对应 package 的 typecheck/test/lint
- 通用：`git diff --check`

如果全仓库命令因既有无关问题失败，必须：

- 写明失败命令。
- 列出失败是否与本次改动相关。
- 补跑能覆盖本次改动的更小范围验证。

## 提交与推送

如果完成修复：

1. 使用 conventional commit。
2. 提交信息推荐：`fix: address review agent comments on PR <PR_NUMBER>`。
3. 提交 body 或最终报告中列出修复的 comment URL。
4. 推送到原 PR head branch；如果无权限，推送独立修复分支。
5. 不自动 merge。

如果推送到原 PR 分支成功，可在 PR 下发布一条简短评论：

- 已处理的 review agent 评论数量。
- 修复 commit hash。
- 验证命令与结果。
- 未处理评论及原因。

如果创建了独立修复分支且需要开 PR：

- base 优先选择原 PR head branch；如果无法选择，停止并输出人工操作建议。
- PR 标题推荐：`fix: address review comments for PR <PR_NUMBER>`。
- PR body 使用仓库 PR 模板，说明这是针对原 PR review comments 的 stacked fix。
