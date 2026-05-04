//! WebSocket message service - handles all WebSocket business logic.
//!
//! This service processes incoming WebSocket requests and delegates to appropriate services.
//! All communication uses the Request/Response pattern with JSON messages.

use std::ffi::CStr;
use std::io::Read;
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;

use agent::{AgentId, CustomAgent};
use ai_usage::UsageService;
use async_trait::async_trait;
use core_engine::{FsEngine, GitEngine};
use infra::{
    AgentBehaviourSettingsUpdateRequest, AgentConfigGetRequest, AgentConfigSetRequest,
    AgentInstallRequest, AgentRegistryInstallRequest, AgentRegistryListRequest,
    AgentRegistryRemoveRequest, AppOpenRequest, CodeAgentCustomUpdateRequest,
    CustomAgentAddRequest, CustomAgentRemoveRequest, CustomAgentSetJsonRequest, FsCreateDirRequest,
    FsDeletePathRequest, FsDuplicatePathRequest, FsListDirRequest, FsListProjectFilesRequest,
    FsReadFileRequest, FsRenamePathRequest, FsSearchContentRequest, FsSearchDirsRequest,
    FsValidateGitPathRequest, FsWriteFileRequest, FunctionSettingsUpdateRequest,
    GitChangedFilesRequest, GitCommitRequest, GitDiscardUnstagedRequest,
    GitDiscardUntrackedRequest, GitFetchRequest, GitFileDiffRequest,
    GitGenerateCommitMessageRequest, GitGetCommitCountRequest, GitGetHeadCommitRequest,
    GitGetStatusRequest, GitListBranchesRequest, GitLogRequest, GitPullRequest, GitPushRequest,
    GitRenameBranchRequest, GitStageRequest, GitSyncRequest, GitUnstageRequest,
    GithubActionsDetailRequest, GithubActionsListRequest, GithubActionsRerunRequest,
    GithubCiOpenBrowserRequest, GithubCiStatusRequest, GithubIssueGetRequest,
    GithubIssueLabelPayload, GithubIssueListRequest, GithubIssuePayload, GithubPrCloseRequest,
    GithubPrCommentRequest, GithubPrCreateRequest, GithubPrDetailRequest, GithubPrDraftRequest,
    GithubPrGetRequest, GithubPrListRepoRequest, GithubPrListRequest, GithubPrMergeRequest,
    GithubPrOpenBrowserRequest, GithubPrPayload, GithubPrReadyRequest, GithubPrReopenRequest,
    GithubPrTimelinePageRequest, LlmProviderTestRequest, LlmProvidersUpdateRequest,
    ProjectCheckCanDeleteRequest, ProjectCreateRequest, ProjectDeleteProgressNotification,
    ProjectDeleteRequest, ProjectUpdateOrderRequest, ProjectUpdateRequest,
    ProjectUpdateTargetBranchRequest, ReviewCommentCreateRequest, ReviewCommentListRequest,
    ReviewCommentUpdateStatusRequest, ReviewFileContentGetRequest, ReviewFileListRequest,
    ReviewFileSetReviewedRequest, ReviewAgentRunArtifactGetRequest, ReviewAgentRunCreateRequest,
    ReviewAgentRunFinalizeRequest, ReviewAgentRunListRequest, ReviewAgentRunSetStatusRequest,
    ReviewMessageAddRequest, ReviewMessageDeleteRequest, ReviewMessageUpdateRequest,
    ReviewSessionActivateRequest, ReviewSessionArchiveRequest, ReviewSessionCloseRequest,
    ReviewSessionCreateRequest, ReviewSessionGetRequest, ReviewSessionListRequest,
    ReviewSessionRenameRequest, ScriptGetRequest, ScriptSaveRequest, SkillsDeleteRequest,
    SkillsGetRequest, SkillsSetEnabledRequest, SyncSingleSystemSkillRequest,
    UsageAddProviderApiKeyRequest, UsageAllProvidersSwitchRequest, UsageAutoRefreshRequest,
    UsageDeleteProviderApiKeyRequest, UsageOverviewRequest, UsageProviderFooterCarouselRequest,
    UsageProviderManualSetupRequest, UsageProviderSwitchRequest, WorkspaceArchiveRequest,
    WorkspaceConfirmTodosRequest, WorkspaceCreateRequest, WorkspaceDeleteProgressNotification,
    WorkspaceDeleteRequest, WorkspaceLabelCreateRequest, WorkspaceLabelUpdateRequest,
    WorkspaceListRequest, WorkspaceMarkVisitedRequest, WorkspacePinRequest,
    WorkspaceRetrySetupRequest, WorkspaceSetupContextNotification,
    WorkspaceSetupProgressNotification, WorkspaceSkipSetupScriptRequest,
    WorkspaceSkipSetupStepRequest, WorkspaceUnarchiveRequest, WorkspaceUnpinRequest,
    WorkspaceUpdateBranchRequest, WorkspaceUpdateLabelsRequest, WorkspaceUpdateNameRequest,
    WorkspaceUpdateOrderRequest, WorkspaceUpdatePinOrderRequest, WorkspaceUpdatePriorityRequest,
    WorkspaceUpdateWorkflowStatusRequest, WsAction, WsEvent, WsMessage, WsMessageHandler,
    WsRequest,
};
use llm::{
    config::resolve_provider_by_id, generate_text_stream, FileLlmConfigStore, GenerateTextRequest,
    LlmProviderEntry, LlmProvidersFile, ResponseFormat,
};
use local_model::{fetch_manifest, LocalRuntimeManager};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::{json, Value};
use tokio::sync::OnceCell;

use crate::error::{Result, ServiceError};
use crate::service::git_commit_message::GitCommitMessageGenerator;
use crate::service::review::{
    AddReviewMessageInput, CreateReviewCommentInput, CreateReviewAgentRunInput,
    CreateReviewSessionInput, DeleteReviewMessageInput, ReviewAnchor, SetReviewFileReviewedInput,
    SetReviewAgentRunStatusInput, UpdateReviewCommentStatusInput, UpdateReviewMessageInput,
};
use crate::{
    AgentService, AgentSessionService, ProjectService, ReviewService, TerminalService,
    WorkspaceService,
};

/// WebSocket message service for handling all business logic via WebSocket.
pub struct WsMessageService {
    fs_engine: FsEngine,
    git_engine: GitEngine,
    app_engine: core_engine::AppEngine,
    github_engine: core_engine::GithubEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    terminal_service: Arc<TerminalService>,
    agent_service: Arc<AgentService>,
    agent_session_service: Arc<AgentSessionService>,
    review_service: Arc<ReviewService>,
    usage_service: Arc<UsageService>,
    ws_manager: OnceCell<Arc<infra::WsManager>>,
    local_model_manager: Arc<LocalRuntimeManager>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkspaceSetupStep {
    CreateWorktree,
    WriteRequirement,
    ExtractTodos,
    RunSetupScript,
    Ready,
}

impl WorkspaceSetupStep {
    fn key(self) -> &'static str {
        match self {
            Self::CreateWorktree => "create_worktree",
            Self::WriteRequirement => "write_requirement",
            Self::ExtractTodos => "extract_todos",
            Self::RunSetupScript => "run_setup_script",
            Self::Ready => "ready",
        }
    }

    fn from_key(value: &str) -> Option<Self> {
        match value {
            "create_worktree" => Some(Self::CreateWorktree),
            "write_requirement" => Some(Self::WriteRequirement),
            "extract_todos" => Some(Self::ExtractTodos),
            "run_setup_script" => Some(Self::RunSetupScript),
            "ready" => Some(Self::Ready),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
struct WorkspaceSetupPlan {
    steps: Vec<WorkspaceSetupStep>,
    context: WorkspaceSetupContextNotification,
    requirement_step_title: String,
    project_main_file_path: String,
    setup_script: Option<String>,
}

impl WsMessageService {
    async fn send_review_notification(&self, event: WsEvent, data: Value) {
        if let Some(manager) = self.ws_manager.get() {
            let message = WsMessage::notification(event, data);
            let _ = manager.broadcast(&message).await;
        }
    }

    async fn send_workspace_setup_progress(
        manager: &Arc<infra::WsManager>,
        _conn_id: &str,
        payload: WorkspaceSetupProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::WorkspaceSetupProgress, json!(payload));
        // Workspace setup is a background workflow that can outlive the WebSocket
        // connection that triggered it. Broadcast by workspace_id instead of
        // pinning updates to a potentially stale conn_id from the original request.
        let _ = manager.broadcast(&message).await;
    }

    async fn send_workspace_delete_progress(
        manager: &Arc<infra::WsManager>,
        payload: WorkspaceDeleteProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::WorkspaceDeleteProgress, json!(payload));
        let _ = manager.broadcast(&message).await;
    }

    async fn send_project_delete_progress(
        manager: &Arc<infra::WsManager>,
        payload: ProjectDeleteProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::ProjectDeleteProgress, json!(payload));
        let _ = manager.broadcast(&message).await;
    }

    async fn execute_workspace_cleanup(
        manager: Arc<infra::WsManager>,
        workspace_id: String,
        repo_path_str: String,
        workspace_name: String,
        branch: String,
        delete_remote_branch: bool,
    ) {
        // Step 1: Remove worktree (this is the slow part)
        Self::send_workspace_delete_progress(
            &manager,
            WorkspaceDeleteProgressNotification {
                workspace_id: workspace_id.clone(),
                step: "removing_worktree".into(),
                message: "Removing worktree files...".into(),
                success: false,
            },
        )
        .await;

        let cleanup_result = tokio::task::spawn_blocking({
            let repo_path = std::path::PathBuf::from(&repo_path_str);
            let workspace_name = workspace_name.clone();
            let branch = branch.clone();
            move || {
                GitEngine::new().remove_worktree(
                    &repo_path,
                    &workspace_name,
                    &branch,
                    delete_remote_branch,
                )
            }
        })
        .await
        .unwrap_or_else(|e| Err(core_engine::EngineError::Git(e.to_string())));

        match cleanup_result {
            Ok(()) => {
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id: workspace_id.clone(),
                        step: "completed".into(),
                        message: "Workspace cleanup completed".into(),
                        success: true,
                    },
                )
                .await;
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to remove worktree for workspace {}: {}",
                    workspace_name,
                    e
                );
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id: workspace_id.clone(),
                        step: "error".into(),
                        message: format!("{}", e),
                        success: false,
                    },
                )
                .await;
            }
        }

        tracing::info!(
            "Background workspace cleanup completed for {}",
            workspace_name
        );
    }

    async fn execute_project_cleanup(
        manager: Arc<infra::WsManager>,
        cleanup_info: crate::service::project::ProjectCleanupInfo,
        settings: WorkspaceDeleteSettings,
    ) {
        let project_id = cleanup_info.project_id.clone();
        let total = cleanup_info.workspaces.len();

        Self::send_project_delete_progress(
            &manager,
            ProjectDeleteProgressNotification {
                project_id: project_id.clone(),
                step: "cleaning_workspaces".into(),
                message: format!("Cleaning up {} workspace(s)...", total),
                success: false,
            },
        )
        .await;

        // Close GitHub PRs/Issues for each workspace
        for ws in &cleanup_info.workspaces {
            if settings.close_pr_on_delete {
                if let Some(ref raw) = ws.github_pr_data {
                    if let Ok(pr) = serde_json::from_str::<infra::GithubPrPayload>(raw) {
                        let pr_num = pr.number.to_string();
                        let repo = format!("{}/{}", pr.owner, pr.repo);
                        let args = vec!["pr", "close", &pr_num, "--repo", &repo];
                        if let Err(e) = core_engine::GithubEngine::new().run_gh(&args).await {
                            tracing::warn!("Failed to close PR #{}: {}", pr.number, e);
                        }
                    }
                }
            }
            if settings.close_issue_on_delete {
                if let Some(ref raw) = ws.github_issue_data {
                    if let Ok(issue) = serde_json::from_str::<infra::GithubIssuePayload>(raw) {
                        let issue_num = issue.number.to_string();
                        let repo = format!("{}/{}", issue.owner, issue.repo);
                        let args = vec!["issue", "close", &issue_num, "--repo", &repo];
                        if let Err(e) = core_engine::GithubEngine::new().run_gh(&args).await {
                            tracing::warn!("Failed to close Issue #{}: {}", issue.number, e);
                        }
                    }
                }
            }
        }

        // Remove worktrees in background blocking tasks
        let repo_path = std::path::PathBuf::from(&cleanup_info.repo_path);
        for (i, ws) in cleanup_info.workspaces.into_iter().enumerate() {
            Self::send_project_delete_progress(
                &manager,
                ProjectDeleteProgressNotification {
                    project_id: project_id.clone(),
                    step: "removing_worktree".into(),
                    message: format!("Removing worktree {}/{}: {}", i + 1, total, ws.name),
                    success: false,
                },
            )
            .await;

            let rp = repo_path.clone();
            let name = ws.name.clone();
            let branch = ws.branch.clone();
            let del_remote = settings.delete_remote_branch;
            let result = tokio::task::spawn_blocking(move || {
                GitEngine::new().remove_worktree(&rp, &name, &branch, del_remote)
            })
            .await
            .unwrap_or_else(|e| Err(core_engine::EngineError::Git(e.to_string())));

            if let Err(e) = result {
                tracing::warn!("Failed to remove worktree for {}: {}", ws.name, e);
            }
        }

        Self::send_project_delete_progress(
            &manager,
            ProjectDeleteProgressNotification {
                project_id,
                step: "completed".into(),
                message: "Project cleanup completed".into(),
                success: true,
            },
        )
        .await;
    }

    /// Close linked GitHub PR and/or Issue based on workspace delete settings.
    async fn cleanup_github_on_delete(
        &self,
        settings: &WorkspaceDeleteSettings,
        pr_data: Option<&str>,
        issue_data: Option<&str>,
    ) {
        // Close PR if configured
        if settings.close_pr_on_delete {
            if let Some(raw) = pr_data {
                if let Ok(pr) = serde_json::from_str::<infra::GithubPrPayload>(raw) {
                    let pr_num = pr.number.to_string();
                    let repo = format!("{}/{}", pr.owner, pr.repo);
                    let args = vec!["pr", "close", &pr_num, "--repo", &repo];
                    match self.github_engine.run_gh(&args).await {
                        Ok(_) => tracing::info!("Closed GitHub PR #{} on delete", pr.number),
                        Err(e) => tracing::warn!("Failed to close GitHub PR #{}: {}", pr.number, e),
                    }
                }
            }
        }

        // Close Issue if configured
        if settings.close_issue_on_delete {
            if let Some(raw) = issue_data {
                if let Ok(issue) = serde_json::from_str::<infra::GithubIssuePayload>(raw) {
                    let issue_num = issue.number.to_string();
                    let repo = format!("{}/{}", issue.owner, issue.repo);
                    let args = vec!["issue", "close", &issue_num, "--repo", &repo];
                    match self.github_engine.run_gh(&args).await {
                        Ok(_) => tracing::info!("Closed GitHub Issue #{} on delete", issue.number),
                        Err(e) => {
                            tracing::warn!("Failed to close GitHub Issue #{}: {}", issue.number, e)
                        }
                    }
                }
            }
        }
    }

    #[cfg(unix)]
    fn detect_login_shell_from_system() -> Option<String> {
        let uid = unsafe { libc::geteuid() };
        let mut pwd = std::mem::MaybeUninit::<libc::passwd>::uninit();
        let mut result = std::ptr::null_mut();
        let mut buf = vec![0u8; 4096];

        loop {
            let rc = unsafe {
                libc::getpwuid_r(
                    uid,
                    pwd.as_mut_ptr(),
                    buf.as_mut_ptr().cast(),
                    buf.len(),
                    &mut result,
                )
            };

            if rc == 0 {
                if result.is_null() {
                    return None;
                }

                let pwd = unsafe { pwd.assume_init() };
                if pwd.pw_shell.is_null() {
                    return None;
                }

                let shell = unsafe { CStr::from_ptr(pwd.pw_shell) }
                    .to_string_lossy()
                    .trim()
                    .to_string();

                return (!shell.is_empty()).then_some(shell);
            }

            if rc == libc::ERANGE {
                buf.resize(buf.len() * 2, 0);
                continue;
            }

            return None;
        }
    }

    #[cfg(not(unix))]
    fn detect_login_shell_from_system() -> Option<String> {
        None
    }

    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        terminal_service: Arc<TerminalService>,
        agent_service: Arc<AgentService>,
        agent_session_service: Arc<AgentSessionService>,
        review_service: Arc<ReviewService>,
        usage_service: Arc<UsageService>,
    ) -> Self {
        Self {
            fs_engine: FsEngine::new(),
            git_engine: GitEngine::new(),
            app_engine: core_engine::AppEngine::new(),
            github_engine: core_engine::GithubEngine::new(),
            project_service,
            workspace_service,
            terminal_service,
            agent_service,
            agent_session_service,
            review_service,
            usage_service,
            ws_manager: OnceCell::new(),
            local_model_manager: Arc::new(LocalRuntimeManager::new()),
        }
    }

    pub fn set_ws_manager(&self, manager: Arc<infra::WsManager>) -> Result<()> {
        self.ws_manager
            .set(manager)
            .map_err(|_| ServiceError::Processing("WS Manager already set".to_string()))?;
        Ok(())
    }

    /// Process a WebSocket request and return a response.
    async fn process_request(&self, conn_id: &str, request: WsRequest) -> WsMessage {
        let request_id = request.request_id.clone();

        match self.handle_action(conn_id, request).await {
            Ok(data) => WsMessage::success(&request_id, data),
            Err(e) => {
                tracing::error!("[WsMessageService] Request failed: {}", e);
                WsMessage::error(&request_id, "error", e.to_string())
            }
        }
    }

    /// Route action to the appropriate handler.
    async fn handle_action(&self, conn_id: &str, request: WsRequest) -> Result<Value> {
        match request.action {
            // File System
            WsAction::FsGetHomeDir => self.handle_fs_get_home_dir(),
            WsAction::FsListDir => self.handle_fs_list_dir(parse_request(request.data)?),
            WsAction::FsValidateGitPath => {
                self.handle_fs_validate_git_path(parse_request(request.data)?)
            }
            WsAction::FsReadFile => self.handle_fs_read_file(parse_request(request.data)?),
            WsAction::FsWriteFile => self.handle_fs_write_file(parse_request(request.data)?),
            WsAction::FsCreateDir => self.handle_fs_create_dir(parse_request(request.data)?),
            WsAction::FsRenamePath => self.handle_fs_rename_path(parse_request(request.data)?),
            WsAction::FsDeletePath => self.handle_fs_delete_path(parse_request(request.data)?),
            WsAction::FsDuplicatePath => {
                self.handle_fs_duplicate_path(parse_request(request.data)?)
            }
            WsAction::FsListProjectFiles => {
                self.handle_fs_list_project_files(parse_request(request.data)?)
            }
            WsAction::FsSearchContent => {
                self.handle_fs_search_content(parse_request(request.data)?)
            }
            WsAction::FsSearchDirs => self.handle_fs_search_dirs(parse_request(request.data)?),

            // App
            WsAction::AppOpen => self.handle_app_open(parse_request(request.data)?),

            // Git
            WsAction::GitGetStatus => self.handle_git_get_status(parse_request(request.data)?),
            WsAction::GitGetHeadCommit => {
                self.handle_git_get_head_commit(parse_request(request.data)?)
            }
            WsAction::GitGetCommitCount => {
                self.handle_git_get_commit_count(parse_request(request.data)?)
            }
            WsAction::GitListBranches => {
                self.handle_git_list_branches(parse_request(request.data)?)
            }
            WsAction::GitListRemoteBranches => {
                self.handle_git_list_remote_branches(parse_request(request.data)?)
            }
            WsAction::GitRenameBranch => {
                self.handle_git_rename_branch(parse_request(request.data)?)
            }
            WsAction::GitChangedFiles => {
                self.handle_git_changed_files(parse_request(request.data)?)
            }
            WsAction::GitFileDiff => self.handle_git_file_diff(parse_request(request.data)?),
            WsAction::GitGenerateCommitMessage => {
                self.handle_git_generate_commit_message(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::GitCommit => self.handle_git_commit(parse_request(request.data)?),
            WsAction::GitPush => self.handle_git_push(parse_request(request.data)?),
            WsAction::GitStage => self.handle_git_stage(parse_request(request.data)?),
            WsAction::GitUnstage => self.handle_git_unstage(parse_request(request.data)?),
            WsAction::GitDiscardUnstaged => {
                self.handle_git_discard_unstaged(parse_request(request.data)?)
            }
            WsAction::GitDiscardUntracked => {
                self.handle_git_discard_untracked(parse_request(request.data)?)
            }
            WsAction::GitPull => self.handle_git_pull(parse_request(request.data)?),
            WsAction::GitFetch => self.handle_git_fetch(parse_request(request.data)?),
            WsAction::GitSync => self.handle_git_sync(parse_request(request.data)?),
            WsAction::GitLog => self.handle_git_log(parse_request(request.data)?),

            // Usage
            WsAction::UsageGetOverview => {
                self.handle_usage_get_overview(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetProviderSwitch => {
                self.handle_usage_set_provider_switch(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetProviderFooterCarousel => {
                self.handle_usage_set_provider_footer_carousel(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetAllProvidersSwitch => {
                self.handle_usage_set_all_providers_switch(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetProviderManualSetup => {
                self.handle_usage_set_provider_manual_setup(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageAddProviderApiKey => {
                self.handle_usage_add_provider_api_key(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageDeleteProviderApiKey => {
                self.handle_usage_delete_provider_api_key(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetAutoRefresh => {
                self.handle_usage_set_auto_refresh(parse_request(request.data)?)
                    .await
            }

            // Project
            WsAction::ProjectList => self.handle_project_list().await,
            WsAction::ProjectCreate => {
                self.handle_project_create(parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectUpdate => {
                self.handle_project_update(parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectUpdateTargetBranch => {
                self.handle_project_update_target_branch(parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectUpdateOrder => {
                self.handle_project_update_order(parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectDelete => {
                self.handle_project_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectValidatePath => {
                self.handle_fs_validate_git_path(parse_request(request.data)?)
            }

            // Script
            WsAction::ScriptGet => self.handle_script_get(parse_request(request.data)?).await,
            WsAction::ScriptSave => self.handle_script_save(parse_request(request.data)?).await,

            // Workspace
            WsAction::WorkspaceList => {
                self.handle_workspace_list(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceCreate => {
                self.handle_workspace_create(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdateName => {
                self.handle_workspace_update_name(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdateBranch => {
                self.handle_workspace_update_branch(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdateWorkflowStatus => {
                self.handle_workspace_update_workflow_status(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdatePriority => {
                self.handle_workspace_update_priority(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelList => self.handle_workspace_label_list().await,
            WsAction::WorkspaceLabelCreate => {
                self.handle_workspace_label_create(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelUpdate => {
                self.handle_workspace_label_update(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdateLabels => {
                self.handle_workspace_update_labels(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdateOrder => {
                self.handle_workspace_update_order(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceMarkVisited => {
                self.handle_workspace_mark_visited(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceDelete => {
                self.handle_workspace_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspacePin => {
                self.handle_workspace_pin(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUnpin => {
                self.handle_workspace_unpin(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUpdatePinOrder => {
                self.handle_workspace_update_pin_order(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceArchive => {
                self.handle_workspace_archive(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceUnarchive => {
                self.handle_workspace_unarchive(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceListArchived => self.handle_workspace_list_archived().await,
            WsAction::WorkspaceRetrySetup => {
                self.handle_workspace_retry_setup(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceSkipSetupStep => {
                self.handle_workspace_skip_setup_step(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceSkipSetupScript => {
                self.handle_workspace_skip_setup_script(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceConfirmTodos => {
                self.handle_workspace_confirm_todos(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::ProjectCheckCanDelete => {
                self.handle_project_check_can_delete(parse_request(request.data)?)
                    .await
            }

            // Review
            WsAction::ReviewSessionList => {
                self.handle_review_session_list(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionGet => {
                self.handle_review_session_get(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionCreate => {
                self.handle_review_session_create(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionClose => {
                self.handle_review_session_close(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionArchive => {
                self.handle_review_session_archive(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionActivate => {
                self.handle_review_session_activate(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewSessionRename => {
                self.handle_review_session_rename(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewFileList => {
                self.handle_review_file_list(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewFileContentGet => {
                self.handle_review_file_content_get(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewFileSetReviewed => {
                self.handle_review_file_set_reviewed(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewCommentList => {
                self.handle_review_comment_list(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewCommentCreate => {
                self.handle_review_comment_create(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewCommentUpdateStatus => {
                self.handle_review_comment_update_status(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewMessageAdd => {
                self.handle_review_message_add(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewMessageUpdate => {
                self.handle_review_message_update(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewMessageDelete => {
                self.handle_review_message_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewAgentRunList => {
                self.handle_review_agent_run_list(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewAgentRunCreate => {
                self.handle_review_agent_run_create(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewAgentRunArtifactGet => {
                self.handle_review_agent_run_artifact_get(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewAgentRunFinalize => {
                self.handle_review_agent_run_finalize(parse_request(request.data)?)
                    .await
            }
            WsAction::ReviewAgentRunSetStatus => {
                self.handle_review_agent_run_set_status(parse_request(request.data)?)
                    .await
            }

            // Skills
            WsAction::SkillsList => self.handle_skills_list().await,
            WsAction::SkillsGet => self.handle_skills_get(parse_request(request.data)?).await,
            WsAction::SkillsSetEnabled => {
                self.handle_skills_set_enabled(parse_request(request.data)?)
                    .await
            }
            WsAction::SkillsDelete => {
                self.handle_skills_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::WikiSkillInstall => self.handle_wiki_skill_install().await,
            WsAction::WikiSkillSystemStatus => self.handle_wiki_skill_system_status().await,
            WsAction::CodeReviewSkillSystemStatus => {
                self.handle_code_review_skill_system_status().await
            }
            WsAction::GitCommitSkillSystemStatus => {
                self.handle_git_commit_skill_system_status().await
            }
            WsAction::SyncSingleSystemSkill => {
                self.handle_sync_single_system_skill(parse_request(request.data)?)
                    .await
            }
            WsAction::SkillsSystemSync => self.handle_skills_system_sync().await,
            WsAction::AgentList => self.handle_agent_list().await,
            WsAction::AgentInstall => {
                self.handle_agent_install(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentConfigGet => {
                self.handle_agent_config_get(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentConfigSet => {
                self.handle_agent_config_set(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentRegistryList => {
                self.handle_agent_registry_list(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentRegistryInstall => {
                self.handle_agent_registry_install(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentRegistryRemove => {
                self.handle_agent_registry_remove(parse_request(request.data)?)
                    .await
            }
            WsAction::CustomAgentList => self.handle_custom_agent_list().await,
            WsAction::CustomAgentAdd => {
                self.handle_custom_agent_add(parse_request(request.data)?)
                    .await
            }
            WsAction::CustomAgentRemove => {
                self.handle_custom_agent_remove(parse_request(request.data)?)
                    .await
            }
            WsAction::CustomAgentGetJson => self.handle_custom_agent_get_json().await,
            WsAction::CustomAgentSetJson => {
                self.handle_custom_agent_set_json(parse_request(request.data)?)
                    .await
            }
            WsAction::CustomAgentGetManifestPath => {
                self.handle_custom_agent_get_manifest_path().await
            }

            // GitHub
            WsAction::GithubPrList => {
                self.handle_github_pr_list(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrDetail => {
                self.handle_github_pr_detail(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrDetailSidebar => {
                self.handle_github_pr_detail_sidebar(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrTimelinePage => {
                self.handle_github_pr_timeline_page(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrCreate => {
                self.handle_github_pr_create(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrMerge => {
                self.handle_github_pr_merge(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrClose => {
                self.handle_github_pr_close(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrReopen => {
                self.handle_github_pr_reopen(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrComment => {
                self.handle_github_pr_comment(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrReady => {
                self.handle_github_pr_ready(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrOpenBrowser => {
                self.handle_github_pr_open_browser(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrDraft => {
                self.handle_github_pr_draft(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueList => {
                self.handle_github_issue_list(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueGet => {
                self.handle_github_issue_get(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrListRepo => {
                self.handle_github_pr_list_repo(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrGet => {
                self.handle_github_pr_get(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubCiStatus => {
                self.handle_github_ci_status(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubCiOpenBrowser => {
                self.handle_github_ci_open_browser(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubActionsList => {
                self.handle_github_actions_list(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubActionsRerun => {
                self.handle_github_actions_rerun(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubActionsDetail => {
                self.handle_github_actions_detail(parse_request(request.data)?)
                    .await
            }

            // Function settings
            WsAction::FunctionSettingsGet => self.handle_function_settings_get().await,
            WsAction::FunctionSettingsUpdate => {
                self.handle_function_settings_update(parse_request(request.data)?)
                    .await
            }
            WsAction::LlmProvidersGet => self.handle_llm_providers_get().await,
            WsAction::LlmProvidersUpdate => {
                self.handle_llm_providers_update(parse_request(request.data)?)
                    .await
            }
            WsAction::LlmProviderTest => {
                self.handle_llm_provider_test(conn_id, parse_request(request.data)?)
                    .await
            }

            // Code Agent Custom Settings
            WsAction::CodeAgentCustomGet => self.handle_code_agent_custom_get().await,
            WsAction::CodeAgentCustomUpdate => {
                self.handle_code_agent_custom_update(parse_request(request.data)?)
                    .await
            }
            WsAction::AgentBehaviourSettingsGet => self.handle_agent_behaviour_settings_get().await,
            WsAction::AgentBehaviourSettingsUpdate => {
                self.handle_agent_behaviour_settings_update(parse_request(request.data)?)
                    .await
            }

            // Notification settings are managed via REST endpoints (/hooks/notification/*)
            WsAction::NotificationSettingsGet
            | WsAction::NotificationSettingsUpdate
            | WsAction::NotificationTestPush => Err(ServiceError::Processing(
                "Notification settings are managed via REST API at /hooks/notification/*".into(),
            )),

            // ===== Local Model =====
            WsAction::LocalModelList => self.handle_local_model_list().await,
            WsAction::LocalModelDownload => {
                self.handle_local_model_download(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelStart => {
                self.handle_local_model_start(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelStop => self.handle_local_model_stop(conn_id).await,
            WsAction::LocalModelDelete => {
                self.handle_local_model_delete(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelStatus => self.handle_local_model_status().await,
        }
    }

    // ===== File System Handlers =====

    fn handle_fs_get_home_dir(&self) -> Result<Value> {
        let home = self.fs_engine.get_home_dir()?;
        Ok(json!({ "path": home.to_string_lossy() }))
    }

    fn handle_fs_list_dir(&self, req: FsListDirRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;

        let entries = if req.ignore_not_found && !path.exists() {
            Vec::new()
        } else {
            self.fs_engine
                .list_dir(&path, req.dirs_only, req.show_hidden)?
        };

        let parent_path = self.fs_engine.get_parent(&path);

        let entries_json: Vec<Value> = entries
            .into_iter()
            .map(|e| {
                json!({
                    "name": e.name,
                    "path": e.path.to_string_lossy(),
                    "is_dir": e.is_dir,
                    "is_symlink": e.is_symlink,
                    "is_ignored": e.is_ignored,
                    "symlink_target": e.symlink_target,
                    "is_git_repo": e.is_git_repo,
                })
            })
            .collect();

        Ok(json!({
            "path": path.to_string_lossy(),
            "parent_path": parent_path.map(|p| p.to_string_lossy().to_string()),
            "entries": entries_json,
        }))
    }

    fn handle_fs_validate_git_path(&self, req: FsValidateGitPathRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let result = self.fs_engine.validate_git_path(&path);

        Ok(json!({
            "is_valid": result.is_valid,
            "is_git_repo": result.is_git_repo,
            "suggested_name": result.suggested_name,
            "default_branch": result.default_branch,
            "error": result.error,
        }))
    }

    fn handle_fs_read_file(&self, req: FsReadFileRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;

        // 检查文件是否存在，不存在时返回正常响应而非错误
        if !path.exists() {
            return Ok(json!({
                "path": path.to_string_lossy(),
                "exists": false,
                "content": null,
                "size": 0,
            }));
        }

        let (content, size) = self.fs_engine.read_file(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "exists": true,
            "content": content,
            "size": size,
        }))
    }

    fn handle_fs_write_file(&self, req: FsWriteFileRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.write_file(&path, &req.content)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    fn handle_fs_create_dir(&self, req: FsCreateDirRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.create_dir(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    fn handle_fs_rename_path(&self, req: FsRenamePathRequest) -> Result<Value> {
        let from = self.fs_engine.expand_path(&req.from)?;
        let to = self.fs_engine.expand_path(&req.to)?;
        self.fs_engine.rename_path(&from, &to)?;

        Ok(json!({
            "from": from.to_string_lossy(),
            "to": to.to_string_lossy(),
            "success": true,
        }))
    }

    fn handle_fs_delete_path(&self, req: FsDeletePathRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.fs_engine.delete_path(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
            "success": true,
        }))
    }

    fn handle_fs_duplicate_path(&self, req: FsDuplicatePathRequest) -> Result<Value> {
        let from = self.fs_engine.expand_path(&req.from)?;
        let to = self.fs_engine.expand_path(&req.to)?;
        self.fs_engine.duplicate_path(&from, &to)?;

        Ok(json!({
            "from": from.to_string_lossy(),
            "to": to.to_string_lossy(),
            "success": true,
        }))
    }

    fn handle_fs_list_project_files(&self, req: FsListProjectFilesRequest) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let tree = self
            .fs_engine
            .list_project_files(&root_path, req.show_hidden)?;

        fn convert_tree(items: Vec<core_engine::FileTreeItem>) -> Vec<Value> {
            items
                .into_iter()
                .map(|item| {
                    json!({
                        "name": item.name,
                        "path": item.path.to_string_lossy(),
                        "is_dir": item.is_dir,
                        "is_symlink": item.is_symlink,
                        "is_ignored": item.is_ignored,
                        "symlink_target": item.symlink_target,
                        "children": item.children.map(convert_tree),
                    })
                })
                .collect()
        }

        Ok(json!({
            "root_path": root_path.to_string_lossy(),
            "tree": convert_tree(tree),
        }))
    }

    fn handle_fs_search_content(&self, req: FsSearchContentRequest) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let result = core_engine::search_content(
            &root_path,
            &req.query,
            req.max_results,
            req.case_sensitive,
        )
        .map_err(|e| ServiceError::Validation(format!("Search failed: {}", e)))?;

        let matches: Vec<Value> = result
            .matches
            .into_iter()
            .map(|m| {
                json!({
                    "file_path": m.file_path,
                    "line_number": m.line_number,
                    "line_content": m.line_content,
                    "match_start": m.match_start,
                    "match_end": m.match_end,
                    "context_before": m.context_before,
                    "context_after": m.context_after,
                })
            })
            .collect();

        Ok(json!({
            "matches": matches,
            "truncated": result.truncated,
        }))
    }

    fn handle_fs_search_dirs(&self, req: FsSearchDirsRequest) -> Result<Value> {
        let root_path = self.fs_engine.expand_path(&req.root_path)?;
        let entries = self
            .fs_engine
            .search_dirs(&root_path, &req.query, req.max_results, req.max_depth)
            .map_err(|e| ServiceError::Validation(format!("Search failed: {}", e)))?;

        let entries_json: Vec<Value> = entries
            .into_iter()
            .map(|e| {
                json!({
                    "name": e.name,
                    "path": e.path.to_string_lossy(),
                    "is_dir": e.is_dir,
                    "is_symlink": e.is_symlink,
                    "is_ignored": e.is_ignored,
                    "symlink_target": e.symlink_target,
                    "is_git_repo": e.is_git_repo,
                })
            })
            .collect();

        Ok(json!({
            "entries": entries_json,
        }))
    }

    // ===== App Handlers =====

    fn handle_app_open(&self, req: AppOpenRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.app_engine
            .open_with_app(&req.app_name, &path.to_string_lossy())
            .map_err(|e| ServiceError::Validation(format!("Failed to open app: {}", e)))?;

        Ok(json!({
            "success": true,
            "app_name": req.app_name,
            "path": path.to_string_lossy(),
        }))
    }

    // ===== Git Handlers =====

    fn handle_git_get_status(&self, req: GitGetStatusRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let status = self
            .git_engine
            .get_git_status(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to get git status: {}", e)))?;

        let current_branch = self.git_engine.get_current_branch(&path).ok();

        let remote_url = self.git_engine.get_remote_url(&path).unwrap_or_default();
        let github_info = core_engine::GithubEngine::parse_github_remote(&remote_url);
        let github_owner = github_info.as_ref().map(|x| x.0.clone());
        let github_repo = github_info.as_ref().map(|x| x.1.clone());

        Ok(json!({
            "has_uncommitted_changes": status.has_uncommitted_changes,
            "has_merge_conflicts": status.has_merge_conflicts,
            "has_unpushed_commits": status.has_unpushed_commits,
            "uncommitted_count": status.uncommitted_count,
            "unpushed_count": status.unpushed_count,
            "upstream_behind_count": status.upstream_behind_count,
            "default_branch": status.default_branch,
            "default_branch_ahead": status.default_branch_ahead,
            "default_branch_behind": status.default_branch_behind,
            "current_branch": current_branch,
            "github_owner": github_owner,
            "github_repo": github_repo,
        }))
    }

    fn handle_git_get_head_commit(&self, req: GitGetHeadCommitRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let commit_hash = self
            .git_engine
            .get_head_commit(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to get HEAD commit: {}", e)))?;
        Ok(json!({ "commit_hash": commit_hash }))
    }

    fn handle_git_get_commit_count(&self, req: GitGetCommitCountRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let count = self
            .git_engine
            .get_commit_count(&path, &req.base_commit, &req.head_commit)
            .map_err(|e| ServiceError::Validation(format!("Failed to get commit count: {}", e)))?;
        Ok(json!({ "count": count }))
    }

    fn handle_git_list_branches(&self, req: GitListBranchesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let branches = self
            .git_engine
            .list_branches(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to list branches: {}", e)))?;

        Ok(json!({ "branches": branches }))
    }

    fn handle_git_list_remote_branches(&self, req: GitListBranchesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let branches = self.git_engine.list_remote_branches(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to list remote branches: {}", e))
        })?;

        Ok(json!({ "branches": branches }))
    }

    fn handle_git_rename_branch(&self, req: GitRenameBranchRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .rename_branch(&path, &req.old_name, &req.new_name)
            .map_err(|e| ServiceError::Validation(format!("Failed to rename branch: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_changed_files(&self, req: GitChangedFilesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let info = self
            .git_engine
            .get_changed_files(&path, req.base_branch.as_deref(), req.use_preferred_compare)
            .map_err(|e| ServiceError::Validation(format!("Failed to get changed files: {}", e)))?;

        let convert_file = |f: core_engine::ChangedFileInfo| -> Value {
            json!({
                "path": f.path,
                "status": f.status,
                "additions": f.additions,
                "deletions": f.deletions,
                "staged": f.staged,
            })
        };

        let staged_files: Vec<Value> = info.staged_files.into_iter().map(convert_file).collect();
        let unstaged_files: Vec<Value> =
            info.unstaged_files.into_iter().map(convert_file).collect();
        let untracked_files: Vec<Value> =
            info.untracked_files.into_iter().map(convert_file).collect();

        // Also check if branch is published
        let is_branch_published = self.git_engine.is_branch_published(&path).unwrap_or(true);

        Ok(json!({
            "staged_files": staged_files,
            "unstaged_files": unstaged_files,
            "untracked_files": untracked_files,
            "total_additions": info.total_additions,
            "total_deletions": info.total_deletions,
            "is_branch_published": is_branch_published,
            "compare_ref": info.compare_ref,
        }))
    }

    fn handle_git_file_diff(&self, req: GitFileDiffRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let diff = self
            .git_engine
            .get_file_diff(&path, &req.file_path, req.base_branch.as_deref())
            .map_err(|e| ServiceError::Validation(format!("Failed to get file diff: {}", e)))?;

        Ok(json!({
            "file_path": diff.file_path,
            "old_content": diff.old_content,
            "new_content": diff.new_content,
            "status": diff.status,
            "compare_ref": diff.compare_ref,
        }))
    }

    async fn handle_git_generate_commit_message(
        &self,
        conn_id: &str,
        req: GitGenerateCommitMessageRequest,
    ) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let changes = self
            .git_engine
            .get_changed_files(&path, None, false)
            .map_err(|e| ServiceError::Validation(format!("Failed to get changed files: {}", e)))?;

        let repo_name = path.file_name().and_then(|value| value.to_str());
        let generator = GitCommitMessageGenerator::new()?;

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            staged_files = changes.staged_files.len(),
            unstaged_files = changes.unstaged_files.len(),
            untracked_files = changes.untracked_files.len(),
            "starting git commit message generation"
        );

        let ws_manager = self.ws_manager.get().cloned();

        let mut rx = match generator.generate_stream(repo_name, &changes).await {
            Ok(rx) => rx,
            Err(error) => {
                tracing::error!(
                    conn_id,
                    repo_path = %path.display(),
                    repo_name = repo_name.unwrap_or("unknown"),
                    "failed to start git commit message stream: {}",
                    error
                );
                return Err(error);
            }
        };
        let mut full_message = String::new();
        let started_at = Instant::now();
        let mut chunk_count = 0usize;

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            "git commit message stream receiver ready"
        );

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    chunk_count += 1;
                    full_message.push_str(&chunk);
                    if let Some(ref mgr) = ws_manager {
                        let notification = infra::WsMessage::notification(
                            infra::WsEvent::GitCommitMessageChunk,
                            json!({ "chunk": chunk }),
                        );
                        let _ = mgr.send_to(conn_id, &notification).await;
                    }
                }
                Err(e) => {
                    tracing::error!(
                        conn_id,
                        repo_path = %path.display(),
                        repo_name = repo_name.unwrap_or("unknown"),
                        chunk_count,
                        partial_chars = full_message.chars().count(),
                        elapsed_ms = started_at.elapsed().as_millis(),
                        "git commit message streaming failed: {}",
                        e
                    );
                    return Err(ServiceError::Validation(format!(
                        "Failed to generate git commit message: {e}"
                    )));
                }
            }
        }

        let message = full_message.trim().to_string();
        if message.is_empty() {
            tracing::error!(
                conn_id,
                repo_path = %path.display(),
                repo_name = repo_name.unwrap_or("unknown"),
                chunk_count,
                partial_chars = full_message.chars().count(),
                elapsed_ms = started_at.elapsed().as_millis(),
                "git commit message stream completed with empty output"
            );
            return Err(ServiceError::Validation(
                "LLM provider returned an empty git commit message".to_string(),
            ));
        }

        tracing::info!(
            conn_id,
            repo_path = %path.display(),
            repo_name = repo_name.unwrap_or("unknown"),
            chunk_count,
            message_chars = message.chars().count(),
            elapsed_ms = started_at.elapsed().as_millis(),
            "git commit message stream completed"
        );

        Ok(json!({
            "message": message,
        }))
    }

    fn handle_git_commit(&self, req: GitCommitRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let hash = self
            .git_engine
            .commit_all(&path, &req.message)
            .map_err(|e| ServiceError::Validation(format!("Failed to commit: {}", e)))?;

        Ok(json!({
            "success": true,
            "commit_hash": hash,
        }))
    }

    fn handle_git_push(&self, req: GitPushRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .push(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to push: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_stage(&self, req: GitStageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .stage_files(&path, &req.files)
            .map_err(|e| ServiceError::Validation(format!("Failed to stage files: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_unstage(&self, req: GitUnstageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .unstage_files(&path, &req.files)
            .map_err(|e| ServiceError::Validation(format!("Failed to unstage files: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_discard_unstaged(&self, req: GitDiscardUnstagedRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .discard_unstaged(&path, &req.files)
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to discard unstaged changes: {}", e))
            })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_discard_untracked(&self, req: GitDiscardUntrackedRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .discard_untracked(&path, &req.files)
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to discard untracked files: {}", e))
            })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_pull(&self, req: GitPullRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .pull(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to pull: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_fetch(&self, req: GitFetchRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .fetch(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to fetch: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_sync(&self, req: GitSyncRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine
            .sync(&path)
            .map_err(|e| ServiceError::Validation(format!("Failed to sync: {}", e)))?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_log(&self, req: GitLogRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let commits = self
            .git_engine
            .get_commit_log(&path, req.limit, req.offset)
            .map_err(|e| ServiceError::Validation(format!("Failed to get git log: {}", e)))?;

        let commits_json: Vec<Value> = commits
            .into_iter()
            .map(|c| {
                json!({
                    "hash": c.hash,
                    "short_hash": c.short_hash,
                    "author_name": c.author_name,
                    "author_email": c.author_email,
                    "timestamp": c.timestamp,
                    "subject": c.subject,
                    "body": c.body,
                    "is_pushed": c.is_pushed,
                    "author_avatar_url": c.author_avatar_url,
                })
            })
            .collect();

        Ok(json!({ "commits": commits_json }))
    }

    // ===== Usage Handlers =====

    async fn handle_usage_get_overview(&self, req: UsageOverviewRequest) -> Result<Value> {
        let overview = self
            .usage_service
            .get_overview(req.refresh, req.provider_id.as_deref())
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_set_provider_switch(
        &self,
        req: UsageProviderSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_switch(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_set_provider_footer_carousel(
        &self,
        req: UsageProviderFooterCarouselRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_footer_carousel_show(&req.provider_id, req.enabled)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_set_all_providers_switch(
        &self,
        req: UsageAllProvidersSwitchRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_all_provider_switch(req.enabled)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_set_provider_manual_setup(
        &self,
        req: UsageProviderManualSetupRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .set_provider_manual_setup(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_add_provider_api_key(
        &self,
        req: UsageAddProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .add_provider_api_key(&req.provider_id, req.region, req.api_key)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_delete_provider_api_key(
        &self,
        req: UsageDeleteProviderApiKeyRequest,
    ) -> Result<Value> {
        let overview = self
            .usage_service
            .delete_provider_api_key(&req.provider_id, &req.key_id)
            .await;
        Ok(json!(overview))
    }

    async fn handle_usage_set_auto_refresh(&self, req: UsageAutoRefreshRequest) -> Result<Value> {
        let overview = self
            .usage_service
            .set_auto_refresh_interval(req.interval_minutes)
            .await
            .map_err(ServiceError::Validation)?;
        Ok(json!(overview))
    }

    // ===== Project Handlers =====

    async fn handle_project_list(&self) -> Result<Value> {
        let projects = self.project_service.list_projects().await?;
        Ok(json!(projects))
    }

    async fn handle_project_create(&self, req: ProjectCreateRequest) -> Result<Value> {
        let project = self
            .project_service
            .create_project(
                req.name,
                req.main_file_path,
                req.sidebar_order,
                req.border_color,
            )
            .await?;
        Ok(json!(project))
    }

    async fn handle_project_update(&self, req: ProjectUpdateRequest) -> Result<Value> {
        if let Some(color) = req.border_color {
            self.project_service
                .update_color(req.guid.clone(), Some(color))
                .await?;
        }
        // TODO: Add name and sidebar_order update support in ProjectService
        Ok(json!({ "success": true }))
    }

    async fn handle_project_delete(&self, req: ProjectDeleteRequest) -> Result<Value> {
        let guid = req.guid;

        // Gather cleanup info BEFORE soft-deleting
        let cleanup_info = self.project_service.get_project_cleanup_info(&guid).await?;

        // Validate + soft-delete DB records
        self.project_service.delete_project(guid.clone()).await?;

        // Clean up terminals for all workspaces
        for ws in &cleanup_info.workspaces {
            if let Ok(session_name) = self
                .workspace_service
                .resolve_tmux_session_name(&ws.guid, &self.terminal_service.tmux_engine())
                .await
            {
                self.terminal_service
                    .cleanup_workspace_terminal_state(&ws.guid, &session_name)
                    .await;
            }
        }

        // Spawn background task for git worktree cleanup
        if let Some(manager) = self.ws_manager.get().cloned() {
            let settings = WorkspaceDeleteSettings::load();
            let project_id = cleanup_info.project_id.clone();

            if cleanup_info.workspaces.is_empty() {
                Self::send_project_delete_progress(
                    &manager,
                    ProjectDeleteProgressNotification {
                        project_id,
                        step: "completed".into(),
                        message: "Project deleted (no workspaces to clean up)".into(),
                        success: true,
                    },
                )
                .await;
            } else {
                tokio::spawn(async move {
                    Self::execute_project_cleanup(manager, cleanup_info, settings).await;
                });
            }
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_project_update_target_branch(
        &self,
        req: ProjectUpdateTargetBranchRequest,
    ) -> Result<Value> {
        self.project_service
            .update_target_branch(req.guid, req.target_branch)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_project_update_order(&self, req: ProjectUpdateOrderRequest) -> Result<Value> {
        self.project_service
            .update_order(req.guid, req.sidebar_order)
            .await?;
        Ok(json!({ "success": true }))
    }

    // ===== Script Handlers =====

    async fn handle_script_get(&self, req: ScriptGetRequest) -> Result<Value> {
        let project = self.project_service.get_project(req.project_guid).await?;
        if let Some(project) = project {
            let scripts_path =
                std::path::Path::new(&project.main_file_path).join(".atmos/scripts/atmos.json");

            if scripts_path.exists() {
                let (content, _) = self.fs_engine.read_file(&scripts_path)?;
                let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));
                Ok(json)
            } else {
                Ok(json!({}))
            }
        } else {
            Err(ServiceError::Validation("Project not found".to_string()))
        }
    }

    async fn handle_script_save(&self, req: ScriptSaveRequest) -> Result<Value> {
        let project = self.project_service.get_project(req.project_guid).await?;
        if let Some(project) = project {
            let scripts_path =
                std::path::Path::new(&project.main_file_path).join(".atmos/scripts/atmos.json");

            // Ensure directory exists
            if let Some(parent) = scripts_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    ServiceError::Validation(format!("Failed to create script directory: {}", e))
                })?;
            }

            let content = serde_json::to_string_pretty(&req.scripts)
                .map_err(|e| ServiceError::Validation(format!("Invalid script JSON: {}", e)))?;
            self.fs_engine.write_file(&scripts_path, &content)?;
            Ok(json!({ "success": true }))
        } else {
            Err(ServiceError::Validation("Project not found".to_string()))
        }
    }

    // ===== Workspace Handlers =====

    async fn handle_workspace_list(&self, req: WorkspaceListRequest) -> Result<Value> {
        let workspaces = self
            .workspace_service
            .list_by_project(req.project_guid)
            .await?;
        Ok(json!(workspaces))
    }

    async fn handle_workspace_create(
        &self,
        conn_id: &str,
        req: WorkspaceCreateRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .create_workspace(
                req.project_guid.clone(),
                req.display_name.or_else(|| {
                    let trimmed = req.name.trim().to_string();
                    (!trimmed.is_empty()).then_some(trimmed)
                }),
                req.branch,
                req.base_branch.clone(),
                req.sidebar_order,
                req.github_issue.clone(),
                req.github_pr.clone(),
                req.auto_extract_todos,
                req.priority,
                req.workflow_status,
                req.label_guids,
            )
            .await?;

        // Initialize the project's target branch only if it is still unset.
        if let Err(e) = self
            .project_service
            .update_target_branch_if_null(
                req.project_guid.clone(),
                workspace.model.base_branch.clone(),
            )
            .await
        {
            tracing::warn!("Failed to initialize target branch: {e}");
        }

        if let Err(error) = self
            .workspace_service
            .ensure_worktree_ready(workspace.model.guid.clone())
            .await
        {
            tracing::error!(
                "[handle_workspace_create] Failed to prepare worktree for {}: {}",
                workspace.model.guid,
                error
            );

            if let Err(cleanup_error) = self
                .workspace_service
                .soft_delete_workspace(&workspace.model.guid)
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to clean up workspace {} after worktree error: {}",
                    workspace.model.guid,
                    cleanup_error
                );
            }

            return Err(error.into());
        }

        // Persist composer-supplied attachments under .atmos/attachments/.
        if !req.attachments.is_empty() {
            if let Err(error) = self
                .workspace_service
                .write_workspace_attachments(workspace.model.guid.clone(), req.attachments.clone())
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to write attachments for {}: {}",
                    workspace.model.guid,
                    error
                );
            }
        }

        // The composer already supplied the GitHub issue/PR (or initial
        // requirement) at create time, so pre-fill .atmos/context/requirement.md
        // synchronously here. The setup state machine no longer surfaces a
        // separate "Fill Requirement Spec" step.
        if req.github_issue.is_some()
            || req.github_pr.is_some()
            || req
                .initial_requirement
                .as_deref()
                .map(str::trim)
                .map(|value| !value.is_empty())
                .unwrap_or(false)
        {
            if let Err(error) = self
                .workspace_service
                .write_workspace_requirement(
                    workspace.model.guid.clone(),
                    req.initial_requirement.clone(),
                    req.github_issue.clone(),
                    req.github_pr.clone(),
                )
                .await
            {
                tracing::warn!(
                    "[handle_workspace_create] Failed to pre-fill requirement.md for {}: {}",
                    workspace.model.guid,
                    error
                );
            }
        }

        let next_setup_step = Self::build_workspace_setup_plan(
            &self.project_service,
            &req.project_guid,
            req.initial_requirement.as_deref(),
            workspace.github_issue.as_ref(),
            workspace.github_pr.is_some(),
            req.auto_extract_todos,
        )
        .await
        .and_then(|plan| {
            plan.steps
                .into_iter()
                .find(|step| *step != WorkspaceSetupStep::CreateWorktree)
        })
        .or(Some(WorkspaceSetupStep::Ready));

        // Spawn the remaining setup steps in background after the worktree is ready.
        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = req.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let initial_requirement = req.initial_requirement.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = req.auto_extract_todos;

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    initial_requirement,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    next_setup_step,
                )
                .await;
            });
        } else {
            tracing::error!(
                "[handle_workspace_create] WsManager not available, cannot run workspace setup for {}",
                workspace.model.guid
            );
        }

        Ok(json!(workspace))
    }

    async fn handle_workspace_update_name(&self, req: WorkspaceUpdateNameRequest) -> Result<Value> {
        self.workspace_service
            .update_display_name(req.guid, req.name)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_update_branch(
        &self,
        req: WorkspaceUpdateBranchRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_branch(req.guid, req.branch)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_update_workflow_status(
        &self,
        req: WorkspaceUpdateWorkflowStatusRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_workflow_status(req.guid, req.workflow_status)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_update_priority(
        &self,
        req: WorkspaceUpdatePriorityRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_priority(req.guid, req.priority)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_label_list(&self) -> Result<Value> {
        let labels = self.workspace_service.list_labels().await?;
        Ok(json!(labels))
    }

    async fn handle_workspace_label_create(
        &self,
        req: WorkspaceLabelCreateRequest,
    ) -> Result<Value> {
        let label = self
            .workspace_service
            .create_label(req.name, req.color)
            .await?;
        Ok(json!(label))
    }

    async fn handle_workspace_label_update(
        &self,
        req: WorkspaceLabelUpdateRequest,
    ) -> Result<Value> {
        let label = self
            .workspace_service
            .update_label(req.guid, req.name, req.color)
            .await?;
        Ok(json!(label))
    }

    async fn handle_workspace_update_labels(
        &self,
        req: WorkspaceUpdateLabelsRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_labels(req.guid, req.label_guids)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_update_order(
        &self,
        req: WorkspaceUpdateOrderRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_order(req.guid, req.sidebar_order)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_mark_visited(
        &self,
        req: WorkspaceMarkVisitedRequest,
    ) -> Result<Value> {
        self.workspace_service.mark_visited(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_delete(&self, req: WorkspaceDeleteRequest) -> Result<Value> {
        let guid = req.guid;
        let settings = WorkspaceDeleteSettings::load();

        let tmux_session = self
            .workspace_service
            .resolve_tmux_session_name(&guid, &self.terminal_service.tmux_engine())
            .await
            .ok();

        // Get cleanup info before soft-deleting
        let cleanup_info = self
            .workspace_service
            .get_workspace_cleanup_info(&guid)
            .await?;

        // Get workspace data for GitHub PR/Issue close before soft-deleting
        let workspace_data = self
            .workspace_service
            .get_workspace_for_github_cleanup(&guid)
            .await
            .ok()
            .flatten();

        // Soft delete from database first (instant)
        self.workspace_service.soft_delete_workspace(&guid).await?;

        if let Some(session_name) = tmux_session {
            self.terminal_service
                .cleanup_workspace_terminal_state(&guid, &session_name)
                .await;
        }

        // Close GitHub PR/Issue if configured
        if let Some((pr_data, issue_data)) = workspace_data {
            self.cleanup_github_on_delete(&settings, pr_data.as_deref(), issue_data.as_deref())
                .await;
        }

        // Spawn background task for worktree cleanup with progress notifications
        if let Some(manager) = self.ws_manager.get().cloned() {
            let workspace_id = guid.clone();

            if let Some((repo_path_str, workspace_name, branch)) = cleanup_info {
                let delete_remote_branch = settings.delete_remote_branch;
                tokio::spawn(async move {
                    Self::execute_workspace_cleanup(
                        manager,
                        workspace_id,
                        repo_path_str,
                        workspace_name,
                        branch,
                        delete_remote_branch,
                    )
                    .await;
                });
            } else {
                // No worktree to clean up — send completed immediately
                Self::send_workspace_delete_progress(
                    &manager,
                    WorkspaceDeleteProgressNotification {
                        workspace_id,
                        step: "completed".into(),
                        message: "Workspace cleanup completed".into(),
                        success: true,
                    },
                )
                .await;
            }
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_pin(&self, req: WorkspacePinRequest) -> Result<Value> {
        self.workspace_service.pin_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_unpin(&self, req: WorkspaceUnpinRequest) -> Result<Value> {
        self.workspace_service.unpin_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_update_pin_order(
        &self,
        req: WorkspaceUpdatePinOrderRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_workspace_pin_order(req.workspace_ids)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_archive(&self, req: WorkspaceArchiveRequest) -> Result<Value> {
        let guid = req.guid;
        let settings = WorkspaceArchiveSettings::load();

        // Resolve tmux session up-front (workspace still exists in DB at this point).
        let tmux_session = if settings.kill_tmux_on_archive {
            self.workspace_service
                .resolve_tmux_session_name(&guid, &self.terminal_service.tmux_engine())
                .await
                .ok()
        } else {
            None
        };

        // Archive in DB.
        self.workspace_service
            .archive_workspace(guid.clone())
            .await?;

        // Tear down the tmux session and any tracked terminal state.
        if let Some(session_name) = tmux_session {
            self.terminal_service
                .cleanup_workspace_terminal_state(&guid, &session_name)
                .await;
        }

        // Close active ACP sessions for this workspace.
        if settings.close_acp_on_archive {
            self.agent_session_service
                .close_workspace_sessions(&guid)
                .await;
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_unarchive(&self, req: WorkspaceUnarchiveRequest) -> Result<Value> {
        self.workspace_service.unarchive_workspace(req.guid).await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_list_archived(&self) -> Result<Value> {
        let workspaces = self.workspace_service.list_archived_workspaces().await?;

        let mut workspace_entries = Vec::new();
        for ws in workspaces {
            // Skip workspaces whose project has been deleted
            let project = self
                .project_service
                .get_project(ws.model.project_guid.clone())
                .await?;
            let Some(project) = project else {
                continue;
            };

            workspace_entries.push(json!({
                "guid": ws.model.guid,
                "name": ws.model.name,
                "display_name": ws.model.display_name,
                "branch": ws.model.branch,
                "base_branch": ws.model.base_branch,
                "project_guid": ws.model.project_guid,
                "project_name": project.name,
                "archived_at": ws.model.archived_at,
            }));
        }

        Ok(json!({ "workspaces": workspace_entries }))
    }

    async fn handle_project_check_can_delete(
        &self,
        req: ProjectCheckCanDeleteRequest,
    ) -> Result<Value> {
        let response = self
            .project_service
            .check_can_delete_from_archive_modal(req.guid)
            .await?;
        Ok(json!(response))
    }

    async fn handle_workspace_retry_setup(
        &self,
        conn_id: &str,
        req: WorkspaceRetrySetupRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        let failed_step = WorkspaceSetupStep::from_key(&req.failed_step_key).ok_or_else(|| {
            ServiceError::Validation(format!(
                "Unsupported setup step `{}` for retry",
                req.failed_step_key
            ))
        })?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    req.initial_requirement,
                    req.github_issue,
                    false,
                    req.auto_extract_todos,
                    Some(failed_step),
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_skip_setup_script(
        &self,
        conn_id: &str,
        req: WorkspaceSkipSetupScriptRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let workspace_id = workspace.model.guid.clone();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    None,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(WorkspaceSetupStep::Ready),
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_skip_setup_step(
        &self,
        conn_id: &str,
        req: WorkspaceSkipSetupStepRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        let failed_step = WorkspaceSetupStep::from_key(&req.failed_step_key).ok_or_else(|| {
            ServiceError::Validation(format!(
                "Unsupported setup step `{}` for skip",
                req.failed_step_key
            ))
        })?;

        if failed_step == WorkspaceSetupStep::CreateWorktree {
            return Err(ServiceError::Validation(
                "Cannot skip workspace creation because the workspace directory is required"
                    .to_string(),
            ));
        }

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let workspace_id = workspace.model.guid.clone();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();
            let initial_requirement = req.initial_requirement.clone();
            let github_issue = req.github_issue.or(workspace.github_issue.clone());
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = req.auto_extract_todos || workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                let start_step = Self::build_workspace_setup_plan(
                    &project_service,
                    &project_guid,
                    initial_requirement.as_deref(),
                    github_issue.as_ref(),
                    has_github_pr,
                    auto_extract_todos,
                )
                .await
                .and_then(|plan| {
                    plan.steps
                        .iter()
                        .position(|candidate| *candidate == failed_step)
                        .and_then(|index| plan.steps.get(index + 1).copied())
                })
                .unwrap_or(WorkspaceSetupStep::Ready);

                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    initial_requirement,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(start_step),
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_confirm_todos(
        &self,
        conn_id: &str,
        req: WorkspaceConfirmTodosRequest,
    ) -> Result<Value> {
        let workspace = self
            .workspace_service
            .get_workspace(req.guid.clone())
            .await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;

        self.workspace_service
            .write_workspace_task_markdown(req.guid.clone(), req.markdown)
            .await?;

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_service = self.workspace_service.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_id = workspace.model.guid.clone();
            let workspace_name = workspace.model.name.clone();
            let github_issue = workspace.github_issue.clone();
            let has_github_pr = workspace.github_pr.is_some();
            let auto_extract_todos = workspace.model.auto_extract_todos;

            tokio::spawn(async move {
                Self::execute_setup_state_machine(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    None,
                    github_issue,
                    has_github_pr,
                    auto_extract_todos,
                    Some(WorkspaceSetupStep::RunSetupScript),
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    // ===== Setup Process Helper =====

    async fn build_workspace_setup_plan(
        project_service: &Arc<ProjectService>,
        project_guid: &str,
        _initial_requirement: Option<&str>,
        github_issue: Option<&GithubIssuePayload>,
        has_github_pr: bool,
        auto_extract_todos: bool,
    ) -> Option<WorkspaceSetupPlan> {
        let project = project_service
            .get_project(project_guid.to_string())
            .await
            .ok()
            .flatten()?;

        let has_requirement_step = github_issue.is_some();

        let project_root = std::path::Path::new(&project.main_file_path);
        let scripts_path = project_root.join(".atmos/scripts/atmos.json");
        let setup_script = if scripts_path.exists() {
            std::fs::read_to_string(&scripts_path)
                .ok()
                .and_then(|content| serde_json::from_str::<Value>(&content).ok())
                .and_then(|json| {
                    json["setup"]
                        .as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned)
                })
        } else {
            None
        };

        // NOTE: WriteRequirement is intentionally NOT pushed into the plan.
        // The composer pre-fills .atmos/context/requirement.md synchronously
        // during workspace creation (see handle_workspace_create), so the
        // setup flow surfaces no separate "Fill Requirement Spec" step.
        let mut steps = vec![WorkspaceSetupStep::CreateWorktree];
        if auto_extract_todos {
            steps.push(WorkspaceSetupStep::ExtractTodos);
        }
        if setup_script.is_some() {
            steps.push(WorkspaceSetupStep::RunSetupScript);
        }
        steps.push(WorkspaceSetupStep::Ready);

        Some(WorkspaceSetupPlan {
            steps,
            context: WorkspaceSetupContextNotification {
                has_github_issue: github_issue.is_some() && !has_github_pr,
                has_github_pr,
                has_requirement_step,
                auto_extract_todos,
                has_setup_script: setup_script.is_some(),
            },
            requirement_step_title: if has_github_pr {
                "Filling PR Specification".to_string()
            } else if github_issue.is_some() {
                "Filling Issue Specification".to_string()
            } else {
                "Writing Requirement Specification".to_string()
            },
            project_main_file_path: project.main_file_path,
            setup_script,
        })
    }

    async fn send_setup_failure(
        manager: &Arc<infra::WsManager>,
        conn_id: &str,
        workspace_id: &str,
        plan: &WorkspaceSetupPlan,
        step: WorkspaceSetupStep,
        step_title: &str,
        output: String,
        replace_output: bool,
    ) {
        Self::send_workspace_setup_progress(
            manager,
            conn_id,
            WorkspaceSetupProgressNotification {
                workspace_id: workspace_id.to_string(),
                status: "error".to_string(),
                step_key: Some(step.key().to_string()),
                failed_step_key: Some(step.key().to_string()),
                step_title: step_title.to_string(),
                output: Some(output),
                replace_output,
                requires_confirmation: false,
                success: false,
                countdown: None,
                setup_context: Some(plan.context.clone()),
            },
        )
        .await;
    }

    #[allow(clippy::too_many_arguments)]
    async fn execute_setup_state_machine(
        manager: Arc<infra::WsManager>,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        conn_id: String,
        project_guid: String,
        workspace_id: String,
        workspace_name: String,
        initial_requirement: Option<String>,
        github_issue: Option<GithubIssuePayload>,
        has_github_pr: bool,
        auto_extract_todos: bool,
        start_step: Option<WorkspaceSetupStep>,
    ) {
        let Some(plan) = Self::build_workspace_setup_plan(
            &project_service,
            &project_guid,
            initial_requirement.as_deref(),
            github_issue.as_ref(),
            has_github_pr,
            auto_extract_todos,
        )
        .await
        else {
            tracing::error!(
                "[execute_setup_state_machine] Failed to build setup plan for workspace {}",
                workspace_id
            );
            let message = WsMessage::notification(
                WsEvent::WorkspaceSetupProgress,
                json!(WorkspaceSetupProgressNotification {
                    workspace_id: workspace_id.clone(),
                    status: "error".to_string(),
                    step_key: Some("create_worktree".to_string()),
                    failed_step_key: Some("create_worktree".to_string()),
                    step_title: "Workspace Setup Failed".to_string(),
                    output: Some(
                        "\r\n\x1b[31mFailed to initialize workspace setup: could not load project configuration.\x1b[0m\r\n"
                            .to_string()
                    ),
                    replace_output: true,
                    requires_confirmation: false,
                    success: false,
                    countdown: None,
                    setup_context: None,
                }),
            );
            let _ = manager.broadcast(&message).await;
            return;
        };

        let start_index = match start_step {
            Some(step) => match plan.steps.iter().position(|candidate| *candidate == step) {
                Some(index) => index,
                None => return,
            },
            None => 0,
        };

        for step in plan.steps.iter().copied().skip(start_index) {
            match step {
                WorkspaceSetupStep::CreateWorktree => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Creating Workspace".to_string(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = workspace_service
                        .ensure_worktree_ready(workspace_id.clone())
                        .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Workspace Creation Failed",
                            format!("\r\n\x1b[31mError creating worktree: {}\x1b[0m\r\n", error),
                            true,
                        )
                        .await;
                        return;
                    }
                }
                WorkspaceSetupStep::WriteRequirement => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: plan.requirement_step_title.clone(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = workspace_service
                        .write_workspace_requirement(
                            workspace_id.clone(),
                            initial_requirement.clone(),
                            github_issue.clone(),
                            None,
                        )
                        .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Requirement Initialization Failed",
                            format!(
                                "\r\n\x1b[31mError writing requirement: {}\x1b[0m\r\n",
                                error
                            ),
                            true,
                        )
                        .await;
                        return;
                    }
                }
                WorkspaceSetupStep::ExtractTodos => {
                    let Some(issue) = github_issue.clone() else {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "TODO Extraction Failed",
                            "\r\n\x1b[31mNo GitHub issue is available for TODO extraction.\x1b[0m\r\n"
                                .to_string(),
                            true,
                        )
                        .await;
                        return;
                    };

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Extracting Initial TODOs".to_string(),
                            output: None,
                            replace_output: true,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    let mut streamed_markdown = String::new();
                    let mut rx = match workspace_service.stream_workspace_issue_todos(&issue).await
                    {
                        Ok(rx) => rx,
                        Err(error) => {
                            Self::send_setup_failure(
                                &manager,
                                &conn_id,
                                &workspace_id,
                                &plan,
                                step,
                                "TODO Extraction Failed",
                                format!(
                                    "\r\n\x1b[31mError starting TODO extraction: {}\x1b[0m\r\n",
                                    error
                                ),
                                true,
                            )
                            .await;
                            return;
                        }
                    };

                    while let Some(chunk) = rx.recv().await {
                        match chunk {
                            Ok(text) => {
                                streamed_markdown.push_str(&text);
                                Self::send_workspace_setup_progress(
                                    &manager,
                                    &conn_id,
                                    WorkspaceSetupProgressNotification {
                                        workspace_id: workspace_id.clone(),
                                        status: "creating".to_string(),
                                        step_key: Some(step.key().to_string()),
                                        failed_step_key: None,
                                        step_title: "Extracting Initial TODOs".to_string(),
                                        output: Some(text),
                                        replace_output: false,
                                        requires_confirmation: false,
                                        success: true,
                                        countdown: None,
                                        setup_context: Some(plan.context.clone()),
                                    },
                                )
                                .await;
                            }
                            Err(error) => {
                                Self::send_setup_failure(
                                    &manager,
                                    &conn_id,
                                    &workspace_id,
                                    &plan,
                                    step,
                                    "TODO Extraction Failed",
                                    format!(
                                        "\r\n\x1b[31mError streaming TODO extraction: {}\x1b[0m\r\n",
                                        error
                                    ),
                                    true,
                                )
                                .await;
                                return;
                            }
                        }
                    }

                    let normalized_markdown =
                        WorkspaceService::normalize_task_markdown(&streamed_markdown);
                    if normalized_markdown.is_empty() {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "TODO Extraction Failed",
                            "\r\n\x1b[31mThe model returned no valid TODO items.\x1b[0m\r\n"
                                .to_string(),
                            true,
                        )
                        .await;
                        return;
                    }

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "creating".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Review Initial TODOs".to_string(),
                            output: Some(normalized_markdown),
                            replace_output: true,
                            requires_confirmation: true,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;
                    return;
                }
                WorkspaceSetupStep::RunSetupScript => {
                    let effective_workspace_name = workspace_service
                        .get_workspace(workspace_id.clone())
                        .await
                        .ok()
                        .flatten()
                        .map(|workspace| workspace.model.name)
                        .unwrap_or_else(|| workspace_name.clone());
                    let workspace_path = GitEngine::new()
                        .get_worktree_path(&effective_workspace_name)
                        .unwrap_or_default();
                    let Some(script) = plan.setup_script.clone() else {
                        continue;
                    };

                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(format!("\r\n$ Running setup script: {}\r\n", script)),
                            replace_output: true,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;

                    if let Err(error) = Self::execute_script_in_pty(
                        &manager,
                        &conn_id,
                        &workspace_id,
                        &script,
                        &workspace_path,
                        &plan.project_main_file_path,
                    )
                    .await
                    {
                        Self::send_setup_failure(
                            &manager,
                            &conn_id,
                            &workspace_id,
                            &plan,
                            step,
                            "Setup Failed",
                            format!("\r\n\x1b[31mError: {}\x1b[0m\r\n", error),
                            false,
                        )
                        .await;
                        return;
                    }

                    // Brief pause so the user can see the final script output
                    // before the view transitions to the Ready step.
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                WorkspaceSetupStep::Ready => {
                    Self::send_workspace_setup_progress(
                        &manager,
                        &conn_id,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "completed".to_string(),
                            step_key: Some(step.key().to_string()),
                            failed_step_key: None,
                            step_title: "Ready to Build".to_string(),
                            output: None,
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: Some(plan.context.clone()),
                        },
                    )
                    .await;
                    return;
                }
            }
        }
    }

    async fn execute_script_in_pty(
        manager: &Arc<infra::WsManager>,
        conn_id: &str,
        workspace_id: &str,
        script: &str,
        cwd: &std::path::Path,
        project_root: &str,
    ) -> anyhow::Result<()> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell = std::env::var("SHELL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(Self::detect_login_shell_from_system)
            .unwrap_or_else(|| "/bin/sh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        // Run as an interactive login shell so both profile files and rc files
        // are loaded. Desktop apps launched from Finder usually lack the user's
        // shell environment, and many developer toolchains are initialized in
        // ~/.zshrc or ~/.bashrc rather than profile files.
        if shell.contains("zsh") || shell.contains("bash") {
            cmd.arg("-i");
            cmd.arg("-l");
        }
        cmd.arg("-c");
        // Wrapper logic:
        // 1. Define echo/printf functions that temporarily disable xtrace
        // 2. Set PS4 to a clean '$ ' prefix
        // 3. Enable xtrace (set -x)
        let wrapper = r#"
PS4='$ '
echo() { { set +x; } 2>/dev/null; builtin echo "$@"; { set -x; } 2>/dev/null; }
printf() { { set +x; } 2>/dev/null; builtin printf "$@"; { set -x; } 2>/dev/null; }
set -x
"#;
        let script_with_wrapper = format!("{}{}", wrapper, script);
        cmd.arg(script_with_wrapper);
        cmd.cwd(cwd);

        // Inject env vars
        cmd.env("ATMOS_ROOT_PROJECT_PATH", project_root);
        cmd.env("ATMOS_WORKSPACE_PATH", cwd.to_string_lossy().to_string());
        // For convenience, pass current PATH
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }

        let mut child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        // Drop the master after cloning the reader so the PTY fd is not held
        // open longer than necessary. On macOS/Unix the reader already has its
        // own dup'd fd and EOF is driven by the slave side closing.
        drop(pair.master);

        let manager_clone = manager.clone();
        let conn_id_clone = conn_id.to_string();
        let workspace_id_clone = workspace_id.to_string();

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

        // Reading task – streams PTY output into the channel.
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let s = String::from_utf8_lossy(&buf[..n]).to_string();
                        if tx.send(s).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // Wait for the child process concurrently with streaming output.
        // This avoids hanging forever if the PTY reader never gets EOF
        // (e.g. a background process inherited the slave fd).
        let mut wait_handle = tokio::task::spawn_blocking(move || child.wait());

        let exit_status = loop {
            tokio::select! {
                biased;
                Some(output) = rx.recv() => {
                    Self::send_workspace_setup_progress(
                        &manager_clone,
                        &conn_id_clone,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id_clone.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some("run_setup_script".to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(output),
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: None,
                        },
                    )
                    .await;
                }
                result = &mut wait_handle => {
                    break result??;
                }
            }
        };

        // Best-effort drain: capture any remaining PTY output that was buffered
        // between the last recv and the child exiting.
        let drain_deadline = tokio::time::Instant::now() + Duration::from_millis(500);
        loop {
            let remaining = drain_deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Some(output)) => {
                    Self::send_workspace_setup_progress(
                        &manager_clone,
                        &conn_id_clone,
                        WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id_clone.clone(),
                            status: "setting_up".to_string(),
                            step_key: Some("run_setup_script".to_string()),
                            failed_step_key: None,
                            step_title: "Running Setup Script".to_string(),
                            output: Some(output),
                            replace_output: false,
                            requires_confirmation: false,
                            success: true,
                            countdown: None,
                            setup_context: None,
                        },
                    )
                    .await;
                }
                Ok(None) | Err(_) => break,
            }
        }

        if !exit_status.success() {
            anyhow::bail!("Script exited with status {}", exit_status);
        }

        Ok(())
    }

    // ===== Skills Handlers =====

    async fn handle_skills_list(&self) -> Result<Value> {
        use crate::service::skill::SkillScanner;

        // Get all projects with their paths
        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        // Scan for skills
        let skills = SkillScanner::scan_all(&project_paths);

        Ok(json!({
            "skills": skills
        }))
    }

    async fn handle_skills_get(&self, req: SkillsGetRequest) -> Result<Value> {
        use crate::service::skill::SkillScanner;

        // Get all projects with their paths
        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        // Scan for the specific skill
        let skill = SkillScanner::scan_one(&project_paths, &req.scope, &req.id);

        if let Some(skill) = skill {
            Ok(json!(skill))
        } else {
            Err(ServiceError::Validation("Skill not found".to_string()))
        }
    }

    async fn handle_skills_set_enabled(&self, req: SkillsSetEnabledRequest) -> Result<Value> {
        use crate::service::skill::SkillManager;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        SkillManager::set_enabled(
            &project_paths,
            &req.id,
            req.enabled,
            req.placement_ids.as_deref(),
        )?;

        Ok(json!({ "success": true }))
    }

    async fn handle_skills_delete(&self, req: SkillsDeleteRequest) -> Result<Value> {
        use crate::service::skill::SkillManager;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        SkillManager::delete(&project_paths, &req.id, req.placement_ids.as_deref())?;

        Ok(json!({ "success": true }))
    }

    /// Install project-wiki and project-wiki-update skills to ~/.atmos/skills/.system/.
    /// Tries to copy from project root first; falls back to git clone from GitHub for project-wiki.
    async fn handle_wiki_skill_install(&self) -> Result<Value> {
        let home = dirs::home_dir().ok_or_else(|| {
            ServiceError::Validation("Cannot determine home directory".to_string())
        })?;
        let system_dir = home.join(".atmos").join("skills").join(".system");
        let target_dir = system_dir.join("project-wiki");

        if target_dir.exists() {
            // Still try to install project-wiki-update and project-wiki-specify if missing
            let temp_to_clean =
                Self::install_missing_wiki_skills_from_project_then_github(&system_dir).await?;
            if let Some(temp) = temp_to_clean {
                let _ = std::fs::remove_dir_all(temp);
            }
            return Ok(json!({
                "success": true,
                "path": target_dir.to_string_lossy(),
                "message": "Skill already installed"
            }));
        }

        // Ensure parent directory exists
        if let Some(parent) = target_dir.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create directory: {}", e))
            })?;
        }

        // Try copy from project root (when running from ATMOS source)
        let project_root = std::env::current_dir().unwrap_or_default();
        let source_in_project = project_root.join("skills").join("project-wiki");
        if source_in_project.exists() && source_in_project.is_dir() {
            Self::copy_dir_all(&source_in_project, &target_dir)
                .map_err(|e| ServiceError::Validation(format!("Failed to copy skill: {}", e)))?;
            Self::install_project_wiki_update_if_needed(&system_dir)?;
            Self::install_project_wiki_specify_if_needed(&system_dir)?;
            return Ok(json!({
                "success": true,
                "path": target_dir.to_string_lossy(),
                "message": "Skill installed from project"
            }));
        }

        // Fallback: clone from GitHub
        let temp_dir =
            std::env::temp_dir().join(format!("atmos-wiki-skill-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let clone_path = temp_dir.join("atmos");

        let clone_status = tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth",
                "1",
                "https://github.com/AruNi-01/atmos.git",
                clone_path.to_str().unwrap_or("atmos"),
            ])
            .current_dir(temp_dir.parent().unwrap_or(&std::env::temp_dir()))
            .status()
            .await
            .map_err(|e| ServiceError::Validation(format!("Git clone failed: {}", e)))?;

        if !clone_status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(ServiceError::Validation(
                "Failed to clone from GitHub. Check network and git installation.".to_string(),
            ));
        }

        let skill_src = clone_path.join("skills").join("project-wiki");
        if skill_src.exists() {
            Self::copy_dir_all(&skill_src, &target_dir)
                .map_err(|e| ServiceError::Validation(format!("Failed to copy skill: {}", e)))?;
        }
        // project-wiki-update: try from cloned repo (may not exist in older GitHub versions)
        let update_src = clone_path.join("skills").join("project-wiki-update");
        if update_src.exists() && update_src.is_dir() {
            let update_dst = system_dir.join("project-wiki-update");
            let _ = std::fs::create_dir_all(system_dir.as_path());
            let _ = Self::copy_dir_all(&update_src, &update_dst);
        }
        // project-wiki-specify: try from cloned repo (may not exist in older GitHub versions)
        let specify_src = clone_path.join("skills").join("project-wiki-specify");
        if specify_src.exists() && specify_src.is_dir() {
            let specify_dst = system_dir.join("project-wiki-specify");
            let _ = std::fs::create_dir_all(system_dir.as_path());
            let _ = Self::copy_dir_all(&specify_src, &specify_dst);
        }
        // Also try project root in case we're in development with uncommitted skills
        Self::install_project_wiki_update_if_needed(&system_dir)?;
        Self::install_project_wiki_specify_if_needed(&system_dir)?;
        let _ = std::fs::remove_dir_all(&temp_dir);

        Ok(json!({
            "success": true,
            "path": target_dir.to_string_lossy(),
            "message": "Skill installed from GitHub"
        }))
    }

    /// When project-wiki exists but project-wiki-update or project-wiki-specify are missing:
    /// 1) Try copy from project root; 2) If still missing, clone from GitHub and copy.
    ///
    /// Returns Some(temp_dir) if clone was performed (caller should clean up), None otherwise.
    async fn install_missing_wiki_skills_from_project_then_github(
        system_dir: &std::path::Path,
    ) -> Result<Option<std::path::PathBuf>> {
        Self::install_project_wiki_update_if_needed(system_dir)?;
        Self::install_project_wiki_specify_if_needed(system_dir)?;

        let update_ok = system_dir
            .join("project-wiki-update")
            .join("SKILL.md")
            .exists();
        let specify_ok = system_dir
            .join("project-wiki-specify")
            .join("SKILL.md")
            .exists();
        if update_ok && specify_ok {
            return Ok(None);
        }

        // Clone from GitHub and install missing skills
        let temp_dir =
            std::env::temp_dir().join(format!("atmos-wiki-skill-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let clone_path = temp_dir.join("atmos");

        let clone_status = tokio::process::Command::new("git")
            .args([
                "clone",
                "--depth",
                "1",
                "https://github.com/AruNi-01/atmos.git",
                clone_path.to_str().unwrap_or("atmos"),
            ])
            .current_dir(temp_dir.parent().unwrap_or(&std::env::temp_dir()))
            .status()
            .await
            .map_err(|e| ServiceError::Validation(format!("Git clone failed: {}", e)))?;

        if !clone_status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(ServiceError::Validation(
                "Failed to clone from GitHub. Check network and git installation.".to_string(),
            ));
        }

        if !update_ok {
            let update_src = clone_path.join("skills").join("project-wiki-update");
            if update_src.exists() && update_src.is_dir() {
                let update_dst = system_dir.join("project-wiki-update");
                let _ = std::fs::create_dir_all(system_dir);
                Self::copy_dir_all(&update_src, &update_dst).map_err(|e| {
                    ServiceError::Validation(format!("Failed to copy project-wiki-update: {}", e))
                })?;
            }
        }
        if !specify_ok {
            let specify_src = clone_path.join("skills").join("project-wiki-specify");
            if specify_src.exists() && specify_src.is_dir() {
                let specify_dst = system_dir.join("project-wiki-specify");
                let _ = std::fs::create_dir_all(system_dir);
                Self::copy_dir_all(&specify_src, &specify_dst).map_err(|e| {
                    ServiceError::Validation(format!("Failed to copy project-wiki-specify: {}", e))
                })?;
            }
        }

        Ok(Some(temp_dir))
    }

    /// Install project-wiki-update skill from project root if it exists and target does not.
    fn install_project_wiki_update_if_needed(system_dir: &std::path::Path) -> Result<()> {
        let target = system_dir.join("project-wiki-update");
        if target.exists() {
            return Ok(());
        }
        let project_root = std::env::current_dir().unwrap_or_default();
        let source = project_root.join("skills").join("project-wiki-update");
        if source.exists() && source.is_dir() {
            Self::copy_dir_all(&source, &target).map_err(|e| {
                ServiceError::Validation(format!("Failed to copy project-wiki-update: {}", e))
            })?;
        }
        Ok(())
    }

    /// Install project-wiki-specify skill from project root if it exists and target does not.
    fn install_project_wiki_specify_if_needed(system_dir: &std::path::Path) -> Result<()> {
        let target = system_dir.join("project-wiki-specify");
        if target.exists() {
            return Ok(());
        }
        let project_root = std::env::current_dir().unwrap_or_default();
        let source = project_root.join("skills").join("project-wiki-specify");
        if source.exists() && source.is_dir() {
            Self::copy_dir_all(&source, &target).map_err(|e| {
                ServiceError::Validation(format!("Failed to copy project-wiki-specify: {}", e))
            })?;
        }
        Ok(())
    }

    /// Check if project-wiki, project-wiki-update, and project-wiki-specify all exist with SKILL.md in ~/.atmos/skills/.system/
    async fn handle_wiki_skill_system_status(&self) -> Result<Value> {
        let system_dir = dirs::home_dir().map(|h| h.join(".atmos").join("skills").join(".system"));
        let installed = system_dir
            .map(|d| {
                let skill_ok = |name: &str| {
                    let skill_path = d.join(name);
                    let skill_md = skill_path.join("SKILL.md");
                    skill_path.exists()
                        && skill_path.is_dir()
                        && skill_md.exists()
                        && skill_md.is_file()
                };
                skill_ok("project-wiki")
                    && skill_ok("project-wiki-update")
                    && skill_ok("project-wiki-specify")
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    /// Check if all code review skills exist with SKILL.md in ~/.atmos/skills/.system/code_review_skills/
    async fn handle_code_review_skill_system_status(&self) -> Result<Value> {
        let system_dir = dirs::home_dir().map(|h| {
            h.join(".atmos")
                .join("skills")
                .join(".system")
                .join("code_review_skills")
        });
        let installed = system_dir
            .map(|d| {
                let skill_ok = |name: &str| {
                    let skill_path = d.join(name);
                    let skill_md = skill_path.join("SKILL.md");
                    skill_path.exists()
                        && skill_path.is_dir()
                        && skill_md.exists()
                        && skill_md.is_file()
                };
                skill_ok("fullstack-reviewer")
                    && skill_ok("code-review-expert")
                    && skill_ok("typescript-react-reviewer")
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    /// Check if git-commit skill exists with SKILL.md in ~/.atmos/skills/.system/git-commit/
    async fn handle_git_commit_skill_system_status(&self) -> Result<Value> {
        let installed = dirs::home_dir()
            .map(|h| {
                let skill_md = h
                    .join(".atmos")
                    .join("skills")
                    .join(".system")
                    .join("git-commit")
                    .join("SKILL.md");
                skill_md.exists() && skill_md.is_file()
            })
            .unwrap_or(false);
        Ok(json!({ "installed": installed }))
    }

    async fn handle_sync_single_system_skill(
        &self,
        req: SyncSingleSystemSkillRequest,
    ) -> Result<Value> {
        let skill_name = req.skill_name;
        let result = tokio::task::spawn_blocking(move || {
            infra::utils::system_skill_sync::sync_single_system_skill(&skill_name)
        })
        .await
        .map_err(|e| ServiceError::Processing(format!("Task join error: {}", e)))?;

        match result {
            Ok(()) => Ok(json!({ "success": true })),
            Err(msg) => Err(ServiceError::Processing(msg)),
        }
    }

    /// Manually trigger sync of all system skills from project/GitHub
    async fn handle_skills_system_sync(&self) -> Result<Value> {
        // Run in a blocking task to avoid blocking the async executor
        tokio::task::spawn_blocking(move || {
            let report = infra::utils::system_skill_sync::sync_system_skills_with_report();
            tracing::info!(
                "System skill sync background result: versions={:?}, missing={:?}",
                report.versions,
                report.missing_skills
            );
        });

        Ok(json!({ "initiated": true }))
    }

    // ===== Agent Handlers =====

    async fn handle_agent_list(&self) -> Result<Value> {
        let agents = self.agent_service.list_agents();
        Ok(json!({ "agents": agents }))
    }

    async fn handle_agent_install(&self, req: AgentInstallRequest) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;

        let result = self.agent_service.install_agent(id).await?;
        Ok(json!(result))
    }

    async fn handle_agent_config_get(&self, req: AgentConfigGetRequest) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;
        let state = self.agent_service.get_agent_config(id)?;
        Ok(json!(state))
    }

    async fn handle_agent_config_set(&self, req: AgentConfigSetRequest) -> Result<Value> {
        let id = parse_agent_id(&req.id)?;
        self.agent_service.set_agent_api_key(id, &req.api_key)?;
        Ok(json!({ "success": true }))
    }

    async fn handle_agent_registry_list(&self, req: AgentRegistryListRequest) -> Result<Value> {
        let agents = self
            .agent_service
            .list_registry_agents(req.force_refresh)
            .await?;
        Ok(json!({ "agents": agents }))
    }

    async fn handle_agent_registry_install(
        &self,
        req: AgentRegistryInstallRequest,
    ) -> Result<Value> {
        let result = self
            .agent_service
            .install_registry_agent(&req.registry_id, req.force_overwrite)
            .await?;
        Ok(json!(result))
    }

    async fn handle_agent_registry_remove(&self, req: AgentRegistryRemoveRequest) -> Result<Value> {
        let result = self
            .agent_service
            .remove_registry_agent(&req.registry_id)
            .await?;
        Ok(json!(result))
    }

    async fn handle_custom_agent_list(&self) -> Result<Value> {
        let agents = self.agent_service.list_custom_agents()?;
        Ok(json!({ "agents": agents }))
    }

    async fn handle_custom_agent_add(&self, req: CustomAgentAddRequest) -> Result<Value> {
        let agent = CustomAgent {
            name: req.name,
            agent_type: "custom".to_string(),
            command: req.command,
            args: req.args,
            env: req.env,
            default_config: None,
        };
        self.agent_service.add_custom_agent(&agent)?;
        Ok(json!({ "success": true }))
    }

    async fn handle_custom_agent_remove(&self, req: CustomAgentRemoveRequest) -> Result<Value> {
        self.agent_service.remove_custom_agent(&req.name)?;
        Ok(json!({ "success": true }))
    }

    async fn handle_custom_agent_get_json(&self) -> Result<Value> {
        let json = self.agent_service.get_custom_agents_json()?;
        Ok(json!({ "json": json }))
    }

    async fn handle_custom_agent_set_json(&self, req: CustomAgentSetJsonRequest) -> Result<Value> {
        self.agent_service.set_custom_agents_json(&req.json)?;
        Ok(json!({ "success": true }))
    }

    async fn handle_custom_agent_get_manifest_path(&self) -> Result<Value> {
        let path = self.agent_service.get_manifest_path()?;
        Ok(json!({ "path": path }))
    }

    /// Recursively copy directory. Symlinks are preserved with their target path unchanged;
    /// project-wiki is installed first, so relative symlinks (e.g. ../project-wiki/references) resolve correctly.
    fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            if ty.is_symlink() {
                let target = std::fs::read_link(&src_path)?;
                #[cfg(unix)]
                std::os::unix::fs::symlink(&target, &dst_path)?;
                #[cfg(windows)]
                {
                    let target_is_dir = std::fs::metadata(&src_path)
                        .map(|m| m.is_dir())
                        .unwrap_or(false);
                    if target_is_dir {
                        std::os::windows::fs::symlink_dir(&target, &dst_path)?;
                    } else {
                        std::os::windows::fs::symlink_file(&target, &dst_path)?;
                    }
                }
            } else if ty.is_dir() {
                Self::copy_dir_all(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }

    // ===== GitHub Handlers =====

    fn to_issue_payload(issue: core_engine::github::GithubIssue) -> GithubIssuePayload {
        GithubIssuePayload {
            owner: issue.owner,
            repo: issue.repo,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            url: issue.url,
            state: issue.state,
            labels: issue
                .labels
                .into_iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
                .collect(),
        }
    }

    async fn handle_github_issue_list(&self, req: GithubIssueListRequest) -> Result<Value> {
        let issues = self
            .github_engine
            .list_issues(&req.owner, &req.repo, &req.state, req.limit)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub issues: {error}"))
            })?;

        let payloads: Vec<GithubIssuePayload> =
            issues.into_iter().map(Self::to_issue_payload).collect();
        Ok(json!(payloads))
    }

    async fn handle_github_issue_get(&self, req: GithubIssueGetRequest) -> Result<Value> {
        let (owner, repo, number) = if let Some(issue_url) = req.issue_url {
            core_engine::GithubEngine::parse_issue_url(&issue_url)
                .ok_or_else(|| ServiceError::Validation("Invalid GitHub issue URL".to_string()))?
        } else {
            let owner = req.owner.ok_or_else(|| {
                ServiceError::Validation("GitHub issue owner is required".to_string())
            })?;
            let repo = req.repo.ok_or_else(|| {
                ServiceError::Validation("GitHub issue repo is required".to_string())
            })?;
            let number = req.issue_number.ok_or_else(|| {
                ServiceError::Validation("GitHub issue number is required".to_string())
            })?;
            (owner, repo, number)
        };

        let issue = self
            .github_engine
            .get_issue(&owner, &repo, number)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to fetch GitHub issue: {error}"))
            })?;

        Ok(json!(Self::to_issue_payload(issue)))
    }

    fn to_pr_payload(pr: core_engine::github::GithubPullRequest) -> GithubPrPayload {
        GithubPrPayload {
            owner: pr.owner,
            repo: pr.repo,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            url: pr.url,
            state: pr.state,
            head_ref: pr.head_ref,
            base_ref: pr.base_ref,
            is_draft: pr.is_draft,
            labels: pr
                .labels
                .into_iter()
                .map(|label| GithubIssueLabelPayload {
                    name: label.name,
                    color: label.color,
                    description: label.description,
                })
                .collect(),
        }
    }

    async fn handle_github_pr_list_repo(&self, req: GithubPrListRepoRequest) -> Result<Value> {
        let prs = self
            .github_engine
            .list_prs(&req.owner, &req.repo, &req.state, req.limit)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to list GitHub PRs: {error}"))
            })?;
        let payloads: Vec<GithubPrPayload> = prs.into_iter().map(Self::to_pr_payload).collect();
        Ok(json!(payloads))
    }

    async fn handle_github_pr_get(&self, req: GithubPrGetRequest) -> Result<Value> {
        let (owner, repo, number) = if let Some(pr_url) = req.pr_url {
            core_engine::GithubEngine::parse_pr_url(&pr_url)
                .ok_or_else(|| ServiceError::Validation("Invalid GitHub PR URL".to_string()))?
        } else {
            let owner = req.owner.ok_or_else(|| {
                ServiceError::Validation("GitHub PR owner is required".to_string())
            })?;
            let repo = req.repo.ok_or_else(|| {
                ServiceError::Validation("GitHub PR repo is required".to_string())
            })?;
            let number = req.pr_number.ok_or_else(|| {
                ServiceError::Validation("GitHub PR number is required".to_string())
            })?;
            (owner, repo, number)
        };

        let pr = self
            .github_engine
            .get_pr(&owner, &repo, number)
            .await
            .map_err(|error| {
                ServiceError::Validation(format!("Failed to fetch GitHub PR: {error}"))
            })?;

        Ok(json!(Self::to_pr_payload(pr)))
    }

    async fn handle_github_pr_list(
        &self,
        conn_id: &str,
        req: GithubPrListRequest,
    ) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let state = req.state.as_deref().unwrap_or("open").to_lowercase();

        // Fetch PRs where current branch is the HEAD (outgoing)
        let head_args = vec![
            "pr", "list", 
            "--repo", &repo_arg, 
            "--head", &req.branch, 
            "--state", &state, 
            "--limit", "30", 
            "--json", "number,title,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,author,isDraft,comments,commits"
        ];

        // Fetch PRs where current branch is the BASE (incoming)
        let base_args = vec![
            "pr", "list", 
            "--repo", &repo_arg, 
            "--base", &req.branch, 
            "--state", &state, 
            "--limit", "30", 
            "--json", "number,title,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,author,isDraft,comments,commits"
        ];

        let (head_res, base_res) = tokio::join!(
            self.github_engine.run_gh(&head_args),
            self.github_engine.run_gh(&base_args)
        );

        let mut all_prs = Vec::new();

        if let Ok(Value::Array(prs)) = head_res {
            all_prs.extend(prs);
        }
        if let Ok(Value::Array(prs)) = base_res {
            all_prs.extend(prs);
        }

        // Deduplicate by PR number and sort by creation date (desc)
        let mut seen_numbers = std::collections::HashSet::new();
        let mut unique_prs = Vec::new();

        for pr in all_prs {
            if let Some(num) = pr.get("number").and_then(|n| n.as_u64()) {
                if seen_numbers.insert(num) {
                    unique_prs.push(pr);
                }
            }
        }

        unique_prs.sort_by(|a, b| {
            let a_time = a.get("createdAt").and_then(|t| t.as_str()).unwrap_or("");
            let b_time = b.get("createdAt").and_then(|t| t.as_str()).unwrap_or("");
            b_time.cmp(a_time)
        });

        if req.emit_branch_status_refresh {
            if let Some(manager) = self.ws_manager.get().cloned() {
                let notification = infra::WsMessage::notification(
                    infra::WsEvent::GithubBranchPrStatusRefreshed,
                    json!({
                        "owner": req.owner,
                        "repo": req.repo,
                        "branch": req.branch,
                    }),
                );
                let _ = manager.send_to(conn_id, &notification).await;
            }
        }

        Ok(json!(unique_prs))
    }

    async fn handle_github_pr_detail(&self, req: GithubPrDetailRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "view", &pr_num_str, "--repo", &repo_arg, "--json", "number,title,body,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,statusCheckRollup,comments,reviews,author,commits,isDraft,assignees,labels,reviewRequests,closingIssuesReferences"];
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get PR detail: {}", e)))?;
        Ok(output)
    }

    async fn handle_github_pr_timeline_page(
        &self,
        req: GithubPrTimelinePageRequest,
    ) -> Result<Value> {
        let per_page = req.per_page.clamp(1, 100);
        let endpoint = format!(
            "repos/{}/{}/issues/{}/timeline?per_page={}&page={}",
            req.owner, req.repo, req.pr_number, per_page, req.page
        );
        let args = vec!["api", &endpoint];
        let items = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or(serde_json::Value::Array(vec![]));

        let count = items.as_array().map(|a| a.len()).unwrap_or(0);
        let has_more = count == per_page as usize;

        Ok(serde_json::json!({
            "items": items,
            "page": req.page,
            "per_page": per_page,
            "has_more": has_more,
        }))
    }

    async fn handle_github_pr_detail_sidebar(&self, req: GithubPrDetailRequest) -> Result<Value> {
        let review_comments_endpoint = format!(
            "repos/{}/{}/pulls/{}/comments?per_page=100",
            req.owner, req.repo, req.pr_number
        );
        let graphql_query = format!(
            r#"query {{ repository(owner: "{}", name: "{}") {{ pullRequest(number: {}) {{ participants(first: 50) {{ nodes {{ login avatarUrl }} }} }} }} }}"#,
            req.owner, req.repo, req.pr_number
        );
        let graphql_query_arg = format!("query={}", graphql_query);

        // Run all three fetches concurrently
        let (review_comments_result, participants_result, closing_issues_result) = tokio::join!(
            async {
                let args = vec!["api", &review_comments_endpoint];
                self.github_engine.run_gh(&args).await.ok()
            },
            async {
                let args = vec!["api", "graphql", "-f", &graphql_query_arg];
                self.github_engine.run_gh(&args).await.ok()
            },
            async { self.fetch_enriched_closing_issues(&req).await }
        );

        let mut result = json!({});
        let obj = result.as_object_mut().unwrap();

        if let Some(rc) = review_comments_result {
            obj.insert("review_comments".to_string(), rc);
        }

        if let Some(gql) = participants_result {
            if let Some(nodes) = gql
                .pointer("/data/repository/pullRequest/participants/nodes")
                .and_then(|v| v.as_array())
            {
                let participants: Vec<Value> = nodes
                    .iter()
                    .filter_map(|n| {
                        let login = n.get("login")?.as_str()?;
                        let avatar = n.get("avatarUrl").and_then(|a| a.as_str()).unwrap_or("");
                        Some(json!({ "login": login, "avatar_url": avatar }))
                    })
                    .collect();
                obj.insert("participants".to_string(), json!(participants));
            }
        }

        if let Some(issues) = closing_issues_result {
            obj.insert("closingIssuesReferences".to_string(), json!(issues));
        }

        Ok(result)
    }

    async fn fetch_enriched_closing_issues(
        &self,
        req: &GithubPrDetailRequest,
    ) -> Option<Vec<Value>> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "view",
            &pr_num_str,
            "--repo",
            &repo_arg,
            "--json",
            "closingIssuesReferences",
        ];
        let output = self.github_engine.run_gh(&args).await.ok()?;
        let issues = output.get("closingIssuesReferences")?.as_array()?.clone();
        if issues.is_empty() {
            return Some(issues);
        }

        let mut enriched = Vec::new();
        for issue in &issues {
            let number = issue.get("number").and_then(|n| n.as_u64()).unwrap_or(0);
            let issue_owner = issue
                .pointer("/repository/owner/login")
                .and_then(|v| v.as_str())
                .unwrap_or(&req.owner);
            let issue_repo = issue
                .pointer("/repository/name")
                .and_then(|v| v.as_str())
                .unwrap_or(&req.repo);
            let endpoint = format!("repos/{}/{}/issues/{}", issue_owner, issue_repo, number);
            let api_args = vec!["api", &endpoint];
            if let Ok(issue_data) = self.github_engine.run_gh(&api_args).await {
                let mut merged = issue.clone();
                if let Some(obj) = merged.as_object_mut() {
                    if let Some(title) = issue_data.get("title") {
                        obj.insert("title".to_string(), title.clone());
                    }
                    if let Some(state) = issue_data.get("state") {
                        obj.insert("state".to_string(), state.clone());
                    }
                }
                enriched.push(merged);
            } else {
                enriched.push(issue.clone());
            }
        }
        Some(enriched)
    }

    async fn handle_github_pr_create(&self, req: GithubPrCreateRequest) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec![
            "pr",
            "create",
            "--repo",
            &repo_arg,
            "--title",
            &req.title,
            "--base",
            &req.base_branch,
            "--head",
            &req.branch,
        ];
        if let Some(body) = &req.body {
            args.push("--body");
            args.push(body);
        }
        if req.draft.unwrap_or(false) {
            args.push("--draft");
        }
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to create PR: {}", e)))?;
        Ok(output)
    }

    async fn handle_github_pr_merge(&self, req: GithubPrMergeRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let strategy_flag = format!("--{}", req.strategy);
        let mut args = vec![
            "pr",
            "merge",
            &pr_num_str,
            "--repo",
            &repo_arg,
            &strategy_flag,
        ];

        let body_val;
        if let Some(body) = &req.body {
            body_val = body.clone();
            args.push("--body");
            args.push(&body_val);
        }

        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        // `gh pr merge` typically returns empty json or null on success if not asking for json
        // We ensure success: true is returned
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_close(&self, req: GithubPrCloseRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec!["pr", "close", &pr_num_str, "--repo", &repo_arg];

        let comment_val;
        if let Some(comment) = &req.comment {
            comment_val = comment.clone();
            args.push("--comment");
            args.push(&comment_val);
        }

        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_reopen(&self, req: GithubPrReopenRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "reopen", &pr_num_str, "--repo", &repo_arg];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_comment(&self, req: GithubPrCommentRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "pr",
            "comment",
            &pr_num_str,
            "--repo",
            &repo_arg,
            "--body",
            &req.body,
        ];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_open_browser(
        &self,
        req: GithubPrOpenBrowserRequest,
    ) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "view", &pr_num_str, "--repo", &repo_arg, "--web"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_ready(&self, req: GithubPrReadyRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "ready", &pr_num_str, "--repo", &repo_arg];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_pr_draft(&self, req: GithubPrDraftRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        // Using gh pr ready --undo to convert back to draft
        let args = vec!["pr", "ready", &pr_num_str, "--repo", &repo_arg, "--undo"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_ci_status(&self, req: GithubCiStatusRequest) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec![
            "run",
            "list",
            "--repo",
            &repo_arg,
            "--branch",
            &req.branch,
            "--limit",
            "1",
            "--json",
            "databaseId,workflowName,status,conclusion,createdAt,url",
        ];
        let output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get CI status: {}", e)))?;

        // Return exactly what we got (either array with 1 item or empty array)
        if let Some(arr) = output.as_array() {
            if let Some(item) = arr.first() {
                return Ok(item.clone());
            }
        }
        Ok(json!({ "status": "no_ci_record" }))
    }

    async fn handle_github_actions_list(&self, req: GithubActionsListRequest) -> Result<Value> {
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        // limit 30 runs should be enough
        let args = vec!["run", "list", "--repo", &repo_arg, "--branch", &req.branch, "--limit", "30", "--json", "databaseId,workflowName,displayTitle,status,conclusion,createdAt,url,event,headBranch,headSha"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!([]));
        if !output.is_array() {
            output = json!([]);
        }
        Ok(output)
    }

    async fn handle_github_ci_open_browser(
        &self,
        req: GithubCiOpenBrowserRequest,
    ) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["run", "view", &run_id_str, "--repo", &repo_arg, "--web"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_actions_rerun(&self, req: GithubActionsRerunRequest) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let mut args = vec!["run", "rerun", &run_id_str, "--repo", &repo_arg];
        if req.failed_only.unwrap_or(false) {
            args.push("--failed");
        }
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .unwrap_or_else(|_| json!({ "success": true }));
        if !output.is_object() {
            output = json!({ "success": true });
        }
        Ok(output)
    }

    async fn handle_github_actions_detail(&self, req: GithubActionsDetailRequest) -> Result<Value> {
        let run_id_str = req.run_id.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let api_endpoint = format!("/repos/{}/actions/runs/{}", repo_arg, run_id_str);

        // 1. Fetch raw API output for actor
        let api_args = vec!["api", &api_endpoint];
        let api_output = self
            .github_engine
            .run_gh(&api_args)
            .await
            .unwrap_or_else(|_| json!({}));

        // 2. Fetch jobs JSON
        let jobs_args = vec![
            "run",
            "view",
            &run_id_str,
            "--repo",
            &repo_arg,
            "--json",
            "jobs",
        ];
        let jobs_output = self
            .github_engine
            .run_gh(&jobs_args)
            .await
            .unwrap_or_else(|_| json!({}));

        // We can just rely on run_gh falling back to string if it fails parsing or run raw?
        // Wait, github_engine.run_gh tries to parse json. It might fail.

        let mut result = json!({});
        if let Some(obj) = result.as_object_mut() {
            if let Some(actor) = api_output.get("actor") {
                obj.insert("actor".to_string(), actor.clone());
            }
            if let Some(triggering_actor) = api_output.get("triggering_actor") {
                obj.insert("triggering_actor".to_string(), triggering_actor.clone());
            }
            if let Some(jobs) = jobs_output.get("jobs") {
                obj.insert("jobs".to_string(), jobs.clone());
            }
        }

        Ok(result)
    }

    // ===== Function Settings Handlers =====

    async fn handle_function_settings_get(&self) -> Result<Value> {
        let path = function_settings_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read function_settings.json: {}", e))
            })?;
            let val: Value = serde_json::from_str(&content).unwrap_or(json!({}));
            Ok(val)
        } else {
            Ok(json!({}))
        }
    }

    async fn handle_function_settings_update(
        &self,
        req: FunctionSettingsUpdateRequest,
    ) -> Result<Value> {
        let path = function_settings_path();
        let mut settings: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
            serde_json::from_str(&content).unwrap_or(json!({}))
        } else {
            json!({})
        };

        if let Some(obj) = settings.as_object_mut() {
            let section = obj.entry(&req.function_name).or_insert(json!({}));
            if let Some(section_obj) = section.as_object_mut() {
                section_obj.insert(req.key.clone(), req.value.clone());
            }
        }

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&settings).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize settings: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write function_settings.json: {}", e))
        })?;

        Ok(json!({ "ok": true }))
    }

    // ===== Code Agent Custom Settings Handlers =====

    async fn handle_code_agent_custom_get(&self) -> Result<Value> {
        let path = terminal_code_agent_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {}", e))
            })?;
            let val: Value = serde_json::from_str(&content).unwrap_or(json!({ "agents": [] }));
            Ok(val)
        } else {
            Ok(json!({ "agents": [] }))
        }
    }

    async fn handle_code_agent_custom_update(
        &self,
        req: CodeAgentCustomUpdateRequest,
    ) -> Result<Value> {
        let path = terminal_code_agent_path();
        let deduped_agents = req
            .agents
            .as_array()
            .map(|items| {
                let mut seen = std::collections::HashSet::new();
                items
                    .iter()
                    .filter_map(|item| {
                        let id = item.get("id")?.as_str()?.trim();
                        if id.is_empty() || !seen.insert(id.to_string()) {
                            return None;
                        }
                        Some(item.clone())
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let data = json!({ "agents": deduped_agents });

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos/agent dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&data).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize terminal_code_agent: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write terminal_code_agent.json: {}", e))
        })?;

        Ok(json!({ "ok": true }))
    }

    async fn handle_agent_behaviour_settings_get(&self) -> Result<Value> {
        let path = terminal_code_agent_path();
        let val: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).map_err(|e| {
                ServiceError::Validation(format!("Failed to read terminal_code_agent.json: {}", e))
            })?;
            serde_json::from_str(&content).unwrap_or(json!({}))
        } else {
            json!({})
        };
        let timeout = val
            .get("idle_session_timeout_mins")
            .and_then(|v| v.as_u64())
            .unwrap_or(30);
        Ok(json!({ "idle_session_timeout_mins": timeout }))
    }

    async fn handle_agent_behaviour_settings_update(
        &self,
        req: AgentBehaviourSettingsUpdateRequest,
    ) -> Result<Value> {
        let path = terminal_code_agent_path();
        // Read existing file to preserve `agents` list
        let mut val: Value = if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or(json!({ "agents": [] }))
        } else {
            json!({ "agents": [] })
        };
        val["idle_session_timeout_mins"] = json!(req.idle_session_timeout_mins);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                ServiceError::Validation(format!("Failed to create ~/.atmos/agent dir: {}", e))
            })?;
        }
        let pretty = serde_json::to_string_pretty(&val).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize settings: {}", e))
        })?;
        std::fs::write(&path, pretty).map_err(|e| {
            ServiceError::Validation(format!("Failed to write terminal_code_agent.json: {}", e))
        })?;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_session_list(&self, req: ReviewSessionListRequest) -> Result<Value> {
        let sessions = self
            .review_service
            .list_sessions_by_workspace(req.workspace_guid, req.include_archived)
            .await?;
        Ok(json!(sessions))
    }

    async fn handle_review_session_get(&self, req: ReviewSessionGetRequest) -> Result<Value> {
        let session = self.review_service.get_session(req.session_guid).await?;
        Ok(json!(session))
    }

    async fn handle_review_session_create(&self, req: ReviewSessionCreateRequest) -> Result<Value> {
        let session = self
            .review_service
            .create_session(CreateReviewSessionInput {
                workspace_guid: req.workspace_guid,
                title: req.title,
                created_by: req.created_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_created",
                "session_guid": session.model.guid,
                "workspace_guid": session.model.workspace_guid,
                "changed_fields": ["status", "current_revision_guid", "updated_at"],
            }),
        )
        .await;
        Ok(json!(session))
    }

    async fn handle_review_session_close(&self, req: ReviewSessionCloseRequest) -> Result<Value> {
        self.review_service
            .close_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_closed",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_session_archive(
        &self,
        req: ReviewSessionArchiveRequest,
    ) -> Result<Value> {
        self.review_service
            .archive_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_archived",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_session_activate(
        &self,
        req: ReviewSessionActivateRequest,
    ) -> Result<Value> {
        self.review_service
            .activate_session(req.session_guid.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_activated",
                "session_guid": req.session_guid,
                "changed_fields": ["status", "closed_at", "archived_at", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_session_rename(&self, req: ReviewSessionRenameRequest) -> Result<Value> {
        self.review_service
            .rename_session(req.session_guid.clone(), req.title.clone())
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "kind": "session_renamed",
                "session_guid": req.session_guid,
                "changed_fields": ["title", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_file_list(&self, req: ReviewFileListRequest) -> Result<Value> {
        let files = self
            .review_service
            .list_files_by_revision(req.revision_guid)
            .await?;
        Ok(json!(files))
    }

    async fn handle_review_file_content_get(
        &self,
        req: ReviewFileContentGetRequest,
    ) -> Result<Value> {
        let content = self
            .review_service
            .get_file_content(req.file_snapshot_guid)
            .await?;
        Ok(json!(content))
    }

    async fn handle_review_file_set_reviewed(
        &self,
        req: ReviewFileSetReviewedRequest,
    ) -> Result<Value> {
        self.review_service
            .set_file_reviewed(SetReviewFileReviewedInput {
                file_state_guid: req.file_state_guid.clone(),
                reviewed: req.reviewed,
                reviewed_by: req.reviewed_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewFileUpdated,
            json!({
                "file_state_guid": req.file_state_guid,
                "changed_fields": ["reviewed", "reviewed_at", "reviewed_by", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_comment_list(&self, req: ReviewCommentListRequest) -> Result<Value> {
        let comments = self
            .review_service
            .list_comments(req.session_guid, req.revision_guid)
            .await?;
        Ok(json!(comments))
    }

    async fn handle_review_comment_create(&self, req: ReviewCommentCreateRequest) -> Result<Value> {
        let anchor: ReviewAnchor = serde_json::from_value(req.anchor).map_err(|error| {
            ServiceError::Validation(format!("Invalid review comment anchor: {}", error))
        })?;
        let comment = self
            .review_service
            .create_comment(CreateReviewCommentInput {
                session_guid: req.session_guid,
                revision_guid: req.revision_guid,
                file_snapshot_guid: req.file_snapshot_guid,
                anchor,
                body: req.body,
                title: req.title,
                created_by: req.created_by,
                parent_comment_guid: req.parent_comment_guid,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": comment.model.guid,
                "session_guid": comment.model.session_guid,
                "revision_guid": comment.model.revision_guid,
                "changed_fields": ["status", "updated_at", "created_at"],
                "comment": comment,
            }),
        )
        .await;
        Ok(json!(comment))
    }

    async fn handle_review_comment_update_status(
        &self,
        req: ReviewCommentUpdateStatusRequest,
    ) -> Result<Value> {
        self.review_service
            .update_comment_status(UpdateReviewCommentStatusInput {
                comment_guid: req.comment_guid.clone(),
                status: req.status.clone(),
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": req.comment_guid,
                "changed_fields": ["status", "updated_at"],
                "status": req.status,
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_message_add(&self, req: ReviewMessageAddRequest) -> Result<Value> {
        let message = self
            .review_service
            .create_message(AddReviewMessageInput {
                comment_guid: req.comment_guid,
                author_type: req.author_type,
                kind: req.kind,
                body: req.body,
                agent_run_guid: req.agent_run_guid,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewMessageCreated,
            json!({
                "comment_guid": message.model.comment_guid,
                "message_guid": message.model.guid,
                "changed_fields": ["created_at"],
                "message": message,
            }),
        )
        .await;
        Ok(json!(message))
    }

    async fn handle_review_message_delete(&self, req: ReviewMessageDeleteRequest) -> Result<Value> {
        let comment_guid = self
            .review_service
            .delete_message(DeleteReviewMessageInput {
                message_guid: req.message_guid.clone(),
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": comment_guid,
                "message_guid": req.message_guid,
                "changed_fields": ["messages", "updated_at"],
            }),
        )
        .await;
        Ok(json!({ "ok": true }))
    }

    async fn handle_review_message_update(&self, req: ReviewMessageUpdateRequest) -> Result<Value> {
        let message = self
            .review_service
            .update_message(UpdateReviewMessageInput {
                message_guid: req.message_guid,
                body: req.body,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewCommentUpdated,
            json!({
                "comment_guid": message.model.comment_guid,
                "message_guid": message.model.guid,
                "changed_fields": ["messages", "updated_at"],
                "message": message,
            }),
        )
        .await;
        Ok(json!(message))
    }

    async fn handle_review_agent_run_list(&self, req: ReviewAgentRunListRequest) -> Result<Value> {
        let runs = self.review_service.list_agent_runs(req.session_guid).await?;
        Ok(json!(runs))
    }

    async fn handle_review_agent_run_create(&self, req: ReviewAgentRunCreateRequest) -> Result<Value> {
        let run = self
            .review_service
            .create_agent_run(CreateReviewAgentRunInput {
                session_guid: req.session_guid,
                base_revision_guid: req.base_revision_guid,
                run_kind: req.run_kind,
                execution_mode: req.execution_mode,
                skill_id: req.skill_id,
                selected_comment_guids: req.selected_comment_guids,
                created_by: req.created_by,
            })
            .await?;
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": run.run.guid,
                "session_guid": run.run.session_guid,
                "changed_fields": ["status", "updated_at", "prompt_rel_path"],
                "run": run.run,
            }),
        )
        .await;
        Ok(json!(run))
    }

    async fn handle_review_agent_run_artifact_get(
        &self,
        req: ReviewAgentRunArtifactGetRequest,
    ) -> Result<Value> {
        let artifact = self
            .review_service
            .get_run_artifact(req.run_guid, req.kind)
            .await?;
        Ok(json!(artifact))
    }

    async fn handle_review_agent_run_finalize(
        &self,
        req: ReviewAgentRunFinalizeRequest,
    ) -> Result<Value> {
        let finalized = self
            .review_service
            .finalize_agent_run(req.run_guid.clone(), req.title)
            .await?;
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": finalized.run.guid,
                "session_guid": finalized.run.session_guid,
                "changed_fields": ["status", "result_revision_guid", "patch_rel_path", "result_rel_path", "finished_at", "updated_at"],
                "run": finalized.run,
                "revision_guid": finalized.revision.guid,
            }),
        )
        .await;
        Ok(json!(finalized))
    }

    async fn handle_review_agent_run_set_status(
        &self,
        req: ReviewAgentRunSetStatusRequest,
    ) -> Result<Value> {
        let status_result = self
            .review_service
            .set_agent_run_status(SetReviewAgentRunStatusInput {
                run_guid: req.run_guid,
                status: req.status,
                message: req.message,
                title: req.title,
                summary: req.summary,
            })
            .await?;
        let payload = serde_json::to_value(&status_result)
            .map_err(|error| ServiceError::Processing(error.to_string()))?;
        let run = match &status_result {
            crate::service::review::ReviewAgentRunStatusDto::Run { run } => run,
            crate::service::review::ReviewAgentRunStatusDto::Finalized(finalized) => &finalized.run,
        };
        self.send_review_notification(
            WsEvent::ReviewAgentRunUpdated,
            json!({
                "run_guid": run.guid,
                "session_guid": run.session_guid,
                "changed_fields": ["status", "updated_at"],
                "run": run,
                "payload": payload,
            }),
        )
        .await;
        Ok(json!(status_result))
    }

    async fn handle_llm_providers_get(&self) -> Result<Value> {
        let store = FileLlmConfigStore::new()
            .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
        let config = store.load().map_err(|e| {
            ServiceError::Validation(format!("Failed to read llm providers: {}", e))
        })?;
        serde_json::to_value(config).map_err(|e| {
            ServiceError::Validation(format!("Failed to serialize llm providers: {}", e))
        })
    }

    async fn handle_llm_providers_update(&self, req: LlmProvidersUpdateRequest) -> Result<Value> {
        let config: LlmProvidersFile = serde_json::from_value(req.config).map_err(|e| {
            ServiceError::Validation(format!("Invalid llm providers payload: {}", e))
        })?;
        let store = FileLlmConfigStore::new()
            .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
        store.save(&config).map_err(|e| {
            ServiceError::Validation(format!("Failed to save llm providers: {}", e))
        })?;
        Ok(json!({ "ok": true }))
    }

    async fn handle_llm_provider_test(
        &self,
        conn_id: &str,
        req: LlmProviderTestRequest,
    ) -> Result<Value> {
        let provider_id = req
            .provider_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("test-provider")
            .to_string();
        let mut provider: LlmProviderEntry = serde_json::from_value(req.provider).map_err(|e| {
            ServiceError::Validation(format!("Invalid llm provider test payload: {}", e))
        })?;
        provider.enabled = true;

        let mut config = LlmProvidersFile::default();
        config.providers.insert(provider_id.clone(), provider);

        let resolved = resolve_provider_by_id(&config, Some(&provider_id))
            .map_err(|e| ServiceError::Validation(format!("Failed to resolve provider: {e}")))?
            .ok_or_else(|| {
                ServiceError::Validation("Failed to resolve provider for test".to_string())
            })?;

        let request = GenerateTextRequest {
            system: Some("Reply with a short plain-text greeting.".to_string()),
            prompt: "hello".to_string(),
            temperature: Some(0.1),
            max_output_tokens: Some(resolved.max_output_tokens.unwrap_or(64)),
            response_format: ResponseFormat::Text,
        };

        let mut rx = generate_text_stream(&resolved, request)
            .await
            .map_err(|e| {
                ServiceError::Validation(format!("Failed to start provider test stream: {e}"))
            })?;

        let ws_manager = self.ws_manager.get().cloned();
        let mut full_text = String::new();

        while let Some(chunk_result) = rx.recv().await {
            match chunk_result {
                Ok(chunk) => {
                    full_text.push_str(&chunk);
                    if let Some(ref mgr) = ws_manager {
                        let notification = infra::WsMessage::notification(
                            infra::WsEvent::LlmProviderTestChunk,
                            json!({
                                "stream_id": req.stream_id,
                                "chunk": chunk,
                            }),
                        );
                        let _ = mgr.send_to(conn_id, &notification).await;
                    }
                }
                Err(error) => {
                    return Err(ServiceError::Validation(format!(
                        "Provider test failed: {error}"
                    )));
                }
            }
        }

        let text = full_text.trim().to_string();
        if text.is_empty() {
            return Err(ServiceError::Validation(
                "Provider test returned empty output".to_string(),
            ));
        }

        Ok(json!({ "text": text }))
    }

    // ===== Local Model Handlers =====

    /// Return the manifest (list of available models) plus the current runtime state.
    async fn handle_local_model_list(&self) -> Result<Value> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let manifest = fetch_manifest(&http).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to fetch local model manifest: {e}"))
        })?;
        let state = self.local_model_manager.state();
        let state_json =
            serde_json::to_value(&state).map_err(|e| ServiceError::Processing(e.to_string()))?;
        let models_json = serde_json::to_value(&manifest.models)
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        Ok(json!({
            "models": models_json,
            "state": state_json,
        }))
    }

    /// Trigger download of the binary + model GGUF.  State updates are pushed
    /// as `LocalModelStateChanged` notifications.
    async fn handle_local_model_download(
        &self,
        conn_id: &str,
        req: infra::LocalModelDownloadRequest,
    ) -> Result<Value> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let manifest = fetch_manifest(&http).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to fetch local model manifest: {e}"))
        })?;

        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        let conn_id = conn_id.to_string();
        let model_id = req.model_id.clone();

        // Subscribe to state changes and forward them as WS notifications.
        let mut state_rx = manager.subscribe();
        let ws_mgr_notify = ws_manager.clone();
        let conn_id_notify = conn_id.clone();
        tokio::spawn(async move {
            while let Ok(state) = state_rx.recv().await {
                if let Some(ref mgr) = ws_mgr_notify {
                    if let Ok(state_json) = serde_json::to_value(&state) {
                        let notification = infra::WsMessage::notification(
                            WsEvent::LocalModelStateChanged,
                            json!({ "state": state_json }),
                        );
                        let _ = mgr.broadcast(&notification).await;
                    }
                    if matches!(
                        state,
                        local_model::LocalModelState::InstalledNotRunning
                            | local_model::LocalModelState::Failed { .. }
                    ) {
                        break;
                    }
                }
            }
        });

        tokio::spawn(async move {
            if let Err(e) = manager.ensure_binary(&manifest).await {
                tracing::error!("[LocalModel] binary download failed: {e}");
                manager.mark_failed(format!("Binary download failed: {e}"));
                return;
            }
            if let Err(e) = manager.ensure_model(&manifest, &model_id).await {
                tracing::error!("[LocalModel] model download failed: {e}");
                manager.mark_failed(format!("Model download failed: {e}"));
                return;
            }
            manager.mark_installed_not_running();
        });

        Ok(json!({ "ok": true }))
    }

    /// Start the llama-server for a given model.
    async fn handle_local_model_start(
        &self,
        conn_id: &str,
        req: infra::LocalModelStartRequest,
    ) -> Result<Value> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        let manifest = fetch_manifest(&http).await.map_err(|e| {
            ServiceError::Processing(format!("Failed to fetch local model manifest: {e}"))
        })?;

        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        let conn_id = conn_id.to_string();
        let model_id = req.model_id.clone();

        let mut state_rx = manager.subscribe();
        let ws_mgr_notify = ws_manager.clone();
        let conn_id_notify = conn_id.clone();
        tokio::spawn(async move {
            while let Ok(state) = state_rx.recv().await {
                if let Some(ref mgr) = ws_mgr_notify {
                    if let Ok(state_json) = serde_json::to_value(&state) {
                        let notification = infra::WsMessage::notification(
                            WsEvent::LocalModelStateChanged,
                            json!({ "state": state_json }),
                        );
                        let _ = mgr.send_to(&conn_id_notify, &notification).await;
                    }
                    if matches!(
                        state,
                        local_model::LocalModelState::Running { .. }
                            | local_model::LocalModelState::Failed { .. }
                    ) {
                        break;
                    }
                }
            }
        });

        tokio::spawn(async move {
            if let Err(e) = manager.start(&manifest, &model_id).await {
                tracing::error!("[LocalModel] start failed: {e}");
            }
        });

        Ok(json!({ "ok": true }))
    }

    /// Stop the running llama-server.
    async fn handle_local_model_stop(&self, conn_id: &str) -> Result<Value> {
        let manager = Arc::clone(&self.local_model_manager);
        let ws_manager = self.ws_manager.get().cloned();
        let conn_id = conn_id.to_string();
        manager
            .stop()
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        if let Some(ref mgr) = ws_manager {
            let state_json = serde_json::to_value(&manager.state()).unwrap_or(json!(null));
            let notification = infra::WsMessage::notification(
                WsEvent::LocalModelStateChanged,
                json!({ "state": state_json }),
            );
            let _ = mgr.send_to(&conn_id, &notification).await;
        }
        Ok(json!({ "ok": true }))
    }

    /// Delete a downloaded model file.
    async fn handle_local_model_delete(
        &self,
        conn_id: &str,
        req: infra::LocalModelDeleteRequest,
    ) -> Result<Value> {
        let manager = Arc::clone(&self.local_model_manager);
        manager
            .delete_model(&req.model_id)
            .await
            .map_err(|e| ServiceError::Processing(e.to_string()))?;
        if let Some(ref mgr) = self.ws_manager.get() {
            let state_json = serde_json::to_value(&manager.state()).unwrap_or(json!(null));
            let notification = infra::WsMessage::notification(
                WsEvent::LocalModelStateChanged,
                json!({ "state": state_json }),
            );
            let _ = mgr.send_to(conn_id, &notification).await;
        }
        Ok(json!({ "ok": true }))
    }

    /// Return the current runtime state.
    async fn handle_local_model_status(&self) -> Result<Value> {
        let state = self.local_model_manager.state();
        serde_json::to_value(&state).map_err(|e| ServiceError::Processing(e.to_string()))
    }
}

fn function_settings_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("function_settings.json")
}

/// Workspace deletion settings read from function_settings.json.
struct WorkspaceDeleteSettings {
    close_pr_on_delete: bool,
    close_issue_on_delete: bool,
    delete_remote_branch: bool,
}

impl Default for WorkspaceDeleteSettings {
    fn default() -> Self {
        Self {
            close_pr_on_delete: false,
            close_issue_on_delete: false,
            delete_remote_branch: false,
        }
    }
}

impl WorkspaceDeleteSettings {
    fn load() -> Self {
        let path = function_settings_path();
        let Ok(content) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            return Self::default();
        };
        let ws = value.get("workspace_settings");
        Self {
            close_pr_on_delete: ws
                .and_then(|v| v.get("close_pr_on_delete"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            close_issue_on_delete: ws
                .and_then(|v| v.get("close_issue_on_delete"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            delete_remote_branch: ws
                .and_then(|v| v.get("delete_remote_branch"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        }
    }
}

/// Workspace archive settings read from function_settings.json.
struct WorkspaceArchiveSettings {
    kill_tmux_on_archive: bool,
    close_acp_on_archive: bool,
}

impl Default for WorkspaceArchiveSettings {
    fn default() -> Self {
        Self {
            kill_tmux_on_archive: true,
            close_acp_on_archive: true,
        }
    }
}

impl WorkspaceArchiveSettings {
    fn load() -> Self {
        let path = function_settings_path();
        let Ok(content) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            return Self::default();
        };
        let ws = value.get("workspace_settings");
        Self {
            kill_tmux_on_archive: ws
                .and_then(|v| v.get("kill_tmux_on_archive"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
            close_acp_on_archive: ws
                .and_then(|v| v.get("close_acp_on_archive"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        }
    }
}

fn terminal_code_agent_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("agent")
        .join("terminal_code_agent.json")
}

/// Parse request data from JSON Value.
fn parse_request<T: serde::de::DeserializeOwned>(data: Value) -> Result<T> {
    serde_json::from_value(data)
        .map_err(|e| ServiceError::Validation(format!("Invalid request: {}", e)))
}

fn parse_agent_id(raw: &str) -> Result<AgentId> {
    match raw {
        "claude_code" => Ok(AgentId::ClaudeCode),
        "codex" => Ok(AgentId::Codex),
        "gemini_cli" => Ok(AgentId::GeminiCli),
        other => Err(ServiceError::Validation(format!(
            "Unsupported agent id: {}",
            other
        ))),
    }
}

/// Implement WsMessageHandler trait for dependency inversion.
#[async_trait]
impl WsMessageHandler for WsMessageService {
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String> {
        // Parse the incoming message
        let ws_msg = match WsMessage::from_json(message) {
            Ok(msg) => msg,
            Err(e) => {
                tracing::warn!("[WsMessageService] Invalid message from {}: {}", conn_id, e);
                return None;
            }
        };

        match ws_msg {
            WsMessage::Request(request) => {
                tracing::debug!(
                    "[WsMessageService] Processing request from {}: {:?}",
                    conn_id,
                    request.action
                );
                let response = self.process_request(conn_id, request).await;
                response.to_json().ok()
            }
            WsMessage::Ping => WsMessage::pong().to_json().ok(),
            WsMessage::Pong => None,
            _ => {
                tracing::warn!(
                    "[WsMessageService] Unexpected message type from {}",
                    conn_id
                );
                None
            }
        }
    }

    async fn on_connect(&self, conn_id: &str) {
        tracing::info!("[WsMessageService] Client connected: {}", conn_id);
    }

    async fn on_disconnect(&self, conn_id: &str) {
        tracing::info!("[WsMessageService] Client disconnected: {}", conn_id);
    }
}
