use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::workspace;
use crate::db::repo::base::BaseRepo;
use crate::error::Result;

pub struct WorkspaceRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<workspace::Entity, workspace::Model, workspace::ActiveModel>
    for WorkspaceRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> WorkspaceRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    /// 根据项目 GUID 查询所有工作区（过滤已归档，按置顶优先、pinned_at DESC、created_at DESC 排序）
    pub async fn list_by_project(&self, project_guid: &str) -> Result<Vec<workspace::Model>> {
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
    pub async fn find_by_guid(&self, guid: &str) -> Result<Option<workspace::Model>> {
        let workspace = workspace::Entity::find_by_id(guid.to_string())
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
        display_name: Option<String>,
        branch: String,
        base_branch: String,
        sidebar_order: i32,
        github_issue_url: Option<String>,
        github_issue_data: Option<String>,
        auto_extract_todos: bool,
    ) -> Result<workspace::Model> {
        let base = BaseFields::new();

        let model = workspace::ActiveModel {
            guid: Set(base.guid),
            project_guid: Set(project_guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(name),
            display_name: Set(display_name),
            branch: Set(branch),
            base_branch: Set(base_branch),
            sidebar_order: Set(sidebar_order),
            is_pinned: Set(false),
            pinned_at: Set(None),
            is_archived: Set(false),
            archived_at: Set(None),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
            github_issue_url: Set(github_issue_url),
            github_issue_data: Set(github_issue_data),
            auto_extract_todos: Set(auto_extract_todos),
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }

    /// 更新工作区显示名称（display_name 列）
    pub async fn update_display_name(&self, guid: &str, display_name: String) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(
                workspace::Column::DisplayName,
                Expr::value(Some(display_name)),
            )
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 更新工作区分支
    pub async fn update_branch(&self, guid: &str, branch: String) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::Branch, Expr::value(branch))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 更新侧边栏排序
    pub async fn update_order(&self, guid: &str, order: i32) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::SidebarOrder, Expr::value(order))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 删除工作区（硬删除）
    pub async fn delete(&self, guid: &str) -> Result<()> {
        workspace::Entity::delete_by_id(guid.to_string())
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// 软删除工作区（将 is_deleted 设置为 true）
    pub async fn soft_delete(&self, guid: &str) -> Result<()> {
        tracing::info!(
            "[soft_delete] Attempting to soft delete workspace: {}",
            guid
        );
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::IsDeleted, Expr::value(true))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        tracing::info!(
            "[soft_delete] Soft delete result for {}: {} rows affected",
            guid,
            result.rows_affected
        );
        Ok(())
    }

    /// 批量软删除项目下的所有工作区
    pub async fn soft_delete_by_project(&self, project_guid: &str) -> Result<u64> {
        tracing::info!(
            "[soft_delete_by_project] Soft deleting all workspaces for project: {}",
            project_guid
        );
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::IsDeleted, Expr::value(true))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        tracing::info!(
            "[soft_delete_by_project] Soft deleted {} workspaces for project {}",
            result.rows_affected,
            project_guid
        );
        Ok(result.rows_affected)
    }

    /// 置顶工作区
    pub async fn pin_workspace(&self, guid: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::IsPinned, Expr::value(true))
            .col_expr(workspace::Column::PinnedAt, Expr::value(Some(now)))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 取消置顶工作区
    pub async fn unpin_workspace(&self, guid: &str) -> Result<()> {
        let result = workspace::Entity::update_many()
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
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 归档工作区
    pub async fn archive_workspace(&self, guid: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::IsArchived, Expr::value(true))
            .col_expr(workspace::Column::ArchivedAt, Expr::value(Some(now)))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 取消归档工作区
    pub async fn unarchive_workspace(&self, guid: &str) -> Result<()> {
        let result = workspace::Entity::update_many()
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
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 获取工作区终端布局
    pub async fn get_terminal_layout(&self, guid: &str) -> Result<Option<String>> {
        let workspace = workspace::Entity::find_by_id(guid.to_string())
            .filter(workspace::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?;
        Ok(workspace.and_then(|w| w.terminal_layout))
    }

    /// 更新工作区终端布局
    pub async fn update_terminal_layout(&self, guid: &str, layout: Option<String>) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::TerminalLayout, Expr::value(layout))
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 更新工作区最大化终端 ID
    pub async fn update_maximized_terminal_id(
        &self,
        guid: &str,
        terminal_id: Option<String>,
    ) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(
                workspace::Column::MaximizedTerminalId,
                Expr::value(terminal_id),
            )
            .col_expr(
                workspace::Column::UpdatedAt,
                Expr::value(chrono::Utc::now().naive_utc()),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    /// 查询所有已归档的工作区（按 archived_at DESC 排序）
    pub async fn list_archived(&self) -> Result<Vec<workspace::Model>> {
        let workspaces = workspace::Entity::find()
            .filter(workspace::Column::IsArchived.eq(true))
            .filter(workspace::Column::IsDeleted.eq(false))
            .order_by_desc(workspace::Column::ArchivedAt)
            .all(self.db)
            .await?;
        Ok(workspaces)
    }

    /// 检查项目下所有非删除的工作区是否都已归档
    pub async fn check_all_workspaces_archived(&self, project_guid: &str) -> Result<bool> {
        let non_archived_count = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsArchived.eq(false))
            .count(self.db)
            .await?;
        Ok(non_archived_count == 0)
    }

    /// 获取项目下所有非删除的工作区（包括已归档的）
    pub async fn list_all_by_project(&self, project_guid: &str) -> Result<Vec<workspace::Model>> {
        let workspaces = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .all(self.db)
            .await?;
        Ok(workspaces)
    }

    /// 获取项目下非归档工作区的数量
    pub async fn count_active_by_project(&self, project_guid: &str) -> Result<u64> {
        let count = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsArchived.eq(false))
            .count(self.db)
            .await?;
        Ok(count)
    }
}
