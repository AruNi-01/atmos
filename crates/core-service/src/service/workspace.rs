use std::path::Path;
use std::sync::Arc;
use sea_orm::DatabaseConnection;
use core_engine::GitEngine;
use infra::db::repo::{ProjectRepo, WorkspaceRepo};
use infra::db::entities::workspace;
use crate::error::{Result, ServiceError};
use crate::utils::workspace_name_generator;

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
    /// 
    /// If `name` is empty, a unique Pokemon-based name will be generated.
    /// If `name` is provided, it will be used (with conflict resolution if needed).
    pub async fn create_workspace(
        &self,
        project_guid: String,
        name: String,
        _branch: String,
        sidebar_order: i32,
    ) -> Result<workspace::Model> {
        // Get project to find the repository path and name
        let project_repo = ProjectRepo::new(&self.db);
        let project = project_repo
            .find_by_guid(&project_guid)
            .await?
            .ok_or_else(|| ServiceError::NotFound(format!("Project {} not found", project_guid)))?;

        let repo_path = Path::new(&project.main_file_path);

        // Get the default branch from the repository
        let base_branch = self.git_engine.get_default_branch(repo_path)
            .unwrap_or_else(|_| "main".to_string());

        // Get all existing branches to check for conflicts
        let existing_branches = self.git_engine.list_branches(repo_path)
            .unwrap_or_else(|_| Vec::new());
        
        // Determine the initial name to try
        let initial_name = if name.trim().is_empty() {
            // No name provided, use Pokemon name generator
            let prefix = workspace_name_generator::extract_repo_prefix(&project.name);
            workspace_name_generator::generate_workspace_name(&existing_branches, &prefix)
        } else {
            // Use the provided name
            name.clone()
        };
        
        // Try to create the worktree with the initial name
        // If it fails due to branch conflict, try with alternative names
        let mut final_name = initial_name.clone();
        let mut attempt = 0;
        const MAX_ATTEMPTS: u32 = 50;
        
        loop {
            if attempt >= MAX_ATTEMPTS {
                return Err(ServiceError::Validation(
                    "Failed to create workspace: too many naming conflicts".to_string()
                ));
            }
            
            // Check if branch already exists
            if !existing_branches.contains(&final_name) {
                // Try to create the worktree
                match self.git_engine.create_worktree(repo_path, &final_name, &base_branch) {
                    Ok(_) => break,
                    Err(e) => {
                        // If error is due to branch already existing, try a new name
                        let error_msg = e.to_string();
                        if error_msg.contains("already exists") {
                            tracing::warn!("Branch '{}' already exists, trying alternative name", final_name);
                            attempt += 1;
                            
                            // For generated names, regenerate; for user-provided names, add suffix
                            if name.trim().is_empty() {
                                let prefix = workspace_name_generator::extract_repo_prefix(&project.name);
                                final_name = workspace_name_generator::generate_workspace_name(&existing_branches, &prefix);
                            } else {
                                final_name = Self::generate_alternative_name(&initial_name, attempt);
                            }
                            continue;
                        } else {
                            // Other error, propagate it
                            return Err(e.into());
                        }
                    }
                }
            } else {
                // Branch exists, try alternative name
                tracing::warn!("Branch '{}' already exists in git, trying alternative name", final_name);
                attempt += 1;
                
                // For generated names, regenerate; for user-provided names, add suffix
                if name.trim().is_empty() {
                    let prefix = workspace_name_generator::extract_repo_prefix(&project.name);
                    final_name = workspace_name_generator::generate_workspace_name(&existing_branches, &prefix);
                } else {
                    final_name = Self::generate_alternative_name(&initial_name, attempt);
                }
            }
        }

        // Save to database with the final name (use it as both name and branch)
        let workspace_repo = WorkspaceRepo::new(&self.db);
        Ok(workspace_repo.create(project_guid, final_name.clone(), final_name, sidebar_order).await?)
    }
    
    /// Generate an alternative name when the user-provided name conflicts
    /// (Only used for user-provided names, not Pokemon-generated names)
    fn generate_alternative_name(original: &str, attempt: u32) -> String {
        if attempt <= 9 {
            format!("{}-v{}", original, attempt + 1)
        } else {
            // For higher attempts, use random suffix
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let suffix: String = (0..4)
                .map(|_| {
                    let idx = rng.gen_range(0..36);
                    if idx < 26 {
                        (b'a' + idx as u8) as char
                    } else {
                        (b'0' + (idx - 26) as u8) as char
                    }
                })
                .collect();
            format!("{}-{}", original, suffix)
        }
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

    /// 更新工作区最大化终端 ID
    pub async fn update_maximized_terminal_id(&self, guid: String, terminal_id: Option<String>) -> Result<()> {
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.update_maximized_terminal_id(guid, terminal_id).await?)
    }
}
