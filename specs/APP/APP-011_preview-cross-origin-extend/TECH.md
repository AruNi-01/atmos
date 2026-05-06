# Cross-Origin Preview Element Select: 浏览器扩展版 + Tauri 桌面版

## Summary
目标是把当前只支持 `same-origin iframe` 的 Preview 元素选择，升级成三条统一路径：

- `same-origin direct`：保留现有 Web 同源直连方案
- `browser-extension bridge`：面向 Web 版 Atmos，支持跨端口本地 dev 页面，无需用户改项目代码
- `desktop-native bridge`：面向 Tauri 桌面版，通过原生 webview 承载外部页面并注入 helper，实现零项目改动的跨源选择与源码组件探测

默认产品结论：
- 浏览器扩展版：Chromium MV3 优先，支持 Chrome / Edge
- 桌面版：优先做“同 App 内集成”，具体实现为主窗口 React UI + 原生辅助 preview webview 联动
- 两个版本都复用现有 `preview-helper` 和 `source-locators`
- 两个版本都不要求用户修改自己项目代码

## Key Changes
### 1. 先抽一层共享 Runtime，统一三种传输模式
把当前 Preview 的能力拆成两层：

- `shared preview runtime`
  - 复用现有 `preview-helper/*` 和 `source-locators/*`
  - 负责 hover、click、overlay、元素摘要、React/Vue/Angular/Svelte 探测
  - 不直接依赖 iframe、extension API、Tauri API
- `transport adapters`
  - `same-origin direct transport`
  - `extension bridge transport`
  - `desktop native bridge transport`

新增统一接口：
- `PreviewTransportMode = "same-origin" | "extension" | "desktop-native"`
- `PreviewBridgeController`
  - `enterPickMode()`
  - `clearSelection()`
  - `destroy()`
- `PreviewBridgeEvent`
  - `ready`
  - `selected`
  - `cleared`
  - `error`
  - `capabilities`

消息协议继续沿用现有 `atmos-preview:*` 语义，但升级成双向：
- `atmos-preview:host-init`
- `atmos-preview:enter-pick-mode`
- `atmos-preview:clear-selection`
- `atmos-preview:destroy`
- `atmos-preview:ready`
- `atmos-preview:selected`
- `atmos-preview:cleared`
- `atmos-preview:error`

`Preview.tsx` 不再直接依赖“能不能读 iframe DOM”，而是改成：
1. 先尝试 `same-origin direct`
2. 失败后，在 Web 环境尝试 `extension bridge`
3. 在 Tauri 环境尝试 `desktop native bridge`

### 2. 浏览器扩展版：Chromium MV3，零项目改动
浏览器扩展采用三段式结构：

- `content script`
  - 注入到所有 frame
  - 负责把 page script 和扩展 runtime 接起来
  - 监听 parent/iframe 的 `postMessage`
- `injected page script`
  - 运行在页面主世界
  - 挂载共享 `preview runtime`
  - 直接访问 DOM 和框架运行时，解决 content script 隔离世界问题
- `extension background/service worker`
  - 负责安装态、版本态、权限态
  - 可选提供 debug / diagnostics

Atmos Web 侧接入方式：
- 继续用现有 Preview iframe 承载目标页面
- 对跨源 iframe，只用 `iframe.contentWindow.postMessage(...)` 发协议消息
- 不做 DOM 访问
- 若扩展存在，iframe 内 injected script 会回复 `ready`
- 若超时未握手，UI 显示“安装 Atmos Inspector 扩展”状态

扩展权限与默认范围：
- `manifest_version: 3`
- `all_frames: true`
- `host_permissions` 默认只包含：
  - `http://localhost/*`
  - `http://127.0.0.1/*`
  - `http://[::1]/*`
  - `https://localhost/*`
- v1 不默认覆盖任意公网网站
- v1 不尝试绕过目标页的 `X-Frame-Options` / `frame-ancestors`
  - 页面若不能被 iframe 嵌入，仍无法在 Web Preview 中显示
  - 这是浏览器限制，交给桌面版解决

安全边界：
- injected helper 只响应白名单父 origin
- 默认允许：
  - `http://localhost:3030`
  - `http://127.0.0.1:3030`
  - `http://[::1]:3030`
  - 后续可加正式 Atmos origin
- 每条消息都校验：
  - `sessionId`
  - `origin`
  - `source window`

### 3. 桌面版：Tauri 原生 Preview Bridge，零项目改动
桌面版不继续依赖网页里的跨源 iframe，而是新增一条原生 preview 通道：

- 主窗口里的 React Preview UI 继续存在
- 当目标 URL 不是同源可直连时，切换到 `desktop-native` 模式
- 由 Rust 创建并管理一个专用 `preview-inspector` 原生 webview
- 这个 webview 直接加载目标 URL，并注入共享 helper runtime
- 主窗口负责渲染 Atmos 自己的 toolbar、按钮和状态
- 原生 preview webview 负责页面本体、元素高亮和源码探测

产品形态采用“同 App 内集成”的实现方式：
- React 层把 preview 面板的屏幕坐标实时发给 Rust
- Rust 将 `preview-inspector` webview 定位到对应区域
- 对用户来说仍像在 Atmos 里操作
- 技术上允许用辅助原生窗口承载页面，而不是 Web iframe

Rust / Tauri 侧新增能力：
- `preview_bridge_open`
- `preview_bridge_update_bounds`
- `preview_bridge_navigate`
- `preview_bridge_enter_pick_mode`
- `preview_bridge_clear_selection`
- `preview_bridge_close`

Rust -> Web 事件：
- `desktop-preview:ready`
- `desktop-preview:selected`
- `desktop-preview:cleared`
- `desktop-preview:error`
- `desktop-preview:navigation-changed`

桌面注入策略：
- 目标页面加载后，Rust 通过 webview 初始化脚本或导航后 eval 注入 helper
- helper 不依赖目标项目改代码
- helper 通过 Tauri bridge 把事件发回 Rust
- Rust 再转发给主窗口 Web UI

默认边界：
- v1 桌面版支持任意用户主动加载到 Preview 的 HTTP(S) 页面
- DOM 元素选择对任意页面可用
- 源码组件探测对 React/Vue/Angular/Svelte 采用 best-effort
- 若页面是生产构建或无调试元数据，则自动降级为 DOM-only 选择信息

### 4. Preview UI 行为统一，不让用户感知底层通道差异
`Preview.tsx` 改成统一编排层：

- 按 transport mode 展示状态：
  - `same-origin`
  - `extension connected`
  - `desktop native`
  - `unavailable`
- 按钮和 toolbar 行为保持一致：
  - `SquareMousePointer`
  - hover 蓝框
  - click 橙框
  - toolbar 浮出
  - `Cancel` 返回继续选择
- prompt 格式保持现有 preview 结构，不因 transport mode 变化

新增轻量状态文案：
- `Source mode: Same-origin`
- `Source mode: Extension`
- `Source mode: Desktop`
- 扩展未安装时显示：
  - `Cross-port element selection requires the Atmos Inspector extension`
- iframe 被拒绝嵌入时显示：
  - Web 版提示扩展也无法解决 frame 拒绝
  - 桌面版提示可切到原生 preview 模式

## Public Interfaces / Types
会新增或调整的关键接口：

- `PreviewTransportMode`
- `PreviewBridgeController`
- `PreviewBridgeEvent`
- `PreviewBridgeHostInitMessage`
- `PreviewBridgeCommandMessage`
- `PreviewBridgeReady/Selected/Cleared/ErrorMessage`
- 桌面端新增 Tauri commands/events：
  - `preview_bridge_open`
  - `preview_bridge_update_bounds`
  - `preview_bridge_navigate`
  - `preview_bridge_enter_pick_mode`
  - `preview_bridge_clear_selection`
  - `preview_bridge_close`

现有 `SelectionInfo`、`SourceLocationResult`、`formatPreviewSelectionForAI` 不改语义，只补充一个来源字段：
- `transportMode?: "same-origin" | "extension" | "desktop-native"`

## Test Plan
### 浏览器扩展版
1. `localhost:3030` 内嵌 `localhost:5173` 页面时，扩展安装后能进入元素选择。
2. 扩展未安装时，按钮显示明确诊断，不出现“同源不可用但无解释”。
3. React/Vue/Angular/Svelte dev 页面能返回组件信息；生产构建自动降级到 DOM-only。
4. `Cancel`、`Copy`、关闭 toolbar 后恢复 hover 选择状态。
5. iframe reload、HMR、页面跳转后能重新握手。
6. 非白名单父 origin 发送消息时，扩展 helper 不响应。
7. 目标页有 `X-Frame-Options/frame-ancestors` 时，Web 版明确报“无法嵌入”。

### 桌面版
1. Tauri 中访问跨端口 dev 页面可进入元素选择，无需改目标项目。
2. 原生 preview 区域随主窗口移动、缩放、maximize、split resize 正确同步。
3. 页面跳转、刷新、前进后退后，helper 自动重注入。
4. 选中后 toolbar 正常显示，`Cancel` / `Copy` 恢复 hover 模式。
5. React/Vue/Angular/Svelte best-effort 生效；无调试信息时降级到 DOM-only。
6. 主窗口隐藏、最小化、关闭时，原生 preview webview 正确隐藏/销毁。
7. 桌面模式下访问不能 iframe 的页面仍可加载并选择元素。

### 回归
1. 现有 same-origin Web Preview 路径不回退、不降级。
2. 当前 prompt 格式、confidence 展示、toolbar 交互保持一致。
3. 非 preview 的 editor/diff/wiki selection popover 行为不变。

## Assumptions / Defaults
- “插件版本”按浏览器扩展设计，不是项目内 dev plugin。
- 浏览器扩展 v1 只做 Chromium MV3，不首发 Firefox/Safari。
- 扩展版 v1 的目标是跨端口本地开发页，不解决目标页面拒绝 iframe 嵌入。
- 桌面版 v1 的目标是零项目改动，优先通过原生辅助 preview webview 实现“同 App 内集成”。
- 两个版本都复用当前 helper / source locator 核心，不再分别维护两套元素选择逻辑。
- 实施顺序默认：
  1. 抽共享 runtime + 统一协议
  2. 浏览器扩展版
  3. Tauri 桌面版
