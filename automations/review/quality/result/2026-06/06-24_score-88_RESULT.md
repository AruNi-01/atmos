# Atmos main 每日代码质量评分 - 2026-06-24

## 1. 审查范围

- 审查时间窗口：2026-06-23 00:00:00 +0800 至 2026-06-23 23:59:59 +0800。
- 审查分支：`main`。
- 已排除纯 automation 结果归档提交：`f587787c docs: add code quality review result 2026-06-23 score 88`。
- 说明：`4d628780` 是 merge commit，无独立 diff；其合入的真实代码改动已通过对应子提交纳入审查。

被审查提交：

| Commit | Author | Message |
| --- | --- | --- |
| `2611b473` | AarynLu | `fix(local-runtime): handle existing logo migration` |
| `e7a967d6` | AarynLu | `refactor: address daily quality findings for 2026-06-22` |
| `943b8881` | AarynLu | `fix: keep prompt stash on copy failure` |
| `7786d450` | AarynLu | `Route terminal WebSocket URLs through runtime config` |
| `23f33eae` | AarynLu | `fix(web): use bundled geist fonts for pages build` |
| `2d85dc79` | AarynLu | `Bracket IPv6 probe URLs in local services` |
| `e2e3d66c` | AarynLu | `fix(cli): use R2 manifest for updates` |
| `898e56f5` | AarynLu | `Refine session and workspace state handling` |
| `afb7b4fd` | AarynLu | `chore(cli): release 0.2.2` |
| `1ec22cdf` | AarynLu | `chore(local-runtime): release 0.2.2` |
| `ed8ffb44` | AarynLu | `chore(desktop): release 2.0.0` |
| `b5f7019d` | AarynLu | `fix github app setup completion flow` |
| `b1e64b5a` | AarynLu | `fix stale github installation selection` |
| `0efdfaf2` | AarynLu | `fix github app callback authorization fallback` |
| `2d43003e` | AarynLu | `improve github relay error diagnostics` |
| `9d6e07e1` | AarynLu | `fix github installation token parsing` |
| `0560fb6f` | AarynLu | `log github installation token response shape` |
| `68a20a11` | AarynLu | `fix github trigger setup refresh flow` |
| `385cc313` | AarynLu | `fix hosted access key display` |

## 2. 一份好代码应该是什么样

本次采用的质量标准是：代码应放在它自然归属的层里，API handler 负责协议与响应适配，runtime、release、下载、解包、文件系统和 shell 配置这类主机能力应收敛到能力层；复杂流程可以长，但必须通过清楚的模块边界降低阅读和测试成本。好的改动应减少隐式约定，避免把一次修复固化成未来维护者必须绕开的入口文件。

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

当天 GitHub trigger、Relay 授权、WS URL、Diff prompt stash 和发布链路都有不少正向收口，尤其是 GitHub App 错误码、token 解析和 workflow name 过滤比之前更清楚。但 `apps/api/src/api/system/cli.rs` 在同一天被扩展为 745 行，并承载 release manifest 获取、平台资产匹配、下载解包、文件替换、shell profile 修改和启动自安装，明显越过 API entry 层边界，因此低于 90 并触发自动修复。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25 / 30 | `e2e3d66c` 和 `898e56f5` 把 CLI release/install 主机能力放入 `apps/api/src/api/system/cli.rs`；这与 `apps/api/AGENTS.md` 中 handler stay thin、业务/能力下沉的边界不一致。 |
| 可读性与复杂度 | 22 / 25 | 同一文件内主路径需要跨 HTTP DTO、manifest fallback、GitHub API fallback、Atom feed parsing、tar 解包、递归找二进制、PATH 写入等阶段阅读，局部函数虽可理解，但入口文件整体阅读成本明显上升。 |
| 体量与内聚 | 17 / 20 | `apps/api/src/api/system/cli.rs` 达到 745 行，且不再只是 API handler；`install_cli`、`ensure_standalone_cli_on_startup`、`download_and_install_cli`、`fetch_latest_cli_release*` 和 `modify_shell_config` 有清晰拆分点。 |
| 可维护性与复用 | 14 / 15 | CLI release manifest 逻辑同时被 API startup、手动 install endpoint、脚本 installer 使用；当天最明显的问题是 Rust API 侧没有先形成能力模块，后续测试和复用都会被 API 层耦合拖住。 |
| 工程卫生 | 10 / 10 | 未发现明确 token/secret 泄露或临时调试残留；`0560fb6f` 只记录 installation token 响应键名，未记录 token 值。 |

## 6. 主要问题清单

### 高：CLI release/install 能力被固化到 API handler 文件

- 提交：`e2e3d66c fix(cli): use R2 manifest for updates`、`898e56f5 Refine session and workspace state handling`
- 文件：`apps/api/src/api/system/cli.rs:65`、`apps/api/src/api/system/cli.rs:170`、`apps/api/src/api/system/cli.rs:202`、`apps/api/src/api/system/cli.rs:365`、`apps/api/src/api/system/cli.rs:648`
- 问题：`cli.rs` 同时承担 HTTP response DTO、CLI 版本检查、release manifest 获取、GitHub Releases fallback、Atom tag fallback、平台 asset 匹配、下载、tar 解包、临时目录和目标二进制替换、shell config 修改，以及 API startup 的 standalone CLI 自动安装。文件从系统接口适配器变成了主机 runtime/update 能力的实现层。
- 为什么是质量问题：`apps/api` 的本地规则要求 handler stay thin；这些逻辑属于 local host/runtime 能力，不属于 inbound API entry。放在 handler 文件里会让后续维护者为了改 release manifest、asset 命名、安装清理或 shell profile 行为而进入 API router 层，也让这类逻辑难以在 CLI/Desktop/runtime-manager 侧复用和测试。
- 优化建议：把 release discovery、manifest parsing、archive install、binary lookup、shell PATH 写入下沉到 `crates/runtime-manager` 的 CLI update 能力模块；`apps/api/src/api/system/cli.rs` 只保留 `CliVersionCheckResponse`、`InstallCliRequest`、`CliInstallResponse` 和 endpoint response mapping。startup 自安装也应调用 `runtime_manager::ensure_standalone_cli_on_startup()`，而不是反向依赖 API module。

## 7. 正向观察

- `e7a967d6` / `943b8881` 把上一轮 diff prompt stash 问题拆成 feature-local hook，并补上 copy failure 后保留 stash 的修正，方向正确。
- `7786d450` 把 terminal WebSocket URL 组装收敛到 `apps/web/src/features/terminal/lib/terminal-ws-url.ts`，并补了 hosted loopback WS 测试，避免 feature 组件继续猜测 runtime URL。
- `2d85dc79` 对 IPv6 local service probe 增加 bracket 处理，变更小且靠 DTO/classification 边界落地。
- GitHub trigger 相关提交把 workflow name 过滤、installation 去重、错误码映射、callback fallback 和 token 响应解析逐步收口，并有 `packages/relay/test/*` 与 core-service GitHub trigger 测试覆盖。
- `packages/relay/src/github-app.ts` 的 token missing 日志只输出 `response_keys`，没有记录 `server_secret`、OAuth code、installation token 或 access token。

## 8. Review 建议

人工 review 最值得盯：

1. API entry 文件是否继续吸收 release、runtime、installer、filesystem 或 shell profile 逻辑。
2. GitHub trigger setup 的前端 hook 是否继续增长为多职责状态容器，尤其是 installation refresh、repository selection、workflow filter 和 route config 构造。
3. 发布/安装脚本里的 manifest 解析是否与 Rust/Node 逻辑发生语义分叉。
4. Relay/GitHub App 日志继续保持只记录可诊断形状，不记录 token、secret、OAuth code 或 raw webhook secret。

## 9. 自动修复与 PR

已触发自动修复，因为总分 **88 < 90**。

- 修复分支：`codex/quality-fix/2026-06-24`
- 修复提交：`86e2054b refactor: move cli update logic into runtime manager`
- PR：https://github.com/AruNi-01/atmos/pull/131
- 标签：已添加 `codex`；仓库中未找到 `codex-automation`，因此跳过该标签。
- 修复内容：
  - 新增 `crates/runtime-manager/src/cli_update.rs`，承接 standalone CLI release discovery、manifest parsing、GitHub/Atom fallback、archive install、binary lookup、version comparison 和 shell config 修改。
  - `apps/api/src/api/system/cli.rs` 从 745 行降至 98 行，只保留 endpoint DTO 与 response mapping。
  - `apps/api/src/main.rs` 的 startup 自安装改为调用 `runtime_manager::ensure_standalone_cli_on_startup()`。
  - `runtime-manager` 显式声明 `tracing` 依赖，并同步 `Cargo.lock`。
- 验证：
  - `rustfmt --edition 2021 apps/api/src/api/system/cli.rs apps/api/src/main.rs crates/runtime-manager/src/lib.rs crates/runtime-manager/src/cli_update.rs` 通过。
  - `cargo test -p runtime-manager --quiet` 通过，6 tests passed。
  - `cargo test -p api --quiet` 通过，15 tests passed；存在既有 `resolve_interactive_automation_agent` dead code warning。
  - `cargo test -p core-service github_trigger --quiet` 通过，13 tests passed；存在同一既有 dead code warning。
  - `bun test packages/relay/test/event-routes.test.ts packages/relay/test/github-setup-complete.test.ts apps/web/src/shared/lib/__tests__/ws-url.test.ts` 通过，23 tests passed。
  - `git diff --check` 通过。
- 剩余风险：`runtime-manager::cli_update` 是更合适的归属层，但模块本身仍有 678 行；如果后续继续扩展 CLI release 策略，建议再拆为 release discovery、archive install、shell config 三个子模块。

## 10. 结果文件

本次结果文件路径：`automations/review/quality/result/2026-06/06-24_score-88_RESULT.md`

## 11. 结果提交与推送

- 结果文件随修复 PR 分支 `codex/quality-fix/2026-06-24` 推送到 `origin`。
- 修复代码提交 hash：`86e2054b`
- PR URL：https://github.com/AruNi-01/atmos/pull/131
- 结果文件提交 hash：本文件提交后由最终回复记录。
