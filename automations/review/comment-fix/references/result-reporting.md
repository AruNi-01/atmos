# Result Reporting

用于 `automations/review/comment-fix/INSTRUCTION.md` 的最终报告和结果落盘阶段。

## 结果落盘

每次执行结束后，不管是否完成修复，都必须把最终中文报告写入 `automations/review/comment-fix/result/YYYY-MM-DD/` 日期目录：

- 如果目录不存在，先创建目录。
- 结果文件必须是 Markdown 文件，扩展名为 `.md`。
- 文件名必须包含北京时间执行时分、PR 编号和本次结果，格式为：
  `HH-mm_PR#<PR_NUMBER>_<result>_RESULT.md`
- 时间使用 UTC+8（Asia/Shanghai）执行完成时间，不使用 UTC 时间。
- `<result>` 使用以下值之一：
  - `fixed`：完成至少一个代码修复并成功提交。
  - `no-actionable-comments`：没有可验证、可修复的 review agent 评论。
  - `skipped`：PR 上下文不完整、评论作者不满足条件或超出边界。
  - `blocked`：因为工作树、权限、检出、推送或验证问题无法安全继续。
- 如果 PR number 无法识别，文件名中的 PR 编号使用 `PR#unknown`。
- 写入内容必须与最终输出给用户的报告一致。
- 报告中不得包含本机绝对路径、token、secret 或完整环境变量。

## 输出格式

最终输出必须包含：

1. 触发信息
   - Repository
   - PR number
   - Comment author
   - Source URL
   - Delivery/run ID

2. 评论筛选
   - 允许的 review agent 用户
   - 收集到的评论数量
   - 进入修复计划的评论数量
   - 跳过评论及原因

3. 修复摘要
   - 每条修复对应 comment URL
   - 修改文件列表
   - 关键行为变化

4. 验证
   - 命令
   - 结果
   - 失败是否与本次改动相关

5. Git 结果
   - 分支
   - 提交 hash
   - 推送目标
   - PR URL（如果创建了独立修复 PR）

6. 结果文件
   - 本次 Markdown 结果文件路径

7. 剩余风险
   - 未处理评论
   - 需要人工确认的点
   - 后续建议

## 跳过时也要输出

以下场景必须明确输出跳过原因，不要静默成功：

- PR number 无法识别。
- Comment author 不在允许列表。
- 没有可验证的 review agent 评论。
- 工作树有用户未提交改动。
- 无法安全检出或推送 PR head branch。
- 评论要求超出本 automation 边界。
- 相关验证无法运行且没有可靠替代验证。
