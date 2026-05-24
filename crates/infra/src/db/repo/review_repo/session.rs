use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use super::ReviewRepo;
use crate::db::entities::base::BaseFields;
use crate::db::entities::review_session;
use crate::error::{InfraError, Result};

impl<'a> ReviewRepo<'a> {
    #[allow(clippy::too_many_arguments)]
    pub async fn create_session(
        &self,
        guid: Option<String>,
        workspace_guid: Option<String>,
        project_guid: String,
        repo_path: String,
        storage_root_rel_path: String,
        base_ref: Option<String>,
        base_commit: Option<String>,
        head_commit: String,
        current_revision_guid: String,
        status: String,
        title: Option<String>,
        created_by: Option<String>,
    ) -> Result<review_session::Model> {
        let mut base = BaseFields::new();
        if let Some(guid) = guid {
            base.guid = guid;
        }
        let model = review_session::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            workspace_guid: Set(workspace_guid),
            project_guid: Set(project_guid),
            repo_path: Set(repo_path),
            storage_root_rel_path: Set(storage_root_rel_path),
            base_ref: Set(base_ref),
            base_commit: Set(base_commit),
            head_commit: Set(head_commit),
            current_revision_guid: Set(current_revision_guid),
            status: Set(status),
            title: Set(title),
            created_by: Set(created_by),
            closed_at: Set(None),
            archived_at: Set(None),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn find_session_by_guid(&self, guid: &str) -> Result<Option<review_session::Model>> {
        Ok(review_session::Entity::find_by_id(guid.to_string())
            .filter(review_session::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn list_sessions_by_workspace(
        &self,
        workspace_guid: &str,
        include_archived: bool,
    ) -> Result<Vec<review_session::Model>> {
        let mut query = review_session::Entity::find()
            .filter(review_session::Column::WorkspaceGuid.eq(workspace_guid))
            .filter(review_session::Column::IsDeleted.eq(false));
        if !include_archived {
            query = query.filter(review_session::Column::Status.ne("archived"));
        }
        Ok(query
            .order_by_desc(review_session::Column::UpdatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn list_sessions_by_project(
        &self,
        project_guid: &str,
        include_archived: bool,
    ) -> Result<Vec<review_session::Model>> {
        let mut query = review_session::Entity::find()
            .filter(review_session::Column::ProjectGuid.eq(project_guid))
            .filter(review_session::Column::WorkspaceGuid.is_null())
            .filter(review_session::Column::IsDeleted.eq(false));
        if !include_archived {
            query = query.filter(review_session::Column::Status.ne("archived"));
        }
        Ok(query
            .order_by_desc(review_session::Column::UpdatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn soft_delete_session(&self, guid: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        review_session::Entity::update_many()
            .col_expr(review_session::Column::IsDeleted, Expr::value(true))
            .col_expr(review_session::Column::UpdatedAt, Expr::value(now))
            .filter(review_session::Column::Guid.eq(guid))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub async fn update_session_current_revision(
        &self,
        guid: &str,
        current_revision_guid: &str,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_session::Entity::update_many()
            .col_expr(
                review_session::Column::CurrentRevisionGuid,
                Expr::value(current_revision_guid.to_string()),
            )
            .col_expr(review_session::Column::UpdatedAt, Expr::value(now))
            .filter(review_session::Column::Guid.eq(guid))
            .filter(review_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review session not found".into()));
        }
        Ok(())
    }

    pub async fn update_session_status(&self, guid: &str, status: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let mut update = review_session::Entity::update_many()
            .col_expr(
                review_session::Column::Status,
                Expr::value(status.to_string()),
            )
            .col_expr(review_session::Column::UpdatedAt, Expr::value(now));
        if status == "closed" {
            update = update.col_expr(review_session::Column::ClosedAt, Expr::value(Some(now)));
        }
        if status == "archived" {
            update = update.col_expr(review_session::Column::ArchivedAt, Expr::value(Some(now)));
        }
        if status == "active" {
            update = update
                .col_expr(
                    review_session::Column::ClosedAt,
                    Expr::value(None::<chrono::NaiveDateTime>),
                )
                .col_expr(
                    review_session::Column::ArchivedAt,
                    Expr::value(None::<chrono::NaiveDateTime>),
                );
        }
        let result = update
            .filter(review_session::Column::Guid.eq(guid))
            .filter(review_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review session not found".into()));
        }
        Ok(())
    }

    pub async fn update_session_title(&self, guid: &str, title: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_session::Entity::update_many()
            .col_expr(
                review_session::Column::Title,
                Expr::value(title.to_string()),
            )
            .col_expr(review_session::Column::UpdatedAt, Expr::value(now))
            .filter(review_session::Column::Guid.eq(guid))
            .filter(review_session::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review session not found".into()));
        }
        Ok(())
    }
}
