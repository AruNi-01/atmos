# ADR-003: 终端滚动与 Resize 架构优化

**状态**: 🔄 已替代（由 [ADR-004](./004-terminal-tmux-control-mode.md) 替代）
**日期**: 2026-03-17

## 背景 (Context)

Atmos 的终端区域基于 tmux + xterm.js 技术栈实现，存在以下体验问题：

1. **滚动体验差**: 滚轮事件被转发为 SGR mouse 序列送入 tmux，触发 tmux copy-mode。copy-mode 会在终端右上角显示 `16:31:04 [5/135]` 样式的状态栏，没有原生滚动条，交互不自然。
2. **Resize 时内容重复**: 调整窗口大小时，终端内容出现重复，视觉上闪烁。
3. **Resize 时闪烁**: ResizeObserver 使用 150ms debounce + requestAnimationFrame 双重延迟，导致可见的延迟和闪烁。
4. **输出效率低**: 每个 WebSocket 消息直接调用 `terminal.write()`，高频输出时造成卡顿。

**技术架构**:

Atmos 后端使用 `tmux attach-session` 连接到 tmux，通过 PTY 读取 tmux 输出并经 WebSocket 转发到前端 xterm.js。tmux 会把终端切换到 alternate screen buffer 进行绘制。

## 决策 (Decision)

采用 **xterm.js 本地滚动** 替代 tmux copy-mode，通过禁用 tmux alternate screen 和 mouse 模式，让 xterm.js 全权管理滚动和滚动条。

## 考虑的方案 (Alternatives Considered)

### 方案 1: tmux copy-mode 滚动（原方案）

**描述**: 前端拦截滚轮事件，转换为 SGR mouse 序列 (`\x1b[<64;col;rowM`) 发送给 tmux，进入 tmux copy-mode 浏览历史。

**优点**:
- 可以利用 tmux 完整的 scrollback history（history-limit: 10000）
- 滚动历史在 workspace 切换后仍然保留（tmux 持久化）

**缺点**:
- 没有原生滚动条，用户无法直观看到位置
- tmux copy-mode 显示丑陋的状态条（如 `[5/135]`）
- 需要复杂的 copy-mode 状态同步（前端 ↔ 后端）
- 与 xterm.js 的文本选择机制冲突

**评估**: 体验差，代码复杂度高

---

### 方案 2: tmux control mode (`tmux -C`)

**描述**: 使用 tmux control mode 代替 `tmux attach-session`。control mode 通过结构化的 `%output` 协议传输数据，不使用 alternate screen buffer。

**优点**:
- terminal 输出直接进入 xterm.js normal buffer，scrollback 自然工作
- 不需要 `smcup@:rmcup@` hack
- TUI 应用（vim、htop）的 alternate screen 可以正确穿透到 xterm.js
- 整体架构更干净

**缺点**:
- 需要大规模重构后端 PTY 架构（从 `attach-session` 改为 `-C` control mode）
- 需要实现 `%output` 协议解析、`send-keys -H` 输入编码等
- 需要处理 control mode 特有的 escape 序列解码（八进制转义）
- 改动涉及 `terminal.rs`、`terminal_handler.rs` 等核心文件

**评估**: 架构最优，但改动量过大，作为后续演进目标

---

### 方案 3: 禁用 alternate screen + xterm.js 本地滚动（最终选择）

**描述**: 在 tmux 配置中禁用 alternate screen (`smcup@:rmcup@`) 和 mouse 模式，让 xterm.js 完全管理滚动。通过在 resize 时清除 scrollback 来解决 TUI 应用的帧残留问题。

**优点**:
- 原生滚动条，滚动体验与普通终端一致
- 不需要 copy-mode 状态同步，大幅简化前端代码
- 文本选择、滚轮交互等由 xterm.js 原生处理
- 改动量小，不影响后端架构

**缺点**:
- Resize 时需要清除 scrollback（TUI 应用旧帧会泄漏到 scrollback）
- xterm.js scrollback 在 WebSocket 重连后丢失（tmux 仍保留完整历史，重连时回放）

**评估**: ✅ **选择此方案** — 在当前架构约束下，以最小改动实现最大体验提升。TUI resize 的 scrollback 清除是可接受的权衡。

## 具体变更

### 1. 后端 tmux 配置 (`crates/core-engine/src/tmux/mod.rs`)

```rust
// 之前
set-option -g mouse on
set-option -g -u terminal-overrides  // 使用默认（alternate screen 启用）

// 之后
set-option -g mouse off
set-option -g terminal-overrides "xterm*:smcup@:rmcup@"
set-option -g window-size latest
```

**`mouse off`**: tmux 不再拦截鼠标事件。xterm.js 处理所有滚动。TUI 应用（vim、htop）自行发送 mouse tracking 序列，不受影响。

**`smcup@:rmcup@`**: 禁用 tmux 到外层终端（xterm.js）的 alternate screen buffer。tmux 输出直接进入 xterm.js normal buffer，scrollback 正常工作。注意：tmux 内部仍然为 TUI 应用管理 alternate screen，此设置仅影响 tmux→xterm.js 链路。

**`window-size latest`**: 窗口尺寸跟随最新 client，减少多 client 场景的 resize 问题。

### 2. 前端 xterm.js 配置 (`apps/web/src/components/terminal/theme.ts`)

```typescript
// 之前
scrollback: 0,
scrollOnUserInput: false,

// 之后
scrollback: 10000,
```

xterm.js 启用 10000 行本地 scrollback buffer，提供原生滚动条。

### 3. 前端 Terminal 组件 (`apps/web/src/components/terminal/Terminal.tsx`)

**移除的代码**:
- `stripMouseEnable()` — 不再需要过滤 mouse tracking 序列（tmux mouse 已关闭）
- `enterCopyMode()` / `requestCopyModeCheck()` — 不再使用 tmux copy-mode
- `attachCustomWheelEventHandler()` — 不再将滚轮转为 SGR mouse 序列
- copy-mode 相关的 refs（`inCopyModeRef`、`wheelAccumRef`、`copyModeCheckTimerRef`）
- copy-mode 相关的 WebSocket 回调（`onCopyModeStatus`）

**新增的代码**:

输出批处理 — 通过 `requestAnimationFrame` 累积写入，每帧只调用一次 `term.write()`：

```typescript
const handleOutput = useCallback((data: string) => {
  if (data) {
    pendingWriteRef.current += data;
    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true;
      requestAnimationFrame(() => {
        rafScheduledRef.current = false;
        const pending = pendingWriteRef.current;
        pendingWriteRef.current = "";
        if (pending && terminalRef.current) {
          terminalRef.current.write(pending);
        }
      });
    }
  }
}, []);
```

ResizeObserver — 使用 rAF 合并，scrollback 在 resize 时保留：

```typescript
const resizeObserver = new ResizeObserver(() => {
  if (resizeRafId) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = 0;
    fit.fit();
    // Scrollback 不在前端清除 — 由后端按需决定。
    // 后端在 resize 后检查 #{alternate_on}，仅当全屏 TUI 应用
    // 活跃时才发送 CSI 3J 清除 scrollback。
  });
});
```

后端按需清除 scrollback（`apps/api/src/api/ws/terminal_handler.rs`）：

```rust
// Resize 后检查 tmux pane 是否处于 alternate screen（全屏 TUI）
// 仅在 TUI 活跃时延迟发送 CSI 3J，避免旧帧残留
if terminal_service.is_alternate_screen_active(session_id).await {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        // 通过 WS 发送 CSI 3J 给前端 xterm.js
        ws_tx.send(TerminalOutput { data: "\x1b[3J" });
    });
}
```

Scroll-to-bottom 按钮 — 基于 xterm.js `onScroll` 事件跟踪位置：

```typescript
terminal.onScroll(() => {
  const buf = terminal.buffer.active;
  const atBottom = buf.viewportY >= buf.baseY;
  setShowScrollDown(!atBottom);
});
```

## 后果 (Consequences)

### 正面影响 ✅

- **滚动体验**: 原生滚动条 + 平滑滚动，与标准终端一致
- **代码简化**: 移除约 80 行 copy-mode 相关代码，净减少 ~65 行
- **Resize 更流畅**: 移除 150ms debounce，使用 rAF 合并，响应更即时
- **输出性能**: rAF 批处理减少 xterm.js 渲染次数

### 负面影响 ⚠️

- **TUI 应用 resize 延迟清除**: 全屏 TUI resize 时，后端需 ~150ms 延迟后才发送 CSI 3J，期间旧帧可能短暂可见。
- **重连后 scrollback 丢失**: xterm.js scrollback 在页面刷新后丢失，但后端通过 `capture-pane` 回放 tmux 历史。

### 风险和缓解措施 🛡️

| 风险 | 严重程度 | 概率 | 缓解措施 |
|------|---------|------|---------|
| TUI 应用 resize 残留 | 低 | 中 | 后端检测 `#{alternate_on}` 后延迟发送 CSI 3J 清除 |
| 非 TUI 场景 scrollback 丢失 | - | - | 已修复：仅在 alternate screen 活跃时清除 scrollback |
| 重连后 scrollback 丢失 | 低 | 高 | tmux 保留完整历史，重连时通过 `capture-pane` 回放 |
| TUI 应用 mouse 支持受影响 | 低 | 低 | `mouse off` 仅影响 tmux 本身，TUI 应用自行发送 mouse tracking 序列 |

## 后续演进

长期应考虑迁移到 **tmux control mode** (`tmux -C`)，从根本上解决 alternate screen 问题。control mode 使用结构化协议传输数据，不占用 alternate screen，TUI 应用的 alternate screen 序列可以正确穿透到 xterm.js，无需 `smcup@:rmcup@` hack。

## 相关文件

| 文件 | 用途 |
|------|------|
| `crates/core-engine/src/tmux/mod.rs` | tmux 配置（mouse、terminal-overrides） |
| `apps/web/src/components/terminal/Terminal.tsx` | 前端终端组件（滚动、resize、输出） |
| `apps/web/src/components/terminal/theme.ts` | xterm.js 配置（scrollback） |
| `apps/web/src/components/terminal/use-terminal-websocket.ts` | WebSocket 通信 |
| `crates/core-service/src/service/terminal.rs` | 后端 PTY 管理、resize、alternate screen 检测 |
| `apps/api/src/api/ws/terminal_handler.rs` | WebSocket 消息处理、按需清除 scrollback |

## 更新历史

- 2026-03-17: 初始版本，已采纳并实施
- 2026-03-17: 优化 scrollback 清除策略 — 从无条件清除改为仅在全屏 TUI 活跃时清除（通过后端 `#{alternate_on}` 检测）
- 2026-04-19: 被 [ADR-004](./004-terminal-tmux-control-mode.md) 替代；禁用 alternate screen + capture-pane resync 被证明无法稳定支持 OpenCode/Amp/Droid 等全屏 TUI。
