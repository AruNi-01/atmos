# Atmos main 每日代码质量评分 - 2026-07-02

## 1. 审查范围

- 时间窗口：2026-07-01 00:00:00 到 2026-07-01 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`，已同步到 `origin/main`。
- 排除提交：`d3e3e3674` `docs: add code quality review result 2026-07-01 no commits`，只修改 `automations/review/quality/result/`，按规则不计入评分。

被审查提交：

| Commit | Message | Author |
| --- | --- | --- |
| `570f99db3` | `fix: stabilize preview browser and standalone windows` | AarynLu |
| `0c45aed49` | `feat(agent): preserve standalone chat handoff state` | AarynLu |
| `5ef2b26c0` | `feat(agent): improve tool output rendering` | AarynLu |
| `048f4e724` | `feat(preview): preserve standalone browser tabs` | AarynLu |
| `c924c178b` | `fix(preview): sync overlays and page metadata` | AarynLu |
| `29f52104d` | `fix(web): stabilize shared app helpers` | AarynLu |
| `641b4d3e1` | `docs(specs): add native preview occlusion plan` | AarynLu |
| `01292e71f` | `fix(web): hide native preview behind overlays` | AarynLu |
| `de55d511e` | `fix(preview): refine loading and native overlay behavior` | AarynLu |
| `875f77ec3` | `feat: add desktop preview devtools` | AarynLu |
| `63b51a0be` | `fix: improve canvas browser preview behavior` | AarynLu |
| `2f0c6f5b` | `perf: reduce canvas browser viewport lag` | AarynLu |
| `49138d406` | `Refine preview fullscreen interactions` | AarynLu |

## 2. 一份好代码应该是什么样

本次评分把“可维护的边界”放在第一位：复杂交互可以复杂，但代码应能让维护者快速看出状态归属、生命周期归属和跨层协议归属。UI 组件不应继续承载 native bridge、窗口生命周期、DOM 观察、状态同步、toolbar 行为等多种职责；底层 bridge 也应把状态注册、窗口操作和注入脚本分开。局部抽象应服务当前问题，不为了规避一次 bug 把隐式约定散到多个文件。

## 3. 评分方法

- 100 分制，按五个维度评分：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一问题不重复扣分。
- 体量阈值作为信号而非机械规则：单组件超过 400 行、单文件超过 800 行时，只有在职责继续混杂或拆分点明显时才扣分。

## 4. 总分

总分：86 / 100。

总体判断：良好。当天提交解决了真实交互问题，也增加了部分 feature-local hooks 和测试；但 preview/native/canvas 相关逻辑继续堆叠在超大组件和超大 bridge 模块里，已经形成需要尽快收口的维护成本。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25 / 30 | `Preview.tsx` 继续同时协调 transport、standalone window、native occlusion、canvas viewport、devtools 和 toolbar；`preview_bridge/mod.rs` 同时管理状态注册、窗口生命周期、注入脚本和事件转发。 |
| 可读性与复杂度 | 21 / 25 | 多个新增状态位、refs、effect 和 async gate 需要按隐式时序推理；尤其 preview native/canvas 同步链路阅读成本偏高。 |
| 体量与内聚 | 16 / 20 | 当天把 `Preview.tsx` 从约 1133 行推到 1365 行，把 `preview_bridge/mod.rs` 从约 578 行推到 1135 行，均超过高风险体量阈值且新增职责没有完全拆开。 |
| 可维护性与复用 | 14 / 15 | 大部分协议和 helper 命名清晰，runtime 双版本也明确说明了差异；但遮挡检测选择器和 bridge 状态更新约定仍偏隐式。 |
| 工程卫生 | 10 / 10 | 未发现明确调试残留；i18n 同步、错误提示、测试补充和注释解释整体稳定。 |

## 6. 主要问题清单

### 中：`Preview.tsx` 继续吸收 native preview 与 canvas viewport 编排

- 提交：`570f99db3`、`048f4e724`、`01292e71f`、`de55d511e`、`875f77ec3`、`63b51a0be`、`2f0c6f5b`、`49138d406`
- 文件：`apps/web/src/features/run-preview/components/Preview.tsx`
- 位置：`shouldSuspendDesktopPreview` 附近、`createTransportHandlers`、`syncDesktopPreview` / canvas viewport 同步 / devtools 逻辑
- 问题：组件原本已经负责 preview transport 和 toolbar 状态，当天又叠加 native occlusion、standalone browser、canvas viewport controller、devtools 暂停遮挡等职责。新增的 in-flight queue、RAF 合并、visible ref、loading ref 等状态与 transport lifecycle 交织，维护者需要理解多个隐式时序才能安全改动。
- 为什么是质量问题：这不是单纯行数问题，而是职责边界继续扩大；任何后续改 callback 依赖、native visibility 或 canvas widget 行为，都可能意外触发 preview flash、遮挡错误或隐藏/显示竞态。
- 优化建议：把 canvas viewport 同步抽成 `usePreviewCanvasViewportController`，把 controller 暴露、RAF 合并、in-flight queue、可见区域判断集中在 hook 内；后续再把 `createTransportHandlers` 拆成 transport event hook，把 devtools/standalone actions 拆成独立 controller hook。

### 中：desktop preview bridge 单模块承担过多层职责

- 提交：`570f99db3`、`c924c178b`、`875f77ec3`、`63b51a0be`、`49138d406`
- 文件：`apps/desktop/src-tauri/src/preview_bridge/mod.rs`
- 位置：`desktop_bridge_script`、`update_bridge_state` / `remove_bridge_state`、`open_preview_child` / `open_preview_detached_window`、`open_preview_window` 到 `show_preview_window`
- 问题：同一 Rust 模块同时包含 JS 注入脚本、cursor resolver、error page probe、bridge token、session registry、child webview lifecycle、detached window lifecycle、IPC event routing。当天新增多 session surface 之后，模块从约 578 行增长到 1135 行，且多个函数重复执行 previous state -> token -> next state -> eval/navigate 的流程。
- 为什么是质量问题：native bridge 是高风险边界，状态注册和窗口操作混在一起会让后续修复难以判断“应该改状态机、窗口调用、还是注入脚本”。重复状态拼装也容易让 detached、visible、bounds、pick_mode 在不同入口产生分叉。
- 优化建议：把模块拆成 `preview_bridge/state.rs`（registry、token、active session）、`preview_bridge/surface.rs`（child/detached open/hide/show/close）、`preview_bridge/scripts.rs`（injected JS 和 error probe）三块；引入一个小的 `PreviewSurfaceUpdate` 或 helper 来集中保留 `pick_mode`、`visible`、`bounds` 的默认合并规则。

### 低：native preview 遮挡检测依赖全局 DOM 扫描和隐式选择器约定

- 提交：`01292e71f`、`de55d511e`
- 文件：`apps/web/src/features/run-preview/hooks/use-native-preview-occlusion.ts`
- 位置：`OVERLAY_CANDIDATE_SELECTOR`、`getVisibleOverlayCandidates`、全局 `MutationObserver` / `pointermove` / `scroll` listeners
- 问题：遮挡检测通过全局 selector 扫描 body，并在 mutation、pointermove、scroll、transition、animation 上调度检测。实现已用 RAF 去抖，短期可用，但“哪些 overlay 会遮挡 native surface”依赖多个 data-slot/role/aria 约定散落在 hook 内。
- 为什么是质量问题：未来新增 overlay 组件时很容易忘记标记，或者把 tooltip/dropdown 误纳入遮挡范围；全局查询也会在复杂页面上增加调试成本。
- 优化建议：把遮挡候选统一收敛到显式 `data-atmos-native-surface-overlay` 标记，并在公共 overlay/portal 组件内设置；保留少量第三方 Radix fallback selector，但用注释说明为什么需要。若后续还要扩展，优先改公共 overlay 层，而不是继续扩充本 hook 的 selector 表。

## 7. 正向观察

- `apps/web/src/features/run-preview/AGENTS.md` 把 preview native cursor、overlay click、callback cascade 等问题写成了具体约束，降低了后续维护者重复踩坑的概率。
- 多处 i18n 文案同步更新了 `en.json` 和 `zh.json`，没有只改英文。
- `CanvasBrowserWidget` 和 canvas widget shape helper 增加了相关测试，至少把 browser widget 的尺寸、pin key 和 registry 行为固定住。
- agent chat handoff 被放入独立 `agent-chat-session-handoff.ts`，没有把 BroadcastChannel/localStorage/Tauri handoff 细节全部塞入组件。
- desktop bridge 增加 bridge token 和 per-session surface label，方向上是在收紧跨 webview 事件归属。

## 8. Review 建议

人工 review 今天最值得盯：

1. `Preview.tsx` 的 callback dependency 是否会重新触发 desktop-native `show()` / `updateViewport()` 造成 flash。
2. `preview_bridge/mod.rs` 的 `visible`、`detached`、`bounds`、`pick_mode` 在 open/navigate/hide/show/close 入口是否保持一致。
3. `use-native-preview-occlusion.ts` 的 selector 是否会误遮挡或漏遮挡真实 overlay。
4. shared runtime 与 extension runtime 的公共 API shape 是否继续同步，差异是否只保留在注释说明的 overlay/cursor 层。

## 9. 自动修复与 PR

总分 86，低于 90，已触发自动修复流程。

- 修复分支：`codex/quality-fix/2026-07-01`
- 修复提交：`cb1c5e194` `refactor: isolate preview viewport sync`
- PR：https://github.com/AruNi-01/atmos/pull/146
- 修复内容：新增 `apps/web/src/features/run-preview/hooks/use-preview-canvas-viewport-controller.ts`，把 canvas/native viewport sync queue、RAF 合并、可见区域判断和 controller 暴露从 `Preview.tsx` 中抽出；`Preview.tsx` 保留原 controller 类型导出，调用方无需改行为。
- 验证：
  - `bun --filter web typecheck`：通过
  - `bun --filter web lint`：通过，存在既有 warnings
  - `bun test apps/web/src/features/canvas/__tests__/canvas-widget-shape.test.ts`：通过，12 tests
  - `git diff --check`：通过
- Label：已添加 `codex`；仓库未发现 `codex-automation` label，已按规则跳过。
- 未处理风险：`preview_bridge/mod.rs` 的模块拆分仍建议后续单独做，避免把 native bridge 生命周期重构混入本次低风险修复。

## 10. 结果文件

本次结果文件路径：`automations/review/quality/result/2026-07/07-02_score-86_RESULT.md`

## 11. 结果提交与推送

- 结果文件将随修复分支 `codex/quality-fix/2026-07-01` 推送到 `origin`，并包含在 PR https://github.com/AruNi-01/atmos/pull/146 中。
- 修复代码提交 hash：`cb1c5e194`
- 结果文件提交 hash：由本报告文件提交生成后，以 `git log` 和最终执行摘要为准。
- 推送目标：`origin/codex/quality-fix/2026-07-01`
