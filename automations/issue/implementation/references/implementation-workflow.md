# Implementation Workflow

用于 `automations/issue/implementation/INSTRUCTION.md` 的分支、实现、验证、提交、推送和 PR 创建阶段。只有 issue 可直接实现时读取并执行。

## 分支与工作区规则

默认策略：从 repository default branch 创建独立实现分支，并通过 PR 交付。

执行步骤：

1. `git status --short` 检查工作树。
2. 如果有本次 automation 之外的未提交改动，停止并说明阻塞；不要 stash、reset 或覆盖。
3. 获取 repository default branch，通常是 `main`。
4. 同步 default branch 最新状态。
5. 创建唯一实现分支，建议命名为 `codex/issue-implementation/issue-<ISSUE_NUMBER>-YYYY-MM-DD-HHMM`。
6. 如果分支已存在，追加短 hash 或更精确时间戳保证唯一。

禁止：

- force push
- rebase 或改写 default branch
- 直接向 default branch 提交
- 把 unrelated cleanup 混入实现
- 修改其他 automation 的结果历史文件，除非本次明确要记录结果

## 实现原则

- 优先做最小正确实现，保持 issue 范围。
- 每个关键改动都要能追溯到 issue 的明确要求。
- 如果实现触及 Rust 分层，遵守 `infra -> core-engine -> core-service -> apps/api` 方向。
- 如果实现触及前端，遵守现有 feature/module 边界、UI 组件约定和 WebSocket-first 规则。
- 不新增 REST API，除非现有模块已经是 REST 或 issue 明确属于启动/bootstrap、设置持久化、一次性管理动作。
- 不为了单个 issue 引入一次性抽象、复杂框架或大范围重构。
- 涉及用户界面时，遵守现有设计系统和局部 `AGENTS.md`；不要做 landing page 式说明页来代替真实功能。

## 验证规则

根据改动范围运行最小可靠验证：

- Rust：`cargo fmt`，目标 crate 的 `cargo test` 或 `cargo check`
- Web：`bun --filter web typecheck`，针对改动文件的 lint 或测试
- Relay/package：对应 package 的 typecheck/test/lint
- 通用：`git diff --check`

如果全仓库命令因既有无关问题失败，必须：

- 写明失败命令。
- 列出失败是否与本次改动相关。
- 补跑能覆盖本次改动的更小范围验证。

相关验证完全无法运行且没有可靠替代时，不要创建“已完成”报告；写 `blocked` 并说明原因。

## 提交、推送和 PR

如果完成实现：

1. 使用 conventional commit。
2. 提交信息推荐：`fix: implement issue <ISSUE_NUMBER>` 或 `feat: implement issue <ISSUE_NUMBER>`，按实际改动选择。
3. 推送实现分支到 `origin`。
4. 使用本地 `gh` CLI 创建 PR，base 为 repository default branch。
5. PR body 必须包含：issue URL、实现摘要、验证命令与结果、剩余风险。
6. 如果实现完整解决 issue，在 PR body 使用 `Fixes #<ISSUE_NUMBER>`；如果只是部分实现，使用 `Refs #<ISSUE_NUMBER>`。
7. 不自动 merge，不直接关闭 issue。

如果仓库存在 `codex` 和 `codex-automation` labels，创建 PR 后可添加这两个标签；如果 label 不存在，说明跳过原因，不要因为 label 缺失阻塞 PR。

如果 `gh pr create` 因认证、网络或权限失败，必须保留本地分支和提交，输出失败原因、分支名、提交 hash，以及可手动重试的 `gh pr create` 命令。

## Issue 状态评论

PR 创建成功后，可在 issue 下发布一条简短评论：

- PR URL
- 实现摘要
- 验证命令与结果
- 未覆盖范围或需要人工 review 的点

不要发布长篇日志，不要贴完整 diff，不要包含本机路径或敏感信息。
