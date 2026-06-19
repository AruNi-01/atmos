# Scope And Commit Selection

用于 `automations/review/quality/INSTRUCTION.md` 的提交范围筛选阶段。

## 时间窗口

- 只审查 `main` 分支前一天产生的所有提交。
- 时间范围以 UTC+8（Asia/Shanghai）自然日为准，即昨天 `00:00:00` 到 `23:59:59`。
- 先确认并同步 `main` 的最新状态，再基于该时间窗口内 `main` 分支上的提交做审查。

## 排除规则

审查提交列表时，忽略 automation 自己生成的结果文件提交，例如：

- 只改动 `automations/review/quality/result/` 月份目录下结果文件的提交。
- 历史上只改动 `automations/code/result/` 的提交。
- 提交信息形如 `docs: add code quality review result ...` 的提交。

这类提交只用于结果归档，不参与当天代码质量评分。

如果一个提交同时包含结果文件和真实代码变更，则不能排除；只按真实代码变更部分进行质量审查。

## 无提交场景

如果昨天没有业务/代码提交：

- 明确写出“昨日 main 无新增提交”。
- 不要修复。
- 不要创建 PR。
- 仍必须按 `references/report-and-result.md` 写入并推送结果文件。
