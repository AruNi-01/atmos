# PRD · APP-016：Atmos Computer

> **命名**：**Atmos Computer** 是用户可见的一台计算环境（例如在 **VPS** 上启动一台、在笔记本上再连过去）；控制面以 `server_id` 标识；其上运行的 **`apps/api` 进程**仍称 **Atmos Server**。**Cloudflare Relay + Durable Objects** 为连接与传输层，见 `TECH.md`。
>
> 产品需求：**做什么、为谁、成功长什么样**。技术协议见 `TECH.md`。与 [APP-012](../APP-012_tunnel-connector/TECH.md) **无依赖关系**（见下文「范围外」）。

## 1. 背景与动机

### 1.1 问题陈述

- Atmos 由 **Web、API（Server）、CLI、Desktop** 组成；用户希望在 **多台 Atmos Computer**（本地、**云端 VPS**、CI 旁路等）上开发。
- 用户希望 **在 Web 或 Desktop 中显式选择「当前连接的 Atmos Computer」**，所有会话能力（终端、Canvas、工作区状态等）均落在该 **Computer** 内的 **Atmos Server** 上。
- 用户计划使用 **Cloudflare Workers + Durable Objects** 提供 **Relay**，并利用 DO 实现 **事件 replay**（断线重连、短暂缓冲），避免为每台 **Computer** 维护稳定的公网入站地址。

### 1.2 产品定位（一句话）

> **每台 Atmos Computer 上运行一个 Atmos Server；Server 通过出站连接注册到云端 Relay；用户在客户端选择 Computer 后，经 Relay 与该 Computer 上的 Server 建立逻辑上的「直连 WS 会话」。**

## 2. 目标用户与核心场景

| 角色 | 场景 |
|------|------|
| **日常开发者** | 本地启动 **Atmos Computer**（本机 **Atmos Server**）；Desktop/Web 默认选中「本机 **Computer**」；CLI **与 UI 共用当前所选 Computer 的 API 基址**（选中本机时常可用 `runtime_manifest` 零配置，见 TECH §8），而非与 UI 脱钩的「永远连 127.0.0.1」。 |
| **多环境用户** | 笔记本上开 Web，选择「云端 **Computer** / VPS #3」；在该环境的终端里跑 agent；Canvas 与终端状态均来自该 **Computer**。 |
| **团队（后续）** | 共享某台团队 **Computer** 的访问权限；审计谁在何时连到哪台 **Computer**（分期）。 |

## 3. 用户故事（Must 优先）

1. 作为用户，我希望在 **Desktop/Web 中看到我已添加的 Atmos Computer 列表**，并能 **切换当前 Computer**，以便明确「我现在操作的是哪台机器」。
2. 作为用户，我希望通过 **一次性注册命令**（Web 生成高熵 `register_token`，在 VPS 上执行即可）把一台新的 **Computer** 加入列表，而无需在 Server 上配置控制面主密钥或公网 IP。
3. 作为用户，我希望 **`atmos` CLI 默认使用与 Web/Desktop 相同的「当前所选 Atmos Computer」的 `apps/api` 基址**（含 `canvas`、`review` 等 HTTP 能力），**无需**依赖手抄 `ATMOS_API_URL` 才能与 UI 对齐；当我选中本机 **Computer** 时可用本机发现（如 `runtime_manifest`）自动落到 loopback，当我选中云端 **Computer** 时 CLI 也应对准该 **Computer**（经 Relay gateway 等，分期见 TECH），避免「UI 看 A、终端改 B」。
4. 作为用户，我希望在 **网络闪断后** 客户端能 **自动恢复** 与当前 **Computer** 的会话，并 **尽量不丢失** 进行中的操作上下文（依赖 Relay 的 replay 能力，分期目标需可验收）。
5. 作为用户，我希望 **Relay 不知道我的业务消息明文语义**（至少 M1 以「不解析业务 body」为产品承诺），以降低对云端的信任假设（技术约束见 TECH）。
6. 作为用户，我希望 **`atmos review` 仅通过当前所选 Atmos Computer 上的 `apps/api` 执行业务读写**（与 Web/Desktop 同源），**不以 CLI 进程内直连数据库为数据平面**；**API（及 API 背后的持久化）为唯一事实来源**，避免「浏览器看一套数据、终端里 `review` 改另一套」的静默分叉。

## 4. 功能需求

### 4.1 Must Have（M1 范围建议）

| ID | 需求 |
|----|------|
| **M1-1** | 定义并文档化 **Atmos Computer 身份**（`server_id`）与 **客户端身份**（`client_id` / 会话 id），在用户切换 **Computer** 时，**Web / Desktop / CLI** 状态与连接目标一致；其中 **CLI 的 `apps/api` HTTP 基址**须绑定 **当前所选 Computer**，与 UI 同源（解析与降级见 TECH §8）。 |
| **M1-2** | **控制面**：`register_token` 注册 Server、`GET /v1/computers` 列表、`client_sessions` 连 Relay、吊销；**无** 8 位配对码。用户持 **Access Token**（Bearer）；`tenant_id = sha256(access_token)`；用于签发 `register_token`、列 Computer、建 `client_session`、吊销（见 `TECH.md` §2.4）。`CONTROL_PLANE_KEY` 仅保留给系统/运维管理，**不**作为终端用户鉴权。 |
| **M1-3** | **Relay 数据面**：**Computer** 上的 Atmos **Server** 进程启动后建立 **出站 WSS** 至 Relay；客户端经 Relay **订阅指定 `server_id`**；双向帧可送达。 |
| **M1-4** | **信封路由**：Relay 仅根据信封字段路由，**不依赖**解析 Atmos 现有 WS 业务 JSON 结构（与 TECH 一致）。 |
| **M1-5** | **Desktop / Web** 至少一端完成「**Computer** 列表 + 切换 + 经 Relay 建连」的端到端体验（另一端可为后续迭代，但需在 TECH 标明）。 |
| **M1-6** | **安全基线**：`register_token` / `client_token` / `server_secret` 高熵+短效；`register` 限速；Relay WS 强制鉴权。见 `TECH.md` §2.4、§3。 |
| **M1-7** | **CLI Review 与 API 对齐**：`atmos review` **重构为 HTTP 客户端**（**API 基址与 `canvas` 同源**：随 **当前所选 Atmos Computer** 解析；`--api-url` / `ATMOS_API_URL` / `client-session.json` / 本机 `runtime_manifest` 等优先级与适用场景以 TECH §8 为准）；**禁止**在 CLI 内嵌 `DbConnection` + `ReviewService` 直连 `~/.atmos/db` 作为 review 数据平面。**API 为唯一事实来源**：鉴权、迁移版本、审计与业务校验与 UI 同路径。 |

### 4.2 Should Have（M2 及以后）

| ID | 需求 |
|----|------|
| **M2-1** | Relay 侧 **事件环形缓冲 + replay**：客户端重连时可带 `last_event_id` 或等价游标，补发缺失事件（与现有 WS 请求/响应模型兼容策略见 TECH）。 |
| **M2-2** | **云端拉起 VPS/虚拟机**（新 **Atmos Computer**）：控制面触发计算环境创建（如云厂商 API、自建编排），注入配对或预置 `server_secret`；**不叫 Droid**——Droid 为 Factory 旗下 Agent/产品名；本 spec 用户向功能称 **Atmos Computer**。 |
| **M2-3** | **多客户端同时连接同一 Atmos Computer**：Relay 将 **Server** 产生的下行事件按策略广播/过滤（TECH 定义）。 |

### 4.3 Nice to Have

- 组织/工作区级别的 **Computer** 池与权限继承。
- Relay 区域选择（就近接入）。
- 端到端加密（E2EE）：Relay 仅见密文 envelope。

## 5. 明确不包含（Out of Scope）

| 项 | 说明 |
|----|------|
| **[APP-012](../APP-012_tunnel-connector/TECH.md) tunnel-connector** | 不纳入本 spec 的设计依赖；不讨论 Tailscale/反向隧道等作为多 **Computer** / Relay 的前提方案。 |
| **具体云厂商实现细节** | PRD 只要求「CF DO + Worker 提供 Relay/replay」；密钥管理、账单、SLA 在 TECH/运维文档展开。 |
| **合并 api/web/cli 为单二进制** | 非目标。 |
| **替换 Atmos 现有业务 WS 协议** | 非目标；Relay 为 **传输层**，业务语义仍在 Server。 |
| **在 CLI 内复制一套与 API 分叉的 Review 业务规则** | 非目标；Review 能力以 **Server 内 `core-service` + `apps/api` 暴露的契约** 为准，CLI 只做调用方。 |

## 6. 成功指标（可量化）

| 指标 | 说明 |
|------|------|
| **连接成功率** | 在稳定网络下，配对成功的 **Computer**（Server）与客户端经 Relay 建连成功率 ≥ 99%（内测阶段统计）。 |
| **切换延迟** | 用户切换 **Computer** 后，**T+3s 内** 可收到第一条应用层心跳/就绪信号（具体事件名在 TECH 定义）。 |
| **断线恢复** | M2 后，30s 内的闪断 **无需用户重新配对** 即可恢复会话（验收见 TEST）。 |
| **安全** | 无有效凭证时，**无法**通过 Relay 订阅他人 `server_id`（渗透测试用例）。 |

## 7. 风险与依赖

| 风险 | 缓解 |
|------|------|
| 云端 Relay 不可用 | 本机 loopback 仍可用；UI 明确展示「仅本地」与「云端」模式。 |
| DO 成本与热点 | 每 `server_id` 独立 DO 实例隔离；限流与配额（TECH）。 |
| 协议版本漂移 | 信封带 `v` 字段；拒绝不兼容版本并提示升级。 |

## 8. 文档关系

- `BRAINSTORM.md`：为何选 Relay、与 tunnel-connector 的边界；**Atmos Computer** 命名与痛点。
- `TECH.md`：控制面 API、Relay 路由、DO 状态、与现有 `apps/api` WS 集成方式。
- `TEST.md`：验收场景与回归清单。

---

*PRD 变更请同步检查 `TECH.md` 是否仍一致。*
