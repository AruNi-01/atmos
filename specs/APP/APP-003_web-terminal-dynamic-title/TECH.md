# Web 终端动态标题技术方案：基于 Shell 垫片注入

> 版本：3.0
> 作者：Manus AI（初稿）、ATMOS 团队（优化与实现）
> 日期：2026-02-10

## 1. 背景与目标

在基于 Web 的终端应用中，用户通常会同时管理多个会话。如果能像 iTerm2 等现代桌面终端一样，根据当前正在运行的前台任务（如 `vim`, `cargo watch`）或当前路径动态更新终端标签页的标题，将极大地提升用户体验和工作效率。然而，要求用户为了网站去修改自己本地的 Shell 配置文件（如 `.zshrc`）是不现实且不友好的。

本方案旨在提供一种**非侵入式**的解决方案，在用户无感的情况下，为 Web 终端会话启用动态标题功能。

## 2. 核心设计原则

本方案的核心原则是 **"会话级临时注入" (Session-Level Temporary Injection)**。我们不修改任何用户磁盘上的永久配置，而是在后端为用户启动 PTY (伪终端) 会话时，通过命令行参数动态地、临时地加载一个预设的垫片脚本 (Shim Script)。该脚本负责在当前 Shell 会话中设置所需钩子，会话结束后所有改动自动失效。

### 2.1. 架构概览（v2.0 优化）

整个系统由四个核心组件构成：

| 组件 | 位置 | 职责 |
| :--- | :--- | :--- |
| **垫片脚本 (Shim Script)** | 后端服务器 `~/.atmos/shims/` | 按 Shell 类型分立的脚本（Bash/Zsh/Fish），设置 preexec/precmd 钩子，通过 **OSC 9999** 序列发送元数据。在 tmux 内自动使用 DCS passthrough 包裹。 |
| **后端注入器 (Backend Injector)** | 后端应用 | 在 **tmux new-session/new-window** 或 **简单 PTY spawn** 时，构建并追加 shim 启动参数。tmux 模式下启用 `allow-passthrough on`。 |
| **初始标题注入 (Initial Title Inject)** | 后端 `TerminalService` | WebSocket 连接建立后，查询 tmux `pane_current_command`/`pane_current_path`，注入合成 OSC 9999 序列，确保刷新后标题立即恢复。 |
| **数据传输** | PTY → WebSocket | **透传**：无需后端正则解析或剥离，OSC 序列随 PTY 输出一并发送至前端。 |
| **前端 OSC 处理器 (Frontend OSC Handler)** | 前端浏览器 xterm.js | 使用 `registerOscHandler(9999, ...)` 拦截 OSC 9999 序列，**防抖 CMD_START**（150ms） + **标题值去重**，解析并更新标签标题。 |

**v3.0 相比 v2.0 的优化**：

- **Tmux 穿透**：OSC 9999 被 tmux 终端模拟器静默丢弃。v3.0 在 shim 中检测 `$TMUX` 环境变量，自动使用 **DCS passthrough** 包裹 OSC 序列（`\033Ptmux;\033\033]9999;...\007\033\\`），配合 tmux `allow-passthrough on` 实现序列穿透。
- **刷新恢复**：页面刷新后 `dynamicTitle` 丢失，Shell 空闲时无新 `precmd` 触发。v3.0 在 **WebSocket 连接建立时**，后端主动查询 tmux `pane_current_command` / `pane_current_path`，注入合成 OSC 9999 序列，前端立即恢复标题。
- **防抖去重**：快速命令（`ls`、`pwd`、`echo`）导致标题闪烁 `path → cmd → path`。v3.0 在前端 OSC handler 中引入 **150ms CMD_START 防抖** + **标题值去重**，短命令不闪烁，长命令正常显示。

**v2.0 相比 v1.0 的优化**：

- **协议**：从自定义 `\x02ATMOS:...\x03` 改为标准 **OSC (Operating System Command)** 序列 `\033]9999;TYPE:PAYLOAD\007`，与 iTerm2/Kitty/WezTerm 等终端的设计理念一致。
- **解析层**：由**后端解析剥离**改为**前端 xterm.js 原生 OSC 拦截**，后端零改动，数据流完全透传。
- **传输通道**：**复用现有 WebSocket**，无需独立元数据通道。
- **Shell 适配**：Bash/Zsh/Fish 各用独立脚本，修复 v1.0 中 Fish 与 POSIX 混用导致的 Bug；Bash 使用 `__atmos_at_prompt` flag 保护，避免 DEBUG trap 多次误触发；Zsh 使用 **ZDOTDIR** 技巧正确链式加载用户配置。

## 3. 详细实现方案

### 3.1. 元数据协议：OSC 9999

采用 OSC (Operating System Command) 序列，格式为：

```
\033]9999;<type>:<payload>\007
```

* `\033]`：OSC 序列起始
* `9999`：自定义 OSC 标识符（避免与 iTerm2/Kitty 等厂商码冲突）
* `<type>`：消息类型，如 `CMD_START` 或 `CMD_END`
* `<payload>`：消息内容，如完整命令字符串或当前工作目录路径
* `\007` (BEL)：OSC 序列终止

**Tmux DCS passthrough**：tmux 终端模拟器只识别标准 OSC 码（0/4/7/52 等），自定义 OSC 9999 会被静默丢弃。垫片脚本检测 `$TMUX` 环境变量，在 tmux 内自动使用 DCS passthrough 包裹：

```
\033Ptmux;\033\033]9999;<type>:<payload>\007\033\\
```

tmux 收到 DCS passthrough 后解包，将纯 `\033]9999;...\007` 转发给 attach 端。需在 tmux 配置中启用 `set -g allow-passthrough on`（tmux 3.3+）。

**消息类型**：

| 类型 | 含义 | payload 示例 |
|------|------|--------------|
| `CMD_START` | 用户刚输入了一条命令，即将执行 | `vim src/main.rs` |
| `CMD_END` | 命令执行完毕，Shell 空闲 | `/Users/me/projects/atmos` |

xterm.js 通过 `registerOscHandler(9999, callback)` 拦截该序列，`callback` 返回 `true` 表示已消费，终端不会渲染该序列。

### 3.2. 垫片脚本

垫片脚本**编译时嵌入** Rust 二进制，运行时写入 `~/.atmos/shims/`。Bash/Zsh/Fish 各用独立文件，避免语法混用导致错误。

**统一发送函数**（各 Shell 语法不同，逻辑一致）：

```bash
__atmos_send_meta() {
    if [ -n "$TMUX" ]; then
        # tmux 内：DCS passthrough 包裹
        printf '\033Ptmux;\033\033]9999;%s:%s\007\033\\' "$1" "$2"
    else
        # 普通 PTY：直接 OSC
        printf '\033]9999;%s:%s\007' "$1" "$2"
    fi
}
```

#### Bash：`atmos_shim.bash`

* 通过 `bash --init-file /path/to/atmos_shim.bash` 加载
* 先 `source ~/.bashrc`，再注册 DEBUG trap 与 PROMPT_COMMAND
* 使用 `__atmos_at_prompt` flag 区分「用户输入」与「内部执行」，避免 PROMPT_COMMAND 等触发误报

#### Zsh：`zdotdir/.zshenv` + `zdotdir/.zshrc`

* 通过 `env ZDOTDIR=~/.atmos/shims/zdotdir zsh` 启动
* `.zshenv` 代理用户 `~/.zshenv`
* `.zshrc` 恢复 ZDOTDIR、加载用户 `~/.zshrc`，再 `add-zsh-hook preexec/precmd`

#### Fish：`atmos_shim.fish`

* 通过 `fish --init-command 'source /path/to/atmos_shim.fish'` 加载
* 使用 `fish_preexec`、`fish_prompt` 事件

### 3.3. 后端注入器

#### Tmux 模式

ATMOS 使用 Tmux 作为持久化层，Shell 由 **tmux 在创建 session/window 时启动**。注入点在 `TmuxEngine::create_session()` 和 `create_window()` 中，将构建好的 shell 命令追加到 tmux 命令参数之后（含首个 window）。

```rust
// 示例：tmux new-session -d -s name -n "1" -c /path env ZDOTDIR=/path/to/zdotdir zsh
let shell_command = shims::build_shell_command(&shims_dir, shell.as_deref());
self.tmux_engine.create_session(&session_name, ..., shell_command.as_deref())?;
```

tmux session 创建后立即设置 `allow-passthrough on`，使 DCS 包裹的 OSC 序列能穿透 tmux 到达 attach 端：

```rust
let _ = self.run_tmux(&["set-option", "-g", "allow-passthrough", "on"]);
```

`build_shell_command()` 根据 `$SHELL` 或显式参数返回：

| Shell | 命令示例 |
|-------|----------|
| Bash | `["bash", "--init-file", "/path/to/atmos_shim.bash"]` |
| Zsh | `["env", "ZDOTDIR=/path/to/zdotdir", "zsh"]` |
| Fish | `["fish", "--init-command", "source /path/to/atmos_shim.fish"]` |
| 其他 | `None`（优雅降级，不注入） |

#### 简单 PTY 模式（无 Tmux）

直接 spawn Shell 进程时，使用 `CommandBuilder::new(shell_args[0])` 并传入上述 `shell_command` 作为启动参数。

### 3.4. 初始标题注入（刷新恢复）

`dynamicTitle` 是前端瞬态状态，不持久化到后端。页面刷新后 WebSocket 重连，Shell 空闲时不会再触发 `precmd`，标题会回到默认的 "1"/"2"。

**解决方案**：在 `attach_to_tmux_window()` 中，PTY 初始化完成后，后端主动查询 tmux 并注入合成 OSC：

```rust
fn inject_initial_title(&self, session: &str, window: u32, output_tx: &Sender<Vec<u8>>) {
    let current_cmd = self.tmux_engine.get_pane_current_command(session, window)?;
    let osc = if SHELLS.contains(&current_cmd.as_str()) {
        // Shell 空闲 → 显示当前路径
        let path = self.tmux_engine.get_pane_current_path(session, window)?;
        format!("\x1b]9999;CMD_END:{}\x07", path)
    } else {
        // 有前台程序 → 显示命令名
        format!("\x1b]9999;CMD_START:{}\x07", current_cmd)
    };
    output_tx.send(osc.into_bytes());
}
```

前端现有的 OSC handler 自动接收处理，**无需任何前端改动**。

### 3.5. 前端 OSC 处理器（防抖 + 去重）

在 `Terminal.tsx` 中，xterm 实例初始化后注册 OSC 9999 处理器。为避免快速命令（`ls`/`pwd`/`echo`）导致标题闪烁，引入两层优化：

1. **防抖 CMD_START**（150ms）：收到 `CMD_START` 后不立即更新，延迟 150ms。若命令在此期间完成（`CMD_END` 到达），取消待定的 `CMD_START`，标题保持不变。只有 `vim`、`node`、`python` 等运行超过 150ms 的命令才显示名称。
2. **标题值去重**：新标题与当前标题相同时直接跳过，不触发 React 更新。连续 `ls` 或 `cd` 到同一目录均不闪烁。

```typescript
const CMD_START_DELAY_MS = 150;
const lastTitleRef = useRef("");
const cmdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

terminal.parser.registerOscHandler(9999, (data: string) => {
  const colonIdx = data.indexOf(":");
  if (colonIdx === -1) return true;
  const metaType = data.substring(0, colonIdx);
  const payload = data.substring(colonIdx + 1);

  if (metaType === "CMD_START") {
    const title = extractCommandName(payload);
    if (cmdStartTimerRef.current) clearTimeout(cmdStartTimerRef.current);
    cmdStartTimerRef.current = setTimeout(() => {
      cmdStartTimerRef.current = null;
      if (title !== lastTitleRef.current) {
        lastTitleRef.current = title;
        onTitleChange?.(title);
      }
    }, CMD_START_DELAY_MS);
  } else if (metaType === "CMD_END") {
    if (cmdStartTimerRef.current) {
      clearTimeout(cmdStartTimerRef.current);
      cmdStartTimerRef.current = null;
    }
    const title = shortenPath(payload);
    if (title !== lastTitleRef.current) {
      lastTitleRef.current = title;
      onTitleChange?.(title);
    }
  }
  return true; // 已消费，不渲染
});
```

`extractCommandName()` 与 `shortenPath()` 负责将原始 payload 转为适合标签展示的短标题，逻辑参考 iTerm2。

### 3.6. 状态管理

* `dynamicTitle`：由 OSC 回调更新的**瞬时**标题，用于 Tab 展示。刷新后由后端初始标题注入（§3.4）恢复。
* `title` / `tmuxWindowName`：**持久化**的窗口名，用于 reconnection 与 backend 同步。
* 保存布局到后端时**不包含** `dynamicTitle`，避免污染持久化数据。

## 4. 部署与配置

1. **脚本来源**：垫片脚本在编译时通过 `include_str!()` 嵌入 Rust 二进制，启动时由 `shims::ensure_installed()` 写入 `~/.atmos/shims/`。
2. **目录结构**：
   ```
   ~/.atmos/shims/
   ├── atmos_shim.bash
   ├── atmos_shim.fish
   └── zdotdir/
       ├── .zshenv
       └── .zshrc
   ```
3. **权限**：由应用创建，无需额外 `chmod`（脚本通过 `source` 加载，不需可执行位）。
4. **失败降级**：若 shims 安装失败或 Shell 不支持，仅禁用动态标题，Shell 正常启动。

## 5. 总结

本方案通过**会话级临时 Shell 注入** + **OSC 9999 协议** + **前端 xterm.js 原生拦截**，在不修改用户本地配置、不增加后端解析负担的前提下，实现 Web 终端动态标题功能。

v3.0 解决了三个生产环境中的关键问题：
1. **Tmux 穿透**：通过 DCS passthrough + `allow-passthrough on` 使 OSC 序列能穿过 tmux 终端模拟器层。
2. **刷新恢复**：后端在 WebSocket 连接建立时主动查询 tmux pane 状态并注入合成 OSC，前端即时恢复标题。
3. **防抖去重**：150ms CMD_START 防抖 + 标题值去重，消除快速命令的标题闪烁。
