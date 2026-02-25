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
    Error(WsError),
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

/// 错误响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsError {
    /// 关联的请求 ID
    pub request_id: String,
    /// 错误代码
    pub code: String,
    /// 错误消息
    pub message: String,
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
    /// 验证 Git 仓库路径
    FsValidateGitPath,
    /// 读取文件内容
    FsReadFile,
    /// 写入文件内容
    FsWriteFile,
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
    /// 重命名 Git 分支
    GitRenameBranch,
    /// 获取变更文件列表
    GitChangedFiles,
    /// 获取单个文件的 diff
    GitFileDiff,
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

    // ===== Project 操作 =====
    /// 获取所有项目
    ProjectList,
    /// 创建项目
    ProjectCreate,
    /// 更新项目
    ProjectUpdate,
    /// 更新项目目标分支（用于 merge/PR/git diff）
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
    /// 更新 Workspace 排序
    WorkspaceUpdateOrder,
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
    /// 检查项目是否可以删除（从归档模态）
    ProjectCheckCanDelete,

    // ===== Skills 操作 =====
    /// 获取已安装的 Skills 列表
    SkillsList,
    /// 获取单个 Skill 详情
    SkillsGet,
    /// 安装 Project Wiki skill 到 ~/.atmos/skills/.system/project-wiki
    WikiSkillInstall,
    /// 检查 system 目录是否有 project-wiki skill
    WikiSkillSystemStatus,
    /// 检查 system 目录是否有所有 code review skills
    CodeReviewSkillSystemStatus,
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
}

/// 服务端主动推送的事件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WsEvent {
    /// 工作区安装/初始化进度
    WorkspaceSetupProgress,
}

// ===== 消息通知数据结构 =====

/// 工作区设置进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSetupProgressNotification {
    pub workspace_id: String,
    /// 当前状态: "creating", "setting_up", "completed", "error"
    pub status: String,
    pub step_title: String,
    /// 脚本输出内容 (按需发送)
    pub output: Option<String>,
    pub success: bool,
    /// 倒计时 (秒)
    pub countdown: Option<u32>,
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
    /// 是否有未推送的提交
    pub has_unpushed_commits: bool,
    /// 未提交更改的数量
    pub uncommitted_count: u32,
    /// 未推送提交的数量
    pub unpushed_count: u32,
    /// 当前分支名
    pub current_branch: Option<String>,
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
    pub branch: String,
    #[serde(default)]
    pub sidebar_order: i32,
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
pub struct WorkspaceUpdateOrderRequest {
    pub guid: String,
    pub sidebar_order: i32,
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

/// 已安装的 Skill 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
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

// ===== Agent 操作数据结构 =====

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
        Self::Error(WsError {
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
