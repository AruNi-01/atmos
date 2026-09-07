请基于当前 Atmos 仓库的实际代码，重新审视并优化 Simulator 设计，并同时加入 Android Emulator 支持。

目标不是简单“加一个 Android 页面”，而是把当前 Simulator 重构成一个清晰、可扩展的 **Device Preview** 能力，同时保持 Atmos Desktop / Local Server / Workspace / Agent 的整体架构一致。

## 一、核心目标

当前 Atmos 已经通过 vendored `serve-sim` 实现 iOS Simulator Preview。

现在需要：

1. 保留并优化现有 `serve-sim` 的集成方式。
2. 增加 Android Emulator Preview，使用 `serve-avd`。
3. `serve-avd` 的集成方式与 `serve-sim` 保持一致：

   * vendor source
   * 固定版本
   * 编译本地 binary
   * 发布 GitHub Release
   * 按需下载到 `~/.atmos/runtime`
   * Runtime Manager 管理
   * Local Atmos Server 负责 spawn / lifecycle
4. 不要退回 `npx serve-sim` / `npx serve-avd` 的运行模式。
5. 不要把 serve-sim / serve-avd 的 UI 当成 Atmos 产品 UI。
6. Atmos 应该拥有自己的 Device Preview UI；serve-sim / serve-avd 主要作为底层 device bridge / preview runtime。
7. 设计上要支持未来一个 Computer 上存在多个 Workspace，并允许不同 Workspace 同时运行不同 App。

---

## 二、先明确资源归属

请严格区分以下几个概念：

### Computer-level

属于一台本地电脑的全局资源：

* Xcode
* Android SDK
* Simulator Device / Emulator Device
* iOS Simulator Runtime
* Android Emulator Runtime
* vendored `serve-sim`
* vendored `serve-avd`
* Runtime Manager
* Device Preview Manager

### Workspace-level

属于具体 Workspace 的资源：

* project source
* app build
* app bundle
* Metro / bundler
* app process / launched app
* device claim
* workspace-specific preview state
* workspace-specific port

重要：

**Device 本身属于 Computer，但 Device Claim 属于 Workspace。**

一个 Workspace 可以 claim 一个 device；多个 Workspace 可以同时工作，只要拥有不同 device，或者明确采用 device sharing / switching 策略。

---

## 三、推荐架构

请最终收敛到类似下面的结构：

Computer

└── DevicePreviewManager
│
├── Device Registry
│     ├── iOS Simulator Device
│     ├── iOS Simulator Device
│     ├── Android Emulator
│     └── ...
│
├── Runtime Manager
│     ├── serve-sim
│     └── serve-avd
│
└── Preview Server
├── iOS
└── Android

Workspace A

├── Device Claim → iOS Device A
├── Metro → :8081
├── Build
├── App
└── Preview State

Workspace B

├── Device Claim → Android Emulator B
├── Metro → :8082
├── Build
├── App
└── Preview State

不要把整个 Simulator 生命周期直接绑定成 Workspace-owned resource，也不要假设整个 Computer 永远只能同时运行一个 Workspace。

---

## 四、抽象层

请不要让业务代码直接依赖 `serve-sim`。

建议形成这样的抽象：

```rust
DevicePreviewManager
```

下面至少有：

```text
Device
DeviceClaim
DevicePreview
DeviceRuntime
```

概念上：

```text
DeviceRuntime
├── ServeSimRuntime
└── ServeAvdRuntime
```

平台：

```rust
enum DevicePlatform {
    Ios,
    Android,
}
```

不要一开始设计成复杂 plugin framework，保持简单。

目标是：

```text
DevicePreview
     ↓
DeviceRuntime
     ├── serve-sim
     └── serve-avd
```

而不是：

```text
Workspace
    ↓
serve-sim directly
```

---

## 五、统一 Device 模型

设计一个统一的 Device 模型，至少能够表达：

```text
id / udid
platform
name
state
availability
runtime
owner / claim
preview_url
```

例如：

```text
Device {
    id
    platform
    name
    state
    claimed_by_workspace
    preview_url
}
```

需要区分：

* booted
* shutdown
* booting
* shutting_down
* unavailable
* claimed
* free

不要把：

```text
device process
serve-sim process
app process
metro process
```

混成一个状态。

---

## 六、Workspace Device Claim

Workspace 不直接拥有 Device，而是：

```text
Workspace → DeviceClaim → Device
```

要求：

1. 一个 Device 同时只能被一个 Workspace claim。
2. Workspace 可以释放 Device。
3. Workspace 切换回来时，可以恢复自己的 claim。
4. 没有可用 Device 时，可以提示用户创建 / boot 新 Device。
5. 不要强制“所有 Workspace 共用一个 Simulator”。

默认策略应该是：

```text
Workspace A → Device A
Workspace B → Device B
```

如果只有一个 Device，则允许采用：

```text
Workspace A active
Workspace B parked
```

而不是强行同时复用同一个 Device。

---

## 七、App / Metro 必须是 Workspace 独立的

不同 Workspace 不应该共享：

* Metro process
* app build
* app process
* debug session
* app port

例如：

```text
Workspace A
  Device A
  Metro :8081
  App A

Workspace B
  Device B
  Metro :8082
  App B
```

同时运行必须可行。

如果当前代码存在：

```text
global Metro
global App
global Simulator
```

请重构成 workspace-aware state。

只有真正 Computer-level 的资源才允许共享。

---

## 八、serve-sim 集成

继续使用当前 Atmos 的 vendoring 思路。

要求：

```text
vendor/serve-sim
```

固定版本。

构建：

```text
source
  ↓
bun build
  ↓
darwin-arm64 binary
  ↓
GitHub Release
```

运行时：

```text
~/.atmos/runtime/serve-sim/<version>/
```

要求继续支持：

* version pin
* sha256 verification
* on-demand download
* spawn
* stop
* crash detection
* log capture

如果当前 serve-sim 代码里存在 Atmos 不需要的功能，例如 `/exec`，继续通过 source patch 移除。

不要退回 npm runtime dependency。

---

## 九、serve-avd 集成

加入：

```text
vendor/serve-avd
```

保持和 serve-sim 完全一致的 Runtime 管理模型。

要求支持：

```text
~/.atmos/runtime/serve-avd/<version>/
```

构建：

```text
serve-avd source
  ↓
compile
  ↓
release archive
```

运行：

```text
serve-avd --port <port>
```

不要：

```text
npx serve-avd
```

不要让 Electron / Desktop UI 直接依赖 npm 网络环境。

统一使用：

```text
DeviceRuntime
```

管理：

```text
ServeSimRuntime
ServeAvdRuntime
```

---

## 十、serve-sim / serve-avd 的职责

不要把它们当成完整产品。

它们主要负责：

```text
Device ↔ Browser Preview Bridge
```

Atmos 自己负责：

* Workspace
* Device selection
* Device claim
* Build
* Install
* Launch
* Metro
* App lifecycle
* Preview UI
* Agent integration
* Device state
* Errors
* Notifications

也就是说：

```text
serve-sim / serve-avd = infrastructure
Atmos = product
```

---

## 十一、不要继续依赖 iframe 作为最终产品架构

当前可以暂时保留 iframe 方案来快速工作，但架构应该允许未来把：

```text
serve-sim Preview UI
```

逐步替换成：

```text
Atmos Device Preview UI
```

建议先把底层 API 和状态抽象好。

例如：

```text
DevicePreviewManager
    ↓
preview URL / device state / device actions
```

前端自己负责：

```text
DevicePicker
DeviceToolbar
DeviceScreen
Rotate
Home
Reload
Screenshot
Accessibility
Logs
```

不要把 iframe URL 当成核心 domain model。

---

## 十二、Preview URL

serve-sim / serve-avd 启动后会暴露 browser preview。

Local Atmos Server 负责：

1. spawn runtime
2. capture stdout/stderr
3. detect bound port
4. resolve preview URL
5. associate URL with Device
6. expose it through Atmos API

例如：

```text
DevicePreview {
    device_id
    platform
    status
    preview_url
}
```

不要让前端自己猜端口。

---

## 十三、Workspace 切换行为

当用户切换 Workspace 时：

### 有自己的 Device Claim

直接恢复：

```text
Workspace A
  ↓
Device A
  ↓
App A
```

### 没有自己的 Device，但存在空闲 Device

自动 claim：

```text
Workspace B
  ↓
free Device
  ↓
claim
```

### 没有空闲 Device

不要自动抢占其他 Workspace。

提示：

```text
No available device
```

提供：

```text
Start another device
```

或者：

```text
Switch from another workspace
```

---

## 十四、Device Preview UI

重新设计 Simulator 页面，使它成为 Atmos 原生功能，而不是“一个 iframe”。

建议 UI 层结构：

```text
Device Preview
├── Header
│   ├── Device selector
│   ├── Platform selector
│   ├── Status
│   └── Actions
│
├── Device Canvas
│   └── Simulator / Emulator Screen
│
└── Optional Side Panel
    ├── Logs
    ├── App Info
    └── Accessibility
```

同时支持：

```text
iOS
Android
```

UI 不应该因为平台不同而产生两套完全不同的 architecture。

---

## 十五、Agent integration

设计时要考虑以后 Agent 可以操作 Device。

至少预留这些能力：

```text
list_devices
get_device
claim_device
release_device
boot_device
shutdown_device

install_app
launch_app
stop_app

tap
swipe
rotate
press_home

screenshot
get_accessibility_tree
```

但这次不要过度实现 Agent automation。

首先保证：

```text
Device lifecycle
App lifecycle
Preview lifecycle
```

已经干净。

---

## 十六、WebSocket / API

当前 Atmos 使用 Local Server + WebSocket。

请沿用现有模式，不要为了 Simulator 引入第二套通信机制。

建议统一：

```text
SimulatorProbe
SimulatorListDevices
SimulatorClaim
SimulatorRelease
SimulatorStart
SimulatorStop
SimulatorRunApp
SimulatorStopApp
SimulatorStatus
```

Android 和 iOS 使用同一套 API。

不要出现：

```text
iOS API
Android completely separate API
```

而应该：

```text
Simulator / Device Preview API
        ↓
platform = ios | android
```

---

## 十七、错误模型

必须明确区分：

### Environment error

例如：

```text
Xcode not installed
Android SDK not installed
adb missing
simctl missing
emulator missing
```

### Runtime error

例如：

```text
serve-sim failed
serve-avd failed
runtime binary corrupt
runtime download failed
checksum mismatch
```

### Device error

例如：

```text
device unavailable
device boot failed
device already claimed
```

### Build error

例如：

```text
xcodebuild failed
gradle failed
```

### App error

例如：

```text
install failed
launch failed
Metro unavailable
```

不要全部返回：

```text
Simulator failed
```

---

## 十八、请先检查当前代码，不要直接重写

开始实现之前：

1. 找到当前 `Simulator` / `serve-sim` 全部相关代码。
2. 找到当前 Runtime Manager。
3. 找到 Desktop ↔ Local Server IPC / WebSocket。
4. 找到 Workspace lifecycle。
5. 找到 App Build / Metro 管理。
6. 找到当前 Simulator UI。
7. 找到现有 tests / specs。

先给出当前结构：

```text
Current Architecture
```

然后给出：

```text
Target Architecture
```

并明确指出：

```text
哪些保留
哪些移动
哪些重命名
哪些删除
哪些新增
```

不要为了架构漂亮而大规模重写无关代码。

---

## 十九、实现原则

优先级：

```text
1. 正确的资源归属
2. Workspace isolation
3. iOS / Android unified abstraction
4. Runtime lifecycle
5. UI integration
6. Agent extensibility
```

不要反过来。

不要为了支持 Android 引入复杂 framework。

不要为了“通用化”提前实现十个平台。

---

## 二十、最终验收标准

最终至少满足：

### iOS

```text
Workspace A
  ↓
claim iOS Simulator
  ↓
start serve-sim
  ↓
start Metro
  ↓
build / install / launch
  ↓
Atmos Device Preview
```

### Android

```text
Workspace B
  ↓
claim Android Emulator
  ↓
start serve-avd
  ↓
start Metro
  ↓
build / install / launch
  ↓
Atmos Device Preview
```

### Multi-workspace

```text
Workspace A → iOS Device A → App A
Workspace B → Android Device B → App B
```

两者可以同时运行。

### Runtime

```text
~/.atmos/runtime/serve-sim/<version>
~/.atmos/runtime/serve-avd/<version>
```

均支持：

```text
download
verify
spawn
status
stop
cleanup
```

### UI

Atmos 自己掌控 Device Preview UI，不把 serve-sim / serve-avd UI 当成最终产品边界。

---

## 二十一、最终输出

完成代码修改后，请输出：

1. 当前 Simulator 架构存在的问题
2. 最终架构图
3. iOS / Android runtime 结构
4. Workspace / Device / App / Metro 的资源归属
5. 修改过的文件
6. 新增的 API / WS message / state
7. serve-sim / serve-avd 的构建与发布方式
8. 测试结果
9. 仍然存在的限制

重点：

**不要把这个任务理解成“给 Atmos 加 Android Simulator”。**

正确理解是：

> 把 Atmos 当前的 Simulator 能力升级成统一的 Device Preview subsystem，并把 iOS `serve-sim` 和 Android `serve-avd` 都变成由 Atmos Runtime Manager 管理的底层 Runtime，同时保持 Workspace 之间的运行隔离。**
