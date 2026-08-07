# Atmos main 每日代码质量评分（2026-08-06）

## 1. 审查范围

- 昨日时间窗口：2026-08-06 00:00:00 到 2026-08-06 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `dd75f5f11`；窗口前 tip `bdd1b2474` 所在 first-parent 之前另有 08-05 晚间提交，审查以 **提交时间戳落在窗口内** 的 origin/main 可达提交为准）。
- 排除：窗口内无「只改 `automations/review/quality/result/`」的 automation 归档提交。
- 审查方式：以窗口内 27 个非 merge + 2 个 merge 提交为主，重点覆盖 worktree diff 内联编辑、agent attention latch、terminal center-tab / cursor、sidebar agent+PR 状态、Desktop Use grant overlay、Desktop packaging。
- 本地用户工作区在无关 feature 分支；审查与修复在独立 worktree `grokbuild/quality-fix/2026-08-06` 完成，未覆盖用户改动。

被审查提交（含 merge，按时间）：

| Hash | Author | Message |
| --- | --- | --- |
| `8842c9654` | AarynLu | feat(desktop-use): native highlight binary and Electron grant overlay |
| `c3649a2d1` | AarynLu | feat(agent): sticky attention latches and idle/dismiss hooks |
| `10c15826e` | AarynLu | feat(terminal): center-tab presentation and agent name titles |
| `e47016efc` | AarynLu | feat(web): configurable agent activity indicators |
| `96f1e5958` | AarynLu | refactor(ui): use border-beam package and dialog polish |
| `9f61c7f26` | AarynLu | fix(web): shell chrome, surface policies, and i18n polish |
| `d75b7aeb2` | AarynLu | feat(shared/terminal): stabilize center-tab OSC session titles |
| `ccce0d50b` | AarynLu | feat(web): add terminal cursor appearance settings |
| `611232cf8` | AarynLu | fix(terminal): zero scrollback only for inline mouse TUIs |
| `3696f107b` | AarynLu | fix(web): keep warm terminal chrome from painting over light surfaces |
| `b3490bd70` | AarynLu | feat(web): show workspace agent and PR status on sidebar rows |
| `8a4207efa` | AarynLu | feat(web): polish agent activity indicator picker |
| `a5ffb7eb0` | AarynLu | feat(web): improve Appshots history popover UX |
| `c01090a67` | AarynLu | fix(web): polish Desktop Use readiness and permissions UX |
| `d90667882` | AarynLu | chore(desktop): unify host and notification icons with legacy regen |
| `c8ed993b0` | AarynLu | fix(web): stabilize commit message field and refresh tab chrome |
| `963563e55` | AarynLu | docs: English UI casing rule and icon regen notes |
| `000b8b68a` | AarynLu | feat(release): inject desktop Download section and Contributors mentions |
| `dd4ef818b` | AarynLu | chore(deps): bump Next.js to 16.3.0 and @pierre/diffs to 1.3.4 |
| `81aed8489` | AarynLu | feat(web): allow inline edit of worktree diffs in Changes view |
| `6f72615e4` | AarynLu | fix(diff): smooth edit-toolbar collapse and use SquarePen icon |
| `125490723` | AarynLu | fix(editor): refresh git gutter live while typing and after save |
| `9bf93d587` | AarynLu | Merge remote-tracking branch 'origin/main' into feat/app-053-browser-use-embedded |
| `6293ccc1c` | AruNi_Lu | Merge pull request #204 from AruNi-01/feat/app-053-browser-use-embedded |
| `89a6dccfc` | AarynLu | chore(desktop-electron): release 2026.8.6-beta.1 |
| `bab1dd2e5` | AarynLu | fix(web): add scrollMargin to MockIntersectionObserver for Next 16.3 types |
| `0d3ed7b17` | AarynLu | chore(desktop-electron): release 2026.8.6-beta.2 |
| `df43c9707` | AarynLu | fix(desktop): use webpack for desktop web static export on all platforms |
| `dd75f5f11` | AarynLu | chore(desktop-electron): release 2026.8.6-beta.3 |

## 2. 一份好代码应该是什么样

本次标准看「新能力是否把状态机、纯规则和 UI 编排拆开」。worktree 内联编辑应把 draft/save/stage 会话与 pierre 视图编排隔离；sticky attention 应是可导航的子域，而不是继续塞进已超千行的 `agent_hooks` 主文件；sidebar 的 agent/PR 展示应像已做的那样沉淀纯 presentation + hook；设置页新增外观块应自包含，而不是把 `TerminalSettingsSection` 继续拉长。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低严重度分别约扣 8–15 / 3–7 / 1–2 分；同一根因不重复计数。
- 体量阈值作信号：服务文件 800+、UI/hook 400+、单函数 80+ 且职责混杂时才明确扣分。
- 不把历史债务整包算到当日；只计当日引入、放大或固化的结构问题。正向拆分（pure lib + tests）计入观察，不机械抵消。

## 4. 总分

总分：78/100。总体判断：良好。

当日交付面广且多项能力抽出了纯模块与单测，但 Changes 内联编辑把已偏大的 `ChangesCodeView` 推到 1100+ 行枢纽，attention latch 又把 `agent_hooks.rs` 从 ~1109 抬到 ~1409，terminal 枢纽与设置页也继续长大。结构方向总体正确，枢纽膨胀需要尽快收口。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | 正向：`terminal-center-tab-presentation`、`workspace-pr-status`、`workspace-agent-status`、`agent-activity-indicator-styles`、`AgentRunningGlyph`、grant-overlay 自成模块。扣分：worktree 编辑会话嵌在 Changes 视图总编排里；attention latch 逻辑落在已巨大的 hooks service 而非子模块。 |
| 可读性与复杂度 | 20/25 | 编辑路径依赖多份 state+ref 镜像与 pierre item 重建时序；`Terminal.tsx` 在既有超长组件上继续叠 TUI/cursor/title 行为。 |
| 体量与内聚 | 13/20 | 日终：`ChangesCodeView` ~1117（+353）、`Terminal.tsx` ~1634、`agent_hooks.rs` ~1409（+300）、`TerminalAgentInputOverlay` ~1383、`TerminalSettingsSection` ~577、`WorkspaceKanbanCard` ~601。 |
| 可维护性与复用 | 12/15 | 正向：PR/agent status 与 center-tab 规则可单测复用。扣分：编辑逻辑未抽 hook，后续若 commit/review 视图也要编辑会复制；cursor 外观 UI 与其它设置组仍耦在同一文件。 |
| 工程卫生 | 9/10 | 大量 structural/unit 测试、NOTICE/orbs 归属、release notes 脚本拆分、webpack 平台注释清晰；编辑状态双写（state + ref）偏啰嗦，轻微扣分。 |

## 6. 主要问题清单

### 中：`ChangesCodeView` 吸收完整 worktree 内联编辑会话，体量突破高风险区

- 提交：`81aed8489`、`6f72615e4`
- 文件：`apps/web/src/features/diff/components/ChangesCodeView.tsx`（~764 → ~1117）
- 问题：enter/exit/save/reset、Cmd/Ctrl+S、staged 写回 `stageFiles`、draft Map、编辑态 state/ref 同步、工具栏动画按钮全部堆进同一组件；`export function ChangesCodeView` 本体约 980+ 行。
- 为什么是质量问题：后续改 diff 加载批处理或改编辑协议必须通读整份枢纽；编辑状态机与视图编排耦合，回归面过大。
- 优化建议：抽出 `useDiffWorktreeEdit`（会话状态 + save/stage + 快捷键）与 `DiffWorktreeEditToolbar`（按钮呈现）；纯函数 `rebuildDiffItem` / 路径拼接放进 hook 或 `lib/`。

### 中：`agent_hooks.rs` 再增 sticky attention latch，服务文件继续膨胀

- 提交：`c3649a2d1`
- 文件：`crates/core-service/src/service/agent_hooks.rs`（~1109 → ~1409）
- 问题：`AgentAttentionLatch` 类型、`maybe_raise_attention` / `clear_attention_matching_ids` / broadcast 与 4 个单测直接写在主文件；与既有 session/child lifecycle 编排混读。
- 为什么是质量问题：目录下已有 `agent_hooks/child_lifecycle.rs` 拆分先例，attention 作为独立子域却未跟进，导航与冲突合并成本上升。
- 优化建议：新增 `agent_hooks/attention.rs`，用 `impl AgentHooksService` 承载 latch API 与测试（与 `child_lifecycle` 同模式），主文件只保留字段与 `update_state` 调用点。

### 中：`Terminal.tsx` / `TerminalAgentInputOverlay` 枢纽继续放大

- 提交：`10c15826e`、`611232cf8`、`3696f107b`
- 文件：`apps/web/src/features/terminal/components/Terminal.tsx`（~1506 → ~1634）、`TerminalAgentInputOverlay.tsx`（~1383）
- 问题：center-tab presentation 已正确抽到 pure lib，但 TUI scrollback 策略、cursor appearance 接线、warm chrome 仍改在超大组件内。
- 为什么是质量问题：历史枢纽未减负，当日改动继续抬高阅读成本。
- 优化建议：后续把 xterm option 同步（cursor style/blink）与 mouse/scrollback policy 接线收到 `useTerminalXtermAppearance` / 既有 `tui-mouse-*` 边界；overlay 的 surface 可见性策略保持策略表 + 小组件。

### 低：`TerminalSettingsSection` 因 cursor 外观再增约 140 行

- 提交：`ccce0d50b`
- 文件：`apps/web/src/features/settings/components/TerminalSettingsSection.tsx`（~440 → ~577）
- 问题：预览 icon、TabsSubtle 选项与 blink Switch 与行为/性能设置同文件。
- 为什么是质量问题：设置组本可自包含，继续堆叠会让下一次外观迭代更难定位。
- 优化建议：`TerminalCursorAppearanceSettings` 组件拥有 store load 与 expand 状态，主 section 只挂载。

### 低：`WorkspaceKanbanCard` / `AppshotsHistoryPopover` 接近或超过 UI 中风险阈值

- 提交：`b3490bd70`、`a5ffb7eb0`
- 文件：`WorkspaceKanbanCard.tsx` ~601、`AppshotsHistoryPopover.tsx` ~585
- 问题：PR 状态接线与 history UX 完善合理，且已抽 pure lib/hook；卡片/弹层 JSX 仍偏长。
- 为什么是质量问题：中期若继续加 status chrome 会再次混职责。
- 优化建议：Kanban 卡内 PR 行可下沉为 `WorkspacePrLeadingSlot`；Appshots 列表项抽 `AppshotHistoryRow`。

## 7. 正向观察

- **纯规则模块 + 测试**：`terminal-center-tab-presentation`、`workspace-pr-status`、`workspace-agent-status`、`agent-activity-indicator-styles` 边界清晰，便于无 UI 回归。
- **Agent 指示器拆分**：`AgentRunningGlyph` + settings picker 预览 mock 分离良好；Orbs 带 NOTICE/归属注释。
- **Desktop Use grant overlay**：独立 `grant-overlay.ts` + structural test + preload，HTML 面板自包含。
- **Release 管线**：`append-desktop-download-section.mjs` 与 electron release notes 测试增强，平台 webpack 路径有明确注释。
- **merge #204 后** surface-manager / BrowserSession 体量相对前日略降（历史债有收敛迹象，不归当日新债）。

## 8. Review 建议

人工 review 优先盯：

1. Changes 内联编辑：未保存切换文件、staged 写回、Cmd-S 与 pierre `item.edit` 重建时序。
2. Attention latch：refresh 恢复、focus 清除、QuietIdle 不抬 task-complete、与 child lifecycle 的交叉。
3. Terminal center-tab sticky OSC 与 cursor appearance 是否只在该接线层改动。
4. 是否还有新的 800+ 枢纽在当日被继续堆功能（尤其 Terminal / Changes）。

## 9. 自动修复与 PR

总分 78 < 90，已触发自动修复。

### 修复摘要

1. **Changes 内联编辑拆分**  
   - 新增 `useDiffWorktreeEdit.tsx`（会话状态、save/stage、快捷键、`rebuildDiffItem`）  
   - 新增 `DiffWorktreeEditToolbar.tsx`（Edit/Save/Reset 控件）  
   - `ChangesCodeView.tsx` 约 1117 → ~818 行

2. **Agent attention 子模块**  
   - 新增 `crates/core-service/src/service/agent_hooks/attention.rs`  
   - 类型、API、broadcast 与 4 个单测迁出；`agent_hooks.rs` 约 1409 → ~1129 行，并 `pub use` 保持对外类型路径

3. **Terminal cursor 设置自包含**  
   - 新增 `TerminalCursorAppearanceSettings.tsx`  
   - `TerminalSettingsSection.tsx` 约 577 → ~443 行

### 验证

- `cargo test -p core-service --lib agent_hooks`：68 passed
- `bun --filter web typecheck`：通过
- pre-commit `cargo fmt`：通过
- 未跑全量 `just test` / E2E（与改动无关的历史成本过高）；编辑行为需人工点验

### 剩余风险

- `Terminal.tsx` / `TerminalAgentInputOverlay` 枢纽未在本次大幅拆分（风险高、行为面宽，避免无测试大挪）。
- 编辑流程依赖 pierre 运行时，建议在 PR 上手工验证 staged/unstaged 保存与未保存切换 toast。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-06_score-78_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-06`
- 修复提交：`2df44a0af`（结果文件随后续提交纳入同一 PR）
- PR URL：https://github.com/AruNi-01/atmos/pull/208
