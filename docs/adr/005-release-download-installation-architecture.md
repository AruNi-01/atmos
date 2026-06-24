# ADR-005: 发布、下载与安装架构

**状态**: ✅ 已采纳  
**日期**: 2026-06-23  
**决策者**: Aaryn, Codex  
**相关文档**: [Atmos Release Guide](../release.md)

## 背景 (Context)

Atmos 现在有三类可分发产物:

1. standalone CLI: `atmos`
2. Local Web Runtime: 本地 API、静态 Web 产物、system skills
3. Desktop: Tauri shell、本地 API sidecar、静态 Web 产物、system skills

旧设计把 CLI 同时放进 Local Runtime 和 Desktop bundle。这个耦合带来几个问题:

- CLI、Local Runtime、Desktop 的版本节奏不同,内嵌 CLI 容易落后。
- 用户通过不同入口安装后,机器上可能出现多个 `atmos` binary,排障时不清楚真正执行的是哪个。
- `atmos update` 曾经直接请求 GitHub Releases API,容易触发 GitHub rate limit。
- Local Runtime 或 Desktop 只是为了拿到一个 CLI,不应该重新发布整包。
- 安装脚本不能依赖用户机器上一定有 Python 或 `jq`。

本 ADR 记录发布、下载、安装的边界,让后续 release workflow、安装脚本和运行时自愈都按同一个模型演进。

## 决策 (Decision)

Atmos 采用 **三条独立发布线 + 一个 canonical CLI 安装路径 + R2 自定义域名优先下载** 的架构。

核心规则:

- CLI 是唯一 standalone 命令,统一安装到 `~/.atmos/bin/atmos`。
- Local Runtime 和 Desktop 不再内嵌 CLI。
- Local Runtime archive 只包含 `bin/api`、`web/`、`system-skills/`、`version.txt`、`manifest.json`。
- Desktop bundle 只包含 Tauri app、API sidecar、Web 静态资源、system skills,不包含 `runtime/current/bin/atmos` 或 `binaries/atmos-cli`。
- GitHub Releases 是 release 记录和 artifact 生成源; Cloudflare R2 custom domain `https://install.atmos.land` 是客户端默认下载源。
- GitHub 只作为 fallback 或 release workflow 的数据源,不作为普通 CLI 更新检查的主路径。
- 稳定 release 才会刷新 R2 的 `latest` 路径和 CLI `latest.json`; prerelease 不进入稳定更新通道。

## 发布线 (Release Lines)

| 发布线 | Tag | 版本源 | 主要 workflow | 产物 | 是否包含 CLI |
| --- | --- | --- | --- | --- | --- |
| CLI | `cli-v<version>` | `apps/cli/Cargo.toml` | `.github/workflows/release-cli.yml` | `atmos-cli-<target>.tar.gz` | 是,这是唯一 CLI 发布线 |
| Local Runtime | `local-web-runtime-v<version>` | `resources/local-runtime/version.json` | `.github/workflows/release-local-runtime.yml` | `atmos-local-runtime-<target>.tar.gz` | 否 |
| Desktop | `desktop-v<version>` | `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json` | `.github/workflows/release-desktop.yml` | Tauri installers, updater metadata | 否 |

稳定 tag-push release 必须来自已进入 `origin/main` 的 commit。分支验证和真实资产测试使用 workflow dispatch + prerelease tag,例如 `cli-v0.2.0-rc.1`。

## 下载源与路径 (Download Sources)

客户端默认使用:

```text
https://install.atmos.land
```

R2 路径约定:

```text
/install-local-web-runtime.sh
/install-desktop.sh

/cli/<tag>/atmos-cli-<target>.tar.gz
/cli/<tag>/latest.json
/cli/latest/atmos-cli-<target>.tar.gz
/cli/latest.json

/local-web-runtime/<tag>/atmos-local-runtime-<target>.tar.gz
/local-web-runtime/latest/atmos-local-runtime-<target>.tar.gz

/desktop/<tag>/<desktop-asset>.app.tar.gz
/desktop/latest/<desktop-asset>.app.tar.gz
```

`.github/workflows/sync-r2.yml` 负责在 GitHub Release 发布后同步:

- 安装脚本到 R2 根路径。
- CLI assets 和 `cli/latest.json`。
- Local Runtime assets 到版本路径和最新稳定路径。
- Desktop `.app.tar.gz` assets 到版本路径和最新稳定路径。

CLI `latest.json` 是更新检查和自动安装 CLI 的主索引。它包含 stable CLI release 的 `version`、`tag`、`release_url` 和各平台 asset URL。

## 安装流 (Installation Flows)

### 1. 直接使用 CLI

`atmos update` 和 API/安装器的 CLI 安装逻辑都以 `https://install.atmos.land/cli/latest.json` 为主路径。找到当前平台 asset 后下载并覆盖 canonical path:

```text
~/.atmos/bin/atmos
```

如果 R2 manifest 不可用,CLI update path 可以 fallback 到 GitHub Releases API、releases Atom feed、tags Atom feed。fallback 只用于恢复能力,不是正常流量入口。

### 2. Local Web Runtime

Shell 安装入口:

```bash
curl -fsSL https://install.atmos.land/install-local-web-runtime.sh | bash
```

安装脚本负责:

1. 下载 Local Runtime archive。
2. 解压到 `~/.atmos/runtime/current` 或 `--install-dir <path>/runtime/current`。
3. 从 CLI manifest 安装或保留 `~/.atmos/bin/atmos`。
4. 把 `~/.atmos/bin` 写入 shell PATH 提示。
5. 用 canonical CLI 启动 runtime: `~/.atmos/bin/atmos runtime ensure`。

`--install-dir` 只改变 runtime 安装位置,不改变 CLI canonical path。Local Runtime archive 本身不包含 CLI。

不再发布 npm 包装器。Local Runtime 的公开安装入口是 shell installer,它安装 runtime archive,并使用 CLI manifest 安装或保留 `~/.atmos/bin/atmos`。用户传入 `--archive` 时只跳过 runtime 下载,不跳过 CLI canonical path 检查。

### 3. Desktop

Shell 安装入口:

```bash
curl -fsSL https://install.atmos.land/install-desktop.sh | bash
```

macOS shell installer 默认:

1. 从 R2 `desktop/latest` 或指定 `desktop/<tag>` 下载 `.app.tar.gz`。
2. 解压并安装到 `/Applications/Atmos.app`。
3. 从 CLI manifest 安装或保留 `~/.atmos/bin/atmos`。

用户可以传 `--no-cli` 只安装 Desktop app。Desktop 自身不携带 CLI,启动的本地 API 会在后台尽力补齐 canonical CLI。

Tauri updater 仍使用 Desktop release 的 updater metadata。它更新 Desktop app,不负责 CLI 更新。

## 运行时自愈 (Runtime Self-Healing)

Desktop 和 Local Runtime 最终都会启动同一个 API binary。API 启动时执行两个非阻断任务:

1. 创建 `~/.atmos/bin`,把它加入当前进程 PATH,并尽力写入 shell config。
2. 读取 CLI `latest.json`,如果 `~/.atmos/bin/atmos` 缺失或落后,下载最新 stable CLI。

这两个任务失败只记录 warning,不阻断 API 启动。这样 Desktop 和 Local Runtime 可以运行,CLI 也会在网络可用时自动恢复到 canonical path。

## 版本检查与流量边界

CLI 普通命令不会每次都请求 GitHub。

当前规则:

- `atmos update` 显式执行时会检查最新 CLI 并安装。
- `atmos update --check` 只检查,不安装。
- 普通 CLI 命令结束后可以显示更新提示,但使用 `~/.atmos/cli/update-check.json` 做 24 小时缓存。
- 缓存过期时只给更新检查 2 秒预算,主路径是 R2 `cli/latest.json`。
- 设置 `ATMOS_NO_UPDATE_CHECK=1` 可以关闭普通命令后的自动提示。
- API 启动时会做一次 canonical CLI 自愈检查,主路径同样是 R2 `cli/latest.json`。

R2 流量主要来自:

- 安装器下载脚本、runtime、desktop、CLI archive。
- CLI 24 小时缓存过期后的 manifest 读取。
- API 启动时的 CLI manifest 读取。

不会发生“每条 CLI 命令都下载 release 列表或 artifact”的行为。

## 考虑的方案 (Alternatives Considered)

### 方案 1: Desktop 和 Local Runtime 继续内嵌 CLI

**描述**: 每个 runtime bundle 都携带一个 `bin/atmos`,Desktop 也携带 `binaries/atmos-cli`。

**优点**:
- 离线启动路径更简单。
- 单个包里东西齐全,安装器不需要额外下载 CLI。

**缺点**:
- CLI 版本会被 Desktop/Runtime release 锁死。
- CLI-only 修复需要重新发 Desktop 或 Runtime 才能覆盖对应用户。
- 用户机器上容易出现多个 `atmos`,PATH 和排障复杂。
- Desktop、Local Runtime、CLI 三条发布线被无意义耦合。

**评估**: 不选择。当前阶段没有用户迁移成本,应直接收敛到单一 CLI path。

---

### 方案 2: 所有更新检查直接使用 GitHub Releases API

**描述**: CLI、安装器、API 启动都直接访问 GitHub Releases API 来解析最新版本。

**优点**:
- 不需要维护 R2 manifest。
- GitHub release 数据完整。

**缺点**:
- 容易触发未认证 GitHub API rate limit。
- 国内或企业网络下 GitHub 可达性不稳定。
- 更新检查和下载流量不可控。

**评估**: 不选择。GitHub 作为 fallback 可以接受,但普通客户端路径必须优先走 R2 custom domain。

---

### 方案 3: 三条发布线解耦,CLI 统一 canonical path,R2 优先下载 (最终选择)

**描述**: CLI 独立发布和更新,Local Runtime/Desktop 只发布自己的 runtime/app 产物;安装器和 API 启动通过 R2 CLI manifest 补齐 canonical CLI。

**优点**:
- CLI 可以独立快速修复。
- Desktop 和 Local Runtime 不会携带过期 CLI。
- 用户机器上只有一个官方 CLI path。
- R2 custom domain 承担主要下载和更新检查流量。
- GitHub API rate limit 不影响主路径。

**缺点**:
- 首次安装 Desktop/Runtime 时可能需要额外下载 CLI。
- R2 sync workflow 和 manifest 正确性变成发布链路的一部分。
- API 启动时会多一次非阻断 CLI manifest 检查。

**评估**: ✅ 选择。它把版本责任拆清楚,长期维护成本最低。

## 后果 (Consequences)

### 正面影响

- CLI-only 改动只需要发布 `cli-v*`。
- Local Runtime 和 Desktop 的包体不再重复携带 CLI。
- `atmos update` 默认不再依赖 GitHub API。
- 用户排障时只需要检查 `which atmos` 是否指向 `~/.atmos/bin/atmos`。
- 安装脚本本地运行不依赖 Python 或 `jq`。

### 负面影响

- R2 上的 `cli/latest.json` 必须保持正确,否则 CLI 自动安装会降级到 fallback 或失败。
- Desktop 初装脚本现在多了 CLI 下载步骤。
- 如果用户离线安装 Desktop 且没有已有 CLI,CLI 功能要等网络恢复后由 API 启动自愈补齐。

### 风险和缓解措施

| 风险 | 严重程度 | 概率 | 缓解措施 |
| --- | --- | --- | --- |
| R2 sync 没有刷新 `cli/latest.json` | 高 | 中 | release 后验证 `https://install.atmos.land/cli/latest.json`; `atmos update --check` 作为 smoke test |
| R2 最新路径缺少某个平台 asset | 高 | 中 | `sync-r2.yml` 从 GitHub Release assets 生成 manifest; 安装器校验平台 asset |
| 用户 PATH 仍指向旧 `atmos` | 中 | 中 | 安装器和 API 启动都把 `~/.atmos/bin` 加入 PATH; 文档要求检查 `which atmos` |
| GitHub fallback 被 rate limited | 低 | 中 | fallback 只在 R2 主路径失败时使用; 主路径不依赖 GitHub |
| Desktop updater 与 CLI update 语义混淆 | 中 | 中 | 明确 Desktop updater 只更新 app; CLI 由 `atmos update`、安装器、API 自愈管理 |

## 实施状态

已按本 ADR 调整的实现边界:

- `scripts/local-runtime/build-runtime.mjs`: runtime archive 不再包含 CLI。
- `scripts/desktop/layout-runtime-bundle.mjs`: Desktop runtime bundle 不再包含 CLI。
- `scripts/desktop/prepare-sidecar.sh`: 只构建 API sidecar。
- `crates/runtime-manager/src/supervisor.rs`: runtime layout 不再需要 CLI path,启动 API 时不传 `ATMOS_CLI_BIN`。
- `crates/infra/src/utils/atmos_cli.rs`: canonical CLI path 固定为 `~/.atmos/bin/atmos`。
- `apps/api/src/api/system/cli.rs`: API 启动和 Settings CLI install 共用 R2-first CLI release 解析。
- `install-local-web-runtime.sh`: 安装 runtime 后从 CLI manifest 安装或保留 canonical CLI。
- `install-desktop.sh`: Desktop 安装后从 CLI manifest 安装或保留 canonical CLI。
- `.github/workflows/sync-r2.yml`: 同步 release assets、install scripts 和 CLI manifest 到 R2。

## 后续工作

1. 将 Desktop updater metadata 也同步到 R2,并评估是否把 Tauri updater endpoint 切到 `install.atmos.land`。
2. 给 API 启动时的 CLI 自愈增加本地缓存,减少频繁重启时的 manifest 读取。
3. 为 Local Runtime 增加类似 CLI 的 stable `latest.json`,让 shell installer 解析 `latest` 时也完全避开 GitHub API。
4. 为 `sync-r2.yml` 增加 release 后端到端 smoke check,验证 public R2 URL 可访问。

## 相关文件

| 文件 | 用途 |
| --- | --- |
| `.github/workflows/release-cli.yml` | 构建并发布 standalone CLI |
| `.github/workflows/release-local-runtime.yml` | 构建 Local Runtime archive |
| `.github/workflows/release-desktop.yml` | 构建 Desktop app 和 updater artifacts |
| `.github/workflows/sync-r2.yml` | 同步 GitHub Release assets 到 Cloudflare R2 |
| `apps/cli/src/commands/update.rs` | CLI update/check 和 24 小时缓存 |
| `apps/api/src/api/system/cli.rs` | API 内的 CLI 检查、安装和启动自愈 |
| `crates/infra/src/utils/atmos_cli.rs` | canonical CLI path 和 PATH setup |
| `crates/runtime-manager/src/supervisor.rs` | Local Runtime 启停,不再持有 CLI binary path |
| `install-local-web-runtime.sh` | shell Local Runtime installer |
| `install-desktop.sh` | shell Desktop installer |
| `docs/release.md` | 操作型 release guide |
