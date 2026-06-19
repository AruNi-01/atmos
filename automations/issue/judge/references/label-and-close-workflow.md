# Label And Close Workflow

用于 `automations/issue/judge/INSTRUCTION.md` 的 GitHub 打标、评论和关闭阶段。只有得出判定结论后读取并执行。

## 标签映射

- `approve` -> `atmos-judge-approve`
- `needs-human-review` -> `atmos-judge-needs-human-review`
- `reject` -> `atmos-judge-reject`

三个 judge 标签互斥。设置目标标签前，必须先移除其他两个 judge 标签，并确认它们已经不在 issue 当前 labels 中。只要任一冲突 judge 标签无法移除或仍然存在，就停止并写 `blocked`；不要继续添加目标标签，也不要把判定伪装成已完成。

## 标签准备

如果目标标签不存在，可以尝试创建：

- `atmos-judge-approve`：绿色，描述 `Issue judged valid for automated implementation`
- `atmos-judge-needs-human-review`：黄色，描述 `Issue needs maintainer review before implementation`
- `atmos-judge-reject`：灰色，描述 `Issue rejected by automated issue judge`

如果没有创建或修改标签的权限，停止并写 `blocked`；不要静默成功。

## 打标命令建议

使用 `gh` CLI 或 GitHub API。`gh` CLI 示例：

```bash
gh issue edit <ISSUE_NUMBER> --repo <OWNER/REPO> --add-label atmos-judge-approve
gh issue edit <ISSUE_NUMBER> --repo <OWNER/REPO> --remove-label atmos-judge-reject
```

不要把 issue 标题、正文或评论内容拼接进 shell 命令。

运行环境必须已经完成 `gh auth`，并且当前身份对目标仓库有 issue 写权限。权限不足时输出 `blocked`，不要把判定伪装成已完成。

## Issue 评论

打标成功后，在 issue 下发布一条简短中文评论：

- 判定结果
- 主要理由
- 下游动作

评论建议：

- `approve`：说明已打 `atmos-judge-approve`，后续会触发自动实现。
- `needs-human-review`：说明已打 `atmos-judge-needs-human-review`，列出需要维护者确认的问题。
- `reject`：说明已打 `atmos-judge-reject`，并将在打标后关闭 issue。

不要发布长篇日志，不要贴完整 issue 内容，不要包含本机路径或敏感信息。

## Reject 关闭规则

如果结论为 `reject`：

1. 先添加 `atmos-judge-reject` 标签。
2. 发布简短评论。
3. 关闭 issue。

如果打标成功但关闭失败，结果为 `blocked`，报告中写明 issue 已打标但未关闭，以及可手动重试命令。

如果关闭成功，不要删除 `atmos-judge-reject` 标签。
