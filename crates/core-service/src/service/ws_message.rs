//! WebSocket message service - handles all WebSocket business logic.
//!
//! This service processes incoming WebSocket requests and delegates to appropriate services.
//! All communication uses the Request/Response pattern with JSON messages.

use std::sync::Arc;
use std::time::Instant;

use agent::{AgentId, CustomAgent};
use ai_usage::UsageService;
use async_trait::async_trait;
use core_engine::{FsEngine, GitEngine};
use infra::{
    AgentConfigGetRequest, AgentConfigSetRequest, AgentInstallRequest, AgentRegistryInstallRequest,
    AgentRegistryListRequest, AgentRegistryRemoveRequest, AppOpenRequest, CustomAgentAddRequest,
    CustomAgentRemoveRequest, CustomAgentSetJsonRequest, FsListDirRequest,
    FsListProjectFilesRequest, FsReadFileRequest, FsSearchContentRequest, FsSearchDirsRequest,
    FsValidateGitPathRequest, FsWriteFileRequest, FunctionSettingsUpdateRequest,
    GitChangedFilesRequest, GitCommitRequest, GitDiscardUnstagedRequest,
    GitDiscardUntrackedRequest, GitFetchRequest, GitFileDiffRequest,
    GitGenerateCommitMessageRequest, GitGetCommitCountRequest, GitGetHeadCommitRequest,
    GitGetStatusRequest, GitListBranchesRequest, GitLogRequest, GitPullRequest, GitPushRequest,
    GitRenameBranchRequest, GitStageRequest, GitSyncRequest, GitUnstageRequest,
    GithubActionsDetailRequest, GithubActionsListRequest, GithubActionsRerunRequest,
    GithubCiOpenBrowserRequest, GithubCiStatusRequest, GithubPrCloseRequest,
    GithubPrCommentRequest, GithubPrCreateRequest, GithubPrDetailRequest, GithubPrDraftRequest,
    GithubPrListRequest, GithubPrMergeRequest, GithubPrOpenBrowserRequest, GithubPrReadyRequest,
    GithubPrReopenRequest, LlmProvidersUpdateRequest, ProjectCheckCanDeleteRequest,
    ProjectCreateRequest, ProjectDeleteRequest, ProjectUpdateOrderRequest, ProjectUpdateRequest,
    ProjectUpdateTargetBranchRequest, ScriptGetRequest, ScriptSaveRequest, SkillsDeleteRequest,
    SkillsGetRequest, SkillsSetEnabledRequest, SyncSingleSystemSkillRequest,
    UsageAllProvidersSwitchRequest, UsageAutoRefreshRequest, UsageOverviewRequest,
    UsageProviderManualSetupRequest, UsageProviderSwitchRequest, WorkspaceArchiveRequest,
    WorkspaceCreateRequest, WorkspaceDeleteRequest, WorkspaceListRequest, WorkspacePinRequest,
    WorkspaceRetrySetupRequest, WorkspaceSetupProgressNotification, WorkspaceUnarchiveRequest,
    WorkspaceUnpinRequest, WorkspaceUpdateBranchRequest, WorkspaceUpdateNameRequest,
    WorkspaceUpdateOrderRequest, WsAction, WsEvent, WsMessage, WsMessageHandler, WsRequest,
};
use llm::{FileLlmConfigStore, LlmProvidersFile};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::{json, Value};
use std::io::Read;
use tokio::sync::OnceCell;

use crate::error::{Result, ServiceError};
use crate::service::git_commit_message::GitCommitMessageGenerator;
use crate::{AgentService, ProjectService, WorkspaceService};

/// WebSocket message service for handling all business logic via WebSocket.
pub struct WsMessageService {
    fs_engine: FsEngine,
    git_engine: GitEngine,
    app_engine: core_engine::AppEngine,
    github_engine: core_engine::GithubEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    agent_service: Arc<AgentService>,
    usage_service: Arc<UsageService>,
    ws_manager: OnceCell<Arc<infra::WsManager>>,
}

impl WsMessageService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        agent_service: Arc<AgentService>,
        usage_service: Arc<UsageService>,
    ) -> Self {
        Self {
            fs_engine: FsEngine::new(),
            git_engine: GitEngine::new(),
            app_engine: core_engine::AppEngine::new(),
            github_engine: core_engine::GithubEngine::new(),
            project_service,
            workspace_service,
            agent_service,
            usage_service,
            ws_manager: OnceCell::new(),
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
                self.handle_git_generate_commit_message(
                    conn_id,
                    parse_request(request.data)?,
                )
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
            WsAction::UsageSetAllProvidersSwitch => {
                self.handle_usage_set_all_providers_switch(parse_request(request.data)?)
                    .await
            }
            WsAction::UsageSetProviderManualSetup => {
                self.handle_usage_set_provider_manual_setup(parse_request(request.data)?)
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
            WsAction::WorkspaceUpdateOrder => {
                self.handle_workspace_update_order(parse_request(request.data)?)
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
            WsAction::ProjectCheckCanDelete => {
                self.handle_project_check_can_delete(parse_request(request.data)?)
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
                self.handle_skills_delete(parse_request(request.data)?).await
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
                self.handle_github_pr_list(parse_request(request.data)?)
                    .await
            }
            WsAction::GithubPrDetail => {
                self.handle_github_pr_detail(parse_request(request.data)?)
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
            "has_unpushed_commits": status.has_unpushed_commits,
            "uncommitted_count": status.uncommitted_count,
            "unpushed_count": status.unpushed_count,
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
            .get_changed_files(&path)
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
        }))
    }

    fn handle_git_file_diff(&self, req: GitFileDiffRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let diff = self
            .git_engine
            .get_file_diff(&path, &req.file_path)
            .map_err(|e| ServiceError::Validation(format!("Failed to get file diff: {}", e)))?;

        Ok(json!({
            "file_path": diff.file_path,
            "old_content": diff.old_content,
            "new_content": diff.new_content,
            "status": diff.status,
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
            .get_changed_files(&path)
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
        self.project_service.delete_project(req.guid).await?;
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
                req.name,
                req.branch,
                req.sidebar_order,
            )
            .await?;

        // Spawn setup in background
        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = req.project_guid.clone();
            let workspace_name = workspace.model.name.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::run_setup_process(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    false,
                )
                .await;
            });
        }

        Ok(json!(workspace))
    }

    async fn handle_workspace_update_name(&self, req: WorkspaceUpdateNameRequest) -> Result<Value> {
        self.workspace_service
            .update_name(req.guid, req.name)
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

    async fn handle_workspace_update_order(
        &self,
        req: WorkspaceUpdateOrderRequest,
    ) -> Result<Value> {
        self.workspace_service
            .update_order(req.guid, req.sidebar_order)
            .await?;
        Ok(json!({ "success": true }))
    }

    async fn handle_workspace_delete(&self, req: WorkspaceDeleteRequest) -> Result<Value> {
        self.workspace_service.delete_workspace(req.guid).await?;
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

    async fn handle_workspace_archive(&self, req: WorkspaceArchiveRequest) -> Result<Value> {
        self.workspace_service.archive_workspace(req.guid).await?;
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
                "branch": ws.model.branch,
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

        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::run_setup_process(
                    manager,
                    project_service,
                    workspace_service,
                    conn_id,
                    project_guid,
                    workspace_id,
                    workspace_name,
                    true,
                )
                .await;
            });
        }

        Ok(json!({ "success": true }))
    }

    // ===== Setup Process Helper =====

    #[allow(clippy::too_many_arguments)]
    async fn run_setup_process(
        manager: Arc<infra::WsManager>,
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
        conn_id: String,
        project_guid: String,
        workspace_id: String,
        workspace_name: String,
        _skip_creation: bool, // We pretty much always run creation check now, but keep param for compatibility
    ) {
        // 1. Initial notification: Creating
        let _ = manager
            .send_to(
                &conn_id,
                &WsMessage::notification(
                    WsEvent::WorkspaceSetupProgress,
                    json!(WorkspaceSetupProgressNotification {
                        workspace_id: workspace_id.clone(),
                        status: "creating".to_string(),
                        step_title: "Creating Workspace".to_string(),
                        output: None,
                        success: true,
                        countdown: None,
                    }),
                ),
            )
            .await;

        // Asynchronously ensure worktree is ready (this was previously blocking in create_workspace)
        if let Err(e) = workspace_service
            .ensure_worktree_ready(workspace_id.clone())
            .await
        {
            let _ = manager
                .send_to(
                    &conn_id,
                    &WsMessage::notification(
                        WsEvent::WorkspaceSetupProgress,
                        json!(WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "error".to_string(),
                            step_title: "Workspace Creation Failed".to_string(),
                            output: Some(format!(
                                "\r\n\x1b[31mError creating worktree: {}\x1b[0m\r\n",
                                e
                            )),
                            success: false,
                            countdown: None,
                        }),
                    ),
                )
                .await;
            return;
        }

        // 2. Load project to get script

        // 2. Load project to get script
        let project = match project_service.get_project(project_guid).await {
            Ok(Some(p)) => p,
            _ => return,
        };

        let project_root = std::path::Path::new(&project.main_file_path);
        let scripts_path = project_root.join(".atmos/scripts/atmos.json");

        let setup_script = if scripts_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&scripts_path) {
                let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));
                json["setup"].as_str().map(|s| s.to_string())
            } else {
                None
            }
        } else {
            None
        };

        let workspace_path = GitEngine::new()
            .get_worktree_path(&workspace_name)
            .unwrap_or_default();

        if let Some(script) = setup_script {
            // 3. Status: Setting Up
            let _ = manager
                .send_to(
                    &conn_id,
                    &WsMessage::notification(
                        WsEvent::WorkspaceSetupProgress,
                        json!(WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id.clone(),
                            status: "setting_up".to_string(),
                            step_title: "Running Setup Script".to_string(),
                            output: Some(format!("\r\n$ Running setup script: {}\r\n", script)),
                            success: true,
                            countdown: None,
                        }),
                    ),
                )
                .await;

            // Run in PTY
            let result = Self::execute_script_in_pty(
                &manager,
                &conn_id,
                &workspace_id,
                &script,
                &workspace_path,
                &project.main_file_path,
            )
            .await;

            if let Err(e) = result {
                let _ = manager
                    .send_to(
                        &conn_id,
                        &WsMessage::notification(
                            WsEvent::WorkspaceSetupProgress,
                            json!(WorkspaceSetupProgressNotification {
                                workspace_id: workspace_id.clone(),
                                status: "error".to_string(),
                                step_title: "Setup Failed".to_string(),
                                output: Some(format!("\r\n\x1b[31mError: {}\x1b[0m\r\n", e)),
                                success: false,
                                countdown: None,
                            }),
                        ),
                    )
                    .await;
                return;
            }
        }

        // 4. Status: Completed
        let _ = manager
            .send_to(
                &conn_id,
                &WsMessage::notification(
                    WsEvent::WorkspaceSetupProgress,
                    json!(WorkspaceSetupProgressNotification {
                        workspace_id: workspace_id.clone(),
                        status: "completed".to_string(),
                        step_title: "Ready to Build".to_string(),
                        output: None,
                        success: true,
                        countdown: None,
                    }),
                ),
            )
            .await;
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

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        // Run as login shell to load user environment (~/.zprofile, ~/.zshrc, etc.)
        // Note: some shells need -l or --login
        if shell.contains("zsh") || shell.contains("bash") {
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
        let manager_clone = manager.clone();
        let conn_id_clone = conn_id.to_string();
        let workspace_id_clone = workspace_id.to_string();

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

        // Reading task
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let s = String::from_utf8_lossy(&buf[..n]).to_string();
                if tx.send(s).is_err() {
                    break;
                }
            }
        });

        while let Some(output) = rx.recv().await {
            let _ = manager_clone
                .send_to(
                    &conn_id_clone,
                    &WsMessage::notification(
                        WsEvent::WorkspaceSetupProgress,
                        json!(WorkspaceSetupProgressNotification {
                            workspace_id: workspace_id_clone.clone(),
                            status: "setting_up".to_string(),
                            step_title: "Running Setup Script".to_string(),
                            output: Some(output),
                            success: true,
                            countdown: None,
                        }),
                    ),
                )
                .await;
        }

        // Wait, I didn't define WsEvent correctly if I use WsEvent::WorkspaceSetupProgress directly
        // Let me re-check my previous edit of message.rs

        let status = child.wait()?;
        if !status.success() {
            anyhow::bail!("Script exited with status {}", status);
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

        SkillManager::set_enabled(&project_paths, &req.id, req.enabled)?;

        Ok(json!({ "success": true }))
    }

    async fn handle_skills_delete(&self, req: SkillsDeleteRequest) -> Result<Value> {
        use crate::service::skill::SkillManager;

        let projects = self.project_service.list_projects().await?;
        let project_paths: Vec<(String, String, String)> = projects
            .iter()
            .map(|p| (p.guid.clone(), p.name.clone(), p.main_file_path.clone()))
            .collect();

        SkillManager::delete(&project_paths, &req.id)?;

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
            infra::utils::system_skill_sync::sync_system_skills_on_startup();
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

    async fn handle_github_pr_list(&self, req: GithubPrListRequest) -> Result<Value> {
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

        Ok(json!(unique_prs))
    }

    async fn handle_github_pr_detail(&self, req: GithubPrDetailRequest) -> Result<Value> {
        let pr_num_str = req.pr_number.to_string();
        let repo_arg = format!("{}/{}", req.owner, req.repo);
        let args = vec!["pr", "view", &pr_num_str, "--repo", &repo_arg, "--json", "number,title,body,state,mergeable,reviewDecision,baseRefName,headRefName,createdAt,url,statusCheckRollup,comments,reviews,author,commits,isDraft"];
        let mut output = self
            .github_engine
            .run_gh(&args)
            .await
            .map_err(|e| ServiceError::Validation(format!("Failed to get PR detail: {}", e)))?;

        // Fetch timeline for activities
        let timeline_endpoint = format!(
            "repos/{}/{}/issues/{}/timeline?per_page=100",
            req.owner, req.repo, req.pr_number
        );
        let timeline_args = vec!["api", &timeline_endpoint];
        if let Ok(timeline) = self.github_engine.run_gh(&timeline_args).await {
            if let Some(obj) = output.as_object_mut() {
                obj.insert("timeline".to_string(), timeline);
            }
        } else {
            // Log error if timeline fetch fails but don't fail the whole request
            println!(
                "Warning: Failed to fetch timeline for PR #{}",
                req.pr_number
            );
        }

        Ok(output)
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
}

fn function_settings_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("function_settings.json")
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
