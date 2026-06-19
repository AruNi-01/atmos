# Result Reporting

用于 `automations/issue/implementation/INSTRUCTION.md` 的最终报告和结果落盘阶段。

## 结果落盘

每次执行结束后，不管是否完成实现，都必须把最终中文报告写入 `automations/issue/implementation/result/YYYY-MM-DD/` 日期目录：

- 如果目录不存在，先创建目录。
- 结果文件必须是 Markdown 文件，扩展名为 `.md`。
- 文件名必须包含北京时间执行时分、issue 编号和本次结果，格式为：
  `HH-mm_issue#<ISSUE_NUMBER>_<result>_RESULT.md`
- 时间使用 UTC+8（Asia/Shanghai）执行完成时间，不使用 UTC 时间。
- `<result>` 使用以下值之一：
  - `implemented`：完成代码实现、成功提交，并至少推送分支；如果 PR 创建失败，仍必须在报告中说明。
  - `no-action`：issue 已经被现有代码或关联 PR 覆盖，无需新改动。
  - `skipped`：触发来源、issue 状态、labels 或安全边界不满足执行条件。
  - `blocked`：范围不清、需要产品确认、工作树/权限/检出/推送/验证问题导致无法安全继续。
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

2. Issue 判断
   - Issue title
   - 当前 state 和 labels
   - 是否普通 issue
   - 是否已有相关 PR
   - 是否可直接实现
   - 跳过或阻塞原因

3. 实现摘要
   - 修改文件列表
   - 关键行为变化
   - 未覆盖的 issue 子范围

4. 验证
   - 命令
   - 结果
   - 失败是否与本次改动相关

5. Git 和 PR 结果
   - 分支
   - 提交 hash
   - 推送目标
   - PR URL
   - Issue 评论 URL（如果发布了状态评论）

6. 结果文件
   - 本次 Markdown 结果文件路径

7. 剩余风险
   - 需要人工确认的点
   - 后续建议

## 跳过时也要输出

以下场景必须明确输出跳过原因，不要静默成功：

- repository、issue number 或 source URL 无法识别。
- trigger sender 不在可信列表。
- 触发对象是 PR 或 PR comment，不是普通 issue。
- issue 已关闭或带有阻塞/拒绝类标签。
- issue 缺少明确验收标准。
- 工作树有用户未提交改动。
- 无法安全检出、推送分支或创建 PR。
- 相关验证无法运行且没有可靠替代验证。
