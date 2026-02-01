use std::sync::Arc;
use sea_orm::DatabaseConnection;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use infra::db::entities::project;
use core_engine::GitEngine;
use crate::error::{Result, ServiceError};

pub struct ProjectService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

#[derive(Debug, serde::Serialize)]
pub struct ProjectCanDeleteResponse {
    pub can_delete: bool,
    pub active_workspace_count: u64,
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

    pub async fn create_project(&self, name: String, main_file_path: String, sidebar_order: i32, border_color: Option<String>) -> Result<project::Model> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.create(name, main_file_path, sidebar_order, border_color).await?)
    }

    pub async fn delete_project(&self, guid: String) -> Result<()> {
        let project_repo = ProjectRepo::new(&self.db);
        let workspace_repo = WorkspaceRepo::new(&self.db);
        
        let project = project_repo
            .find_by_guid(&guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", guid)))?;

        // Get all workspaces to clean up their worktrees
        let workspaces = workspace_repo.list_all_by_project(guid.clone()).await?;
        
        // Clean up git worktrees for all workspaces
        let repo_path = std::path::Path::new(&project.main_file_path);
        for workspace in workspaces {
            if let Err(e) = self.git_engine.remove_worktree(repo_path, &workspace.name) {
                tracing::warn!("Failed to remove worktree for workspace {}: {}", workspace.name, e);
            }
        }

        // Batch soft delete all workspaces for this project
        workspace_repo.soft_delete_by_project(guid.clone()).await?;

        // Soft delete the project
        project_repo.soft_delete(guid).await?;
        Ok(())
    }

    pub async fn check_can_delete_from_archive_modal(&self, guid: String) -> Result<ProjectCanDeleteResponse> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        let active_count = workspace_repo.count_active_by_project(guid).await?;
        Ok(ProjectCanDeleteResponse {
            can_delete: active_count == 0,
            active_workspace_count: active_count,
        })
    }
    
    pub async fn update_color(&self, guid: String, color: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_color(guid, color).await?)
    }

    pub async fn update_target_branch(&self, guid: String, target_branch: Option<String>) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_target_branch(guid, target_branch).await?)
    }

    pub async fn get_project(&self, guid: String) -> Result<Option<project::Model>> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.find_by_guid(&guid).await?)
    }

    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.update_order(guid, order).await?)
    }
}
