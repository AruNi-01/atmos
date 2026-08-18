# Atmos main 每日代码质量评分（2026-08-17）

## 1. 审查范围

- 昨日时间窗口：2026-08-17 00:00:00 到 2026-08-17 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（窗口 tip `5eb227423`；审查时 origin/main 已前进到含后续小修）。
- 排除：`2b30d5bd1` docs: link quality report to PR #246（仅 quality result）。
- 计入正向：`6160d7d0c` refactor: address daily quality findings for 2026-08-16（含真实代码拆分）。
- 审查方式：以 **multi-pane CenterStage**、**APP-062 PT Design 包**、**Terminal pane DnD**、**Launchpad long-press reorder**、brand mark 为主线。
- 用户工作区有未提交改动；修复在独立 worktree `grokbuild/quality-fix/2026-08-17`。

被审查提交（代表性，窗口内约 48 条非 merge 业务/代码提交）：

| Hash | Author | Message |
| --- | --- | --- |
| `4cc44c2ea` | AarynLu | feat(web): multi-pane center stage and retire right sidebar |
| `abb73913f`…`5eb227423` | AarynLu | PT Design package / MCP / collab / relay DO / agent bridge（多提交迭代） |
| `d356d688a` | AarynLu | feat(web): drag terminal panes and restyle title chrome |
| `fd867516c` | AarynLu | feat(web): Launchpad long-press reorder with durable layout |
| `61b0731d7` / `130fea06e` | AarynLu | brand squircle + app mark PNG across UI |
| `461980af2` | AarynLu | feat(landing): proxy APP-061 /tok share URLs via Pages Functions |
| `6160d7d0c` | AarynLu | refactor: address daily quality findings for 2026-08-16 |

## 2. 一份好代码应该是什么样

本日标准看「壳层枢纽是否继续吞掉编排」与「新包是否画清浏览器/Node 边界」。Multi-pane 应把 layout 纯函数与 Stage 编排切开；PT Design 应保持 embed 不拖 `node:fs`/Ink/MCP；Terminal DnD 应把 canvas 抓帧预览与 split 交互拆开。体积可以大，但不能把可单测的映射/落盘/预览逻辑继续堆进 2k+ 行组件。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；只计当日引入/放大问题。

## 4. 总分

总分：**76/100**。总体判断：**良好**。

PT Design 包边界与 apply-gate、center-pane-layout 纯模块是高质量绿场；扣分主要来自 `CenterStage` 在已有巨大体积上再吞 multi-pane 编排（~2209→~2708），以及新建 `TerminalSplitView` 把 DnD + canvas 预览捆在一起。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | 正向：`@atmos/pt-design` browser `index` vs `headless`；isolation test 禁止 Ink/`node:fs`；`apply-gate` 单 token 消 echo；`center-pane-layout.ts` + saved-layout 可单测；Launchpad items 抽到 settings lib。扣分：multi-pane 接线/存盘 apply 仍落在 `CenterStage`；`PtDesignApp` 同时编 session、collab、library、board echo。 |
| 可读性与复杂度 | 18/25 | CenterStage 恢复 tab / deferred context / multi-pane exclusive openTab 注释多但仍难扫；Terminal 拖拽 ghost 含 canvas 采样与 blank 检测；PT Design board onChange ↔ session ↔ persist 时序依赖多 ref。 |
| 体量与内聚 | 12/20 | `CenterStage` ~2708（当日 +~500）；`CenterStageTabBar` ~1445；新 `TerminalSplitView` ~691；`PtDesignApp` ~566、`ExcalidrawBoard` ~463。正向：RightSidebar 删除；layout/saved-layout 模块；catalog templates 偏数据表。 |
| 可维护性与复用 | 13/15 | 正向：前日质量拆分合入；launchpad-items；scene-bridge / fingerprint；Pages Functions tok proxy 独立。扣分：CenterStage 多处重复 `openTab(...)` 样板；apply-saved 表面打开逻辑曾内联在 Stage。 |
| 工程卫生 | 9/10 | 正向：大量 pt-design 单测、isolation、debounce persist、MCP/CLI 错误面修补。扣 1：同日多次「unblock bundle / node:fs」修复说明初版边界曾漏。 |

## 6. 主要问题清单

### 高：`CenterStage.tsx` ~2708，multi-pane 继续放大神组件

- 提交：`4cc44c2ea`（+595/−110 于该文件）
- 文件：`apps/web/src/app-shell/CenterStage.tsx`
- 问题：虽抽出 `center-pane-layout*`，但 hydrate/ensure、split、pane tab change、save/apply saved layout、slot boxes、与 URL/openTab 的 exclusive 附着仍堆在 Stage；与既有 restore/deferred/GitHub/browser 编排同居。
- 为什么是质量问题：改「空窗格 split」或「应用已存布局」必须打开 2700+ 行文件，与 terminal 关闭队列等无关逻辑同 diff。
- 优化建议：把 saved-layout 表面物化抽到 `apply-saved-center-layout.ts`；`tab→pane` 映射进 `buildTabToPaneIdMap`；中期再把 multi-pane store 接线收到 `use-center-pane-stage.ts`。

### 中：`TerminalSplitView.tsx` ~691 混合 DnD 与 canvas 抓帧

- 提交：`d356d688a`
- 文件：`apps/web/src/features/terminal/components/TerminalSplitView.tsx`
- 问题：PointerSensor 停靠、ghost portal、以及 `captureTerminalSnapshot` / blank canvas / xterm rows 回退同文件。
- 为什么是质量问题：改预览 JPEG 质量或 blank 检测会触碰 split 百分比与 dock 命中逻辑。
- 优化建议：把 capture* 迁入已有 `terminal-pane-drag-preview.ts`（与 scale/grabOffset 同模块）。

### 中：`PtDesignApp.tsx` ~566 编排放大（collab + library + echo）

- 提交：`24bbfda10`、`abb73913f` 等
- 文件：`packages/pt-design/src/embed/PtDesignApp.tsx`
- 问题：apply-gate、persist debouncer、remote elements、library save/open、share 同组件；多 ref（loading/echo/applyGate/broadcast）交叉。
- 为什么是质量问题：改 library 落盘路径需理解整条 board 同步环。
- 优化建议：中期抽 `use-pt-design-library` 与 `use-pt-design-board-sync`；保持 apply-gate 纯模块（已有）。

### 低：Launchpad UI 仍偏厚（~477）尽管 items 已外提

- 提交：`fd867516c`
- 文件：`apps/web/src/app-shell/LeftSidebarLaunchpad.tsx`、`apps/web/src/features/settings/lib/launchpad-items.ts`
- 问题：long-press reorder / durable layout 增加交互，数据映射已较好抽出。
- 优化建议：把 reorder 手势状态收到 `use-launchpad-reorder.ts`，组件专注渲染。

## 7. 正向观察

- **PT Design 包边界**：browser barrel 不导出 document/MCP/CLI；isolation 测试守门；headless 另入口。
- **apply-gate**：programmatic `updateScene` 与 onChange echo 用单 token 对齐，有测试迭代（consume one token）。
- **center-pane-layout**：纯函数 + 充实单测；删除 RightSidebar 收缩壳层表面积。
- **Launchpad items**：settings lib + store 测试，顺序持久化路径清楚。
- **前日质量修复合入**：Git History UI 拆分与 automation leave-guard 当日落地。
- **工程跟进**：Ink/`node:fs` 出 embed、debounce persist、MCP stdio 错误面、collab host hostname 比较。

## 8. Review 建议

1. Multi-pane：URL `?tab=` 是否仍会偷焦点；Overview 是否永绑 primary。
2. Saved layout apply：browser/simulator/git-history 表面是否幂等复用。
3. PT Design：collab 远端写与 local persist 是否双写；apply-gate 漏 token 导致回环。
4. Terminal DnD：WebGL canvas 抓帧失败时 ghost 是否可读。
5. Launchpad long-press：与普通点击打开是否冲突。

## 9. 自动修复与 PR

总分 76 < 90，已触发自动修复。

- PR：https://github.com/AruNi-01/atmos/pull/247

### 修复摘要

1. **`terminal-pane-drag-preview.ts`**：迁入 `capturePanePreview` / canvas / rows 回退；`TerminalSplitView` ~697→~556。
2. **`apply-saved-center-layout.ts`**：`prepareSavedCenterLayout` 物化已存布局表面；`CenterStage` 调用收口。
3. **`buildTabToPaneIdMap`**：纯函数 + 单测；Stage 用 memo 包一层。

### 验证

- `bun test` `center-pane-layout.test.ts`：**24 pass**
- `git diff --check`：通过

### 剩余风险

- `CenterStage` 仍 ~2737，未抽完整 `use-center-pane-stage`。
- `PtDesignApp` 未拆 library/board-sync。
- Launchpad reorder 手势未抽 hook。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-17_score-76_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-17`
- 修复提交：`330d94955`
- PR URL：https://github.com/AruNi-01/atmos/pull/247
- Label：`GrokBuild`
