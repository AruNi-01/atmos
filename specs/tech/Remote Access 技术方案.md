# 问题定义
Issue #26 需要解决的不是“桌面端能不能启动 web 服务”这一单点问题，因为当前 Tauri + sidecar 架构已经具备本地服务启动与前端静态资源服务能力；真正需要定义的是：如何把 Atmos 的本地运行实例以尽量少配置、尽量自动化、同时安全可控的方式开放给远程访问。
这个能力不应被定义为“桌面端专属功能”。更准确的抽象是：浏览器是默认访问端，桌面端只是其中一种 host/control surface。也就是说，用户最终可以直接通过浏览器访问远程入口，而桌面应用负责在本机启动、管理和关闭该入口。
## 当前状态
当前桌面端通过 `apps/desktop/src-tauri/src/main.rs` 拉起 API sidecar，前端通过 `get_api_config` 从原生层获取本地端口和 token，再经 HTTP/WebSocket 访问本地服务。sidecar 已支持 `/healthz` 健康检查，并可直接服务静态前端资源，因此“本地可运行的应用实例”已经成立。
但当前安全模型不适合作为远程访问入口。`apps/api/src/config/mod.rs` 默认绑定 `0.0.0.0`，而 `apps/api/src/middleware/mod.rs` 对 loopback/LAN 默认信任，仅对更远端来源要求 token。这对于本地开发很方便，但在接入 Tailscale、Cloudflare Tunnel、ngrok 之后，请求很可能在进入应用时表现为本机或局域网来源，导致“来源 IP 是否可信”失去区分本地访问与经隧道转发访问的能力。
## 设计目标
新的技术方案应满足以下目标：
1. 把远程访问定义为统一平台能力，而不是桌面端 UI 上的几个离散按钮。
2. 让浏览器成为默认 client，不要求远程访问端必须安装桌面应用。
3. 让桌面端负责 host/control plane：启动、管理、诊断和关闭远程访问。
4. 不直接暴露现有 sidecar，避免把当前本地信任模型带到公网/跨设备场景。
5. 对 Tailscale、Cloudflare、ngrok 提供统一抽象，减少用户手动配置和心智负担。
6. 为后续 CLI、daemon 或其他宿主复用预留清晰边界。
## 核心架构
### 一、把远程访问拆成三个层次
新的架构建议分成三层：
1. 内部应用层：现有 Atmos sidecar 和前端资源，作为被访问目标。
2. 远程访问核心层：统一的 TunnelGateway、TunnelSession、provider 抽象与代理逻辑。
3. 宿主控制层：桌面端等 host/control surface，负责在本机启动和管理远程访问。
其中第二层应被设计成一个独立子系统，而不是直接散落在 `apps/api` 或 `apps/desktop` 内部。
### 二、单独抽取 `crates/remote-access`
建议新增独立 crate：`crates/remote-access`。
这个 crate 承载真正可复用的远程访问能力，而不是桌面端专属逻辑。它的职责包括：
* Tunnel Gateway：远程入口层，负责 HTTP/WebSocket 代理
* TunnelSession：统一会话模型
* 访问校验、cookie/token 交换、过期逻辑
* provider trait 和 provider 状态模型
* provider 的通用运行逻辑与错误抽象
* 统一诊断、事件、会话状态定义
不放进这个 crate 的内容包括：
* Tauri command 暴露
* 桌面端 UI 状态同步
* 托盘、窗口、生命周期管理
* 系统层凭证录入交互
这样能把“远程访问子系统”和“桌面宿主适配层”彻底分开。
### 三、桌面端只保留 Remote Access Manager
桌面端仍然需要一个 `RemoteAccessManager`，但它不再承载全部远程访问逻辑，只负责宿主层编排。建议保留在 `apps/desktop/src-tauri/src/remote_access/`。
它的职责包括：
* 检测本机可用 provider
* 启动和关闭 `crates/remote-access` 中的 gateway/runtime
* 管理宿主态状态和生命周期
* 通过 Tauri commands 向前端暴露状态、URL、错误与操作入口
* 处理桌面端特有的恢复、日志和系统集成逻辑
这样桌面端只是控制面，不是远程访问能力本身。
### 四、`apps/api` 继续作为内部应用层
`apps/api` 不应成为远程访问的宿主编排层，也不应直接承担远程发布边界。它只保留内部应用服务职责，并做两类配合性改动：
* 把 sidecar 收紧为 loopback-only 或至少默认 loopback-only
* 调整当前 local/LAN trust 逻辑，使其不再承担远程访问安全边界
换句话说：`apps/api` 是被代理目标，不是对外发布系统。
## Tunnel Gateway 设计
### 一、Gateway 的定位
Tunnel Gateway 是远程访问的统一入口，不直接等同于业务 API server。它负责：
* 接受浏览器访问
* 代理 HTTP 请求到内部应用层
* 代理 WebSocket 握手与消息流
* 处理分享会话校验
* 返回分享错误页、过期页、无权限页等入口级响应
它是“远程访问边界”，而不是“业务应用本体”。
### 二、为什么要有 Gateway
如果没有 Gateway，而是让 provider 直接暴露 sidecar，会出现几个问题：
* 当前 LAN/loopback 信任模型直接泄露到远程场景
* provider 安全策略变成应用唯一边界
* Tailscale、Cloudflare、ngrok 会形成三套不同安全语义
* HTTP 与 WebSocket 鉴权容易不一致
Gateway 的作用就是把这些问题统一收口。
### 三、Gateway 的访问流程
建议流程如下：
1. 宿主层创建 Tunnel`Session`。
2. provider 对外暴露的是 Gateway 的本地端口，而不是 sidecar 本身。
3. 用户通过浏览器访问外部 URL。
4. Gateway 读取一次性入口参数或已有会话 cookie。
5. Gateway 完成会话校验与交换。
6. 校验成功后把请求代理到内部应用层。
7. WebSocket 握手和后续流量也复用同一分享会话。
8. 会话过期、撤销或 provider 中断后，Gateway 立即拒绝后续访问。
## TunnelSession 设计
远程访问不能仅依赖 provider 自带认证，必须有应用内统一会话模型。建议定义 Tunnel`Session`，至少包含：
* `session_id`
* `provider`
* `mode`（private/public）
* `permission`（首版可只做 control，后续可扩展 view/control）
* `entry_token`
* `expires_at`
* `revoked_at`
* `status`
* `public_url`
建议采用“一次性入口 token + 短期 session cookie”的方式：
* 首次访问携带入口 token
* Gateway 完成交换后种下短期 cookie
* 后续 HTTP 与 WebSocket 统一复用 session
* 关闭分享、超时或诊断失败时立即撤销
这样 provider 只是 transport/ingress，真正的访问控制在 Atmos 自己手里。
## Provider 抽象
### 一、统一 provider trait
在 `crates/remote-access` 中定义统一 provider 接口，至少包括：
* `detect()`：检查 provider 是否已安装、已登录、是否可直接使用
* `start(target_url)`：把指定本地 gateway 暴露出去
* `stop()`：停止暴露
* `status()`：返回运行状态、外链、错误与告警
* `diagnostics()`：返回可展示的诊断结果
这样宿主控制层不需要关心 provider 内部细节。
### 二、provider 分期策略
#### 1. Tailscale
优先支持 `tailscale serve`，满足 tailnet 内私有访问。后续再支持 `tailscale funnel` 作为公网模式。Tailscale 适合“我在另一台设备访问自己的 Atmos”。
#### 2. Cloudflare
优先支持 Quick Tunnel，作为几乎零配置的临时公网链接。后续再支持 Named Tunnel 和自定义域名。
#### 3. ngrok
优先考虑 Rust SDK，而不是纯 CLI。这样更利于统一运行时管理、状态采集与产品化封装。后续可利用 ngrok 的附加认证能力，但它只是补充层，不替代 Tunnel`Session`。
## 目录与代码边界建议
### 一、独立 crate
建议新增：
* `crates/remote-access/`
内部可按如下组织：
* `src/lib.rs`
* `src/gateway.rs`
* `src/session.rs`
* `src/proxy.rs`
* `src/types.rs`
* `src/error.rs`
* `src/providers/mod.rs`
* `src/providers/tailscale.rs`
* `src/providers/cloudflare.rs`
* `src/providers/ngrok.rs`
### 二、桌面宿主层
建议新增：
* `apps/desktop/src-tauri/src/remote_access/mod.rs`
* `apps/desktop/src-tauri/src/remote_access/manager.rs`
* `apps/desktop/src-tauri/src/remote_access/commands.rs`
桌面层通过 `AppState` 持有 manager/runtime 引用，并通过 Tauri commands 暴露启停、状态查询、复制链接、诊断等操作。
### 三、API 配合改动
`apps/api` 中只做配合性调整，不承担远程访问编排：
* 收紧默认监听地址
* 收敛当前 LAN 信任逻辑
* 为 Gateway 代理提供稳定内部入口和必要的健康检查/能力检测
## 核心安全决策
### 1. sidecar 不应成为外部入口
不论采用哪种 provider，对外暴露的都应该是 Gateway，而不是 sidecar 原生端口。
### 2. Remote Access 模式不再依赖来源 IP 判定可信
当前 `is_local_or_lan()` 只能作为本地开发便利逻辑保留，不能再承担远程访问安全边界。远程访问必须切换到 Tunnel`Session` 模型。
### 3. WebSocket 必须纳入同一安全模型
项目整体是 WebSocket-first，因此 Gateway 必须同时处理 HTTP 和 WebSocket，不允许出现“页面需要会话、WS 不需要会话”的不一致模型。
### 4. 默认启用时效控制
公网分享默认应是短时效会话，例如 15 分钟或 1 小时。长期稳定入口应作为显式高级模式启用。
## 阶段化落地建议
### Phase 1：MVP
第一阶段目标是建立正确边界，并尽快拿到最有价值的用户体验：
* 新建 `crates/remote-access`
* 实现基础 Tunnel Gateway + TunnelSession
* 让 sidecar 只作为内部目标使用
* 支持 HTTP + WebSocket 代理
* 接入 Tailscale Serve（私有访问）
* 接入 Cloudflare Quick Tunnel（临时公网分享）
* 在桌面端提供基础 Remote Access 控制面
这版已经能覆盖“跨设备访问自己”和“快速生成临时外链”两个核心场景。
### Phase 2：增强版
在边界稳定后继续增强：
* 接入 ngrok Rust SDK
* 支持 provider 自动探测与状态恢复
* 提供更完整的日志和诊断模型
* 支持凭证存储与更友好的桌面引导
* 支持 Tailscale Funnel 公网模式
### Phase 3：长期入口与多宿主复用
最后再扩展到更高级能力：
* Cloudflare Named Tunnel
* 自定义域名
* 更细粒度权限（view/control）
* CLI 或 daemon 宿主复用 `crates/remote-access`
* 审计日志与长期分享入口
## 推荐结论
推荐把该 issue 收敛为一个独立的“Remote Access 子系统”，并以 `crates/remote-access` 作为核心载体。浏览器是默认 client，桌面端只是第一种宿主控制面。`apps/api` 继续作为内部应用层，不直接承担远程发布边界；`apps/desktop` 只负责宿主编排；真正跨端可复用的 Gateway、Session、Proxy 与 provider 抽象统一沉淀到新 crate 中。首版优先做 Tailscale Serve + Cloudflare Quick Tunnel，在最少配置下验证价值，同时保留 ngrok、Cloudflare Named Tunnel 和其他宿主扩展空间。