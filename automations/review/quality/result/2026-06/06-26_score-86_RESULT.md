# Atmos main 每日代码质量评分：2026-06-26

## 1. 审查范围

- 时间窗口：UTC+8 2026-06-25 00:00:00 至 2026-06-25 23:59:59。
- 分支：同步后的 `main`。
- 排除提交：`743c8225 docs: add code quality review result 2026-06-25 score 88`，该提交只修改 `automations/review/quality/result/` 结果文件。

被审查提交：

| hash | author | message |
| --- | --- | --- |
| `60519e7f` | AarynLu | `refactor: share cli updater logic` |
| `20374521` | AarynLu | `fix: install checked cli release` |
| `31918cdc` | AarynLu | `fix: fail invalid cli install result` |
| `a8de1d16` | AarynLu | `fix: satisfy rust ci` |
| `4ab40737` | AarynLu | `fix: address linux clippy` |
| `77de9546` | AarynLu | `fix: address token usage clippy` |
| `f23e941f` | AarynLu | `fix: address diagnostics clippy` |
| `7886d3f4` | AarynLu | `fix: update infra migration test` |
| `57e91ba6` | AruNi_Lu | `Merge pull request #136 from AruNi-01/codex/quality-fix/2026-06-25` |
| `ee79fe57` | AarynLu | `fix: refine pr modal file changes scrolling` |
| `74a79424` | AarynLu | `feat: improve github modal interactions` |
| `ac9fe4df` | AarynLu | `Refactor Atmos runtime and frontend integrations` |
| `07d2701f` | AarynLu | `refactor: reuse agent fix toolbar in review actions` |

备注：`57e91ba6` 是合并提交，本身没有额外文件 diff；相关代码内容已由其子提交覆盖审查。

## 2. 一份好代码应该是什么样

本次按“职责边界清楚、分层方向正确、控制流可追踪、体量与职责匹配、重复规则集中、工程卫生稳定”的标准评分。复杂功能可以有复杂实现，但新增代码应让维护者快速判断状态归属、UI 渲染归属、业务 prompt 组装归属，以及后续要修改哪一层。

## 3. 评分方法

- 100 分制。
- 设计与分层 30 分，可读性与复杂度 25 分，体量与内聚 20 分，可维护性与复用 15 分，工程卫生 10 分。
- 高严重度问题通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一问题不重复扣分。
- 体量阈值作为风险信号使用：800 行以上 UI 文件通常需要重点关注；如果大文件继续混合数据、状态、渲染、DOM 协调和 prompt 构造，会进入扣分。

## 4. 总分

总分：86 / 100。

总体判断：良好。Rust 侧多处改动在收敛接口和复用逻辑，质量方向正确；主要扣分来自 Web GitHub modal/Agent Fix 交互把新增状态协调和 prompt source 构造继续塞进已有大组件，后续维护成本被放大。

## 5. 分项评分

- 设计与分层：24 / 30。`ActionsDetailModal.tsx` 和 `PRDetailModal.tsx` 在 UI 渲染中直接承载 Agent Fix context、prompt source、滚动/hover 状态机；Rust CLI 更新逻辑迁到 `runtime-manager` 是正向分层。
- 可读性与复杂度：21 / 25。GitHub Actions jobs/steps 渲染、PR sticky header wheel 边界处理和 Agent Fix settings 打开状态交织在 modal 主路径中，阅读时需要跨多个状态位追踪。
- 体量与内聚：17 / 20。`ActionsDetailModal.tsx` 从 421 行放大到 1089 行，`PRDetailModal.tsx` 保持 1000 行以上，`PRFilesTab.tsx` 增至 572 行；其中部分增长来自合理功能，但拆分点明显。
- 可维护性与复用：14 / 15。Agent Fix 基础组件有复用意识，`AgentFixToolbarPrimitive` 方向正确；但 workspace/project context 解析在多个调用方重复。
- 工程卫生：10 / 10。已跑 `bun --filter web typecheck`、相关前端测试和 `cargo test -p runtime-manager -p atmos --lib`，未发现本次改动引入的明确工程卫生问题。

## 6. 主要问题清单

### 高：Actions detail modal 同时承载数据适配、job/step 展开、Agent Fix prompt source 和底部操作条

- 提交：`74a79424`、`ac9fe4df`
- 文件：`apps/web/src/features/github/components/ActionsDetailModal.tsx`
- 证据：主组件内新增 `ActionJob`/`ActionStep` 类型、`expandedJobIds`、`selectedStepKey`、`openAgentFixSettingsSourceId`、`buildJobAgentFixSource`、完整 Jobs/Steps JSX，以及 `ActionsActionBar` hover/animation 状态；文件最终达到 1089 行。
- 为什么是质量问题：这个 modal 的职责从“展示一个 Actions run”扩张为“run 数据适配 + job 树状态机 + step 元数据面板 + Agent Fix prompt 构造 + 底部 hover 工具条”。后续修改任一子行为都要进入同一个大文件，状态耦合点太多。
- 优化建议：把 `ActionJob`/`ActionStep` 类型放到 feature-local 类型文件；把 Jobs 列表、step row、step meta、GitHub step URL 逻辑拆成 `ActionsJobsList`；把底部 hover action bar 拆成 `ActionsActionBar`；modal 只保留数据获取、run fallback 和顶层弹窗布局。

### 中：PR detail modal 内联滚动头部控制和 Agent Fix prompt source 构造，继续放大巨型组件

- 提交：`ee79fe57`、`ac9fe4df`
- 文件：`apps/web/src/features/github/components/PRDetailModal.tsx`
- 证据：`mainScrollRef`、`prContextRef`、`ResizeObserver`、`handleMainScroll`、`handleMainWheelCapture`、`handleFilesCodeViewTopBoundaryWheel` 与 PR timeline/rendering/merge/comment actions 同文件存在；文件最终约 1150 行。
- 为什么是质量问题：滚动边界控制是独立 UI 行为，和 PR conversation/timeline 业务渲染无强绑定。把它留在主 modal 里会让后续调整 files tab、header sticky 行为或 timeline 渲染时互相干扰。
- 优化建议：把 sticky PR context header 的 refs、height measurement、scroll/wheel handlers 和 reset 行为抽成 `usePrContextHeader(activeMainTab)`；主组件只接收 `mainScrollRef`、`prContextRef` 和三个 handler。后续可继续把 timeline row 渲染拆出。

### 低：Agent Fix context 解析在多个调用方重复

- 提交：`ac9fe4df`
- 文件：`apps/web/src/features/github/components/ActionsDetailModal.tsx`、`apps/web/src/features/github/components/PRDetailModal.tsx`、`apps/web/src/features/diff/components/useDiffPromptStash.tsx`
- 证据：三个位置都重复读取 `useContextParams()`，再把 `workspace`/`project` 映射为 `AgentFixContextRef`。
- 为什么是质量问题：这是相同规则的重复实现，未来如果 Agent Fix 支持新的 context scope 或禁用语义变化，容易出现调用方分叉。
- 优化建议：新增 `useAgentFixContext()`，把 `currentView`/`effectiveContextId` 到 `AgentFixContextRef | null` 的映射集中到 `features/agent-fix/hooks/`，调用方只消费结果。

## 7. 正向观察

- CLI 更新逻辑从 `apps/cli/src/commands/update.rs` 大幅迁出到 `crates/runtime-manager/src/cli_update.rs`，让 CLI 和 API 安装路径共享同一实现，方向正确。
- `GithubIssueListOptions`、`CreateAgentRunParams`、`FinalizeFixAgentRunInput` 等参数对象减少了长参数列表，提升了调用端语义。
- `AgentFixToolbarPrimitive`、`AgentFixToolbar`、`AgentFixButton` 的分层基本清楚，说明新增 Agent Fix 能力已有可复用基座。
- 新增 prompt builder 测试覆盖了 PR review thread、完整 review 和 CI job prompt 三类核心场景。

## 8. Review 建议

人工 review 最值得看三点：

- GitHub modal 是否还有可明显拆出的 timeline row、review thread 或 file comment 子组件。
- Agent Fix prompt source 是否继续保持 source-owned，不要把 GitHub/Actions 特有数据下沉到通用组件。
- `runtime-manager` CLI 安装结果校验是否满足所有平台，尤其是 release asset 缺失和安装后二进制版本读取失败路径。

## 9. 自动修复与 PR

已触发自动修复，因为总分低于 90。

- 修复分支：`codex/quality-fix/2026-06-26`
- 修复提交：`3e2c4cce refactor: improve daily quality findings`
- PR：https://github.com/AruNi-01/atmos/pull/137
- 标签：已添加 `codex`；仓库未发现 `codex-automation`，因此跳过。
- 修复摘要：新增 `useAgentFixContext()`；拆出 `ActionsActionBar`、`ActionsJobsList`、`actions-detail-types`；新增 `usePrContextHeader()`；更新调用方使用共享 hook。
- 验证：
  - `bun --filter web typecheck` 通过。
  - `bun test apps/web/src/features/github/lib/__tests__/agent-fix-prompts.test.ts apps/web/src/features/github/lib/__tests__/pr-review-thread-agent-fix.test.tsx apps/web/src/features/terminal/store/__tests__/terminal-store-new-tab.test.ts apps/web/src/features/wiki/components/__tests__/agent-select.test.ts` 通过，15 个测试。
  - `bun run lint <本次改动的 7 个 Web 文件>` 通过。
  - `git diff --check` 通过。
  - `bun --filter web lint` 已尝试，但因本次范围外既有 lint 错误失败，涉及 `HostedAppShellGate.tsx`、`LocalModelDownloadProgress.tsx`、`CanvasAgentIsland.tsx`、`DiffWorkerPoolProvider.tsx`、`HostedWelcomeGate.tsx` 等文件。

## 10. 结果文件

本次结果文件路径：`automations/review/quality/result/2026-06/06-26_score-86_RESULT.md`

## 11. 结果提交与推送

- 修复分支已推送到 `origin/codex/quality-fix/2026-06-26`。
- PR URL：https://github.com/AruNi-01/atmos/pull/137
- 结果文件将随本报告提交到同一修复分支并推送；提交 hash 会在最终回复中给出，避免在报告内容中写入无法自指的提交 hash。
