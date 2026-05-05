use sea_orm::sea_query::Expr;
use sea_orm::*;
use std::collections::{HashMap, HashSet};

use crate::db::entities::base::BaseFields;
use crate::db::entities::{workspace, workspace_label};
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

    /// 根据项目 GUID 查询所有工作区（过滤已归档，按置顶优先、pin_order ASC、pinned_at DESC、created_at DESC 排序）
    pub async fn list_by_project(&self, project_guid: &str, include_issue_only: bool) -> Result<Vec<workspace::Model>> {
        let mut query = workspace::Entity::find()
            .filter(workspace::Column::ProjectGuid.eq(project_guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsArchived.eq(false));

        // Filter out issue_only workspaces by default
        if !include_issue_only {
            query = query.filter(workspace::Column::CreateSource.ne("issue_only"));
        }

        let workspaces = query
            .order_by_desc(workspace::Column::IsPinned)
            .order_by_asc(workspace::Column::PinOrder)
            .order_by_desc(workspace::Column::PinnedAt)
            .order_by_desc(workspace::Column::CreatedAt)
            .order_by_asc(workspace::Column::Guid)
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
    #[allow(clippy::too_many_arguments)]
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
        github_pr_url: Option<String>,
        github_pr_data: Option<String>,
        auto_extract_todos: bool,
        workflow_status: Option<String>,
        priority: Option<String>,
        label_guids: Option<Vec<String>>,
        create_source: String,
    ) -> Result<workspace::Model> {
        let base = BaseFields::new();

        let serialized_labels = match label_guids {
            Some(guids) => self.serialize_existing_label_guids(guids).await?,
            None => None,
        };

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
            pin_order: Set(None),
            is_archived: Set(false),
            archived_at: Set(None),
            last_visited_at: Set(None),
            workflow_status: Set(workflow_status.unwrap_or_else(|| "in_progress".to_string())),
            priority: Set(priority.unwrap_or_else(|| "no_priority".to_string())),
            label_guids: Set(serialized_labels),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
            github_issue_url: Set(github_issue_url),
            github_issue_data: Set(github_issue_data),
            github_pr_url: Set(github_pr_url),
            github_pr_data: Set(github_pr_data),
            auto_extract_todos: Set(auto_extract_todos),
            create_source: Set(create_source),
        };

        let result = model.insert(self.db).await?;
        Ok(result)
    }

    /// 创建 Issue Only 工作区（从 GitHub Issue 导入）
    /// 不创建分支、不初始化 worktree、不运行 setup flow
    pub async fn create_issue_only(
        &self,
        project_guid: String,
        display_name: Option<String>,
        github_issue_url: String,
        github_issue_data: String,
        workflow_status: Option<String>,
        priority: Option<String>,
        label_guids: Option<Vec<String>>,
    ) -> Result<workspace::Model> {
        let base = BaseFields::new();

        let serialized_labels = match label_guids {
            Some(guids) => self.serialize_existing_label_guids(guids).await?,
            None => None,
        };

        // 生成占位分支名（不实际创建）
        let placeholder_branch = format!("issue-only-{}", &base.guid[..8]);

        let model = workspace::ActiveModel {
            guid: Set(base.guid),
            project_guid: Set(project_guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(placeholder_branch.clone()),
            display_name: Set(display_name),
            branch: Set(placeholder_branch),
            base_branch: Set("main".to_string()),
            sidebar_order: Set(0),
            is_pinned: Set(false),
            pinned_at: Set(None),
            pin_order: Set(None),
            is_archived: Set(false),
            archived_at: Set(None),
            last_visited_at: Set(None),
            workflow_status: Set(workflow_status.unwrap_or_else(|| "backlog".to_string())),
            priority: Set(priority.unwrap_or_else(|| "no_priority".to_string())),
            label_guids: Set(serialized_labels),
            terminal_layout: Set(None),
            maximized_terminal_id: Set(None),
            github_issue_url: Set(Some(github_issue_url)),
            github_issue_data: Set(Some(github_issue_data)),
            github_pr_url: Set(None),
            github_pr_data: Set(None),
            auto_extract_todos: Set(false),
            create_source: Set("issue_only".to_string()),
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

    pub async fn update_last_visited_at(
        &self,
        guid: &str,
        last_visited_at: chrono::NaiveDateTime,
    ) -> Result<()> {
        let result = workspace::Entity::update_many()
            .col_expr(
                workspace::Column::LastVisitedAt,
                Expr::value(Some(last_visited_at)),
            )
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsArchived.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        Ok(())
    }

    pub async fn update_workflow_status(&self, guid: &str, workflow_status: String) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        let result = workspace::Entity::update_many()
            .col_expr(
                workspace::Column::WorkflowStatus,
                Expr::value(workflow_status),
            )
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

    pub async fn update_priority(&self, guid: &str, priority: String) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::Priority, Expr::value(priority))
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

    pub async fn list_labels(&self) -> Result<Vec<workspace_label::Model>> {
        Ok(workspace_label::Entity::find()
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .order_by_asc(workspace_label::Column::Name)
            .all(self.db)
            .await?)
    }

    pub async fn create_label(
        &self,
        name: String,
        color: String,
        source: String,
    ) -> Result<workspace_label::Model> {
        let trimmed_name = name.trim().to_string();
        if let Some(existing) = workspace_label::Entity::find()
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .filter(workspace_label::Column::Name.eq(trimmed_name.clone()))
            .one(self.db)
            .await?
        {
            return Ok(existing);
        }

        let base = BaseFields::new();
        let model = workspace_label::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(base.is_deleted),
            name: Set(trimmed_name),
            color: Set(color),
            source: Set(source),
        };

        Ok(model.insert(self.db).await?)
    }

    pub async fn delete_label(&self, guid: &str) -> Result<()> {
        let now = chrono::Utc::now().naive_utc();
        let result = workspace_label::Entity::update_many()
            .col_expr(workspace_label::Column::IsDeleted, Expr::value(true))
            .col_expr(workspace_label::Column::UpdatedAt, Expr::value(now))
            .filter(workspace_label::Column::Guid.eq(guid))
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace label not found".into(),
            ));
        }
        Ok(())
    }

    pub async fn update_label(
        &self,
        guid: &str,
        name: String,
        color: String,
        source: String,
    ) -> Result<workspace_label::Model> {
        let name = name.trim().to_string();
        if workspace_label::Entity::find()
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .filter(workspace_label::Column::Name.eq(name.clone()))
            .filter(workspace_label::Column::Guid.ne(guid))
            .one(self.db)
            .await?
            .is_some()
        {
            return Err(crate::error::InfraError::Custom(
                "Workspace label name already exists".into(),
            ));
        }

        let now = chrono::Utc::now().naive_utc();
        let result = workspace_label::Entity::update_many()
            .col_expr(workspace_label::Column::Name, Expr::value(name))
            .col_expr(workspace_label::Column::Color, Expr::value(color))
            .col_expr(workspace_label::Column::Source, Expr::value(source))
            .col_expr(workspace_label::Column::UpdatedAt, Expr::value(now))
            .filter(workspace_label::Column::Guid.eq(guid))
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace label not found".into(),
            ));
        }

        let label = workspace_label::Entity::find_by_id(guid.to_string())
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?
            .ok_or_else(|| crate::error::InfraError::Custom("Workspace label not found".into()))?;

        Ok(label)
    }

    pub async fn list_labels_by_workspace_guids(
        &self,
        workspace_guids: &[String],
    ) -> Result<HashMap<String, Vec<workspace_label::Model>>> {
        if workspace_guids.is_empty() {
            return Ok(HashMap::new());
        }

        let workspaces = workspace::Entity::find()
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::Guid.is_in(workspace_guids.to_vec()))
            .all(self.db)
            .await?;

        let mut guids_by_workspace: HashMap<String, Vec<String>> = HashMap::new();
        let mut all_label_guids = HashSet::new();
        for workspace in workspaces {
            let label_guids = workspace
                .label_guids
                .as_deref()
                .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
                .unwrap_or_default();
            for guid in &label_guids {
                all_label_guids.insert(guid.clone());
            }
            guids_by_workspace.insert(workspace.guid, label_guids);
        }

        let label_guids: Vec<String> = all_label_guids.iter().cloned().collect();

        if label_guids.is_empty() {
            return Ok(HashMap::new());
        }

        let labels = workspace_label::Entity::find()
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .filter(workspace_label::Column::Guid.is_in(label_guids))
            .all(self.db)
            .await?;
        let labels_by_guid: HashMap<String, workspace_label::Model> = labels
            .into_iter()
            .map(|label| (label.guid.clone(), label))
            .collect();

        let mut labels_by_workspace = HashMap::new();
        for (workspace_guid, label_guids) in guids_by_workspace {
            let labels = label_guids
                .into_iter()
                .filter_map(|label_guid| labels_by_guid.get(&label_guid).cloned())
                .collect::<Vec<_>>();
            labels_by_workspace.insert(workspace_guid, labels);
        }

        Ok(labels_by_workspace)
    }

    pub async fn update_workspace_labels(
        &self,
        workspace_guid: &str,
        label_guids: Vec<String>,
    ) -> Result<()> {
        let serialized = self.serialize_existing_label_guids(label_guids).await?;

        let now = chrono::Utc::now().naive_utc();
        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::LabelGuids, Expr::value(serialized))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(workspace_guid))
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

    async fn serialize_existing_label_guids(
        &self,
        label_guids: Vec<String>,
    ) -> Result<Option<String>> {
        let mut seen_label_guids = HashSet::new();
        let unique_label_guids: Vec<String> = label_guids
            .into_iter()
            .filter(|guid| !guid.trim().is_empty())
            .filter(|guid| seen_label_guids.insert(guid.clone()))
            .collect();
        if unique_label_guids.is_empty() {
            return Ok(None);
        }

        let existing_label_guids: HashSet<String> = workspace_label::Entity::find()
            .filter(workspace_label::Column::IsDeleted.eq(false))
            .filter(workspace_label::Column::Guid.is_in(unique_label_guids.clone()))
            .all(self.db)
            .await?
            .into_iter()
            .map(|label| label.guid)
            .collect();
        let persisted_label_guids: Vec<String> = unique_label_guids
            .into_iter()
            .filter(|guid| existing_label_guids.contains(guid))
            .collect();
        let serialized = if persisted_label_guids.is_empty() {
            None
        } else {
            Some(
                serde_json::to_string(&persisted_label_guids).map_err(|error| {
                    crate::error::InfraError::Custom(format!(
                        "Failed to serialize workspace label GUIDs: {error}"
                    ))
                })?,
            )
        };

        Ok(serialized)
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
        let txn = self.db.begin().await?;
        let now = chrono::Utc::now().naive_utc();

        workspace::Entity::update_many()
            .col_expr(
                workspace::Column::PinOrder,
                Expr::col(workspace::Column::PinOrder).add(1),
            )
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::IsDeleted.eq(false))
            .filter(workspace::Column::IsPinned.eq(true))
            .filter(workspace::Column::PinOrder.is_not_null())
            .exec(&txn)
            .await?;

        let result = workspace::Entity::update_many()
            .col_expr(workspace::Column::IsPinned, Expr::value(true))
            .col_expr(workspace::Column::PinnedAt, Expr::value(Some(now)))
            .col_expr(workspace::Column::PinOrder, Expr::value(Some(0)))
            .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
            .filter(workspace::Column::Guid.eq(guid))
            .filter(workspace::Column::IsDeleted.eq(false))
            .exec(&txn)
            .await?;
        if result.rows_affected == 0 {
            return Err(crate::error::InfraError::Custom(
                "Workspace not found".into(),
            ));
        }
        txn.commit().await?;
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
            .col_expr(workspace::Column::PinOrder, Expr::value(None::<i32>))
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

    /// 更新置顶工作区顺序
    pub async fn update_pin_order(&self, ordered_guids: Vec<String>) -> Result<()> {
        let txn = self.db.begin().await?;
        let now = chrono::Utc::now().naive_utc();

        for (index, guid) in ordered_guids.iter().enumerate() {
            let result = workspace::Entity::update_many()
                .col_expr(workspace::Column::PinOrder, Expr::value(Some(index as i32)))
                .col_expr(workspace::Column::UpdatedAt, Expr::value(now))
                .filter(workspace::Column::Guid.eq(guid))
                .filter(workspace::Column::IsDeleted.eq(false))
                .filter(workspace::Column::IsPinned.eq(true))
                .exec(&txn)
                .await?;
            if result.rows_affected == 0 {
                return Err(crate::error::InfraError::Custom(
                    "Workspace not found or not pinned".into(),
                ));
            }
        }

        txn.commit().await?;
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
