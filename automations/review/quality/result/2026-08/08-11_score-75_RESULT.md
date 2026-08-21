# Atmos main 每日代码质量评分（2026-08-11）

## 1. 审查范围

- 昨日时间窗口：2026-08-11 00:00:00 到 2026-08-11 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `7d0744b6e`）。
- 排除：`aa0927b6c` docs: add code quality review result 2026-08-10 score 76；`784f6e199` docs: link quality review result to PR（仅结果归档）。
- 审查方式：以 Hub 账号安全 / Linear Tasks / Token Usage 抛光 / agent-hooks attention summary 为主线；辅以 #213 质量修复与 release/changelog。
- 用户主工作区在无关 feature 分支；修复在独立 worktree `grokbuild/quality-fix/2026-08-11`。

被审查提交（节选代表性；窗口内业务/代码提交约 34 条，不含结果归档）：

| Hash | Author | Message |
| --- | --- | --- |
| `4f34e2a4a` | AarynLu | feat(hub): account linking, sessions, OAuth start, and delete user |
| `6c0966e01` | AarynLu | feat(hub-client): expose account security APIs and OAuth helpers |
| `b092a7275` | AarynLu | feat(web): Hub Account security UI and auto device after login |
| `f0ee3937d` | AarynLu | feat(linear): tighten Hub-backed credentials and task/workspace flows |
| `a3abfcb07` | AarynLu | feat(web): polish token usage dialog and model icon tests |
| `ca0843f0f` | AarynLu | feat(ui): dither morph transitions and sliding metric components |
| `3421841b5` | AruNi_Lu | feat(agent-hooks): unattended need-attention auto-summary on AI input |
| `f96213c40` … `f3c0d531f` | AruNi_Lu | fix(agent-hooks): race / revision-safe dismiss / due-scan lock |
| `abf11efc3` | AarynLu | feat(hub): mobile pair claim flow and hub-client device helpers |
| `e812ad501` | AarynLu | feat(mobile): hub device pair QR and credential-based auth |
| `1d0fb30b2` | AarynLu | feat(ui): QR code, motion action-swap, and sliding metric morph fixes |
| `82731d992` | AarynLu | feat(web): hub auth shells, linear tasks, pair QR, token usage cycle toolbar |
| `46e50ba84` | AarynLu | feat(api): hub-backed Linear credentials on WS routes |
| `d2d92525e` | AarynLu | fix(web): move hub-auth BroadcastChannel constants off page modules |
| `bdeac913f` | AarynLu | feat(web): beui Task source tabs and warmer GitHub tab cache |
| `5f0747600` | AarynLu | fix(web): polish token metrics and remove GitHub list footer hint |
| `7d0744b6e` | AarynLu | refactor(web): polish Code Agent Behaviour settings UI |
| `03ab7795e` | AarynLu | refactor: address daily quality findings for 2026-08-10 |
| （其余） | — | clippy/CI、desktop release、landing changelog、APP-057 TECH 等 |

日合计约 **189 files / +17k / −3.6k**（排除 quality result）。

## 2. 一份好代码应该是什么样

本日标准看「大面增量是否把边界切清」。Hub 路由应把校验/领域逻辑放在模块里，worker `fetch` 只做编排；Welcome/Task 的 Linear 链路应与 GitHub 列表状态解耦；Token Usage / Settings 的视图块应可独立打开修改；attention summary 的并发与 revision 约束必须可读且可测。只计当日引入或放大的质量问题，不把历史 800+ 行枢纽直接算到今天头上。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；同一问题不重复扣分。
- 体量阈值仅作信号：单文件 500–800 中风险、800+ 高风险（常量表/生成代码除外）；单组件 250+ 中风险。

## 4. 总分

总分：**75/100**。总体判断：**良好**。

Hub / agent-hooks 后端拆分与竞态测试质量高；Web 侧同日继续放大 Welcome 巨型 hook、Token Usage 页与 Settings Behaviour 枢纽，维护成本明显上升。#213 质量修复与 BroadcastChannel 常量抽出为正向。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | 正向：`user-security` / `mobile-pair` / `oauth-start` / `desktop-auth` / `require-user` 模块化；attention 拆 `attention.rs` + `attention_summary*.rs`；Linear Hub credentials 分层。扣分：Welcome project context 把 GitHub+Linear+prefill+name/branch 主权全绑在一个 hook；`CodeAgentSettingsSection` 用超大 props 面承载 Behaviour；`packages/hub/src/index.ts` 仍为 900+ 行 path 编排（OAuth start 内联 ~170 行）。 |
| 可读性与复杂度 | 18/25 | Welcome `linkType`/`linearPreview`/`prPreview`/`issuePreview` 交叉 effect 决定 name/branch 归属，阅读成本高；`TokenUsagePage` 主页面数据装配 + 巨型 `OverviewTab` 属性表（~40 props）；`TaskLinearPanel` 同文件混 auth status / filter / list / drawer / workspace 动作。 |
| 体量与内聚 | 11/20 | 当日放大：`use-welcome-project-context` 555→1121（+566）；`TokenUsagePage` 1091→1503（+412）；`CodeAgentSettingsSection` 498→802（+304）；`hub/index.ts` 452→925（+473）。新建 `TaskLinearDrawer` ~413、`HubSecuritySettingsCards` ~494（已有子卡片，略好）。 |
| 可维护性与复用 | 13/15 | 正向：`packages/ui` QR / ActionSwap / SlidingMetric；Linear draft 与 sessionStorage 键散落多处；Task Linear 未对齐前日 GitHub 的 `task-*-panel-model` 模式。扣 2：`atmos.pendingLinearLink` 魔法字符串多点复制。 |
| 工程卫生 | 9/10 | 正向：agent-hooks 竞态单测、hub security tests、BroadcastChannel 常量文件。扣 1：Settings/Token Usage 体量抛光提交未同步拆文件，留下「功能合入后再拆」痕迹。 |

## 6. 主要问题清单

### 中高：`useWelcomeProjectContext` 升至 ~1121 行、37 个 `useState`

- 提交：`f0ee3937d`、`82731d992`、`bdeac913f` 等
- 文件：`apps/web/src/features/welcome/hooks/use-welcome-project-context.ts`
- 问题：在既有 GitHub issue/PR 上下文上叠 Linear 列表加载、预填、name/branch 主权 effect，return bag ~60 字段；`loadLinearIssues` / `handleSelectLinear` / Task draft prefill 同文件。
- 为什么是质量问题：改 Linear 分页或改 GitHub URL 预览都要加载整份 Create 上下文状态机。
- 优化建议：抽出 `welcome-linear-link.ts`（draft/常量）+ `useWelcomeLinearIssues`（列表加载）；中期把 name/branch 主权收敛成纯函数 `resolveWorkspaceIdentity({ issue, pr, linear, touched })`。

### 中高：`TokenUsagePage` 单文件 ~1503 行（`OverviewTab` ~600 行 / ~40 props）

- 提交：`a3abfcb07`、`82731d992`、`5f0747600`、`ca0843f0f`
- 文件：`apps/web/src/app-shell/TokenUsagePage.tsx`
- 问题：Cycle toolbar、loading tips、agent/model icons、数据装配与 Overview 图表渲染同居；`OverviewTab` 参数列表过长。
- 为什么是质量问题：改 sliding metric 或 heatmap 需要打开整页数据编排。
- 优化建议：`TokenUsageOverviewTab.tsx` 承载图表视图；icons 与 cycle chrome 可再下沉。

### 中：`CodeAgentSettingsSection` +304 行 Behaviour（idle + attention summary）

- 提交：`3421841b5`、`7d0744b6e`
- 文件：`apps/web/src/features/settings/components/CodeAgentSettingsSection.tsx`
- 问题：~50 个 props 的注册表式接口 + Behaviour 折叠面板与内置/自定义 agent 列表混在同一组件。
- 为什么是质量问题：改 summary agent 选择器与改 custom agent CRUD 交叉。
- 优化建议：`CodeAgentBehaviourSettingsSection.tsx` 仅接收 Behaviour 相关 props；SettingsModal 可逐步改为分组 props。

### 中：`TaskLinearPanel` ~662 行且无 panel-model

- 提交：`f0ee3937d`、`82731d992`、`bdeac913f`
- 文件：`apps/web/src/features/task/components/TaskLinearPanel.tsx`
- 问题：auth 解析、filter/query、分页、drawer、Create workspace 同组件；`PAGE_SIZE` 内联，未复用前日 GitHub 的 model 抽出模式。
- 优化建议：`task-linear-panel-model.ts` 放 `TASK_LINEAR_PAGE_SIZE`；中期 `useTaskLinearAuthStatus` 下沉 status query。

### 中：`packages/hub/src/index.ts` 仍 ~925 行（OAuth start 内联）

- 提交：`4f34e2a4a`、`abf11efc3` 等
- 文件：`packages/hub/src/index.ts`（已拆 `user-security` / `oauth-start` helpers，但 handler 仍巨大）
- 问题：`/v1/oauth/start` 约 170 行内联在 `fetch`。
- 优化建议：`handleOAuthStart(request, env)` 整段下沉到 `oauth-start.ts`；`fetch` 只保留路由表。

### 低：`atmos.pendingLinearLink` 魔法字符串多点

- 提交：`f0ee3937d` 等
- 文件：`open-task-workspace-create.ts`、`use-welcome-project-context.ts`、`WelcomePage.tsx`、`TaskLinearPanel` 注释
- 优化建议：集中 `PENDING_LINEAR_LINK_STORAGE_KEY` + read/write/clear helpers。

## 7. 正向观察

- **Hub 模块化**：`user-security`、`mobile-pair`、`desktop-auth`、`oauth-start`、`require-user` + 配套测试，方向正确。
- **agent-hooks attention summary**：独立模块、begin/complete/fail/stale generation、`clear_not_after` 等竞态有单测闭环。
- **UI 原语**：`packages/ui` QR、ActionSwap、SlidingMetric、dither morph 可复用。
- **#213 落地**：TemplateFormFields + `task-github-panel-model` 继续消化 08-10 Tasks 债。
- **BroadcastChannel 常量**（`d2d92525e`）避免 page module 副作用。
- **Linear 凭证**：Hub OAuth vs local API key 的 `resolveLinearCredentialSource` 边界清晰。

## 8. Review 建议

1. Welcome Linear 与 GitHub 共绑时 name/branch 优先级（PR head 优先）是否与产品一致。
2. Attention summary：新 turn / dismiss / due-scan 是否仍会写 stale 行。
3. Hub OAuth start（link_ticket 临时 session）与 Active Sessions 列表是否泄漏临时会话。
4. Token Usage cycle toolbar + Overview 大数据集渲染性能。
5. 新建/放大的 600–1100 行 Web 枢纽是否继续出现。

## 9. 自动修复与 PR

总分 75 < 90，已触发自动修复。

### 修复摘要

1. **`TokenUsageOverviewTab.tsx`**：抽出 Overview 图表视图 + agent/model icons + forceOneDecimal；`TokenUsagePage` ~1503→~700。
2. **`CodeAgentBehaviourSettingsSection.tsx`**：抽出 Idle + Need-attention Behaviour 折叠；`CodeAgentSettingsSection` ~802→~520。
3. **`welcome-linear-link.ts`**：`linearIssueToDraft`、`LINEAR_OPEN_STATE_TYPES`、`WELCOME_LINK_LIST_PAGE`。
4. **`pending-linear-link.ts`**：统一 `PENDING_LINEAR_LINK_STORAGE_KEY` 与 read/write/clear；Welcome / open-task 改用 helper。
5. **`task-linear-panel-model.ts`**：`TASK_LINEAR_PAGE_SIZE`（对齐 GitHub panel-model 模式）。

### 验证

- `bun --filter web typecheck`：通过
- `git diff --check`：通过

### 剩余风险

- `use-welcome-project-context` 仍 ~1084 行（仅抽出 draft/常量，未拆 Linear list hook / identity 纯函数）。
- `TaskLinearPanel` 仍大；未拆 auth status hook。
- Hub `fetch` OAuth start 仍内联。
- `CodeAgentSettingsSection` props 面仍大（SettingsModal 未改分组传参）。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-11_score-75_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-11`
- 修复提交：`3bfd732d8`（报告回填 `4e604e5a5`）
- PR URL：https://github.com/AruNi-01/atmos/pull/217
