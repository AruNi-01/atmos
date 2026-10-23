# TECH · APP-082 Mobile Token usage

实现 PRD 的 M1–M5。只改 `apps/mobile` 和本 spec。不改 web 的运行时代码；mobile 复制 web 已有的纯函数。

## 数据接口

与 web Token Usage Computer scope（APP-063）相同，没有新接口。

| 范围                | 调用                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 当前连接的 Computer | 已有 `MobileWsClient.request("token_usage_overview_get", …)`，封装在 `wsActions.tokenUsageOverview`。首屏 `refresh: false`。下拉刷新 `refresh: true`。`try_cookies: false`。                                                                                                                                                                                          |
| 另一台 Computer     | Relay `createClientSession(serverId, { clientKind: "mobile" })` 取 `ws_url`。短连接 `createWsSession`（关闭重连），socket 用 `preferredComputerWebSocket`。然后发送同一个 `token_usage_overview_get`：`refresh: true`，`try_cookies: false`，`year` / `since` / `until` / `clients` / `group_by` 都是 `null`。连接等待 15s，请求超时 60s。`finally` 里 `disconnect`。 |
| All                 | `fetchAllComputersTokenUsage`。当前机走上面的已连接 client（`refresh: true`），其它机走短连接。并发 3。失败记下该机名称。零成功抛 `none-reached`。成功用 `mergeTokenUsageOverviews`。                                                                                                                                                                                 |

Web 的对应实现：

- `apps/web/src/api/ws/token-usage-api.ts` 的 `tokenUsageApi.getOverview`
- `apps/web/src/features/token-usage/lib/fetch-remote-token-usage.ts`
- `apps/web/src/features/token-usage/lib/fetch-all-token-usage.ts`
- `apps/web/src/features/token-usage/lib/merge-token-usage-overviews.ts`
- `apps/web/src/features/token-usage/lib/unique-computers.ts`
- `apps/web/src/app-shell/TokenUsagePage.tsx` 的 scope 选择

Mobile 不 import `apps/web`。`unique-computers.ts`、`cloud-api-clients.ts`、`merge-token-usage-overviews.ts` 复制到 `apps/mobile/src/features/token-usage/lib/`，类型改为 `@atmos/api-types/ws/dto/token-usage`。`fetch-all` 只保留可注入依赖的函数，不调用 web 的 `tokenUsageApi`。

设备列表复用首页的 query key `["computers", relayUrl, relayAuthRevision]` 和 `listComputers()`。去重调用 `uniqueComputers(rows, null, selectedServerId)`。Mobile 没有 loopback 本机身份，第二个参数是 `null`。

`shouldShowComputerSelect`：已登录且去重数量 ≥ 2。默认选中 `isCurrent` 的那台。选择状态只放在这一屏的 `useState`，不写存储。

All 的 `partial_warnings` 显示在页面上。非当前范围的失败文案固定为英文短句，不把 socket 内部错误直接铺开。

## 界面

### 柱状图（M1、M2）

`UsageStackedChart` 增加 `isDark`。`ColumnTipView` 用 `columnIndicatorColor` / `columnIndicatorLine` 画实线：浅色 `rgba(15,23,42,0.45)`，深色 `rgba(255,255,255,0.55)`，y 从 0 到图表高度，x 为选中列中心。去掉原来的白色短虚线。

Agent 图标着色从 `MobileAgentIcon` 抽到 `agent-glyph-tint.ts`。Popover 里的 `MobileAgentIcon` 传 `onDark`，按深底着色（白线稿不涂，黑线稿涂 `#ffffff`）。`tintColor` 仍优先，图例不传 `onDark`。

### 统计卡（M3）

`StatCard` 不再用 `AnimatedMetric`。数字是 `Text`，`fontSize` 26、`lineHeight` 34。卡片可以继续 `overflow: hidden` 来裁装饰，行盒本身包住字形。

### Publish（M4）

`publish-form.ts` 决定主按钮是否禁用。已发布（`public` 或 `unlisted`）时比较 handle（未 claimed 才算）、visibility、`github_username`、`x_username`。没有差异则禁用。未发布时只要求 overview 存在且 handle 规范化后长度 ≥ 3。

`NativeTextInput` 增加 `framed`，默认 `true`。Publish 的前缀行自己画 1px 四边边框，输入框 `framed={false}`，避免 SwiftUI Host 盖住顶边。Android 在 `framed={false}` 时把描边色设为透明。

布局放在现有 `GlassPanel` 里：Handle（`atmos.land/tok/@`）、Links（`x.com/`、`github.com/`）、Public 开关、右侧实心主按钮、左侧红色文字 Turn off。主按钮禁用时用 `controlSecondary` 底和 `tertiaryLabel` 字。提交仍走 `hubPutUsagePage` / `hubDeleteUsagePage`，并带上 github / x。

后台重新拿到 usage page 时，只有草稿相对上次写入表单的快照没有改动，才覆盖 Handle、visibility、GitHub、X。有未保存改动时保留草稿。保存成功后，把刚提交的草稿记成新的干净快照，下一次页面数据仍可以写入。规则在 `publishFormAfterPage` / `publishFormAfterSave`。

### 选择器（M5）

iOS `unstable_headerLeftItems` 和 Android `headerLeft` 的按钮组最左边加 `HeaderChoice`。SF Symbol `desktopcomputer`，Android 用已有的 `LaptopIcon`。菜单项 All 加各台 `label`。

## 验证命令

```bash
cd apps/mobile && bun test src/features/token-usage src/features/terminal/agent-glyph-tint.test.ts
bun --filter @atmos/mobile typecheck
bunx oxlint --max-warnings=455
```

oxlint 上限保持 455。不提交截图。iOS 模拟器不在本环境运行。

## 风险

- 合并逻辑是复制品。web 以后改了去重规则，mobile 要手动跟上。
- 短连接失败时，单台范围只显示固定英文错误，详细原因在日志里没有额外上报。
- 四张卡失去数字滚动。页首总数仍滚动。
- `framed={false}` 只给 Publish 用。其它输入框仍走原来的描边。

## Implementation Delta

2026-10-22，review 修复。正文里的选择器句子恢复为原来的默认规则，缺席行为记在这里。

- 列表里没有 `isCurrent` 时，`resolveUsageScope` 保持当前连接（`isCurrentScope`），`selectedKey` 为 null，不回落到 `all`，也不回落到 `devices[0]`。
- 远程短连接传入 `handshakeTimeoutMs: 15_000`。不传时 `createWsSession` 会在 `min(connectWait, 3s)` 停下。
- Publish 在 usage page 请求成功前禁用输入、开关和主按钮。成功且数据为 null 才允许用空链接发布。Handle 先转小写，再匹配 `^[a-z0-9_]{3,24}$`。主按钮是 Expo UI `Host` + `Button`（`filled`，禁用时 seed 为 `tertiaryLabel`）。Turn off 是 `variant="text"`、红色 seed，失败写到同一条错误。前缀输入的 `accessibilityLabel` 挂在输入框上。
- 刷新失败进入页面错误，并且只在同一 relay URL、auth revision 和当前范围身份下显示。范围 query key 带上 `relayUrl` 和 `relayAuthRevision`。
- “Connect to a Computer” 只在当前连接范围且未连接时出现。
- `pi` 加入 `DARK_GLYPHS`。
- `bun --filter @atmos/mobile typecheck` 仍会失败。错误在既有文件 `src/features/agent-chat/glass-text-button.test.ts`（TS7016）和 `src/features/agent-chat/open-thread-resync.test.ts`（TS2322）。本次 Token usage 文件不在其中。CI 不跑 mobile typecheck。
