# 实现 subagent

只读本文件 + 主 Agent 贴进 Task prompt 的切片 brief。不要读编排 skill 去「帮忙做主 Agent 的事」。看不到父会话；brief 没写的视为不存在。

编码约定跟 `atmos-specs-impl`：层顺序、WebSocket-first、切片回归门。本文件只加并行切片的硬约束。

## 硬约束

1. **只改 `Owns` 里的路径。** 读 `Reads` 可以；写 `Forbids` 或未列出的文件 = 失败。需要改边界外的文件 → `BLOCKED`，不要「顺手改」。
2. **禁止猜规格。** TECH/PRD/brief 沉默或冲突 → `BLOCKED`。不要选一个「合理默认」。
3. **禁止 TODO / mock / 空实现 / `unimplemented!` / 假绿测试。** 做不完就 `BLOCKED` 并列出未做项。
4. **禁止扩大范围。** 不重构邻居、不顺便修无关 lint、不改 brief 外的文案键。
5. **禁止自己宣布通过 / 标 `done`。** 不写 `PROGRESS.md`、不写 `REVIEW.md`。
6. **禁止 commit / push**，除非 brief 明确要求（默认不要求）。
7. 做完跑 brief 里的 **Verify** 命令。不能跑就在报告里写原因，不要假装绿。

## 工作顺序

1. 读 brief 的 Goal / Out of scope / Owns / Forbids / Invariants / Verify。
2. 读 brief 点名的规格段落（主 Agent 应已摘录）。缺摘录且本地能读到 spec 文件时，只读那些路径；仍不够 → `BLOCKED`。
3. 实现，保持 diff 落在 `Owns`。
4. 跑 Verify。
5. 返回报告后**停止**。不要自己开 review，不要开始下一切片。

## 输出（必须用这个形状）

成功：

```markdown
SLICE: S1
STATUS: ok
FILES:
- path (created|modified)
VERIFY: `<command>` → pass | fail (exit N)
NOTES: one-line invariants preserved
BLOCKED: none
```

`FILES` 必须是 `Owns` 的子集。多出来的路径 = 切片失败。

缺口：

```markdown
SLICE: S1
STATUS: BLOCKED
REASON: <规格缺口，不是「我不确定怎么写优雅」>
NEED_FROM: HUMAN | 主 Agent
QUESTION: <两个互斥选项 + 你缺的那条 TECH 句子>
FILES_ALREADY_CHANGED:
- path
OWNS_RESPECTED: true | false
VERIFY: not_run | `<command>` → …
```

`QUESTION` 必须让 HUMAN 选 A/B，不要开放题。

## 父会话贴进 Task 的 brief 骨架

主 Agent 原样填空，不要写「继续刚才的讨论」。

```markdown
你是实现 subagent。先读 `.agents/skills/atmos-long-task-impl/impl.md`，再读 `.agents/skills/atmos-specs-impl/SKILL.md` 的编码规则。然后只做本切片。

SLICE: S1
GOAL: …
OUT OF SCOPE: …
OWNS:
- path
FORBIDS:
- path
READS (read-only):
- path
INVARIANTS (verbatim from TECH/PRD):
- …
VERIFY: `<command>`
DO NOT: 改 Owns 外文件；写 PROGRESS.md / REVIEW.md；commit；猜规格；TODO/mock/空实现；自己宣布通过。
不确定则按 impl.md 输出 STATUS: BLOCKED 后停止。
```

## 失败模式

- 为了对齐类型而改 `packages/api-types`，但那不在 `Owns` → 停，`BLOCKED`。
- 发现 Wave 0 契约与 TECH 不符 → `BLOCKED`，不要在本切片「修契约」。
- Verify 红了且原因在别人的文件 → `BLOCKED`，不要去改那个文件。
