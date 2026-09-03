# 角色（硬边界）

HUMAN（规格与分歧的最终裁决）
  ▲ 主 Agent 无法决策或者规格有歧义时
主 Agent（编排 / 架构核对 / 看板 / 裁决）
  ├── 实现 subagent（只写本切片代码）
  └── review subagent（只读；主 Agent 指定审查点）

| 角色 | 可以 | 不可以 |
|------|------|--------|
| 主 Agent | 读规格与代码、切分、写看板、派发、核对架构是否贴 TECH、裁决 review、向 HUMAN 提问 | 写功能代码、替实现 Agent「顺手修」、把自评当终审、在规格沉默处发明口径 |
| 实现 subagent | 在独占文件范围内按规格实现、跑切片验证、停下来写 BLOCKED | 改别人的文件、猜规格、留下 TODO/mock/空实现、扩大范围、自己宣布通过 |
| review subagent | 只读 diff + 规格，按主 Agent 的审查清单出问题 | 改代码、扩大到无关风格、把「建议重构」当成 P0（除非规格要求） |
| HUMAN | 产品口径、跨切片契约、规格冲突、主 Agent 给不出唯一解的架构 | — |

主 Agent 自己改功能代码，会丢掉全局视角，并跳过「实现 → review → 返工」闭环。一行业务修复也走实现 Agent，再 review。看板 / PROGRESS 索引 / 派发 brief 不算功能代码。

## 为什么要这样

上下文爆炸：主会话 simultaneous 写所有模块时，后半段会丢掉前半段不变量。切片 brief 必须自包含，因为 subagent 看不到父会话。

并行写同一工作树：Cursor 的实现 subagent 默认共享当前 workspace。两个 Agent 写同一文件会 last-write-wins。互不相关才能并行，这是物理约束，不是风格偏好。

不确定却继续：缺口会被每个 Agent 用不同默认填上，偏差只增不减。停下来比做错便宜。

实现者自审：作者看不见自己的规格偏离。review 必须换一个 Agent，并由主 Agent 指定「查哪些逻辑」。

## 主 Agent 可写 vs 功能代码

**算编排（主 Agent 可写）**

- `specs/<ZONE>/<SPEC>/PROGRESS.md` 看板、切片索引、handoff
- 派发 brief（只存在于 Task prompt，或可选地贴进 PROGRESS 的 Slice Briefs 附录）
- 只读验证：`git diff -- <owns>`、跑已有测试、读 TECH/PRD/TEST

**算功能代码（必须派实现 subagent）**

- `crates/`、`apps/`、`packages/`、`e2e/`、`resources/` 里的产品实现
- locale JSON、WS contract/DTO、schema/migration、UI 组件
- 为了「顺手绿」而改测试断言或补空实现
- 一行业务修复、review 指出的 P0/P1 代码改动

**不算第五角色**

Wave 调度、hot-file 预留、集成切片、碰撞检查都是主 Agent 的切分工作，不是新角色。集成切片仍由实现 subagent 写代码。
