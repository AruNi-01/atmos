# Issue Scope

用于 `automations/issue/implementation/INSTRUCTION.md` 的 issue 范围判断阶段。

## 可直接实现的条件

只有同时满足以下条件，才进入实现流程：

- issue 当前处于 open 状态。
- 本次触发是 `atmos-judge-approve` label，且 issue 当前仍包含 `atmos-judge-approve`。
- issue 描述的问题、期望行为和验收方式足够明确。
- 实现范围能在一个聚焦 PR 内完成。
- 没有关联 open PR 已经覆盖该需求。
- 不需要新增产品决策、设计稿、迁移策略或跨团队确认。

## 需要跳过或阻塞的场景

以下情况不改代码，只输出原因：

- issue 是问题讨论、想法收集、roadmap 占位或需求尚未定稿。
- issue 没有 `atmos-judge-approve`，或同时带有 `atmos-judge-needs-human-review` / `atmos-judge-reject`。
- issue 缺少复现步骤、期望行为、目标范围或成功标准。
- issue 标记了 `wontfix`、`duplicate`、`needs-design`、`blocked`、`question` 或同等语义标签。
- issue 涉及账号、安全、计费、隐私、数据删除等高风险操作，但没有明确验收和人工确认。
- issue 需要大范围架构设计、数据库迁移、协议升级或新平台支持，且没有对应 spec。
- issue 已经有关联 PR 正在处理，或最近提交明显已经实现。

## 范围收敛

进入实现前，必须写出一个简短实现计划：

- 要解决的用户可见问题或开发者问题。
- 明确的验收标准。
- 预计修改的模块或文件区域。
- 需要运行的验证命令。

如果 issue 包含多个独立需求，只实现最核心且明确的一项；其余部分写入剩余风险或后续建议。

如果 issue 引用了 `specs/<ZONE>/<ZONE>-NNN_.../`，按 spec workflow 读取对应 `BRAINSTORM.md`、`PRD.md`、`TECH.md`、`TEST.md` 后再实现。不要让 issue 文本覆盖已经稳定的 spec 要求。
