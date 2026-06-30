# Atmos main 每日代码质量评分（2026-06-30）

## 1. 审查范围

- 时间窗口：2026-06-29 00:00:00 到 2026-06-29 23:59:59（UTC+8 / Asia/Shanghai）。
- 同步状态：已同步 `origin/main`，本地 `main` 快进到 `5cceed269` 后筛选提交。
- 排除提交：`8fa2cf3b docs: add code quality review result 2026-06-29 score 84`，只归档 automation 结果。
- 被审查业务/代码提交：`f3a3c1769`、`9d735deb5`、`ae7567a70`、`22a96fc0b`、`5529b6f75`、`51639371c`、`9834d5cca`、`6544ca318`、`a3d4a234c`、`e666885e5`、`fcd65f880`、`5affd74ec`、`60171d5e5`、`8bd7c68eb`、`321ad3483`、`e2e208249`、`934529a21`、`102eb961e`、`4bc90f5ff`、`cff928d98`、`7cf44cab0`、`4d790a443`、`1e8b68e19`、`241850fbe`。同时查看了无独立业务 diff 的合并提交 `119c4580e`、`60c13655f`、`aab4b5fcf`、`ba444eac4`、`cbfd5b20e`、`5cceed269`。

## 2. 一份好代码应该是什么样

本次按“职责边界清楚、分层方向正确、抽象不过度也不欠缺、控制流可追踪、重复规则收敛、文件体量与职责匹配、工程痕迹干净”的标准评分。复杂功能可以有复杂度，但复杂度要被放在正确模块里，后续维护者能快速定位修改点。

## 3. 评分方法

100 分制：设计与分层 30，可读性与复杂度 25，体量与内聚 20，可维护性与复用 15，工程卫生 10。高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分。体量阈值只作为信号，只有“变大且职责更混杂”才扣分。

## 4. 总分

总分：88/100。总体判断：良好。后端 git/diff 分层和 E2E 脚本治理有明显改善，但 scoped changes UI 把新状态编排继续堆进已有大 shell 组件，低于 90，已触发自动修复。

## 5. 分项评分

- 设计与分层：26/30。`321ad3483` 将 changes scope 菜单、commit scope 状态、commit log 拉取和 diff 刷新分支放进 `apps/web/src/app-shell/RightSidebar.tsx`，全局 shell 组件承担 feature orchestration。
- 可读性与复杂度：22/25。`RightSidebar.tsx` 新增的 scope 状态机和 `ChangeSection.tsx` 多处 action 按钮事件处理重复，阅读路径偏长。
- 体量与内聚：17/20。`RightSidebar.tsx` 达到 1032 行，`ChangeSection.tsx` 达到 725 行，本次改动继续放大两个已偏大的 UI 文件。
- 可维护性与复用：14/15。Git rename/commit diff 规则有测试支撑；扣分点主要是 list/tree/bulk action 按钮壳重复。
- 工程卫生：9/10。无明显调试残留；E2E CI 多次修正后最终脚本化收口，但当天提交序列暴露出 CI 启动参数调试痕迹较多。

## 6. 主要问题清单

中严重度：`321ad3483`，`apps/web/src/app-shell/RightSidebar.tsx` 原约 103-260、410-526 行。问题是 scoped changes 的菜单渲染、状态 key、commit log、scope 切换和刷新分发都进入全局右侧栏组件。它让 shell 组件同时负责全局 tab chrome、PR/actions/wiki/file tree，以及 diff scope 业务编排。优化建议：将 scope 菜单抽成 `ChangesScopeMenu`，将 scope 状态和刷新分发抽成 `useRightSidebarChangesScope`，`RightSidebar` 只消费视图模型和渲染 tab。

中严重度：`321ad3483` / `934529a21`，`apps/web/src/app-shell/sidebar/ChangeSection.tsx` 原约 472-589、625-690 行。问题是 file row、tree file、tree directory、bulk section 四处重复按钮事件壳与 stop propagation 细节，后续改 stage/unstage/discard 交互时容易漏改某一路径。优化建议：先收敛成共享的本地 `ChangeIconActionButton`；如果后续还继续增长，再把 action model 抽成 `buildChangeActions(kind, target)` 一类纯函数。

## 7. 正向观察

- `f3a3c1769` 把 E2E workflow 中的大段 inline Node 脚本迁到 `e2e/scripts/`，比前一天的 workflow 内嵌脚本质量明显更好。
- `7cf44cab0`、`4d790a443`、`1e8b68e19`、`241850fbe` 将 rename diff、commit patch、shallow fetch、remote branch 校验放在 `core-engine`，API 只做 WS DTO 分发，分层方向正确。
- `crates/core-engine/src/git/tests.rs` 覆盖 rename numstat、literal arrow path、merge commit first-parent patch、shallow fetch 和 branch validation，测试目标和技术风险对应较好。
- 前一天指出的 `AgentChatPanel` 与 `TerminalAgentInputOverlay` 体量问题在 `f3a3c1769`、`60171d5e5`、`8bd7c68eb` 中有实际拆分改善。

## 8. Review 建议

人工 review 最值得盯三点：`useRightSidebarChangesScope` 是否保持 branch/staged/unstaged/commit 四种 scope 的刷新语义；`ChangesScopeMenu` 键盘/菜单事件是否仍阻止外层 tab 误触发；`ChangeSection` 的共享按钮是否保持原有 stage/unstage/discard 行为。

## 9. 自动修复与 PR

- 触发原因：总分 88，低于 90。
- 修复分支：`codex/quality-fix/2026-06-29`。
- 修复提交：`7da007c67 refactor: improve daily quality findings`。
- PR：https://github.com/AruNi-01/atmos/pull/144。
- 标签：已添加 `codex`；仓库未发现 `codex-automation` 标签，已按规则跳过。
- 修复摘要：抽出 `apps/web/src/app-shell/sidebar/ChangesScopeMenu.tsx`；新增 `apps/web/src/app-shell/sidebar/useRightSidebarChangesScope.ts`；`RightSidebar.tsx` 从 1032 行降到 782 行；`ChangeSection.tsx` 用 `ChangeIconActionButton` 收敛重复按钮事件壳。
- 验证通过：`bun --filter web typecheck`；`bun --filter web lint -- src/app-shell/RightSidebar.tsx src/app-shell/sidebar/ChangeSection.tsx src/app-shell/sidebar/ChangesScopeMenu.tsx src/app-shell/sidebar/useRightSidebarChangesScope.ts`；`git diff --check`。

## 10. 结果文件

`automations/review/quality/result/2026-06/06-30_score-88_RESULT.md`

## 11. 结果提交与推送

结果文件将随 PR 分支推送到 `origin/codex/quality-fix/2026-06-29`。结果文件提交 hash 将在提交后由最终回复补充；PR 已创建，用户主要通过 https://github.com/AruNi-01/atmos/pull/144 审查修复与报告。
