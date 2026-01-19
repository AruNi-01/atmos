use std::sync::Arc;
use sea_orm::DatabaseConnection;
use infra::db::repo::WorkspaceRepo;
use infra::db::entities::workspace;
use crate::error::Result;

pub struct WorkspaceService {
    db: Arc<DatabaseConnection>,
}

impl WorkspaceService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
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
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.create(project_guid, name, branch, sidebar_order).await?)
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
        let repo = WorkspaceRepo::new(&self.db);
        Ok(repo.delete(guid).await?)
    }
}
