use serde::{Deserialize, Serialize};

use super::{GithubIssuePayload, GithubPrPayload};
pub use core_service::WorkspaceAttachmentPayload;

/// 工作区设置进度通知数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSetupContextNotification {
    pub has_github_issue: bool,
    pub has_github_pr: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceGitignoreSyncFailedNotification {
    pub workspace_id: String,
    pub message: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceListRequest {
    pub project_guid: String,
    #[serde(default)]
    pub include_issue_only: bool,
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
    pub github_pr: Option<GithubPrPayload>,
    #[serde(default)]
    pub auto_extract_todos: bool,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub workflow_status: Option<String>,
    #[serde(default)]
    pub label_guids: Option<Vec<String>>,
    #[serde(default)]
    pub attachments: Vec<WorkspaceAttachmentPayload>,
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
    #[serde(default = "default_label_source")]
    pub source: String,
}

fn default_label_source() -> String {
    "manual".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelUpdateRequest {
    pub guid: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelDeleteRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelListRequest {
    #[serde(default)]
    pub deleted_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLabelRestoreRequest {
    pub guid: String,
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
pub struct WorkspaceUpdatePinOrderRequest {
    pub workspace_ids: Vec<String>,
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
    pub github_pr: Option<GithubPrPayload>,
    #[serde(default)]
    pub auto_extract_todos: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSkipSetupScriptRequest {
    pub guid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSkipSetupStepRequest {
    pub guid: String,
    pub failed_step_key: String,
    #[serde(default)]
    pub initial_requirement: Option<String>,
    #[serde(default)]
    pub github_issue: Option<GithubIssuePayload>,
    #[serde(default)]
    pub github_pr: Option<GithubPrPayload>,
    #[serde(default)]
    pub auto_extract_todos: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceImportGithubIssuesRequest {
    pub project_guid: String,
    pub issues: Vec<GithubIssuePayload>,
    #[serde(default)]
    pub workflow_status: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub label_guids: Option<Vec<String>>,
}
