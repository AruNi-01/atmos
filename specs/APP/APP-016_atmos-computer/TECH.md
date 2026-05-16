# TECH · APP-016：Atmos Computer

> **命名**：用户向功能名 **Atmos Computer**（`server_id`）；其上 **`apps/api` 进程**为 **Atmos Server**。下文 **Relay / DO / Control Plane** 为连接与控制面实现。
>
> 技术设计：**如何实现**。产品范围见 `PRD.md`。**本文不依赖 [APP-012](../APP-012_remote-access/TECH.md) remote-access。**

## 1. 架构总览

### 1.1 逻辑组件

| 组件 | 职责 | 部署位置 |
|------|------|----------|
| **Atmos Computer** | 用户可选中的一台计算环境（产品对象）；由 `server_id` 标识；**一台 Computer 上运行一个 Atmos Server** | 用户本机 / **云端 VPS** / Desktop 侧车等 |
| **Atmos Server** | 现有 `apps/api`：HTTP + WS、业务逻辑、终端、Canvas relay 等 | 驻留在某台 **Computer** 内 |
| **Control Plane** | 账号、**Computer** 注册、配对码、访问令牌签发、**Computer** 元数据 | Cloudflare Worker + D1（或等价持久化） |
| **Relay Hub（DO）** | 每个 `server_id` 一个 DO 实例：维护 **1 条 Server 出站 WS** + **N 条 Client WS**；路由、限流、（M2+）事件缓冲与 replay | Cloudflare Durable Object |
| **Client** | `apps/web`、`apps/desktop`；可选「经 Relay 的 CLI」 | 用户浏览器 / 本机应用 |

### 1.2 连接拓扑

```
┌─────────────┐     出站 WSS      ┌──────────────────┐
│ Atmos Server│ ───────────────► │ DO(server_id)    │
│ (任意网络)  │ ◄─────────────── │ Relay Hub        │
└─────────────┘     下行帧      └────────▲───────────┘
                                         │
              WSS（客户端路径）           │
┌─────────────┐                          │
│ Web/Desktop │ ─────────────────────────┘
└─────────────┘
        │
        ▼
┌──────────────────┐
│ Worker (路由)     │  TLS 终止、鉴权、将 client 绑定到对应 DO
└──────────────────┘
```

**不变量**：

- Server **不向公网开放监听**即可加入 Relay（仅出站）。
- Client **永不直接**与 Server 建立 TCP（除非显式「仅本地」模式 loopback）。
- **业务 WS 帧**在理想设计中 **对 Relay 透明**（见 §4）。

### 1.3 与现有 Atmos 代码的边界

| 现有模块 | Atmos Computer（本 spec）中的角色 |
|----------|------------------|
| `apps/api` WS 层 | **不变语义**：对「已认证的本地 client」的处理逻辑复用；新增「来自 Relay 的虚拟 client」注入点（见 §6）。 |
| `apps/web` `useWebSocket` | **连接 URL 与握手参数**变化；消息编解码尽量不变。 |
| `apps/desktop` | 同上；侧车 **Computer** 上的 Server 可写 `boot_data.json`，供 **上下文选中该本机 Computer** 时与 CLI 共用 loopback API 发现。 |
| `apps/cli` | CLI 为 **client**：`canvas` / `review` 等 **HTTP 能力**的 **API 基址 = 当前所选 Atmos Computer**（与 Web/Desktop 同源，见 §8）；**不得**将「永远连本机 loopback」写死为全局默认。**Review** 不得以 CLI 内 `infra::DbConnection` + `ReviewService` 为数据平面（见 §8.2）。可选：经 Relay 的 **gateway**（分期）。 |
| `crates/boot-data` | **Computer** 上 Atmos Server 的 **本机自描述**；**不**承担跨互联网发现职责。 |

---

## 2. 身份与配置模型

### 2.1 标识符

| 字段 | 说明 |
|------|------|
| `server_id` | UUID；全局唯一；配对成功后由 Control Plane 分配或由 Server 生成后注册。 |
| `server_secret` | 高熵密钥；**仅存储于 Server 本机**（如 `~/.atmos/server.json`）；用于向 Relay 证明身份（见 §3.2）。 |
| `client_session_id` | Relay 为每条 Client WS 分配；用于下行路由与审计。 |
| `user_id` | Control Plane 的账号主体；M1 单用户拥有多台 **Computer**。 |

### 2.2 本机文件（Computer / Server 侧）

**`~/.atmos/server.json`（示例，字段名可在实现时微调）**

```json
{
  "server_id": "uuid",
  "server_secret": "opaque-high-entropy",
  "relay_url": "wss://relay.example.com/v1/server",
  "control_plane_url": "https://cp.example.com"
}
```

**`~/.atmos/boot_data.json`（已有或演进）**

- 描述 **本机监听** `host/port`、可选 `local_token`、`pid`。
- 当 **Web/Desktop/CLI 的当前上下文 = 运行于本机的该 Computer（其 Server）** 时，与本地工具共用，用于发现 **loopback API**；**不**作为「CLI 永远连本机」的全局规则，也**不**作为跨公网发现源。

### 2.3 客户端侧缓存（非权威）

**`~/.atmos/contexts.json`（Desktop；Web dev 可由 Next 代理）**

- 缓存「最近使用的 **Computer** 列表」、展示名、`last_connected_at`。
- **权威列表**仍以 Control Plane 拉取为准；本地文件离线降级展示。

---

## 3. 控制面（Control Plane）协议（逻辑）

> 以下为 **REST/JSON 形状的逻辑契约**；路径与命名由实现仓库（如 `packages/relay-control` 或独立 Worker 仓库）最终确定。

### 3.1 配对码（Pair Code）

| 端点（示例） | 方法 | 说明 |
|--------------|------|------|
| `/v1/pair_codes` | `POST` | 客户端（已登录用户）申请配对码；返回 `{ code, expires_at }`。 |
| `/v1/servers/register` | `POST` | Server 携带 `{ code, server_public_key? }` 换 `{ server_id, server_secret, relay_ws_url }`。 |
| `/v1/servers` | `GET` | 列出当前用户的 **Computer**（`server_id` 等元数据）。 |
| `/v1/servers/{id}/revoke` | `POST` | 吊销：Relay 侧断开该 `server_id` 的 hub。 |

**安全要求**：

- 配对码 **短时效**（建议 5–10 分钟）、**单次或有限次数使用**。
- `server_secret` **仅**在注册响应中出现一次；Control Plane 仅存 **哈希** 或可验证 MAC 密钥派生材料（具体密码学方案实现阶段定稿）。

### 3.2 Server → Relay 认证（出站）

建议采用 **挑战-响应** 或 **短期 JWT**：

- Server 首次连接 Relay 时携带 `server_id` + 证明（如 `HMAC(server_secret, challenge)`），由 Control Plane 或 Relay 联合验证。
- 连接成功后，DO 将 **该 server 套接字** 登记为 `active_server_transport`。

---

## 4. Relay 数据面：信封（Envelope）规范

### 4.1 设计原则

1. **Relay 不解析 Atmos 业务 JSON** 的内部字段（如 `canvas_agent_dispatch` 的 payload 结构）。
2. Relay 只处理 **信封** + **长度/配额/连接状态**。
3. 业务层仍可使用现有 **request_id** 做关联；信封层可再带 **relay_seq** 用于 replay（M2）。

### 4.2 信封字段（建议最小集）

| 字段 | 类型 | 说明 |
|------|------|------|
| `v` | `uint` | 信封协议版本；M1 固定 `1`。 |
| `stream` | `string` | 逻辑子流：`app`（主应用 WS）/ `diag`（可选）；M1 可仅 `app`。 |
| `kind` | `string` | `frame` \| `ctrl`；`ctrl` 用于 ping/pong、订阅确认。 |
| `from` | `string` | `server` \| `client:<session_id>`。 |
| `to` | `string` | `server` \| `client:<session_id>` \| `broadcast_clients`（慎用）。 |
| `request_id` | `string?` | 透传业务关联；Relay 不解释。 |
| `relay_seq` | `uint64?` | M2+ 单调递增，用于 replay 游标。 |
| `body` | `bytes` \| `string` | **透明载荷**：即现有 WS 文本帧或二进制帧内容（实现二选一并在网关固定）。 |

### 4.3 路由规则（DO 内）

1. **Client → Server**：`to == "server"` 时，若 Server 已连接，写入 Server 出站队列；否则进入 **短时缓冲**（仅 M2+ 明确容量与 TTL）或返回 `ctrl` 错误帧。
2. **Server → Client**：`to` 指定 `client:<session_id>` 单播；或 `broadcast_clients` 多播（例如全局通知，需白名单事件类型）。
3. **Server 未连接**：Client 侧收到 `ctrl`：`server_offline`；UI 展示可恢复状态。

---

## 5. Durable Object：`ServerHub` 状态机（逻辑）

### 5.1 状态

| 状态 | 含义 |
|------|------|
| `EMPTY` | 无 Server、无 Client；可休眠或延迟创建。 |
| `SERVER_PENDING` | 有 Client 无 Server；可缓冲或拒绝业务帧。 |
| `READY` | Server 已连接；可双向路由。 |
| `DEGRADED` | Server 刚断；按策略缓冲或快速失败。 |

### 5.2 存储（DO Storage）

| 键 | 用途 |
|----|------|
| `last_relay_seq` | 单调递增；replay 游标基准。 |
| `ring` | 可选：最近 N 条 **信封+body** 或仅 **信封+body hash**（合规驱动）。 |
| `clients` | `session_id → WebSocket` 映射。 |
| `server_ws` | 单条 Server 连接引用。 |

### 5.3 Replay（M2）

- Client 重连握手携带 `last_seen_relay_seq`。
- DO 从 `ring` 中 **顺序重放** `relay_seq > last_seen_relay_seq` 的条目。
- **与业务 request/response 的交互**：若业务层已有 `request_id`，replay 仅 **重放下行事件**；重复上行需业务幂等（Canvas/终端模块各自约定，可引用现有 idempotency）。

---

## 6. Atmos Server 集成方式

### 6.1 出站客户端模块（建议新 crate 或 `apps/api` 子模块）

职责：

1. 读取 `server.json`；无则跳过（纯本地模式）。
2. 向 Control Plane 刷新令牌（若采用 JWT）。
3. 维护与 Relay 的 **单连接**（每 Server 进程一条）；自动重连带指数退避。
4. 从 Relay 收到的 `body` **写入** 现有 `WsMessageService` 的「虚拟连接」入口，等价于本地 TCP client 的第一条消息之后的行为。

### 6.2 与现有 `ConnectInfo` / 鉴权中间件的关系

- **本地 loopback**：保持现有 `require_local_token` 行为。
- **Relay 注入路径**：需新增 **可信内部路径**（例如仅接受来自本机 `relay_ingest` 任务队列的帧），**禁止**未经鉴权的外网直连接替。

### 6.3 与 Canvas Agent Relay 的关系

- `CanvasAgentRelay` 仍以 **同一 Server 进程内** 的 `conn_id` 为键。
- 经 Relay 的 Web client 与经本地 WS 的 client **在 Server 侧汇聚为同类连接**（需统一 `conn_id` 生成与生命周期）。

---

## 7. 客户端（Web / Desktop）改动要点

### 7.1 连接 URL

- **本地模式**：`ws://127.0.0.1:<port>/...`（现有）。
- **Relay 模式**：`wss://relay.../v1/client?server_id=...&token=...`（token 可为短期，见 Control Plane）。

### 7.2 UI

- **Server 选择器**：**Computer** 列表来自 Control Plane；当前选中项写入本地偏好。
- **配对入口**：展示配对码或二维码（内容由 Control Plane 返回）。

### 7.3 Web 开发环境

- Next 继续可代理 `boot_data` 用于 **本地 API 端口**；Relay 模式下 **以 Control Plane 返回的 `relay_ws_url` 为准**。

---

## 8. CLI 行为（规范）

**锚点**：CLI 的 **业务 HTTP 基址**与 Web/Desktop 一致，绑定 **用户当前所选 Atmos Computer**（`server_id` / 上下文），**不是**「跑在哪台笔记本上」或「是否 SSH 在 VPS 上」的隐含本机。

| 上下文 | 默认行为（API 基址） |
|--------|----------------------|
| **当前所选 Computer = 本机进程**（常见：日常开发、SSH 到某台 **Computer**（VPS）且 UI 也指向该 **Computer**） | 可读 `boot_data.json` / `state.json` 等得到 **该 Computer 上 Server 的** `http://127.0.0.1:<port>` 或等价 loopback；**零 `ATMOS_API_URL`** 的前提是「上下文已指向这台机器上的 **Computer**」，而非「CLI 进程所在机器一定是 API 宿主」。 |
| **当前所选 Computer = 远程**（笔记本终端 + UI 已切到云端） | 使用上下文中的 **远程 API 基址**；M1 可允许 **`ATMOS_API_URL` / `--api-url` 显式覆盖** 作为过渡；M2+ 目标为 **Relay HTTP gateway**、`atmos context use <server_id>` 等写入共享上下文，使 CLI 与 UI **免手抄 URL**（与 §9 里程碑一致）。 |

M1 **不强制**实现「笔记本 CLI 不经显式 URL 即连远端 **Computer**」，但 **不得**再产品化「CLI 永远默认 127.0.0.1 而可与 UI 所选 **Computer** 脱钩」。

### 8.1 单一事实来源（API anchor）

- **原则**：凡涉及 **与 UI 同一份业务状态** 的 CLI 能力（含 **`atmos review`**），**一律经 `apps/api`** 发起请求；CLI 是 **client**，不承载第二套持久化入口。
- **与仓库传输偏好一致**：Review 以 **HTTP（REST 或 RPC 形状）** 暴露为宜（与现有「bootstrap / 一次性操作用 REST」例外一致）；若后续某条 review 流必须流式，再在 **已连上当前 Computer 上 Server 的 WS** 上扩展消息，而不是让 CLI 直连 DB。
- **鉴权**：与 Web/Desktop 调用同一 API 的凭证模型（如 Bearer / session cookie 的 CLI 等价物）；loopback 下可继续依赖 **local token**（与现有 `require_local_token` 对齐），但 **数据仍由 API 读写**，而非 CLI 打开 `~/.atmos/db/atmos.db`。

### 8.2 `atmos review` 重构要点（相对现状）

| 项 | 现状（待废弃） | 目标 |
|----|----------------|------|
| 数据平面 | CLI `main` 内 `DbConnection::new()` + `ReviewService` | 解析 **当前所选 Atmos Computer 的 API base URL**（与 `canvas` **同源**的解析链），HTTP 调用 `apps/api` 上 **Review 契约** |
| 事实来源 | 本机 `~/.atmos/db/atmos.db` 与 Server 上 API 使用的库 **可能不一致** | **仅** Server 进程内的 DB（由 API 迁移与服务层访问） |
| 实现落点 | `apps/cli` 依赖 `core-service` + `infra` 做 review | `apps/cli` **薄客户端**（HTTP + 序列化）；路由与 DTO 与 `apps/api` 对齐；缺失端点则在 **`apps/api` 增补** |

**开放项（实现前定稿）**：具体路径/DTO 是 **新增 `/v1/review/...` 资源树** 还是合并进既有模块；是否与 Desktop/Web 共享同一 Rust/TS client crate 由实现选择，但 **契约唯一源为 `apps/api`**。

### 8.3 例外（仍允许本机、不经业务 API）

- **`atmos local`**：管理本机 API 进程与 `state.json` / 安装物，属于 **宿主运维**，不要求走 review/canvas 类业务 API。
- **CLI 自检/更新**：如 `atmos update` 访问 GitHub 等，与 Atmos Server 数据平面无关。

---

## 9. 分阶段落地（Rollout）

| 阶段 | 交付物 |
|------|--------|
| **M1** | Control Plane 最小配对 API；Relay Worker + `ServerHub` DO 双向路由；Server 出站客户端；Desktop 或 Web 一端完成切换与建连；安全基线；**`atmos review` 改为经 API（§8.2），移除 CLI 内嵌 DB review 路径**（可与配对/M1 其他项并行排期，但以 PRD **M1-7** 为范围承诺）。 |
| **M2** | DO `ring` + `relay_seq` + 客户端重连 replay；离线 **Computer**（Server）策略细化。 |
| **M3** | 多 Client 广播语义、Canvas/终端事件分类白名单。 |
| **M4** | 云端拉起 **VPS/虚拟机** 与控制面对接；镜像内预置 `server.json` 或启动时 pair。 |
| **M5** | 组织权限、审计、配额、E2EE 可选模块。 |

---

## 10. 非功能需求

| 类别 | 要求 |
|------|------|
| **延迟** | Relay 增加一跳；目标 **P95 额外 RTT < 50ms**（同区域部署下，内测可调整）。 |
| **可用性** | Relay 故障时，客户端降级提示；**本机 Server 仍可 loopback**。 |
| **可观测性** | DO 暴露聚合指标：连接数、帧率、丢弃数、replay 命中率。 |

---

## 11. 安全清单（摘要）

- TLS 全链路；HSTS（Worker 侧）。
- Token 短期化 + 刷新；吊销即时生效（断开 DO 内 server 注册）。
- 速率限制：每 `user_id` / 每 `server_id` / 每 IP。
- 日志：**默认不记录 body**；如需调试，脱敏 + 采样。

---

## 12. 开放实现项（实现前闭环）

1. `body` 使用 **文本**（与现有 WS JSON 一致）还是 **二进制**（CBOR）；网关统一。
2. Control Plane 与 Relay **是否共享密钥**验证 Server（HMAC vs JWT）。
3. Desktop 与 Web **谁先交付 M1**（PRD 已要求至少一端）。

---

*本文档随实现迭代；与 PRD 冲突时以 PRD 为准并回写本文。*
