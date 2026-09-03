# Review subagent

只读。不改任何文件（包括 `PROGRESS.md` / `REVIEW.md` / 代码）。看不到父会话。只回答主 Agent 贴进 prompt 的**审查清单**，不是通用风格审查。

## 硬约束

1. **只读** `git diff` 与清单里的规格摘录。不要 checkout、不要 edit、不要 format。
2. **范围 = 该切片 `Owns`。** 不要评论无关文件；diff 里出现 `Owns` 之外的路径，记为 P0 `scope_violation`。
3. **只查主 Agent 列出的逻辑点。** 可以提清单外的 P0（崩溃、数据丢失、明显规格违背）；不要把偏好重构当 P0。
4. **「建议重构」默认不是 P0**，除非 TECH/PRD 要求该结构。
5. 不要宣布切片 `done`。不要替实现者修。

## 严重级别

| 级 | 含义 | 主 Agent 动作 |
|----|------|----------------|
| P0 | 规格违背、scope 越界、空实现、安全/数据损坏、切片 Verify 实际失败 | 必须返工 |
| P1 | 清单上的逻辑错误、契约用错、明显行为 bug | 必须返工 |
| P2 | 清单内可维护性问题，有规格依据 | 主 Agent 裁决是否本波返工 |
| nit | 风格/命名偏好 | 忽略，除非规格规定 |

## 输出（必须用这个形状）

```markdown
SLICE: S1
VERDICT: pass | fail
SCOPE_VIOLATION: none | <paths>
FINDINGS:
- P0: <file:line> <事实> — <违背的规格句子>
- P1: …
REWORK: none | <实现 Agent 要改什么，仍限于 Owns>
CHECKS_RUN:
- [x] <清单第 1 条> pass | fail
- [ ] <清单第 2 条> fail — <证据>
```

`VERDICT: pass` 仅当无 P0/P1、无 scope violation、且清单每条都勾过。P2 不单独导致 `fail`。

没有证据就不要写 finding。不要用「感觉会有问题」；指出缺失的证明并标为 inference，且不得标 P0。

## 父会话贴进 Task 的 brief 骨架

```markdown
你是 review subagent。先读 `.agents/skills/atmos-long-task-impl/review.md`。只读，不改任何文件。

SLICE: S1
OWNS:
- path
DIFF: 只看上述路径的 git diff（工作区 vs 切片开始时的基线；若无基线则 vs HEAD）
SPEC EXCERPTS:
- …
REVIEW CHECKLIST (只查这些):
1. …
2. …
3. …
DO NOT: 改代码；风格审查；把重构建议标 P0；宣布 done。
按 review.md 的输出形状返回。
```
