# Auto Fix PR

用于 `automations/review/quality/INSTRUCTION.md` 的低分自动修复与 PR 创建阶段。只有总分低于 90 时读取并执行。

## 触发条件

- 如果昨日 main 无业务/代码提交：输出“昨日 main 无新增提交”，不要修复，不要创建 PR，但仍按结果落盘和结果提交与推送规则提交并推送结果文件。
- 如果总分大于等于 90：只输出审查报告，不要修改代码，不要创建 PR。
- 如果总分低于 90：必须自动进入修复流程；不要询问用户是否修复。

## 修复边界

- 只修复本次审查确认由昨日 main 提交引入、放大或固化的代码质量/设计质量问题。
- 不做功能验收，不改变产品需求，不扩展未要求的新功能。
- 优先修复导致扣分的高/中严重度问题；低严重度问题只有在同一改动范围内顺手收口且风险很低时才处理。
- 按仓库现有架构和 AGENTS.md 指引做最优设计：职责拆分、分层回正、重复逻辑收敛、控制流简化、命名和接口收口。
- 不要为了“修复”引入一次性复杂框架或大范围无关重构。
- 如果工作树存在本次 automation 之外的未提交改动，不要覆盖或回滚。优先使用独立分支/工作树隔离修复；如果无法安全隔离，报告阻塞原因，不要破坏用户改动。

## 分支、提交和验证

- 在同步后的 main 基础上创建独立修复分支，建议命名为 `codex/quality-fix/YYYY-MM-DD`；如果分支已存在，追加短时间戳或短 hash 保证唯一。
- 完成修复后运行与改动相关的最小可靠验证，例如 `cargo fmt`、目标 `cargo test`/`cargo check`、`bun --filter web typecheck`、针对改动文件的 lint、`git diff --check`。
- 如果全仓库检查因无关历史问题失败，必须说明失败文件与本次改动是否相关，并补跑针对本次改动的验证。
- 使用 conventional commit 提交修复，提交信息应反映质量修复主题，例如 `refactor: improve daily quality findings`。
- 不要把审查报告之外的无关改动放进同一个提交。

## 创建 PR

- 修复提交完成后，必须推送修复分支到 `origin`，然后使用本地 `gh` CLI 创建 PR，base 必须是 `main`。
- 必须优先使用仓库 PR 模板 `.github/PULL_REQUEST_TEMPLATE.md` 填写 PR body；如果模板缺失，使用同等结构：Summary、Related Issue、Type of Change、Validation、Checklist。
- PR 标题应包含质量修复语义和审查日期，例如 `refactor: address daily quality findings for YYYY-MM-DD`。
- PR body 必须包含：原始质量评分、触发修复的主要问题、修复摘要、验证命令与结果、剩余风险或未处理原因。
- 如果仓库存在 `codex` 和 `codex-automation` labels，创建 PR 后必须添加这两个标签；如果任一 label 不存在，说明跳过原因，不要因为 label 缺失阻塞 PR。
- 如果 `gh pr create` 因认证、网络或权限失败，必须保留本地分支和提交，输出失败原因、分支名、提交 hash，以及可手动重试的 `gh pr create` 命令。

## 输出要求补充

- 如果总分低于 90 且 PR 创建成功，必须给出：修复分支、提交 hash、PR URL、验证摘要、人工 review 最应关注的剩余风险。
- 如果总分低于 90 但未能创建 PR，必须明确写出阻塞点和下一步人工操作。
- 用户每天只审查 PR，因此低分场景不要停留在报告层面；必须尽最大可能交付可 review 的 PR。
