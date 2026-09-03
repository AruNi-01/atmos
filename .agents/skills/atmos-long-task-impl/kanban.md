# Slice kanban (`PROGRESS.md`)

主 Agent 是看板的**唯一写者**。实现 / review subagent 不改 `PROGRESS.md`。

若 spec 还没有 `PROGRESS.md`，从 `specs/references/progress-template.md` 创建，再追加下面两节。不要把切片表写进 PRD/TECH/TEST。

## Slice Kanban

```markdown
## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `packages/api-types/src/ws/dto/foo.ts` | hot files except owns | — | done | ok | pass | `bun run typecheck` |
| S1 | 1 | `crates/agent/src/foo/**` | `apps/web/**` | S0 | in_review | ok | — | `cargo test -p atmos-agent foo` |
| S2 | 1 | `apps/web/src/features/foo/**` | `packages/api-types/**` | S0 | in_progress | running | — | `bun test apps/web/src/features/foo` |
| S3 | 2 | `apps/web/messages/*.json` | — | S1,S2 | planned | — | — | locale key grep |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

**Impl**: `—` · `running` · `ok` · `blocked`
**Review**: `—` · `running` · `pass` · `fail`
```

状态机：`planned → ready → in_progress → in_review → done`，失败走 `rework → in_progress`，缺口走 `blocked` 并停派发。

只有 HUMAN 或主 Agent 在 review **pass** 且架构核对通过后，才把切片标 `done`。实现 Agent 不得自己宣布通过。

## Slice cards（主 Agent 内部清单）

每个切片在派发前必须填完。可附在 `PROGRESS.md` 的 `## Slice Cards`，避免 brief 只活在聊天里。

```markdown
### S1 — <short title>

- **Wave**: 1
- **Goal**: …
- **Out of scope**: …
- **Owns**: explicit file paths or tight globs (not a whole app)
- **Forbids**: overlapping areas + hot files not in Owns
- **Reads (read-only)**: neighboring files allowed to read, not edit
- **Depends**: S0 (contract already on disk)
- **Invariants** (copied from TECH, not "see TECH"): …
- **Verify**: one command
- **Review checklist** (主 Agent 指定，至少 3 条具体逻辑): …
- **HUMAN open questions**: none | blocked until …
```

## Hot files

默认**不能**放进同一并行波的两张 `Owns`。指派给 Wave 0、最后的集成切片、或唯一的一个切片。

| Kind | Typical paths |
|------|----------------|
| i18n | `apps/web/messages/en.json`, `apps/web/messages/zh.json` |
| WS wire | `packages/api-types/src/ws/actions.ts`, `contract/**`, `dto/**` |
| Barrels | `index.ts` / `mod.rs` that re-export many modules |
| Shared stores | `use-*-store.ts` 被多个 feature 写入时 |
| Spec board | `PROGRESS.md` — 主 Agent only |
| Agent guides | `**/AGENTS.md` |

同波次碰撞检查（派发前必做）：

1. 对将并行的切片，求 `Owns` 路径集合交集。
2. 交集非空 → 禁止并行：合并切片，或把共享文件抽到更早的串行波。
3. Glob 重叠（`features/foo/**` vs `features/foo/lib/x.ts`）视为碰撞。
4. 两个切片都「可以新建同一路径」也是碰撞。

## Wave 规则

- **Wave 0（串行）**：编译契约。WS DTO、Rust 类型、共享 enum、双方都要 import 的模块。契约还在 TECH 纸面上、不在磁盘上时，禁止并行 UI 与 API。
- **Wave N（并行）**：`Owns` 互斥 **且** 依赖的契约已在前波落地。
- **最后一波（串行）**：hot files、胶水、跨切片接线。仍派实现 subagent，不由主 Agent 手写。

默认同一波最多 **3** 个实现 subagent。只有 `Owns` 明显互斥、brief 已自包含、且 HUMAN 未反对时才加到 4。
