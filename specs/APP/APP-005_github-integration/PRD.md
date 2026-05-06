# PRD: ATMOS × GitHub Integration（via gh CLI）

> **面向 AI Agent 的实现规格文档**
> 本文档描述 ATMOS 与 GitHub 的集成功能，所有实现均通过 `gh` CLI 完成，不直接调用 GitHub REST API，不引入额外云服务，不做本地持久化存储。

---

## 背景与目标

ATMOS 是一个本地优先的可视化终端工作空间，核心用户是 Agentic Builder。用户在 ATMOS 中通过 git worktree 管理多个 Workspace，每个 Workspace 对应一个开发分支。**用户也可以直接在 Project 层（main 分支）下工作，不创建 Workspace。**

**本次集成解决两个痛点：**

1. 用户在 ATMOS 内创建 PR 后，需要跳出到浏览器查看 PR 状态、处理 merge/conflict，上下文割裂。
2. 用户无法在当前工作视图中直接感知 CI（GitHub Actions）运行状态，需要切换到浏览器确认。

**设计原则：**

- 所有 GitHub 操作通过 `gh` CLI 执行，继承用户已有的 `gh auth` 认证，零配置。
- 前后端通信复用现有 WebSocket 连接，新增 `github_*` 系列 `WsAction`，不引入 HTTP 接口。
- **不做任何本地持久化**，PR 与分支的对应关系由 GitHub 维护，ATMOS 按需通过 WS 查询。
- GitHub 集成 UI 以**分支**为锚点，Project 主视图和 Workspace 视图使用完全相同的逻辑，通过 `(owner, repo, branch)` 三元组查询，不区分来源。
- 功能以**轻量嵌入**为主，只展示与当前工作分支直接相关的信息。

---

## 核心数据模型

GitHub 集成不引入任何新的数据库表。所有数据的唯一索引是：

```
(owner, repo, branch)
```

- `owner` / `repo`：从当前 Project 的 git remote URL 解析，解析逻辑见后端规格。
- `branch`：当前活跃视图的分支名。
  - Project 视图 → 取 Project 当前 checkout 的分支。
  - Workspace 视图 → 取该 Workspace 绑定的 worktree 分支。

**一条分支可以对应多个 PR**（历史上先后开过多个），`gh pr list --head {branch}` 返回全部，ATMOS 全部展示。

`owner` 和 `repo` 统一从 Project 层解析 git remote URL 获得，作为运行时属性（不持久化），Workspace 继承所属 Project 的仓库信息。

---

## 功能范围

### Feature 1：分支关联 PR 展示与操作

#### 1.1 功能描述

在 Project 视图和 Workspace 视图中，展示当前分支关联的所有 GitHub PR，并支持常用操作。

#### 1.2 PR 列表获取

**gh 命令：**

```bash
gh pr list \
  --repo {owner}/{repo} \
  --head {branch} \
  --state all \
  --limit 10 \
  --json number,title,state,mergeable,reviewDecision,baseRefName,createdAt,url
```

- `--state all`：同时返回 open、closed、merged 的 PR，展示完整历史。
- 返回列表按 `createdAt` 降序排列，最新的排在最前。

#### 1.3 PR 列表展示

**展示逻辑：**

- 有 open 状态的 PR → 优先展开显示 open PR，其余 closed/merged 折叠在"历史 PR"下。
- 无 open PR，有历史 PR → 展示历史列表，标注状态。
- 无任何 PR → 显示"Create PR"入口。

**每条 PR 展示字段：**

| 字段 | 说明 |
|------|------|
| PR 标题 | 可点击，打开浏览器跳转 GitHub PR 页 |
| PR 状态 | `open` / `merged` / `closed`，用色块区分 |
| 是否可合并 | 仅 open 状态显示：`mergeable` / `conflicting` / `unknown` |
| Review 状态 | 仅 open 状态显示：`approved` / `changes_requested` / `review_required` |
| 基础分支 | base branch 名称 |
| 创建时间 | 相对时间，如"3 hours ago" |

#### 1.4 PR 详情获取

点击某条 PR 展开详情时，懒加载调用：

```bash
gh pr view {pr_number} \
  --repo {owner}/{repo} \
  --json number,title,body,state,mergeable,reviewDecision,\
baseRefName,headRefName,createdAt,url,statusCheckRollup
```

#### 1.5 PR 操作

操作按钮显示在 open 状态的 PR 卡片内。

**Merge PR**

- 显示条件：`state == "open"` 且 `mergeable == "MERGEABLE"`
- 点击后展开 merge 策略选择（merge commit / squash / rebase），二次确认后发送 WS 请求。
- gh 命令：

```bash
gh pr merge {pr_number} --repo {owner}/{repo} --{strategy}
# strategy: merge | squash | rebase
```

- 执行成功后前端刷新 PR 列表。

**冲突提示**

- 显示条件：`state == "open"` 且 `mergeable == "CONFLICTING"`
- Merge 按钮置灰，展示提示文案："This PR has conflicts. Resolve them in the terminal."

**Close PR**

- 显示条件：`state == "open"`
- 二次确认后发送 WS 请求，执行：

```bash
gh pr close {pr_number} --repo {owner}/{repo}
```

**Open in Browser**

- 所有状态均显示，执行：

```bash
gh pr view {pr_number} --repo {owner}/{repo} --web
```

#### 1.6 创建 PR

**入口：** 当前分支无任何 open PR 时，在 PR 面板顶部显示"Create PR"按钮。

**表单字段：**

- Title（必填，默认取当前分支最后一条 commit message）
- Body（选填，多行文本）
- Base branch（下拉选择，默认取仓库 default branch）
- Draft（toggle，默认 off）

**gh 命令：**

```bash
gh pr create \
  --repo {owner}/{repo} \
  --title "{title}" \
  --body "{body}" \
  --base {base_branch} \
  --head {current_branch} \
  [--draft]
```

创建成功后重新发送 `github_pr_list` 请求刷新列表。

---

### Feature 2：CI 状态角标

#### 2.1 功能描述

在 Project / Workspace 列表项标题右侧展示当前分支最新 CI 运行状态的小角标。

#### 2.2 角标状态定义

| 角标样式 | 触发条件 | 颜色 |
|---------|---------|------|
| 旋转圆圈 | `status == "in_progress"` 或 `"queued"` | 黄色 |
| ✓ | `status == "completed"` 且 `conclusion == "success"` | 绿色 |
| ✕ | `status == "completed"` 且 `conclusion == "failure"` | 红色 |
| ー | `conclusion == "cancelled"` 或 `"skipped"` | 灰色 |
| 不显示 | 无 CI 记录 / 非 GitHub 仓库 | — |

#### 2.3 数据获取

```bash
gh run list \
  --repo {owner}/{repo} \
  --branch {branch} \
  --limit 1 \
  --json databaseId,workflowName,status,conclusion,createdAt,url
```

#### 2.4 刷新策略

- 进入 Project / Workspace 视图时触发一次 `github_ci_status` 请求。
- 状态为 `in_progress` 或 `queued` 时，前端每 30 秒重新发送请求，直到状态变为终态后停止。
- 终态下用户手动点击角标可触发刷新。

#### 2.5 角标交互

点击角标展开 Popover，显示 workflow 名称、运行时间、状态，以及"Open in Browser"链接。

---

## 技术实现规格

### 前端：新增 WsAction 类型

在 `use-websocket.ts` 的 `WsAction` 联合类型中新增以下 action：

```typescript
// GitHub 操作
| 'github_pr_list'      // 获取分支关联的所有 PR 列表
| 'github_pr_detail'    // 获取单个 PR 详情（懒加载）
| 'github_pr_create'    // 创建 PR
| 'github_pr_merge'     // 合并 PR
| 'github_pr_close'     // 关闭 PR
| 'github_pr_open_browser'  // 在浏览器中打开 PR
| 'github_ci_status'    // 获取最新 CI 运行状态
| 'github_ci_open_browser'  // 在浏览器中打开 CI run
```

### 前端：各 Action 的 data 结构

```typescript
// github_pr_list
{ owner: string; repo: string; branch: string }

// github_pr_detail
{ owner: string; repo: string; pr_number: number }

// github_pr_create
{
  owner: string; repo: string; branch: string
  title: string; body?: string; base_branch: string; draft?: boolean
}

// github_pr_merge
{ owner: string; repo: string; pr_number: number; strategy: 'merge' | 'squash' | 'rebase' }

// github_pr_close
{ owner: string; repo: string; pr_number: number }

// github_pr_open_browser
{ owner: string; repo: string; pr_number: number }

// github_ci_status
{ owner: string; repo: string; branch: string }

// github_ci_open_browser
{ owner: string; repo: string; run_id: number }
```

### 前端：新增 hooks

新增 `hooks/use-github.ts`，通过 `useWebSocketStore().send` 发送请求：

```typescript
import { useWebSocketStore } from './use-websocket'

interface GithubContext {
  owner: string
  repo: string
  branch: string
}

// PR 列表
export function useGithubPRList({ owner, repo, branch }: GithubContext) {
  const send = useWebSocketStore(s => s.send)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await send('github_pr_list', { owner, repo, branch })
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [owner, repo, branch])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, refresh: fetch }
}

// CI 状态（in_progress 时自动轮询）
export function useGithubCIStatus({ owner, repo, branch }: GithubContext) {
  const send = useWebSocketStore(s => s.send)
  const [data, setData] = useState(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const fetch = async () => {
      const result = await send('github_ci_status', { owner, repo, branch }) as any
      setData(result)
      // in_progress / queued 时继续轮询
      if (result?.status === 'in_progress' || result?.status === 'queued') {
        timer = setTimeout(fetch, 30_000)
      }
    }

    fetch()
    return () => { if (timer) clearTimeout(timer) }
  }, [owner, repo, branch])

  return data
}
```

### 后端：新增模块 `src/github/mod.rs`

所有 gh 调用走统一执行函数：

```rust
use tokio::process::Command;
use anyhow::{Result, anyhow};

pub async fn run_gh(args: &[&str]) -> Result<serde_json::Value> {
    let output = Command::new("gh")
        .args(args)
        .output()
        .await
        .map_err(|e| anyhow!("Failed to spawn gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("gh exited with error: {}", stderr));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| anyhow!("Failed to parse gh output: {}", e))
}
```

`gh` 的路径通过继承用户 shell 环境获取，复用 ATMOS 已有的 shell 配置继承机制。

### 后端：仓库信息解析

从 Project 路径获取 GitHub owner/repo：

```rust
// 执行：git -C {project_path} remote get-url origin
// 支持两种格式：
// https://github.com/owner/repo.git
// git@github.com:owner/repo.git
fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
    let re_https = Regex::new(r"github\.com/([^/]+)/([^/\s\.]+)").unwrap();
    let re_ssh   = Regex::new(r"github\.com:([^/]+)/([^\s\.]+)").unwrap();
    re_https.captures(remote_url)
        .or_else(|| re_ssh.captures(remote_url))
        .map(|c| (c[1].to_string(), c[2].to_string()))
}
```

非 GitHub 仓库返回 `None`，对应 action 返回错误码 `NOT_GITHUB_REPO`，前端收到后隐藏所有 GitHub UI。

### 后端：WS action 处理注册

在现有 WS message handler 的 action match 分支中新增：

```rust
"github_pr_list"         => github::handle_pr_list(data).await,
"github_pr_detail"       => github::handle_pr_detail(data).await,
"github_pr_create"       => github::handle_pr_create(data).await,
"github_pr_merge"        => github::handle_pr_merge(data).await,
"github_pr_close"        => github::handle_pr_close(data).await,
"github_pr_open_browser" => github::handle_pr_open_browser(data).await,
"github_ci_status"       => github::handle_ci_status(data).await,
"github_ci_open_browser" => github::handle_ci_open_browser(data).await,
```

### 后端：错误码定义

| 错误码 | 触发条件 | 前端处理 |
|--------|---------|---------|
| `GH_CLI_NOT_FOUND` | `gh` 未安装 | 展示安装引导 |
| `GH_NOT_AUTHENTICATED` | `gh` 未登录 | 展示 `gh auth login` 引导 |
| `NOT_GITHUB_REPO` | remote 非 GitHub | 隐藏所有 GitHub UI |
| `GH_COMMAND_FAILED` | gh 命令执行失败 | 展示错误信息（toast） |

错误通过现有 WS `error` 消息类型返回，复用 `toastManager` 自动展示，无需额外处理。

### 前端：新增组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `<PRPanel />` | `components/github/PRPanel.tsx` | PR 列表面板，含创建入口 |
| `<PRCard />` | `components/github/PRCard.tsx` | 单条 PR 展示，含操作按钮 |
| `<PRForm />` | `components/github/PRForm.tsx` | 创建 PR 的内联表单 |
| `<MergeDialog />` | `components/github/MergeDialog.tsx` | Merge 策略选择确认 |
| `<CIBadge />` | `components/github/CIBadge.tsx` | 列表项 CI 角标 |

### 前端：调用方式

两个视图使用完全相同的组件，只需传入不同的 context：

```tsx
// Project 视图
<PRPanel owner={project.githubOwner} repo={project.githubRepo} branch={project.currentBranch} />
<CIBadge owner={project.githubOwner} repo={project.githubRepo} branch={project.currentBranch} />

// Workspace 视图（完全相同的组件，只换入参）
<PRPanel owner={project.githubOwner} repo={project.githubRepo} branch={workspace.branch} />
<CIBadge owner={project.githubOwner} repo={project.githubRepo} branch={workspace.branch} />
```

---

## 不在本期范围内

- PR Review 评论的读取与回复
- Issue 列表展示
- GitHub Actions 完整日志查看（用户可在 ATMOS 终端执行 `gh run view --log`）
- GitHub App / Webhook 接入
- PR diff 在 ATMOS 中展示（ATMOS 已有 git diff）

---

## 验收标准

### Feature 1 - PR 列表与操作

- [ ] Project 视图和 Workspace 视图均能展示当前分支的 PR 列表，使用相同组件和逻辑。
- [ ] 同一分支有多个历史 PR 时，全部显示，open 状态排在最前，历史 PR 折叠展示。
- [ ] 无任何 PR 时，显示"Create PR"表单入口。
- [ ] 创建 PR 成功后，列表自动刷新，新 PR 出现在顶部。
- [ ] `mergeable == "MERGEABLE"` 时，Merge 按钮可用，选择策略确认后合并成功，列表刷新。
- [ ] `mergeable == "CONFLICTING"` 时，Merge 按钮置灰，显示冲突提示文案。
- [ ] Close PR 二次确认后，状态更新为 closed，列表刷新。
- [ ] 非 GitHub 仓库不展示任何 GitHub UI，不报错。
- [ ] `gh` 未安装时，toast 提示安装引导，不崩溃。
- [ ] `gh` 未登录时，toast 提示认证引导，不崩溃。

### Feature 2 - CI 角标

- [ ] Project 视图和 Workspace 视图的列表项均显示 CI 角标。
- [ ] 进入视图时自动加载，角标状态与 GitHub Actions 实际状态一致。
- [ ] `in_progress` / `queued` 状态下每 30 秒自动刷新，变为终态后停止轮询。
- [ ] 点击角标展开 Popover，展示 workflow 名称、时间、状态，"Open in Browser"可用。
- [ ] 无 CI 记录时角标不显示，不报错。
