# Atmos main 每日代码质量评分（2026-07-30）

## 1. 审查范围

- 昨日时间窗口：2026-07-30 00:00:00 到 2026-07-30 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`，已同步到 `origin/main`；筛选时 tip 为 `07c1cb659`（当日末业务提交）。执行时本地已 fast-forward 到含后续提交的 tip。
- 排除：窗口内无「只改 `automations/review/quality/result/`」的 automation 归档提交。
- 审查方式：按非 merge 业务提交 + merge 带入的 landing 变更看日终净 diff；重点阅读 canvas empty brush、composer mention、terminal OSC 0/2（APP-047）、landing CTA 与 skills 变更。

被审查提交：

| Hash | Author | Message |
| --- | --- | --- |
| `d8b42a008` | AruNi_Lu | Merge pull request #176 from AruNi-01/aarynlu/landing-download-cta-polish |
| `ecc84d0a7` | AarynLu | fix(web): improve composer @ file search and popover keyboard scroll |
| `86e4fe22d` | AruNi_Lu | Merge pull request #177 from AruNi-01/aarynlu/composer-mention-search-scroll |
| `98713c5aa` | AarynLu | chore: ignore local atmos-new-pr-merge skill |
| `05f8bfa46` | AarynLu | feat(canvas): open compact add-widget UI on empty marquee select |
| `51d22d0c3` | AruNi_Lu | Merge pull request #178 from AruNi-01/feat/canvas-empty-brush-add-widget |
| `81ff8ed0e` | AarynLu | chore(skills): track atmos-new-pr-merge and keep branches after merge |
| `74f66c74b` | AruNi_Lu | Merge pull request #179 from AruNi-01/chore/atmos-new-pr-merge-keep-branch |
| `c8e30a098` | AarynLu | chore(skills): allow skill-only publishes directly on main |
| `2b33d4a22` | AarynLu | feat(terminal): surface native OSC 0/2 titles as pane suffix (APP-047) |
| `07c1cb659` | AarynLu | fix: address CodeRabbit review on OSC title PR |

说明：merge 与对应 feature commit 视为同一变更，不重复计分；skills/gitignore 作为工程卫生改动纳入观察但不主导扣分。

## 2. 一份好代码应该是什么样

本次标准看「后续维护者能否快速判断职责边界、修改入口和风险范围」。好的变更应把纯规则、状态编排和 UI 拼装拆开；共享业务（如 canvas 加组件目录/上下文选项）应落在单一模块，而不是在两个对话框各写一份；新增大 UI 可以长，但必须用清晰子组件/共享 catalog 换来可维护性；命名要反映协议语义（shim 动态标题 vs native OSC），不能靠历史别名硬记。

## 3. 评分方法

- 100 分制，固定维度：设计与分层 30 分、可读性与复杂度 25 分、体量与内聚 20 分、可维护性与复用 15 分、工程卫生 10 分。
- 高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一根因不重复计数，只在额外后果时少量交叉扣分。
- 体量阈值作信号：UI 组件超过 400 行、单文件超过 800 行时，若同时职责混杂/重复实现，才作为明确问题。

## 4. 总分

总分：80/100。总体判断：良好，核心功能设计方向正确（纯函数抽取、双标题通道分离、测试到位），但 canvas empty brush 以 850 行新组件近乎复制主对话框，体量与复用问题明显，需要尽快收敛。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25/30 | APP-047 分层清晰（shared sanitize + 不污染 agent 检测）；empty brush 手势纯逻辑也拆对了。但 compact UI 未复用/抽共享 catalog，与 `CanvasAddAtmosWidgetDialog` 平行复制上下文与组件目录职责（`05f8bfa46`）。 |
| 可读性与复杂度 | 21/25 | mention 搜索改名匹配 + 共享 scroll helper 清晰；toolbar 上 `localOscTitle`（实为 shim 动态标题）与 `localNativeOscTitle`（native OSC）并存，双通道语义靠注释维持。 |
| 体量与内聚 | 13/20 | 新增 `CanvasEmptyBrushAddWidget.tsx` 850 行（popover 段约 525 行），超过 UI 高风险阈值；手势检测与完整加组件表单同文件。 |
| 可维护性与复用 | 12/15 | `buildProjectContext` / `buildContextOptions` / terminal 项目录等在两个 add-widget 表面重复；`filterMentionFileCandidates` 去掉 12 条上限，大仓库键盘导航成本上升。 |
| 工程卫生 | 9/10 | 双语 i18n、empty-brush/OSC/mention 均有单元测试；`setOscTitle` 在 wiki/code-review/主 store 三份归一逻辑（当日末仍有 trim 差异，后续提交已部分收口）。 |

## 6. 主要问题清单

### 高：Empty brush 新增 850 行组件，近乎复制主 Add Widget 对话框

- 提交：`05f8bfa46`（merge `51d22d0c3`）
- 文件：`apps/web/src/features/canvas/components/CanvasEmptyBrushAddWidget.tsx`（日终 850 行）；对照 `CanvasAddAtmosWidgetDialog.tsx`（约 779 行）
- 问题：新文件同时包含 marquee 手势状态机与完整「选 context + 搜组件 + 创建 shape」UI。其中 `buildProjectContext` / `buildWorkspaceContext` / `buildContextOptions` / terminal 目录项 / 组件网格与主对话框高度同构，只是布局更紧凑。手势纯逻辑虽已抽到 `canvas-empty-brush.ts` 并有测试，但 UI 层未同步收敛。
- 为什么是质量问题：后续改「哪些 widget 可加、context 如何建、搜索/禁用规则」必须改两处，极易分叉；单文件 800+ 行 UI 也抬高定位成本。
- 优化建议：抽出 `canvas-add-widget-catalog.ts`（`ADDABLE_CANVAS_ITEM_TYPES`、`getCanvasAddItemEntry`、`buildCanvasAddContextOptions` 等）；把手势检测与 popover 分成两个文件；主对话框与 empty brush 都只消费共享 catalog。上下文选择器 UI 可在第二步再抽共享组件。

### 中：terminal 双标题通道命名混淆（shim vs native OSC）

- 提交：`2b33d4a22`、`07c1cb659`
- 文件：`apps/web/src/features/terminal/hooks/use-terminal-toolbar-title.ts`（`localOscTitle` + `localNativeOscTitle`）；`Terminal.tsx`（`onTitleChange` / `onOscTitleChange`）
- 问题：历史「OSC」命名指 shim 动态标题（OSC 9999 / 路径类），APP-047 又引入真正的 native OSC 0/2 作为 `oscTitle`。本地状态仍叫 `localOscTitle` 表示 shim 路径，与 `localNativeOscTitle` 并列，阅读时容易把 agent 检测输入和展示后缀搞混。
- 为什么是质量问题：协议语义靠口头约定时，后续改 toolbar/marquee/agent 检测很容易接错通道。
- 优化建议：将 shim 侧本地状态改名为 `localShimDynamicTitle`（或 `localDynamicTitle`），注释明确「仅 agent 检测 / CWD 后缀」；native 侧保留 `localNativeOscTitle`。

### 中：mention 文件搜索去掉结果上限

- 提交：`ecc84d0a7`
- 文件：`apps/web/src/features/welcome/lib/mention-file-search.ts`（`filterMentionFileCandidates` 返回全量 ranked 列表）
- 问题：旧实现 `.slice(0, 12)` 被移除；测试甚至锁定「无 limit」。大仓库 `@` 匹配会一次性渲染大量行，加重 popover 键盘滚动成本。
- 为什么是质量问题：排序规则再好，UI 列表也应有明确预算；无上限会把「匹配正确」和「列表可交互」绑死。
- 优化建议：恢复 `MENTION_FILE_RESULT_LIMIT = 12`（或等价常量），在 rank 之后 slice；测试改为断言 cap + 排序前缀优先。

### 低：`setOscTitle` 在多 store 路径重复归一逻辑

- 提交：`2b33d4a22`、`07c1cb659`
- 文件：`use-terminal-store.ts`、`terminal-store-auxiliary-actions.ts`（project wiki / code review）
- 问题：三处各自写 osc 归一；日终版本仍有 trim 与 sanitize 不一致风险（当日末主路径仅 trim，入口侧依赖调用方 sanitize）。
- 为什么是质量问题：展示态字段的「何为空 / 是否过滤噪声」应单点定义。
- 优化建议：抽 `normalizeStoredOscTitle` 到 store helpers，mosaic / wiki / CR 共用。

## 7. 正向观察

- **APP-047 边界正确**：`sanitizeNativeOscTitle` / `appendNativeOscTitle` 落在 `packages/shared`；agent 检测明确只走 shim dynamic title；custom label 抑制 OSC 后缀；单元测试覆盖 sanitize、cap、suppress、clear。
- **Empty brush 手势规则可测**：`canvas-empty-brush.ts` + `canvas-empty-brush.test.ts` 把「何时打开」从 UI 副作用中拆出。
- **Mention 搜索产品规则变清晰**：去掉 fuse 路径噪声，改为 name-only contains + 可解释 rank；`splitHighlightParts` 与 `popover-list-scroll` 复用在 `@` / `/` 两处。
- **Landing CTA**（PR #176）改动小、职责集中（header/hero 锚点到 download、TabsSubtle 安装切换）。
- **Skills**：`atmos-new-pr-merge` 入库并明确 skill-only 可直推 main，流程文档自洽。
- **日终修整**：`07c1cb659` 对 CodeRabbit 反馈有针对性跟进（xterm recreate 重置 dedup、OSC clear 测试）。

验证记录（审查侧）：

- 阅读日终关键文件与 diff；对照主对话框确认重复面。
- 自动修复后：`bun test` 覆盖 empty-brush / mention / terminal-title，44 pass。

## 8. Review 建议

人工 review 今日最值得盯：

1. Empty brush 与主 Add Widget 在「可加项列表、context 规则、创建 size」上是否会再次分叉——优先看共享 catalog 是否真正成为唯一来源。
2. APP-047 双通道：native OSC 绝不能进入 `resolveAgentForTitle`；custom label 必须压掉 suffix。
3. Mention 列表是否应有结果预算；大 monorepo 下键盘滚动与渲染成本。
4. Landing Build CTA 是否只应在首页 hash 滚动（非首页行为是否符合预期）。

## 9. 自动修复与 PR

已触发自动修复（总分 80 < 90）。

### 修复摘要

1. 新增 `apps/web/src/features/canvas/lib/canvas-add-widget-catalog.ts`：共享 terminal 项、可加类型列表、`getCanvasAddItemEntry`、`buildCanvasAddContextOptions` 等；`CanvasAddAtmosWidgetDialog` 与 empty brush 共用。
2. 拆分 `CanvasEmptyBrushAddWidget.tsx`（手势检测，约 158 行）与 `CanvasEmptyBrushAddWidgetPopover.tsx`（UI 面板）。
3. `use-terminal-toolbar-title`：`localOscTitle` → `localShimDynamicTitle`，与 `localNativeOscTitle` 语义对齐。
4. `normalizeStoredOscTitle` 上收到 `terminal-store-helpers`，主 store 与 wiki/CR auxiliary 共用。
5. 恢复 `MENTION_FILE_RESULT_LIMIT = 12`，并更新对应测试。

### 验证

- `bun test apps/web/src/features/canvas/__tests__/canvas-empty-brush.test.ts apps/web/src/features/welcome/hooks/__tests__/use-welcome-mention-search.test.ts apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts` → 44 pass。
- `git diff --check` 无问题。

### 剩余风险

- Empty brush popover 与主对话框的 **UI 层**（上下文选择器 markup）仍有结构相似处，尚未抽成共享 React 组件；本次只收敛了数据/目录职责与文件体量。
- 未跑全量 web typecheck / e2e；若 catalog 类型与 dialog 多选路径有遗漏，需在 PR CI 中确认。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/review/quality/result/2026-07/07-31_score-80_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`codex/quality-fix/2026-07-30`
- 结果文件与修复同分支提交并推送；PR base 为 `main`。
- PR URL、提交 hash 在 push/`gh pr create` 成功后回填。
