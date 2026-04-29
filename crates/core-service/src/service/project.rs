use crate::error::{Result, ServiceError};
use core_engine::GitEngine;
use infra::db::entities::project;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub struct ProjectService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

#[derive(Debug, serde::Serialize)]
pub struct ProjectCanDeleteResponse {
    pub can_delete: bool,
    pub active_workspace_count: u64,
}

/// Cleanup info for a single workspace within a project.
pub struct WorkspaceCleanupInfo {
    pub guid: String,
    pub name: String,
    pub branch: String,
    pub github_pr_data: Option<String>,
    pub github_issue_data: Option<String>,
}

/// All data needed to clean up a project's worktrees in the background.
pub struct ProjectCleanupInfo {
    pub project_id: String,
    pub repo_path: String,
    pub workspaces: Vec<WorkspaceCleanupInfo>,
}

impl ProjectService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self {
            db,
            git_engine: GitEngine::new(),
        }
    }

    pub async fn list_projects(&self) -> Result<Vec<project::Model>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.list().await?)
    }

    pub async fn create_project(
        &self,
        name: String,
        main_file_path: String,
        sidebar_order: i32,
        border_color: Option<String>,
    ) -> Result<project::Model> {
        let repo = ProjectRepo::new(&self.db);
        let default_branch = self
            .git_engine
            .get_default_branch(std::path::Path::new(&main_file_path))
            .unwrap_or(None);
        Ok(repo
            .create(
                name,
                main_file_path,
                sidebar_order,
                border_color,
                default_branch,
            )
            .await?)
    }

    /// Soft-delete project and all its workspaces (DB only, no git cleanup).
    /// Returns an error if the project has active workspaces.
    pub async fn delete_project(&self, guid: String) -> Result<()> {
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);

        // Validate: no active workspaces
        let active_count = workspace_repo.count_active_by_project(&guid).await?;
        if active_count > 0 {
            return Err(ServiceError::Processing(format!(
                "Cannot delete project with {} active workspace(s)",
                active_count
            )));
        }

        let _project = project_repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        // Batch soft delete all workspaces for this project
        workspace_repo.soft_delete_by_project(&guid).await?;

        // Soft delete the project
        project_repo.soft_delete(&guid).await?;
        Ok(())
    }

    /// Gather cleanup info for all workspaces in a project (for background cleanup).
    /// Must be called BEFORE `delete_project` since it reads workspace data.
    pub async fn get_project_cleanup_info(
        &self,
        guid: &str,
    ) -> Result<ProjectCleanupInfo> {
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);

        let project = project_repo
            .find_by_guid(guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        let workspaces = workspace_repo.list_all_by_project(guid).await?;
        let repo_path = project.main_file_path.clone();

        let workspace_cleanups: Vec<WorkspaceCleanupInfo> = workspaces
            .into_iter()
            .map(|w| WorkspaceCleanupInfo {
                guid: w.guid,
                name: w.name,
                branch: w.branch,
                github_pr_data: w.github_pr_data,
                github_issue_data: w.github_issue_data,
            })
            .collect();

        Ok(ProjectCleanupInfo {
            project_id: guid.to_string(),
            repo_path,
            workspaces: workspace_cleanups,
        })
    }

    pub async fn check_can_delete_from_archive_modal(
        &self,
        guid: String,
    ) -> Result<ProjectCanDeleteResponse> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let active_count = workspace_repo.count_active_by_project(&guid).await?;
        Ok(ProjectCanDeleteResponse {
            can_delete: active_count == 0,
            active_workspace_count: active_count,
        })
    }

    pub async fn update_color(&self, guid: String, color: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_color(&guid, color).await?)
    }

    pub async fn update_target_branch(
        &self,
        guid: String,
        target_branch: Option<String>,
    ) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_target_branch(&guid, target_branch).await?)
    }

    pub async fn update_target_branch_if_null(
        &self,
        guid: String,
        target_branch: String,
    ) -> Result<bool> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo
            .update_target_branch_if_null(&guid, target_branch)
            .await?)
    }

    pub async fn get_project(&self, guid: String) -> Result<Option<project::Model>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.find_by_guid(&guid).await?)
    }

    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_order(&guid, order).await?)
    }

    /// Get project terminal layout
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.get_terminal_layout(&guid).await?)
    }

    /// Update project terminal layout
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_terminal_layout(&guid, layout).await?)
    }

    /// Get project maximized terminal ID
    pub async fn get_maximized_terminal_id(&self, guid: String) -> Result<Option<String>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.get_maximized_terminal_id(&guid).await?)
    }

    /// Update project maximized terminal ID
    pub async fn update_maximized_terminal_id(
        &self,
        guid: String,
        terminal_id: Option<String>,
    ) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo
            .update_maximized_terminal_id(&guid, terminal_id)
            .await?)
    }
}
