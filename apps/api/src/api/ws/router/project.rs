use futures_util::{stream, StreamExt};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Arc;

use super::support::WorkspaceDeleteSettings;
use core_engine::GitEngine;
use core_service::{Result, ServiceError};

use super::{
    GithubIssuePayload, GithubPrPayload, ProjectCreateRequest, ProjectDeleteProgressNotification,
    ProjectDeleteRequest, ProjectScriptTrustRequest, ProjectUpdateOrderRequest,
    ProjectUpdateRequest, ProjectUpdateTargetBranchRequest, ProjectWorkspaceBootstrapResponse,
    ScriptGetRequest, ScriptSaveRequest, WsEvent, WsManager, WsMessage, WsMessageService,
};

const WORKSPACE_BOOTSTRAP_CONCURRENCY: usize = 8;

impl WsMessageService {
    async fn send_project_delete_progress(
        manager: &Arc<WsManager>,
        payload: ProjectDeleteProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::ProjectDeleteProgress, json!(payload));
        let _ = manager.broadcast(&message).await;
    }

    async fn execute_project_cleanup(
        manager: Arc<WsManager>,
        cleanup_info: core_service::service::project::ProjectCleanupInfo,
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
                    if let Ok(pr) = serde_json::from_str::<GithubPrPayload>(raw) {
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
                    if let Ok(issue) = serde_json::from_str::<GithubIssuePayload>(raw) {
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

    pub(super) async fn handle_project_list(&self) -> Result<Value> {
        let projects = self.project_service.list_projects().await?;
        Ok(json!(projects))
    }

    pub(super) async fn handle_project_workspace_bootstrap(&self) -> Result<Value> {
        let (projects_result, labels_result, groups_result) = tokio::join!(
            self.project_service.list_projects(),
            self.workspace_service.list_labels(false),
            self.group_service.list_groups(),
        );

        let projects = projects_result?;
        let workspace_labels = match labels_result {
            Ok(labels) => labels,
            Err(error) => {
                tracing::warn!("Failed to fetch workspace labels during bootstrap: {error}");
                Vec::new()
            }
        };
        let groups = match groups_result {
            Ok(groups) => groups,
            Err(error) => {
                tracing::warn!("Failed to fetch groups during bootstrap: {error}");
                Vec::new()
            }
        };

        let workspace_service = Arc::clone(&self.workspace_service);
        let project_guids = projects
            .iter()
            .map(|project| project.guid.clone())
            .collect::<Vec<_>>();
        let workspace_results = stream::iter(project_guids.into_iter().map(|project_guid| {
            let workspace_service = Arc::clone(&workspace_service);
            async move {
                let result = workspace_service
                    .list_by_project(project_guid.clone())
                    .await;
                (project_guid, result)
            }
        }))
        .buffer_unordered(WORKSPACE_BOOTSTRAP_CONCURRENCY)
        .collect::<Vec<_>>()
        .await;

        let mut workspaces_by_project = BTreeMap::new();
        for (project_guid, result) in workspace_results {
            match result {
                Ok(workspaces) => {
                    workspaces_by_project.insert(project_guid, workspaces);
                }
                Err(error) => {
                    tracing::warn!(
                        "Failed to fetch workspaces for project {project_guid} during bootstrap: {error}"
                    );
                    workspaces_by_project.insert(project_guid, Vec::new());
                }
            }
        }

        Ok(json!(ProjectWorkspaceBootstrapResponse {
            projects,
            workspace_labels,
            workspaces_by_project,
            groups,
        }))
    }

    pub(super) async fn handle_project_create(&self, req: ProjectCreateRequest) -> Result<Value> {
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

    pub(super) async fn handle_project_update(&self, req: ProjectUpdateRequest) -> Result<Value> {
        if let Some(color) = req.border_color {
            self.project_service
                .update_color(req.guid.clone(), color)
                .await?;
        }
        if let Some(logo_path) = req.logo_path {
            self.project_service
                .update_logo_path(req.guid.clone(), logo_path)
                .await?;
        }
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_project_delete(&self, req: ProjectDeleteRequest) -> Result<Value> {
        let guid = req.guid;

        let cleanup_info = self.project_service.get_project_cleanup_info(&guid).await?;

        self.project_service.delete_project(guid.clone()).await?;

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

    pub(super) async fn handle_project_update_target_branch(
        &self,
        req: ProjectUpdateTargetBranchRequest,
    ) -> Result<Value> {
        self.project_service
            .update_target_branch(req.guid, req.target_branch)
            .await?;
        Ok(json!({ "success": true }))
    }

    pub(super) async fn handle_project_update_order(
        &self,
        req: ProjectUpdateOrderRequest,
    ) -> Result<Value> {
        self.project_service
            .update_order(req.guid, req.sidebar_order)
            .await?;
        Ok(json!({ "success": true }))
    }

    /// Returns the scripts alongside their trust state. Callers must not execute
    /// anything from `scripts` while `trusted` is false.
    pub(super) async fn handle_script_get(&self, req: ScriptGetRequest) -> Result<Value> {
        let scripts = self
            .project_service
            .read_project_scripts(req.project_guid)
            .await?;
        Ok(json!(scripts))
    }

    /// Accept the scripts currently on disk, identified by the hash the user was
    /// shown, so a file that changed in between is not trusted unseen.
    pub(super) async fn handle_project_script_trust(
        &self,
        conn_id: &str,
        req: ProjectScriptTrustRequest,
    ) -> Result<Value> {
        let scripts = self
            .project_service
            .trust_project_scripts(req.project_guid.clone(), req.hash)
            .await?;

        // Setup parks on the confirmation step, so resume it now that the user
        // has accepted the script.
        if let Some(workspace_id) = req.workspace_id.clone() {
            self.resume_setup_after_script_trust(conn_id, workspace_id)
                .await?;
        }

        Ok(json!(scripts))
    }

    pub(super) async fn handle_script_save(&self, req: ScriptSaveRequest) -> Result<Value> {
        let project = self
            .project_service
            .get_project(req.project_guid.clone())
            .await?;
        if let Some(project) = project {
            let project_root = std::path::Path::new(&project.main_file_path);
            // scripts/ is intentionally trackable; still ensure managed .gitignore
            // for ephemeral siblings (tmp/, run-logs/, attachments/).
            core_engine::ensure_project_atmos_dir(project_root).map_err(|e| {
                ServiceError::Validation(format!("Failed to ensure project .atmos layout: {}", e))
            })?;
            let scripts_path = project_root.join(core_service::PROJECT_SCRIPTS_RELATIVE_PATH);

            if let Some(parent) = scripts_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    ServiceError::Validation(format!("Failed to create script directory: {}", e))
                })?;
            }

            let content = serde_json::to_string_pretty(&req.scripts)
                .map_err(|e| ServiceError::Validation(format!("Invalid script JSON: {}", e)))?;
            self.fs_engine.write_file(&scripts_path, &content)?;
            // The user just authored this content in the app, so asking them to
            // confirm their own edit would be noise. Trust the bytes we wrote
            // rather than re-reading the file, which could pick up a concurrent
            // rewrite and trust content the user never saw.
            self.project_service
                .trust_written_project_scripts(req.project_guid, &content)
                .await?;
            Ok(json!({ "success": true }))
        } else {
            Err(ServiceError::Validation("Project not found".to_string()))
        }
    }
}
