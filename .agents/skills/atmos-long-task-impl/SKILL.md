---
name: atmos-long-task-impl
description: Orchestrate complex multi-file Atmos implementation as the parent 主 Agent — slice TECH into file-disjoint waves, write a PROGRESS.md kanban, dispatch impl and read-only review subagents, escalate spec gaps to HUMAN, and never write feature code in the parent session. Use when the user asks for 并行实现, 长任务, long-task, 看板, 切分, dispatch subagents, split a large APP-NNN spec across agents, or when a single atmos-specs-impl session would overflow context or collide on the same files.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-068` or `APP-068_agent_chat_arch_optimize`. Required for spec-backed work.
    required: true
  - name: wave
    description: Optional wave id to run next (e.g. `0`, `1`). If omitted, run the next incomplete wave on the kanban.
    required: false
---

# Atmos Long-Task Implementation

父会话 = **主 Agent**。功能代码只由 **实现 subagent** 写；**review subagent** 只读；规格歧义只问 **HUMAN**。硬边界见 [roles.md](roles.md)。

本 skill **替换的是父会话写代码**，不替换 `atmos-specs-impl` 的编码规则。每个实现 subagent 仍遵守那份 skill（层顺序、WebSocket-first、回归门）。

## When to use

用这个 skill，若 **任一** 成立：

- 用户要并行 / 切分 / 看板 / 派发 subagent / 长任务实现
- 一个 TECH phase 跨多个 crate 或 app，单会话后半会丢掉前半不变量
- 两条工作流若同时开工会写同一文件

## When not to use

- 小改动能在一次 `atmos-specs-impl` 会话里写完并回归
- PRD/TECH/TEST 仍是模板或主 Agent 对 TECH 对不上唯一架构（先停，问 HUMAN，或退回 `atmos-specs-tech`）
- 用户只要你在父会话里改几个文件

场景测试仍归 `atmos-specs-test-run`。全量规格审查归 `atmos-specs-review`。本 skill 的 review subagent 是**切片级、清单驱动**的关卡，不是那两个 skill 的替代。

## 架构（相对「全员并行写」的最优切法）

四角色够了，不要再加 planner / integrator / tester。

```
HUMAN  ←—— 唯一产品/契约/歧义裁决
  ▲
主 Agent  切分波次 · 碰撞检查 · 写看板 · 派发 · 架构核对 · 裁决 review
  ├── Wave 0 串行实现 subagent：磁盘上的编译契约
  ├── Wave N 并行实现 subagent：Owns 互斥 且 契约已存在
  ├── 每切片 review subagent：只读，清单由主 Agent 指定
  └── 末波串行实现 subagent：hot files + 胶水
```

调度约束（不是口味）：

1. Cursor 实现 subagent **共享当前 workspace**。默认不要用隔离 worktree（合并冲突会变成新的规格发明场）。
2. 可并行 iff `Owns` 交集为空 **且** import 的类型/WS 已在前一波落地。按文件夹拆不够。
3. 同一波实现默认最多 3 路。Review 只读，可在实现返回后立刻对已完成切片流水线式派发。
4. 看板单写者 = 主 Agent。实现/review 都不写 `PROGRESS.md`。

看板与碰撞规则：[kanban.md](kanban.md)。切分对照：[examples.md](examples.md)。

## 主 Agent 循环

复制并勾进度：

```
- [ ] 0. 读 PRD / TECH / TEST（及已有 PROGRESS）；TECH 对不上就停
- [ ] 1. 架构核对：层、WS-first、模块边界有唯一解？
- [ ] 2. 切波次 + Owns；碰撞检查；hot files 预留到串行波
- [ ] 3. 写/更新 PROGRESS.md 看板（主 Agent 唯一写入）
- [ ] 4. 缺口 → HUMAN（A/B）；在回复前不要派相关切片
- [ ] 5. 派本波实现 subagent（一消息多 Task；brief 自包含）
- [ ] 6. 收回报告；越界或 BLOCKED → 停相关波，不要自己改代码
- [ ] 7. 派 review（换一个 Agent；清单是具体逻辑）
- [ ] 8. 裁决：pass → 可 done；fail → 同一 Owns 返工实现 + 再 review
- [ ] 9. 再核对 TECH；下一波；末波胶水仍走实现 Agent
- [ ] 10. 全部 done → 交给 atmos-specs-test-run（用户要停则交手并说明）
```

### 0–1 读规格与架构核对

读：`PRD.md`、`TECH.md`、`TEST.md`、已有 `PROGRESS.md`、将触及区域的 `AGENTS.md`。

父会话里确认：

- 每个切片能从 TECH 得到唯一模块边界，而不是「两种都能讲通」
- 新 API 是 WS（或 TECH 已写明 REST 例外）
- 层顺序：infra → core-engine → core-service → api → apps；并行不得打破**编译**顺序（契约未落地就并行 UI/API = 非法）

主 Agent 在此步 **只读、只切、只问**。发现要改产品代码 → 那是切片，不是现在。

### 2–3 切分并写看板

每张切片卡必须有：Goal、Out of scope、Owns、Forbids、Depends、从 TECH **摘抄**的不变量、一条 Verify 命令、**主 Agent 写好的** review 清单。

把表写进 spec 的 `PROGRESS.md`。模板：[kanban.md](kanban.md)。

### 4 向 HUMAN 提问

规格沉默、跨切片契约冲突、或架构没有唯一 TECH 解时：**停派发**，问 HUMAN。不要在沉默处发明口径。

```markdown
HUMAN 裁决需要
切片: S1, S2
冲突: <一句话>
选项:
A. …
B. …
推荐: A，因为 <已写在 TECH 的依据，或「TECH 未写，这是偏好」>
在你回复前：S1/S2 保持 blocked，不派发。
```

### 5 派发实现

对每个就绪切片开 `generalPurpose` Task。Prompt 必须自包含（subagent **没有**父会话）：

1. 「先读 `.agents/skills/atmos-long-task-impl/impl.md`」
2. 完整切片卡（Owns 写绝对或仓库根相对路径）
3. 规格摘录原文，不要「按 TECH 第二节」
4. 允许只读的邻居路径
5. Verify 命令
6. 「不要改 Owns 之外的文件；不要写 PROGRESS.md；不要 commit」

同一波的多个实现：**一条父消息里多个 Task**。先做完碰撞检查。

### 6–8 收回、审查、裁决

实现返回后：

- `FILES` 必须 ⊆ `Owns`。越界 = 失败。不要在父会话里把越界 diff 「修回去」当功能补丁；派 **cleanup 实现切片**（Owns = 那些被污染的文件）或请 HUMAN 允许 `git checkout -- <path>` 丢弃。
- `BLOCKED` → 看板标 blocked，带 QUESTION 问 HUMAN。
- `ok` → 立刻可派 **另一个** review Agent。Prompt 读 [review.md](review.md)，附上 `git diff` 范围 = Owns、规格摘录、**本切片审查清单**。

主 Agent 裁决 review：

| Review | 主 Agent |
|--------|----------|
| pass，无 P0/P1 | 标 `done`（若架构核对仍贴 TECH） |
| fail | 同一 Owns 派返工实现，brief = `REWORK` 列表；再 review |
| 把重构当 P0 | 降级或忽略；不要扩大切片 |
| 与 TECH 冲突 | 问 HUMAN；不要改 PRD 去迎合代码 |

一行业务修复也走实现 → review。主 Agent 把自评当终审 = 违规。

### 9–10 下一波与交手

Wave 完成后做一次只读架构核对（层、重复 DTO、契约漂移）。末波胶水 / i18n / barrel 仍是实现切片。

全部切片 `done` 后交 `atmos-specs-test-run`。父会话交付：看板状态、切片列表、未决 HUMAN 问题、test-run 要接的 TEST.md 场景。不要宣称 spec 已完整验证。

## Subagent 选型

| 工作 | `subagent_type` | 写磁盘 |
|------|-----------------|--------|
| 实现 / 返工 / cleanup | `generalPurpose` | 仅 Owns |
| 切片 review | `generalPurpose` | 否 |
| 主 Agent 自己找路径 | 父会话 Grep/Read，或 `explore` | 否 |

不要用 `best-of-n-runner` 当默认并行实现（隔离 worktree + merge 会绕过文件互斥）。不要用 `bugbot` / `security-review` 替代清单驱动的切片 review。

## 主 Agent 禁令（重复一次是因为这条最常被破）

- 不写功能代码，包括「就一行」「测试在红我帮你改」
- 不把实现 Agent 的 STATUS: ok 当成终审
- 不在规格沉默处选默认好让波次继续
- 不派 Owns 相交的并行实现
- 不给「继续我们刚才的方案」这种非自包含 brief

## Done

- 计划中的切片均为 `done`，或 `blocked` 已交给 HUMAN 且未假装完成
- 无未审查的实现 diff
- `PROGRESS.md` 看板是当前事实
- TECH 仍是实现的源；漂移已升级而不是默默改代码
- 已交出 test-run，或用户明确只要生产代码

## Additional resources

- 硬边界：[roles.md](roles.md)
- 看板 / 波次 / hot files：[kanban.md](kanban.md)
- 实现 subagent：[impl.md](impl.md)
- Review subagent：[review.md](review.md)
- 切分对照：[examples.md](examples.md)
- 切片内编码：[../atmos-specs-impl/SKILL.md](../atmos-specs-impl/SKILL.md)
- `PROGRESS.md` 骨架：`specs/references/progress-template.md`
