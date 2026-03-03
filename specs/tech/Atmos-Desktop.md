# Atmos 桌面端（Tauri 2.0）设计文档

**版本**: 2.0  
**日期**: 2026-03-02  
**受众**: 有 Web 前端 + Rust 后端经验，桌面端零基础的开发者

---

## 目录

1. [Tauri 2.0 是什么？写给 Web 开发者的心智模型](#1-tauri-20-是什么写给-web-开发者的心智模型)
2. [核心架构设计与决策](#2-核心架构设计与决策)
3. [项目结构规划](#3-项目结构规划)
4. [开发环境搭建](#4-开发环境搭建)
5. [前端适配方案（Next.js → Tauri）](#5-前端适配方案nextjs--tauri)
6. [后端集成方案（Sidecar 模式）](#6-后端集成方案sidecar-模式)
7. [原生能力增强](#7-原生能力增强)
8. [Tauri 权限系统入门](#8-tauri-权限系统入门)
9. [开发调试工作流](#9-开发调试工作流)
10. [跨平台构建与 CI/CD](#10-跨平台构建与-cicd)
11. [macOS 发布与签名详解](#11-macos-发布与签名详解)
12. [自动更新机制](#12-自动更新机制)
13. [关键注意事项与常见陷阱](#13-关键注意事项与常见陷阱)
14. [实施路线图](#14-实施路线图)

---

## 1. Tauri 2.0 是什么？写给 Web 开发者的心智模型

如果你熟悉 Electron，Tauri 的定位与之类似，但实现方式截然不同。最简单的理解方式是：

> **Tauri = 系统原生 WebView + Rust 原生外壳**

与 Electron 将整个 Chromium 浏览器打包进去不同，Tauri 使用操作系统自带的 WebView 引擎（macOS 上是 WKWebView，Windows 上是 WebView2，Linux 上是 WebKitGTK）。这使得 Tauri 应用的体积通常只有 **5-20MB**，而 Electron 应用动辄 **100MB+**。

**对你而言，最重要的认知转变有三点**：

第一，你的前端代码（React、HTML、CSS、JS）依然在 WebView 中运行，和在浏览器里几乎没有区别。你不需要学习任何新的 UI 框架。

第二，Tauri 的"后端"（`src-tauri/`）是用 Rust 编写的，负责与操作系统交互。但对于 `atmos` 这样已经有成熟 Rust 后端的项目，这部分的工作量非常小——主要是配置和生命周期管理。

第三，前端与 Tauri 后端之间通过 **IPC（进程间通信）** 交互，而不是 HTTP。这是一种更安全、更高效的通信方式，但你只需要在需要调用原生 API 时才用到它。

下表对比了你熟悉的 Web 开发与 Tauri 桌面开发的概念映射：

| Web 开发概念 | Tauri 桌面端对应概念 |
| :--- | :--- |
| 浏览器 | Tauri WebView（系统原生） |
| 前端 JS/React 代码 | 同样的 JS/React 代码，运行在 WebView 中 |
| 后端 HTTP API | Tauri Commands（通过 `invoke()` 调用的 Rust 函数） |
| `fetch()` 调用后端 | `invoke()` 调用 Tauri Commands |
| 服务器进程 | Tauri Core 进程（Rust） |
| 浏览器标签页 | Tauri 窗口（Window） |
| `localStorage` | Tauri 的 `store` 插件或原生文件系统 |

---

## 2. 核心架构设计与决策

### 2.1 两种集成路径的抉择

对于 `atmos` 项目，有两种主流的 Tauri 集成路径：

**路径 A：纯 Tauri Commands 模式**

将 `apps/api` 中的所有业务逻辑重写为 Tauri Commands（Rust 函数），前端通过 `invoke()` 直接调用。这种方式最"纯粹"，但需要大量重写工作，且会将后端逻辑深度绑定到 Tauri。

**路径 B：Sidecar（边车）模式**（**本项目推荐**）

将 `apps/api` 编译为一个独立的可执行文件，由 Tauri 在应用启动时在后台自动启动它。前端依然通过 HTTP 和 WebSocket 与这个本地服务通信，就像 Web 版本一样。Tauri 只负责管理这个进程的生命周期。

**为什么选择 Sidecar 模式？**

`atmos` 的后端 (`apps/api`) 已经相当成熟，包含了 PTY 终端管理、tmux 集成、Git 操作、WebSocket 服务等复杂功能。将这些全部重写为 Tauri Commands 既费时，又会引入不必要的风险。Sidecar 模式让我们以最小的代价完成桌面端的集成。

| 对比维度 | Sidecar 模式（推荐） | 纯 Commands 模式 |
| :--- | :--- | :--- |
| **代码改动量** | 极小，后端几乎不变 | 大，需重写后端逻辑 |
| **通信方式** | HTTP + WebSocket（熟悉） | IPC `invoke()`（需学习） |
| **进程数量** | 2 个（Tauri + API） | 1 个（Tauri） |
| **内存开销** | 略高（多一个进程） | 更低 |
| **适用场景** | 已有复杂后端服务 | 新项目或简单后端 |
| **与 Web 版本共享代码** | 完全共享 | 需要分叉维护 |

### 2.2 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Tauri 桌面应用进程                             │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Tauri Core (Rust)                         │    │
│  │                                                               │    │
│  │  ┌──────────────────────┐    ┌──────────────────────────┐   │    │
│  │  │  WebView (前端)       │    │  Native Commands (Rust)  │   │    │
│  │  │                      │    │                          │   │    │
│  │  │  React + Next.js     │◄──►│  get_api_config()        │   │    │
│  │  │  (apps/web 静态导出)  │    │  open_in_editor()        │   │    │
│  │  │                      │    │  show_notification()     │   │    │
│  │  └──────────┬───────────┘    └──────────────────────────┘   │    │
│  │             │ HTTP / WebSocket (含 Bearer Token 鉴权)         │    │
│  │             │ localhost:PORT                                 │    │
│  └─────────────┼───────────────────────────────────────────────┘    │
│                │                                                      │
└────────────────┼─────────────────────────────────────────────────────┘
                 │ 进程间通信（本地网络，Token 鉴权）
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                    API Sidecar 进程 (apps/api)                      │
│                                                                      │
│   Axum HTTP Server  │  WebSocket Manager  │  PTY + tmux             │
│   Git Operations    │  SQLite (SeaORM)    │  File System            │
│                                                                      │
│   环境变量: ATMOS_LOCAL_TOKEN=<随机UUID>                             │
│             ATMOS_PORT=<动态端口>                                    │
│             ATMOS_DATA_DIR=<用户数据目录>                            │
└────────────────────────────────────────────────────────────────────┘
```

**启动流程**：

1. 用户双击 `Atmos.app` / `Atmos.exe`
2. Tauri Core 进程启动，若已有实例在运行，则聚焦已有窗口并退出（单实例锁）
3. Tauri Core 显示 Splash Screen（原生加载界面）
4. Tauri Core 生成随机 Token，绑定随机端口，通过环境变量启动 API Sidecar 进程
5. Tauri Core 等待 API Sidecar 就绪（轮询健康检查端点，30 秒超时）
6. 就绪后关闭 Splash Screen，显示主窗口
7. 前端通过 Tauri Command 获取 API 端口和 Token，用于后续所有 HTTP/WebSocket 请求

---

## 3. 项目结构规划

`atmos` 已经是一个 Monorepo，`apps/desktop` 目录已经存在。我们将在这里建立 Tauri 项目。

```
atmos/
├── apps/
│   ├── api/                     # ✅ Sidecar 后端，需小幅改动（CORS、Token 鉴权、端口参数）
│   ├── web/                     # ⚠️  需要适配 static export
│   └── desktop/                 # 🆕 Tauri 桌面应用主目录
│       ├── src-tauri/           # Tauri 核心（Rust）
│       │   ├── src/
│       │   │   ├── main.rs      # 应用入口 + Sidecar 生命周期管理
│       │   │   ├── commands.rs  # 原生命令定义
│       │   │   └── state.rs     # 应用状态（sidecar 端口、Token、child 句柄）
│       │   ├── capabilities/
│       │   │   └── default.json # 权限配置（关键！）
│       │   ├── icons/           # 应用图标（各平台尺寸）
│       │   ├── Cargo.toml       # Rust 依赖
│       │   └── tauri.conf.json  # Tauri 主配置
│       └── package.json         # 前端构建脚本入口
├── packages/                    # ✅ 完全复用，无需改动
└── Cargo.toml                   # 需要将 desktop/src-tauri 加入 workspace
```

---

## 4. 开发环境搭建

### 4.1 必要依赖

| 工具 | 用途 | 安装方式 |
| :--- | :--- | :--- |
| Rust (stable) | 编译 Tauri Core 和 Sidecar | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js / Bun | 前端构建（项目已使用 Bun） | 项目已有 |
| Tauri CLI | 开发和构建命令 | `cargo install tauri-cli` 或 `bun add -D @tauri-apps/cli` |
| **macOS 额外依赖** | Xcode Command Line Tools | `xcode-select --install` |
| **Linux 额外依赖** | WebKit 等系统库 | `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` |

### 4.2 初始化 Tauri 项目

在 `apps/desktop` 目录下，通过以下方式初始化 Tauri 项目：

```bash
cd apps/desktop
cargo tauri init
```

初始化时，CLI 会询问几个问题：

- **App name**: `atmos`
- **Window title**: `Atmos`
- **Web assets location**: `../../web/out`（Next.js 静态导出目录）
- **Dev server URL**: `http://localhost:3000`（Next.js 开发服务器）
- **Frontend dev command**: `bun --filter web dev`
- **Frontend build command**: `BUILD_TARGET=desktop bun --filter web build`

### 4.3 将 desktop 加入 Cargo Workspace

修改根目录的 `Cargo.toml`，将 `apps/desktop/src-tauri` 加入 workspace：

```toml
[workspace]
members = [
    "apps/api",
    "apps/desktop/src-tauri",  # 新增
    "crates/*",
]
```

---

## 5. 前端适配方案（Next.js → Tauri）

### 5.1 核心约束：必须使用 Static Export

Tauri 的 WebView 不是一个 HTTP 服务器，它只能加载静态文件（HTML/CSS/JS）。因此，Next.js 必须以 `output: 'export'` 模式构建。

这意味着以下 Next.js 特性将**无法使用**：

- Server Components 中的 `headers()`, `cookies()` 等服务端 API
- API Routes（`/api/*`）
- Server Actions
- 基于中间件的 i18n 路由（`next-intl` 的默认路由模式）

### 5.2 解决 next-intl 兼容性问题

`atmos` 的 `apps/web` 使用了 `next-intl`，其默认配置依赖中间件进行语言路由（`/en/...`, `/zh/...`），这与 `output: 'export'` 不兼容。

**根本问题**：`app/[locale]/...` 路由结构在 `output: 'export'` 下会生成 `/en/` 和 `/zh/` 目录，但 Tauri 默认加载根路径 `/`，导致 404。

**推荐方案：重构路由结构（方案 A，最彻底）**

去掉 `[locale]` 前缀，改用客户端语言检测。适合桌面端独立路由维护：

```
app/
├── layout.tsx           # 移除 [locale] 层
├── page.tsx
└── (routes)/
    └── ...
```

在 `layout.tsx` 中通过 `navigator.language` 检测系统语言：

```typescript
// apps/web/src/providers/i18n-provider.tsx（桌面端专用）
'use client';
import { NextIntlClientProvider } from 'next-intl';
import { useState, useEffect } from 'react';

export function DesktopI18nProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState({});
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    const sysLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    setLocale(sysLang);
    import(`../../messages/${sysLang}.json`).then(m => setMessages(m.default));
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
```

**备选方案：环境变量条件构建（方案 B，改动量小）**

通过 `BUILD_TARGET=desktop` 区分构建模式，保留现有 `[locale]` 路由用于 Web 端，为桌面端条件性地禁用中间件。注意：`frontendDist` 建议始终指向完整 `out` 目录，不要指向 `out/en`，否则 `_next` 资源路径和多语言资源容易出现边界问题。

```javascript
// apps/web/next.config.ts
const isDesktop = process.env.BUILD_TARGET === 'desktop';

const nextConfig = {
  output: isDesktop ? 'export' : undefined,
  images: { unoptimized: isDesktop },
};

// 桌面构建时绕过 next-intl 中间件
export default isDesktop ? nextConfig : withNextIntl(nextConfig);
```

```json
// tauri.conf.json：始终使用完整导出目录
{
  "build": {
    "frontendDist": "../../web/out"
  }
}
```

桌面端默认语言入口建议在前端根路由处理（例如 `/` 重定向到 `/en`），而不是通过裁剪 `frontendDist` 目录来实现。

### 5.3 处理 API 请求的 URL 与 CORS

**CORS 配置（必须修改 `apps/api`）**

Tauri 桌面端 WebView 的 Origin 为：
- macOS / Linux：`tauri://localhost`
- Windows：`https://tauri.localhost`

`apps/api` 的 Axum CORS 配置必须明确允许这些 Origin，否则所有请求会被浏览器策略阻断：

```rust
// apps/api/src/main.rs（需要修改）
use tower_http::cors::{CorsLayer, AllowOrigin};

let cors = CorsLayer::new()
    .allow_origin(AllowOrigin::list([
        "http://localhost:3000".parse().unwrap(),          // Web 开发
        "tauri://localhost".parse().unwrap(),              // macOS/Linux 桌面
        "https://tauri.localhost".parse().unwrap(),        // Windows 桌面
    ]))
    .allow_methods(tower_http::cors::Any)
    .allow_headers(tower_http::cors::Any);
```

**API 地址动态获取**

前端通过 Tauri Command 获取 API 配置，避免硬编码端口：

```typescript
// apps/web/src/lib/api-config.ts
import { invoke } from '@tauri-apps/api/core';

let apiConfig: { port: number; token: string } | null = null;

export async function getApiConfig() {
  if (apiConfig) return apiConfig;

  // 检测是否运行在 Tauri 环境
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    // Web 环境：从环境变量读取
    return { port: parseInt(process.env.NEXT_PUBLIC_API_PORT || '7777'), token: '' };
  }

  apiConfig = await invoke<{ port: number; token: string }>('get_api_config');
  return apiConfig;
}

export async function buildApiUrl(path: string) {
  const { port } = await getApiConfig();
  return `http://localhost:${port}${path}`;
}

export async function buildWsUrl(path: string) {
  const { port, token } = await getApiConfig();
  const url = new URL(`ws://localhost:${port}${path}`);
  // 浏览器 WebSocket 无法像 fetch 一样稳定注入 Authorization header，
  // 桌面端推荐在 querystring 传递一次性 token，并在握手时校验。
  if (token) url.searchParams.set('token', token);
  return url.toString();
}
```

**鉴权策略（必须覆盖 HTTP + WebSocket）**

- HTTP：统一在请求头携带 `Authorization: Bearer <token>`
- WebSocket：握手 URL 携带 `?token=<token>`，后端在 upgrade 前校验
- Token 生命周期：由 Tauri 启动时随机生成，常驻内存，不落盘，应用退出即失效

> 说明：CORS 只能限制浏览器跨域请求，不能防御本机其他进程直接访问 `localhost`。因此本地 Sidecar 仍必须做鉴权。

**WebSocket 重连机制**

Sidecar 可能因异常重启，前端需要实现自动重连以恢复 WebSocket 连接：

```typescript
// apps/web/src/lib/ws-client.ts
export function createReconnectingWs(url: string, options = {
  maxRetries: 10,
  baseDelay: 1000,
  maxDelay: 30000,
}) {
  let ws: WebSocket | null = null;
  let retries = 0;
  let destroyed = false;

  function connect() {
    if (destroyed) return;
    ws = new WebSocket(url);

    ws.onopen = () => { retries = 0; };

    ws.onclose = () => {
      if (destroyed || retries >= options.maxRetries) return;
      const delay = Math.min(options.baseDelay * 2 ** retries, options.maxDelay);
      retries++;
      setTimeout(connect, delay);
    };
  }

  connect();
  return {
    get ws() { return ws; },
    destroy() { destroyed = true; ws?.close(); },
  };
}
```

---

## 6. 后端集成方案（Sidecar 模式）

### 6.1 应用状态定义

`AppState` 需要持有所有运行时状态，包括 Sidecar 子进程句柄、端口和 Token。由于端口改为由 Sidecar 启动后动态分配，应用初始化阶段端口可能尚未就绪：

```rust
// apps/desktop/src-tauri/src/state.rs
use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;

pub struct AppState {
    pub api_port: Mutex<Option<u16>>,
    pub api_token: String,
    /// 持有 Sidecar 子进程句柄，防止被 drop 导致进程被终止
    pub sidecar_child: Mutex<Option<CommandChild>>,
}
```

### 6.2 配置 Sidecar

在 `apps/desktop/src-tauri/tauri.conf.json` 中声明 Sidecar：

```json
{
  "bundle": {
    "externalBin": [
      "binaries/api"
    ]
  }
}
```

Tauri 要求 Sidecar 二进制文件的命名包含目标平台的 triple 后缀。例如，在 macOS Apple Silicon 上，文件名应为 `api-aarch64-apple-darwin`。

**构建脚本**（在 CI/CD 或本地构建时执行）：

```bash
# 1. 编译 API 后端
cargo build --release --bin api

# 2. 将编译产物复制到 Tauri 的 binaries 目录，并添加平台后缀
# 本地构建用 host triple；CI 构建优先使用 matrix.target
TARGET_TRIPLE=$(rustc -vV | rg '^host:' | awk '{print $2}')
mkdir -p apps/desktop/src-tauri/binaries
cp target/release/api apps/desktop/src-tauri/binaries/api-${TARGET_TRIPLE}
```

### 6.3 管理 Sidecar 生命周期

这是 `apps/desktop/src-tauri/src/main.rs` 的核心逻辑，需要处理以下几个关键问题。

**关键实现（推荐）**：

```rust
// apps/desktop/src-tauri/src/main.rs（关键片段）
mod commands;
mod state;

use state::AppState;
use std::sync::Mutex;
use std::time::Duration;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let api_token = uuid::Uuid::new_v4().to_string();

            app.manage(AppState {
                api_port: Mutex::new(None),
                api_token: api_token.clone(),
                sidecar_child: Mutex::new(None),
            });

            tauri::async_runtime::spawn(async move {
                // 关键点：让 sidecar 自己 bind 127.0.0.1:0，避免端口抢占竞态
                let result = handle
                    .shell()
                    .sidecar("api")
                    .expect("failed to create sidecar command")
                    .env("ATMOS_PORT", "0")
                    .env("ATMOS_LOCAL_TOKEN", &api_token)
                    .env("ATMOS_DATA_DIR", get_data_dir())
                    .spawn();

                let (mut rx, child) = match result {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("Failed to spawn sidecar: {e}");
                        show_error_and_exit(&handle, "Atmos 启动失败，API 进程无法启动。");
                        return;
                    }
                };

                *handle.state::<AppState>().sidecar_child.lock().unwrap() = Some(child);

                // 等待 sidecar 通过 stdout 回传真实端口：
                // 约定输出格式：ATMOS_READY port=53127
                let mut resolved_port: Option<u16> = None;
                let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let text = String::from_utf8_lossy(&line);
                            if let Some(port) = parse_ready_port(&text) {
                                resolved_port = Some(port);
                                break;
                            }
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => {}
                    }
                    if tokio::time::Instant::now() > deadline {
                        break;
                    }
                }

                let Some(port) = resolved_port else {
                    show_error_and_exit(&handle, "Atmos 启动超时，未收到 API 就绪信号。");
                    return;
                };
                *handle.state::<AppState>().api_port.lock().unwrap() = Some(port);

                // 二次确认健康检查（建议提供 /healthz）
                let health_url = format!("http://127.0.0.1:{port}/healthz");
                if !wait_for_api(&health_url, Duration::from_secs(10)).await {
                    show_error_and_exit(&handle, "Atmos 启动失败，API 健康检查未通过。");
                    return;
                }

                // 关闭 Splash Screen，显示主窗口
                if let Some(splash) = handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_api_config,
            commands::open_in_external_editor,
            commands::send_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn parse_ready_port(line: &str) -> Option<u16> {
    let prefix = "ATMOS_READY port=";
    line.trim().strip_prefix(prefix)?.parse::<u16>().ok()
}
```

> 注：崩溃重启逻辑可复用同一启动流程，重启时同样使用 `ATMOS_PORT=0`，并重新等待 `ATMOS_READY` 信号。

**API 侧改动**（`apps/api/src/main.rs`，需要支持环境变量参数）：

```rust
// apps/api/src/main.rs（新增环境变量读取）
use std::env;

#[tokio::main]
async fn main() {
    // 允许 ATMOS_PORT=0，让系统自动分配可用端口
    let requested_port: u16 = env::var("ATMOS_PORT")
        .unwrap_or_else(|_| "0".to_string())
        .parse()
        .expect("Invalid ATMOS_PORT");

    let api_token = env::var("ATMOS_LOCAL_TOKEN").ok();

    let data_dir = env::var("ATMOS_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| dirs::data_dir().unwrap().join("atmos"));

    std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
    let db_path = data_dir.join("atmos.db");

    // 绑定监听（0 表示随机端口）
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", requested_port))
        .await
        .expect("Failed to bind API listener");
    let actual_port = listener.local_addr().unwrap().port();

    // 将就绪端口回传给 Tauri Core
    println!("ATMOS_READY port={actual_port}");

    // 鉴权要求：
    // 1) HTTP: 校验 Authorization: Bearer <token>
    // 2) WebSocket: 在握手 URL 中读取 ?token=... 并校验
    // 建议额外提供 GET /healthz 端点用于就绪检测
}
```

**优雅关闭**（监听窗口关闭事件，给 Sidecar 发送终止信号）：

```rust
// 在 .setup() 中注册窗口事件
app.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { .. } = event {
        let state = window.state::<AppState>();
        let mut child_guard = state.sidecar_child.lock().unwrap();
        if let Some(child) = child_guard.take() {
            // 发送 SIGTERM，让 API 优雅清理 PTY 资源
            let _ = child.kill();
        }
    }
});
```

### 6.4 权限配置

Tauri 2.0 引入了严格的权限系统。执行 Sidecar 和使用各插件需要在 `capabilities/default.json` 中明确授权：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for Atmos desktop",
  "windows": ["main", "splashscreen"],
  "permissions": [
    "core:default",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-close",
    "core:window:allow-set-focus",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/api",
          "sidecar": true
        }
      ]
    },
    "notification:allow-notify",
    "opener:allow-open-url"
  ]
}
```

---

## 7. 原生能力增强

### 7.1 Tauri Commands 定义

```rust
// apps/desktop/src-tauri/src/commands.rs
use crate::state::AppState;

/// 前端通过此 Command 获取 API 连接配置（端口 + Token）
#[tauri::command]
pub fn get_api_config(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let port = state
        .api_port
        .lock()
        .map_err(|_| "state lock poisoned")?
        .ok_or_else(|| "API not ready".to_string())?;

    Ok(serde_json::json!({
        "port": port,
        "token": state.api_token,
    }))
}

/// 一键在外部编辑器打开项目路径
#[tauri::command]
pub async fn open_in_external_editor(editor: String, path: String) -> Result<(), String> {
    let cmd = match editor.as_str() {
        "vscode"  => "code",
        "cursor"  => "cursor",
        "zed"     => "zed",
        "idea"    => "idea",
        "vim"     => "vim",
        _         => return Err(format!("Unknown editor: {}", editor)),
    };

    // 使用 tokio::process::Command 避免阻塞异步运行时
    tokio::process::Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open editor '{}': {}", cmd, e))?;

    Ok(())
}

/// 发送系统通知（正确注入 AppHandle）
#[tauri::command]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}
```

### 7.2 系统托盘（System Tray）

`atmos` 作为一个常驻工具，非常适合添加系统托盘支持，让用户可以在不关闭应用的情况下将其最小化到托盘：

```rust
// 在 main.rs 的 .setup() 中添加
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItem};

let quit_item = MenuItem::with_id(app, "quit", "退出 Atmos", true, None::<&str>)?;
let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
let menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "quit" => app.exit(0),
        "show" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        // 点击托盘图标时显示/隐藏主窗口
        if let TrayIconEvent::Click { .. } = event {
            let app = tray.app_handle();
            if let Some(w) = app.get_webview_window("main") {
                if w.is_visible().unwrap_or(false) {
                    let _ = w.hide();
                } else {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
    })
    .build(app)?;
```

### 7.3 Splash Screen（启动加载界面）

启动过程中，Sidecar 初始化需要 2-5 秒，必须给用户视觉反馈。在 `tauri.conf.json` 中配置两个窗口：

```json
{
  "windows": [
    {
      "label": "splashscreen",
      "url": "/splashscreen.html",
      "width": 400,
      "height": 300,
      "center": true,
      "resizable": false,
      "decorations": false,
      "alwaysOnTop": true,
      "visible": true
    },
    {
      "label": "main",
      "url": "/",
      "width": 1400,
      "height": 900,
      "minWidth": 900,
      "minHeight": 600,
      "visible": false
    }
  ]
}
```

`splashscreen.html` 放在 `apps/web/public/splashscreen.html`，是一个纯 HTML 文件（不依赖 Next.js），显示 Logo 和加载动画。

### 7.4 自定义无边框窗口

`atmos` 强调沉浸式体验，对于 macOS 推荐使用原生 overlay 标题栏模式（保留系统红绿灯按钮）：

```json
{
  "windows": [{
    "label": "main",
    "title": "Atmos",
    "width": 1400,
    "height": 900,
    "minWidth": 900,
    "minHeight": 600,
    "titleBarStyle": "overlay",
    "hiddenTitle": true
  }]
}
```

`titleBarStyle: "overlay"` 的优势：
- 保留 macOS 原生的红绿灯关闭/最小化/最大化按钮
- 前端内容可延伸到标题栏区域
- 拖拽行为与系统其他应用一致

在前端通过 CSS 为标题栏区域预留空间：

```css
/* 为 macOS 原生按钮预留空间（约 80px） */
.titlebar {
  -webkit-app-region: drag;
  padding-left: 80px;
  height: 40px;
  display: flex;
  align-items: center;
}

/* 可点击元素必须排除拖拽区域 */
.titlebar button, .titlebar input {
  -webkit-app-region: no-drag;
}
```

对于 Windows 和 Linux，使用 `decorations: false` + 完全自定义标题栏：

```typescript
// 前端通过 Tauri API 检测平台
import { platform } from '@tauri-apps/plugin-os';

const isMac = await platform() === 'macos';
// 根据平台渲染不同的标题栏组件
```

---

## 8. Tauri 权限系统入门

Tauri 2.0 引入了一套细粒度的权限控制系统，这是与 Tauri 1.0 最大的架构变化之一。对于新手来说，这是最容易踩坑的地方。

### 8.1 核心概念

**Permissions（权限）**：定义某个具体操作是否被允许，例如 `fs:allow-read-file`（允许读取文件）。

**Capabilities（能力集）**：将多个权限组合在一起，并绑定到特定的窗口。每个窗口只能使用其 Capability 中声明的权限。

**实际含义**：如果你在前端调用了某个 Tauri API（如读取文件），但没有在 `capabilities/default.json` 中声明对应的权限，调用会直接报错。这是一种安全设计，防止恶意代码滥用系统权限。

### 8.2 常用权限速查

| 需要的功能 | 需要添加的权限 |
| :--- | :--- |
| 执行 Sidecar | `shell:allow-execute` (with sidecar config) |
| 读取文件 | `fs:allow-read-file` |
| 写入文件 | `fs:allow-write-file` |
| 打开文件对话框 | `dialog:allow-open` |
| 发送系统通知 | `notification:allow-notify` |
| 访问剪贴板 | `clipboard-manager:allow-read-text`, `clipboard-manager:allow-write-text` |
| 打开外部 URL | `opener:allow-open-url` |
| 窗口显示/隐藏 | `core:window:allow-show`, `core:window:allow-hide` |
| 检测操作系统 | `os:allow-platform` |

### 8.3 调试权限问题

当遇到权限错误时，错误信息通常是 `Command xxx not allowed`。解决步骤：

1. 确认调用的插件/命令名称
2. 在 Tauri 插件文档中找到对应的权限标识符
3. 将其添加到 `capabilities/default.json` 的 `permissions` 数组中

---

## 9. 开发调试工作流

### 9.1 日常开发流程

推荐在根目录 `Justfile` 中封装一个统一命令，一键启动开发环境：

```makefile
# Justfile（根目录）
dev-desktop:
    #!/usr/bin/env bash
    set -e
    echo "Starting API server..."
    # 后台启动 API，使用固定端口便于开发
    ATMOS_PORT=7777 ATMOS_LOCAL_TOKEN=dev-token cargo run --bin api &
    API_PID=$!
    echo "API started (PID: $API_PID)"
    
    # 等待 API 就绪
    until curl -sf http://localhost:7777/health > /dev/null; do sleep 0.5; done
    echo "API is ready"
    
    # 启动 Tauri 开发模式（包含 Next.js 热重载）
    cd apps/desktop && cargo tauri dev
    
    # Tauri 退出后，清理 API 进程
    kill $API_PID 2>/dev/null || true
```

```bash
# 一条命令启动全部
just dev-desktop
```

在 `apps/web` 的开发构建中，通过环境变量注入开发用的 API 配置：

```typescript
// 开发模式：直接使用固定端口，跳过 Tauri invoke
const isTauriDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
```

### 9.2 调试技巧

**调试前端**：在 Tauri 开发模式下，右键点击窗口可以打开 DevTools（与浏览器开发者工具相同）。

**调试 Tauri Core（Rust）**：在 `src-tauri/src/main.rs` 中使用 `eprintln!()`，输出会显示在启动 `cargo tauri dev` 的终端中。

**调试 Sidecar**：Sidecar 的 stdout/stderr 通过 `CommandEvent::Stdout/Stderr` 捕获，打印到 Tauri Core 的控制台（见 6.3 节中的 `match event` 代码）。

**模拟 Sidecar 崩溃**：可以手动 `kill` API 进程来测试崩溃恢复逻辑。

### 9.3 构建测试版本

```bash
# 1. 先编译 Sidecar 并放置到正确位置
TARGET_TRIPLE=$(rustc -vV | rg '^host:' | awk '{print $2}')
cargo build --release --bin api
mkdir -p apps/desktop/src-tauri/binaries
cp target/release/api apps/desktop/src-tauri/binaries/api-${TARGET_TRIPLE}

# 2. 构建 release 版本（会生成安装包）
cd apps/desktop && cargo tauri build
```

---

## 10. 跨平台构建与 CI/CD

### 10.1 为什么需要 CI/CD？

Tauri 应用**必须在目标平台上编译**。你无法在 macOS 上编译出 Windows 的 `.exe`，也无法在 Linux 上编译出 macOS 的 `.app`。因此，跨平台发布必须依赖 CI/CD 服务（如 GitHub Actions）在不同操作系统的虚拟机上分别构建。

### 10.2 GitHub Actions 配置

以下是一个完整的 GitHub Actions 工作流，注意 macOS 的两个架构需要在**对应架构的 Runner** 上编译，而不是交叉编译：

```yaml
# .github/workflows/release-desktop.yml
name: Release Desktop App

on:
  push:
    tags:
      - 'desktop-v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          # Apple Silicon (ARM64) - 必须在 ARM Runner 上原生编译
          - platform: 'macos-14'
            target: 'aarch64-apple-darwin'
            args: '--target aarch64-apple-darwin'
          # Intel Mac - 在标准 Runner 上编译
          - platform: 'macos-13'
            target: 'x86_64-apple-darwin'
            args: '--target x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            target: 'x86_64-unknown-linux-gnu'
            args: ''
          - platform: 'windows-latest'
            target: 'x86_64-pc-windows-msvc'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: '. -> target'
          # 分平台缓存，避免缓存污染
          key: ${{ matrix.target }}

      - name: Install frontend dependencies
        run: bun install

      # 先编译 API Sidecar（针对目标平台原生编译）
      - name: Build API Sidecar
        run: cargo build --release --bin api --target ${{ matrix.target }}

      - name: Prepare Sidecar binary
        shell: bash
        run: |
          EXT=""
          if [ "${{ matrix.platform }}" = "windows-latest" ]; then EXT=".exe"; fi
          mkdir -p apps/desktop/src-tauri/binaries
          cp target/${{ matrix.target }}/release/api${EXT} \
             apps/desktop/src-tauri/binaries/api-${{ matrix.target }}${EXT}

      - name: Build and Release Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS 签名（配置后取消注释）
          # APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          # APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          # APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
        with:
          projectPath: apps/desktop
          tagName: desktop-v__VERSION__
          releaseName: 'Atmos Desktop v__VERSION__'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

**Runner 选择说明**：

| 目标平台 | 使用的 Runner | 说明 |
| :--- | :--- | :--- |
| `aarch64-apple-darwin` | `macos-14` | GitHub 的 M1 Runner，原生 ARM 编译 |
| `x86_64-apple-darwin` | `macos-13` | Intel Runner，原生 x86_64 编译 |
| Linux | `ubuntu-22.04` | 标准 x86_64 |
| Windows | `windows-latest` | 标准 x86_64 |

---

## 11. macOS 发布与签名详解

### 11.1 为什么 macOS 需要签名？

苹果的 Gatekeeper 机制会阻止运行未经签名的应用。具体表现为：用户下载你的应用后，双击会弹出"无法打开，因为无法验证开发者"的错误。

### 11.2 三种发布方案对比

| 方案 | 成本 | 用户体验 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **无签名** | 免费 | 最差：Apple Silicon Mac 上**无法运行** | 不推荐 |
| **Ad-hoc 签名** | 免费 | 较差：弹出"无法验证开发者"警告，右键可绕过 | 内测、早期用户 |
| **Developer ID 签名 + 公证** | $99/年 | 最佳：双击直接打开，无任何警告 | 正式公开发布 |

> **注意**：无任何签名的应用在 Apple Silicon Mac 上完全无法运行（SIP 机制）；Ad-hoc 签名（使用 `-` 伪身份）可以在 Apple Silicon 上运行，但仍会触发 Gatekeeper 警告。

### 11.3 使用 Ad-hoc 签名（无需开发者账号）

在 `tauri.conf.json` 中配置：

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "-"
    }
  }
}
```

**用户侧的绕过方法**：右键点击应用 → 选择"打开" → 在弹出的对话框中点击"打开"。这个操作只需要做一次。

或者引导用户通过终端命令移除隔离属性：

```bash
xattr -cr /Applications/Atmos.app
```

### 11.4 升级到正式签名（有开发者账号时）

在 CI/CD 中添加以下环境变量即可启用完整签名和公证：

- `APPLE_CERTIFICATE`：导出的 `.p12` 证书的 Base64 编码
- `APPLE_CERTIFICATE_PASSWORD`：证书密码
- `APPLE_SIGNING_IDENTITY`：签名身份（如 `Developer ID Application: Your Name (XXXXXXXXXX)`）
- `APPLE_ID`：你的 Apple ID 邮箱
- `APPLE_PASSWORD`：App-Specific Password（在 appleid.apple.com 生成）

---

## 12. 自动更新机制

Tauri 内置了 `tauri-plugin-updater`，支持自动检查和安装更新。

### 12.1 基本配置

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY",
      "endpoints": [
        "https://github.com/your-org/atmos/releases/latest/download/latest.json"
      ]
    }
  }
}
```

`pubkey` 通过 `cargo tauri signer generate` 生成密钥对：私钥存入 CI/CD Secrets（`TAURI_SIGNING_PRIVATE_KEY`），公钥写入配置文件。

### 12.2 前端更新 UI

```typescript
// apps/web/src/hooks/use-updater.ts（Tauri 环境专用）
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkAndUpdate() {
  const update = await check();
  if (!update) return;

  // 通知用户有新版本
  const confirmed = await confirm(
    `发现新版本 ${update.version}，是否立即更新？\n\n${update.body}`
  );
  if (!confirmed) return;

  // 下载并安装
  await update.downloadAndInstall();
  await relaunch();
}
```

### 12.3 更新流程

1. 开发者推送新版本 tag，触发 GitHub Actions
2. GitHub Actions 构建各平台安装包，生成签名后的 `latest.json`
3. 将 `latest.json` 上传到 GitHub Release
4. 用户启动 `atmos` 时，应用自动检查 `latest.json`，发现新版本后弹出更新提示
5. 用户确认后，应用自动下载（验证签名）、安装并重启

---

## 13. 关键注意事项与常见陷阱

### 13.1 安全相关

**陷阱零：本地 API 不要裸奔（必须鉴权）**

Sidecar API 监听在 `localhost:PORT`，机器上**任何本地进程都能访问**。对于持有 PTY 控制权的 API，这是严重的安全隐患。

**解决方案**：必须实现 Token 鉴权（见第 6.3 节）。

- HTTP 请求：在中间件层验证 `Authorization: Bearer <token>`
- WebSocket 握手：在 upgrade 前验证 `?token=<token>`
- Token 由 Tauri 启动时随机生成，退出即失效（不落盘）

**陷阱一：CORS Origin 必须包含 Tauri 的 Origin**

Tauri WebView 的 Origin 是 `tauri://localhost`（macOS/Linux）或 `https://tauri.localhost`（Windows），API 的 CORS 配置必须明确允许这些 Origin（见第 5.3 节）。

> 但要注意：CORS 不是本地安全边界。它只能限制浏览器页面，不能阻止本机其他进程直接访问 `localhost`。

### 13.2 Sidecar 相关

**陷阱二：必须持久化 Sidecar child 句柄**

`CommandChild` 若被 drop，子进程会立即被终止。必须将其存储在 `AppState` 中（见第 6.3 节）。

**陷阱三：Sidecar 二进制文件命名规则**

Tauri 要求 Sidecar 文件名必须包含目标平台的 triple 后缀（如 `api-aarch64-apple-darwin`）。本地可用 `rustc -vV` 读取 host triple；CI 中优先使用 `matrix.target` 作为唯一来源，避免平台判断误差。

**陷阱四：Sidecar 在 macOS 上需要单独签名**

当使用 Developer ID 签名时，Sidecar 二进制文件也需要被签名。`tauri-action` 会自动处理，手动构建时需注意。

**陷阱五：Sidecar 的工作目录**

Sidecar 启动时的工作目录不是应用目录，而是系统临时目录。数据库路径等必须使用绝对路径（通过 `ATMOS_DATA_DIR` 环境变量传入，见第 6.3 节）。

### 13.3 前端相关

**陷阱六：`window.location` 的差异**

在 Tauri 中，`window.location.href` 的值是 `tauri://localhost/...` 而不是 `http://...`。如果你的代码中有基于 URL 的逻辑判断（如区分开发和生产环境），需要注意这个差异。检测 Tauri 环境的正确方法：

```typescript
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
```

**陷阱七：WebSocket 连接必须使用绝对地址**

Web 版本的 WebSocket 连接可能使用相对路径（如 `/ws`），在 Tauri 中必须改为绝对路径（如 `ws://localhost:7777/ws`）。使用第 5.3 节中的 `buildWsUrl()` 工具函数统一处理。

**陷阱八：`next-intl` 的 `[locale]` 路由**

见第 5.2 节的详细解决方案。

### 13.4 平台差异

**陷阱九：Linux 上的 WebKit 版本差异**

不同 Linux 发行版自带的 WebKitGTK 版本不同，可能导致某些 CSS 特性或 JavaScript API 表现异常。建议在 CI/CD 中使用 Ubuntu 22.04 进行测试，并在文档中说明最低系统要求。

**陷阱十：Windows 上的路径分隔符**

Rust 在 Windows 上使用 `\` 作为路径分隔符，而 JavaScript 通常使用 `/`。处理文件路径时，Rust 侧使用 `std::path::Path`，前端侧使用 Tauri 的 `path` 模块。

**陷阱十一：macOS 交叉编译 ARM/Intel 不能混用 Runner**

必须在 `macos-14`（M1 Runner）上编译 `aarch64-apple-darwin`，在 `macos-13`（Intel Runner）上编译 `x86_64-apple-darwin`。不能在 ARM Runner 上交叉编译 x86_64（见第 10.2 节）。

---

## 14. 实施路线图

| 阶段 | 主要任务 | 预计工作量 | 里程碑 | 风险项 |
| :--- | :--- | :--- | :--- | :--- |
| **阶段零：适配盘点（新增）** | 统计 `apps/web` 中所有 `localhost:8080`、`[locale]` 路由、WS 连接构造点；确定最小改造面与回滚策略 | 0.5-1 天 | 输出改造清单与准确排期 | 盘点不完整会导致后续返工 |
| **阶段一：脚手架搭建** | 初始化 Tauri 项目结构；实现单实例锁；配置 Sidecar（含 Token 鉴权）；实现启动/关闭/崩溃恢复流程；接入 Splash Screen | 2-4 天 | 能够启动应用并看到前端 UI | Sidecar 生命周期细节较多 |
| **阶段二：前端适配** | 解决 `next-intl` 兼容性；处理 CORS；实现 API URL/Token 动态配置；修复 `output: 'export'` 导致的问题；添加 WS 重连 | 5-10 天 | 前端功能与 Web 版本基本一致 | `[locale]` 路由结构若深度耦合，重构周期可能拉长至 2 周 |
| **阶段三：原生能力集成** | 实现一键打开外部编辑器；添加系统托盘；适配 macOS overlay 标题栏；集成系统通知 | 2-3 天 | 桌面端体验优于 Web 版本 | 无 |
| **阶段四：CI/CD 配置** | 配置 GitHub Actions 多平台构建（使用正确的 Runner）；设置 Ad-hoc 签名；测试安装包；配置自动更新签名密钥 | 1-2 天 | 能够自动化构建并发布安装包 | macOS Runner 类型选择容易出错 |
| **阶段五：自动更新** | 集成 `tauri-plugin-updater`；实现前端更新提示 UI；配置更新端点；端到端测试更新流程 | 1-2 天 | 应用能够自动检测并安装更新 | 无 |

---

## 参考文献

[1] Tauri Documentation. (2026). *Embedding External Binaries*. https://v2.tauri.app/develop/sidecar/

[2] Tauri Documentation. (2024). *Next.js Frontend Configuration*. https://v2.tauri.app/start/frontend/nextjs/

[3] GitHub Discussion. (2024). *Next-Intl + Tauri (or Electron, or generally `{ output: 'export' }`)*. https://github.com/amannn/next-intl/discussions/1637

[4] Tauri Documentation. (2025). *GitHub Actions Pipeline*. https://v2.tauri.app/distribute/pipelines/github/

[5] Tauri Documentation. (2026). *macOS Code Signing*. https://v2.tauri.app/distribute/sign/macos/
