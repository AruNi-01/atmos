# ADR-004: 终端改为 tmux Control Mode Transport

**状态**: ✅ 已采纳  
**日期**: 2026-04-19  
**决策者**: Aaryn, Codex  
**替代**: [ADR-003](./003-terminal-scrolling-and-resize.md)

## 背景 (Context)

Atmos 的终端原先使用 `tmux attach-session` + PTY 的 transport。前端看到的并不是目标 shell/TUI 进程的原始 terminal byte stream，而是一个 tmux client 在 PTY 中渲染后的结果。为了修补这个架构，我们先后引入过 copy-mode 桥接、禁用 alternate screen、命令结束后 `capture-pane` 重放、resize cooldown、CSI 3J 清理等逻辑。

这些补丁解决了部分普通 shell scrollback 问题，但暴露出更深的架构问题：

1. `capture-pane` snapshot 不是 terminal state。它能给出屏幕文字，但不包含 parser mode、光标状态、mouse tracking、alternate screen、pending synchronized frame 等完整状态。刷新重连后，xterm.js 容易和 tmux 的真实 pane 状态分叉。
2. `CMD_END` 后延迟重放 scrollback 会和下一条命令或后台输出竞争。旧 snapshot 可能清掉新 live output。
3. resize 后靠清 scrollback 或 cooldown 只能掩盖旧帧残留，不能保证 TUI 当前帧正确。
4. 禁用 tmux alternate screen 会让全屏 TUI 的局部重绘直接污染 normal buffer。OpenCode、Amp、Droid 这类应用大量依赖 alternate screen、局部擦除、同步输出和鼠标状态，残影、错位、卡死会反复出现。
5. 通过 JSON text frame 传输 terminal output 会强制经过 UTF-8 字符串路径。terminal stream 本质是 byte protocol，完整性不应依赖文本编码。

在排查过程中观察到几个关键现象：

- `printf 'abcd\rXY'` 这类局部重绘通过 `capture-pane` 会得到 `XYcd`，但真实 cursor 已在 `2,0`。只重放文本无法恢复真实状态。
- OpenCode/Amp 的残影主要来自 terminal 模式和字节流不完整，而不是单纯 WebGL 渲染问题。禁用 WebGL 会让字体锯齿更强，且不能解决根因。
- tmux control mode 的 `%output` 行中，pane id 后的第一个空白是协议分隔符，后续空白可能是 payload 本身。错误地 `trim_start` 会丢失画面前导空格，导致 Droid logo 和布局文本粘连。
- tmux 3.6 下 `capture-pane -a` 在 control-mode attach 后可能返回 stale alternate buffer；默认 `capture-pane -p -e -N -S 0 -E -` 反而更接近当前 client-visible grid。
- reattach snapshot 能恢复画面，但 xterm.js 本地 DEC mode 不会自动恢复。alternate-screen TUI 的 mouse tracking 需要在前端恢复，否则滚轮会变成本地 scrollback/历史命令滚动。

## 决策 (Decision)

Atmos 的 tmux-backed terminal 统一改为 **tmux control mode** transport：

- 后端不再用 PTY 包住 `tmux attach-session`。每个 WebSocket connection 创建一个临时 grouped client session，并通过 pipe 启动 `tmux -CC ... attach-session -t <client_session>`。
- 后端解析 tmux control mode 协议，只转发目标 pane 的 `%output` / `%extended-output` payload bytes。
- terminal output 通过 WebSocket binary frame 发送到前端，避免 JSON text/UTF-8 路径破坏 byte stream。
- 前端 xterm.js 直接消费 pane output bytes，由 xterm.js 自己维护 terminal parser state、alternate screen、scrollback、synchronized update、鼠标模式和渲染。
- 用户输入用 `send-keys -H` hex command 写入目标 pane；terminal report 用 `refresh-client` report path 回传给 tmux/pane。
- resize 用 `resize-window` 固定目标 tmux window grid，再用 `refresh-client -C <cols>x<rows>` 同步 control client 尺寸。
- reattach 时只用 snapshot 做 hydration，不再做命令结束后的 scrollback resync。snapshot 包含当前可见 grid、cursor、cols/rows、alternate flag。
- 如果 snapshot 是 alternate screen，前端在重放后恢复 TUI mouse tracking mode；收到 `CMD_END` 时关闭这些 mode，避免影响普通 shell。

核心原则是：**live path 必须是唯一可信的 terminal state 来源；snapshot 只用于刷新/重连时的初始可见画面。**

## 考虑的方案 (Alternatives Considered)

### 方案 1: 继续修补 `attach-session` + PTY

**描述**: 保留旧 transport，在 CMD_END、resize、copy-mode、capture-pane replay 上继续加 generation token、cooldown、状态机和清屏策略。

**优点**:
- 改动范围相对小。
- 不需要实现 tmux control mode parser。
- 对旧代码路径扰动较低。

**缺点**:
- 根因仍在：前端看到的是 tmux client 的渲染结果，不是 pane 原始输出模型。
- `capture-pane` 仍无法恢复 parser mode、mouse tracking、cursor 等状态。
- 复杂度会继续增长，每个 TUI bug 都会变成特殊补丁。
- OpenCode/Amp/Droid 这类全屏局部重绘 TUI 很难稳定。

**评估**: 不选择。它只能延迟问题，不能把 terminal state 模型拉正。

---

### 方案 2: 禁用 alternate screen，让 xterm.js normal buffer 承载所有内容

**描述**: 沿用 ADR-003 的方向，在 tmux 配置中 override `smcup/rmcup`，让 TUI 内容进入 xterm.js normal buffer，并靠 CSI 3J / resize cooldown 清理残影。

**优点**:
- xterm.js 本地 scrollback 更容易工作。
- 普通 shell 场景的滚动体验较好。
- 不需要 control mode 大重构。

**缺点**:
- 破坏全屏 TUI 对 alternate screen 的假设。
- TUI 的擦除、局部重绘、内部滚动会污染 normal buffer。
- 退出 TUI 后容易残留旧 UI。
- resize 和 reattach 时只能靠清理，不能保证画面语义正确。

**评估**: 已被本次实践证明不可作为长期架构。ADR-003 被本 ADR 替代。

---

### 方案 3: tmux control mode + xterm.js 原生 terminal state（最终选择）

**描述**: 使用 tmux control mode 作为 tmux-backed terminal 的唯一 transport。后端处理 control protocol 和 pane routing，前端 xterm.js 处理 terminal byte stream。

**优点**:
- terminal state ownership 清晰：tmux 维护 pane，xterm.js 维护前端 parser/screen，后端不伪造终端状态。
- 全屏 TUI 的 alternate screen、mouse tracking、synchronized output、局部擦除可以自然工作。
- live output 不再依赖命令结束后的整屏重写。
- WebSocket binary frame 保留 terminal byte stream，不被 UTF-8 文本路径破坏。
- close/destroy 语义更清楚：close 只销毁临时 client session，master window 保留；destroy kill master window。

**缺点**:
- 改动大，涉及 `core-engine`、`core-service`、`api`、前端 WS 和 renderer。
- 需要维护 tmux control mode parser、octal decoder、input/report encoder。
- refresh/reattach snapshot 仍然不是完整 terminal state，只能作为 hydration。需要非常克制地使用。
- 多客户端 attach 同一 window 时，window size 策略需要明确，避免不同 client 互相拉扯。

**评估**: ✅ 选择。它是当前产品目标下最干净、长期成本最低的架构。

## 关键实施细节

### 1. Control mode parser

`core-engine` 增加 control mode 协议模块：

- 解析 `%output`、`%extended-output`、`%begin/%end/%error`、`%exit`。
- 忽略未知 notification。
- 解码 tmux octal escaping，例如 `\033`、`\015`、`\012`、`\\`。
- pane id 和 payload 只切掉一个协议分隔空白，保留 payload 前导空格。
- 识别并保留 synchronized output markers，避免把 TUI 帧边界过早丢掉。

### 2. Session runner

`core-service` 的 tmux runner 改为：

- 创建 per-connection grouped client session。
- 查询目标 window/pane id。
- spawn `tmux -CC -f /dev/null -S <socket> attach-session -t <client_session>`，stdin/stdout 使用 pipe。
- reader 只转发目标 pane output，避免同一 session 里其他 pane/window 污染当前 terminal。
- `SessionCommand::Write` 编码为 `send-keys -t <pane_id> -H <hex...>`。
- `SessionCommand::Resize` 发送 `resize-window` + `refresh-client -C`。
- close 时 `detach-client`，等待 `%exit`，超时 kill child，然后 kill 临时 client session。
- destroy 时额外 kill master tmux window。

### 3. WebSocket transport

API terminal WebSocket 改为：

- terminal control messages 仍走 JSON text frame。
- terminal output 走 binary frame。
- 新增 `terminal_report`，用于前端把 terminal emulator report 送回后端。
- 删除旧的 scrollback/copy-mode 消息：`terminal_capture_scrollback`、`terminal_scrollback`、`tmux_cancel_copy_mode`、`tmux_check_copy_mode`、`tmux_copy_mode_status`。

### 4. 前端 renderer

前端 Terminal 组件改为：

- 支持 binary output，并用 `Uint8Array` 写入 xterm.js。
- 不再 CMD_END 后 resync scrollback。
- 不再 resize cooldown 清理旧帧。
- 不再禁用 WebGL。WebGL 渲染不是残影根因，禁用会降低字体质量。
- 对 terminal emulator report 做识别和回传，包括 OSC/DA/DSR/DECRQM/window-size 相关 response。
- reattach snapshot 时：
  - `term.reset()`。
  - 根据 `snapshot.alternate` 进入/退出 alternate screen。
  - 写入 snapshot data。
  - 恢复 cursor。
  - alternate screen 下恢复 mouse tracking mode。
  - CMD_END 时关闭 TUI mouse tracking mode。

### 5. Snapshot 策略

snapshot 只用于刷新/重连 hydration：

- 普通 shell capture 使用 tmux history 范围，保留 scrollback。
- alternate screen capture 使用当前可见 viewport。
- 使用 `capture-pane -p -e -N` 保留样式和 trailing cells，避免灰色背景/面板背景只出现在有文本处。
- 不使用 `capture-pane -a`，因为在当前 tmux 版本和 control-mode attach 场景下可能返回 stale alternate buffer。

## 后果 (Consequences)

### 正面影响 ✅

- 全屏 TUI 可用性显著提升：OpenCode、Amp、Droid 不再依赖历史重放修补。
- 输入、Ctrl-C、菜单交互、鼠标滚动和 TUI 内部滚动回到正常 terminal 模型。
- live output 自然进入 xterm.js，命令结束后不再有旧 snapshot 清掉新输出的风险。
- 普通 shell 和 TUI 的 scrollback 语义更接近真实终端。
- 后端 transport 更可测试：parser、octal decoder、input encoder 可以做单元测试。

### 负面影响 ⚠️

- 后端 tmux transport 复杂度从 PTY attach 转移到 control protocol parser/encoder。
- reattach snapshot 仍是近似恢复，不是完整 replay。后续如果要做到完全精确，需要 terminal state serialization 或事件日志 replay。
- 旧 tmux 版本如果不支持 `-CC` 或 `refresh-client -C`，不再自动 fallback。
- 多客户端共享同一 tmux window 时，最后一次 resize 会影响 master window 尺寸。

### 风险和缓解措施 🛡️

| 风险 | 严重程度 | 概率 | 缓解措施 |
|------|---------|------|---------|
| tmux control mode 协议解析漏 case | 高 | 中 | 增加 parser/octal/input encoder 单元测试；未知 notification 默认忽略 |
| snapshot reattach 与 live state 不一致 | 中 | 中 | snapshot 只做 hydration；live output 仍是唯一可信状态来源；alternate screen 特化 viewport capture |
| WebSocket binary/text 混用导致前端处理遗漏 | 中 | 低 | WS hook 明确区分 binary terminal output 和 JSON control message |
| 多 client resize 互相影响 | 中 | 中 | 使用 per-connection client session；窗口尺寸策略保持显式，后续可加 active-client policy |
| TUI mouse mode 在 reattach 后丢失 | 中 | 中 | alternate snapshot hydration 后恢复 mouse tracking，CMD_END 时关闭 |

## 验证 (Validation)

本次重构中用于确认问题和修复的关键验证：

- `printf 'abcd\rXY'` 用于证明 `capture-pane` text snapshot 不能代表真实 cursor state。
- OpenCode/Amp/Droid 作为全屏 TUI 回归样例，覆盖 alternate screen、局部擦除、内部滚动、mouse tracking、同步输出和 reattach。
- `tmux capture-pane -p -e -N -S 0 -E -` 与 `capture-pane -a` 对比，确认当前 tmux 版本下 `-a` 会返回 stale alternate buffer。
- `cargo test -p core-engine tmux::control`
- `cargo test -p core-service --no-run`
- `cargo test -p api --no-run`
- `bun --cwd apps/web typecheck`

## 后续工作

1. 增加端到端 TUI regression 测试，覆盖 OpenCode/Amp/Droid 或可替代的 fixture TUI。
2. 为 reattach snapshot 增加更小的 fixture 测试，覆盖 background cells、alternate screen、cursor、mouse mode。
3. 明确多客户端 resize 策略，例如 active tab 优先、last focused client 优先，或每 window 固定 canonical size。
4. 对 terminal report 继续收敛，只转发 tmux/control mode 实际需要的 report。
5. 将旧 attach-session transport 相关死代码彻底删除，避免以后误用。

## 相关文件

| 文件 | 用途 |
|------|------|
| `crates/core-engine/src/tmux/control.rs` | tmux control mode parser、octal decoder、input/report encoder |
| `crates/core-engine/src/tmux/mod.rs` | tmux session/window 管理、snapshot capture、标准配置 |
| `crates/core-service/src/service/terminal.rs` | terminal session runner、control client 生命周期、resize/input/report |
| `crates/core-service/src/service/ws_message.rs` | terminal WebSocket message DTO |
| `apps/api/src/api/ws/terminal_handler.rs` | terminal WS handler、binary output 转发 |
| `apps/web/src/components/terminal/Terminal.tsx` | xterm.js renderer、snapshot hydration、mouse mode 恢复 |
| `apps/web/src/components/terminal/use-terminal-websocket.ts` | 前端 WS binary/text 处理 |
| `apps/web/src/components/terminal/types.ts` | terminal snapshot/types |

## 相关决策 (Related Decisions)

- [ADR-003](./003-terminal-scrolling-and-resize.md): 旧的 terminal scrolling/resize 方案，已被本 ADR 替代。

## 更新历史 (Update History)

- 2026-04-19: 初始版本，记录 tmux control mode terminal transport 重构过程和最终决策。
