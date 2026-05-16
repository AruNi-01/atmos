# TEST · APP-016：Atmos Computer

> **命名**：用户向功能名 **Atmos Computer**；传输层为 **Cloudflare Relay + Durable Objects**（见 `TECH.md`）。
>
> 测试计划：**验什么、怎么算通过**。实现完成后由 `atmos-specs-test-run` 技能将场景落实为自动化测试。

## 1. 测试策略

| 层级 | 范围 |
|------|------|
| **单元** | 信封解析、路由决策、状态机迁移、HMAC/JWT 辅助函数。 |
| **集成** | Worker + DO 本地 **miniflare** / **wrangler dev**；模拟 **Computer** 上 Server 与 Client 双端。 |
| **E2E** | 真实 CF staging；一台真实 **Computer** + Desktop/Web 客户端；配对全流程。 |
| **安全** | 无效 token、错误 `server_id`、过期配对码、重放配对请求。 |

## 2. 关键场景（Given / When / Then）

### S1：配对注册

- **Given** 用户已在 Control Plane 登录  
- **When** 用户申请配对码并在 **Computer**（其 Server）上执行注册  
- **Then** Control Plane 返回 `server_id` 与 `server_secret`；**Computer** 本地写入 `relay_identity.json`；用户 **Computer** 列表中出现新条目

### S2：Computer 上 Server 出站连接 Relay

- **Given** 有效 `relay_identity.json` 与网络可达 Relay
- **When** **Computer** 上 Server 进程启动出站客户端  
- **Then** DO 进入 `READY`（或等价）；Control Plane/诊断接口显示该 **Computer** **在线**  

### S3：Client 经 Relay 订阅 Computer

- **Given** 目标 **Computer** 已在线（Server 已出站接入 Relay）  
- **When** Client 使用合法短期 token 连接 `wss://.../v1/client?server_id=...`  
- **Then** Client 收到 `ctrl: subscribed`（或等价）；随后业务帧可双向透传  

### S4：切换 Atmos Computer

- **Given** 用户已添加 **Computer** A 与 **Computer** B  
- **When** 用户在 UI 从 A 切换到 B  
- **Then** 与 A 的 WS 关闭或与 A 的订阅取消；与 B 的新连接建立；**无**跨 **Computer** 的终端/Canvas 状态泄漏（新连接后状态来自 B）  

### S5：Computer 离线

- **Given** Client 已连接且 **Computer** 上 Server 正常运行  
- **When** Server 进程被杀死或网络断开超过阈值  
- **Then** Client 收到 `server_offline`（或等价）；UI 展示可恢复状态；**不**静默失败  

### S6：鉴权失败

- **Given** 攻击者持有错误 token 或他人 `server_id`  
- **When** 尝试建立 Client WS  
- **Then** 连接在握手阶段被拒绝；无业务数据泄露  

### S7：CLI 与 UI 共用当前所选 Atmos Computer（回归）

- **Given** 用户在 Web/Desktop 中 **当前所选 Computer = 本机 loopback**（或未启用 Relay 的等价场景）  
- **When** 用户在 Web 打开 Canvas 并开启 bridge，且在终端执行 `atmos canvas status`，且 **CLI 上下文与 UI 为同一 Computer**  
- **Then** 在无需手抄 `ATMOS_API_URL` 的前提下（依赖 `runtime_manifest` / `client-session.json` / 共享上下文等，以实现为准），`bridge` 状态与 UI **一致**  
- **And** 若将 UI 切换到 **另一台 Computer**，同一终端在未改 CLI 上下文时不应再假装仍代表原 **Computer**（应报错、提示切换上下文或显式 `--api-url`，具体 UX 在实现时定稿）

### S8：Replay（M2）

- **Given** M2 已启用 `ring` 与 `relay_seq`  
- **When** Client 在收到至少一条带 `relay_seq` 的下行帧后断网 5s 再重连，并携带 `last_seen_relay_seq`  
- **Then** Client 收到缺失区间内的下行事件（在 `ring` 容量内）；无重复执行破坏数据完整性的 **已知** 变异用例通过（具体用例在实现时绑定 Canvas/终端各一条）  

### S9：`atmos review` 与 API 单一事实来源（M1-7）

- **Given** **所选 Atmos Computer** 上 `apps/api` 已启动，且 Web 已登录 **同一 Computer**、可看到某 review 会话  
- **When** 在终端执行 `atmos review session show <id>`（或等价子命令），且 **CLI 的 Computer 上下文与 Web 一致**  
- **Then** 返回的 JSON 与 Web 中同一会话 **一致**；在 CLI 中创建/更新 comment 后，刷新 Web **立即可见**（无「CLI 写本地库、UI 经 API 读另一数据源」的双轨）  
- **And** 实现上 **不存在** CLI 进程内 `DbConnection::new()` + `ReviewService` 的 review 数据路径（代码审查或 grep 门禁可验）

## 3. 性能与容量（验收阈值，可调整）

| 项 | 阈值（建议初值） |
|----|------------------|
| 单 DO 并发 Client 数 | ≥ 5（M1）；≥ 20（M3 目标） |
| 环形缓冲深度 | M2：≥ 100 条或 ≥ 256KB（先小后大） |
| Server（**Computer** 上进程）重连退避 | 最大间隔 ≤ 60s |

## 4. 回归与兼容

- **APP-015**：Canvas CLI + bridge 在 **仅 loopback** 与 **Relay** 两种模式下各跑一遍 `status` / `get-state`（若 M1 已接 Relay）。
- **APP-016 M1-7**：`review` 子命令 **仅** 命中 `apps/api`；与 **S9** 场景一并回归。
- **APP-002**：终端多路复用基本会话在切换 **Computer** 后重新建立，无僵尸 session（与 TECH 中 `conn_id` 策略一致）。

## 5. 手动测试清单（发版前）

- [ ] 新用户首次配对全流程（录屏）
- [ ] 吊销 **Computer** 后，旧 token 立即失效
- [ ] 同一用户两台 **Computer** 同时在线，切换无串线
- [ ] Relay staging 故障注入（503）时 UI 文案与重试按钮

## 6. Coverage Status

> 实现并跑完自动化测试后，由负责人在此追加一行：**日期 — 工具 — 覆盖范围 — 结论**。

---

*场景增补请同步 PRD Must/Should 条目。*
