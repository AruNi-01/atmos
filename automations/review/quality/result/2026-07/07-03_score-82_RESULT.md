# Atmos main 每日代码质量评分（2026-07-02）

## 1. 审查范围

- 昨日时间窗口：2026-07-02 00:00:00 到 2026-07-02 23:59:59（UTC+8 / Asia/Shanghai）。
- 分支：`main`，已同步到 `origin/main` 后筛选。
- 排除：未发现时间窗口内只修改 `automations/review/quality/result/` 的归档提交；PR #145 合并带入的 2026-07-01 评分归档文件不计入质量评分。

被审查提交：

| Hash | Author | Message |
| --- | --- | --- |
| `289cc2a` | AarynLu | fix: reveal files in right sidebar |
| `bb8ee51` | AruNi_Lu | Merge pull request #145 from AruNi-01/aarynlu/runtime-workbench-i18n |
| `e5d0aa0` | AarynLu | chore: adopt calendar release versions |
| `10d4f13` | AarynLu | docs: expand desktop 2026.7.2 changelog |
| `0a51833` | AarynLu | docs: normalize landing changelog dates |
| `6ec65fa` | AarynLu | Add local computer switch fallback and copy |
| `4da4b47` | AarynLu | chore(skills): add atmos docs writing skill |
| `03635a8` | AarynLu | chore(skills): add atmos specs view skill |
| `e01f276` | AarynLu | chore(skills): generalize atmos docs writing skill |
| `35a21e0` | AarynLu | fix: constrain overview text sections |
| `730b963` | AarynLu | fix: map skill agent icons |
| `0d466f3` | AarynLu | fix: show desktop runtime as Atmos Server |
| `d218b28` | AarynLu | docs: refresh user docs and fix docs layout |
| `79224ef` | AarynLu | fix: preserve terminal AI input shortcuts and focus |
| `704f777` | AarynLu | docs(specs): add side chat and architecture review plans |
| `9926196` | AarynLu | feat(agent-hooks): version managed hooks and carry terminal context |
| `d87e121` | AarynLu | feat(terminal): add tmux-backed side chats |
| `a65e2ba` | AarynLu | fix(agent): use Cursor yolo for interactive launches |
| `5cde924` | AarynLu | feat(preview): add follow-cursor hover labels |
| `4fdde8d` | AarynLu | feat(web): add breakout error pages |
| `93ee36a` | AarynLu | fix(desktop): refresh browser web runtime config |
| `78f8db6` | AarynLu | chore(desktop): release 2026.7.3-beta.1 |
| `42436db` | AarynLu | feat: wire terminal sidechat actions through websocket flow |
| `8ed754c` | AarynLu | feat: refine web terminal UX and desktop launcher integration |
| `e355bff` | AarynLu | chore: remove obsolete review CLI reference |

## 2. 一份好代码应该是什么样

本次评分把“维护者能否低成本理解、定位和安全修改”作为核心标准。好的代码应当职责清楚、层次方向正确、协议和数据边界一致，复杂交互要拆成可命名的状态机/服务/组件，而不是把 IO、状态编排、视图渲染和协议细节塞进同一个文件。重复实现和隐式约定会被扣分，只有确实由昨日提交引入或放大的问题才计入。

## 3. 评分方法

- 100 分制，维度为：设计与分层 30 分、可读性与复杂度 25 分、体量与内聚 20 分、可维护性与复用 15 分、工程卫生 10 分。
- 高严重度通常扣 8-15 分，中严重度扣 3-7 分，低严重度扣 1-2 分；同一根因不重复扣分。
- 体量阈值只作为信号：文件超过 800 行、UI 组件超过 400 行、函数/组件承担多阶段流程时，只有同时出现职责混杂才扣分。

## 4. 总分

总分：82/100。总体判断：良好，但存在需要尽快修正的局部结构和协议质量问题。

## 5. 分项评分

| 维度 | 得分 | 扣分原因 |
| --- | ---: | --- |
| 设计与分层 | 23/30 | `42436db` 的 side chat 状态更新先写库再校验 workspace，服务边界把“归属校验”放在副作用之后。 |
| 可读性与复杂度 | 20/25 | `d87e121`/`8ed754c` 新增的 `use-terminal-side-chats.tsx` 同时处理 WS、持久化、prompt 构造、modal 拖拽/缩放和 Terminal 渲染，阅读主路径成本偏高。 |
| 体量与内聚 | 16/20 | `apps/web/src/features/terminal/hooks/use-terminal-side-chats.tsx` day-end 版本 1278 行；`crates/core-service/src/service/terminal/management.rs` day-end 版本 1144 行，新增 side chat 职责继续压入既有大文件。 |
| 可维护性与复用 | 14/15 | `5cde924` 在 TS preview helper 与打包 JS runtime 中重复 follow-cursor label 动画逻辑，参数已经出现差异。 |
| 工程卫生 | 9/10 | `terminal_side_chat_close` API 实际返回 `{ closed: true }`，Web 类型声明为 `{ ok: boolean }`，存在协议合同漂移。 |

## 6. 主要问题清单

### 高：side chat 状态更新先写入后校验 workspace

- 提交：`42436db`
- 文件：`crates/core-service/src/service/terminal/management.rs`，day-end 版本 `set_side_chat_status` 约第 229-248 行；`crates/infra/src/db/repo/terminal_side_chat_repo.rs`，`update_status`
- 问题：服务层调用 repo 只按 `side_chat_id` 更新状态，更新完成后才检查 `model.workspace_guid != workspace_id`。如果调用方带错 workspace，记录已经被写成新状态，再返回 NotFound。
- 为什么是质量问题：归属校验必须先于副作用，尤其这种 API 以 `workspace_id + side_chat_id` 作为显式边界时，repo 方法只接收 `side_chat_id` 会把业务约束藏在调用方记忆里。
- 优化建议：把 repo 方法改为 `update_status_in_workspace(workspace_guid, side_chat_id, status)`，SQL `UPDATE` 和回读都带 workspace 过滤；服务层只处理 NotFound；补测试验证错误 workspace 不改变原记录。

### 中：terminal side chat 前端 hook 职责过宽

- 提交：`d87e121`、`8ed754c`
- 文件：`apps/web/src/features/terminal/hooks/use-terminal-side-chats.tsx`
- 问题：一个 hook 文件同时包含 side chat 记录加载/合并、WS API 调用、tmux prompt 构造、颜色选择、modal 拖拽/缩放、tabs UI、Terminal 生命周期、agent input overlay 和 URL 参数处理。
- 为什么是质量问题：这不是单纯行数问题，而是多条变化轴绑在一起；未来修改 prompt 策略、持久化状态或 modal 手势时，都需要理解同一个 1200+ 行文件的其他副作用。
- 优化建议：拆成 `useTerminalSideChatRecords`（加载、合并、状态 API）、`useSideChatModalLayout`（拖拽/缩放与 bounds）、`TerminalSideChatModal` 组件文件、`side-chat-prompt.ts` 纯函数；hook 只返回 `startSideChat`、records 状态和视图组合点。

### 中：preview follow-cursor label 逻辑重复且开始分叉

- 提交：`5cde924`
- 文件：`apps/web/src/features/run-preview/lib/preview-helper/overlay.ts`、`packages/shared/preview/preview-runtime.js`
- 问题：两处都实现了字符 morph、跟随光标、reduced-motion、边界 clamp 和 requestAnimationFrame 动画；TS 版本使用 spring-like velocity，JS runtime 使用不同插值参数和样式。
- 为什么是质量问题：preview helper 与 runtime 是同一产品行为的两个投放面，重复算法会让修复动画卡顿、定位越界或可访问性问题时需要双改，且容易继续分叉。
- 优化建议：抽出可生成 TS/JS 的 shared helper，或至少把参数表、文本截断、定位和 reduced-motion 策略集中成一个同步源，再由两个 runtime 包装 DOM 创建差异。

### 低：side chat close 响应类型与服务端实际返回不一致

- 提交：`d87e121`/`42436db`
- 文件：`apps/web/src/api/ws-api.ts`、`apps/api/src/api/ws/router/terminal.rs`
- 问题：Web 声明 `terminalSideChatApi.close` 返回 `{ ok: boolean }`，服务端返回 `workspace_id`、`side_chat_id`、`closed`，没有 `ok`。
- 为什么是质量问题：当前调用方忽略返回值所以影响有限，但协议类型不准会误导后续调用方，也降低 WS API 的可测试性。
- 优化建议：服务端返回 `ok: true` 并将 Web 类型扩为 `{ ok: boolean; closed: boolean }`，或改成显式 DTO，两端保持一处语义。

## 7. 正向观察

- 昨日大部分交互能力仍沿 WebSocket 扩展，没有为 side chat 另开 REST 并行通道，符合项目传输边界。
- API router 基本保持薄层，核心 side chat 操作落在 `core-service`，持久化通过 `infra` repo 暴露。
- agent hook 版本化抽出了共享版本解析/状态 helper，并补了版本解析测试。
- Web 用户可见 copy 同步更新了 `apps/web/messages/en.json` 和 `apps/web/messages/zh.json`，没有只改单语种。
- docs/specs 变更有中英文和测试计划配套，结构上比散落说明更可维护。

## 8. Review 建议

人工 review 今天最值得重点盯：

1. side chat 的 workspace / source pane / tmux window 归属边界，确认所有写操作都先按作用域定位。
2. `use-terminal-side-chats.tsx` 的拆分路线，优先拆状态/持久化和 modal layout，避免继续堆 UI 副作用。
3. preview follow-cursor 两份 runtime 是否能收敛同步源，至少先锁定参数和行为合同。
4. WS DTO 与 Web TS 类型是否有系统性生成或集中校验的空间。

## 9. 自动修复与 PR

- 触发原因：总分 82，低于 90。
- 修复分支：`codex/quality-fix/2026-07-02`
- 修复提交：`0f51e0f0b` (`fix: scope terminal side chat status updates`)
- PR：https://github.com/AruNi-01/atmos/pull/147
- 已修复：repo 更新状态时加入 workspace 过滤；服务层不再先写后验；新增 `set_side_chat_status_requires_matching_workspace` 测试；`terminal_side_chat_close` 返回 `ok: true` 并同步 Web 类型。
- 未修复：side chat 大 hook 拆分、preview follow-cursor runtime 复用属于较大结构治理，已保留为 PR review 重点。
- 标签：已添加 `codex`；仓库不存在 `codex-automation`，已跳过。
- 验证通过：`cargo fmt`、`cargo test -p core-service set_side_chat_status_requires_matching_workspace`、`cargo check -p api`、`bun --filter web typecheck`、`git diff --check`。
- 验证备注：`cargo check -p api` 曾同步当前 main 中无关的 `Cargo.lock` desktop beta2 版本漂移，已恢复，未纳入 PR。

## 10. 结果文件

本次 Markdown 结果文件路径：`automations/review/quality/result/2026-07/07-03_score-82_RESULT.md`

## 11. 结果提交与推送

- 结果文件随修复 PR #147 的后续提交推送到 `origin/codex/quality-fix/2026-07-02`。
- 推送目标分支：`codex/quality-fix/2026-07-02`
- PR URL：https://github.com/AruNi-01/atmos/pull/147
