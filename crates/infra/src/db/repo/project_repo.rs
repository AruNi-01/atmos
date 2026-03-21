use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::project;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct ProjectRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<project::Entity, project::Model, project::ActiveModel> for ProjectRepo<'a> {
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> ProjectRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    /// 查询所有项目（按 sidebar_order 升序排序，过滤已删除）
    pub async fn list(&self) -> Result<Vec<project::Model>> {
        let projects = project::Entity::find()
            .filter(project::Column::IsDeleted.eq(false))
            .order_by_asc(project::Column::SidebarOrder)
            .all(self.db)
            .await?;
        Ok(projects)
    }

    /// 根据 GUID 查询单个项目（过滤已删除）
    #[allow(dead_code)]
    pub async fn find_by_guid(&self, guid: &str) -> Result<Option<project::Model>> {
        Ok(project::Entity::find_by_id(guid.to_string())
            .filter(project::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    /// 创建新项目
    pub async fn create(
        &self,
        name: String,
        main_file_path: String,
        sidebar_order: i32,
        border_color: Option<String>,
        target_branch: Option<String>,
    ) -> Result<project::Model> {
        let base = BaseFields::new();

        let model = project::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(name),
            main_file_path: Set(main_file_path),
            sidebar_order: Set(sidebar_order),
            border_color: Set(border_color),
            is_open: Set(true),
            target_branch: Set(target_branch),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }

    /// 更新项目排序
    pub async fn update_order(&self, guid: &str, order: i32) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::SidebarOrder, Expr::value(order))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Project not found".into()));
        }
        Ok(())
    }

    /// 更新项目边框颜色
    pub async fn update_color(&self, guid: &str, color: Option<String>) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::BorderColor, Expr::value(color))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Project not found".into()));
        }
        Ok(())
    }

    /// 删除项目（硬删除）
    pub async fn delete(&self, guid: &str) -> Result<()> {
        project::Entity::delete_by_id(guid.to_string())
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 软删除项目（将 is_deleted 设置为 true）
    pub async fn soft_delete(&self, guid: &str) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::IsDeleted, Expr::value(true))
            .col_expr(
                project::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Project not found".into()));
        }
        Ok(())
    }

    /// 检查项目是否存在
    #[allow(dead_code)]
    pub async fn exists(&self, guid: &str) -> Result<bool> {
        Ok(self.find_by_guid(guid).await?.is_some())
    }

    /// 更新项目目标分支
    pub async fn update_target_branch(
        &self,
        guid: &str,
        target_branch: Option<String>,
    ) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::TargetBranch, Expr::value(target_branch))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom("Project not found".into()));
        }
        Ok(())
    }

    /// Atomically initialize the project target branch only when it is still unset.
    pub async fn update_target_branch_if_null(
        &self,
        guid: &str,
        target_branch: String,
    ) -> Result<bool> {
        let result = project::Entity::update_many()
            .col_expr(
                project::Column::TargetBranch,
                Expr::value(Some(target_branch)),
            )
            .col_expr(
                project::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(project::Column::Guid.eq(guid))
            .filter(project::Column::IsDeleted.eq(false))
            .filter(project::Column::TargetBranch.is_null())
            .exec(self.db)
            .await?;
        Ok(result.rows_affected > 0)
    }

    /// 获取项目终端布局
    pub async fn get_terminal_layout(&self, guid: &str) -> Result<Option<String>> {
        let project = project::Entity::find_by_id(guid.to_string())
            .filter(project::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(project.and_then(|p| p.terminal_layout))
    }

    /// 更新项目终端布局
    pub async fn update_terminal_layout(&self, guid: &str, layout: Option<String>) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::TerminalLayout, Expr::value(layout))
            .col_expr(
                project::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(project::Column::Guid.eq(guid))
            .filter(project::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Project not found".into(),
            ));
        }
        Ok(())
    }

    /// 获取项目最大化终端 ID
    pub async fn get_maximized_terminal_id(&self, guid: &str) -> Result<Option<String>> {
        let project = project::Entity::find_by_id(guid.to_string())
            .filter(project::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(project.and_then(|p| p.maximized_terminal_id))
    }

    /// 更新项目最大化终端 ID
    pub async fn update_maximized_terminal_id(&self, guid: &str, terminal_id: Option<String>) -> Result<()> {
        let result = project::Entity::update_many()
            .col_expr(project::Column::MaximizedTerminalId, Expr::value(terminal_id))
            .col_expr(
                project::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(project::Column::Guid.eq(guid))
            .filter(project::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Project not found".into(),
            ));
        }
        Ok(())
    }
}
