use std::path::Path;
use std::sync::Arc;
use sea_orm::DatabaseConnection;
use core_engine::GitEngine;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use infra::db::entities::workspace;
use crate::error::{Result, ServiceError};

pub struct WorkspaceService {
    db: Arc<DatabaseConnection>,
    git_engine: GitEngine,
}

impl WorkspaceService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { 
            db,
            git_engine: GitEngine::new(),
        }
    }

    /// 获取项目下的所有工作区
    pub async fn list_by_project(&self, project_guid: String) -> Result<Vec<workspace::Model>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.list_by_project(project_guid).await?)
    }

    /// 获取单个工作区详情
    pub async fn get_workspace(&self, guid: String) -> Result<Option<workspace::Model>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.find_by_guid(guid).await?)
    }

    /// 创建新工作区
    pub async fn create_workspace(
        &self,
        project_guid: String,
        name: String,
        branch: String,
        sidebar_order: i32,
    ) -> Result<workspace::Model> {
        // Get project to find the repository path
        let project_repo = ProjectRepo::new(&self.db);
        let project = project_repo
            .find_by_guid(&project_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", project_guid)))?;

        let repo_path = Path::new(&project.main_file_path);

        // Get the default branch from the repository if not specified
        let base_branch = self.git_engine.get_default_branch(repo_path)
            .unwrap_or_else(|_| "main".to_string());

        // Create the git worktree
        // The worktree will be at ~/.atmos/workspaces/{workspace_name}
        self.git_engine
            .create_worktree(repo_path, &name, &base_branch)?;

        // Save to database
        let workspace_repo = WorkspaceRepo::new(&self.db);
        Ok(workspace_repo.create(project_guid, name, branch, sidebar_order).await?)
    }

    /// 更新工作区名称
    pub async fn update_name(&self, guid: String, name: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_name(guid, name).await?)
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: String, branch: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_branch(guid, branch).await?)
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_order(guid, order).await?)
    }

    /// 删除工作区
    pub async fn delete_workspace(&self, guid: String) -> Result<()> {
        let workspace_repo = WorkspaceRepo::new(&self.db);
        
        // Get workspace info before deleting
        if let Some(workspace) = workspace_repo.find_by_guid(guid.clone()).await? {
            // Get project to find repo path
            let project_repo = ProjectRepo::new(&self.db);
            if let Some(project) = project_repo.find_by_guid(&workspace.project_guid).await? {
                let repo_path = Path::new(&project.main_file_path);
                
                // Remove the git worktree (ignore errors - workspace may not have worktree)
                if let Err(e) = self.git_engine.remove_worktree(repo_path, &workspace.name) {
                    tracing::warn!("Failed to remove worktree for workspace {}: {}", workspace.name, e);
                }
            }
        }
        
        // Soft delete from database
        Ok(workspace_repo.soft_delete(guid).await?)
    }

    /// 置顶工作区
    pub async fn pin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.pin_workspace(guid).await?)
    }

    /// 取消置顶工作区
    pub async fn unpin_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.unpin_workspace(guid).await?)
    }

    /// 归档工作区（不删除 worktree）
    pub async fn archive_workspace(&self, guid: String) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.archive_workspace(guid).await?)
    }

    /// 获取工作区终端布局
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.get_terminal_layout(guid).await?)
    }

    /// 更新工作区终端布局
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_terminal_layout(guid, layout).await?)
    }
}
