use std::path::Path;

use core_engine::{GitEngine, TmuxEngine};
use infra::db::repo::{ProjectRepo, WorkspaceRepo};

use crate::error::{Result, ServiceError};
use crate::service::workspace_support::{
    WorkspaceDto, WorkspaceLabelDto, is_valid_workspace_priority,
    is_valid_workspace_workflow_status,
};

use super::WorkspaceService;

impl WorkspaceService {
    /// 更新工作区显示名称
    pub async fn update_display_name(&self, guid: String, display_name: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_display_name(&guid, display_name).await?)
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: String, branch: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_branch(&guid, branch).await?)
    }

    pub async fn mark_visited(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .update_last_visited_at(&guid, chrono::Utc::now().naive_utc())
            .await?)
    }

    pub async fn update_workflow_status(
        &self,
        guid: String,
        workflow_status: String,
    ) -> Result<()> {
        if !is_valid_workspace_workflow_status(&workflow_status) {
            return Err(ServiceError::Validation(format!(
                "Unsupported workspace workflow status: {workflow_status}"
            )));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_workflow_status(&guid, workflow_status).await?)
    }

    pub async fn update_priority(&self, guid: String, priority: String) -> Result<()> {
        if !is_valid_workspace_priority(&priority) {
            return Err(ServiceError::Validation(format!(
                "Unsupported workspace priority: {priority}"
            )));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_priority(&guid, priority).await?)
    }

    pub async fn list_labels(&self, deleted_only: bool) -> Result<Vec<WorkspaceLabelDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .list_labels(deleted_only)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    pub async fn create_label(
        &self,
        name: String,
        color: String,
        source: String,
    ) -> Result<WorkspaceLabelDto> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label name cannot be empty".to_string(),
            ));
        }
        if color.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label color cannot be empty".to_string(),
            ));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.create_label(name, color, source).await?.into())
    }

    pub async fn update_label(
        &self,
        guid: String,
        name: String,
        color: String,
        source: String,
    ) -> Result<WorkspaceLabelDto> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label name cannot be empty".to_string(),
            ));
        }
        if color.trim().is_empty() {
            return Err(ServiceError::Validation(
                "Workspace label color cannot be empty".to_string(),
            ));
        }

        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_label(&guid, name, color, source).await?.into())
    }

    pub async fn delete_label(&self, guid: &str) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.delete_label(guid).await?)
    }

    pub async fn restore_label(&self, guid: &str) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.restore_label(guid).await?)
    }

    pub async fn update_labels(&self, guid: String, label_guids: Vec<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_workspace_labels(&guid, label_guids).await?)
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_order(&guid, order).await?)
    }

    /// 删除工作区（仅软删除数据库记录，不清理 worktree）
    pub async fn soft_delete_workspace(&self, guid: &str) -> Result<()> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        Ok(workspace_repo.soft_delete(guid).await?)
    }

    /// 获取工作区的 GitHub PR/Issue 数据用于删除时清理
    pub async fn get_workspace_for_github_cleanup(
        &self,
        guid: &str,
    ) -> Result<Option<(Option<String>, Option<String>)>> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            return Ok(Some((
                workspace.github_pr_data,
                workspace.github_issue_data,
            )));
        }
        Ok(None)
    }

    /// 获取工作区的 worktree 清理所需信息
    pub async fn get_workspace_cleanup_info(
        &self,
        guid: &str,
    ) -> Result<Option<(String, String, String)>> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                return Ok(Some((
                    project.main_file_path.clone(),
                    workspace.name.clone(),
                    workspace.branch.clone(),
                )));
            }
        }
        Ok(None)
    }

    /// Resolve the tmux session name used for a workspace.
    ///
    /// This prefers the human-readable `{project}_{workspace}` naming scheme and
    /// falls back to the legacy workspace-id-based session name when lookup fails.
    pub async fn resolve_tmux_session_name(
        &self,
        guid: &str,
        tmux_engine: &TmuxEngine,
    ) -> Result<String> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        if let Some(workspace) = workspace_repo.find_by_guid(guid).await? {
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                return Ok(tmux_engine.get_session_name_from_names(&project.name, &workspace.name));
            }
        }

        Ok(tmux_engine.get_session_name(guid))
    }

    /// 删除工作区（软删除 + 后台清理 worktree）
    pub async fn delete_workspace(&self, guid: String) -> Result<()> {
        let cleanup_info = self.get_workspace_cleanup_info(&guid).await?;

        self.soft_delete_workspace(&guid).await?;

        if let Some((repo_path_str, workspace_name, branch)) = cleanup_info {
            tokio::task::spawn_blocking(move || {
                let repo_path = Path::new(&repo_path_str);
                if let Err(e) =
                    GitEngine::new().remove_worktree(repo_path, &workspace_name, &branch, false)
                {
                    tracing::warn!(
                        "Failed to remove worktree for workspace {}: {}",
                        workspace_name,
                        e
                    );
                }
            });
        }

        Ok(())
    }

    /// 置顶工作区
    pub async fn pin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.pin_workspace(&guid).await?)
    }

    /// 取消置顶工作区
    pub async fn unpin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.unpin_workspace(&guid).await?)
    }

    /// 更新置顶工作区顺序
    pub async fn update_workspace_pin_order(&self, workspace_ids: Vec<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_pin_order(workspace_ids).await?)
    }

    /// 归档工作区（不删除 worktree）
    pub async fn archive_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.archive_workspace(&guid).await?)
    }

    /// 取消归档工作区
    pub async fn unarchive_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.unarchive_workspace(&guid).await?)
    }

    /// 获取所有已归档的工作区
    pub async fn list_archived_workspaces(&self) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_archived().await?;
        let workspace_guids: Vec<String> = models.iter().map(|model| model.guid.clone()).collect();
        let mut labels_by_workspace = repo
            .list_labels_by_workspace_guids(&workspace_guids)
            .await?;
        Ok(models
            .into_iter()
            .map(|model| {
                let labels = labels_by_workspace.remove(&model.guid).unwrap_or_default();
                self.to_dto_lenient(model, labels)
            })
            .collect())
    }

    pub async fn list_all_by_project(&self, project_guid: String) -> Result<Vec<WorkspaceDto>> {
        let repo = WorkspaceRepo::new(&self.db);
        let models = repo.list_all_by_project(&project_guid).await?;
        let workspace_guids: Vec<String> = models.iter().map(|model| model.guid.clone()).collect();
        let mut labels_by_workspace = repo
            .list_labels_by_workspace_guids(&workspace_guids)
            .await?;
        Ok(models
            .into_iter()
            .map(|model| {
                let labels = labels_by_workspace.remove(&model.guid).unwrap_or_default();
                self.to_dto_lenient(model, labels)
            })
            .collect())
    }

    /// 删除工作区的 worktree（仅清理 git worktree，不删除数据库记录）
    pub async fn cleanup_worktree(
        &self,
        workspace_name: &str,
        branch_name: &str,
        project_main_path: &str,
    ) -> Result<()> {
        let repo_path = Path::new(project_main_path);
        if let Err(e) =
            self.git_engine
                .remove_worktree(repo_path, workspace_name, branch_name, false)
        {
            tracing::warn!(
                "Failed to remove worktree for workspace {}: {}",
                workspace_name,
                e
            );
        }
        Ok(())
    }

    /// 获取工作区终端布局
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.get_terminal_layout(&guid).await?)
    }

    /// 更新工作区终端布局
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_terminal_layout(&guid, layout).await?)
    }

    /// 更新工作区最大化终端 ID
    pub async fn update_maximized_terminal_id(
        &self,
        guid: String,
        terminal_id: Option<String>,
    ) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo
            .update_maximized_terminal_id(&guid, terminal_id)
            .await?)
    }
}
