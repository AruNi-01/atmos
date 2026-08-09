# Atmos main 每日代码质量评分（2026-08-08）

## 1. 审查范围

- 昨日时间窗口：2026-08-08 00:00:00 到 2026-08-08 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `a0da25776`）。
- 排除：窗口内无纯 quality result 归档提交。
- 审查方式：以 AppShot host 路径、Browser Use 控制面扩展、Desktop Use 设置/引擎 pin、grant overlay 抛光为主线。
- 修复在独立 worktree / 分支 `grokbuild/quality-fix/2026-08-08` 完成。

被审查提交（按时间）：

| `ecf1f950b` | AarynLu | perf(landing): use static posters for feature sphere covers |
| `d054cd131` | AarynLu | fix(web): stop install-terminal modal clipping bottom content |
| `ad74b542b` | AarynLu | fix(web): align onboarding Browse button height with path input |
| `17af27edc` | AarynLu | feat(web): default more Management Center items to Outside |
| `70cad52da` | AarynLu | fix(web): defer quota usage opt-in to a dedicated onboarding step |
| `0f8cb422b` | AarynLu | fix(web): move Desktop Use uninstall next to engine status |
| `e68eca04d` | AarynLu | fix(desktop-use): refresh permissions after install and stabilize grant overlay |
| `64846e9bd` | AarynLu | fix(appshot): run dual-shift under Atmos Desktop Use host identity |
| `ad6341c1c` | AarynLu | fix(appshot): keep host dual-shift socket reconnected after host restart |
| `fe7d56dc7` | AarynLu | fix(appshot): fix host identity, drop capture_via noise, stop Untitled spam |
| `fb3582f9d` | AarynLu | perf(appshot): cut dual-shift capture latency on the hot path |
| `1112cb552` | AarynLu | fix(appshot): crop host full-display shots to the focused window |
| `0371e61c8` | AarynLu | feat(web): group remote access settings and polish section headers |
| `7f6cade5b` | AarynLu | fix(appshot): allow capturing Atmos without self-frontmost warning |
| `ec42377aa` | AarynLu | chore(desktop-use): remove unused is_self_app after allowing Atmos capture |
| `9febc1db6` | AarynLu | fix(appshot): resolve real content-window bounds for host crop |
| `50edb857e` | AarynLu | fix(appshot): crop QQ Music-style windows and restore border flash |
| `957bb000a` | AarynLu | docs(appshot): clarify window bounds resolve is generic, not QQ-only |
| `d68ebf10c` | AarynLu | feat(appshot): CGWindowList frontmost for Electron-style apps |
| `30e1beb97` | AarynLu | style(appshot): brighten capture border flash affordance |
| `081c0140a` | AarynLu | feat(appshot): fly thumbnail in an arc from source app into Atmos |
| `46894d0c5` | AarynLu | fix(appshot): stop showing permissions CTA after successful host capture |
| `068bce6ed` | AarynLu | fix(appshot): drop noisy screencapture -l and speed fly-in |
| `100065bac` | AarynLu | fix(appshot): keep host bounds when app names differ by localization |
| `58621ce15` | AarynLu | fix(appshot): restore window bounds for crop and animations |
| `d010a10cb` | AarynLu | feat(desktop-use): pin control engine to 0.19.2 |
| `a06f32451` | AarynLu | feat(desktop-use): ship engine pin in Desktop app and auto-update |
| `8106c1bf4` | AarynLu | feat(browser-use): expand control APIs and Desktop/CLI surface |
| `015521068` | AarynLu | fix(web): exclusive active state for management-center overlays |
| `a0da25776` | AarynLu | chore(desktop-electron): release 2026.8.8-beta.1 |

## 2. 一份好代码应该是什么样

本日标准看「截图/控制热路径是否把纯规则与 IO/编排切开」。frontmost 打分与窗口裁剪应可单测；HTTP 控制面扩展应避免单 class 继续吞掉 dialog/download/chrome；设置页引擎卡应与状态机职责分离。已抽出的 `window-crop` / `frontmost-cg` / `capture-fly` 是正确方向。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；同一根因不重复计数。
- 只计当日引入/放大问题；纯测试与 pure 模块正向记录。

## 4. 总分

总分：75/100。总体判断：良好。

AppShot 抽出多块 pure 模块与测试，但 `browser-use-control.ts`（~1117）、`DesktopUseSettingsSection`（~805）、`host-capture.ts`（~736）、`appshot/service.ts`（~1037）同日显著膨胀。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 23/30 | 正向：`window-crop`、`frontmost-cg`、`capture-fly`、`host-shift`、`auto-update`。扣分：`BrowserUseControlPlane` 继续吞 dialog/download/pointer；settings 引擎/权限/可见性仍单文件。 |
| 可读性与复杂度 | 18/25 | control plane `handle` 路由表 + 长 private 方法链；settings 多状态与 install/update/runtime 交叉。 |
| 体量与内聚 | 12/20 | 日终：control ~1117（+~600）、settings ~805（+~310）、host-capture ~736（+~500）、service ~1037、grant-overlay ~1270。 |
| 可维护性与复用 | 13/15 | 正向：host-capture / window-crop / frontmost 测试充分；crop 纯函数复用。扣分：control 能力扩展未按动作域拆文件。 |
| 工程卫生 | 9/10 | 大量 unit/structural tests；少量 structural 字符串耦合（已随拆分调整）。 |

## 6. 主要问题清单

### 中高：`browser-use-control.ts` ~567→~1117，单 class 承载全动作面

- 提交：`8106c1bf4`
- 文件：`apps/desktop-electron/src/browser/browser-use-control.ts`
- 问题：`BrowserUseControlPlane` 增加 dialog CDP、download、pointer 等；chrome spawn 与 HTTP 路由同居；`handle` 超长。
- 为什么是质量问题：改 click 路径需加载 dialog/download 状态；后续能力只能继续堆 private 方法。
- 优化建议：抽出 `browser-use-chrome.ts`（highlight/move spawn）；中期按 `dialog` / `download` / `pointer` 拆 action 模块或子类。

### 中：`host-capture.ts` ~232→~736，打分与 IO 混杂

- 提交：`1112cb552`、`9febc1db6`、`50edb857e`、`100065bac` 等
- 文件：`apps/desktop-electron/src/desktop-use/host-capture.ts`
- 问题：`pickFrontmostWindow` / `mergeFrontmostIdentity` 与 screenshot/crop IO 同文件（虽有测试）。
- 为什么是质量问题：改 hot-path 延迟时被迫读完整打分规则。
- 优化建议：`host-window-match.ts` 承载 pure 打分与 identity merge；host-capture 只做 drive 调用与 PNG 处理。

### 中：`DesktopUseSettingsSection` ~492→~805

- 提交：`a06f32451`、`0f8cb422b`、`e68eca04d` 等
- 文件：`apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx`
- 问题：引擎安装/更新/runtime、卸载对话框、权限组、border 开关单组件；状态字段很多。
- 为什么是质量问题：引擎卡 UI 与 load/doctor 状态机耦合，后续加 auto-update 行只能继续撑大。
- 优化建议：至少抽出 progress 小组件与引擎卡 presentational 块；load/doctor 可进 hook。

### 低：`appshot/service.ts` ~780→~1037，`triggerCapture` 仍长

- 提交：多枚 appshot fix/feat
- 文件：`apps/desktop-electron/src/appshot/service.ts`
- 问题：host 路径与 fly 动画接线堆在 service；部分已外移到 `capture-fly` / `host-shift`（正向）。
- 优化建议：继续把 route resolve + host capture 调用收到 `capture-route.ts`。

### 低：`grant-overlay.ts` 再增 ~112 行

- 提交：`e68eca04d`
- 文件：`apps/desktop-electron/src/desktop-use/grant-overlay.ts`（~1270）
- 问题：在已超大文件上继续补权限刷新相关逻辑（前一日拆分若未合入则仍为单文件）。
- 优化建议：保持 panel/position 模块边界（见 08-07 PR 若仍打开）。

## 7. 正向观察

- **AppShot pure 模块**：`window-crop`、`frontmost-cg`、`capture-fly`、`host-shift` + 对应测试。
- **engine pin / auto-update**：manifest 与 structural test 边界清晰。
- **host-capture 测试矩阵**：pid/localization/overlay 打分场景覆盖好。
- **landing posters**：静态封面 perf 改动范围克制。

## 8. Review 建议

1. Browser Use：dialog 监听生命周期、download 路径、chrome spawn 失败不崩 main。
2. AppShot dual-shift：host 路由缓存、window crop 失败回退 full-display 警告文案。
3. Desktop Use settings：install/update/stop 与 permissions re-doctor 时序。
4. 是否还有 >1000 行 Electron 控制/服务文件在当日继续膨胀。

## 9. 自动修复与 PR

总分 75 < 90，已触发自动修复。

### 修复摘要

1. `browser-use-chrome.ts`：mapGuestRect / spawnDetached / showEmbeddedBrowserChrome；control 再导出。
2. `host-window-match.ts`：pure 打分与 identity merge；host-capture 聚焦 IO。
3. `DesktopUseEngineProgressBar`：设置页 progress 小组件。

### 验证

- `bun test` browser-use-control structural + host-capture：17 pass
- `bun --filter web typecheck`：通过

### 剩余风险

- `BrowserUseControlPlane` 仍 ~1000 行（dialog/download 未拆）。
- Settings 引擎卡 JSX 仍大。
- appshot service / grant-overlay 未本轮大拆。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-08_score-75_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-08`
- 修复提交：`4ca13198f`
- PR URL：见创建后回填
