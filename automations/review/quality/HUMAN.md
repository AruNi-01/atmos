# 每日代码质量评分配置

这个文件给人类操作者看，用来配置 Atmos App。Agent 运行指令在 `INSTRUCTION.md`。

## Atmos App 配置

新建 Automation，按下面配置：

- Trigger：Schedule
- Schedule：每天运行一次
- Timezone：Asia/Shanghai
- 建议时间：每天早上 08:00 之后，确保前一天 UTC+8 自然日已经结束
- Run environment：这个仓库对应的 Project 或稳定 Workspace

## Prompt 内容

在 Automation / scheduled runner 的 Prompt / Instructions 输入框中填入：

```text
请先读取并严格遵守 `automations/review/quality/INSTRUCTION.md`。

这是 Atmos main 分支每日代码质量评分任务。只审查 UTC+8 昨日自然日内 main 分支产生的业务/代码提交；排除 automation 结果归档提交。

按照 `INSTRUCTION.md` 的按需加载规则读取对应 `references/` 文件。完成后按结果规则写入本次报告，并按规则提交和推送结果文件。如果总分低于 90，按规则自动修复并创建 PR。
```

说明：分支前缀、PR label、PR body 末尾署名由执行 Agent **自行识别身份后填写**（见 `references/auto-fix-pr.md`），仓库侧不绑定某一厂商。

## 结果位置

结果报告会写入：

```text
automations/review/quality/result/YYYY-MM/MM-DD_score-<score>_RESULT.md
```

如果昨日 main 无业务/代码提交，`<score>` 使用 `no-commits`。
