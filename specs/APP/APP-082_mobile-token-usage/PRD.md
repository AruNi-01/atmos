# PRD · APP-082 Mobile Token usage

## 用户

已在 Atmos mobile 打开 Token usage 的人。多台 Computer 的人还需要已登录 Hub（设备凭证在本机）。

## 必须有

### M1 柱状图指示线

长按柱状图出现 popover 时，在选中列画一条从图表顶部到图表底部的竖直实线。浅色主题用深色线，深色主题用浅色线。线在气泡下面。

### M2 深色气泡里的 agent 图标

Popover 底色保持深灰。里面的 agent 图标按「放在深底上」着色：白线稿保持浅色，黑线稿涂成白色。图例仍按当前主题着色，不跟着改。

### M3 四张统计卡

Messages、Active days、Estimated cost、Total tokens 的数字完整可见，底部不被裁切。装饰图形仍可以被卡片裁切。

### M4 Publish 页

- Handle、X、GitHub 输入框有完整边框，顶边可见。
- 层级：前缀输入、Public 开关、一个主按钮。Turn off 只在页面已发布时出现，用危险或次要样式，不和主按钮同级。
- 已发布且表单相对当前页面没有改动时，Update 为灰色禁用。未发布时，Handle 去掉 `@` 后至少 3 个字符且有 overview，Publish 可用。
- 保持 mobile 玻璃卡片。不新做一套网页控件。

### M5 Computer 范围

- 已登录且去重后至少两台 Computer 时，左上角按钮组最左边出现 Computer 菜单。
- 菜单第一项是 All，其余是各台 Computer。默认是当前连接的那台，不是 All。当前连接的机器不在列表里时，仍然看当前连接，不改选 All，也不改选列表里的第一台。
- 当前机继续走已经连接的 `/ws`。另一台或 All 复用 web 的数据接口：Relay `createClientSession`（`clientKind: "mobile"`）后发送 `token_usage_overview_get`（`refresh: true`，`try_cookies: false`）。All 并发最多 3 路，合并规则与 web 相同（含 cursor / trae / warp 账号级去重）。
- All 有未到达的 Computer 时，页面写出这些警告。一台都到不了时显示错误，不展示空的成功页。
- 不够两台或未登录时不显示这个按钮。当前机的用量行为保持不变。

## 不做

- 不新增 REST，不新增 `WsAction`。
- 不把选择记到磁盘。
- 不改分享卡片的截图布局，除了 Publish 页本身。
- 不把英文界面改成 i18n。这一屏现在是硬编码英文，新文案同样用英文。

## 成功标准

M1–M5 的纯规则有 bun 单测。iOS 模拟器上的目视检查如果这台环境跑不了，记为未运行，不当作已验证。
