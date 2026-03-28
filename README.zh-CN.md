<h1 align="center"> ATMOS </h1>

<h2 align="center">Atmosphere for Agentic Builders</h2>

<p align="center">简体中文 | <a href="./README.md">English</a></p>

<p align="center">
  <a href="https://github.com/AruNi-01/atmos/actions/workflows/release-desktop.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/AruNi-01/atmos/release-desktop.yml?branch=main&label=desktop%20release" alt="Desktop release workflow" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/releases/latest">
    <img src="https://img.shields.io/github/v/release/AruNi-01/atmos?display_name=tag&label=version" alt="Latest version" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/stargazers">
    <img src="https://img.shields.io/github/stars/AruNi-01/atmos?label=stars" alt="GitHub stars" />
  </a>
  <a href="https://github.com/AruNi-01/atmos/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/AruNi-01/atmos?label=license" alt="License" />
  </a>
</p>

![Atmos 截图](./apps/landing/src/assets/img/atmos_preview.png)

## 功能亮点

- AI Agent 工作区，支持流式对话、工具调用状态和自定义 Agent。
- 基于 `tmux` 的持久化终端，会话在刷新或重启后依然可以续接。
- 把 Git 与 GitHub 流程放在同一界面里，覆盖提交、Review 和 PR。
- 提供 Project Wiki、全局搜索和快捷操作，减少上下文切换。
- 桌面端支持多平台，底层由 Rust、Next.js 和 Tauri 驱动。

## 开始使用

当前最新桌面版： [查看最新 Release](https://github.com/AruNi-01/atmos/releases/latest)。

### 下载

| 平台 | 包格式 | 下载链接 |
| --- | --- | --- |
| macOS（Apple Silicon） | `.dmg` | [最新 Release](https://github.com/AruNi-01/atmos/releases/latest) |
| macOS（Intel） | `.dmg` | [最新 Release](https://github.com/AruNi-01/atmos/releases/latest) |
| Windows（x64） | `.exe` / `.msi` | [最新 Release](https://github.com/AruNi-01/atmos/releases/latest) |
| Linux | `.AppImage` / `.deb` / `.rpm` | [最新 Release](https://github.com/AruNi-01/atmos/releases/latest) |
| 全部版本 | GitHub Releases | [查看 Releases](https://github.com/AruNi-01/atmos/releases) |

### Homebrew 安装

```bash
brew install --cask AruNi-01/tap/atmos
```

### 如何开始使用

1. 先按你的系统下载安装 Atmos。
2. 打开桌面端，创建或打开一个工作区。
3. 连接项目后，就可以在同一界面里使用终端、Agent 和 GitHub 工作流。

### 从源码运行

```bash
bun install
cargo fetch
just dev-api
just dev-web
# 可选
just dev-desktop
```

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
