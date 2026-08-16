# ADR-006: Terminal client ByteStreamPort (WS / desktop IPC / UDS)

**状态**: ✅ 已采纳  
**日期**: 2026-08-16  
**决策者**: Aaryn  
**相关**: [known-debt-client-transport.md](../architecture/known-debt-client-transport.md), [ADR-004](./004-terminal-tmux-control-mode.md), APP-062 N1 / N2

## 背景 (Context)

Atmos 从 Web 起步，终端 live I/O 的浏览器↔runtime 载体是 `/ws/terminal/:id`（JSON 控制 + binary PTY）。桌面端复用同一套 `apps/web` UI，renderer 也自己开一条 loopback WebSocket。

APP-062 把 **pane** 热路径换成了 `pipe-pane`；API 侧已有 `PaneIoRegistry` fan-out。浏览器↔API 的载体仍是 WS。桌面本地同机同用户时，renderer 再走 Chromium WebSocket 是多余的 hop。Web、Relay、远程 Computer、mobile 没有进程 IPC，必须继续用网络 WS。

约束：

- 业务层（`Terminal.tsx`）不直接 `new WebSocket` / `ipcRenderer`
- 不发明第三套终端消息形状；session id、JSON 控制、binary PTY 不变
- 本地 stream 全程 binary，禁止 JSON+base64 作为主路径
- 远程 / tunnel 不得走 IPC
- Renderer 禁止直连 `~/.atmos/state/tmux-pipes/*.sock`

## 决策 (Decision)

抽象 **ByteStreamPort**（PTY `Uint8Array`）和逻辑 **ControlPort**（JSON：resize / destroy / enter / attached|error|closed）。同一条连接上 multiplex：WS text = 控制，WS binary = PTY；桌面 IPC 用 `kind: text|binary`。不为此新增 REST，也不把 attach 改成独立 invoke。

| Binding | Renderer carrier | Sidecar (main↔API) |
|---------|------------------|--------------------|
| 浏览器 / Tauri / 无 IPC bridge | `ws`（`/ws/terminal/:id`） | n/a |
| Electron **且** 目标是 loopback sidecar | `ipc` | **UDS** `~/.atmos/state/api.sock`（失败回退 loopback WS） |
| Electron **且** URL 非 loopback（relay / 远程） | `ws` | n/a |

桌面本地拓扑：

```text
xterm (renderer)
  -- Electron IPC binary -->  main TerminalStreamHub
  -- Unix domain WS ------->  Atmos API /ws/terminal/:id   (preferred)
  -- loopback WS ---------->  same handler                 (fallback)
                              --> PaneIoRegistry --> tmux pipe-pane
```

PTY **输入和输出**都是原始字节。JSON `terminal_input` / `terminal_report` 仍被 API 接受（旧客户端）。新客户端把键入和 xterm report 走 binary。

Control 帧仍是 JSON。Attach 元数据继续在 stream URL query（打开流时 subscribe observer）。

可观测性：`carrier=ipc sidecar=uds` / `carrier=ipc sidecar=ws` / `carrier=ws`。

## 考虑的方案 (Alternatives Considered)

### 方案 1: 桌面整棵 Terminal `if (isDesktop)` 分叉

**评估**: 永久 web/desktop 分裂。不选。

### 方案 2: Renderer 直连 `~/.atmos/state/tmux-pipes/*.sock`

**评估**: 那是 helper↔API 的 pane pipe，不是 frontend↔API。会绕过 registry / auth。不选。

### 方案 3: 一个 `Transport.send(any)`

**评估**: 把 RPC 和 byte stream 混成第二套协议。不选。

### 方案 4: ControlPort 走独立 REST / IPC invoke

**评估**: attach 已经由打开 byte stream 完成；resize/destroy 低频。再开一条通道没有收益。不选。

### 方案 5: 本决策（端口 + 适配器 + 同 router 的 UDS）

**评估**: ✅ 业务 API 稳定；Web / 远程不搬家；桌面缩短 renderer 和 main↔API 热路径。

## 后果 (Consequences)

### 正面影响

- 桌面本地 TUI 输入/输出不再经过 renderer WebSocket
- main↔API 优先 UDS，去掉 loopback TCP/WS hop
- Web / mobile / relay 继续用同一套消息形状
- 功能测试可用 in-memory `ByteStreamPort`

### 负面影响

- Electron preload 增加 `terminalStream` 专用通道（不走 JSON command router 热路径）
- 桌面 main 依赖 Node `ws` 以支持 `ws+unix://`

### 中立

- `useTerminalWebSocket` 名称保留；内部已是 port + binding
- API 入口不变：仍是 `/ws/terminal/:id`（TCP 与 Unix 同一 Router）

## 参考资料

- `packages/shared/src/terminal/byte-stream-port.ts`
- `apps/web/src/features/terminal/lib/bind-terminal-byte-stream-port.ts`
- `apps/desktop-electron/src/terminal/stream-hub.ts`
- `apps/api/src/unix_bind.rs`
