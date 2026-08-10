# Atmos main 每日代码质量评分（2026-08-10）

## 1. 审查范围

- 昨日时间窗口：2026-08-10 00:00:00 到 2026-08-10 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`（日终 tip `625b584a0`）。
- 排除：窗口内无「仅改 quality result」的归档提交；#210 质量修复含真实代码，按代码部分计入（正向）。
- 审查方式：以 Tasks 统一面 + nested GitHub drawers 为主线，辅以 #210 落地、CLI min-version、APP-056 文档。
- 用户工作区在无关 feature 分支；修复在独立 worktree `grokbuild/quality-fix/2026-08-10`。

被审查提交：

| `c2849d505` | AarynLu | feat(web): add Tasks surface with nested GitHub drawers |
| `d6cdffae4` | AarynLu | feat(web): merge Tasks surface with nested GitHub drawers |
| `2d6736730` | AarynLu | chore(desktop-electron): release 2026.8.10 |
| `b11375fc3` | AruNi_Lu | Merge pull request #210 from AruNi-01/grokbuild/quality-fix/2026-08-08 |
| `38ed7d393` | AarynLu | docs(landing): add Atmos Desktop 2026.8.10 changelog entry |
| `f0ddd9031` | AarynLu | fix(web): hydrate Task GitHub search with default is:open on first load |
| `10a042fd5` | AarynLu | fix(web): wrap long paths in Disk Analyzer delete popover |
| `ef32f25d6` | AarynLu | fix(desktop): use canonical CLI with package min-version gate |
| `ffff90418` | AarynLu | feat(github): include SECURITY.md in create-issue template chooser |
| `8f8bbe758` | AruNi Lu | docs(APP-056): Hub identity, usage share, and device credentials |
| `625b584a0` | AarynLu | docs(APP-056): merge Hub identity, usage share & device credentials |

## 2. 一份好代码应该是什么样

本日标准看「新 Tasks/GitHub 列表是否可按数据流导航」。URL 过滤/排序/查询应纯函数化；创建 Issue 的 template 字段渲染应与 Dialog 编排分离；Panel 应把 search fetch、table、drawer controller 的边界画清。#210 对 host-capture / browser-use chrome 的拆分是正确对照。

## 3. 评分方法

- 100 分制：设计与分层 30、可读性与复杂度 25、体量与内聚 20、可维护性与复用 15、工程卫生 10。
- 高/中/低约扣 8–15 / 3–7 / 1–2；只计当日引入/放大问题。

## 4. 总分

总分：76/100。总体判断：良好。

Tasks 功能切分出 lib/hook/drawer 子目录方向正确，但同日新增多个 400–900 行 UI 枢纽（CreateIssueDialog、Panel、DrawerHost），维护成本偏高。#210 质量修复抵消部分历史枢纽债。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 24/30 | 正向：`task-github-query-sync`、`find-linked-workspace`、`github-issue-templates`、drawer types/insets、#210 chrome/match 拆分。扣分：CreateIssueDialog 内嵌 TemplateFormField/MultiToggle；Panel 单组件吞 URL+query+toolbar+table+drawer。 |
| 可读性与复杂度 | 19/25 | Panel 中 nuqs / useQueries / portal header / workspace actions 交织；CreateIssue 表单与 template 动态字段长链。 |
| 体量与内聚 | 12/20 | 日终新建：CreateIssueDialog ~891、Panel ~828、DrawerHost ~656、Table ~476、FilterMenu ~398、templates lib ~453；engine `github/mod.rs` +~1.5k。 |
| 可维护性与复用 | 12/15 | 正向：query-sync 纯函数、templates 解析独立。扣分：template 字段 UI 未组件化时难在其他创建入口复用。 |
| 工程卫生 | 9/10 | 合并 polish、SECURITY 模板、CLI min-version 文档；缺 Tasks 单元测试文件。 |

## 6. 主要问题清单

### 中：`TaskGithubCreateIssueDialog` ~891 行（含 TemplateFormField）

- 提交：`c2849d505`、`d6cdffae4`、`ffff90418`
- 文件：`apps/web/src/features/task/components/TaskGithubCreateIssueDialog.tsx`
- 问题：Dialog 编排、repo/template 选择、动态 form fields、MultiToggle 同文件；`TemplateFormField` ~214 行。
- 为什么是质量问题：改 markdown/checkboxes 字段渲染必须加载整份创建流。
- 优化建议：抽出 `TaskGithubTemplateFormFields.tsx`（TemplateFormField + MultiToggleGroup + requiredMessage）。

### 中：`TaskGithubPanel` ~828 行单组件

- 提交：`c2849d505`、`d6cdffae4`、`f0ddd9031`
- 文件：`apps/web/src/features/task/components/TaskGithubPanel.tsx`
- 问题：URL state、search query 组装、assignees/labels options、portal 工具栏、workspace 链接动作全在一组件。
- 为什么是质量问题：改 filter 协议与改 table 行点击交叉。
- 优化建议：`task-github-panel-model.ts` 承载 PAGE_SIZE/SORT/filtersFromUrl；中期 `useTaskGithubListQuery` hook 下沉 search。

### 中：`TaskGithubDrawerHost` ~656 行（DrawerLayer ~227）

- 提交：`c2849d505`、`d6cdffae4`
- 文件：`apps/web/src/features/task/components/task-github-drawer/TaskGithubDrawerHost.tsx`
- 问题：stack 状态机与单层 DrawerLayer 渲染同居；常量多。
- 为什么是质量问题：改 nest peek 动画时需读完整 open/close 控制器。
- 优化建议：`TaskGithubDrawerLayer.tsx` + 共享 nest 常量模块（本次未强拆，避免 drawer 时序回归）。

### 低：`core-engine` `github/mod.rs` +~1486 / API router 增模板接口

- 提交：`c2849d505` 等
- 文件：`crates/core-engine/src/github/mod.rs`（~2491）、`apps/api/src/api/ws/router/github.rs`
- 问题：历史大文件继续增 search/templates 解析。
- 优化建议：中期按 issue/pr/search/templates 拆 `github/` 子模块。

## 7. 正向观察

- **Tasks 功能分层**：ManagementView 较薄；drawer 子目录 + types/insets；lib 纯函数（query-sync、linked workspace、templates）。
- **#210 合入**：host-window-match、browser-use-chrome、EngineProgressBar 落地。
- **CLI min-version gate** 与 agents reference 文档同步。
- **APP-056** 规格文档齐备（非代码债）。

## 8. Review 建议

1. Tasks GitHub：`is:open` 默认查询、filter URL 往返、创建 issue 模板校验。
2. Nested drawer：多层 peek、并行 exit、portaled menus z-index。
3. Linked workspace：enter vs create 路径与 project 解析。
4. 新建 UI 是否继续出现 800+ 行单组件。

## 9. 自动修复与 PR

总分 76 < 90，已触发自动修复。

### 修复摘要

1. `TaskGithubTemplateFormFields.tsx`：TemplateFormField、MultiToggleGroup、requiredMessage。
2. CreateIssueDialog 瘦身约 891→617。
3. `task-github-panel-model.ts`：PAGE_SIZE、SORT_OPTIONS、filtersFromUrl。

### 验证

- `bun --filter web typecheck`：通过

### 剩余风险

- Panel / DrawerHost 仍大；未拆 search hook 与 DrawerLayer。
- 缺 Tasks 专项单测。

## 10. 结果文件

- `automations/review/quality/result/2026-08/08-10_score-76_RESULT.md`

## 11. 结果提交与推送

- 修复分支：`grokbuild/quality-fix/2026-08-10`
- 修复提交：`03ab7795e`
- PR URL：见创建后回填
