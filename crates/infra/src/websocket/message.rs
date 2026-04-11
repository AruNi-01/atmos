use serde::{Deserialize, Serialize};
use serde_json::Value;

/// WebSocket 消息协议
/// 所有 WebSocket 通信都使用此枚举类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsMessage {
    // ===== 控制消息 =====
    /// 心跳 ping
    Ping,
    /// 心跳 pong
    Pong,

    // ===== 通用消息 =====
    /// 通用消息（保留向后兼容）
    Message(MessagePayload),
    /// 通用请求
    Request(WsRequest),
    /// 通用响应
    Response(WsResponse),
    /// 错误响应
    Error(WsErrorPayload),
    /// 服务端主动通知
    Notification(WsNotification),
}

/// 发送至客户端的主动通知 (Unsolicited notification)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsNotification {
    pub event: WsEvent,
    pub data: Value,
}

/// 通用消息体（向后兼容）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    pub id: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// 通用请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsRequest {
    /// 请求 ID（用于关联响应）
    pub request_id: String,
    /// 操作类型
    pub action: WsAction,
    /// 请求数据
    #[serde(default)]
    pub data: Value,
}

/// 通用响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsResponse {
    /// 关联的请求 ID
    pub request_id: String,
    /// 是否成功
    pub success: bool,
    /// 响应数据
    #[serde(default)]
    pub data: Value,
}

/// Serializable error payload sent to WebSocket clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsErrorPayload {
    pub request_id: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageOverviewRequest {
    #[serde(default)]
    pub refresh: bool,
    #[serde(default)]
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageProviderSwitchRequest {
    pub provider_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageAllProvidersSwitchRequest {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageProviderManualSetupRequest {
    pub provider_id: String,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageAddProviderApiKeyRequest {
    pub provider_id: String,
    #[serde(default)]
    pub region: Option<String>,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDeleteProviderApiKeyRequest {
    pub provider_id: String,
    pub key_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageAutoRefreshRequest {
    #[serde(default)]
    pub interval_minutes: Option<u64>,
}

/// 操作类型枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WsAction {
    // ===== 文件系统操作 =====
    /// 获取用户主目录
    FsGetHomeDir,
    /// 列出目录内容
    FsListDir,
    /// 搜索目录（按名称）
    FsSearchDirs,
    /// 验证 Git 仓库路径
    FsValidateGitPath,
    /// 读取文件内容
    FsReadFile,
    /// 写入文件内容
    FsWriteFile,
    /// 创建目录
    FsCreateDir,
    /// 重命名文件或目录
    FsRenamePath,
    /// 删除文件或目录
    FsDeletePath,
    /// 复制文件或目录
    FsDuplicatePath,
    /// 列出项目文件树
    FsListProjectFiles,
    /// 搜索文件内容（使用 ripgrep）
    FsSearchContent,

    // ===== 应用程序操作 =====
    /// 使用外部应用打开路径
    AppOpen,

    // ===== Git 操作 =====
    /// 获取 Git 状态（未提交/未推送的更改）
    GitGetStatus,
    /// 获取 HEAD 提交 hash
    GitGetHeadCommit,
    /// 获取 base..head 之间的提交数量
    GitGetCommitCount,
    /// 列出仓库的所有分支
    GitListBranches,
    /// 列出仓库的所有远程分支
    GitListRemoteBranches,
    /// 重命名 Git 分支
    GitRenameBranch,
    /// 获取变更文件列表
    GitChangedFiles,
    /// 获取单个文件的 diff
    GitFileDiff,
    /// 生成 git commit message
    GitGenerateCommitMessage,
    /// 提交更改
    GitCommit,
    /// 推送更改
    GitPush,
    /// 暂存文件
    GitStage,
    /// 取消暂存
    GitUnstage,
    /// 放弃工作区更改
    GitDiscardUnstaged,
    /// 放弃未追踪文件
    GitDiscardUntracked,
    /// 拉取变更
    GitPull,
    /// 获取远程更改
    GitFetch,
    /// 同步 (fetch + pull)
    GitSync,
    /// 获取当前分支的提交记录列表
    GitLog,

    // ===== Usage 操作 =====
    /// 获取 usage 概览
    UsageGetOverview,
    /// 更新单个 provider 的刷新开关
    UsageSetProviderSwitch,
    /// 更新全部 provider 的刷新开关
    UsageSetAllProvidersSwitch,
    /// 更新 provider 的手动配置
    UsageSetProviderManualSetup,
    /// 添加 provider API key
    UsageAddProviderApiKey,
    /// 删除 provider API key
    UsageDeleteProviderApiKey,
    /// 更新 ALL usage 的自动刷新周期
    UsageSetAutoRefresh,

    // ===== Project 操作 =====
    /// 获取所有项目
    ProjectList,
    /// 创建项目
    ProjectCreate,
    /// 更新项目
    ProjectUpdate,
    /// 更新项目目标分支（用于 merge/PR）
    ProjectUpdateTargetBranch,
    /// 更新项目排序
    ProjectUpdateOrder,
    /// 删除项目
    ProjectDelete,
    /// 验证项目路径
    ProjectValidatePath,

    // ===== Script 操作 =====
    /// 获取项目脚本配置
    ScriptGet,
    /// 保存项目脚本配置
    ScriptSave,

    // ===== Workspace 操作 =====
    /// 获取项目下的 Workspace 列表
    WorkspaceList,
    /// 创建 Workspace
    WorkspaceCreate,
    /// 更新 Workspace 名称
    WorkspaceUpdateName,
    /// 更新 Workspace 分支
    WorkspaceUpdateBranch,
    /// 更新 Workspace 流程状态
    WorkspaceUpdateWorkflowStatus,
    /// 更新 Workspace 优先级
    WorkspaceUpdatePriority,
    /// 获取可复用 Workspace 标签
    WorkspaceLabelList,
    /// 创建可复用 Workspace 标签
    WorkspaceLabelCreate,
    /// 更新可复用 Workspace 标签
    WorkspaceLabelUpdate,
    /// 更新 Workspace 标签关联
    WorkspaceUpdateLabels,
    /// 更新 Workspace 排序
    WorkspaceUpdateOrder,
    /// 记录 Workspace 最近访问时间
    WorkspaceMarkVisited,
    /// 删除 Workspace
    WorkspaceDelete,
    /// 置顶 Workspace
    WorkspacePin,
    /// 取消置顶 Workspace
    WorkspaceUnpin,
    /// 归档 Workspace
    WorkspaceArchive,
    /// 取消归档 Workspace
    WorkspaceUnarchive,
    /// 获取已归档的 Workspace 列表
    WorkspaceListArchived,
    /// 重试 Workspace 设置 (脚本执行)
    WorkspaceRetrySetup,
    /// 跳过失败的 setup script，直接完成 workspace 初始化
    WorkspaceSkipSetupScript,
    /// 确认 LLM 生成的 TODO 并继续 setup
    WorkspaceConfirmTodos,
    /// 检查项目是否可以删除（从归档模态）
    ProjectCheckCanDelete,

    // ===== Skills 操作 =====
    /// 获取已安装的 Skills 列表
    SkillsList,
    /// 获取单个 Skill 详情
    SkillsGet,
    /// Enable or disable a managed skill across all placements
    SkillsSetEnabled,
    /// Delete a managed skill across all placements
    SkillsDelete,
    /// 安装 Project Wiki skill 到 ~/.atmos/skills/.system/project-wiki
    WikiSkillInstall,
    /// 检查 system 目录是否有 project-wiki skill
    WikiSkillSystemStatus,
    /// 检查 system 目录是否有所有 code review skills
    CodeReviewSkillSystemStatus,
    /// 检查 system 目录是否有 git-commit skill
    GitCommitSkillSystemStatus,
    /// 按名称同步单个系统 skill
    SyncSingleSystemSkill,
    /// 手动触发同步所有系统 skills
    SkillsSystemSync,

    // ===== Agent 操作 =====
    /// 获取 Agent 管理状态
    AgentList,
    /// 安装指定 Agent
    AgentInstall,
    /// 获取 Agent 配置状态
    AgentConfigGet,
    /// 设置 Agent API Key
    AgentConfigSet,
    /// 列出 ACP Registry agents
    AgentRegistryList,
    /// 从 ACP Registry 安装 agent
    AgentRegistryInstall,
    /// 从 ACP Registry 卸载 agent
    AgentRegistryRemove,

    /// 列出自定义 ACP agents
    CustomAgentList,
    /// 添加自定义 ACP agent
    CustomAgentAdd,
    /// 删除自定义 ACP agent
    CustomAgentRemove,
    /// 获取自定义 agents 的原始 JSON（用于手动编辑）
    CustomAgentGetJson,
    /// 设置自定义 agents 的原始 JSON（保存手动编辑）
    CustomAgentSetJson,
    /// 获取 acp_servers.json 文件路径
    CustomAgentGetManifestPath,

    // ===== GitHub 操作 =====
    /// 获取分支关联的所有 PR 列表
    GithubPrList,
    /// 获取单个 PR 详情（核心数据，快速返回）
    GithubPrDetail,
    /// 获取 PR 详情侧边栏数据（review comments, participants, closing issues）
    GithubPrDetailSidebar,
    /// 创建 PR
    GithubPrCreate,
    /// 合并 PR
    GithubPrMerge,
    /// 关闭 PR
    GithubPrClose,
    /// 重新打开 PR
    GithubPrReopen,
    /// 评论 PR
    GithubPrComment,
    /// 将 PR 设置为 Ready for Review
    GithubPrReady,
    /// 在浏览器中打开 PR
    GithubPrOpenBrowser,
    /// 将 PR 转换为 Draft
    GithubPrDraft,
    /// 分页获取 PR timeline
    GithubPrTimelinePage,
    /// 列出仓库 issue
    GithubIssueList,
    /// 获取单个 issue 详情或通过 URL 解析 issue
    GithubIssueGet,
    /// 获取最新 CI 运行状态
    GithubCiStatus,
    /// 在浏览器中打开 CI run
    GithubCiOpenBrowser,
    /// 列出所有的 workflow runs
    GithubActionsList,
    /// 获取 workflow run 详情
    GithubActionsDetail,
    /// Rerun workflow
    GithubActionsRerun,

    // ===== Function Settings =====
    /// Read ~/.atmos/function_settings.json
    FunctionSettingsGet,
    /// Update a field in ~/.atmos/function_settings.json
    FunctionSettingsUpdate,
    /// Read ~/.atmos/llm/providers.json
    LlmProvidersGet,
    /// Overwrite ~/.atmos/llm/providers.json
    LlmProvidersUpdate,
    /// Test an LLM provider with streaming output
    LlmProviderTest,

    // ===== Code Agent Custom Settings =====
    /// Read ~/.atmos/agent/terminal_code_agent.json
    CodeAgentCustomGet,
    /// Overwrite ~/.atmos/agent/terminal_code_agent.json
    CodeAgentCustomUpdate,

    // ===== Notification Settings =====
    /// Read ~/.atmos/notification_settings.json
    NotificationSettingsGet,
    /// Overwrite ~/.atmos/notification_settings.json
    NotificationSettingsUpdate,
    /// Send a test push notification
    NotificationTestPush,
}

/// 服务端主动推送的事件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WsEvent {
    /// 工作区安装/初始化进度
    WorkspaceSetupProgress,
    /// AI usage overview changed and should be refreshed on all clients
    UsageOverviewUpdated,
    /// Local token usage overview changed and should be refreshed on all clients
    TokenUsageUpdated,
    /// Git commit message 流式生成 chunk
    GitCommitMessageChunk,
    /// LLM provider test 流式输出 chunk
    LlmProviderTestChunk,
    /// 工作区删除进度
    WorkspaceDeleteProgress,
    /// Agent hook 状态变更
    AgentHookStateChanged,
    /// Agent notification (permission request, task complete, etc.)
    AgentNotification,
    /// Current branch PR status should be refreshed
    GithubBranchPrStatusRefreshed,
}

// ===== 消息通知数据结构 =====

/// 工作区设置进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSetupContextNotification {
    pub has_github_issue: bool,
    pub has_requirement_step: bool,
    pub auto_extract_todos: bool,
    pub has_setup_script: bool,
}

/// 工作区设置进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSetupProgressNotification {
    pub workspace_id: String,
    /// 当前状态: "creating", "setting_up", "completed", "error"
    pub status: String,
    #[serde(default)]
    pub step_key: Option<String>,
    #[serde(default)]
    pub failed_step_key: Option<String>,
    pub step_title: String,
    /// 脚本输出内容 (按需发送)
    pub output: Option<String>,
    #[serde(default)]
    pub replace_output: bool,
    #[serde(default)]
    pub requires_confirmation: bool,
    pub success: bool,
    /// 倒计时 (秒)
    pub countdown: Option<u32>,
    #[serde(default)]
    pub setup_context: Option<WorkspaceSetupContextNotification>,
}

/// 工作区删除进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDeleteProgressNotification {
    pub workspace_id: String,
    /// 当前步骤: "removing_worktree", "removing_branch", "removing_remote_branch", "completed", "error"
    pub step: String,
    pub message: String,
    pub success: bool,
}

// ===== 文件系统操作数据结构 =====

/// 列出目录请求数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListDirRequest {
    pub path: String,
    /// 是否只显示目录
    #[serde(default)]
    pub dirs_only: bool,
    /// 是否显示隐藏文件
    #[serde(default)]
    pub show_hidden: bool,
    /// 如果找不到目录是否忽略错误返回空列表
    #[serde(default)]
    pub ignore_not_found: bool,
}

/// 目录条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_git_repo: bool,
}

/// 列出目录响应数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListDirResponse {
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FsEntry>,
}

/// 验证 Git 路径请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsValidateGitPathRequest {
    pub path: String,
}

/// 验证 Git 路径响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsValidateGitPathResponse {
    pub is_valid: bool,
    pub is_git_repo: bool,
    pub suggested_name: Option<String>,
    pub default_branch: Option<String>,
    pub error: Option<String>,
}

/// 读取文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsReadFileRequest {
    pub path: String,
}

/// 读取文件响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsReadFileResponse {
    pub path: String,
    pub content: String,
    pub size: u64,
}

/// 写入文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsWriteFileRequest {
    pub path: String,
    pub content: String,
}

/// 写入文件响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsWriteFileResponse {
    pub path: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsCreateDirRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsRenamePathRequest {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsDeletePathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsDuplicatePathRequest {
    pub from: String,
    pub to: String,
}

/// 列出项目文件树请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListProjectFilesRequest {
    /// 项目根目录路径
    pub root_path: String,
    /// 是否显示隐藏文件
    #[serde(default)]
    pub show_hidden: bool,
}

/// 文件树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

/// 列出项目文件树响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsListProjectFilesResponse {
    pub root_path: String,
    pub tree: Vec<FileTreeNode>,
}

/// 搜索文件内容请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchContentRequest {
    /// 项目根目录路径
    pub root_path: String,
    /// 搜索关键词
    pub query: String,
    /// 最大结果数（默认 50）
    #[serde(default = "default_max_results")]
    pub max_results: usize,
    /// 是否区分大小写（默认 false）
    #[serde(default)]
    pub case_sensitive: bool,
}

fn default_max_results() -> usize {
    50
}

/// 搜索匹配项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    /// 文件相对路径
    pub file_path: String,
    /// 行号
    pub line_number: usize,
    /// 行内容
    pub line_content: String,
    /// 匹配开始位置
    pub match_start: usize,
    /// 匹配结束位置
    pub match_end: usize,
    /// 上文内容
    #[serde(default)]
    pub context_before: Vec<String>,
    /// 下文内容
    #[serde(default)]
    pub context_after: Vec<String>,
}

/// 搜索文件内容响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchContentResponse {
    /// 匹配结果列表
    pub matches: Vec<SearchMatch>,
    /// 是否被截断（超过最大结果数）
    pub truncated: bool,
}

/// 搜索目录请求（按名称）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchDirsRequest {
    /// 搜索根目录路径
    pub root_path: String,
    /// 搜索关键词（目录名）
    pub query: String,
    /// 最大结果数（默认 50）
    #[serde(default = "default_max_results")]
    pub max_results: usize,
    /// 最大搜索深度（默认 4）
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
}

fn default_max_depth() -> usize {
    4
}

/// 搜索目录响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsSearchDirsResponse {
    /// 匹配的目录列表
    pub entries: Vec<FsEntry>,
}

// ===== 应用程序操作数据结构 =====

/// 使用外部应用打开路径请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppOpenRequest {
    /// 应用名称 (e.g., "Finder", "VS Code", "Terminal")
    pub app_name: String,
    /// 要打开的路径
    pub path: String,
}

// ===== Project 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectCreateRequest {
    pub name: String,
    pub main_file_path: String,
    #[serde(default)]
    pub sidebar_order: i32,
    pub border_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdateRequest {
    pub guid: String,
    pub name: Option<String>,
    pub border_color: Option<String>,
    pub sidebar_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDeleteRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdateTargetBranchRequest {
    pub guid: String,
    pub target_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectUpdateOrderRequest {
    pub guid: String,
    pub sidebar_order: i32,
}

// ===== Git 操作数据结构 =====

/// 获取 Git 状态请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetStatusRequest {
    /// 仓库/工作区路径
    pub path: String,
}

/// 获取 HEAD 提交 hash 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetHeadCommitRequest {
    /// 仓库/工作区路径
    pub path: String,
}

/// 获取 base..head 提交数量请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGetCommitCountRequest {
    pub path: String,
    pub base_commit: String,
    pub head_commit: String,
}

/// Git 状态响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusResponse {
    /// 是否有未提交的更改
    pub has_uncommitted_changes: bool,
    /// 是否存在未解决的 merge conflicts
    pub has_merge_conflicts: bool,
    /// 是否有未推送的提交
    pub has_unpushed_commits: bool,
    /// 未提交更改的数量
    pub uncommitted_count: u32,
    /// 未推送提交的数量
    pub unpushed_count: u32,
    /// 当前分支落后其远程跟踪分支的提交数
    pub upstream_behind_count: Option<u32>,
    /// 默认远程分支名
    pub default_branch: Option<String>,
    /// 当前分支对应的远程分支领先 origin/<default_branch> 的提交数
    pub default_branch_ahead: Option<u32>,
    /// 当前分支对应的远程分支落后 origin/<default_branch> 的提交数
    pub default_branch_behind: Option<u32>,
    /// 当前分支名
    pub current_branch: Option<String>,
    /// Github owner
    pub github_owner: Option<String>,
    /// Github repo
    pub github_repo: Option<String>,
}

/// 列出 Git 分支请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitListBranchesRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 分支列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranchesResponse {
    /// 分支列表
    pub branches: Vec<String>,
}

/// 重命名 Git 分支请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRenameBranchRequest {
    /// 仓库路径
    pub path: String,
    /// 旧分支名
    pub old_name: String,
    /// 新分支名
    pub new_name: String,
}

/// 获取变更文件列表请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFilesRequest {
    /// 仓库路径
    pub path: String,
    #[serde(default)]
    pub base_branch: Option<String>,
    #[serde(default)]
    pub use_preferred_compare: bool,
}

/// 变更文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFile {
    /// 文件路径
    pub path: String,
    /// 文件状态: M(修改), A(新增), D(删除), R(重命名), C(复制), U(未合并)
    pub status: String,
    /// 新增行数
    pub additions: u32,
    /// 删除行数
    pub deletions: u32,
}

/// 获取变更文件列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChangedFilesResponse {
    /// 变更文件列表
    pub files: Vec<GitChangedFile>,
    /// 总新增行数
    pub total_additions: u32,
    /// 总删除行数
    pub total_deletions: u32,
}

/// 获取单个文件 diff 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiffRequest {
    /// 仓库路径
    pub path: String,
    /// 文件相对路径
    pub file_path: String,
    #[serde(default)]
    pub base_branch: Option<String>,
}

/// 获取单个文件 diff 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileDiffResponse {
    /// 文件相对路径
    pub file_path: String,
    /// 旧文件内容 (HEAD 版本)
    pub old_content: String,
    /// 新文件内容 (工作区版本)
    pub new_content: String,
    /// 文件状态
    pub status: String,
}

/// Git 提交请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitRequest {
    /// 仓库路径
    pub path: String,
    /// 提交信息
    pub message: String,
}

/// Git commit message 生成请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGenerateCommitMessageRequest {
    /// 仓库路径
    pub path: String,
}

/// Git commit message 生成响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitGenerateCommitMessageResponse {
    /// 生成的 commit message
    pub message: String,
}

/// Git 提交响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCommitResponse {
    /// 是否成功
    pub success: bool,
    /// 提交 hash
    pub commit_hash: Option<String>,
}

/// Git 推送请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPushRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 推送响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPushResponse {
    /// 是否成功
    pub success: bool,
}

/// Git 暂存文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStageRequest {
    /// 仓库路径
    pub path: String,
    /// 要暂存的文件路径列表
    pub files: Vec<String>,
}

/// Git 取消暂存请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitUnstageRequest {
    /// 仓库路径
    pub path: String,
    /// 要取消暂存的文件路径列表
    pub files: Vec<String>,
}

/// Git 放弃工作区更改请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiscardUnstagedRequest {
    /// 仓库路径
    pub path: String,
    /// 要放弃更改的文件路径列表
    pub files: Vec<String>,
}

/// Git 放弃未追踪文件请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitDiscardUntrackedRequest {
    /// 仓库路径
    pub path: String,
    /// 要删除的未追踪文件路径列表
    pub files: Vec<String>,
}

/// Git 拉取请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitPullRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 获取请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFetchRequest {
    /// 仓库路径
    pub path: String,
}

/// Git 同步请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSyncRequest {
    /// 仓库路径
    pub path: String,
}

/// 获取 Git 提交日志请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogRequest {
    /// 仓库路径
    pub path: String,
    /// 每页条数（默认 30）
    #[serde(default = "default_git_log_limit")]
    pub limit: usize,
    /// 跳过的条数（用于分页，默认 0）
    #[serde(default)]
    pub offset: usize,
}

fn default_git_log_limit() -> usize {
    30
}

// ===== Script 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptGetRequest {
    pub project_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptSaveRequest {
    pub project_guid: String,
    pub scripts: Value,
}

// ===== Workspace 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceListRequest {
    pub project_guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceCreateRequest {
    pub project_guid: String,
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    pub branch: String,
    #[serde(default)]
    pub base_branch: Option<String>,
    #[serde(default)]
    pub sidebar_order: i32,
    #[serde(default)]
    pub initial_requirement: Option<String>,
    #[serde(default)]
    pub github_issue: Option<GithubIssuePayload>,
    #[serde(default)]
    pub auto_extract_todos: bool,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub workflow_status: Option<String>,
    #[serde(default)]
    pub label_guids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateNameRequest {
    pub guid: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateBranchRequest {
    pub guid: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateWorkflowStatusRequest {
    pub guid: String,
    pub workflow_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdatePriorityRequest {
    pub guid: String,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelCreateRequest {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelUpdateRequest {
    pub guid: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateLabelsRequest {
    pub guid: String,
    #[serde(default)]
    pub label_guids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUpdateOrderRequest {
    pub guid: String,
    pub sidebar_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMarkVisitedRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDeleteRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePinRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUnpinRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceArchiveRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRetrySetupRequest {
    pub guid: String,
    pub failed_step_key: String,
    #[serde(default)]
    pub initial_requirement: Option<String>,
    #[serde(default)]
    pub github_issue: Option<GithubIssuePayload>,
    #[serde(default)]
    pub auto_extract_todos: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSkipSetupScriptRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfirmTodosRequest {
    pub guid: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceUnarchiveRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectCheckCanDeleteRequest {
    pub guid: String,
}

// ===== Skills 操作数据结构 =====

/// Skill 中的文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    /// 文件名
    pub name: String,
    /// 文件相对路径
    pub relative_path: String,
    /// 文件绝对路径
    pub absolute_path: String,
    /// 文件内容 (仅文本文件)
    pub content: Option<String>,
    /// 是否是主文件 (SKILL.md, README.md 等)
    pub is_main: bool,
}

/// Skill 的单个安装位置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillPlacement {
    /// Placement 唯一标识
    pub id: String,
    /// 来源 Agent（claude、codex 等）
    pub agent: String,
    /// 作用域: global / project / inside_project
    pub scope: String,
    /// 项目 ID（scope=project / inside_project 时）
    pub project_id: Option<String>,
    /// 项目名称（scope=project / inside_project 时）
    pub project_name: Option<String>,
    /// 当前入口路径（enabled 时为原始路径，disabled 时为 disabled 存储路径）
    pub path: String,
    /// 启用后应恢复到的原始路径
    pub original_path: String,
    /// 解析后的真实路径（若可解析）
    pub resolved_path: Option<String>,
    /// 当前状态: enabled / disabled
    pub status: String,
    /// 入口类型: directory / file / symlink
    pub entry_kind: String,
    /// symlink 的 target（若适用）
    pub symlink_target: Option<String>,
    /// 是否允许删除
    pub can_delete: bool,
    /// 是否允许 enable / disable
    pub can_toggle: bool,
}

/// 已安装的 Skill 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    /// Skill 唯一标识
    pub id: String,
    /// Skill 名称
    pub name: String,
    /// Skill 描述
    pub description: String,
    /// 来源 Agent 列表 (cursor, claude, factory, etc.)
    pub agents: Vec<String>,
    /// 作用域: global 或 project
    pub scope: String,
    /// 项目 ID (scope=project 时)
    pub project_id: Option<String>,
    /// 项目名称 (scope=project 时)
    pub project_name: Option<String>,
    /// Skill 文件路径
    pub path: String,
    /// Skill 包含的所有文件
    pub files: Vec<SkillFile>,
    /// Skill 标题 (从 frontmatter 提取)
    pub title: Option<String>,
    /// 聚合状态: enabled / disabled / partial
    pub status: String,
    /// 是否允许管理
    pub manageable: bool,
    /// 是否允许删除
    pub can_delete: bool,
    /// 是否允许 enable / disable
    pub can_toggle: bool,
    /// 该 Skill 的所有实际安装位置
    pub placements: Vec<SkillPlacement>,
}

/// Skills 列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsListResponse {
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsGetRequest {
    pub scope: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsSetEnabledRequest {
    pub id: String,
    pub enabled: bool,
    pub placement_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsDeleteRequest {
    pub id: String,
    pub placement_ids: Option<Vec<String>>,
}

// ===== Agent 操作数据结构 =====

// ===== GitHub 操作数据结构 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueLabelPayload {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssuePayload {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub url: String,
    pub state: String,
    #[serde(default)]
    pub labels: Vec<GithubIssueLabelPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueListRequest {
    pub owner: String,
    pub repo: String,
    #[serde(default = "default_github_issue_state")]
    pub state: String,
    #[serde(default = "default_github_issue_limit")]
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssueGetRequest {
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub issue_number: Option<u64>,
    #[serde(default)]
    pub issue_url: Option<String>,
}

fn default_github_issue_state() -> String {
    "open".to_string()
}

fn default_github_issue_limit() -> usize {
    50
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrListRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub state: Option<String>,
    #[serde(default)]
    pub emit_branch_status_refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrDetailRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCreateRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub title: String,
    pub body: Option<String>,
    pub base_branch: String,
    pub draft: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrMergeRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub strategy: String,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCloseRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrReopenRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrCommentRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrReadyRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrDraftRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrOpenBrowserRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubPrTimelinePageRequest {
    pub owner: String,
    pub repo: String,
    pub pr_number: u64,
    pub page: u64,
    pub per_page: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubCiStatusRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubCiOpenBrowserRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstallRequest {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigGetRequest {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigSetRequest {
    pub id: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryInstallRequest {
    pub registry_id: String,
    #[serde(default)]
    pub force_overwrite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryRemoveRequest {
    pub registry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryListRequest {
    #[serde(default)]
    pub force_refresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentAddRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentRemoveRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgentSetJsonRequest {
    pub json: String,
}

// ===== WsMessage 工厂方法 =====

impl WsMessage {
    pub fn ping() -> Self {
        Self::Ping
    }

    pub fn pong() -> Self {
        Self::Pong
    }

    pub fn message(id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: None,
        })
    }

    pub fn message_with_metadata(
        id: impl Into<String>,
        content: impl Into<String>,
        metadata: Value,
    ) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: Some(metadata),
        })
    }

    /// 创建成功响应
    pub fn success(request_id: impl Into<String>, data: Value) -> Self {
        Self::Response(WsResponse {
            request_id: request_id.into(),
            success: true,
            data,
        })
    }

    /// 创建失败响应
    pub fn error(
        request_id: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::Error(WsErrorPayload {
            request_id: request_id.into(),
            code: code.into(),
            message: message.into(),
        })
    }

    /// 创建主动通知
    pub fn notification(event: WsEvent, data: Value) -> Self {
        Self::Notification(WsNotification { event, data })
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsListRequest {
    pub owner: String,
    pub repo: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsRerunRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
    pub failed_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubActionsDetailRequest {
    pub owner: String,
    pub repo: String,
    pub run_id: u64,
}

/// Update a single key path inside ~/.atmos/function_settings.json.
/// `function_name` is the top-level key (e.g. "git_commit"), `key` is
/// the nested field (e.g. "acp_new_session_switch"), `value` is the JSON value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionSettingsUpdateRequest {
    pub function_name: String,
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProvidersUpdateRequest {
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProviderTestRequest {
    pub stream_id: String,
    pub provider_id: Option<String>,
    pub provider: serde_json::Value,
}

/// Overwrite the entire terminal_code_agent.json with the provided JSON value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeAgentCustomUpdateRequest {
    pub agents: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSingleSystemSkillRequest {
    pub skill_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettingsUpdateRequest {
    pub settings: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationTestPushRequest {
    pub server_index: usize,
}
