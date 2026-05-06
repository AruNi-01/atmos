# Issue #41: Preview 元素选择 + React 源码组件定位增强（可扩展到多框架）

## Summary
本次把 Preview 能力拆成两层并一次性设计好扩展架构：

- `v1`：在 [Preview.tsx](apps/web/src/components/run-preview/Preview.tsx) 支持同源/本地预览页的 DOM 元素选择，复用现有 `SelectionPopover`
- `v1.5`：在 iframe 内注入一段 helper，通过框架 adapter 解析被选中元素对应的源码组件信息；React 先落地，输出 `component name + file path + line/column`
- 设计目标是“宿主稳定、框架可插拔”：后续支持 Vue/Svelte 只新增 adapter 和少量 metadata formatter，不改 Preview 主流程

范围明确：
- 支持：同源、本地 dev server、可访问 iframe DOM 的页面
- 不支持：跨域外部网站
- React 源码定位仅保证开发态最佳效果；生产构建或 sourcemap/调试信息缺失时自动降级到 DOM 级上下文

## Architecture
### 1. 宿主层：Preview Host
在 [Preview.tsx](apps/web/src/components/run-preview/Preview.tsx) 新增宿主能力：
- 管理“元素选择模式”开关
- 检测 iframe 是否同源可注入
- 在 iframe load 后注入 helper bootstrap
- 维护 `window.postMessage` 通道，只接受来自当前 iframe window 且 origin 匹配的消息
- 接收 helper 回传的：
  - hover box 信息
  - element selection payload
  - framework/source-locator payload
  - error/capability 状态
- 把回传结果转成统一 `SelectionInfo`，再喂给 `SelectionPopover`
- attach 时把格式化后的上下文写入默认 Agent chat

### 2. 注入层：Preview Helper Runtime
新增一组前端文件，建议放在 `apps/web/src/components/run-preview/preview-helper/`：
- `bootstrap.ts`
- `bridge.ts`
- `dom-inspector.ts`
- `overlay.ts`
- `selection-state.ts`
- `types.ts`

helper 运行在 iframe 页面上下文，职责固定：
- 监听鼠标移动/点击/键盘事件
- 计算 hover 元素与锁定元素
- 渲染高亮 overlay
- 提取 DOM 基础信息：
  - selector
  - tagName
  - id/class/data-* / role / aria-label
  - text preview
  - html preview
  - bounding rect
- 调用框架适配器获取源码定位信息
- 通过 `postMessage` 发回宿主层

helper 不关心 atmos UI，也不直接写 Agent；它只负责“选中页面元素并解析上下文”。

### 3. 适配层：Framework Source Locators
新增适配器目录，建议放在 `apps/web/src/components/run-preview/source-locators/`：
- `types.ts`
- `registry.ts`
- `react-locator.ts`
- 预留 `vue-locator.ts`、`svelte-locator.ts`

统一接口固定为：
- `id`
- `canHandle(win: Window): boolean`
- `locate(element: Element, win: Window): SourceLocationResult | null`

`SourceLocationResult` 至少包含：
- `framework: "react" | "vue" | "svelte" | "unknown"`
- `componentName?: string`
- `filePath?: string`
- `line?: number`
- `column?: number`
- `displayName?: string`
- `confidence: "high" | "medium" | "low"`
- `debug?: string[]`

宿主和 helper 只依赖这个通用结果，不写死 React 逻辑。

## React v1.5 Design
### 1. React 定位策略
`react-locator.ts` 采用分层探测，避免只押单一内部实现：

1. 优先从 DOM 节点上查找 React fiber 关联字段  
   通过扫描 element 自身属性名中类似 `__reactFiber$`、`__reactProps$`、`__reactContainer$` 的字段拿到 fiber/node 引用

2. 从当前 fiber 向上遍历组件链  
   找到最接近用户代码的 composite component，跳过明显的 host node 和内部包装层

3. 从 fiber 上提取组件名  
   优先顺序：
   - `type.displayName`
   - `type.name`
   - `elementType.displayName`
   - `elementType.name`

4. 从调试字段提取源码位置  
   优先读取 React 开发态常见的 `_debugSource` / 等价 debug metadata  
   输出：
   - `fileName/filePath`
   - `lineNumber`
   - `columnNumber`

5. 若当前 fiber 不带源码位置信息，继续向上找最近一个带调试信息的父组件

6. 若只能拿到组件名，仍返回 `confidence=low/medium` 的结果，不中断流程

### 2. React 结果过滤
为避免把内部包装层发给 Agent，加入一层 heuristics：
- 默认忽略明显宿主节点和低价值包装：
  - `div`/`span` 这类 host component
  - 内部 forwardRef/memo 包装名但无源码位置信息的节点
- 优先选择：
  - 第一个带源码文件路径的自定义组件
  - 若有多层候选，优先最近且文件不在 `node_modules`
- 如果找到多个有价值组件，可附带一条 `componentChain` 摘要，但默认 prompt 里只输出最佳候选，避免噪声

### 3. React 输出格式
新增 preview 专用 formatter，输出顺序固定：
- Page URL
- DOM selector
- Element summary
- React component
- Source file + line/column
- Optional component chain
- Optional html preview
- Optional user note

示例结构：
- `Framework: React`
- `Component: LoginForm`
- `Source: components/login-form.tsx:46:19`

## Public Interfaces / Types
### 扩展 SelectionInfo
更新 [format-selection-for-ai.ts](apps/web/src/lib/format-selection-for-ai.ts)：
- 新增 preview 相关字段：
  - `sourceType?: "text" | "element"`
  - `pageUrl?: string`
  - `selector?: string`
  - `tagName?: string`
  - `attributesSummary?: string`
  - `textPreview?: string`
  - `htmlPreview?: string`
  - `framework?: string`
  - `componentName?: string`
  - `componentFilePath?: string`
  - `componentLine?: number`
  - `componentColumn?: number`
  - `componentChain?: string[]`
  - `sourceConfidence?: "high" | "medium" | "low"`

### 扩展 SelectionPopover
更新 [SelectionPopover.tsx](apps/web/src/components/selection/SelectionPopover.tsx)：
- `SelectionType` 增加 `"preview"`
- attach 能力改成只要传了 `onAttach` 就可用，不再绑死 wiki
- `type="preview"` 时调用新的 `formatPreviewSelectionForAI`

### PreviewProps 调整
更新 [RunPreviewPanel.tsx](apps/web/src/components/run-preview/RunPreviewPanel.tsx) 和 [Preview.tsx](apps/web/src/components/run-preview/Preview.tsx)：
- `Preview` 增加 `workspaceId`、`projectId`
- 用于把选中元素上下文写入默认 Agent composer

## Implementation Changes
### 1. Preview 宿主改造
在 [Preview.tsx](apps/web/src/components/run-preview/Preview.tsx) 中：
- 新增 `elementPickMode`、`selectionPopover`、`iframeCapability` 状态
- iframe load 时：
  - 判断同源访问
  - 注入 helper bootstrap
  - 注册 message handler
- URL 切换、刷新、前进后退、iframe reload 时：
  - 销毁旧 helper
  - 清空 overlay 和已选状态
- 工具栏新增按钮：
  - Toggle element picker
  - 若不可用则 disabled + tooltip 说明
- 选中元素后弹出现有 `SelectionPopover`
- attach 到默认 Agent chat：
  - 优先 `writeToActiveAgentComposer(workspaceId, projectId, "default", text)`
  - 失败则回退 `appendAgentChatDraft`

### 2. 注入协议
定义严格的 message 协议，避免后面加 Vue 时再改通道：
- `atmos-preview:ready`
- `atmos-preview:hover`
- `atmos-preview:selected`
- `atmos-preview:error`
- `atmos-preview:capability`

消息内容包含：
- `sessionId`
- `pageUrl`
- `rect`
- `elementContext`
- `sourceLocation`
- `framework`
- `confidence`

宿主层按 `sessionId + source window + origin` 做校验，防止串消息。

### 3. DOM 选择与 overlay
helper 内单独实现：
- hover overlay
- locked selection overlay
- ignore list：
  - `html/body`
  - atmos 自己注入的 overlay DOM
  - 极小/不可见元素
- click 时 `preventDefault` 和 `stopPropagation`
- `Esc` 取消当前锁定
- 锁定后暂停 hover 更新，直到取消或重新选

### 4. 框架适配器注册
`registry.ts` 固定流程：
- 按顺序检测 adapter
- 当前先注册 `react`
- 后续 Vue/Svelte 只需新增文件并注册，不改 Preview 主逻辑
- 若无 adapter 命中，则返回 `framework="unknown"` 并降级为纯 DOM 模式

### 5. 降级策略
任何一层失败都不能让 element picker 崩掉：
- helper 注入失败：关闭 picker，给出 toast
- React debug 元数据缺失：保留 selector + DOM 摘要
- 拿到组件名但没文件：仍输出组件名，`confidence=low`
- 页面非 React：正常返回 DOM-only payload

## Test Plan
### 功能场景
1. 本地 React dev 页面中开启元素选择，点击元素后能拿到 selector、组件名、源码路径、行列号。
2. React 页面中目标 DOM 属于多层组件包装时，返回最近且最有价值的用户组件，而不是裸 `div/span`。
3. React 页面调试信息不完整时，自动降级到 selector + DOM 摘要，不报错。
4. 非 React 同源页面中，元素选择仍可用，但 framework/source 字段为空。
5. 切换 URL、刷新 iframe、前进后退后，helper 重新注入且旧会话不串消息。
6. attach 到 Agent 后，内容进入当前默认 chat 输入框。
7. copy 到剪贴板后，文本包含页面 URL、selector、元素摘要，以及可用时的 React source 信息。
8. 跨域页面中 picker 按钮禁用，并有明确提示。

### 扩展性回归
1. 宿主层不依赖 React 专有字段名称，React 逻辑仅存在于 `react-locator.ts`。
2. 关闭 React locator 后，DOM picker 仍完整可用。
3. 增加新 adapter 时，不需要修改 SelectionPopover、Agent composer、Preview 主事件流。

### 验证方式
- `bun typecheck`
- `bun lint`
- 手动在本仓库 dev 页面和一个简单 React demo 页面验证
- 手动验证一个非 React HTML 页面降级路径

## Assumptions
- 这个 issue 仍然只覆盖“同源/本地 dev server Preview”，不覆盖跨域任意网站。
- React 源码定位依赖开发态内部调试元数据，属于 best-effort，不承诺所有构建链路都 100% 命中。
- 不引入后端改动；helper 由 atmos 前端动态注入到 iframe。
- Vue/Svelte 暂不实现，但接口和消息协议按多框架扩展设计。
