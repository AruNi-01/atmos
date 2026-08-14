//! WebSocket message service - handles all WebSocket business logic.
//!
//! This service processes incoming WebSocket requests and delegates to appropriate services.
//! All communication uses the Request/Response pattern with JSON messages.

mod agents;
mod automation;
mod disk_analyzer;
mod fs;
mod git;
mod github;
mod github_job_log_split;
mod group;
mod linear;
mod local_model;
mod local_services;
mod permission_access;
mod project;
mod quota;
mod review;
mod settings;
mod skills;
mod support;
mod terminal;
mod workspace;
mod workspace_cleanup;
mod workspace_gitignore;
mod workspace_notifications;
mod workspace_setup;

use std::sync::Arc;

use super::{message::*, WsManager, WsMessageHandler};
use async_trait::async_trait;
use core_engine::{FsEngine, GitEngine};
use core_service::service::canvas_agent_relay::{
    CanvasAgentDispatchOutcome, CanvasAgentRelay, CompleteDispatchResult,
};
use local_model_runtime::LocalRuntimeManager;
use quota_usage::QuotaUsageService;
use serde_json::{json, Value};
use tokio::sync::OnceCell;

use core_service::{
    AgentService, AgentSessionService, AutomationService, DiskAnalyzerService, GroupService,
    LinearService, LocalServicesService, NotificationService, ProjectService, ReviewService,
    TerminalService, WorkspaceService,
};
use core_service::{Result, ServiceError};
use sea_orm_migration::sea_orm::DatabaseConnection;
use support::{parse_request, WorkspaceArchiveSettings, WorkspaceDeleteSettings};

/// WebSocket message service for handling all business logic via WebSocket.
pub struct WsMessageService {
    fs_engine: FsEngine,
    git_engine: GitEngine,
    app_engine: core_engine::AppEngine,
    github_engine: core_engine::GithubEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    group_service: Arc<GroupService>,
    terminal_service: Arc<TerminalService>,
    agent_service: Arc<AgentService>,
    agent_session_service: Arc<AgentSessionService>,
    automation_service: Arc<AutomationService>,
    review_service: Arc<ReviewService>,
    quota_usage_service: Arc<QuotaUsageService>,
    canvas_agent_relay: Arc<CanvasAgentRelay>,
    local_services_service: Arc<LocalServicesService>,
    disk_analyzer_service: Arc<DiskAnalyzerService>,
    notification_service: Arc<NotificationService>,
    token_usage_service: Arc<token_usage::TokenUsageService>,
    linear_service: LinearService,
    ws_manager: OnceCell<Arc<WsManager>>,
    local_model_manager: Arc<LocalRuntimeManager>,
}

impl WsMessageService {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        group_service: Arc<GroupService>,
        terminal_service: Arc<TerminalService>,
        agent_service: Arc<AgentService>,
        agent_session_service: Arc<AgentSessionService>,
        automation_service: Arc<AutomationService>,
        review_service: Arc<ReviewService>,
        quota_usage_service: Arc<QuotaUsageService>,
        canvas_agent_relay: Arc<CanvasAgentRelay>,
        notification_service: Arc<NotificationService>,
        token_usage_service: Arc<token_usage::TokenUsageService>,
        db: Arc<DatabaseConnection>,
    ) -> Self {
        let local_services_service = Arc::new(LocalServicesService::new(
            Arc::clone(&project_service),
            Arc::clone(&workspace_service),
        ));
        let disk_analyzer_service = Arc::new(DiskAnalyzerService::new(
            Arc::clone(&project_service),
            Arc::clone(&workspace_service),
        ));

        Self {
            fs_engine: FsEngine::new(),
            git_engine: GitEngine::new(),
            app_engine: core_engine::AppEngine::new(),
            github_engine: core_engine::GithubEngine::new(),
            project_service,
            workspace_service,
            group_service,
            terminal_service,
            agent_service,
            agent_session_service,
            automation_service,
            review_service,
            quota_usage_service,
            canvas_agent_relay,
            local_services_service,
            disk_analyzer_service,
            notification_service,
            token_usage_service,
            linear_service: LinearService::new(db),
            ws_manager: OnceCell::new(),
            local_model_manager: Arc::new(LocalRuntimeManager::new()),
        }
    }

    pub fn disk_analyzer_service(&self) -> Arc<DiskAnalyzerService> {
        Arc::clone(&self.disk_analyzer_service)
    }

    pub fn local_services_service(&self) -> Arc<LocalServicesService> {
        Arc::clone(&self.local_services_service)
    }

    pub fn set_ws_manager(&self, manager: Arc<WsManager>) -> Result<()> {
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
                let error_code = match &e {
                    ServiceError::Validation(message) if message == "already_running" => {
                        "already_running"
                    }
                    ServiceError::Validation(_) => "validation_error",
                    ServiceError::NotFound(_) => "not_found",
                    _ => "error",
                };
                WsMessage::error(&request_id, error_code, e.to_string())
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
            WsAction::FsReadFiles => self.handle_fs_read_files(parse_request(request.data)?),
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
            WsAction::GitGetStatusBatch => {
                self.handle_git_get_status_batch(parse_request(request.data)?)
                    .await
            }
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
            WsAction::GitFilesDiff => {
                self.handle_git_files_diff(parse_request(request.data)?)
                    .await
            }
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
            WsAction::QuotaGetOverview => {
                self.handle_quota_get_overview(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaSetProviderSwitch => {
                self.handle_quota_set_provider_switch(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaSetProviderFooterCarousel => {
                self.handle_quota_set_provider_footer_carousel(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaSetAllProvidersSwitch => {
                self.handle_quota_set_all_providers_switch(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaApplyProviderVisibility => {
                self.handle_quota_apply_provider_visibility(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaSetProviderManualSetup => {
                self.handle_quota_set_provider_manual_setup(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaAddProviderApiKey => {
                self.handle_quota_add_provider_api_key(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaDeleteProviderApiKey => {
                self.handle_quota_delete_provider_api_key(parse_request(request.data)?)
                    .await
            }
            WsAction::QuotaSetAutoRefresh => {
                self.handle_quota_set_auto_refresh(parse_request(request.data)?)
                    .await
            }
            WsAction::TokenUsageOverviewGet => {
                self.handle_token_usage_overview_get(parse_request(request.data)?)
                    .await
            }
            WsAction::TokenUsageSetBrowserCookieConsent => {
                self.handle_token_usage_set_browser_cookie_consent(parse_request(request.data)?)
                    .await
            }
            WsAction::PermissionAccessList => self.handle_permission_access_list().await,
            WsAction::PermissionAccessSet => {
                self.handle_permission_access_set(parse_request(request.data)?)
                    .await
            }

            // Project
            WsAction::ProjectWorkspaceBootstrap => self.handle_project_workspace_bootstrap().await,
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

            // Group (APP-044)
            WsAction::GroupList => self.handle_group_list().await,
            WsAction::GroupCreate => self.handle_group_create(parse_request(request.data)?).await,
            WsAction::GroupUpdate => self.handle_group_update(parse_request(request.data)?).await,
            WsAction::GroupUpdateOrder => {
                self.handle_group_update_order(parse_request(request.data)?)
                    .await
            }
            WsAction::GroupDelete => self.handle_group_delete(parse_request(request.data)?).await,
            WsAction::GroupSetMember => {
                self.handle_group_set_member(parse_request(request.data)?)
                    .await
            }
            WsAction::GroupRemoveMember => {
                self.handle_group_remove_member(parse_request(request.data)?)
                    .await
            }
            WsAction::GroupUpdateMemberOrder => {
                self.handle_group_update_member_order(parse_request(request.data)?)
                    .await
            }

            // Script
            WsAction::ScriptGet => self.handle_script_get(parse_request(request.data)?).await,
            WsAction::ScriptSave => self.handle_script_save(parse_request(request.data)?).await,
            WsAction::ProjectScriptTrust => {
                self.handle_project_script_trust(conn_id, parse_request(request.data)?)
                    .await
            }

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

            // Terminal
            WsAction::RunLogStart => self.handle_run_log_start(parse_request(request.data)?),
            WsAction::RunLogResolveLatest => {
                self.handle_run_log_resolve_latest(parse_request(request.data)?)
            }
            WsAction::TerminalWorkspaceCandidates => {
                self.handle_terminal_workspace_candidates(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalSideContextCapture => {
                self.handle_terminal_side_context_capture(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalSideChatList => {
                self.handle_terminal_side_chat_list(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalSideChatUpsert => {
                self.handle_terminal_side_chat_upsert(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalSideChatStatusUpdate => {
                self.handle_terminal_side_chat_status_update(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalSideChatClose => {
                self.handle_terminal_side_chat_close(parse_request(request.data)?)
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
            WsAction::ReviewFileContentGetBatch => {
                self.handle_review_file_content_get_batch(parse_request(request.data)?)
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
            WsAction::SkillsScanRoot => {
                self.handle_skills_scan_root(parse_request(request.data)?)
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
            WsAction::ReviewSkillsList => self.handle_review_skills_list().await,
            WsAction::ReviewSkillsScaffold => self.handle_review_skills_scaffold().await,
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

            // Automation
            WsAction::AutomationList => {
                self.handle_automation_list(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationGet => {
                self.handle_automation_get(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationCreate => {
                self.handle_automation_create(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationUpdate => {
                self.handle_automation_update(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationDelete => {
                self.handle_automation_delete(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationRunNow => {
                self.handle_automation_run_now(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationPause => {
                self.handle_automation_pause(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationResume => {
                self.handle_automation_resume(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationCancelRun => {
                self.handle_automation_cancel_run(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationRunList => {
                self.handle_automation_run_list(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationRunGet => {
                self.handle_automation_run_get(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationArtifactGet => {
                self.handle_automation_artifact_get(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationContinueInTerminal => {
                self.handle_automation_continue_in_terminal(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationAgentCapabilities => {
                self.handle_automation_agent_capabilities().await
            }
            WsAction::AutomationSchedulePreview => {
                self.handle_automation_schedule_preview(parse_request(request.data)?)
                    .await
            }
            WsAction::AutomationGithubSetupSession => {
                self.handle_automation_github_setup_session(request.data)
                    .await
            }
            WsAction::AutomationGithubInstallations => {
                self.handle_automation_github_installations(request.data)
                    .await
            }
            WsAction::AutomationGithubRepositories => {
                self.handle_automation_github_repositories(request.data)
                    .await
            }
            WsAction::AutomationGithubEventRouteUpsert => {
                self.handle_automation_github_event_route_upsert(request.data)
                    .await
            }
            WsAction::AutomationGithubEventRouteDelete => {
                self.handle_automation_github_event_route_delete(request.data)
                    .await
            }

            // GitHub
            WsAction::GithubPrList => {
                self.handle_github_pr_list(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrBranchPage => {
                self.handle_github_pr_branch_page(parse_request(request.data)?)
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
            WsAction::GithubRepoLabels => {
                self.handle_github_repo_labels(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubRepoAssignees => {
                self.handle_github_repo_assignees(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubUserCard => {
                self.handle_github_user_card(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubRateLimit => self.handle_github_rate_limit().await,

            // Linear (APP-056)
            WsAction::LinearStatus => {
                self.handle_linear_status(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearConnectApiKey => {
                self.handle_linear_connect_api_key(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearOauthStart => {
                self.handle_linear_oauth_start(parse_request(request.data)?)
            }
            WsAction::LinearOauthFinish => {
                self.handle_linear_oauth_finish(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearDisconnect => {
                self.handle_linear_disconnect(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearRateLimit => {
                self.handle_linear_rate_limit(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearIssueList => {
                self.handle_linear_issue_list(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearFilterOptions => {
                self.handle_linear_filter_options(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearLinkIssue => {
                self.handle_linear_link_issue(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearUnlinkIssue => {
                self.handle_linear_unlink_issue(parse_request(request.data)?)
                    .await
            }
            WsAction::LinearLinksForWorkspace => {
                self.handle_linear_links_for_workspace(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrUpdateLabels => {
                self.handle_github_pr_update_labels(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrUpdateAssignees => {
                self.handle_github_pr_update_assignees(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrUpdateLinkedIssues => {
                self.handle_github_pr_update_linked_issues(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueList => {
                self.handle_github_issue_list(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubSearch => {
                self.handle_github_search(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueTemplates => {
                self.handle_github_issue_templates(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueCreate => {
                self.handle_github_issue_create(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssuePage => {
                self.handle_github_issue_page(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueUpdateLabels => {
                self.handle_github_issue_update_labels(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueUpdateAssignees => {
                self.handle_github_issue_update_assignees(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueComment => {
                self.handle_github_issue_comment(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueClose => {
                self.handle_github_issue_close(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueReopen => {
                self.handle_github_issue_reopen(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueGet => {
                self.handle_github_issue_get(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueTimelinePage => {
                self.handle_github_issue_timeline_page(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubIssueLinkedPrs => {
                self.handle_github_issue_linked_prs(parse_request(request.data)?)
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
            WsAction::GithubActionsJobLogs => {
                self.handle_github_actions_job_logs(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrFiles => {
                self.handle_github_pr_files(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrConflictFiles => {
                self.handle_github_pr_conflict_files(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubCommitDetail => {
                self.handle_github_commit_detail(parse_request(request.data)?)
                    .await
            }

            // Function settings
            WsAction::SettingsBootstrapGet => self.handle_settings_bootstrap_get().await,
            WsAction::FunctionSettingsGet => self.handle_function_settings_get().await,
            WsAction::FunctionSettingsUpdate => {
                self.handle_function_settings_update(parse_request(request.data)?)
                    .await
            }
            WsAction::TerminalAgentModelsGet => {
                self.handle_terminal_agent_models_get(parse_request(request.data)?)
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

            // Notification settings
            WsAction::NotificationSettingsGet => self.handle_notification_settings_get(),
            WsAction::NotificationSettingsUpdate => {
                self.handle_notification_settings_update(parse_request(request.data)?)
            }
            WsAction::NotificationTestPush => {
                self.handle_notification_test_push(parse_request(request.data)?)
                    .await
            }

            // ===== Local Services =====
            WsAction::LocalServicesScan => {
                self.handle_local_services_scan(parse_request(request.data)?)
                    .await
            }
            WsAction::LocalServicesStop => {
                self.handle_local_services_stop(parse_request(request.data)?)
                    .await
            }

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

            // Disk Analyzer (APP-042)
            WsAction::DiskAnalyzerStartScan => {
                self.handle_disk_analyzer_start_scan(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::DiskAnalyzerCancelScan => {
                self.handle_disk_analyzer_cancel_scan(conn_id, parse_request(request.data)?)
            }
            WsAction::DiskAnalyzerGetTree => {
                self.handle_disk_analyzer_get_tree(conn_id, parse_request(request.data)?)
            }
            WsAction::DiskAnalyzerGetSuggestions => {
                self.handle_disk_analyzer_get_suggestions(conn_id, parse_request(request.data)?)
            }
            WsAction::DiskAnalyzerDelete => {
                self.handle_disk_analyzer_delete(conn_id, parse_request(request.data)?)
                    .await
            }
            WsAction::DiskAnalyzerDiskInfo => {
                self.handle_disk_analyzer_disk_info(parse_request(request.data)?)
            }
        }
    }

    // ===== App Handlers =====

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
            req.active_document_file_name,
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
        self.disk_analyzer_service
            .remove_connection_sessions(conn_id);
    }
}
