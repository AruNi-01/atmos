#![allow(dead_code)]

use serde::{Deserialize, Serialize};

fn deserialize_nullable_update_field<'de, D, T>(
    deserializer: D,
) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
use serde_json::Value;

mod agents;
mod fs;
mod git;
mod github;
mod review;
mod skills;
mod workspace;

pub use agents::*;
pub use fs::*;
pub use git::*;
pub use github::*;
pub use review::*;
pub use skills::*;
pub use workspace::*;

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
pub struct UsageProviderFooterCarouselRequest {
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

    // ===== Canvas 操作 =====
    /// 获取默认 canvas board
    CanvasGetDefaultBoard,
    /// 更新默认 canvas board
    CanvasUpdateDefaultBoard,
    /// Register this browser tab as a terminal-agent bridge target (APP-015)
    CanvasBridgeRegister,
    /// Unregister this browser tab from the terminal-agent bridge (APP-015)
    CanvasBridgeUnregister,
    /// Browser uplink for a previously dispatched canvas-agent command (APP-015)
    CanvasAgentDispatchResult,

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
    /// 将补丁块应用到暂存区（index）
    GitStagePatchChunk,
    /// 逆向应用补丁块到工作区（撤销该块的未暂存改动）
    GitRestorePatchChunk,
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
    /// 更新单个 provider 是否显示在 footer usage 轮播中
    UsageSetProviderFooterCarousel,
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
    /// 删除可复用 Workspace 标签
    WorkspaceLabelDelete,
    /// 恢复可复用 Workspace 标签
    WorkspaceLabelRestore,
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
    /// 更新置顶工作区顺序
    WorkspaceUpdatePinOrder,
    /// 归档 Workspace
    WorkspaceArchive,
    /// 从 GitHub Issues 导入创建 Issue Only Workspaces
    WorkspaceImportGithubIssues,
    /// 取消归档 Workspace
    WorkspaceUnarchive,
    /// 获取已归档的 Workspace 列表
    WorkspaceListArchived,
    /// 重试 Workspace 设置 (脚本执行)
    WorkspaceRetrySetup,
    /// 跳过失败的 Workspace 设置步骤，继续执行后续步骤
    WorkspaceSkipSetupStep,
    /// 跳过失败的 setup script，直接完成 workspace 初始化
    WorkspaceSkipSetupScript,
    /// 确认 LLM 生成的 TODO 并继续 setup
    WorkspaceConfirmTodos,
    /// 检查项目是否可以删除（从归档模态）
    ProjectCheckCanDelete,

    // ===== Review 操作 =====
    /// 列出 Workspace 下的 review sessions
    ReviewSessionList,
    /// 获取单个 review session
    ReviewSessionGet,
    /// 创建 review session
    ReviewSessionCreate,
    /// 关闭 review session
    ReviewSessionClose,
    /// 归档 review session
    ReviewSessionArchive,
    /// 恢复 review session 为 active
    ReviewSessionActivate,
    /// 重命名 review session
    ReviewSessionRename,
    /// 列出 revision 下的 review files
    ReviewFileList,
    /// 读取 review file snapshot 内容
    ReviewFileContentGet,
    /// 更新文件 reviewed 状态
    ReviewFileSetReviewed,
    /// 列出 review comments
    ReviewCommentList,
    /// 创建 review comment
    ReviewCommentCreate,
    /// 更新 review comment 状态
    ReviewCommentUpdateStatus,
    /// 添加 review message
    ReviewMessageAdd,
    /// 更新 review message
    ReviewMessageUpdate,
    /// 删除 review message
    ReviewMessageDelete,
    /// 列出 review agent runs
    ReviewAgentRunList,
    /// 创建 review agent run
    ReviewAgentRunCreate,
    /// 读取 review agent run artifact
    ReviewAgentRunArtifactGet,
    /// finalize review agent run into a new revision
    ReviewAgentRunFinalize,
    /// Set review agent run status
    ReviewAgentRunSetStatus,

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

    // ===== Automation 操作 =====
    AutomationList,
    AutomationGet,
    AutomationCreate,
    AutomationUpdate,
    AutomationDelete,
    AutomationRunNow,
    AutomationPause,
    AutomationResume,
    AutomationCancelRun,
    AutomationRunList,
    AutomationRunGet,
    AutomationArtifactGet,
    AutomationAgentCapabilities,
    AutomationSchedulePreview,
    AutomationGithubSetupSession,
    AutomationGithubInstallations,
    AutomationGithubRepositories,
    AutomationGithubEventRouteUpsert,
    AutomationGithubEventRouteDelete,

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
    /// 列出仓库的 PR（不依赖分支过滤）
    GithubPrListRepo,
    /// 获取单个 PR 详情或通过 URL 解析 PR
    GithubPrGet,
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
    GithubPrFiles,

    // ===== Function Settings =====
    /// Read ~/.atmos/function_settings.json
    FunctionSettingsGet,
    /// Update a field in ~/.atmos/function_settings.json
    FunctionSettingsUpdate,
    /// Read the merged GitIgnore-dirs compensation config (built-ins + user customs)
    WorkspaceGitignoreDirsGet,
    /// Overwrite the GitIgnore-dirs compensation config
    WorkspaceGitignoreDirsUpdate,
    /// Read ~/.atmos/llm/providers.json
    LlmProvidersGet,
    /// Overwrite ~/.atmos/llm/providers.json
    LlmProvidersUpdate,
    /// Test an LLM provider with streaming output
    LlmProviderTest,

    // ===== Code Agent Custom Settings =====
    /// Read ~/.atmos/agent/terminal_code_agent.json
    CodeAgentCustomGet,
    /// Get agent behaviour settings (idle timeout, etc.)
    AgentBehaviourSettingsGet,
    /// Update agent behaviour settings
    AgentBehaviourSettingsUpdate,
    /// Overwrite ~/.atmos/agent/terminal_code_agent.json
    CodeAgentCustomUpdate,

    // ===== Notification Settings =====
    /// Read ~/.atmos/notification_settings.json
    NotificationSettingsGet,
    /// Overwrite ~/.atmos/notification_settings.json
    NotificationSettingsUpdate,
    /// Send a test push notification
    NotificationTestPush,
    // ===== Local Model =====
    /// Fetch the remote model manifest and return available models + current state
    LocalModelList,
    /// Force refresh the manifest from remote (bypass cache)
    LocalModelRefresh,
    /// Download the llama-server runtime binary
    LocalModelRuntimeDownload,
    /// Download a model GGUF (streams state via LocalModelStateChanged)
    LocalModelDownload,
    /// Start the llama-server for a given model
    LocalModelStart,
    /// Stop the running llama-server
    LocalModelStop,
    /// Delete a downloaded model file
    LocalModelDelete,
    /// Delete the llama-server runtime binary
    LocalModelDeleteRuntime,
    /// Get the current runtime state
    LocalModelStatus,
    /// Resolve metadata from a Hugging Face GGUF URL
    LocalModelResolveHfUrl,
    /// Add a custom Hugging Face GGUF model
    LocalModelCustomAdd,
    /// Remove a custom Hugging Face GGUF model
    LocalModelCustomDelete,
}

/// 服务端主动推送的事件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WsEvent {
    /// 工作区安装/初始化进度
    WorkspaceSetupProgress,
    /// GitIgnore compensation failed after workspace creation
    WorkspaceGitignoreSyncFailed,
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
    /// 项目删除进度
    ProjectDeleteProgress,
    /// Agent hook 状态变更
    AgentHookStateChanged,
    /// Idle agent hook sessions were cleared; payload contains removed session IDs
    AgentHookSessionsCleared,
    /// Agent notification (permission request, task complete, etc.)
    AgentNotification,
    /// Current branch PR status should be refreshed
    GithubBranchPrStatusRefreshed,
    /// Review comment changed
    ReviewCommentUpdated,
    /// Review message created
    ReviewMessageCreated,
    /// Review file state updated
    ReviewFileUpdated,
    /// Review agent run changed
    ReviewAgentRunUpdated,
    /// Local model state changed (download progress, started, stopped, error)
    LocalModelStateChanged,
    /// Server → browser: terminal-agent command dispatch (APP-015)
    CanvasAgentDispatch,
    /// Automation definition changed
    AutomationDefinitionUpdated,
    /// Automation run changed
    AutomationRunUpdated,
    /// Automation outcome notification
    AutomationNotification,
}

/// 项目删除进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDeleteProgressNotification {
    pub project_id: String,
    /// 当前步骤: "cleaning_workspaces", "removing_worktree", "completed", "error"
    pub step: String,
    pub message: String,
    pub success: bool,
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
    #[serde(default, deserialize_with = "deserialize_nullable_update_field")]
    pub border_color: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_update_field")]
    pub logo_path: Option<Option<String>>,
    pub sidebar_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDeleteRequest {
    pub guid: String,
}

#[cfg(test)]
mod tests {
    use super::ProjectUpdateRequest;
    use serde_json::json;

    #[test]
    fn project_update_nullable_fields_distinguish_missing_null_and_value() {
        let missing: ProjectUpdateRequest =
            serde_json::from_value(json!({ "guid": "project-1" })).unwrap();
        assert_eq!(missing.border_color, None);
        assert_eq!(missing.logo_path, None);

        let cleared: ProjectUpdateRequest = serde_json::from_value(json!({
            "guid": "project-1",
            "border_color": null,
            "logo_path": null
        }))
        .unwrap();
        assert_eq!(cleared.border_color, Some(None));
        assert_eq!(cleared.logo_path, Some(None));

        let updated: ProjectUpdateRequest = serde_json::from_value(json!({
            "guid": "project-1",
            "border_color": "#ef4444",
            "logo_path": "/tmp/logo.png"
        }))
        .unwrap();
        assert_eq!(updated.border_color, Some(Some("#ef4444".to_string())));
        assert_eq!(updated.logo_path, Some(Some("/tmp/logo.png".to_string())));
    }
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
pub struct AgentBehaviourSettingsUpdateRequest {
    pub idle_session_timeout_mins: u64,
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

// ===== Local Model Request Structures =====

/// Request to download (and optionally start) a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelDownloadRequest {
    /// Model id from the manifest, e.g. "qwen2.5-0.5b-instruct".
    pub model_id: String,
}

/// Request to start the llama-server for a specific model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelStartRequest {
    pub model_id: String,
}

/// Request to delete a downloaded model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelDeleteRequest {
    pub model_id: String,
}

/// Request to delete the llama-server runtime binary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelDeleteRuntimeRequest {}

/// Request to resolve a Hugging Face model or GGUF file URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelResolveHfUrlRequest {
    pub url: String,
}

/// Request to add a custom Hugging Face GGUF model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelCustomAddRequest {
    pub url: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub ram_footprint_mb: Option<u64>,
}

/// Request to remove a custom Hugging Face GGUF model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelCustomDeleteRequest {
    pub model_id: String,
}

// ===== Local Model Notification Payload =====

/// Notification payload pushed via WsEvent::LocalModelStateChanged.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelStateNotification {
    /// Serialized `LocalModelState` (flattened as JSON object).
    pub state: serde_json::Value,
}
