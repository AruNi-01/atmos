# 头脑风暴 · APP-016：Atmos Computer

> 探索阶段：问题空间、方案取舍、开放问题。**命名**：用户向功能名 **Atmos Computer**；**Atmos Server** = 某 Computer 上的 `apps/api`。**Relay + DO** 见 `TECH.md`。定稿内容以 `PRD.md` / `TECH.md` 为准。

## 1. 我们要解决什么

### 1.1 现状痛点

- **开发期**：Web（Next）与 API（Axum）双进程、双端口；CLI 与浏览器要对齐「同一台 **Computer** 上的 API」，依赖环境变量或本机 `runtime_manifest.json` 等发现机制，心智负担仍在。
- **产品愿景**：用户有多台 **Atmos Computer**——本地笔记本、**云端 VPS/虚拟机**、办公室工作站——希望 **Web / Desktop UI 选定一台 Computer**，在该环境中开发；**CLI** 与 UI **共用当前所选 Computer**；常在一台 **Computer** 的终端里跑命令时，与 UI 所见为 **同一台 Computer**。
- **网络约束**：不希望把「多 **Computer** / 多入口」与「入站 NAT 穿透 / 自建隧道」强绑定；倾向 **Server 仅出站**、云端提供 **Relay**，由 Relay 做路由与（可选）回放。

### 1.2 非目标（本 spec 刻意不包含）

- **不包含 [APP-012](../APP-012_tunnel-connector/TECH.md) 的 tunnel-connector 能力**：tunnel-connector 解决的是「如何把本机 API 暴露到公网/LAN」这一层；本 spec 的 **Relay 是另一条独立路径**（出站 + 云端路由）。两者可并存，但 **设计决策互不依赖**。
- **不把 OpenCode 式「单二进制内嵌 serve+web」当作目标**：Atmos 保持 `api` / `web` / `desktop` / `cli` 分仓发布；Relay 只解决 **跨进程、跨机器的控制面与数据面连接**。

## 2. 参考产品形态（类比，非实现约束）

| 产品/概念 | 启发点 |
|-----------|--------|
| [Factory Droid Computers](https://docs.factory.ai/cli/features/droid-computers)（**第三方品牌**） | 对方产品里「可寻址的一台计算环境」的**产品形态**可参考；**本 spec 用户向名称：Atmos Computer**；不把 Atmos 叫作 Droid，以免与 Factory 的 Agent 品牌混淆。 |
| [Paseo](https://github.com/getpaseo/paseo) | 官方 `packages/relay` 用 **Wrangler + Worker + Durable Object**（`RelayDurableObject`）做 WS 中继、按 `serverId` 路由；**未见 D1 绑定**（DO 侧可用 **Durable Objects SQLite** 等能力）。README 亦指向社区 **[paseo-relay](https://github.com/zenghongtu/paseo-relay)（Go 自建）**，与 Cloudflare 无关。 |

**借鉴结论**：把 **Atmos Server**（`apps/api` 进程）定义为 **单台 Atmos Computer 内计算与状态的唯一宿主**；Relay 只做 **连接与路由（+ 可选事件回放）**；Web/Desktop 是 **多 Computer 客户端**。

## 3. 方案轴心：Relay + 出站 WebSocket

### 3.1 为什么用「出站 WS」而不是「入站 API」

- Server 部署在用户机、内网、随机端口时，**入站公网地址不稳定**。
- **Cloudflare Durable Objects（DO）** 适合维护「每 `server_id` 一个 hub」的长连接与会话状态；Worker + D1 适合 **控制面**（账号、**Computer** 列表、配对码、令牌签发）。
- 用户明确要求使用 **Cloudflare DO 提供 replay**（事件缓冲与断线重放语义），与「仅转发」可分期实现。

### 3.2 备选方案（记录取舍）

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A. 每台 Server 公网 IP + TLS | 简单直连 | 端口、证书、防火墙、动态 IP | 不作为主路径 |
| B. 自建 STUN/TURN + P2P | 低云端成本 | 实现与排障成本高 | 不采纳 |
| C. 仅 Tailscale/WireGuard | 安全 | 强制用户网络栈 | 可作为 **可选增强**，非本 spec 核心 |
| **D. CF Worker + DO Relay，Server 出站** | 无入站、易扩展多台 **Computer**、与 DO replay 契合 | 依赖 CF、需设计协议与配额 | **主路径** |

## 4. 与现有仓库能力的关系

- **现有 WS 协议**（终端、Canvas bridge、业务消息）：理想情况下 **body 不在 Relay 解析**，仅路由 **信封** → 降低耦合，保留未来 E2EE 空间。
- **`runtime_manifest.json`**：描述 **某一 Computer 上 Server 进程在本机的 loopback 监听**（host/port/url，**无 auth token**），当 **Web/Desktop/CLI 的当前上下文 = 该 Computer** 时，可作为 **该上下文的** API 基址发现来源；**不是**「凡 CLI 必读本机」的全局规则。
- **CLI `review` 与 API 锚点**：当前仓库里 `atmos review` 通过 **本机 SQLite**（`~/.atmos/db/atmos.db`）直连 `ReviewService`，与浏览器连 **远端/另一套 API** 时会产生 **静默分叉**；本 spec 与 PRD **M1-7** 要求改为 **仅经 `apps/api`**，与「**Computer** 上 **Server** 为计算与状态宿主」叙事一致。
- **Desktop 侧车 API**：仍是「本机一台 **Computer**」的一种形态；连 Relay 时与远程 **Computer** **同一套出站客户端逻辑**。

## 5. 开放问题（需在 PRD/TECH 迭代中收敛）

1. **控制面域名与多环境**：`staging` / `prod` Relay 是否分 Worker，还是单 Worker + 环境头？
2. **身份模型**：M1 是否仅「单用户拥有多台 **Computer**」，还是预留组织/工作区共享？
3. **Replay 语义**：与现有 WS「请求-响应」混用时，**幂等键**（`request_id` / `client_seq`）的规范。
4. **合规与审计**：Relay 是否持久化消息内容，还是仅元数据 + 短期环形缓冲？
5. **CLI 在用户笔记本上经 Relay 调 Canvas**：与「Canvas 仅连当前激活 **Computer**」的 UX 是否要在 M1 就做，还是 M2？

---

*本文件随讨论更新；实现以前以 PRD/TECH 锁定范围为准。*
