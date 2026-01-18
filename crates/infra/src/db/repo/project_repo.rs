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

    pub async fn list(&self) -> Result<Vec<project::Model>> {
        let projects = project::Entity::find()
            .order_by_asc(project::Column::SidebarOrder)
            .all(self.db)
            .await?;
        Ok(projects)
    }

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

    pub async fn update_order(&self, guid: String, order: i32) -> Result<()> {
        project::Entity::update_many()
            .col_expr(project::Column::SidebarOrder, Expr::value(order))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn update_color(&self, guid: String, color: Option<String>) -> Result<()> {
        project::Entity::update_many()
            .col_expr(project::Column::BorderColor, Expr::value(color))
            .filter(project::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, guid: String) -> Result<()> {
        project::Entity::delete_by_id(guid).exec(self.db).await?;
        Ok(())
    }
}
