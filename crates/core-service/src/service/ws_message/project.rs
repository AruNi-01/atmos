use serde_json::{Value, json};
use std::sync::Arc;

use crate::error::{Result, ServiceError};
use crate::service::ws_message_support::WorkspaceDeleteSettings;

use super::{
    GitEngine, ProjectCreateRequest, ProjectDeleteProgressNotification, ProjectDeleteRequest,
    ProjectUpdateOrderRequest, ProjectUpdateRequest, ProjectUpdateTargetBranchRequest,
    ScriptGetRequest, ScriptSaveRequest, WsEvent, WsMessage, WsMessageService,
};

impl WsMessageService {
    async fn send_project_delete_progress(
        manager: &Arc<infra::WsManager>,
        payload: ProjectDeleteProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::ProjectDeleteProgress, json!(payload));
        let _ = manager.broadcast(&message).await;
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

    pub(super) async fn handle_project_list(&self) -> Result<Value> {
        let projects = self.project_service.list_projects().await?;
        Ok(json!(projects))
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
                .update_color(req.guid.clone(), Some(color))
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

    pub(super) async fn handle_script_get(&self, req: ScriptGetRequest) -> Result<Value> {
        let project = self.project_service.get_project(req.project_guid).await?;
        if let Some(project) = project {
            let scripts_path =
                std::path::Path::new(&project.main_file_path).join(".atmos/scripts/atmos.json");

            if scripts_path.exists() {
                let (content, _, _) = self.fs_engine.read_file(&scripts_path)?;
                let json: Value = serde_json::from_str(&content).unwrap_or(json!({}));
                Ok(json)
            } else {
                Ok(json!({}))
            }
        } else {
            Err(ServiceError::Validation("Project not found".to_string()))
        }
    }

    pub(super) async fn handle_script_save(&self, req: ScriptSaveRequest) -> Result<Value> {
        let project = self.project_service.get_project(req.project_guid).await?;
        if let Some(project) = project {
            let scripts_path =
                std::path::Path::new(&project.main_file_path).join(".atmos/scripts/atmos.json");

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
}
