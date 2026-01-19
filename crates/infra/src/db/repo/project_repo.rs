use sea_orm::*;
use sea_orm::sea_query::Expr;

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

    /// 查询所有项目（按 sidebar_order 升序排序）
    pub async fn list(&self) -> Result<Vec<project::Model>> {
        let projects = project::Entity::find()
            .order_by_asc(project::Column::SidebarOrder)
            .all(self.db)
            .await?;
        Ok(projects)
    }

    /// 根据 GUID 查询单个项目
    #[allow(dead_code)]
    pub async fn find_by_guid(&self, guid: &str) -> Result<Option<project::Model>> {
        Ok(project::Entity::find_by_id(guid.to_string()).one(self.db).await?)
    }

    /// 创建新项目
    pub async fn create(&self, name: String, main_file_path: String, sidebar_order: i32, border_color: Option<String>) -> Result<project::Model> {
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
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }

    /// 更新项目排序
    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        project::Entity::update_many()
            .col_expr(project::Column::SidebarOrder, Expr::value(order))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 更新项目边框颜色
    pub async fn update_color(&self, guid: String, color: Option<String>) -> Result<()> {
        project::Entity::update_many()
            .col_expr(project::Column::BorderColor, Expr::value(color))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 删除项目（硬删除）
    pub async fn delete(&self, guid: String) -> Result<()> {
        project::Entity::delete_by_id(guid).exec(self.db).await?;
        Ok(())
    }

    /// 检查项目是否存在
    #[allow(dead_code)]
    pub async fn exists(&self, guid: &str) -> Result<bool> {
        Ok(self.find_by_guid(guid).await?.is_some())
    }
}

