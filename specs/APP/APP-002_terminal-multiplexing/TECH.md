# ATMOS 终端持久化与多窗口管理方案 (Terminal Multiplexing System)

## 1. 背景
ATMOS 旨在提供一个具备状态持久化的 Web 终端体验。为了实现这一目标，后端采用了 **Tmux** 作为核心驱动引擎。然而，在支持前端多窗口（分屏、多 Tab）显示同一 Workspace 的场景下，简单的 Tmux 会话管理会导致严重的“同步干扰”问题。

## 2. 核心挑战：“量子纠缠”冲突
在 Tmux 的原生设计中，一个 **Session** 维护一个单一的“当前活跃窗口”状态。
- **问题描述**：如果两个前端面板（Pane）同时连接到同一个 Tmux Session，当面板 A 将视图切换到 Window 1 时，后端的 Session 状态会改变，导致面板 B 的视图也被强制跳转到 Window 1。
- **结果**：多窗口之间无法独立操作，输入输出完全同步，用户无法在分屏中同时查看不同的窗口。

## 3. 解决方案：Session Grouping (会话分组)
为了解决上述冲突，ATMOS 实现了基于 **Tmux Session Grouping** 的多级管理方案。

### 3.1 架构设计
- **Master Session (主会话)**：
  - **命名规范**：`atmos_{project}_{workspace}` (例如 `atmos_kepano-obsidian_exeggutor`)。
  - **角色**：作为该 Workspace 的“持久化中心”和“窗口资源池”。它不直接挂载任何用户连接，保持后台运行以保证进程不中断。
- **Client Session (客户端会话)**：
  - **命名规范**：`atmos_client_{sessionId}` (由前端生成的唯一 UUID)。
  - **角色**：为每个前端面板单独创建的临时会话，通过 `-t master` 参数归并到 Master Session 组。
  - **特性**：共享 Master Session 的所有窗口，但拥有 **各自独立** 的“当前活跃窗口”视图。

### 3.2 运行流程
1. **初始化**：用户进入 Workspace，后端确保 Master Session 存在。
2. **连接**：前端每个面板发起物理 WebSocket 连接，并携带自身的 `sessionId` 和目标 `window_name`。
3. **定位**：后端在物理 Tmux Server 中创建一个 Client Session 并加入组，随后执行 `select-window -t client_session:{window_idx}`，实现精准视角定位。
4. **清理**：WebSocket 断开时，后端立即销毁（kill）对应的 Client Session，而不影响 Master Session 及其中运行的进程。

## 4. 连接架构讨论：1:1 vs N:1

### 4.1 方案对比
| 特性 | 1:1 独立连接 (当前实现) | N:1 多路复用连接 (进阶方案) |
| :--- | :--- | :--- |
| **描述** | 每个终端面板独占一个 WebSocket | 所有终端及信令复用一个 WebSocket |
| **代表作** | WebShell, Jupyter | VS Code Remote, Gitpod |
| **开发难度** | 低 (逻辑解耦，生命周期独立) | 高 (需自定义多路复用协议层) |
| **隔离性** | 强 (单连接崩溃不影响全局) | 弱 (主连接抖动导致全盘断连) |
| **性能极限** | 并发连接受限 (10+ 连接时有握手开销) | 极高 (单连接，协议头开销极小) |

### 4.2 ATMOS 的选择与考量
ATMOS 目前采用 **1:1 独立连接** 方案：
- **理由 1**：利用 Tmux 本身作为“多路复用器”已经简化了大量后端逻辑。
- **理由 2**：在常规开发场景（<10个面板）下，握手延迟和连接开销可忽略不计，开发效率极高。
- **展望**：随着功能扩展（如集成文件系统实时流、LSP 信令），后续将引入 `Atmos Gateway` 协议栈，将所有信令整合为一条高效的加密多路复用链路。

## 5. 安全与稳健性逻辑
- **会话命名策略**：增加了防重复逻辑，避免生成冗余的项目名路径。统一强制 `atmos_` 前缀，便于系统级孤岛扫描与清理。
- **原子性锁定**：后端实现了一套基于 Workspace ID 的本地互斥锁，确保在并发连接请求（如 React 严格模式）时，不会重复创建 Master Session 或 Window。
- **自动清理**：实现了 Client Session 的自动回收机制，保证物理主机的资源不会因用户意外离线而被无限期占用。

---
*Created: 2026-01-28*
