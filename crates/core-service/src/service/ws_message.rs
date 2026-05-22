//! WebSocket message service - handles all WebSocket business logic.
//!
//! This service processes incoming WebSocket requests and delegates to appropriate services.
//! All communication uses the Request/Response pattern with JSON messages.

mod agents;
mod fs;
mod git;
mod github;
mod local_model;
mod project;
mod review;
mod settings;
mod skills;
mod usage;
mod workspace;
mod workspace_cleanup;
mod workspace_gitignore;
mod workspace_notifications;
mod workspace_setup;

use std::sync::Arc;

use crate::service::canvas_agent_relay::{
    CanvasAgentDispatchOutcome, CanvasAgentRelay, CompleteDispatchResult,
};
use crate::{CanvasService, SaveCanvasBoardReq};
use ai_usage::UsageService;
use async_trait::async_trait;
use core_engine::{FsEngine, GitEngine};
#[allow(unused_imports)]
use infra::{
    AgentBehaviourSettingsUpdateRequest, AgentConfigGetRequest, AgentConfigSetRequest,
    AgentInstallRequest, AgentRegistryInstallRequest, AgentRegistryListRequest,
    AgentRegistryRemoveRequest, AppOpenRequest, CanvasAgentDispatchResultRequest,
    CanvasBoardResponse, CanvasBridgeRegisterRequest, CanvasBridgeUnregisterRequest,
    CanvasUpdateDefaultBoardRequest, CodeAgentCustomUpdateRequest, CustomAgentAddRequest,
    CustomAgentRemoveRequest, CustomAgentSetJsonRequest, FsCreateDirRequest, FsDeletePathRequest,
    FsDuplicatePathRequest, FsListDirRequest, FsListProjectFilesRequest, FsReadFileRequest,
    FsRenamePathRequest, FsSearchContentRequest, FsSearchDirsRequest, FsValidateGitPathRequest,
    FsWriteFileRequest, FunctionSettingsUpdateRequest, GitChangedFilesRequest, GitCommitRequest,
    GitDiscardUnstagedRequest, GitDiscardUntrackedRequest, GitFetchRequest, GitFileDiffRequest,
    GitGenerateCommitMessageRequest, GitGetCommitCountRequest, GitGetHeadCommitRequest,
    GitGetStatusRequest, GitListBranchesRequest, GitLogRequest, GitPatchChunkRequest,
    GitPullRequest, GitPushRequest, GitRenameBranchRequest, GitStageRequest, GitSyncRequest,
    GitUnstageRequest, GithubActionsDetailRequest, GithubActionsListRequest,
    GithubActionsRerunRequest, GithubCiOpenBrowserRequest, GithubCiStatusRequest,
    GithubIssueGetRequest, GithubIssueLabelPayload, GithubIssueListRequest, GithubIssuePayload,
    GithubPrCloseRequest, GithubPrCommentRequest, GithubPrCreateRequest, GithubPrDetailRequest,
    GithubPrDraftRequest, GithubPrFilesRequest, GithubPrGetRequest, GithubPrListRepoRequest,
    GithubPrListRequest, GithubPrMergeRequest, GithubPrOpenBrowserRequest, GithubPrPayload,
    GithubPrReadyRequest, GithubPrReopenRequest, GithubPrTimelinePageRequest,
    LlmProviderTestRequest, LlmProvidersUpdateRequest, LocalModelCustomAddRequest,
    LocalModelCustomDeleteRequest, LocalModelDeleteRequest, LocalModelDeleteRuntimeRequest,
    LocalModelDownloadRequest, LocalModelResolveHfUrlRequest, LocalModelStartRequest,
    ProjectCheckCanDeleteRequest, ProjectCreateRequest, ProjectDeleteProgressNotification,
    ProjectDeleteRequest, ProjectUpdateOrderRequest, ProjectUpdateRequest,
    ProjectUpdateTargetBranchRequest, ReviewAgentRunArtifactGetRequest,
    ReviewAgentRunCreateRequest, ReviewAgentRunFinalizeRequest, ReviewAgentRunListRequest,
    ReviewAgentRunSetStatusRequest, ReviewCommentCreateRequest, ReviewCommentListRequest,
    ReviewCommentUpdateStatusRequest, ReviewFileContentGetRequest, ReviewFileListRequest,
    ReviewFileSetReviewedRequest, ReviewMessageAddRequest, ReviewMessageDeleteRequest,
    ReviewMessageUpdateRequest, ReviewSessionActivateRequest, ReviewSessionArchiveRequest,
    ReviewSessionCloseRequest, ReviewSessionCreateRequest, ReviewSessionGetRequest,
    ReviewSessionListRequest, ReviewSessionRenameRequest, ScriptGetRequest, ScriptSaveRequest,
    SkillsDeleteRequest, SkillsGetRequest, SkillsListRequest, SkillsSetEnabledRequest,
    SyncSingleSystemSkillRequest, UsageAddProviderApiKeyRequest, UsageAllProvidersSwitchRequest,
    UsageAutoRefreshRequest, UsageDeleteProviderApiKeyRequest, UsageOverviewRequest,
    UsageProviderFooterCarouselRequest, UsageProviderManualSetupRequest,
    UsageProviderSwitchRequest, WorkspaceArchiveRequest, WorkspaceConfirmTodosRequest,
    WorkspaceCreateRequest, WorkspaceDeleteProgressNotification, WorkspaceDeleteRequest,
    WorkspaceGitignoreSyncFailedNotification, WorkspaceImportGithubIssuesRequest,
    WorkspaceLabelCreateRequest, WorkspaceLabelDeleteRequest, WorkspaceLabelListRequest,
    WorkspaceLabelRestoreRequest, WorkspaceLabelUpdateRequest, WorkspaceListRequest,
    WorkspaceMarkVisitedRequest, WorkspacePinRequest, WorkspaceRetrySetupRequest,
    WorkspaceSetupContextNotification, WorkspaceSetupProgressNotification,
    WorkspaceSkipSetupScriptRequest, WorkspaceSkipSetupStepRequest, WorkspaceUnarchiveRequest,
    WorkspaceUnpinRequest, WorkspaceUpdateBranchRequest, WorkspaceUpdateLabelsRequest,
    WorkspaceUpdateNameRequest, WorkspaceUpdateOrderRequest, WorkspaceUpdatePinOrderRequest,
    WorkspaceUpdatePriorityRequest, WorkspaceUpdateWorkflowStatusRequest, WsAction, WsEvent,
    WsMessage, WsMessageHandler, WsRequest,
};
use local_model_runtime::LocalRuntimeManager;
use serde_json::{Value, json};
use tokio::sync::OnceCell;

use crate::error::{Result, ServiceError};
use crate::service::ws_message_support::{
    WorkspaceArchiveSettings, WorkspaceDeleteSettings, parse_request,
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
    canvas_service: Arc<CanvasService>,
    canvas_agent_relay: Arc<CanvasAgentRelay>,
    ws_manager: OnceCell<Arc<infra::WsManager>>,
    local_model_manager: Arc<LocalRuntimeManager>,
}

impl WsMessageService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        terminal_service: Arc<TerminalService>,
        agent_service: Arc<AgentService>,
        agent_session_service: Arc<AgentSessionService>,
        review_service: Arc<ReviewService>,
        usage_service: Arc<UsageService>,
        canvas_service: Arc<CanvasService>,
        canvas_agent_relay: Arc<CanvasAgentRelay>,
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
            canvas_service,
            canvas_agent_relay,
            ws_manager: OnceCell::new(),
            local_model_manager: Arc::new(LocalRuntimeManager::new()),
        }
    }

    /// Expose the bridge relay so HTTP handlers can resolve targets and
    /// register pending waiters without re-implementing the routing rules.
    pub fn canvas_agent_relay(&self) -> Arc<CanvasAgentRelay> {
        Arc::clone(&self.canvas_agent_relay)
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

            // Canvas
            WsAction::CanvasGetDefaultBoard => self.handle_canvas_get_default_board().await,
            WsAction::CanvasUpdateDefaultBoard => {
                self.handle_canvas_update_default_board(parse_request(request.data)?)
                    .await
            }
            WsAction::CanvasBridgeRegister => {
                self.handle_canvas_bridge_register(conn_id, parse_request(request.data)?)
            }
            WsAction::CanvasBridgeUnregister => {
                self.handle_canvas_bridge_unregister(conn_id, parse_request(request.data)?)
            }
            WsAction::CanvasAgentDispatchResult => {
                self.handle_canvas_agent_dispatch_result(conn_id, parse_request(request.data)?)
            }

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
            WsAction::GitStagePatchChunk => {
                self.handle_git_stage_patch_chunk(parse_request(request.data)?)
            }
            WsAction::GitRestorePatchChunk => {
                self.handle_git_restore_patch_chunk(parse_request(request.data)?)
            }
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
            WsAction::WorkspaceImportGithubIssues => {
                self.handle_workspace_import_github_issues(parse_request(request.data)?)
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
            WsAction::WorkspaceLabelList => {
                self.handle_workspace_label_list(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelCreate => {
                self.handle_workspace_label_create(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelUpdate => {
                self.handle_workspace_label_update(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelDelete => {
                self.handle_workspace_label_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceLabelRestore => {
                self.handle_workspace_label_restore(parse_request(request.data)?)
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
            WsAction::SkillsList => {
                // Legacy callers may omit the payload entirely. Treat `null` as "default
                // request" (force_refresh = false) so existing frontends keep working.
                let req: SkillsListRequest = if request.data.is_null() {
                    SkillsListRequest::default()
                } else {
                    parse_request(request.data)?
                };
                self.handle_skills_list(req).await
            }
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
            WsAction::GithubPrFiles => {
                self.handle_github_pr_files(parse_request(request.data)?)
                    .await
            }

            // Function settings
            WsAction::FunctionSettingsGet => self.handle_function_settings_get().await,
            WsAction::FunctionSettingsUpdate => {
                self.handle_function_settings_update(parse_request(request.data)?)
                    .await
            }
            WsAction::WorkspaceGitignoreDirsGet => self.handle_workspace_gitignore_dirs_get().await,
            WsAction::WorkspaceGitignoreDirsUpdate => {
                self.handle_workspace_gitignore_dirs_update(parse_request(request.data)?)
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
            WsAction::LocalModelRefresh => self.handle_local_model_refresh().await,
            WsAction::LocalModelRuntimeDownload => {
                self.handle_local_model_runtime_download(conn_id).await
            }
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
            WsAction::LocalModelDeleteRuntime => {
                self.handle_local_model_delete_runtime(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelStatus => self.handle_local_model_status().await,
            WsAction::LocalModelResolveHfUrl => {
                self.handle_local_model_resolve_hf_url(parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelCustomAdd => {
                self.handle_local_model_custom_add(parse_request(request.data)?)
                    .await
            }
            WsAction::LocalModelCustomDelete => {
                self.handle_local_model_custom_delete(parse_request(request.data)?)
                    .await
            }
        }
    }

    // ===== App Handlers =====

    // ===== Canvas Handlers =====

    async fn handle_canvas_get_default_board(&self) -> Result<Value> {
        let board = self.canvas_service.get_default_board().await?;
        Ok(json!(CanvasBoardResponse {
            guid: board.guid,
            slug: board.slug,
            name: board.name,
            document_json: board.document_json,
            updated_at: board.updated_at,
        }))
    }

    async fn handle_canvas_update_default_board(
        &self,
        req: CanvasUpdateDefaultBoardRequest,
    ) -> Result<Value> {
        let board = self
            .canvas_service
            .save_default_board(SaveCanvasBoardReq {
                document_json: req.document_json,
            })
            .await?;
        Ok(json!(CanvasBoardResponse {
            guid: board.guid,
            slug: board.slug,
            name: board.name,
            document_json: board.document_json,
            updated_at: board.updated_at,
        }))
    }

    // ===== APP-015: Canvas terminal-agent bridge =====

    fn handle_canvas_bridge_register(
        &self,
        conn_id: &str,
        req: CanvasBridgeRegisterRequest,
    ) -> Result<Value> {
        self.canvas_agent_relay.register(
            conn_id,
            req.client_id.clone(),
            req.label,
            req.accepts_commands,
            req.capabilities,
        );
        Ok(json!({
            "ok": true,
            "client_id": req.client_id,
            "conn_id": conn_id,
        }))
    }

    fn handle_canvas_bridge_unregister(
        &self,
        conn_id: &str,
        req: CanvasBridgeUnregisterRequest,
    ) -> Result<Value> {
        self.canvas_agent_relay.unregister(conn_id, &req.client_id);
        Ok(json!({ "ok": true, "client_id": req.client_id }))
    }

    fn handle_canvas_agent_dispatch_result(
        &self,
        conn_id: &str,
        req: CanvasAgentDispatchResultRequest,
    ) -> Result<Value> {
        let outcome = CanvasAgentDispatchOutcome {
            success: req.success,
            error_code: req.error_code,
            error_message: req.error_message,
            recoverable: req.recoverable,
            data: req.data,
        };
        let result = self
            .canvas_agent_relay
            .complete_dispatch(&req.request_id, conn_id, outcome);
        match result {
            CompleteDispatchResult::Completed => Ok(json!({
                "ok": true,
                "completed": true,
                "request_id": req.request_id,
            })),
            CompleteDispatchResult::Unknown => Ok(json!({
                "ok": true,
                "completed": false,
                "request_id": req.request_id,
            })),
            CompleteDispatchResult::ConnMismatch => {
                tracing::warn!(
                    "canvas_agent: rejected dispatch_result for {} from foreign conn {}",
                    req.request_id,
                    conn_id
                );
                Err(ServiceError::Validation(format!(
                    "canvas_agent: request_id {} is owned by another connection",
                    req.request_id
                )))
            }
        }
    }

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
        // APP-015: drop any canvas-bridge registrations associated with this conn
        self.canvas_agent_relay.unregister_conn(conn_id);
    }
}
