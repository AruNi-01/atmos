# Atmos main 每日代码质量评分报告

## 1. 审查范围

- 昨日时间窗口：UTC+8 2026-06-27 00:00:00 至 2026-06-27 23:59:59。
- 审查基线：`e434148c..6191ce5d`，排除了 2026-06-26 晚间早于窗口的提交；本窗口内未发现仅修改 `automations/review/quality/result/` 的 automation 归档提交。
- 被审查提交：

| Hash | Author | Message |
| --- | --- | --- |
| `aa0e0c01` | AarynLu | Preserve ACP chat session state |
| `74df0b29` | AarynLu | Improve canvas widget placement |
| `328d99bb` | AarynLu | Add message link safety modal |
| `1f37a114` | AarynLu | Address canvas and ACP review findings |
| `25d024a0` | AarynLu | Address remaining agent canvas review findings |
| `c5bfca92` | AarynLu | Tune canvas focus pulse scale |
| `5a1fe2df` | AarynLu | Address agent modal review findings |
| `8afd0be9` | AarynLu | Make ACP chat history global |
| `fd18c6f3` | AarynLu | Keep ACP cwd visible in chat history |
| `fe2baa1f` | AarynLu | Compact ACP history metadata |
| `d6de4c91` | AarynLu | Fix file tree context menu positioning in canvas overlays |
| `072d9cf2` | AruNi_Lu | Merge pull request #138 from AruNi-01/aarynlu/agent-canvas-updates |
| `c7ddc915` | AarynLu | Improve agent chat window layout |
| `69ab575b` | AarynLu | Polish agent chat session persistence |
| `fb942e0e` | AarynLu | Fix agent chat review feedback |
| `18af87a7` | AarynLu | Fix agent chat follow-up review feedback |
| `cf050743` | AruNi_Lu | Merge pull request #139 from AruNi-01/aarynlu/agent-chat-window-layout |
| `a3ec46e1` | AarynLu | Refresh landing feature showcase |
| `1a949b97` | AarynLu | Address feature showcase review comments |
| `84097613` | AarynLu | Align feature showcase side rail width |
| `1bdff0fc` | AarynLu | Adjust feature showcase max width |
| `160aed13` | AruNi_Lu | Merge pull request #140 from AruNi-01/aarynlu/landing-feature-showcase-actions |
| `5ffa7bb2` | AarynLu | Add landing i18n and theme fixes |
| `6191ce5d` | AarynLu | docs: center readme headers and use repo screenshot |

## 2. 一份好代码应该是什么样

本次按“职责边界清楚、复杂度可追踪、体量与职责匹配、复用规则集中、工程痕迹干净”评分。复杂功能可以有复杂实现，但新增代码应把状态编排、UI 片段、协议适配、持久化和纯计算分别放在可定位的位置，避免把后续维护者迫使到一个超大文件里推理所有细节。

## 3. 评分方法

总分 100 分：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一问题不重复扣。体量阈值作为信号使用：UI 组件 400 行以上、单文件 800 行以上、函数 80 行以上会重点检查是否职责混杂。

## 4. 总分

总分：87/100。总体判断：良好，但昨日 agent chat UI 的主文件扩张已经形成明确维护风险，低于 90，已触发自动修复 PR。

## 5. 分项评分

- 设计与分层：25/30。主要扣分来自 `AgentChatPanel.tsx` 在 `c7ddc915` 至 `18af87a7` 中继续承载宽屏历史布局、侧栏宽度持久化、peek 悬停交互、消息条目渲染和会话编排。
- 可读性与复杂度：22/25。`AgentChatPanel` 主路径需要同时跟踪多个 resize/drag/localStorage/ref 副作用；`crates/agent/src/acp_client/runner.rs` 的配置应用路径也出现两段相近分支。
- 体量与内聚：16/20。`apps/web/src/features/agent/components/AgentChatPanel.tsx` 在 main 上达到 1143 行，是本次最明显的质量下降。
- 可维护性与复用：14/15。ACP config 应用逻辑已有可抽取的重复结构；landing feature showcase 存在未消费的 placement 元数据。
- 工程卫生：10/10。未发现调试残留、secret、临时开关或明显错误日志污染。

## 6. 主要问题清单

### 高：AgentChatPanel 主文件职责过载

- 提交：`c7ddc915`、`69ab575b`、`fb942e0e`、`18af87a7`
- 文件：`apps/web/src/features/agent/components/AgentChatPanel.tsx`
- 证据：main 上该文件 1143 行；`AgentChatPanel` 同时包含会话 hook 解包、modal 拖拽/resize、宽屏历史布局判断、历史侧栏 localStorage 偏好、侧栏拖拽宽度、peek shell、消息条目渲染、权限确认和 composer 装配。
- 为什么是质量问题：这些职责变化频率不同，放在一个主组件里会让后续修改历史侧栏或消息渲染时必须理解整个会话面板生命周期，回归风险和 review 成本都变高。
- 优化建议：把消息条目渲染抽成 `AgentChatEntryView`，把历史侧栏 frame/peek UI 抽成独立组件，把历史侧栏宽度/折叠/resize 状态抽成 `useAgentChatHistorySidebarLayout`，让主面板只保留会话编排和布局装配。

### 中：ACP session config 应用逻辑有重复分支

- 提交：`69ab575b`、`fb942e0e`
- 文件：`crates/agent/src/acp_client/runner.rs`
- 证据：`apply_config_values` 处理 `mode`、`model`、普通 config 三条路径；命令循环里的 `SessionCommand::SetConfigOption` 又实现了一组相近的 legacy/new config 分支。
- 为什么是质量问题：ACP config 协议兼容逻辑后续可能继续变化，重复分支容易出现 snapshot/default/config command 三条路径行为不一致。
- 优化建议：抽一个内部 helper，例如 `set_session_config_value(conn, session_id, config_id, value, legacy_flags, event_tx, context)`，由批量 apply 和命令循环共同调用。

### 低：landing feature showcase 留下未消费元数据

- 提交：`a3ec46e1`
- 文件：`apps/landing/src/components/blocks/feature-showcase.tsx`
- 证据：`FeatureDefinition.gridAreaClass` 为所有 feature 配置了网格位置，但渲染实际按 edge 分组，不消费该字段。
- 为什么是质量问题：这类未使用配置会让后续维护者误以为按钮位置由数据驱动，实际修改字段不会生效。
- 优化建议：要么删除 `gridAreaClass` 字段，要么让桌面网格真正消费该 class，二选一收口。

## 7. 正向观察

- `apps/web/src/features/canvas/lib/canvas-widget-placement.ts` 是纯计算模块，并配了 `canvas-widget-placement.test.ts`，边界清楚。
- `AgentMessageLinkSafetyModal` 的 focus trap、Escape、复制链接和 portal 行为相对完整，工程卫生较好。
- core-service 的 ACP session config 快照写入使用 owner-only 权限，并通过服务方法暴露，不把 Axum/WS DTO 泄漏进 service。
- landing 文案进入 `messages/en.json` 与 `messages/zh.json`，符合 landing i18n 约定。

## 8. Review 建议

人工 review 今天最值得盯三点：`AgentChatPanel` 是否继续拆分到可维护边界；ACP config legacy/new 分支是否会分叉；landing showcase 的未消费配置是否需要删除或接入。PR #141 已优先处理第一项高严重度问题。

## 9. 自动修复与 PR

- 触发原因：总分 87，低于 90。
- 修复分支：`codex/quality-fix/2026-06-27`
- 修复提交：`110290c382880be968388977f786d34590d34c76`
- PR：[https://github.com/AruNi-01/atmos/pull/141](https://github.com/AruNi-01/atmos/pull/141)
- 修复摘要：把 `AgentChatEntryView`、`AgentChatHistorySidebarFrame`、`useAgentChatHistorySidebarLayout` 从 `AgentChatPanel.tsx` 拆出；主文件从 1143 行降到 711 行，行为保持结构性搬迁。
- 验证结果：`bun --filter web typecheck` 通过；`bun --filter web lint` 通过，仍有 117 个既有 warning、0 error；`git diff --check` 通过。
- Label：已添加 `codex`；仓库未提供 `codex-automation`，已跳过。
- 剩余风险：PR 是结构拆分，人工 review 应重点检查历史侧栏 resize/collapse、peek hover 和消息条目渲染 import 边界是否保持一致。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/review/quality/result/2026-06/06-28_score-87_RESULT.md`。

## 11. 结果提交与推送

结果文件将随修复分支 `codex/quality-fix/2026-06-27` 推送到 `origin`，并通过 PR #141 纳入 review。结果文件提交 hash 由提交后生成，见最终回复和 PR 最新提交。
