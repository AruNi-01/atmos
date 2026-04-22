# Atmos LSP 内置支持技术方案

## 一、整体定位

Atmos 作为 LSP Host，负责：

1. **安装管理**：首次使用按语言自动安装到 `~/.atmos/lsp`。
2. **进程管理**：按 workspace + language 维度维护 LSP 子进程生命周期。
3. **协议代理**：前端不直接连 LSP server，统一通过 Atmos WebSocket 网关转发 JSON-RPC。

## 二、数据目录

```text
~/.atmos/
└── lsp/
    ├── registry.json
    ├── rust-analyzer/
    ├── pyright/
    ├── typescript-language-server/
    ├── clangd/
    └── gopls/
```

> 与用户项目环境隔离；npm/pip 安装都写到 Atmos 数据目录，不污染全局。

## 三、模块划分

### 3.1 Registry

- 内置语言映射（扩展名、安装方式、版本、启动参数、初始化参数）。
- 版本锁定随 Atmos 发布更新，不做运行时自动升级。

### 3.2 Installer

- GitHub Release：按固定 tag 下载对应平台 asset。
- npm/pip：使用局部安装目录（`--prefix` / `--target`）。
- sourcekit-lsp：系统探测。
- 安装完成写入 `~/.atmos/lsp/registry.json`。

### 3.3 ProcessManager

- 维度：`workspace_root + lsp_id`。
- 状态：`Installing | Starting | Running | Error | Unavailable`。
- 支持重启动作（`restart_for_file`）。
- 关闭 Atmos 时统一 kill 子进程。

### 3.4 Transport

- 使用 JSON-RPC over stdio。
- 解析/发送 `Content-Length` 帧。
- 启动后发送 initialize 请求（包含 initializationOptions）。

### 3.5 Gateway

- 前端通过 WebSocket action:
  - `lsp_activate_for_file`
  - `lsp_status_for_file`
  - `lsp_restart_for_file`
- 后端返回 server/status/version/install_path/error 等状态信息。

## 四、生命周期

1. 打开文件（如 `src/main.rs`）。
2. 前端发 `lsp_activate_for_file`。
3. 后端查 registry：
   - 未安装：Installing（黄色）
   - 已安装启动中：Starting（黄色）
   - 运行中：Running（绿色）
   - 失败：Error（黄色）
4. 前端状态徽标显示 `· <server>`，并可展开查看细节与重启。

## 五、一期语言覆盖

- Rust: rust-analyzer
- Python: pyright
- TypeScript / JavaScript: typescript-language-server
- Go: gopls
- C/C++: clangd
- Java: jdtls
- Kotlin: kotlin-language-server
- Swift: sourcekit-lsp
- YAML: yaml-language-server
- TOML: taplo

## 六、功能范围（一期）

一期优先实现：

- `textDocument/completion`
- `textDocument/publishDiagnostics`
- `textDocument/hover`
- `textDocument/definition`

当前仓库已完成：安装、启动、状态显示、重启入口与初始化握手；LSP 方法级代理（completion/hover/definition/diagnostics 的完整前后端转发）在下一迭代接入。

## 七、UI 规范

- 状态徽标：`[ · rust-analyzer ] [⚙]`
- 颜色：
  - Installing/Starting/Error: 黄
  - Running: 绿
  - Unsupported: 不显示
- 点击徽标显示：版本、安装路径、最近错误、重启按钮。

## 八、风险与应对

- GitHub 下载失败：后续支持镜像源与手工落盘。
- npm/pip 依赖缺失：返回 Error 与可读提示。
- 版本兼容性：固定版本，避免自动升级破坏体验。
- 多 workspace 资源占用：按 workspace 维度复用与管控。

## 九、后续扩展

- 用户自定义 LSP 配置
- 远程 registry / 插件市场
- DAP 复用进程管理与传输层
