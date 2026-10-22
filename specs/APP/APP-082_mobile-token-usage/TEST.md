# TEST · APP-082 Mobile Token usage

## Test strategy

纯规则用 bun 单测：指示线颜色、深底图标着色、Publish 禁用、Computer 去重、合并、fan-out、范围选择。这些不依赖 iOS 模拟器。

界面是否真的没裁切、顶边是否可见、长按竖线是否画在柱上，需要 iOS 模拟器目视。本环境没有模拟器时记为未运行。

不新增 Playwright。Mobile 不是 web。agent-browser 覆盖不了这页原生控件。

## Coverage map

| PRD | 场景       |
| --- | ---------- |
| M1  | S1         |
| M2  | S2         |
| M3  | S3         |
| M4  | S4、S5     |
| M5  | S6、S7、S8 |

## Execution map

| ID  | 层级        | 命令                                                                                                                                                                                                                                            | 状态               |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| S1  | bun         | `cd apps/mobile && bun test src/features/token-usage/column-indicator.test.ts`                                                                                                                                                                  | 见 Coverage Status |
| S2  | bun         | `cd apps/mobile && bun test src/features/terminal/agent-glyph-tint.test.ts`                                                                                                                                                                     | 见 Coverage Status |
| S3  | 手动        | iOS 模拟器打开 Token usage，看四张卡数字底部                                                                                                                                                                                                    | 未运行             |
| S4  | bun         | `cd apps/mobile && bun test src/features/token-usage/publish-form.test.ts`                                                                                                                                                                      | 见 Coverage Status |
| S5  | 手动        | iOS 模拟器打开分享 sheet 的 Publish，看顶边、禁用态、Turn off                                                                                                                                                                                   | 未运行             |
| S6  | bun         | `cd apps/mobile && bun test src/features/token-usage/lib/__tests__/unique-computers.test.ts src/features/token-usage/usage-scope.test.ts`                                                                                                       | 见 Coverage Status |
| S7  | bun         | `cd apps/mobile && bun test src/features/token-usage/lib/__tests__/merge-token-usage-overviews.test.ts src/features/token-usage/lib/__tests__/fetch-token-usage-scope.test.ts src/features/token-usage/lib/__tests__/cloud-api-clients.test.ts` | 见 Coverage Status |
| S8  | 手动        | iOS 模拟器：两台 Computer 时左上角菜单，All 与单台切换                                                                                                                                                                                          | 未运行             |
| S9  | 类型与 lint | `bun --filter @atmos/mobile typecheck` 与仓库 `bun lint`（`--max-warnings=455`）                                                                                                                                                                | 见 Coverage Status |

## Scenarios

### S1 指示线

- Given 柱状图正在显示某一列的 popover
- When 计算指示线
- Then 线的 x 是列中心，y 从 0 到图表高度；浅色主题描边为 `rgba(15,23,42,0.45)`，深色为 `rgba(255,255,255,0.55)`
- Signals：`column-indicator.test.ts` 断言坐标和颜色

### S2 深底图标

- Given popover 使用深灰底
- When 给 agent 图标做深底着色
- Then 白线稿（如 cursor）不涂色；黑线稿（如 cline）涂成给定的浅色 label
- And 浅色主题、非深底时，白线稿仍涂成 label，黑线稿不涂
- Signals：`agent-glyph-tint.test.ts`

### S3 统计卡数字

- Given 四张卡有数字
- When 在 iOS 上渲染
- Then 数字底部笔画完整，装饰图形仍可被卡片边缘裁切
- Signals：未运行（无 iOS 模拟器）。实现上 `StatCard` 使用带 `lineHeight` 的 `Text`，不再走 NumberFlow 槽

### S4 Publish 禁用

- Given 有 overview
- When 页面未发布且 handle 规范化后不足 3 个字符
- Then 主按钮禁用
- When 未发布且 handle 至少 3 个字符
- Then 主按钮可用，文案是 Publish
- When 已发布且 handle、visibility、github、x 都与已保存值相同
- Then 主按钮禁用，文案是 Update
- When 已发布且只改了其中一项（未 claimed 的 handle、visibility、github 或 x）
- Then 主按钮可用
- When claimed 后只改草稿里的 handle
- Then 主按钮仍禁用
- When 草稿相对上次写入表单的快照有改动，随后又拉到新的 usage page
- Then 草稿保持不动
- When 草稿没有改动
- Then 用新的 usage page 覆盖表单
- Signals：`publish-form.test.ts`

### S5 Publish 外观

- Given 打开分享 sheet 的 Publish
- When 看 Handle 输入框和按钮
- Then 输入框四边都有边框；无改动时 Update 是灰底；Turn off 是红色文字，不是和 Update 一样的实心按钮
- Signals：未运行（无 iOS 模拟器）

### S6 范围选择

- Given 已登录且去重后至少两台
- When 还没有手动选择
- Then 选中当前 Computer，不是 All，查询走当前连接
- When 选择 All
- Then `isAll` 为真，不走当前连接的单机 query
- When 选择不存在的 key
- Then 回到当前 Computer
- When 未登录或不足两台
- Then 不显示选择器，范围视为当前机
- When 当前连接的机器不在列表里，且还没有手动选择
- Then 不是 All，也不是列表第一台；`isCurrentScope` 为真，`selectedKey` 为 null
- When 这种情况下再点 All
- Then `isAll` 为真
- Signals：`usage-scope.test.ts`、`unique-computers.test.ts`、`shouldShowComputerSelect`

### S7 拉取与合并

- Given All 或另一台
- When 拉取
- Then 远程请求体是 `token_usage_overview_get`，`refresh: true`，`try_cookies: false`，其余筛选为 null，结束时 disconnect
- And 当前机走 `fetchCurrent`，其它机走 `fetchRemote`，并发失败记入 `partial_warnings`，全部失败抛 `none-reached`
- And cursor / trae / warp 日序列重合时不重复相加
- Signals：复制的 web 单测加上 mobile 的 import 路径

### S8 菜单位置

- Given 满足 S6 的显示条件
- When 看 Token usage 导航栏
- Then Computer 按钮在左上角按钮组的最左边，点开可选 All 或某一台
- Signals：未运行（无 iOS 模拟器）。代码把该按钮放在 metric / dimension 之前

### S9 回归门

- When 提交前
- Then `bun lint` 仍是 `--max-warnings=455` 且退出码 0
- And `bun run fmt:check` 退出码 0
- And `apps/mobile` 下 `bun test` 通过
- And `bun --filter @atmos/mobile typecheck` 不给本次改动的文件报错。仓库里既有的 agent-chat 测试类型错误不在本次范围，CI 的 JS / mobile structural 门禁也不跑这条 typecheck
- Signals：Coverage Status 里的命令输出

## Exploratory agent-browser checks

不适用。Token usage 的这些改动在 Expo 原生界面，不在 web DOM。状态：未运行。

## Regression checklist

- 只有一台 Computer 或未登录时，页面仍只读当前连接，左上角没有 Computer 按钮。
- 图例里的 agent 图标在浅色背景上仍然是深色，只有 popover 里改为深底着色。
- 其它使用 `NativeTextInput` 的页面默认 `framed` 仍为 true。
- 分享截图页（非 Publish）的按钮不变。
- oxlint 警告上限没有调高。

## Acceptance criteria

- S1、S2、S4、S6、S7 的 bun 命令通过。S9 的 lint、fmt:check、`apps/mobile` bun test 通过。typecheck 的既有失败见 Coverage Status。
- S3、S5、S8 在没有 iOS 模拟器时明确写未运行。
- 不把含 handle 或用量数据的截图提交进仓库。

## Manual verification steps

1. iOS 模拟器登录两台 Computer，打开 Token usage。
2. 长按柱状图，确认有一条贯穿的竖线；浅色主题下气泡里的 agent 图标可见。
3. 看四张大卡，数字底部完整。
4. 打开分享 → Publish，看 Handle 顶边、无改动时 Update 灰色、Turn off 与主按钮不同。
5. 左上角最左按钮切换 All 和单台，用量数字跟着变；断一台时 All 仍显示其余数据并带警告。

本环境：未运行。

## Non-coverage

- 不覆盖真实 Relay 往返和真实 Computer 扫描。fan-out 用注入的 fake session。
- 不覆盖 iOS URLSession 与 SwiftUI 描边的像素。`framed={false}` 只保证外层边框不依赖会被 Host 盖住的 hairline。
- 不覆盖 Android 真机。

## Coverage Status

2026-10-21，本环境。

| ID  | 结果                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- |
| S1  | 通过。`column-indicator.test.ts`                                                                            |
| S2  | 通过。`agent-glyph-tint.test.ts`                                                                            |
| S3  | 未运行。无 iOS 模拟器                                                                                       |
| S4  | 通过。`publish-form.test.ts`                                                                                |
| S5  | 未运行。无 iOS 模拟器                                                                                       |
| S6  | 通过。`unique-computers.test.ts`、`usage-scope.test.ts`                                                     |
| S7  | 通过。`merge-token-usage-overviews.test.ts`、`fetch-token-usage-scope.test.ts`、`cloud-api-clients.test.ts` |
| S8  | 未运行。无 iOS 模拟器                                                                                       |
| S9  | 见下方命令                                                                                                  |

上述 S1、S2、S4、S6、S7 一次跑完：`cd apps/mobile && bun test` 指向这 8 个文件，42 pass，0 fail。

全量：`cd apps/mobile && bun test`，609 pass，0 fail，130 files。

`bun lint`（`oxlint --max-warnings=455`，上限未改）退出码 0。

`bun run fmt:check` 退出码 0，4795 files。

`bun scripts/agent-chat-parity/compare.ts`：13 fixtures match。

`bun --filter @atmos/mobile typecheck` 退出码 1。错误只在既有文件：`src/features/agent-chat/glass-text-button.test.ts`（TS7016，`react-dom/server` 无声明）和 `src/features/agent-chat/open-thread-resync.test.ts`（TS2322，`number` 不能赋给 `void | boolean`）。本次 Token usage 文件没有类型错误。CI 不跑 mobile typecheck。

2026-10-21 自审修复后再跑：`publish-form.test.ts` 与 `usage-scope.test.ts` 共 17 pass，0 fail。覆盖未保存草稿不被覆盖，以及当前机不在列表时不选 All。

agent-browser：未运行。

iOS 模拟器手动步骤（长按竖线、四张卡数字、Publish 顶边与按钮、Computer 菜单）：未运行。

2026-10-22，review 修复后再跑。上面的 42 pass 是这次修复之前的 8 文件结果。

上述 S1、S2、S4、S6、S7 一次跑完：`cd apps/mobile && bun test` 指向这 8 个文件，54 pass，0 fail。

全量：`cd apps/mobile && bun test`，621 pass，0 fail，130 files。

`bun lint`（`oxlint --max-warnings=455`，上限未改）退出码 0。

`bun run fmt:check` 退出码 0，4795 files。

`bun --filter @atmos/mobile typecheck` 退出码 1。错误仍只在既有的 `glass-text-button.test.ts` 和 `open-thread-resync.test.ts`。

agent-browser：未运行。

iOS 模拟器：未运行。
