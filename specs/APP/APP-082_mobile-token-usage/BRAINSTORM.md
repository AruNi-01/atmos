# BRAINSTORM · APP-082 Mobile Token usage

## 问题

Atmos mobile 的 Token usage 页已经能看当前连接的 Computer，但和 web 比有几处读数和发布体验不对，也还不能在多台 Computer 之间切换。

1. 柱状图长按气泡时，现有竖线是气泡底下的一段白色虚线。浅色图表上几乎看不见，也没有贯穿整列。
2. 气泡底色固定是深灰。浅色主题会把白色线稿 agent 图标涂成深色，贴在深灰上几乎看不见。
3. Messages / Active days / Estimated cost / Total tokens 四张卡的数字底部被裁掉一点。
4. 分享 sheet 的 Publish 页：Handle 输入框顶边不见；Turn off 和 Update 是两个同级玻璃按钮；没有改动时 Update 仍然可点。
5. Web 在登录且至少两台 Computer 时，可以看某一台，或看 All（合并）。Mobile 没有这个入口。

## 选项

| 方案                                     | 结论                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 新的 usage REST，或新的 `WsAction`       | 否。Web 已经用 `token_usage_overview_get`。当前机走已连接的 `/ws`，其它机走 Relay `createClientSession` 后的短连接，发同一个 action。 |
| 把 web 的合并逻辑抽成新包                | 否。`@atmos/shared` 不能依赖 `@atmos/api-types`。纯函数复制到 `apps/mobile`，并带上同样的单测。                                       |
| Mobile 远程会话用浏览器 `WebSocket`      | 否。用 mobile 已有的 `preferredComputerWebSocket`（iOS 走 URLSession）。`clientKind` 用 `mobile`。                                    |
| 选择器放在页面正文                       | 否。放在左上角按钮组最左边，和 metric / dimension 一组。                                                                              |
| 四张卡继续用 NumberFlow，只加 lineHeight | 否。槽高按字号裁切，加 lineHeight 解决不了。这四张卡改成带行高的 `Text`。页首大数字仍滚动。                                           |
| Publish 继续两个同级玻璃按钮             | 否。对齐 web：前缀输入、Public 开关、实心主按钮、危险次要的 Turn off。无改动时 Update 灰色禁用。这是 web 没有、这里要补的规则。       |

## 不做

- 不记住上次选的 Computer。
- 不在选择器不够两台时做 sign-in / add-computer 提示（web 有，这次不搬）。
- 不改 web、Relay、Hub、token-usage 扫描。
- 不跑 iOS 模拟器。没有模拟器的项在 TEST 里写未运行。
