# PT Design v2 产品与技术方案

## 1. 产品定位

**PT Design 是一个 Agent-native Interactive Canvas。**

它解决三个问题：

1. Agent 可以通过文件创建和修改 UI。
2. 用户可以在 Canvas 中拖拽、调整 UI。
3. 所有组件都是真正可以操作的 UI，而不是静态图。

核心关系：

```text
                 PT Document
                /           \
               ↓             ↓
         Real DOM UI      Excalidraw
               ↓             ↓
           真实交互      Canvas / 布局 / 协作
```

---

# 2. 核心原则

### 2.1 PT Document 是唯一语义来源

Agent、用户和 Runtime 最终操作的都是 PT Document。

Excalidraw 只是 PT Document 的 Canvas 投影，不负责 UI 业务语义。

### 2.2 Excalidraw 负责 Canvas

Excalidraw 负责：

- 无限画布
- Pan / Zoom
- Select
- Drag
- Resize
- Rotation
- Group
- Arrow / Binding
- Undo / Redo
- 手绘效果
- 协作和分享

### 2.3 PT 组件必须是真实 UI

例如：

```text
Button  → <button>
Input   → <input>
Select  → <select>
Switch  → <input type="checkbox">
Checkbox → <input type="checkbox">
Radio   → <input type="radio">
Textarea → <textarea>
```

### 2.4 Agent 只需要理解一套语义

Agent 只需要理解 PT Document：

```text
id
type
props
value
options
children
events
x
y
width
height
rotation
```

不需要理解 Excalidraw JSON，也不需要调用大量专用的 UI 操作 API。

---

# 3. PT Document

PT Document 是整个系统的核心数据模型。

一个组件 Node：

```text
Node
├── id
├── type
├── props
├── children
├── events
├── x
├── y
├── width
├── height
└── rotation
```

布局位置直接属于组件本身，不单独定义 `<layout>` 节点。

例如：

```xml
<page id="model-config">

  <select
    id="model"
    label="Model"
    value="claude"
    x="300"
    y="200"
    width="240"
    height="40">

    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
    <option value="gemini">Gemini</option>

  </select>

  <button
    id="run"
    label="Run"
    x="300"
    y="260"
    width="100"
    height="40"/>

</page>
```

这样 Agent 可以直接知道：

```text
model:
x=300
y=200
width=240
height=40

run:
x=300
y=260
width=100
height=40
```

---

# 4. 文件格式

采用：

**PTX = Agent-facing Semantic Format**

PTX 使用 XML-like 结构，方便 Agent 理解和局部修改。

项目文件：

```text
project.ptd
├── document.ptx
├── canvas.json
└── assets/
```

其中：

### `document.ptx`

保存：

```text
组件
属性
Value
Options
Children
Events
X / Y / Width / Height / Rotation
```

### `canvas.json`

保存：

```text
Excalidraw Scene
AppState
Files
```

Agent 默认不直接读取和修改 `canvas.json`。

---

# 5. PTX 与 Canvas JSON 的关系

两份数据表达的是同一个 PT Document 的不同部分。

```text
PTX
= UI 是什么 + UI 在哪里

Canvas JSON
= Excalidraw 如何表示这个 UI
```

通过：

```text
ptNodeId ↔ excalidrawElementId
```

建立映射。

例如：

```xml
<button
  id="run"
  x="300"
  y="260"
  width="100"
  height="40"/>
```

对应：

```json
{
  "id": "exc-123",
  "type": "rectangle",
  "x": 300,
  "y": 260,
  "width": 100,
  "height": 40,
  "customData": {
    "ptNodeId": "run"
  }
}
```

---

# 6. Layout

第一版 Layout 不额外抽象，直接使用组件的空间属性：

```text
x
y
width
height
rotation
```

因此：

```xml
<button
  id="run"
  x="580"
  y="180"
  width="120"
  height="40"/>
```

就是完整的空间描述。

Agent 可以直接读取所有组件的坐标，并自行计算组件之间的空间关系。

例如：

```text
model:
x=300
width=240

run:
x=560
```

Agent 可以理解：

```text
run 位于 model 右侧
```

不需要额外的：

```text
moveRightOf()
moveBelow()
alignRight()
```

等 API。

---

# 7. Component System

PT 自己维护组件库：

```text
PTButton
PTInput
PTSelect
PTSwitch
PTCheckbox
PTRadio
PTTextarea
...
```

每个组件包含：

```text
Schema
Renderer
Inspector
Agent Description
```

例如：

```text
PTSelect
   ↓
React Renderer
   ↓
<select>
```

---

# 8. Options

所有带选项的组件必须同时具有：

```text
label
value
```

例如：

```xml
<select
  id="model"
  value="claude"
  x="300"
  y="200"
  width="240"
  height="40">

  <option value="claude">Claude</option>
  <option value="gpt-5.6">GPT-5.6</option>
  <option value="gemini">Gemini</option>

</select>
```

禁止只有 label、没有 value：

```xml
<option>Claude</option>
```

这样 Agent 可以稳定理解：

```text
Claude → claude
Gemini → gemini
```

---

# 9. Runtime

Runtime 负责：

```text
State
Event
Action
```

例如：

```xml
<button
  id="run"
  label="Run"
  x="300"
  y="260"
  width="100"
  height="40">

  <on event="click">
    <action
      type="agent"
      name="run"/>
  </on>

</button>
```

运行：

```text
DOM click
 ↓
PT Runtime
 ↓
Action
 ↓
Agent / Tool / API
```

---

## 10. Edit Mode

用于编辑 UI 的空间和布局。

```text
Excalidraw
 ↓
Select / Drag / Resize / Rotate
 ↓
PT Document
```

用户在 Edit Mode 中可以：

- 选择组件
- 拖拽组件
- 调整组件大小
- 旋转组件
- 删除组件
- 使用 Undo / Redo

编辑结果同步回 PT Document，并持久化到 PTX。

DOM UI 在编辑状态下不抢占 Canvas 的主要 pointer 操作。

---

## 11. Interact Mode

用于真实操作 UI。

```text
Real DOM
 ↓
Click / Input / Select / Switch
 ↓
PT Runtime
 ↓
State / Action
```

组件通过真实 DOM 进行交互：

```text
Button → click
Input → input
Select → select
Switch → toggle
Checkbox → check
Radio → select
Textarea → input
```

Interact Mode 下不允许编辑 Canvas 布局：

- 不允许拖拽组件
- 不允许调整组件大小
- 不允许旋转组件
- 不允许通过 Canvas 修改空间属性

因此：

```text
Edit Mode
= 编辑 UI 的空间和布局

Interact Mode
= 像最终用户一样操作 UI
```

---

# 12. Agent 工作方式

Agent 主要通过 PTX 工作：

```text
Read PTX
 ↓
Understand
 ↓
Modify PTX
```

例如修改 Select：

```xml
<select id="model" value="gemini">
```

增加 Option：

```xml
<option value="deepseek">DeepSeek</option>
```

移动 Button：

```xml
<button
  id="run"
  x="580"
  y="180"
  width="120"
  height="40"/>
```

PT 自动同步：

```text
PTX
 ↓
PT AST
 ├──→ React DOM
 └──→ Excalidraw
```

---

# 13. 用户工作方式

用户从组件栏选择或拖入：

```text
Button
Select
Switch
Input
```

系统创建一个 PT Node：

```text
PT Node
 ├── Real DOM
 └── Excalidraw Element
```

在 Edit Mode 中，用户可以通过 Excalidraw 编辑组件的空间和布局；在 Interact Mode 中，用户可以通过真实 DOM 操作组件。

因此：

**Agent 创建的组件和用户创建的组件完全一样。**

---

# 14. Excalidraw Bridge

增加一层很薄的：

```text
PT ↔ Excalidraw Bridge
```

负责同步：

```text
PT → Excalidraw
创建 / 移动 / Resize / 删除

Excalidraw → PT
用户 Drag / Resize / Rotate / 删除
```

Excalidraw 不需要理解：

```text
Button
Select
Input
Switch
```

等业务语义。

在 Interact Mode 下，Excalidraw 不负责接管组件交互，也不允许通过 Canvas 编辑布局。

---

# 15. Collaboration

Excalidraw 继续负责 Canvas 协作：

```text
User A
 ↓
Move / Resize
 ↓
Excalidraw Collaboration
 ↓
User B
```

PT 负责语义数据。

即：

```text
Spatial State
→ Excalidraw

Semantic State
→ PT
```

两者通过 Node ID 建立关联。

协作中的空间编辑发生在 Edit Mode；Interact Mode 主要用于真实操作 UI，不允许编辑 Canvas 布局。

---

# 16. 技术结构

```text
packages/
├── protocol
├── runtime
├── components
├── renderer
├── editor
└── excalidraw-bridge
```

其中：

```text
protocol
→ PTX / Schema / AST

runtime
→ State / Event / Action

components
→ Button / Input / Select ...

renderer
→ React / DOM

editor
→ Component Palette / Inspector / Canvas / Edit Mode / Interact Mode

excalidraw-bridge
→ PT ↔ Excalidraw
```

不再单独维护 Sketch Engine。

---

# 17. MVP

### 组件

```text
Button
Input
Select
Switch
Checkbox
Radio
Textarea
```

### Canvas

```text
Pan
Zoom
Select
Drag
Resize
Rotate
Undo / Redo
```

### Agent

```text
Read
Create
Update
Delete
```

### Runtime

```text
value
checked
options
click
change
```

### 模式

```text
Edit Mode
Interact Mode
```

### Collaboration

```text
多人进入同一个 Canvas
实时看到空间变化
```

---

# 18. MVP 验收标准

完整闭环：

```text
Agent
 ↓
创建 PTX
 ↓
生成 Select / Button / Input
 ↓
Canvas 显示
 ↓
进入 Interact Mode
 ↓
真实 DOM 可以点击、输入、选择
 ↓
进入 Edit Mode
 ↓
用户可以拖动组件
 ↓
位置同步回 PTX
 ↓
Agent 再读取
 ↓
继续修改
```

同时支持：

```text
用户 A 在 Edit Mode 拖动组件
 ↓
Excalidraw Collaboration
 ↓
用户 B 实时看到空间变化
```

---

# 19. 最终架构

```text
                         Agent
                           │
                       Read / Write
                           │
                           ↓
                      document.ptx
                           │
                           ↓
                      PT AST / Model
                      /            \
                     ↓              ↓
              React Renderer    Excalidraw Bridge
                     ↓              ↓
                Real DOM       Excalidraw Canvas
                     │              │
                     ↓              ↓
              Interact Mode     Edit Mode
                     │              │
                     ↓              ↓
              State / Action   Layout / Collaboration
```

最终只遵循三句话：

> **PT 定义“它是什么，以及它在哪里”。**

> **Edit Mode 使用 Excalidraw 编辑 UI 的空间和布局。**

> **Interact Mode 使用 Real DOM 运行 UI，并由 PT Runtime 处理 State / Action。**

Agent 只需要理解和修改 **PTX**，不需要知道 Excalidraw 的内部数据结构。
