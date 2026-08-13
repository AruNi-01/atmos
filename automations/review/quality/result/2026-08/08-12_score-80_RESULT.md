# Atmos main 每日代码质量评分（2026-08-12）

## 1. 审查范围

- 昨日时间窗口：2026-08-12 00:00:00 到 2026-08-12 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `db15a5bf4` Merge PR #225 mobile UI stack）。
- 排除：无「仅 quality result 归档」提交；`0ecad7147` #217 质量修复含真实代码，按代码部分计入（正向）。
- 审查方式：以 mobile 设计系统 P0–P6（tokens / NativeWind / Host+Button）为主线；辅以 attention summary terminal context、landing/docs PostHog + Cloudflare Pages。
- 用户主工作区在无关 feature 分支且有未提交改动；修复在独立 worktree `grokbuild/quality-fix/2026-08-12`。

被审查提交（代表性，窗口内约 30+ 条业务/代码提交）：

| Hash | Author | Message |
| --- | --- | --- |
| `0ecad7147` | AruNi_Lu | refactor: address daily quality findings for 2026-08-11 (#217) |
| `ab8754dbc` | Cursor Agent | feat(mobile): P0 design system foundation — tokens, NativeWind, primitives |
| `a01b2c56b` | AarynLu | feat(core-service): base attention summary on terminal transcript |
| `b2be241d8` | AarynLu | refactor(core-service): load attention summary prompts from prompt/ |
| `f353158ab` … `aa20227df` | Cursor Agent | mobile P1–P6 visual/CTA passes, ExpoUiButton introduce→delete, CodeRabbit fixes |
| `dcfbe8ac4` | AruNi_Lu | feat(landing,docs): add PostHog web analytics (#222) |
| `e292fbc12` | AruNi_Lu | feat(landing): migrate marketing site to Cloudflare Pages + R2 (#224) |
| `54d207c21` | AruNi_Lu | ci(docs): inject PostHog env vars in Pages build workflow (#226) |

日合计约 **76 files / +4.0k / −3.2k**（窗口 diff；mobile 为绝对主力）。

## 2. 一份好代码应该是什么样

本日标准看「设计系统是否把 token / 布局 / 控件边界画清，以及大屏是否仍吞掉状态机」。Mobile 的 color/spacing/typography 应单一来源；CTA 规则应可文档化且 call site 可重复；feature screen 应把 setup 订阅、表单字段、纯函数拆开。后端 attention summary 应复用 terminal capture 而非再写一套 ANSI/预算逻辑。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；只计当日引入/放大问题。

## 4. 总分

总分：**80/100**。总体判断：**良好**。

Mobile 设计系统与 UI README 方向清晰，WorkspaceList 等有收缩；`CreateWorkspaceScreen` 与 `SettingsScreen` 多路由同文件仍是明显枢纽债。Attention `text_capture` + prompt 外置是高质量后端改动。#217 落地为正向。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 25/30 | 正向：`theme/*` + generated `@theme`、`ui/primitives` 与 layout 分层、README 明确「按钮不包 wrapper」；`terminal/text_capture.rs` 抽出供 side chat / attention 共用；attention prompt 走 `prompt/`。扣分：CreateWorkspace 仍把表单 + mutation + setup 进度 UI 绑在一屏；Settings 五路由屏同居一文件（当日 polish 固化）。 |
| 可读性与复杂度 | 20/25 | AppScreen footer/form-sheet 有清晰平台注释；CreateWorkspace 19 `useState` + setup 快照合并仍难扫读；Host+Button 样板在多屏重复（设计选择，轻微理解成本）。 |
| 体量与内聚 | 13/20 | `CreateWorkspaceScreen` ~703（+110）；`SettingsScreen` ~691 多 export；`AppScreen` 231→302。正向：`WorkspaceListScreen` 489→289。 |
| 可维护性与复用 | 13/15 | 正向：`expo-ui-button-styles` / modifiers、`create-workspace-readiness` 已有单测、theme css-variables tests。扣分：landing/docs PostHog provider 与 `lib/posthog.ts` 近乎逐字复制。 |
| 工程卫生 | 9/10 | 正向：同日删掉中间层 ExpoUiButton、硬编码色替换 token、CodeRabbit a11y。扣 1：同日经历厚 wrapper→删除的中间态（最终态干净）。 |

## 6. 主要问题清单

### 中：`CreateWorkspaceScreen` ~703 行 / 19 `useState`

- 提交：`ab8754dbc`、P1–P6 视觉与 CTA 提交（Host+Button 迁移放大 JSX）
- 文件：`apps/mobile/src/features/workspaces/CreateWorkspaceScreen.tsx`
- 问题：表单字段、GitHub issue/PR、create mutation、setup progress WS 订阅、确认 TODO / retry 与 7 处 Host+Button 同居。
- 为什么是质量问题：改 setup 日志合并策略必须加载整份创建表单。
- 优化建议：`create-workspace-helpers.ts`（slugify / ANSI clean / formatSetupStatus）；`use-create-workspace-setup.ts` 承载订阅与 snapshot。

### 中：`SettingsScreen.tsx` 五路由屏 + 共享行组件 ~691 行

- 提交：P1/P5 Settings 视觉与 CTA 提交（当日持续编辑该枢纽）
- 文件：`apps/mobile/src/features/settings/SettingsScreen.tsx`
- 问题：`SettingsIndexScreen` / `Relay` / `Computers` / `ComputerDetail` / `Register` + Profile/List 行组件同文件；`app/settings/*` 均从该桶 import。
- 为什么是质量问题：改 Relay URL 校验会与 Computers 列表 diff 纠缠。
- 优化建议：按路由拆 `Settings*Screen.tsx` + `settings-shared.tsx`；`SettingsScreen.tsx` 仅 barrel re-export。

### 低：PostHog provider 双份复制

- 提交：`dcfbe8ac4`
- 文件：`apps/landing/src/components/providers/posthog-provider.tsx`、`apps/docs/src/components/posthog-provider.tsx`（及两边 `lib/posthog.ts`）
- 问题：初始化与 pageview 捕获逻辑几乎相同。
- 优化建议：中期抽到可被两个 Next app 引用的小包；短期可接受但应单点改 capture 策略。

### 低：Host+Button 样板在 feature 屏重复

- 提交：P3–P6 CTA 迁移
- 说明：与 `ui/README.md`「不要包 Atmos Button」一致，**不作为违反分层**；但 Create/Import 等屏 6–7 次相同 Host 配置抬高扫描成本。保持 modifiers/styles helper 即可。

## 7. 正向观察

- **Mobile design system**：`colors` → css-variables → generated `@theme` + `MobileThemeVariablesProvider` 链路清楚；spacing/radii/typography 分文件。
- **UI 契约文档**：`apps/mobile/src/ui/README.md` 写清 primitives / layout / feature / button 规则，减少后续分叉。
- **删掉 ExpoUiButton**：最终态直接用官方 Universal `Host`+`Button`，避免二次包装与双层 chrome。
- **WorkspaceListScreen 瘦身**（~489→289）与 welcome headline 抽离。
- **attention summary**：`text_capture.rs` 共享 ANSI/预算；prompt 外置到 `prompt/attention-summary/`。
- **#217 合入**：TokenUsage Overview / Behaviour settings 等前日质量拆分落地。
- **Pages 构建脚本** `build-pages-landing.mjs` 结构可读（move-aside / restore / headers）。

## 8. Review 建议

1. Create Workspace：setup progress 与 create mutation 竞态（先 progress 后 onSuccess）。
2. Settings form-sheet + sticky footer：空白 sheet / footer 遮挡回归。
3. Host+Button：iOS double chrome、Android stretch、disabled seedColor。
4. Attention summary：transcript 预算与 changed-files-only 是否满足摘要质量。
5. PostHog：双 app key 与 pageview 是否重复计数。

## 9. 自动修复与 PR

总分 80 < 90，已触发自动修复。

### 修复摘要

1. **`create-workspace-helpers.ts`**：`slugify` / `cleanSetupOutput` / `formatSetupStatus` / `isWsNotification` / `SetupSnapshot`。
2. **`use-create-workspace-setup.ts`**：setup 订阅、snapshot 合并、`beginAwaitingSetup`。
3. **`CreateWorkspaceScreen`**：~703→~591，专注表单 + mutations + 布局。
4. **Settings 拆分**：`SettingsIndex|Relay|Computers|ComputerDetail|Register`Screen + `settings-shared`；`SettingsScreen.tsx` barrel（路由 import 路径不变）。

### 验证

- `bun --filter @atmos/mobile typecheck`：通过
- `git diff --check`：通过

### 剩余风险

- CreateWorkspace 表单字段状态仍多，未拆 form model。
- PostHog 双份复制未收敛。
- Settings 各屏 import 面偏宽（为保编译安全的保守 import）。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-12_score-80_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-12`
- 修复提交：（见 PR）
- PR URL：（创建后回填）
