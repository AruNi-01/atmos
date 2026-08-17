# Atmos main 每日代码质量评分（2026-08-16）

## 1. 审查范围

- 昨日时间窗口：2026-08-16 00:00:00 到 2026-08-16 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（窗口内 tip 约 `3e7b89525` docs(landing) changelog；后续日间 tip 已前进到 `fdac12e4f`）。
- 排除：无「仅 quality result 归档」提交；merge 提交本身不单独评分，按其中业务/代码提交审查。
- 审查方式：以 **Git Graph History（#242）**、**Launchpad / Automations / Skills / Workspace Script（#241）**、Changes 工具栏与 bulk confirm、Token Usage share 收口、desktop-use 退出清理为主线。
- 用户主工作区在无关 feature 分支且有未提交改动；修复在独立 worktree `grokbuild/quality-fix/2026-08-16`。

被审查提交（代表性，窗口内约 44 条非 merge 业务/代码提交）：

| Hash | Author | Message |
| --- | --- | --- |
| `750fab75b` | AruNi_Lu | fix(token-usage): fold publish into share popover (#240) |
| `3b1451c8f`…`e5c054814` | AarynLu | Launchpad UI / settings underlay / automations memory+filters / skills / workspace script / token-usage polish（#241 合入） |
| `f8389e229` | Cursor Agent | feat(git): open topological history graph in a center tab |
| `2f06e6a48` / `7c214ac9d` | Cursor Agent | history prefetch + @tanstack/react-virtual |
| `c18f78fbc` | AarynLu | feat(git): add resizable Graph History columns |
| `995ea6ac2`…`d5e72f9ca` | Cursor Agent | Changes toolbar scoped bulk actions + destructive confirm dialog |
| `1a5d5e115` | AarynLu | feat(web): add Changes list/tree view and tighten chrome |
| `d282d0081` | AarynLu | feat(ui): share overlay close chrome across drawers |
| `c5f80a48e` | AarynLu | fix(desktop-use): stop host on quit and hide vendor process name |
| `621110fc4` / `2ca6d303e` / `571eb9810` | Cursor Agent | desktop 2026.8.16 release + serve-sim packing fixes |
| `3e7b89525` | AarynLu | docs(landing): changelog for 2026.8.15 / 2026.8.16 |

日合计业务改动量大（git history 单功能约 40+ files；automations 单提交 +3.7k/−1.0k；launchpad 相关多提交叠加）。

## 2. 一份好代码应该是什么样

本日标准看「大功能是否沿既有分层落地，以及枢纽文件是否被继续放大」。Git History 应把 parse / layout / query / 虚拟列表 / 行渲染边界画清；Automations 应把 filter 纯逻辑、leave 守卫、表单 IO 分开；Launchpad 页应把 tabs/filter/push 细节交给子组件，而不是在一个 View 里重写 URL 拼装。新增体积可以大，但长度必须换来可定位的模块，而不是单文件堆叠。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；只计当日引入/放大问题。
- 体量阈值：单文件 500+ 中风险、800+ 高风险信号；单组件 250+ 中风险（与结构恶化同时出现才扣分）。

## 4. 总分

总分：**79/100**。总体判断：**良好**。

Git History 后端 parse + 前端纯 layout + infinite query + 虚拟化方向正确，且带测试与 MIT 归因；Automations 过滤器纯模块/测试也是加分。扣分集中在当日固化/放大的超大 UI 枢纽：`GitHistoryPanel`、`AutomationSetup`、`TokenUsageShareDialog`、`use-automation-page-state`。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25/30 | 正向：`history.rs` parse/refs；`git-history-graph.ts` / columns / search 纯模块；WS infinite query；filters 纯函数 + tests；workspace-script-dialog 纯 helper + DOM 测；desktop-use lifecycle/host-branding 抽出。扣分：`AutomationSetup` 仍是 composer + github + memory + dirty-leave 的总装车间（leave 守卫当日放大）；`use-automation-page-state` 继续做 URL+action 上帝 hook。 |
| 可读性与复杂度 | 19/25 | Git History 面板内搜索/列宽/虚拟列表/SVG 切片交织，主组件约 370 行状态+渲染；TokenUsage share 的 capture / blob / lightbox / nested open 状态机难扫读；Automation leave 的 pushState+popstate+nav guard 正确但密度高。 |
| 体量与内聚 | 13/20 | 当日固化/放大：`GitHistoryPanel` ~871（resizable 单提交 +532）、`AutomationSetup` 809→996、`TokenUsageShareDialog` ~727、`use-automation-page-state` ~736。正向：filter menus / memory editor / run drawer / SkillsFilterMenu / script helpers 有拆出。 |
| 可维护性与复用 | 13/15 | 正向：overlay close chrome 共享；history columns 单测；stage-all 路径统一 re-export；TokenUsage icons/chips 抽出。扣分：`SkillsView.handleOpenInstalledSkill` 手写 URL 参数，与已有 `buildSkillListUrl` 平行。 |
| 工程卫生 | 9/10 | 正向：Comet MIT NOTICE、图布局/search/columns 单测、e2e 调整、rustfmt/clippy 跟进、destructive bulk 确认对话框。扣 1：部分提交 message 非 conventional（如 “Restyle changes toolbar…”）。 |

## 6. 主要问题清单

### 中：`GitHistoryPanel.tsx` ~871 行混合 shell / 列 resize / SVG / 行 / badge

- 提交：`f8389e229`、`7c214ac9d`、`c18f78fbc` 等
- 文件：`apps/web/src/features/git/components/GitHistoryPanel.tsx`
- 问题：纯 layout/search/columns 已外提，但 UI 仍单文件承载 TableHeader、ColumnResizeHandle、GitHistoryGraphSvg、GitHistoryRow、HistoryRefBadge 与主面板编排；resizable 提交进一步抬高体积。
- 为什么是质量问题：改行复制按钮或 resize 手柄会与搜索/prefetch 逻辑同 diff，审查与回归面过大。
- 优化建议：拆 `git-history-table-chrome.tsx`（header+resize）、`git-history-graph-svg.tsx`、`git-history-row.tsx`（含 highlight/badge）；`GitHistoryPanel` 只保留 query/虚拟列表/选择/drawer 编排。

### 中：`AutomationSetup.tsx` 809→996，dirty-leave 守卫与表单总装同居

- 提交：`f50c35a94`（memory / unsaved dialog / 表单扩张）
- 文件：`apps/web/src/features/automations/components/AutomationSetup.tsx`
- 问题：`setupSnapshot` 基线、`useRegisteredAppNavigationGuard`、`beforeunload`、`popstate` 二次 pushState、leave dialog 动作与 save/create/update/github 路径同文件；SetupControls 体积下沉到 Setup。
- 为什么是质量问题：改「是否脏」判定或浏览器后退拦截必须加载整份 setup 表单。
- 优化建议：抽 `use-automation-setup-leave-guard.ts`（baseline + requestLeave + 三类拦截 + dialog 动作）；Setup 只调用 `requestLeave` / `clearDirtyBaseline`。

### 中：`use-automation-page-state.ts` ~736 上帝 hook

- 提交：`f50c35a94`（list/run filter URL 状态接入）
- 文件：`apps/web/src/features/automations/hooks/use-automation-page-state.ts`
- 问题：page view URL、list/run filters、detail 加载、definition actions（run/pause/resume/delete）、toggle、cancel run、continue terminal、memory save 同 hook 返回。
- 为什么是质量问题：改 run filter 会与 delete github route 生命周期 diff 纠缠。
- 优化建议：中期拆 `use-automation-definition-actions.ts` 与 filter URL 绑定；本次优先保证 filter 纯逻辑已在 `automation-*-filters.ts`（已完成部分）。

### 中：`TokenUsageShareDialog.tsx` / `TokenUsageSharePopover` ~727 行状态机

- 提交：`750fab75b`、`86c8006bd`
- 文件：`apps/web/src/app-shell/TokenUsageShareDialog.tsx`
- 问题：publish/share 双 tab 高度动画、capture blob、preview URL revoke、lightbox 与 nested dialog 保活 popover、social share 路径同组件。
- 为什么是质量问题：改 capture 失败恢复策略必须读完整 share UX。
- 优化建议：抽 `use-token-usage-share-capture.ts`（blob/preview/revoke/ensureBlob）与 `SharePublishPanels` 文件；popover 只做 tab + 动作按钮编排。

### 低：`SkillsView` 详情 URL 与 `buildSkillListUrl` 平行拼装

- 提交：`0d5dc6a9c`
- 文件：`apps/web/src/features/skills/components/SkillsView.tsx`、`apps/web/src/features/skills/lib/skills-view-utils.ts`
- 问题：`handleOpenInstalledSkill` 手写 tab/filter/projects/q，与 list back 使用的 `buildSkillListUrl` 规则重复。
- 优化建议：新增 `buildSkillDetailUrl`（list 参数 + scope/skillId），两边共用。

## 7. 正向观察

- **Git History 分层**：`crates/core-engine/src/git/history.rs` 有界字段/ref 排序 + 单测；前端 layout 与 search 可单测；Zed 分页常量与 prefetch 边界清晰；虚拟列表只切片绘制 SVG。
- **Comet MIT 归因**：NOTICE + 文件头注释到位。
- **Automations 过滤**：`automation-list-filters.ts` / `automation-run-filters.ts` + 组件侧 tests；Run drawer / Memory editor 独立组件。
- **Workspace Script Dialog**：phases / trust / env insert 有 `workspace-script-dialog.ts` 与 DOM 测。
- **Skills**：tabs 子组件 + `SkillsFilterMenu` + push transition 注释说明时序。
- **Changes 工具栏**：destructive bulk 走 Dialog 确认，busy 状态收敛。
- **共享 drawer 关闭 chrome**：`packages/ui` drawer + structural test。
- **desktop-use**：quit 停 host、vendor 进程名隐藏，lifecycle/host-branding 分文件。

## 8. Review 建议

1. Graph History：大仓 2k+ commit 时 layout 全量 memo 成本；列宽拖动与虚拟行对齐。
2. History 搜索：SHA 前缀 vs 文本匹配；match 跳转与 prefetch 竞态。
3. Automation dirty leave：浏览器后退 / in-app nav / beforeunload 三路径是否一致。
4. Changes bulk discard/trash：确认文案与实际作用域（tracked vs untracked）。
5. Token share capture：暗色背景、popover 关闭后 lightbox 是否仍持有 blob。
6. Skills push detail：冷开 URL vs list 点击 open 是否双重动画。

## 9. 自动修复与 PR

总分 79 < 90，已触发自动修复。

### 修复摘要

1. **Git History UI 拆分**
   - `git-history-table-chrome.tsx`：`GitHistoryTableHeader` + `ColumnResizeHandle`
   - `git-history-graph-svg.tsx`：`GitHistoryGraphSvg`
   - `git-history-row.tsx`：`GitHistoryRow` + highlight + ref badge
   - `GitHistoryPanel.tsx`：871 → **~439**（编排 + 搜索 + 虚拟列表）
   - 更新 structural test，覆盖拆分后多文件契约

2. **Automation leave 守卫抽出**
   - 新增 `use-automation-setup-leave-guard.ts`（baseline / nav guard / beforeunload / popstate / dialog 动作）
   - `AutomationSetup.tsx`：996 → **~883**，保存成功走 `clearDirtyBaseline()`

3. **Skills URL 复用**
   - `buildSkillDetailUrl` 复用 list 参数规则
   - `SkillsView.handleOpenInstalledSkill` 改为调用 helper

### 验证

- `bun test`：`git-history-panel.structural` + columns/graph/search：**21 pass**
- `git diff --check`：通过
- 全量 `bun run typecheck`（worktree 依赖链接不完整）存在大量与本次无关的缺失类型错误；本次引入的 `GitHistoryCommit` 缺 import 已补齐

### 剩余风险

- `TokenUsageSharePopover` 状态机未在本 PR 拆出（风险面大、与视觉动画耦合）。
- `use-automation-page-state` 仍偏大，未拆 definition actions。
- AutomationSetup 表单/composer/github 总装仍重，仅移出 leave 守卫。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-16_score-79_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-16`
- 修复提交：`6160d7d0c`（及后续 report URL 补全提交）
- PR URL：https://github.com/AruNi-01/atmos/pull/246
- Label：`GrokBuild`
