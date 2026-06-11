# Atmos Main 每日代码质量评分

## 1. 审查范围

- 昨日时间窗口：2026-06-10 00:00:00 到 2026-06-10 23:59:59（UTC+8，Asia/Shanghai）
- 已同步分支：`main` 已快进到 `771e2932`
- 被审查提交：
  - `87849e8e` Refine agent run config selection and display，作者 AarynLu
  - `0ff0a32f` refactor(preview): show input card directly on element select，作者 AarynLu
- 已排除提交：
  - `7df964d1` docs: add code quality review result 2026-06-10 score 92，仅新增 `automations/code/result/` 结果文件

## 2. 一份好代码应该是什么样

本次按“边界清楚、控制流可追、体量服务职责、协议和配置只有一个可信来源、错误路径稳定可恢复”的标准评分。好的提交不只是能跑通，还要让后续维护者容易判断状态归属、配置归属、跨层协议归属，以及在哪里安全地扩展。

## 3. 评分方法

- 100 分制。
- 设计与分层 30 分：职责边界、模块耦合、分层方向、抽象贴合度。
- 可读性与复杂度 25 分：控制流、状态管理、分支复杂度、理解成本。
- 体量与内聚 20 分：文件、函数、组件规模是否匹配职责。
- 可维护性与复用 15 分：重复逻辑、共享规则、配置和协议集中度。
- 工程卫生 10 分：命名、注释、错误处理、日志、临时实现痕迹。
- 高严重度通常扣 8-15 分；中严重度通常扣 3-7 分；低严重度通常扣 1-2 分。同一问题不重复扣分。
- 体量阈值按信号使用：单 UI 组件 250 行以上需关注职责，400 行以上高风险；单函数 80 行以上中风险；单文件 500 行以上需重点检查是否职责混杂。

## 4. 总分

总分：86/100。总体判断：良好。

整体实现方向符合现有 WS-first 和 feature-local 约定，也有纯工具库承接 run config 解析与命令拼装。但 run config selector 的回调合同不够精确，settings liveApply 错误路径与 Apply 路径分叉，Rust automation resolver 的体量继续上升，给后续维护留下明显成本。

## 5. 分项评分

- 设计与分层：24/30。`87849e8e` 基本沿 `apps/api` -> `core-service` -> `infra` 方向流动，WS action 没有新增 REST；扣分主要来自 `TerminalAgentSelectorWithRunConfig` 原始非 floating 回调无法表达“正在配置哪个 agent”，以及 `crates/core-service/src/service/automation/agents.rs` 同时承载 manifest 解析、可执行文件探测、模型 catalog 缓存/执行、run config 参数拼装。
- 可读性与复杂度：21/25。新增前端工具函数让命令拼装更清楚；扣分点是 run config 草稿构造在 Apply 与 liveApply 中重复，且错误处理路径不同。
- 体量与内聚：18/20。`TerminalAgentRunConfigDialog.tsx` 与 `TerminalAgentSelectorWithRunConfig.tsx` 分别达到 400 行上下，尚能围绕单一交互，但已经接近应拆分的区域。
- 可维护性与复用：14/15。共享 manifest 是正向设计；轻微扣分来自前后端仍各自维护模型 flag/推理 flag 解释逻辑，需要后续继续收敛。
- 工程卫生：9/10。主要扣分来自 selector 原始读取 `code_agent_cli`/外层 `function_settings` 路径，与实际 `agent_cli` settings shape 不一致。

## 6. 主要问题清单

### 中：run config selector 的回调合同丢失 agent 归属

- 提交：`87849e8e`
- 文件：`apps/web/src/features/agent/components/TerminalAgentSelectorWithRunConfig.tsx`，原始证据在 `FieldProps`/`MenuProps` 的 `onRunConfigChange` 与 `handleApply`
- 相关调用：`apps/web/src/features/diff/components/review/ReviewActions.tsx` 原始 `onRunConfigChange={(nextValue) => setTerminalAgentRunConfig(terminalAgentId, nextValue)}`
- 问题描述：菜单里可以打开任意 agent 行的配置面板，但非 floating 形态只把配置值回传给调用方，不回传被配置的 agent id。调用方只能用闭包里的当前选中 agent 猜测配置归属。
- 为什么是代码质量问题：组件 UI 能表达“配置某个非当前 agent”，但类型接口不能表达这个状态，导致状态归属依赖隐式约定，后续复用时容易把配置写到错误 agent。
- 优化建议：让 field/menu/floating 三种形态统一回传 `(agentId, config)`；需要按 agent 存储的调用方传入 `runConfigByAgentId`，应用配置时同步选中 `nextAgentId`。
- 自动修复状态：已在 PR `https://github.com/AruNi-01/atmos/pull/125` 中修复。

### 中：settings liveApply 绕过 extra args 解析错误处理

- 提交：`87849e8e`
- 文件：`apps/web/src/features/agent/components/TerminalAgentRunConfigDialog.tsx`，原始证据在 `handleApply` 与 `liveApply` effect
- 问题描述：点击 Apply 时 `parseExtraArgsText` 有 try/catch；settings 中 `liveApply` effect 直接调用同一解析函数。用户输入未闭合引号时，settings 编辑器可能抛出未捕获异常。
- 为什么是代码质量问题：同一份草稿构造逻辑有两条不一致路径，错误恢复能力取决于入口，而不是取决于 run config 规则本身。
- 优化建议：抽出一个返回 `{ config, error }` 的草稿构造函数，Apply 和 liveApply 都通过它处理解析、冲突检测和错误展示。
- 自动修复状态：已在 PR `https://github.com/AruNi-01/atmos/pull/125` 中修复。

### 低：settings key 路径与声明类型不一致

- 提交：`87849e8e`
- 文件：`apps/web/src/features/agent/components/TerminalAgentSelectorWithRunConfig.tsx`
- 问题描述：selector 原始读取 `settings?.function_settings?.code_agent_cli?.saved_run_configs`，但 settings API 和 SettingsModal 使用的是内层 `agent_cli.saved_run_configs`。
- 为什么是代码质量问题：同一配置键出现两个名字和两层结构，会让保存的 run config 模板无法被 selector 稳定读取，也降低类型约束的价值。
- 优化建议：让 `function-settings-store` 直接导入 canonical `apps/web/src/api/ws/settings-api.ts` 类型，并让 selector 从 `settings.agent_cli.saved_run_configs` 读取。
- 自动修复状态：已在 PR `https://github.com/AruNi-01/atmos/pull/125` 中修复。

### 低：automation agent resolver 继续聚集多类职责

- 提交：`87849e8e`
- 文件：`crates/core-service/src/service/automation/agents.rs`
- 证据：`terminal_agent_model_catalog`、`probe_terminal_agent_model_catalog`、`build_run_config_args`、`model_flag_for_agent` 等职责集中在同一文件。
- 问题描述：本次新增把模型列表探测/缓存、JSON/行解析、run config 结构化参数和 automation agent resolution 都放进同一模块。
- 为什么是代码质量问题：当前仍可理解，但文件职责开始横跨“定义解析、运行时探测、缓存策略、命令参数规则”，后续新增 provider 时会持续拉长同一文件。
- 优化建议：后续将模型 catalog 相关逻辑拆到 `automation/model_catalog.rs`，将 run config 参数规则拆到 `automation/run_config.rs`；`agents.rs` 只保留 agent resolution 和对外 facade。
- 自动修复状态：未在本次自动修复中拆分，原因是拆 Rust 模块会扩大变更面；本次先修复已确认的前端接口和错误路径问题。

## 7. 正向观察

- `87849e8e` 沿用了 WS-first 路径，通过 `WsAction::TerminalAgentModelsGet` 进入 API router，再落到 core-service，没有新增并行 REST。
- run config 的解析、归一化、命令拼装集中到了 `apps/web/src/features/agent/lib/terminal-agent-run-config.ts`，比把规则散落在调用组件中更利于复用。
- automation run config 在 `automation` 与 `automation_run` 两层都保存快照，方向上有利于历史 run 可追溯。
- `0ff0a32f` 删除 preview runtime 中旧 toolbar/expanded 状态后，交互状态更少，控制流更直接；两个 runtime 变体的改动保持同步。

## 8. Review 建议

人工 review 今天最值得盯：

- run config 是否始终按 agent id 归属，尤其是 wiki、code review、automation 三个入口。
- settings saved run configs 是否能保存后立刻被 selector 读取。
- 未闭合 quote、重复 `--model`/reasoning flags 等错误输入是否只展示错误，不打断组件。
- Rust `agents.rs` 后续新增能力时是否需要先拆模块，避免继续扩大单文件职责。
- preview runtime 两份 JS 是否仍保持行为一致。

## 9. 自动修复与 PR

触发原因：总分 86，小于 90，按规则自动进入修复流程。

- 修复分支：`codex/quality-fix/2026-06-10`
- 修复提交：`0b3f681b949ac851fcd376d502a169b85108cdee`
- PR：`https://github.com/AruNi-01/atmos/pull/125`
- 修复摘要：
  - `TerminalAgentSelectorWithRunConfig` 的 field/menu/floating 回调统一携带 `agentId`。
  - `AgentSelect`、wiki、code review、diff review toolbar 调用方改为按 `nextAgentId` 存储配置，并同步选中 agent。
  - `TerminalAgentRunConfigContent` 抽出统一草稿构造函数，Apply 和 liveApply 共用解析与冲突错误处理。
  - `function-settings-store` 改用 canonical settings API 类型，selector 读取 `agent_cli.saved_run_configs`。
- 验证：
  - `bun --filter web typecheck` 通过。
  - `git diff --check` 通过。
  - `bun --filter web lint` 已执行，但被既有非本次范围问题阻塞；代表性文件包括 `apps/web/src/app-shell/HostedAppShellGate.tsx`、`apps/web/src/features/canvas/components/CanvasAgentIsland.tsx`、`apps/web/src/features/diff/components/ChangesCodeView.tsx`、`apps/web/src/features/github/hooks/use-github.ts`、`apps/web/src/features/settings/hooks/use-updater.ts`、`apps/web/src/features/welcome/components/HostedWelcomeGate.tsx`。
- PR 标签：
  - `codex-automation` label 不存在，跳过。
  - `codex` label 已添加。
- 剩余风险：全量 lint 的历史失败未在本 PR 中治理；本 PR 主要依赖 typecheck 和 diff check 覆盖触及范围。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/code/result/2026-06-11_08-13-21_score-86_ATMOS_CODE_QUALITY_REVIEW.md`

## 11. 结果提交与推送

- 结果文件提交 hash：`89f8dbc19e7813294e992555134fbe7def43afb3`
- 推送目标分支：`origin/codex/quality-fix/2026-06-10`
- PR URL：`https://github.com/AruNi-01/atmos/pull/125`
- 说明：低分自动修复场景下，结果文件随修复分支进入同一个 PR。
