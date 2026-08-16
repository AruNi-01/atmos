# ADR-006: Terminal client ByteStreamPort (WS / desktop IPC)

**状态**: ✅ 已采纳  
**日期**: 2026-08-16  
**决策者**: Aaryn  
**相关**: [known-debt-client-transport.md](../architecture/known-debt-client-transport.md), [ADR-004](./004-terminal-tmux-control-mode.md), APP-062 N1

## 背景 (Context)

Atmos 从 Web 起步，终端 live I/O 的浏览器↔runtime 载体是 `/ws/terminal/:id`（JSON 控制 + binary PTY）。桌面端复用同一套 `apps/web` UI，renderer 也自己开一条 loopback WebSocket。

APP-062 把 **pane** 热路径换成了 `pipe-pane`；API 侧已有 `PaneIoRegistry` fan-out。浏览器↔API 的载体仍是 WS。桌面本地同机同用户时，renderer 再走 Chromium WebSocket 是多余的 hop。Web、Relay、远程 Computer、mobile 没有进程 IPC，必须继续用网络 WS。

约束：

- 业务层（`Terminal.tsx`）不直接 `new WebSocket` / `ipcRenderer`
- 不发明第三套终端消息形状；session id、JSON 控制、binary output 不变
- 本地 stream 全程 binary，禁止 JSON+base64 作为主路径
- 远程 / tunnel 不得走 IPC

## 决策 (Decision)

抽象 **ByteStreamPort**（duplex：string JSON + `Uint8Array` binary），由 runtime binding 选载体：

| Binding | Carrier |
|---------|---------|
| 浏览器 / Tauri / 无 IPC bridge | `ws`（现有 `/ws/terminal/:id`） |
| Electron **且** 目标是 loopback sidecar | `ipc`（renderer ↔ main 专用 binary 通道） |
| Electron **且** URL 非 loopback（relay / 远程） | `ws`（与 Web 同一家族） |

桌面本地的真实拓扑：

```text
xterm (renderer)
  -- Electron IPC binary -->  main TerminalStreamHub
  -- loopback WS ---------->  Atmos API /ws/terminal/:id
                              --> PaneIoRegistry --> tmux pipe-pane
```

Renderer 不再自己开 terminal WebSocket。main↔API 仍复用现有 WS handler（不改协议、不改 fan-out）。后续可以把 main↔API 换成 UDS，而不改 `ByteStreamPort` / 业务层。

ControlPort（attach 元数据走独立 IPC invoke）仍是后续阶段；本决策只切 **ByteStreamPort**。

## 考虑的方案 (Alternatives Considered)

### 方案 1: 桌面整棵 Terminal `if (isDesktop)` 分叉

**评估**: 永久 web/desktop 分裂。不选。

### 方案 2: Renderer 直连 `~/.atmos/state/tmux-pipes/*.sock`

**评估**: 那是 helper↔API 的 pane pipe，不是 frontend↔API。会绕过 registry / auth。不选。

### 方案 3: 一个 `Transport.send(any)`

**评估**: 把 RPC 和 byte stream 混成第二套协议。不选。

### 方案 4: 本决策（端口 + 适配器）

**评估**: ✅ 业务 API 稳定；Web / 远程不搬家；桌面只缩短 renderer 热路径。

## 后果 (Consequences)

### 正面影响

- 桌面本地 TUI 输入/输出不再经过 renderer WebSocket
- Web / mobile / relay 继续用同一套消息形状
- 功能测试可用 in-memory `ByteStreamPort`

### 负面影响

- main 仍为每个 attach 持有一条到 sidecar 的 WS（UDS 是下一跳）
- Electron preload 增加 `terminalStream` 专用通道（不走 JSON command router 热路径）

### 中立

- `useTerminalWebSocket` 名称保留；内部已是 port + binding
- API 入口不变：仍是 `/ws/terminal/:id`

## 参考资料

- `packages/shared/src/terminal/byte-stream-port.ts`
- `apps/web/src/features/terminal/lib/bind-terminal-byte-stream-port.ts`
- `apps/desktop-electron/src/terminal/stream-hub.ts`
