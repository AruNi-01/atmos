use std::sync::Arc;
use sea_orm::DatabaseConnection;
use infra::db::repo::ProjectRepo;
use infra::db::entities::project;
use crate::error::Result;

pub struct ProjectService {
    db: Arc<DatabaseConnection>,
}

impl ProjectService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
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
        let repo = ProjectRepo::new(&self.db);
        Ok(repo.delete(guid).await?)
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
