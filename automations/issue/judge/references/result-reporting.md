# Result Reporting

用于 `automations/issue/judge/INSTRUCTION.md` 的最终报告和结果落盘阶段。

## 结果落盘

每次执行结束后，不管是否完成打标，都必须把最终中文报告写入 `automations/issue/judge/result/YYYY-MM-DD/` 日期目录：

- 如果目录不存在，先创建目录。
- 结果文件必须是 Markdown 文件，扩展名为 `.md`。
- 文件名必须包含北京时间执行时分、issue 编号和本次结果，格式为：
  `HH-mm_issue#<ISSUE_NUMBER>_<result>_RESULT.md`
- 时间使用 UTC+8（Asia/Shanghai）执行完成时间，不使用 UTC 时间。
- `<result>` 使用以下值之一：
  - `approved`：判定通过并成功打 `atmos-judge-approve`。
  - `needs-human-review`：判定需要人工 review 并成功打 `atmos-judge-needs-human-review`。
  - `rejected`：判定拒绝，成功打 `atmos-judge-reject` 并关闭 issue。
  - `skipped`：触发对象不是普通 opened issue、issue 已有 judge 结果标签或不满足执行边界。
  - `blocked`：上下文、权限、打标、评论或关闭失败，无法安全完成。
- 如果 issue number 无法识别，文件名中的 issue 编号使用 `issue#unknown`。
- 写入内容必须与最终输出给用户的报告一致。
- 报告中不得包含本机绝对路径、token、secret、完整环境变量、完整 webhook payload 或不必要的 issue 全文。

## 输出格式

最终输出必须包含：

1. 触发信息
   - Repository
   - Issue number
   - Issue action
   - Trigger sender
   - Source URL
   - Delivery/run ID

2. Issue 摘要
   - Issue title
   - 当前 state 和 labels
   - 是否普通 issue
   - 是否已有 judge 结果标签

3. 判定结果
   - 结论：`approve` / `needs-human-review` / `reject`
   - 主要证据
   - 需要人工确认的问题（如有）
   - 重复或关联 issue/PR（如有）

4. GitHub 操作
   - 添加/移除的 labels
   - Issue 评论 URL（如果发布了评论）
   - 是否关闭 issue
   - 失败命令或失败原因（如有）

5. 结果文件
   - 本次 Markdown 结果文件路径

6. 剩余风险
   - 可能误判的点
   - 后续建议

## 跳过时也要输出

以下场景必须明确输出跳过原因，不要静默成功：

- repository、issue number 或 source URL 无法识别。
- 触发对象是 PR 或 PR comment，不是普通 issue。
- issue action 不是 `opened`。
- issue 已有 judge 结果标签。
- 无法读取 issue 当前状态。
- 无法安全打标、评论或关闭。
