# TEST · APP-016：多 Server 与 Cloudflare Relay（Durable Objects）

> 测试计划：**验什么、怎么算通过**。实现完成后由 `atmos-specs-test-run` 技能将场景落实为自动化测试。

## 1. 测试策略

| 层级 | 范围 |
|------|------|
| **单元** | 信封解析、路由决策、状态机迁移、HMAC/JWT 辅助函数。 |
| **集成** | Worker + DO 本地 **miniflare** / **wrangler dev**；模拟 Server 与 Client 双端。 |
| **E2E** | 真实 CF staging；一台真实 Server + Desktop/Web 客户端；配对全流程。 |
| **安全** | 无效 token、错误 `server_id`、过期配对码、重放配对请求。 |

## 2. 关键场景（Given / When / Then）

### S1：配对注册

- **Given** 用户已在 Control Plane 登录  
- **When** 用户申请配对码并在 Server 上执行注册  
- **Then** Control Plane 返回 `server_id` 与 `server_secret`；Server 本地写入 `server.json`；用户 Server 列表中出现新条目  

### S2：Server 出站连接 Relay

- **Given** 有效 `server.json` 与网络可达 Relay  
- **When** Server 进程启动出站客户端  
- **Then** DO 进入 `READY`（或等价）；Control Plane/诊断接口显示该 Server **在线**  

### S3：Client 经 Relay 订阅 Server

- **Given** Server 已在线  
- **When** Client 使用合法短期 token 连接 `wss://.../v1/client?server_id=...`  
- **Then** Client 收到 `ctrl: subscribed`（或等价）；随后业务帧可双向透传  

### S4：切换 Server

- **Given** 用户已添加 Server A 与 Server B  
- **When** 用户在 UI 从 A 切换到 B  
- **Then** 与 A 的 WS 关闭或与 A 的订阅取消；与 B 的新连接建立；**无**跨 Server 的终端/Canvas 状态泄漏（新连接后状态来自 B）  

### S5：Server 离线

- **Given** Client 已连接且 Server 正常运行  
- **When** Server 进程被杀死或网络断开超过阈值  
- **Then** Client 收到 `server_offline`（或等价）；UI 展示可恢复状态；**不**静默失败  

### S6：鉴权失败

- **Given** 攻击者持有错误 token 或他人 `server_id`  
- **When** 尝试建立 Client WS  
- **Then** 连接在握手阶段被拒绝；无业务数据泄露  

### S7：本机 CLI 与 UI 一致（回归）

- **Given** Server 仅 loopback 模式、未启用 Relay  
- **When** 用户在 Web 打开 Canvas 并开启 bridge，且在 **同一机器** 终端执行 `atmos canvas status`  
- **Then** CLI 无需 `ATMOS_API_URL` 即可成功；`bridge` 状态与 UI 一致  

### S8：Replay（M2）

- **Given** M2 已启用 `ring` 与 `relay_seq`  
- **When** Client 在收到至少一条带 `relay_seq` 的下行帧后断网 5s 再重连，并携带 `last_seen_relay_seq`  
- **Then** Client 收到缺失区间内的下行事件（在 `ring` 容量内）；无重复执行破坏数据完整性的 **已知** 变异用例通过（具体用例在实现时绑定 Canvas/终端各一条）  

## 3. 性能与容量（验收阈值，可调整）

| 项 | 阈值（建议初值） |
|----|------------------|
| 单 DO 并发 Client 数 | ≥ 5（M1）；≥ 20（M3 目标） |
| 环形缓冲深度 | M2：≥ 100 条或 ≥ 256KB（先小后大） |
| Server 重连退避 | 最大间隔 ≤ 60s |

## 4. 回归与兼容

- **APP-015**：Canvas CLI + bridge 在 **仅 loopback** 与 **Relay** 两种模式下各跑一遍 `status` / `get-state`（若 M1 已接 Relay）。
- **APP-002**：终端多路复用基本会话在切换 Server 后重新建立，无僵尸 session（与 TECH 中 `conn_id` 策略一致）。

## 5. 手动测试清单（发版前）

- [ ] 新用户首次配对全流程（录屏）
- [ ] 吊销 Server 后，旧 token 立即失效
- [ ] 同一用户两台 Server 同时在线，切换无串线
- [ ] Relay staging 故障注入（503）时 UI 文案与重试按钮

## 6. Coverage Status

> 实现并跑完自动化测试后，由负责人在此追加一行：**日期 — 工具 — 覆盖范围 — 结论**。

---

*场景增补请同步 PRD Must/Should 条目。*
