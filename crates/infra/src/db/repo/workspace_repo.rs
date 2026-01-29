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

    /// 根据项目 GUID 查询所有工作区（过滤已归档，按置顶优先、pinned_at DESC、created_at DESC 排序）
    pub async fn list_by_project(&self, project_guid: String) -> Result<Vec<workspace::Model>> {
        let workspaces = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsArchived.eq(false))
            .order_by_desc(workspace::Column::IsPinned)
            .order_by_desc(workspace::Column::PinnedAt)
            .order_by_desc(workspace::Column::CreatedAt)
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
            is_pinned: Set(false),
            pinned_at: Set(None),
            is_archived: Set(false),
            archived_at: Set(None),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
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

    /// 置顶工作区
    pub async fn pin_workspace(&self, guid: String) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        workspace::Entity::update_many()
            .col_expr(workspace::Column::IsPinned, Expr::value(true))
            .col_expr(workspace::Column::PinnedAt, Expr::value(Some(now)))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 取消置顶工作区
    pub async fn unpin_workspace(&self, guid: String) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::IsPinned, Expr::value(false))
            .col_expr(
                workspace::Column::PinnedAt,
                Expr::value(None::<chrono::NaiveDateTime>),
            )
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

    /// 归档工作区
    pub async fn archive_workspace(&self, guid: String) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        workspace::Entity::update_many()
            .col_expr(workspace::Column::IsArchived, Expr::value(true))
            .col_expr(workspace::Column::ArchivedAt, Expr::value(Some(now)))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 取消归档工作区
    pub async fn unarchive_workspace(&self, guid: String) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::IsArchived, Expr::value(false))
            .col_expr(
                workspace::Column::ArchivedAt,
                Expr::value(None::<chrono::NaiveDateTime>),
            )
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

    /// 获取工作区终端布局
    pub async fn get_terminal_layout(&self, guid: String) -> Result<Option<String>> {
        let workspace = workspace::Entity::find_by_id(guid)
            .filter(workspace::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(workspace.and_then(|w| w.terminal_layout))
    }

    /// 更新工作区终端布局
    pub async fn update_terminal_layout(&self, guid: String, layout: Option<String>) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::TerminalLayout, Expr::value(layout))
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

    /// 更新工作区最大化终端 ID
    pub async fn update_maximized_terminal_id(&self, guid: String, terminal_id: Option<String>) -> Result<()> {
        workspace::Entity::update_many()
            .col_expr(workspace::Column::MaximizedTerminalId, Expr::value(terminal_id))
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
}

