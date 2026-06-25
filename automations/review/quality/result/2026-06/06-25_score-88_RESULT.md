# Atmos main 每日代码质量评分 - 2026-06-25

## 1. 审查范围

- 审查时间窗口：2026-06-24 00:00:00 +0800 至 2026-06-24 23:59:59 +0800。
- 审查分支：`main`。
- 已排除纯 automation 结果归档提交：`32d7efb7 docs: add code quality review result 2026-06-24 score 88`。
- 说明：`2341fc59` 是 merge commit；其合入的真实代码改动已通过对应子提交纳入审查，不重复计分。

被审查提交：

| Commit | Author | Message |
| --- | --- | --- |
| `86e2054b` | AarynLu | `refactor: move cli update logic into runtime manager` |
| `58b99192` | AarynLu | `fix: harden cli updater asset selection` |
| `2341fc59` | AruNi_Lu | `Merge pull request #131 from AruNi-01/codex/quality-fix/2026-06-24` |
| `0a1ae42e` | AarynLu | `Add multi-value GitHub trigger filters` |
| `c6fb9af2` | AarynLu | `feat: harden relay automation limits` |
| `ee4d6528` | AarynLu | `chore: publish local runtime under atmos-land scope` |
| `ef4b891c` | AarynLu | `chore: remove local runtime npm installer` |
| `f7b82b87` | AarynLu | `Handle manual-only desktop updates with GitHub links` |

## 2. 一份好代码应该是什么样

本次采用的质量标准是：代码应放在自然归属层里，主机/runtime 能力不应散落在多个调用端；跨语言协议和策略可以重复适配，但核心规则要尽量有单一来源或至少有清楚的同步边界。复杂功能可以有较大体量，但文件职责要内聚，维护者应能快速判断哪里负责 release 解析、哪里负责 UI 输入、哪里负责 Relay 策略。

## 3. 评分方法

- 100 分制。
- 设计与分层 30 分：职责边界、模块耦合、分层方向、抽象是否贴合。
- 可读性与复杂度 25 分：控制流、状态管理、分支复杂度、理解成本。
- 体量与内聚 20 分：文件、函数、组件体量是否与职责匹配。
- 可维护性与复用 15 分：重复逻辑、共享规则、配置和协议是否集中管理。
- 工程卫生 10 分：命名、注释、错误处理、日志、调试残留、锁文件和 release 元数据一致性。
- 高严重度问题通常单项扣 8-15 分；中严重度问题扣 3-7 分；低严重度问题扣 1-2 分。体量阈值只作为信号，只有体量超出且职责确实变差时扣分。

## 4. 总分

**88 / 100。总体判断：良好。**

当天大部分改动都在收口边界：API 的 CLI install endpoint 被压回薄 handler，runtime-manager 承接主机安装能力，Relay 限流有 schema 和测试，local runtime release 也去掉了 npm 包装器这一条额外分发路径。但 CLI 命令侧仍保留了一份平行 updater 实现，导致同一 release discovery、asset 匹配、版本比较和安装规则同时存在于 `apps/cli` 与 `crates/runtime-manager`；GitHub trigger 策略也在 Rust、Relay TypeScript 和 UI option list 中继续重复维护。因此低于 90 并触发自动修复。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 26 / 30 | `86e2054b` 正确把 API 中的 CLI install 能力下沉到 `runtime-manager`，但 `58b99192` 之后 `apps/cli/src/commands/update.rs` 仍维护平行 release/update 能力，没有复用共享模块。 |
| 可读性与复杂度 | 22 / 25 | CLI update 文件在当天仍有 729 行，混合命令输出、缓存、manifest 解析、GitHub fallback、Atom fallback、tar 解包、递归找二进制和 version compare；GitHub trigger 的多值输入也让多个大文件继续增长。 |
| 体量与内聚 | 18 / 20 | `apps/cli/src/commands/update.rs`、`crates/runtime-manager/src/cli_update.rs` 分别承载相近能力；`packages/relay/src/event-routes.ts` 和 `crates/core-service/src/service/automation/github_trigger.rs` 已超过 1000 行，但本次新增仍基本围绕同一领域。 |
| 可维护性与复用 | 13 / 15 | CLI updater 规则和 GitHub trigger policy 都需要跨文件手动保持一致；尤其 CLI updater 已经有共享归属层却仍复制实现，未来 release 命名或 target alias 变化容易分叉。 |
| 工程卫生 | 9 / 10 | 未发现 token/secret 泄露或明显调试残留；release 文档和 workflow 大体同步，但 updater/GitHub policy 的重复测试位置增加了维护成本。 |

## 6. 主要问题清单

### 高：CLI updater 共享能力存在后，CLI 仍保留平行实现

- 提交：`86e2054b refactor: move cli update logic into runtime manager`、`58b99192 fix: harden cli updater asset selection`
- 文件：`apps/cli/src/commands/update.rs:159`、`apps/cli/src/commands/update.rs:412`、`apps/cli/src/commands/update.rs:420`、`apps/cli/src/commands/update.rs:637`；对照 `crates/runtime-manager/src/cli_update.rs:256`、`crates/runtime-manager/src/cli_update.rs:430`、`crates/runtime-manager/src/cli_update.rs:343`、`crates/runtime-manager/src/cli_update.rs:610`
- 问题：同一 CLI release discovery / manifest parsing / GitHub API fallback / asset URL 解析 / target triple / version comparison / archive install 规则同时存在于 CLI command 和 runtime-manager。当天修复还需要在两边各补 HTTPS 校验、Linux aarch64 target、manifest asset URL 测试，说明规则已经进入“改一处要记得改另一处”的状态。
- 为什么是质量问题：`runtime-manager` 已经是 local host/runtime 能力归属层，CLI 应只是命令入口和输出适配。继续在 `apps/cli` 中保留 700+ 行平行 updater 实现，会让后续 release 命名、R2 manifest、target alias、archive layout 和 version compare 的变更产生分叉风险；维护者也必须阅读两套实现才能确认 CLI/API/Desktop startup 的 updater 行为是否一致。
- 优化建议：让 `apps/cli/src/commands/update.rs` 调用 `runtime_manager::fetch_latest_cli_release()`、`runtime_manager::install_latest_cli()` 和 `runtime_manager::version_gt()`；CLI 文件只保留 `UpdateArgs`、JSON 输出、24 小时 update hint cache。把 manifest URL、asset 选择、archive install、target alias 和版本比较测试都留在 `crates/runtime-manager/src/cli_update.rs`。

### 中：GitHub trigger policy 在 Rust、Relay 和 UI 中继续重复

- 提交：`0a1ae42e Add multi-value GitHub trigger filters`、`c6fb9af2 feat: harden relay automation limits`
- 文件：`crates/core-service/src/service/automation/github_trigger.rs:594`、`packages/relay/src/event-routes.ts:849`、`apps/web/src/features/automations/components/AutomationGithubTriggerPanel.tsx:81`、`apps/web/src/features/automations/hooks/use-github-trigger-setup.ts:444`
- 问题：issue action allowlist、push 必须指定 branch、comment 必须指定 sender、sender login 规范、comment contains 合并规则在 Rust core-service、Relay Worker 和 Web UI 中分别实现。当前测试能覆盖一部分分叉，但规则来源仍靠人工同步。
- 为什么是质量问题：GitHub trigger 是跨 Relay 与本地 automation 的协议边界。策略重复不是纯风格问题，一旦 Relay 接受但 core-service 拒绝，或 UI 展示了某个后端不再接受的 action，用户会看到 setup 成功但运行时不触发或被本地拒绝的隐性故障。
- 优化建议：把事件 family、action allowlist、必填 filter、branch wildcard 规则和 workflow conclusion allowlist 收敛到一个轻量 policy artifact，例如 `resources/github-triggers/policy.json`；Rust 用 `include_str!` 解析并暴露校验，Relay/Web 直接 import JSON 或通过小生成脚本产出 typed constants。短期至少增加一组跨语言 fixture，要求 Rust `GithubTriggerConfig::canonicalize` 与 Relay `validateGithubEventRoutePolicy` 对同一输入返回同类结果。

## 7. 正向观察

- `86e2054b` 把 `apps/api/src/api/system/cli.rs` 从 695 行以上压到薄 handler，API 层只保留 DTO 和 response mapping，方向符合 `apps/api/AGENTS.md`。
- `crates/runtime-manager/src/cli_update.rs` 承接 standalone CLI release discovery、archive install、shell config 修改等主机能力，层次归属比 API handler 更合理。
- `c6fb9af2` 的 Relay route limit、monthly delivery limit 和 computer app device id 都有测试，且限制常量集中在 Relay 边界。
- `ef4b891c` 删除 local runtime npm installer，改用 `resources/local-runtime/version.json` 作为 release version source，减少一条分发路径和一组版本同步点。
- `f7b82b87` 对 manual-only desktop prerelease update 使用显式 `manualDownloadOnly` / `releaseUrl` 状态，避免 UI 展示不可执行的 Install 按钮。

## 8. Review 建议

人工 review 最值得盯：

1. CLI updater 是否完全通过 `runtime-manager` 共享能力执行，避免 `apps/cli` 再长出 release parsing 或 archive install 逻辑。
2. GitHub trigger policy 的 Rust/Relay/UI 三处规则是否一致，尤其是 issue action、sender login、branch wildcard 和 comment contains 多值匹配。
3. Relay 限流 SQL 与 migration 是否适合 D1 查询规模，`github_webhook_deliveries` 的 installation/month 索引是否覆盖实际查询。
4. local runtime release workflow 去掉 npm 后，文档、skill、installer 和 R2 sync 是否没有残留 npm wrapper 路径。

## 9. 自动修复与 PR

已触发自动修复，因为总分 **88 < 90**。

- 修复分支：`codex/quality-fix/2026-06-25`
- 修复提交：`60519e7f refactor: share cli updater logic`
- PR：https://github.com/AruNi-01/atmos/pull/136
- 标签：已添加 `codex`；仓库中未找到 `codex-automation`，因此跳过该标签。
- 修复内容：
  - `apps/cli/src/commands/update.rs` 改为调用 `runtime_manager::{fetch_latest_cli_release, install_latest_cli, version_gt}`。
  - CLI 文件只保留命令 JSON 输出和 update hint cache，从 729 行降到 140 行。
  - 删除 CLI 内重复的 manifest schema、GitHub release fallback、Atom feed parser、asset URL resolver、target triple、archive install、binary lookup、version compare 和重复测试。
- 验证：
  - `cargo fmt --package atmos` 通过。
  - `cargo test -p atmos --quiet` 通过，当前 crate 无单元测试。
  - `cargo test -p runtime-manager --quiet` 通过，13 tests passed。
  - `git diff --check` 通过。
- 剩余风险：`crates/runtime-manager/src/cli_update.rs` 仍有 807 行；它现在是正确归属层，但后续若继续扩展 release 策略，建议再拆为 release discovery、archive install、shell config 三个子模块。GitHub trigger policy 重复问题未在本 PR 中修复，建议作为下一轮专项处理。

## 10. 结果文件

本次结果文件路径：`automations/review/quality/result/2026-06/06-25_score-88_RESULT.md`

## 11. 结果提交与推送

- 结果文件随修复 PR 分支 `codex/quality-fix/2026-06-25` 推送到 `origin`。
- 修复代码提交 hash：`60519e7f`
- PR URL：https://github.com/AruNi-01/atmos/pull/136
- 结果文件提交 hash：本文件提交后由最终回复记录。
