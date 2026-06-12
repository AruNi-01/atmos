# Atmos Main 每日代码质量评分

## 1. 审查范围

- 昨日时间窗口：2026-06-11 00:00:00 到 2026-06-11 23:59:59（UTC+8，Asia/Shanghai）
- 同步状态：已在审查前将本地 `main` fast-forward 到 `origin/main`
- 排除提交：`89f8dbc1`、`2a74fb47`、`95f20844` 只修改 `automations/code/result/`，按规则不参与评分

被审查的提交列表：

| commit | author | message |
| --- | --- | --- |
| `771e2932` | AarynLu | feat(preview): improve selection picker flow |
| `0b3f681b` | AarynLu | refactor: improve daily quality findings |
| `729b95e7` | AarynLu | Guard live apply after agent hydration |
| `35db5f02` | AruNi_Lu | Merge pull request #125 from AruNi-01/codex/quality-fix/2026-06-10 |
| `9663abc6` | AarynLu | Add favicon and selection annotation support to preview |
| `e4f22ba6` | AarynLu | perf: optimize web bootstrap requests |
| `8d60d07e` | AarynLu | Normalize preview titles for Atmos workspace pages |

## 2. 一份好代码应该是什么样

本次评分采用的标准是：代码应该让职责、边界和数据流一眼可追踪；跨运行环境的协议变化必须在所有 transport 中闭环；UI 组件应把状态生命周期、操作区和具体展示拆开；性能优化不能用隐式全局状态或无界并发换取短期请求减少；缓存和异步请求需要明确的失效、竞态和覆盖规则。

## 3. 评分方法

- 100 分制。
- 设计与分层：30 分，关注职责边界、模块耦合、分层方向、抽象是否贴合。
- 可读性与复杂度：25 分，关注控制流、状态管理、分支复杂度和理解成本。
- 体量与内聚：20 分，关注文件、函数、组件是否过大且职责混杂。
- 可维护性与复用：15 分，关注重复逻辑、共享协议、缓存规则和常量组织。
- 工程卫生：10 分，关注命名、错误处理、日志、调试残留和临时实现痕迹。
- 高严重度通常扣 8-15 分；中严重度扣 3-7 分；低严重度扣 1-2 分。同一问题不重复扣分。
- 体量阈值作为信号而非机械规则：单 UI 组件超过 250 行需要关注职责混合，超过 400 行通常高风险；函数超过 80 行要看是否包含多个阶段；参数超过 5 个要检查接口边界。

## 4. 总分

**84 / 100，良好。**

总体判断：昨天的代码整体方向合理，尤其是 preview 和 bootstrap 性能方向都有价值；但跨 transport 协议闭环、共享组件内聚和异步缓存竞态上出现了需要尽快收口的中等质量问题，因此触发自动修复流程。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25 / 30 | preview runtime 已发出 `toolbar-action`，但 extension transport 未消费，跨模式协议闭环不完整；`SelectionPopover` 承担了定位、动画、复制、附件、preview annotation 详情渲染等多类职责。涉及 `771e2932`、`9663abc6`。 |
| 可读性与复杂度 | 21 / 25 | `SelectionPopover.tsx` 的 details JSX 与动作分支嵌在主组件内，阅读主路径时需要跨越大段 preview/wiki 特化 UI；`loadIssues` 的序列号只在仓库切换时变化，无法表达同仓库多次加载的竞态关系。涉及 `9663abc6`、`e4f22ba6`。 |
| 体量与内聚 | 16 / 20 | `SelectionPopover.tsx` 达到 513 行，新增详情区后组件内聚下降；preview runtime 文件本身天然较大，但昨天新增 annotation 行为进一步放大了人工同步成本。 |
| 可维护性与复用 | 13 / 15 | `handle_project_workspace_bootstrap` 使用 `join_all` 对所有 project 并发拉取 workspace，缺少并发上限；该优化在项目数增大时容易把 bootstrap 稳定性压力转给服务层。涉及 `e4f22ba6`。 |
| 工程卫生 | 9 / 10 | 扩展版本号在 `manifest.json`、extension runtime、shared runtime 三处保持一致；未发现调试残留。扣 1 分是因为新增竞态/并发规则没有通过局部常量或传输层分支显式表达。 |

## 6. 主要问题清单

### 高

未发现明确高严重度代码质量问题。

### 中

1. `771e2932` / `9663abc6`，`apps/web/src/features/run-preview/lib/preview-transports/extension-transport.ts`，函数 `handleMessage`
   - 问题描述：`PreviewHelperMessage` 已包含 `atmos-preview:toolbar-action`，extension runtime 也会发出该事件，但 extension transport 的 switch 没有处理该分支，导致 extension 模式的 toolbar action 被默认丢弃。
   - 为什么是质量问题：preview 现在有 same-origin、extension、desktop-native 多 transport。协议新增后只在部分 transport 闭环，会让功能分叉，后续维护者需要靠记忆判断哪个模式支持哪些事件。
   - 优化建议：在 extension transport 的 `handleMessage` 中显式转发 `toolbar-action` 到 `options.onToolbarAction`；后续可给每个 `PreviewHelperMessage` 事件补一个 transport 分发测试，防止消息 union 扩展时漏分支。
   - 自动修复：已在修复提交中补齐 `toolbar-action` 分支。

2. `9663abc6`，`apps/web/src/features/selection/components/SelectionPopover.tsx`，组件 `SelectionPopover`
   - 问题描述：组件增长到 513 行，新增 preview annotation 详情面板后，主组件同时处理定位/动画生命周期、复制和附件行为、preview confidence 展示、annotation add/update 操作。
   - 为什么是质量问题：这类共享 selection 组件会被 editor、diff、wiki、preview 复用；把 preview 特化详情 JSX 留在主组件内，会抬高所有 selection 场景的阅读成本，也让后续修改某个详情区时更容易碰到外层生命周期。
   - 优化建议：保留 `SelectionPopover` 负责定位、显示/退出动画和通用 quick actions；把详情面板、note textarea、confidence disclosure、attach/add/update/copy action 区抽到 `SelectionPopoverDetails`。
   - 自动修复：已新增 `apps/web/src/features/selection/components/SelectionPopoverDetails.tsx`，主组件缩到 338 行，并移除非 preview 分支中不可达的 Add annotation quick action。

3. `e4f22ba6`，`apps/api/src/api/ws/router/project.rs`，函数 `handle_project_workspace_bootstrap`
   - 问题描述：bootstrap 中用 `join_all(projects.iter().map(...list_by_project...))` 对所有 project 同时拉取 workspace，没有并发上限。
   - 为什么是质量问题：这是启动/bootstrap 路径。项目数增大时，无界并发会把一次页面启动变成一批同时打向 service/repository 的请求，性能优化反而可能制造尖峰压力。
   - 优化建议：将项目 guid 先复制成 owned list，再用 `stream::iter(...).buffer_unordered(WORKSPACE_BOOTSTRAP_CONCURRENCY)` 设置明确并发上限；用常量表达策略，避免魔法数字散在控制流中。
   - 自动修复：已加入 `WORKSPACE_BOOTSTRAP_CONCURRENCY = 8` 并改为 bounded stream。

4. `e4f22ba6`，`apps/web/src/features/welcome/hooks/use-welcome-project-context.ts`，函数 `loadIssues`
   - 问题描述：`issueLoadSeqRef` 只在项目切换/清理时递增，`loadIssues()` 自己开始新请求时不递增。同一 repo 下用户快速触发 refresh 或 lazy load 时，较早请求仍可能覆盖较晚结果。
   - 为什么是质量问题：代码表面上有序列号保护，但语义只覆盖 repo 切换，不覆盖同一 repo 的请求先后顺序；这种“看起来有 guard，实际 guard 不完整”的状态代码对维护者不友好。
   - 优化建议：每次真正发起 issue 请求前递增并记录本次 `loadSeq`，所有响应、错误和 finally 都只在 `loadSeq` 仍是最新值时写状态。
   - 自动修复：已在发起请求前递增 `issueLoadSeqRef.current`。

### 低

未发现需要单独列出的低严重度问题。

## 7. 正向观察

- `e4f22ba6` 将 settings/bootstrap 多次请求收敛成 WS bootstrap payload，并把前端缓存集中在 `settings-bootstrap-cache.ts`，方向上符合仓库 WebSocket-first 规则。
- `771e2932` / `9663abc6` 在 preview 选择流中引入 `SelectionInfo` clone 和 annotation 列表，状态所有权集中在 `usePreviewSelection`，没有把 annotation 状态散到多个组件。
- extension 版本号在 `extension/manifest.json`、`extension/preview-runtime.js`、`packages/shared/preview/preview-runtime.js` 保持一致，符合 extension guide。
- `0b3f681b` 的质量修复提交整体偏小，主要是把 agent selector/run config 的 live apply 边界收紧，未继续扩大前一天的结构问题。

## 8. Review 建议

人工 review 今天建议重点看四类问题：

- preview 多 transport 消息是否每个模式都闭环，尤其是 `toolbar-action`、favicon/title、cursor 这类跨 runtime 事件。
- selection popover 的职责边界是否已经足够清楚，后续 preview 特化 UI 是否应继续放在 details 子组件里。
- bootstrap 请求聚合是否保持“减少请求数量”和“限制并发尖峰”的平衡。
- welcome GitHub issue/PR 缓存是否存在其他同类竞态，例如 force refresh 与 lazy load 同时发生时的状态覆盖。

## 9. 自动修复与 PR

- 触发原因：总分 84，小于 90，按规则自动修复。
- 修复分支：`codex/quality-fix/2026-06-11`
- 修复提交：`91ead635228926ce990ca8e60209a8960f993cd4`
- 修复摘要：
  - extension transport 补齐 `atmos-preview:toolbar-action` 分发。
  - `SelectionPopoverDetails` 承接 details/action UI，降低 `SelectionPopover` 主组件体量与职责混合。
  - workspace bootstrap 改为 bounded concurrency。
  - issue lazy load 每次请求递增序列号，避免同 repo 旧响应覆盖新状态。
- 验证：
  - `bun --filter web typecheck`：通过。
  - `cargo check -p api`：通过，存在既有 dead_code warning：`crates/core-service/src/service/automation/agents.rs` 的 `resolve_interactive_automation_agent` 未使用，与本次改动无关。
  - `git diff --check`：通过。
  - `rustfmt --edition 2021 --check apps/api/src/api/ws/router/project.rs`：通过。
  - `cargo fmt --check`：失败，失败文件位于 `crates/core-service/src/service/automation/*` 与 `crates/infra/src/db/migration/*`，不是本次改动文件；已用文件级 rustfmt 检查覆盖本次 Rust 修改。
- PR URL：https://github.com/AruNi-01/atmos/pull/126
- PR label：已添加 `codex`；仓库中未找到 `codex-automation` label，已按规则跳过。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/code/result/2026-06-12_08-10-10_score-84_ATMOS_CODE_QUALITY_REVIEW.md`

## 11. 结果提交与推送

- 结果文件初始提交 hash：`f184fdd1ae871f447239b6f347bb3a9529852e8f`
- 推送目标分支：`origin/codex/quality-fix/2026-06-11`
- 推送状态：已推送。
- PR URL：https://github.com/AruNi-01/atmos/pull/126
- PR label：已添加 `codex`；仓库中未找到 `codex-automation` label，已按规则跳过。
