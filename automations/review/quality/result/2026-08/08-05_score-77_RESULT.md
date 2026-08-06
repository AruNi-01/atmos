# Atmos main 每日代码质量评分（2026-08-04）

## 1. 审查范围

- 昨日时间窗口：2026-08-04 00:00:00 到 2026-08-04 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `51332553b`，窗口起点父提交 `bf47ade70`）。
- 排除：窗口内无「只改 `automations/review/quality/result/`」的 automation 归档提交。
- 审查方式：以日终净 diff（约 194 files / +17k / −4.6k）与 APP-052 Desktop Use、APP-053 browser webview、质量修复 #198 为主线。

被审查提交（含 merge，按时间）：

| Hash | Author | Message |
| --- | --- | --- |
| `3b55c774d` | AruNi_Lu | feat(desktop-use): APP-052 Desktop Use Settings, CLI, and AppShot capture migration (#199) |
| `47524de67` | AarynLu | feat(desktop-use): pin control engine package under Atmos Desktop Use host |
| `613cee631` | AarynLu | fix(desktop-use): serve via Atmos Desktop Use.app for unified TCC |
| `baa4f0fad` | AarynLu | fix(desktop-use): route AppShot capture through host engine when installed |
| `cc55af201` | AarynLu | fix(desktop-use): rustfmt + silence unused host_app on non-macOS |
| `6a46fe139` | AarynLu | docs(desktop-use): clarify Electron capture is pre-ensure fallback only |
| `36fa5df9d` | AarynLu | fix(desktop-use): lock 0.17.0 screenshot protocol and real PNG extract |
| `996b81a99` | AruNi_Lu | refactor: address daily quality findings for 2026-08-03 (#198) |
| `3d7a42392` | AarynLu | feat(desktop): APP-053 browser via Electron webview, host selection UI |
| `b369e2288` | AarynLu | fix(web): add missing browser.toolbar.actions.openBrowserWindow i18n |
| `4a5c561d4` | AarynLu | feat(desktop-use): polish control UX, agent chrome, and compliance notices |
| `4c265d64d` | AarynLu | fix(desktop): black screen when opening browser webview |
| `9a2a5369e` | AarynLu | fix(web): remove unused ts-expect-error on Electron webview |
| `8d82359b4` | AarynLu | fix(web): browser loading overlay and keep webview across tab switch |
| `0f39ebe44` | AarynLu | test(web): fix layoutHidden structural assertion for webview mount |
| `7f8adce60` | AarynLu | fix(desktop): harden multi-tab webview attach and canvas browser mount |
| `6c6710ced` | AarynLu | feat(desktop-use): browser-use CDP surface, AX/pixel ladder, cursor-matched chrome |
| `4c92f00c9` | AarynLu | fix(desktop): harden webview browser selection, nav, and bind |
| `290442a7c` | AarynLu | fix(web): reverse browser refresh icon spin direction while loading |
| `f0c5d0585` | AarynLu | fix(desktop): sync Atmos theme into browser guest color-scheme |
| `91f96a877` | AarynLu | fix(web): Arc-style browser tabs and canvas webview clicks |
| `3e73468b1` | AarynLu | fix(desktop-use): silence Linux Clippy and harden CLI/host capture |
| `876bf59a1` | AarynLu | fix(desktop-use): address review quick-wins for install, capture, overlay |
| `470693e97` | AarynLu | fix(web): polish browser tab chrome and selection popover placement |
| `b949fe765` | AarynLu | fix(web): refine browser tab strip chrome and hover stability |
| `9759c4306` | AruNi_Lu | feat(desktop): APP-053 browser via Electron webview + host selection UI (#203) |
| `51332553b` | AruNi_Lu | Merge pull request #202 from AruNi-01/feat/app-052-control-engine-cua |

## 2. 一份好代码应该是什么样

本次标准看「新子系统能否被新维护者按职责导航」。Desktop Use / Browser webview 属于跨进程、协议敏感域：纯映射与协议解析应与 IO/daemon 生命周期分开；UI 编排应把 transport、viewport、selection 的新增路径抽到可测模块，而不是继续堆进已超千行的 session 组件；CLI 的 clap 类型与 request 组装应分文件；错误结果构造应有统一出口，避免每个分支手写 `DriveResult { ok: false, … }`。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低严重度分别约扣 8–15 / 3–7 / 1–2 分；同一根因不重复计数。
- 体量阈值作信号：服务/manager 文件 800+、UI/hook 400+、单函数 80+ 且职责混杂时才明确扣分。
- 不把历史债务整包算到当日；只计当日引入、放大或固化的结构问题。质量修复 #198 的正向影响计入加分侧描述。

## 4. 总分

总分：77/100。总体判断：良好。

APP-052/053 在模块切分、纯函数协议层、attach policy 单测和上一日质量债偿还上表现扎实，但日终仍留下多个 800+ 行枢纽文件（`control.rs`、`surface-manager`、CLI、`BrowserSession`）与 `DriveRequest` 字段袋，维护成本上升明显。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | 正向：`drive_tools` / `engine_protocol` / `webview-attach-policy` / `browser-use` backends / #198 `child_lifecycle` 拆分。扣分：`DriveRequest` 约 40 可选字段成为全动作共用袋；`BrowserSurfaceManager` 同时管 attach 队列、guest bind、runtime inject、theme、detached window；`BrowserSession` 继续作为 transport+UI 总编排器承载 APP-053 新路径。 |
| 可读性与复杂度 | 19/25 | `run_engine` / `screenshot_via_engine` 多阶段流水线可读但长；`createTransportHandlers` 约 190 行事件表；preview→browser 重命名后仍大量 `Preview*` / `previewT` 命名，扫描成本高。 |
| 体量与内聚 | 13/20 | 日终：`control.rs` ~1081、`BrowserSession` ~1386（较旧 Preview 略减但仍是枢纽）、`surface-manager` ~957（自旧 preview manager 800 增长）、CLI `desktop_use.rs` ~912、`highlight.rs` ~752、`drive_tools.build_engine_call` ~340 行 match。 |
| 可维护性与复用 | 12/15 | 正向：结构化 error_code、vendor scrub、fixtures、structural tests。扣分：CLI clap 类型与 `DriveRequest` 映射同文件；`DriveResult` 失败构造大量复制（审查时）；browser 命名债务未收敛。 |
| 工程卫生 | 9/10 | 大量 review quick-win、clippy/CI 跟进、NOTICE/compliance、unit tests 充分；同日 ship 中 black-screen / tab bind 连续修补属过程抖动，轻微扣分。 |

## 6. 主要问题清单

### 中：Desktop Use `control.rs` 枢纽过大，`DriveRequest` 字段袋 + 重复失败构造

- 提交：`3b55c774d`、`6c6710ced`、`36fa5df9d`、`876bf59a1` 等
- 文件：`crates/desktop-use/src/control.rs`（`DriveRequest`、`run_engine`、`screenshot_via_engine`）
- 问题：单一 `DriveRequest` 承载点击坐标、剪贴板、菜单、窗口 AX、高亮、session 等全部可选字段；`run_engine` 串联 ensure_daemon → session → highlight → 坐标换算 → tool call → 结果注解；多处手写 `DriveResult { ok: false, error_code, … }`。
- 为什么是质量问题：后续加动作或改错误语义必须在长流水线与字段袋中交叉修改，易漏 error_code / vendor scrub。
- 优化建议：为 `DriveResult` 提供 `err` / `err_code` / `ok_result` 构造器；把成功路径的 delivery/highlight/AX 注解抽成 `enrich_drive_success`；中期按动作族拆 `DriveRequest` 子结构（pointer / window / clipboard）。

### 中：`BrowserSurfaceManager` 单类吞掉 attach、inject、theme、生命周期

- 提交：`3d7a42392`、`7f8adce60`、`4c92f00c9`、`f0c5d0585` 等
- 文件：`apps/desktop-electron/src/browser/surface-manager.ts`（日终 ~957 行）
- 问题：attach 队列与 session 绑定逻辑正确且有 policy 单测，但 runtime 脚本注入、preload 路径发现、guest color-scheme（含 CDP Emulation）与 open/detach/navigate 仍挤在同一 class。
- 为什么是质量问题：改 inject 或主题同步时不得不加载整份 surface 生命周期，回归面偏大。
- 优化建议：抽出 `webview-runtime.ts`（路径 + `buildBridgeInjection`）与 `webview-color-scheme.ts`（guest theme）；manager 只保留 session map / attach / emit。

### 中：`BrowserSession` 仍为超大编排组件，preview 命名债务未清

- 提交：`3d7a42392`、`9759c4306` 及后续 polish
- 文件：`apps/web/src/features/browser/components/BrowserSession.tsx`（~1386 行）；feature 内 `Preview*` 残留数百处
- 问题：目录已 rename 到 `browser/`，但 session 内 transport handlers、desktop sync、iframe/extension 路径仍高度耦合；模块级 i18n 缓存与组件同居。
- 为什么是质量问题：APP-053 新路径继续抬高枢纽复杂度；命名混用增加 code search 与 onboarding 成本。
- 优化建议：先把 locale fallback（`browserT`）与 desktop transport handlers 抽到 `lib/` / `hooks/`；再分批将 `Preview*` 类型/常量改为 `Browser*`（可按文件 PR 化）。

### 中：CLI `desktop_use` 单文件 ~912 行（clap + 映射 + 命令）

- 提交：`3b55c774d`、`4a5c561d4`、`6c6710ced`
- 文件：`apps/cli/src/commands/desktop_use.rs`
- 问题：几十个 `Args`/`Subcommand` 与 `drive_cmd` 的 `DriveRequest` 组装、driver/capture/prefs handlers 同文件。
- 为什么是质量问题：改一个 drive 子命令标志要在巨型文件中导航；与 crate 侧 `DriveRequest` 双端字段同步成本高。
- 优化建议：拆为 `desktop_use/args.rs`（clap 类型）、`desktop_use/drive.rs`（映射）、`desktop_use/mod.rs`（status/driver/capture/prefs execute）。

### 低：`build_engine_call` 超长 match 可按动作族拆 helper

- 提交：`6c6710ced` 等
- 文件：`crates/desktop-use/src/drive_tools.rs`
- 问题：纯映射设计正确且可测，但单函数 ~340 行。
- 优化建议：clipboard / app lifecycle / pointer 等分组 helper（保持单测入口 `build_engine_call` 不变）。

## 7. 正向观察

- **#198 质量修复落地**：`agent_hooks` 拆出 `child_lifecycle.rs`，toast JSX 抽到 `agent-hook-toast.tsx`，体现对上一日评分的闭环。
- **Desktop Use 模块切分总体正确**：`drive_tools`（纯）、`engine_protocol`（解析/软失败）、`host`/`install`/`highlight`/`window_surface` 边界清楚；vendor 字符串 scrub 与结构化 `error_code` 一致。
- **APP-053 attach policy 可测**：`webview-attach-policy.ts` 无 Electron 依赖，多 tab 同 URL FIFO / preferredSession 有单测；`DesktopBrowserWebview` 明确「CSS hide 不销毁 guest」。
- **browser-use 与 desktop-use 正交**：CUA backend + embedded stub，纯 `build_cua_tool_call` 可单测。
- **工程节奏**：review quick-wins、clippy 跨平台 silence、structural tests、NOTICE/compliance 跟进及时。

## 8. Review 建议

今日人工 review 优先盯：

1. `DriveRequest` / `run_engine` 是否继续膨胀，错误路径是否统一。
2. `BrowserSurfaceManager` 是否还能继续瘦身（inject/theme 外置后，detach/window 是否也可拆）。
3. `BrowserSession` transport 编排与 preview 命名债务的下一步切片计划。
4. CLI clap 与 crate API 的字段双写是否开始出现漂移。

## 9. 自动修复与 PR

触发原因：总分 77 < 90。

修复分支：`grokbuild/quality-fix/2026-08-04`

已做修复摘要：

1. **`DriveResult` 构造器 + `enrich_drive_success`**：收敛失败/成功样板与结果注解（`crates/desktop-use/src/control.rs`）。
2. **`drive_tools` 动作族 helper**：clipboard / app lifecycle 从巨型 match 抽出。
3. **CLI 拆分**：`apps/cli/src/commands/desktop_use/{mod,args,drive}.rs`。
4. **surface-manager 瘦身**：抽出 `webview-runtime.ts`、`webview-color-scheme.ts`。
5. **BrowserSession i18n 外置**：`browser-session-i18n.ts` 的 `browserT`。

验证：

- `cargo fmt -p desktop-use`
- `cargo test -p desktop-use` → 54 passed
- `cargo check -p atmos`（CLI）→ ok
- `bun test src/browser/*.test.ts`（desktop-electron）→ 18 pass
- `git diff --check` → clean

未处理 / 剩余风险：

- `BrowserSession` 主体 transport 编排与全量 `Preview*` 重命名未做（风险大，宜分 PR）。
- `DriveRequest` 字段袋未按动作族拆类型（API 面大）。
- `highlight.rs` / `install.rs` 体量未动。

PR URL：https://github.com/AruNi-01/atmos/pull/205

## 10. 结果文件

`automations/review/quality/result/2026-08/08-05_score-77_RESULT.md`

## 11. 结果提交与推送

- 结果与修复同在分支 `grokbuild/quality-fix/2026-08-04` 推送至 `origin`，经 PR 合入 `main`。
- 提交：`e2e9bf087`（修复+结果）
- 分支：`grokbuild/quality-fix/2026-08-04` → PR https://github.com/AruNi-01/atmos/pull/205
