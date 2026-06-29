# Atmos main 每日代码质量评分报告

## 1. 审查范围

昨日时间窗口：UTC+8 2026-06-28 00:00:00 至 2026-06-28 23:59:59。

同步状态：已从 `origin/main` fast-forward 到 `ec72d48aa45b1b686ae3b3a3aa64b61d95442428` 后审查。

排除规则：未发现只修改 `automations/review/quality/result/` 的 automation 结果归档提交；以下 20 个提交均作为业务/代码提交纳入评分。

被审查提交：

| Hash | 时间(UTC+8) | Author | Message |
| --- | --- | --- | --- |
| `585aebe2` | 2026-06-28 17:13:34 | AarynLu | Add terminal agent input shortcut |
| `b91788c4` | 2026-06-28 20:33:10 | AarynLu | Add layered E2E CI and smoke suites |
| `872be410` | 2026-06-28 20:33:32 | AarynLu | Fix ACP chat panel history UX |
| `fd8644cc` | 2026-06-28 20:48:42 | AarynLu | Add desktop preview browser window |
| `78bed522` | 2026-06-28 20:50:47 | AarynLu | Document Lottie skill workflow |
| `0efba5cb` | 2026-06-28 20:50:53 | AarynLu | Fix desktop startup error routing |
| `ea61e40e` | 2026-06-28 20:51:04 | AarynLu | Update web app shell interactions |
| `e8e85f33` | 2026-06-28 20:51:11 | AarynLu | Refine agent and connection workflows |
| `addce67d` | 2026-06-28 20:51:18 | AarynLu | Update automation canvas and review surfaces |
| `cbac3dc9` | 2026-06-28 20:51:25 | AarynLu | Polish editor preview and repository workflows |
| `7cb47cac` | 2026-06-28 20:51:35 | AarynLu | Refresh settings skills and terminal panels |
| `60025c1e` | 2026-06-28 20:51:44 | AarynLu | Update workspace welcome and shared utilities |
| `c76ab08f` | 2026-06-28 20:59:26 | AarynLu | Fix E2E CI startup race |
| `95734fa4` | 2026-06-28 21:10:01 | AarynLu | Wait for API readiness in E2E server startup |
| `a0f26015` | 2026-06-28 21:26:04 | AarynLu | Stabilize E2E smoke fixtures |
| `01a5060b` | 2026-06-28 21:36:45 | AarynLu | Scope web CI checks by changed paths |
| `fecf9019` | 2026-06-28 21:38:49 | AarynLu | Fix web lint regressions |
| `6e600bfa` | 2026-06-28 21:38:59 | AarynLu | Limit web lint checks to source changes |
| `fa7ae708` | 2026-06-28 21:40:59 | AarynLu | Fix agent chat session typecheck |
| `ec72d48a` | 2026-06-28 21:44:10 | AarynLu | Stabilize cached web translators |

## 2. 一份好代码应该是什么样

本次评分采用的标准是：代码应该让维护者快速判断职责归属、层级边界和修改入口；复杂流程要被拆成能独立阅读和验证的小单元；配置、协议、文案和重复规则应集中表达，而不是分散在组件、workflow、store 和工具文件中靠隐式约定维持一致。体量大本身不是问题，但大文件必须用清晰结构换取可读性。

## 3. 评分方法

总分 100 分，按 5 个维度评分：

| 维度 | 权重 |
| --- | ---: |
| 设计与分层 | 30 |
| 可读性与复杂度 | 25 |
| 体量与内聚 | 20 |
| 可维护性与复用 | 15 |
| 工程卫生 | 10 |

扣分口径：高严重度问题通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一问题只按主要影响扣一次，只有产生额外维护后果时才在其他维度少量扣分。体量阈值按组件、函数、workflow 的职责混杂程度判断，不机械按行数扣分。

## 4. 总分

总分：84/100。

总体判断：良好。昨日提交整体能工作且有不少工程化补强，但局部新增结构把多个职责集中到少数大文件中，后续维护成本明显上升，已触发低于 90 分的自动修复流程。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | `585aebe2` 的 terminal agent input overlay 同时承担 UI、上传、mention/slash、拖拽、动画和终端提交协议；`b91788c4` 的 E2E workflow 把 suite planning、报告解析、Pages 生成和 PR 评论正文都写在 YAML 中。 |
| 可读性与复杂度 | 22/25 | 新增流程能读懂，但 `TerminalAgentInputOverlay` 和 `.github/workflows/ci-e2e.yml` 的主路径过长，调试时需要在多段状态和 heredoc 之间跳转。 |
| 体量与内聚 | 17/20 | `TerminalAgentInputOverlay.tsx` 新增后达到 588 行；`ci-e2e.yml` 达到 610 行；`settings-modal-data.ts` 达到 961 行，虽然部分是配置，但配置和运行时翻译逻辑混在一起。 |
| 可维护性与复用 | 12/15 | cached translator helper 在 web 侧约 61 个文件中重复出现；E2E 报告失败解析逻辑在 summary 和 PR comment 中重复。 |
| 工程卫生 | 9/10 | 未发现调试残留或明显临时代码；但 `ec72d48a` 为绕过 translator 类型问题引入多处 `any` 和 eslint disable，属于局部卫生退步。 |

## 6. 主要问题清单

### 高：terminal agent overlay 职责过多

- 提交：`585aebe2`
- 文件：`apps/web/src/features/terminal/components/TerminalAgentInputOverlay.tsx`
- 位置：原始 main 中 `TerminalAgentInputOverlay` 组件、`resolveTerminalPrompt`、`submit`、render block
- 问题描述：一个新增 588 行组件同时处理附件上传、prompt 文本转换、mention/slash 搜索导航、拖放上下文、飞行动画、终端提交协议和完整 JSX。
- 为什么是质量问题：该组件后续任何一个行为变化都会牵动多个不相关状态，理解成本和回归风险都高；UI 展示和提交协议耦合后，也很难单独验证纯逻辑。
- 优化建议：把 prompt resolution、popover 定位、飞行动画 message 构造抽到 feature-local lib；把 composer shell、mention/slash/image popovers、portal 动画拆为展示组件；主组件只保留状态编排和事件连接。

### 中：E2E workflow 承载过多脚本逻辑且存在重复解析

- 提交：`b91788c4`
- 文件：`.github/workflows/ci-e2e.yml`
- 位置：原始 main 中 `plan` job 的 suite planning heredoc、`Write GitHub summary`、`Comment on pull request with report URL`
- 问题描述：610 行 workflow 中内嵌多段 Node 脚本，报告失败解析逻辑在 summary 和 PR comment 里各写一份。
- 为什么是质量问题：YAML 同时承担编排和业务脚本职责，测试困难；同一报告结构变化时需要同步改多处，容易分叉。
- 优化建议：把 suite planning、报告读取/失败解析、summary markdown、PR comment body、Pages site 生成抽到 `e2e/scripts/`，workflow 只传 env 并调用脚本。

### 中：模块级 cached translator helper 分散复制

- 提交：`7cb47cac`、`fecf9019`、`ec72d48a`
- 文件：`apps/web/src/features/settings/components/settings-modal-data.ts`、`apps/web/src/features/settings/components/settings/settings-modal-utils.ts`，以及多处 `apps/web/src/**`
- 位置：`cached*Translator` / `currentAppLocale` / `createTranslator` helper
- 问题描述：web 侧约 61 个文件各自维护类似 cached translator helper；部分静态数据文件在模块加载时把翻译结果固化。
- 为什么是质量问题：同一 fallback、typing、locale 切换策略分散在多个文件中，后续再修类型或 fallback 行为时需要大范围机械修改；静态导出数据与运行时 locale 耦合后，也容易产生 stale label。
- 优化建议：新增共享的 `createCachedWebTranslator(namespace)` 或改为 hook/工厂注入 translator；`settings-modal-data.ts` 这类数据文件应导出 section/item definition 和 `buildSettingsModalData(t)`，由组件按当前 locale memoize 生成。

### 低：E2E fixture helper 中测试数据准备过重

- 提交：`a0f26015`
- 文件：`e2e/tests/smoke/support/app-smoke.ts`
- 位置：`buildProjectWorkspaceDeepLink`
- 问题描述：一个 helper 内部同时走 REST 查询、REST 创建、WebSocket 创建 workspace、URL 组装。
- 为什么是质量问题：测试意图是构造 deep link，但数据准备协议细节混在页面 helper 内，未来 API/WS 协议变化会让普通路由 smoke fixture 也变难读。
- 优化建议：把 project/workspace provisioning 抽到 `e2e/fixtures/` 下的 API helper，`buildProjectWorkspaceDeepLink` 只接收 project/workspace id 并负责 URL 组装。

## 7. 正向观察

- `585aebe2` 在后端新增 `TerminalEnter` 的路径基本保持了 API handler 到 `core-service` 的薄适配，没有把终端业务逻辑反向塞进前端或 infra。
- `b91788c4` 的 E2E suite 分层方向是对的，按 routes/onboarding/app-shell/project/settings/workspace 拆 smoke 覆盖，比单个大 smoke 文件更容易按变更面调度。
- 多个后续提交快速补了 typecheck、lint 和 CI path scope，说明昨日 main 对工程反馈有及时收口。
- 新的 Settings 快捷键文档同步了 `⌘G` terminal agent input，符合快捷键可发现性要求。

## 8. Review 建议

人工 review 今日最值得盯：

1. terminal agent input overlay 的拆分后交互是否保持一致，尤其是附件上传、slash skill 插入、拖拽文件 mention、三种提交模式。
2. E2E workflow 抽脚本后，GitHub Actions 的 env、working directory、artifact path 是否与原逻辑一致。
3. cached translator 重复问题是否要开单独 PR 做全局收敛，避免后续继续复制 `any` translator cache。
4. E2E fixture helper 的数据准备是否需要再拆，尤其是 REST/WS 混用的测试辅助代码。

## 9. 自动修复与 PR

已触发自动修复，原因：总分 84，低于 90。

修复分支：`codex/quality-fix/2026-06-28`

修复提交：`f3a3c176` (`refactor: improve daily quality findings`)

PR：`https://github.com/AruNi-01/atmos/pull/142`

已完成修复：

- 将 terminal agent input overlay 的 prompt resolution、popover 定位、飞行动画 message 构造抽到 `apps/web/src/features/terminal/lib/terminal-agent-input-overlay-utils.ts`。
- 将 composer shell、mention/slash/image popovers、flying message portal 拆成 `TerminalAgentInputShell.tsx`、`TerminalAgentInputPopovers.tsx`、`TerminalAgentFlyingMessagePortal.tsx`。
- 将 E2E CI suite planning、报告 summary、Pages 生成、PR comment body 逻辑抽到 `e2e/scripts/*.cjs`，workflow 只保留编排。

验证摘要：

- `bun --filter web typecheck`：通过。
- `bun --filter web lint`：通过，无 error；仍有仓库既有 warning。
- `git diff --check`：通过。
- `node -c e2e/scripts/e2e-report-utils.cjs`、`plan-ci-suites.cjs`、`write-e2e-summary.cjs`、`prepare-pages-report.cjs`：通过。
- `bun e2e/scripts/run-ci-suite.mjs smoke-app-shell --dry-run`：通过。
- `plan-ci-suites.cjs` PR/app-shell env dry-run：通过。

标签处理：已添加 `codex`；仓库未发现 `codex-automation` 标签，已跳过。

未处理/剩余风险：cached translator 的全量收敛横跨约 61 个 web 文件，适合单独做 i18n helper 设计 PR；本次仅在报告中列为中严重度问题，未在同一 PR 中做大范围机械替换。

## 10. 结果文件

本次结果文件：`automations/review/quality/result/2026-06/06-29_score-84_RESULT.md`

## 11. 结果提交与推送

推送目标分支：`origin/codex/quality-fix/2026-06-28`

PR URL：`https://github.com/AruNi-01/atmos/pull/142`

结果文件将随本修复分支的后续报告提交推送到同一 PR 中；提交 hash 以该分支推送后的 GitHub 提交记录为准。
