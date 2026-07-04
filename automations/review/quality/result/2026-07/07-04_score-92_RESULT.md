# Atmos main 每日代码质量评分（2026-07-03）

## 1. 审查范围

- 昨日时间窗口：2026-07-03 00:00:00 到 2026-07-03 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`，已同步到 `origin/main`，同步后最新提交为 `11a8cf1f4262b3f025a520bc39a8739ec1f37711`。
- 排除：`f4d4f1b`（`docs: add code quality review result 2026-07-03 score 82`）只归档 `automations/review/quality/result/` 结果文件，不参与本次评分。
- 审查方式：以 `c2279d9^..11a8cf1` 的日终净 diff 为主，排除 automation 结果目录；再按需要查看关键文件上下文与对应测试。

被审查提交：

| Hash | Author | Message |
| --- | --- | --- |
| `c2279d9` | AarynLu | Fix terminal agent input interactions |
| `29afaed` | AarynLu | chore(desktop): release 2026.7.3-beta.2 |
| `0f51e0f` | AarynLu | fix: scope terminal side chat status updates |
| `0c96692` | AarynLu | refactor: split terminal side chat workflow |
| `ec4e9d9` | AarynLu | fix: harden terminal side chat interactions |
| `226e3dc` | AarynLu | fix: preserve terminal side chat local state |
| `a56e816` | AarynLu | fix: scope terminal side chat record merges |
| `6c9d1fc` | AruNi_Lu | Merge pull request #147 from AruNi-01/codex/quality-fix/2026-07-02 |
| `1d2f11a` | AarynLu | fix(desktop): stabilize startup and release checks |
| `6fe8dd4` | AarynLu | feat: refine app interactions |
| `0303823` | AarynLu | chore(desktop): release 2026.7.3-beta.3 |
| `cb84ef5` | AarynLu | chore(desktop): release 2026.7.3 |
| `0a31786` | AarynLu | Remove workspace notes surfaces |
| `085e88e` | AarynLu | docs(landing): update changelog for 2026.7.3 |
| `11a8cf1` | AarynLu | fix(web): correct prompt composer slash handling |

## 2. 一份好代码应该是什么样

本次质量标准关注“后续维护者是否能快速判断职责边界、修改入口和风险范围”。好的变更应把协议适配、业务规则、持久化和 UI 状态放在各自层级；复杂交互要拆出可命名的纯逻辑、hook 和组件；新文件体量可以随问题变大，但必须换来更清楚的内聚；文案、协议类型和测试也要保持同步，不能依赖隐式记忆。

## 3. 评分方法

- 100 分制，固定维度：设计与分层 30 分、可读性与复杂度 25 分、体量与内聚 20 分、可维护性与复用 15 分、工程卫生 10 分。
- 高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一根因不重复作为独立问题计数，只在确实影响多个维度时做少量交叉扣分。
- 体量阈值只作为 review 信号：UI 组件超过 250 行、hook 超过 300 行、参数明显过多时需要检查职责是否仍清晰；如果文件虽大但边界明确，则只轻扣或不扣。

## 4. 总分

总分：92/100。总体判断：优秀。昨日 main 的质量方向明显比前一日更稳，主要问题停留在局部可维护性和清理卫生层面，未达到自动修复阈值。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 28/30 | `0c96692` 拆分 side chat 是正向改进，但 `TerminalSideChatModal` 的 props 同时承载 workspace、source pane、terminal refs、layout target 和生命周期回调，组件边界仍偏宽。 |
| 可读性与复杂度 | 23/25 | `TerminalSideChatModal` 和 `use-side-chat-modal-layout` 都接近 400 行，主路径可读但交互事件、refs、tabs、terminal 生命周期仍需要跨文件联动理解。 |
| 体量与内聚 | 18/20 | 前一日 1200+ 行 side chat hook 已被拆开，这是明显改善；但新增 modal/layout 两个文件仍超过体量关注阈值，后续可继续拆 header/content/geometry 纯逻辑。 |
| 可维护性与复用 | 14/15 | `0a31786` 删除 workspace note surface 后，少量 note panel 翻译键仍留在 locale 文件中，搜索和后续文案维护会有轻微噪音。 |
| 工程卫生 | 9/10 | 有针对性测试覆盖，未发现调试残留；主要扣分来自删除功能后的 unused i18n 清理未完全收口。 |

## 6. 主要问题清单

### 低：side chat modal 的 props 合同偏宽，后续扩展容易继续膨胀

- 提交：`0c96692`，后续由 `ec4e9d9`、`226e3dc`、`6fe8dd4` 继续修正交互。
- 文件：`apps/web/src/features/terminal/components/TerminalSideChatModal.tsx`，`TerminalSideChatModalProps` 约第 35-54 行，主体渲染约第 120-328 行。
- 问题：组件 props 同时包含 active id、workspace/project 身份、source terminal 身份、terminal refs、fly target ref、缩放比例、records 和 6 个回调。它比前一日的大 hook 清晰很多，但组件入口仍把多个变化轴压在同一个 props 平面上。
- 为什么是质量问题：当后续再加 side chat 状态、权限、agent input 或独立窗口能力时，调用方和 modal 都容易继续追加参数，导致组件边界靠约定维护，而不是靠类型结构表达职责。
- 优化建议：把 props 分组成 `workspaceContext`（workspace/project/local path）、`sourceContext`（source pane/window/surface）、`terminalRuntime`（refs、scale、fly target）和 `actions`；同时把 header tabs/close controls 抽成 `TerminalSideChatModalHeader`，把 terminal content 抽成 `TerminalSideChatPanel`，让 modal 只负责框架和布局组合。

### 低：删除 workspace notes surface 后仍残留未使用翻译键

- 提交：`0a31786`
- 文件：`apps/web/messages/en.json`、`apps/web/messages/zh.json`，`appShell.centerStagePanels.notesTitle` 约第 912 行，`Workspace.components.notePanel` 约第 3169 行。
- 问题：`WorkspaceNotePanel.tsx` 已删除，`CenterStagePanels.tsx` 也移除了 specs 文件旁路 note panel，但对应 `notesTitle` 和 `notePanel` locale keys 仍保留；`rg` 只在 locale 文件中命中这些键。
- 为什么是质量问题：这不是运行时缺陷，但会让设置/文案搜索误以为 note panel surface 仍存在，也增加后续翻译同步时的无效维护面。
- 优化建议：在后续清理提交中同时删除 en/zh 两套 unused keys；如果 note panel 只是暂时隐藏，应把保留原因落到代码或 spec 中，而不是只靠未引用翻译键表达。

## 7. 正向观察

- `0f51e0f` 把 side chat 状态更新收敛到 workspace-scoped repo 方法，服务层不再先写后验，并补了 `set_side_chat_status_requires_matching_workspace` 回归测试，修复了前一日高严重度问题。
- `0c96692` 把前一日超大 `use-terminal-side-chats.tsx` 拆成 records hook、layout hook、modal/layer/dots 组件和纯 helper，日终 coordinator 降到约 260 行，职责边界明显改善。
- `a56e816` 给 record merge 的 workspace id collision 和同 workspace 保留本地状态补了纯函数测试，避免隐式状态规则只藏在 hook 中。
- `11a8cf1` 将 mention 文件搜索抽成 `mention-file-search.ts` 纯函数，并补了目录查询和 slash handling 测试；PromptComposer 虽仍是历史大文件，但本次新增逻辑有可验证边界。
- `1d2f11a`/`6fe8dd4` 的桌面更新检查改为 Tauri command 优先用 `gh`、再用 native HTTP fallback，Web 侧不再直接承担 GitHub release 获取，桌面/浏览器边界更清楚。
- 用户可见 copy 仍同步维护 `apps/web/messages/en.json` 和 `apps/web/messages/zh.json`，没有出现只改单语种的明显问题。

验证记录：

- `bun test apps/web/src/features/terminal/lib/__tests__/terminal-side-chat.test.ts apps/web/src/features/welcome/components/__tests__/prompt-composer-appshot-paste.test.tsx apps/web/src/features/welcome/hooks/__tests__/use-welcome-mention-search.test.ts apps/web/src/app-shell/header-action-controls-utils.test.ts`：15 passed。
- `cargo test -p core-service side_chat`：3 passed。

## 8. Review 建议

人工 review 今天最值得重点盯：

1. side chat refactor 后的行为等价性，尤其 hide/show/close、初始 agent command 发送、workspace/source scoping 和多个 side chat tab 的本地状态保留。
2. `TerminalSideChatModal` 后续是否继续增长；若新增交互，优先拆 header、content panel 或 context object，而不是追加平铺 props。
3. PromptComposer 仍是历史超大 contenteditable 组件，本次新增测试覆盖了关键边界；后续改动应继续把纯文本/范围操作抽到可单测 helper。
4. workspace notes surface 删除后，确认产品上是否还需要保留 note panel 文案；如果不需要，下一次清理 unused locale keys。

## 9. 自动修复与 PR

未触发自动修复。原因：总分 92，大于等于 90；本次只需要归档并推送结果文件，不创建修复分支或 PR。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/review/quality/result/2026-07/07-04_score-92_RESULT.md`

## 11. 结果提交与推送

- 推送目标分支：`origin/main`
- 结果提交将在本报告写入后创建，提交信息为 `docs: add code quality review result 2026-07-04 score 92`。提交 hash 以推送后的 `main` 历史记录为准。
