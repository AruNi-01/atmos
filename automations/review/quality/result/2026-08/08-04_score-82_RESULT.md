# Atmos main 每日代码质量评分（2026-08-03）

## 1. 审查范围

- 昨日时间窗口：2026-08-03 00:00:00 到 2026-08-03 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（`origin/main` tip `bf47ade70`）。本地工作区有无关 feature 分支未提交改动，审查与修复在独立 worktree 上完成，未覆盖用户改动。
- 排除：窗口内无「只改 `automations/review/quality/result/`」的 automation 归档提交。
- 审查方式：以日终净 diff 与关键提交链为主（local-services 进程树、agent attention、agent hooks child lifecycle、terminal split prefs、GitHub UI、landing 等）。

被审查提交（27）：

| Hash | Author | Message |
| --- | --- | --- |
| `f79f7f4a6` | AarynLu | feat(local-services): escalate stop with process-tree confirmation |
| `5ba4861e2` | AarynLu | feat(terminal): persist default split agent and apply to new tabs |
| `fc894e958` | AarynLu | feat(web): unify right sidebar GitHub visibility under one tab |
| `d9534f658` | AarynLu | fix(desktop): show correct version channel and Settings app version |
| `092c86eba` | AarynLu | fix(web): lower GitHub detail toolbars and unify open label |
| `36459b5ee` | AarynLu | fix(web): polish GitHub sidebar layout and discussion UI |
| `d99d2a80b` | AarynLu | feat(web,desktop): agent need-attention UX and smarter notifications |
| `5f66e0970` | AarynLu | feat(web): use thinking-orbs for footer agent status icon |
| `19cfeabe8` | AarynLu | fix: address CI format and clippy failures |
| `06882520b` | AarynLu | fix: restore Footer.tsx accidental thinking-orbs change |
| `dcf5a0196` | AarynLu | chore(web): remove unused thinking-orbs dependency |
| `3ba99ce52` | AarynLu | fix(web): fully restore footer agent status indicator |
| `16f1cc45d` | AarynLu | fix: address cubic P1 review findings for process tree and attention |
| `c7fdab751` | AarynLu | fix: gate unused Command import in scanner for Linux Clippy |
| `b4f4bdd41` | AarynLu | fix: harden process-tree stop and address attention/a11y review P2s |
| `2f57954bd` | AarynLu | fix: address valid PR review findings (settings, attention, local-services) |
| `09fa97353` | AarynLu | fix(hooks): defer lead idle until child agents finish |
| `8e5c1acfd` | AarynLu | fix(github): normalize PR list state casing so Open PRs show Open badge |
| `1897e245b` | AarynLu | feat: local-services live refresh and GitHub timeline commits |
| `7d0453995` | AarynLu | fix(github): add yellow running segment and smooth PR checks ring animation |
| `55bcbf1e3` | AarynLu | fix: address CI failures — typecheck promise + clippy args |
| `be5c51083` | AarynLu | fix: review thread safety — process group kill + agent child lifecycle |
| `992120553` | AarynLu | chore: add husky pre-commit and conventional commit-msg hooks |
| `a2df7d971` | AruNi_Lu | Merge pull request #195 from AruNi-01/atmos/muk |
| `28f65326a` | AarynLu | fix(landing): hide mobile side rails and cap feature sphere height |
| `0e0b52218` | AruNi_Lu | Merge pull request #197 from AruNi-01/fix/landing-mobile-rails-sphere-height |
| `bf47ade70` | AarynLu | chore: add NOTICE for third-party assets and vendored code |

## 2. 一份好代码应该是什么样

本次标准看「维护者能否低成本理解状态机、安全边界和修改入口」。跨进程杀树、agent 子生命周期、attention 过滤这类复杂域，应把纯规则、服务编排和 UI 订阅拆开；新增大文件必须用清晰模块换来可导航性；同一语义的乐观写/竞态令牌不要在多个 setter 里各写一套；同日引入又撤回的依赖应尽量避免污染主路径历史。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低严重度分别约扣 8–15 / 3–7 / 1–2 分；同一根因不重复计数。
- 体量阈值作信号：服务文件 800+、UI/hook 400+、单函数 80+ 且职责混杂时才明确扣分。

## 4. 总分

总分：82/100。总体判断：良好。进程树安全模型、attention store、child idle 测试与 review 跟进质量高，但 `agent_hooks` 服务继续膨胀、terminal split prefs 竞态令牌重复、通知 hook 夹带 toast JSX，构成需要尽快收敛的结构债。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25/30 | process tree 分层清晰（engine 杀进程 / service 候选与安全 / UI 确认）；attention 独立 store 合理。`agent_hooks` 子生命周期状态机仍嵌在 1100+ 行服务实现中，仅抽了 payload helper（`09fa97353` 等）。 |
| 可读性与复杂度 | 20/25 | `update_state` 多 `StateUpdateKind` 分支 + pending idle 竞态注释可读但长；`terminal-split-prefs-store` 五个 request token + hydrate generation 主路径难扫（`5ba4861e2`/`2f57954bd`）；`use-agent-notifications` 同时订 3 类事件并拼 toast JSX（`d99d2a80b`）。 |
| 体量与内聚 | 15/20 | 日终 `agent_hooks.rs` ~1388 行（含测试）；`terminal-split-prefs-store.ts` 437 行；`use-agent-notifications.tsx` 349 行。进程树相关文件拆分尚可（`process.rs` 564、`process_tree.rs` 391、dialog 217）。 |
| 可维护性与复用 | 13/15 | split prefs 多个 setter 重复乐观写/回滚/hydrate 模式；GitHub 时间线 commits 抽了 `timeline-commits.ts` 是正向。 |
| 工程卫生 | 9/10 | 大量 review/CI 跟进与 child idle 单元测试扎实；同日 `thinking-orbs` 引入又完整撤回（`5f66e0970`→`dcf5a0196`/`3ba99ce52`）属过程抖动。 |

## 6. 主要问题清单

### 中：Agent hooks 子生命周期状态机堆在超大服务文件中

- 提交：`09fa97353`、`be5c51083`（及相关 provider 适配）
- 文件：`crates/core-service/src/service/agent_hooks.rs`（日终约 1388 行）；`child_agent.rs` 仅 ~59 行 payload helper
- 问题：新增 `active_children` / `pending_terminal_idle` / `force_closed_sessions` 与 `handle_child_lifecycle`、`handle_child_origin_event`、`arm_pending_terminal_idle`、`touch_session_activity` 等逻辑，和既有 `update_state` 挤在同一 impl。语义正确且有充分单测，但模块边界仍是「一个服务文件吞掉所有状态机」。
- 为什么是质量问题：后续改子 agent 完成语义或 QuietIdle 规则时，必须在超长文件中与 NewTurn/ForcedIdle/suppress 窗口交叉阅读，回归成本高。
- 优化建议：把 child lifecycle / pending terminal idle 相关方法拆到 `agent_hooks/child_lifecycle.rs` 的 `impl AgentHooksService`；`child_agent.rs` 继续只放 payload 纯函数；`update_state` 保留在主文件但只调用已抽方法。

### 中：terminal split prefs store 竞态令牌与 setter 模式重复

- 提交：`5ba4861e2`、`2f57954bd`、`55bcbf1e3`
- 文件：`apps/web/src/features/settings/store/terminal-split-prefs-store.ts`（约 437 行）
- 问题：`loadRequestToken` / `enabledRequestToken` / `agentIdRequestToken` / `runConfigRequestToken` / `applyToNewTabRequestToken` + `hydrateGeneration` 并行；每个 setter 各自乐观更新、persist、回滚、必要时 re-hydrate。正确性取向明确，但抽象层不足。
- 为什么是质量问题：新增第 5、第 6 个偏好字段时极易漏拷令牌检查或回滚分支，且阅读成本高。
- 优化建议：抽 `withOptimisticPersist({ tokenRef, read, write, apply, rollback })` 或统一「单字段 persist 助手」，setter 只描述字段差异；纯解析/默认值继续留在 `terminal-split-prefs.ts`。

### 中：通知订阅 hook 夹带 toast UI 拼装

- 提交：`d99d2a80b`
- 文件：`apps/web/src/features/agent/hooks/use-agent-notifications.tsx`（约 349 行）
- 问题：同一 hook 订阅 system / automation / agent_hook_state_changed，并在回调内直接构造带 `AgentIcon` 与 Jump 按钮的 toast JSX。
- 为什么是质量问题：WS 订阅生命周期与展示拼装耦合，改 toast 布局需要动订阅文件，也不利于复用/单测 toast 文案结构。
- 优化建议：抽 `showAgentHookStateToast(...)`（或小组件）到 `features/agent/lib/`；hook 只负责事件差分与 settings 门闩。

### 低：同日 thinking-orbs 引入与撤回

- 提交：`5f66e0970` → `06882520b` / `dcf5a0196` / `3ba99ce52`
- 文件：`apps/web/src/app-shell/Footer.tsx`、`apps/web/package.json`
- 问题：footer agent 状态图标先接 thinking-orbs，随后完整还原并移除依赖。
- 为什么是质量问题：不改变日终行为，但增加噪声提交与审查负担。
- 优化建议：实验性 UI 依赖在独立分支验证后再合 main；或同日 squash 掉无效中间态。

## 7. 正向观察

- **Process-tree stop 安全模型扎实**：`process_tree.rs` 明确 protected / same-user / launcher 候选；engine 侧 process-group kill；UI 二次确认对话框职责单一；多轮 review（P1/P2）持续收口。
- **Agent attention**：独立 `agent-attention-store` + selectors + 测试；Header bell / sidebar 过滤 / terminal chrome 指示器边界清楚。
- **Child idle 语义有测试网**：deferred idle、last child flush、force-closed 不 revive、QuietIdle 不二次通知等用例齐全。
- **GitHub**：sidebar 单 tab 收敛减配置面；timeline commits 纯函数 + 组件；Checks ring 动画拆 `buildArcs` / `useAnimatedCounts`。
- **Local services live refresh**：event-bridge policy 有测试，query invalidation 路径清晰。
- **工程基建**：husky + conventional commit-msg；NOTICE 第三方资产声明。

验证记录：

- 审查：日终 tip `bf47ade70`；重点读 process/process_tree、agent_hooks、attention store、split prefs、notifications。
- 自动修复后：`cargo test -p core-service --lib service::agent_hooks`（含 child lifecycle）通过；`agent-attention-store.test.ts` 9 pass。

## 8. Review 建议

人工 review 今日最值得盯：

1. Process-tree stop：推荐 root 是否过宽/过窄；group kill 在 macOS/Linux 权限失败时的降级与文案。
2. Agent child idle：Task/Subagent 乱序、lead 已 Idle 后子启动 QuietIdle 路径、ForcedIdle 后 late SubagentStart。
3. Attention：focus 清除与 sessionId alias、filter mode 空集行为、桌面通知点击跳转。
4. Terminal default split agent：连接切换 `resetForConnectionChange` 是否丢弃过期 hydrate。

## 9. 自动修复与 PR

已触发自动修复（总分 82 < 90）。

### 修复摘要

1. 新增 `crates/core-service/src/service/agent_hooks/child_lifecycle.rs`：迁出 `handle_child_lifecycle` / `handle_child_origin_event` / pending idle arming / activity touch 等 `impl AgentHooksService` 方法；`agent_hooks.rs` 日终主文件从 ~1388 行降至 ~1109 行（含测试）。
2. 新增 `apps/web/src/features/agent/lib/agent-hook-toast.tsx`：`showAgentHookStateToast`；`use-agent-notifications.tsx` 只保留订阅与 settings 门闩（约 264 行）。
3. 未强行重构 terminal-split-prefs 五令牌模型（行为敏感、收益/风险比一般），留作后续专项。

### 验证

- `cargo test -p core-service --lib service::agent_hooks`：通过（含 deferred idle 相关 11 个核心用例 + provider 套件）。
- `bun test apps/web/src/features/agent/store/agent-attention-store.test.ts`：9 pass。
- 完整 web monorepo 测试受 worktree 依赖链接限制未全跑；CI 应覆盖。

### 剩余风险

- `update_state` 仍偏长，未继续拆 NewTurn/TerminalIdle 分支表。
- terminal-split-prefs setter 重复模式未改。
- toast 抽取后需确认打包/JSX runtime 在 web 过滤下无回归。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/review/quality/result/2026-08/08-04_score-82_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-03`
- 结果文件与修复同分支推送；PR base：`main`
- PR URL / 提交 hash 在 push 与 `gh pr create` 后回填。
