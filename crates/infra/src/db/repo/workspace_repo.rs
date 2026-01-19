use sea_orm::*;
use sea_orm::sea_query::Expr;

use crate::db::entities::base::BaseFields;
use crate::db::entities::workspace;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct WorkspaceRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<workspace::Entity, workspace::Model, workspace::ActiveModel> for WorkspaceRepo<'a> {
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> WorkspaceRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    /// 根据项目 GUID 查询所有工作区（按 sidebar_order 升序排序）
    pub async fn list_by_project(&self, project_guid: String) -> Result<Vec<workspace::Model>> {
        let workspaces = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .order_by_asc(workspace::Column::SidebarOrder)
            .all(self.db)
            .await?;
        Ok(workspaces)
    }

    /// 根据 GUID 查询单个工作区
    pub async fn find_by_guid(&self, guid: String) -> Result<Option<workspace::Model>> {
        let workspace = workspace::Entity::find_by_id(guid)
            .filter(workspace::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(workspace)
    }

    /// 创建新工作区
    pub async fn create(
        &self,
        project_guid: String,
        name: String,
        branch: String,
        sidebar_order: i32,
    ) -> Result<workspace::Model> {
        let base = BaseFields::new();

        let model = workspace::ActiveModel {
            guid: Set(base.guid),
            project_guid: Set(project_guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(name),
            branch: Set(branch),
            sidebar_order: Set(sidebar_order),
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }

    /// 更新工作区名称
    pub async fn update_name(&self, guid: String, name: String) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::Name, Expr::value(name))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: String, branch: String) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::Branch, Expr::value(branch))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::SidebarOrder, Expr::value(order))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 删除工作区（硬删除）
    pub async fn delete(&self, guid: String) -> Result<()> {
        workspace::Entity::delete_by_id(guid).exec(self.db).await?;
        Ok(())
    }

    /// 软删除工作区（将 is_deleted 设置为 true）
    /// 
    /// 如果需要软删除功能，可以实现这个方法
    #[allow(dead_code)]
    pub async fn soft_delete(&self, guid: String) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::IsDeleted, Expr::value(true))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }
}

