//! WebSocket message service - handles all WebSocket business logic.
//!
//! This service processes incoming WebSocket requests and delegates to appropriate services.
//! All communication uses the Request/Response pattern with JSON messages.

use std::sync::Arc;

use async_trait::async_trait;
use core_engine::{FsEngine, GitEngine};
use infra::{
    AppOpenRequest, FsListDirRequest, FsListProjectFilesRequest, FsReadFileRequest, 
    FsSearchContentRequest, FsValidateGitPathRequest, FsWriteFileRequest,
    GitChangedFilesRequest, GitCommitRequest, GitFileDiffRequest, GitGetStatusRequest,
    GitListBranchesRequest, GitPushRequest, GitRenameBranchRequest, 
    GitStageRequest, GitUnstageRequest, GitDiscardUnstagedRequest, GitDiscardUntrackedRequest,
    GitPullRequest, GitFetchRequest, GitSyncRequest,
    ProjectCreateRequest, ProjectDeleteRequest, ProjectUpdateRequest, 
    ProjectUpdateTargetBranchRequest, ProjectUpdateOrderRequest, ProjectCheckCanDeleteRequest,
    WorkspaceArchiveRequest, WorkspaceCreateRequest, WorkspaceDeleteRequest, 
    WorkspaceListRequest, WorkspacePinRequest, WorkspaceUnpinRequest, 
    WorkspaceUpdateBranchRequest, WorkspaceUpdateNameRequest, WorkspaceUpdateOrderRequest, 
    WorkspaceRetrySetupRequest, WorkspaceUnarchiveRequest,
    WsAction, WsMessage, WsMessageHandler, WsRequest,
    ScriptGetRequest, ScriptSaveRequest,
    WsEvent, WorkspaceSetupProgressNotification,
};
use tokio::sync::OnceCell;
use serde_json::{json, Value};
use portable_pty::{native_pty_system, PtySize, CommandBuilder};
use std::io::Read;

use crate::error::{Result, ServiceError};
use crate::{ProjectService, WorkspaceService};

/// WebSocket message service for handling all business logic via WebSocket.
pub struct WsMessageService {
    fs_engine: FsEngine,
    git_engine: GitEngine,
    app_engine: core_engine::AppEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
    ws_manager: OnceCell<Arc<infra::WsManager>>,
}

impl WsMessageService {
    pub fn new(
        project_service: Arc<ProjectService>,
        workspace_service: Arc<WorkspaceService>,
    ) -> Self {
        Self {
            fs_engine: FsEngine::new(),
            git_engine: GitEngine::new(),
            app_engine: core_engine::AppEngine::new(),
            project_service,
            workspace_service,
            ws_manager: OnceCell::new(),
        }
    }

    pub fn set_ws_manager(&self, manager: Arc<infra::WsManager>) -> Result<()> {
        self.ws_manager.set(manager).map_err(|_| ServiceError::Processing("WS Manager already set".to_string()))?;
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

            // App
            WsAction::AppOpen => self.handle_app_open(parse_request(request.data)?),

            // Git
            WsAction::GitGetStatus => self.handle_git_get_status(parse_request(request.data)?),
            WsAction::GitListBranches => self.handle_git_list_branches(parse_request(request.data)?),
            WsAction::GitRenameBranch => self.handle_git_rename_branch(parse_request(request.data)?),
            WsAction::GitChangedFiles => self.handle_git_changed_files(parse_request(request.data)?),
            WsAction::GitFileDiff => self.handle_git_file_diff(parse_request(request.data)?),
            WsAction::GitCommit => self.handle_git_commit(parse_request(request.data)?),
            WsAction::GitPush => self.handle_git_push(parse_request(request.data)?),
            WsAction::GitStage => self.handle_git_stage(parse_request(request.data)?),
            WsAction::GitUnstage => self.handle_git_unstage(parse_request(request.data)?),
            WsAction::GitDiscardUnstaged => self.handle_git_discard_unstaged(parse_request(request.data)?),
            WsAction::GitDiscardUntracked => self.handle_git_discard_untracked(parse_request(request.data)?),
            WsAction::GitPull => self.handle_git_pull(parse_request(request.data)?),
            WsAction::GitFetch => self.handle_git_fetch(parse_request(request.data)?),
            WsAction::GitSync => self.handle_git_sync(parse_request(request.data)?),

            // Project
            WsAction::ProjectList => self.handle_project_list().await,
            WsAction::ProjectCreate => self.handle_project_create(parse_request(request.data)?).await,
            WsAction::ProjectUpdate => self.handle_project_update(parse_request(request.data)?).await,
            WsAction::ProjectUpdateTargetBranch => {
                self.handle_project_update_target_branch(parse_request(request.data)?).await
            }
            WsAction::ProjectUpdateOrder => {
                self.handle_project_update_order(parse_request(request.data)?).await
            }
            WsAction::ProjectDelete => self.handle_project_delete(parse_request(request.data)?).await,
            WsAction::ProjectValidatePath => {
                self.handle_fs_validate_git_path(parse_request(request.data)?)
            }

            // Script
            WsAction::ScriptGet => self.handle_script_get(parse_request(request.data)?).await,
            WsAction::ScriptSave => self.handle_script_save(parse_request(request.data)?).await,

            // Workspace
            WsAction::WorkspaceList => self.handle_workspace_list(parse_request(request.data)?).await,
            WsAction::WorkspaceCreate => {
                self.handle_workspace_create(conn_id, parse_request(request.data)?).await
            }
            WsAction::WorkspaceUpdateName => {
                self.handle_workspace_update_name(parse_request(request.data)?).await
            }
            WsAction::WorkspaceUpdateBranch => {
                self.handle_workspace_update_branch(parse_request(request.data)?).await
            }
            WsAction::WorkspaceUpdateOrder => {
                self.handle_workspace_update_order(parse_request(request.data)?).await
            }
            WsAction::WorkspaceDelete => {
                self.handle_workspace_delete(parse_request(request.data)?).await
            }
            WsAction::WorkspacePin => {
                self.handle_workspace_pin(parse_request(request.data)?).await
            }
            WsAction::WorkspaceUnpin => {
                self.handle_workspace_unpin(parse_request(request.data)?).await
            }
            WsAction::WorkspaceArchive => {
                self.handle_workspace_archive(parse_request(request.data)?).await
            }
            WsAction::WorkspaceUnarchive => {
                self.handle_workspace_unarchive(parse_request(request.data)?).await
            }
            WsAction::WorkspaceListArchived => {
                self.handle_workspace_list_archived().await
            }
            WsAction::WorkspaceRetrySetup => {
                self.handle_workspace_retry_setup(conn_id, parse_request(request.data)?).await
            }
            WsAction::ProjectCheckCanDelete => {
                self.handle_project_check_can_delete(parse_request(request.data)?).await
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
        let entries = self
            .fs_engine
            .list_dir(&path, req.dirs_only, req.show_hidden)?;
        let parent_path = self.fs_engine.get_parent(&path);

        let entries_json: Vec<Value> = entries
            .into_iter()
            .map(|e| {
                json!({
                    "name": e.name,
                    "path": e.path.to_string_lossy(),
                    "is_dir": e.is_dir,
                    "is_symlink": e.is_symlink,
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
        let (content, size) = self.fs_engine.read_file(&path)?;

        Ok(json!({
            "path": path.to_string_lossy(),
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
        let tree = self.fs_engine.list_project_files(&root_path, req.show_hidden)?;

        fn convert_tree(items: Vec<core_engine::FileTreeItem>) -> Vec<Value> {
            items
                .into_iter()
                .map(|item| {
                    json!({
                        "name": item.name,
                        "path": item.path.to_string_lossy(),
                        "is_dir": item.is_dir,
                        "is_symlink": item.is_symlink,
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
        ).map_err(|e| ServiceError::Validation(format!("Search failed: {}", e)))?;

        let matches: Vec<Value> = result.matches.into_iter().map(|m| {
            json!({
                "file_path": m.file_path,
                "line_number": m.line_number,
                "line_content": m.line_content,
                "match_start": m.match_start,
                "match_end": m.match_end,
                "context_before": m.context_before,
                "context_after": m.context_after,
            })
        }).collect();

        Ok(json!({
            "matches": matches,
            "truncated": result.truncated,
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
        let status = self.git_engine.get_git_status(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to get git status: {}", e))
        })?;

        let current_branch = self.git_engine.get_current_branch(&path).ok();
        Ok(json!({
            "has_uncommitted_changes": status.has_uncommitted_changes,
            "has_unpushed_commits": status.has_unpushed_commits,
            "uncommitted_count": status.uncommitted_count,
            "unpushed_count": status.unpushed_count,
            "current_branch": current_branch,
        }))
    }

    fn handle_git_list_branches(&self, req: GitListBranchesRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let branches = self.git_engine.list_branches(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to list branches: {}", e))
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
        let info = self.git_engine.get_changed_files(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to get changed files: {}", e))
        })?;

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
        let unstaged_files: Vec<Value> = info.unstaged_files.into_iter().map(convert_file).collect();
        let untracked_files: Vec<Value> = info.untracked_files.into_iter().map(convert_file).collect();

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
        let diff = self.git_engine.get_file_diff(&path, &req.file_path).map_err(|e| {
            ServiceError::Validation(format!("Failed to get file diff: {}", e))
        })?;

        Ok(json!({
            "file_path": diff.file_path,
            "old_content": diff.old_content,
            "new_content": diff.new_content,
            "status": diff.status,
        }))
    }

    fn handle_git_commit(&self, req: GitCommitRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        let hash = self.git_engine.commit_all(&path, &req.message).map_err(|e| {
            ServiceError::Validation(format!("Failed to commit: {}", e))
        })?;

        Ok(json!({
            "success": true,
            "commit_hash": hash,
        }))
    }

    fn handle_git_push(&self, req: GitPushRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.push(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to push: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_stage(&self, req: GitStageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.stage_files(&path, &req.files).map_err(|e| {
            ServiceError::Validation(format!("Failed to stage files: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_unstage(&self, req: GitUnstageRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.unstage_files(&path, &req.files).map_err(|e| {
            ServiceError::Validation(format!("Failed to unstage files: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_discard_unstaged(&self, req: GitDiscardUnstagedRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.discard_unstaged(&path, &req.files).map_err(|e| {
            ServiceError::Validation(format!("Failed to discard unstaged changes: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_discard_untracked(&self, req: GitDiscardUntrackedRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.discard_untracked(&path, &req.files).map_err(|e| {
            ServiceError::Validation(format!("Failed to discard untracked files: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_pull(&self, req: GitPullRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.pull(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to pull: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_fetch(&self, req: GitFetchRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.fetch(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to fetch: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    fn handle_git_sync(&self, req: GitSyncRequest) -> Result<Value> {
        let path = self.fs_engine.expand_path(&req.path)?;
        self.git_engine.sync(&path).map_err(|e| {
            ServiceError::Validation(format!("Failed to sync: {}", e))
        })?;

        Ok(json!({ "success": true }))
    }

    // ===== Project Handlers =====

    async fn handle_project_list(&self) -> Result<Value> {
        let projects = self.project_service.list_projects().await?;
        Ok(json!(projects))
    }

    async fn handle_project_create(&self, req: ProjectCreateRequest) -> Result<Value> {
        let project = self
            .project_service
            .create_project(req.name, req.main_file_path, req.sidebar_order, req.border_color)
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
            let scripts_path = std::path::Path::new(&project.main_file_path)
                .join(".atmos/scripts/atmos.json");
            
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
            let scripts_path = std::path::Path::new(&project.main_file_path)
                .join(".atmos/scripts/atmos.json");
            
            // Ensure directory exists
            if let Some(parent) = scripts_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| ServiceError::Validation(format!("Failed to create script directory: {}", e)))?;
            }

            let content = serde_json::to_string_pretty(&req.scripts).map_err(|e| ServiceError::Validation(format!("Invalid script JSON: {}", e)))?;
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

    async fn handle_workspace_create(&self, conn_id: &str, req: WorkspaceCreateRequest) -> Result<Value> {
        let workspace = self
            .workspace_service
            .create_workspace(req.project_guid.clone(), req.name, req.branch, req.sidebar_order)
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
                Self::run_setup_process(manager, project_service, workspace_service, conn_id, project_guid, workspace_id, workspace_name, false).await;
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

    async fn handle_workspace_update_order(&self, req: WorkspaceUpdateOrderRequest) -> Result<Value> {
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
            let project = self.project_service.get_project(ws.model.project_guid.clone()).await?;
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

    async fn handle_project_check_can_delete(&self, req: ProjectCheckCanDeleteRequest) -> Result<Value> {
        let response = self.project_service.check_can_delete_from_archive_modal(req.guid).await?;
        Ok(json!(response))
    }

    async fn handle_workspace_retry_setup(&self, conn_id: &str, req: WorkspaceRetrySetupRequest) -> Result<Value> {
        let workspace = self.workspace_service.get_workspace(req.guid.clone()).await?
            .ok_or_else(|| ServiceError::Validation("Workspace not found".to_string()))?;
        
        if let Some(manager) = self.ws_manager.get().cloned() {
            let project_service = self.project_service.clone();
            let workspace_id = workspace.model.guid.clone();
            let conn_id = conn_id.to_string();
            let project_guid = workspace.model.project_guid.clone();
            let workspace_name = workspace.model.name.clone();

            let workspace_service = self.workspace_service.clone();
            tokio::spawn(async move {
                Self::run_setup_process(manager, project_service, workspace_service, conn_id, project_guid, workspace_id, workspace_name, true).await;
            });
        }
        
        Ok(json!({ "success": true }))
    }

    // ===== Setup Process Helper =====

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
        let _ = manager.send_to(&conn_id, &WsMessage::notification(
            WsEvent::WorkspaceSetupProgress,
            json!(WorkspaceSetupProgressNotification {
                workspace_id: workspace_id.clone(),
                status: "creating".to_string(),
                step_title: "Creating Workspace".to_string(),
                output: None,
                success: true,
                countdown: None,
            })
        )).await;
        
        // Asynchronously ensure worktree is ready (this was previously blocking in create_workspace)
        if let Err(e) = workspace_service.ensure_worktree_ready(workspace_id.clone()).await {
             let _ = manager.send_to(&conn_id, &WsMessage::notification(
                WsEvent::WorkspaceSetupProgress,
                json!(WorkspaceSetupProgressNotification {
                    workspace_id: workspace_id.clone(),
                    status: "error".to_string(),
                    step_title: "Workspace Creation Failed".to_string(),
                    output: Some(format!("\r\n\x1b[31mError creating worktree: {}\x1b[0m\r\n", e)),
                    success: false,
                    countdown: None,
                })
            )).await;
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

        let workspace_path = GitEngine::new().get_worktree_path(&workspace_name).unwrap_or_default();

        if let Some(script) = setup_script {
            // 3. Status: Setting Up
             let _ = manager.send_to(&conn_id, &WsMessage::notification(
                WsEvent::WorkspaceSetupProgress,
                json!(WorkspaceSetupProgressNotification {
                    workspace_id: workspace_id.clone(),
                    status: "setting_up".to_string(),
                    step_title: "Running Setup Script".to_string(),
                    output: Some(format!("\r\n$ Running setup script: {}\r\n", script)),
                    success: true,
                    countdown: None,
                })
            )).await;

            // Run in PTY
            let result = Self::execute_script_in_pty(&manager, &conn_id, &workspace_id, &script, &workspace_path, &project.main_file_path).await;
            
            if let Err(e) = result {
                 let _ = manager.send_to(&conn_id, &WsMessage::notification(
                    WsEvent::WorkspaceSetupProgress,
                    json!(WorkspaceSetupProgressNotification {
                        workspace_id: workspace_id.clone(),
                        status: "error".to_string(),
                        step_title: "Setup Failed".to_string(),
                        output: Some(format!("\r\n\x1b[31mError: {}\x1b[0m\r\n", e)),
                        success: false,
                        countdown: None,
                    })
                )).await;
                return;
            }
        }

        // 4. Status: Completed
        let _ = manager.send_to(&conn_id, &WsMessage::notification(
            WsEvent::WorkspaceSetupProgress,
            json!(WorkspaceSetupProgressNotification {
                workspace_id: workspace_id.clone(),
                status: "completed".to_string(),
                step_title: "Ready to Build".to_string(),
                output: None,
                success: true,
                countdown: None,
            })
        )).await;
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
        cmd.cwd(cwd.to_path_buf());
        
        // Inject env vars
        cmd.env("ATMOS_ROOT_PROJECT_PATH", project_root.to_string());
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
                if n == 0 { break; }
                let s = String::from_utf8_lossy(&buf[..n]).to_string();
                if tx.send(s).is_err() { break; }
            }
        });

        while let Some(output) = rx.recv().await {
             let _ = manager_clone.send_to(&conn_id_clone, &WsMessage::notification(
                WsEvent::WorkspaceSetupProgress,
                json!(WorkspaceSetupProgressNotification {
                    workspace_id: workspace_id_clone.clone(),
                    status: "setting_up".to_string(),
                    step_title: "Running Setup Script".to_string(),
                    output: Some(output),
                    success: true,
                    countdown: None,
                })
            )).await;
        }
        
        // Wait, I didn't define WsEvent correctly if I use WsEvent::WorkspaceSetupProgress directly
        // Let me re-check my previous edit of message.rs

        let status = child.wait()?;
        if !status.success() {
            anyhow::bail!("Script exited with status {}", status);
        }

        Ok(())
    }
}

/// Parse request data from JSON Value.
fn parse_request<T: serde::de::DeserializeOwned>(data: Value) -> Result<T> {
    serde_json::from_value(data).map_err(|e| ServiceError::Validation(format!("Invalid request: {}", e)))
}

/// Implement WsMessageHandler trait for dependency inversion.
#[async_trait]
impl WsMessageHandler for WsMessageService {
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String> {
        // Parse the incoming message
        let ws_msg = match WsMessage::from_json(message) {
            Ok(msg) => msg,
            Err(e) => {
                tracing::warn!(
                    "[WsMessageService] Invalid message from {}: {}",
                    conn_id,
                    e
                );
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
