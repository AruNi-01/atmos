use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use super::ReviewRepo;
use crate::db::entities::base::BaseFields;
use crate::db::entities::{review_comment, review_message};
use crate::error::{InfraError, Result};

impl<'a> ReviewRepo<'a> {
    #[allow(clippy::too_many_arguments)]
    pub async fn create_comment(
        &self,
        session_guid: String,
        revision_guid: String,
        file_snapshot_guid: String,
        anchor_side: String,
        anchor_start_line: i32,
        anchor_end_line: i32,
        anchor_line_range_kind: String,
        anchor_json: String,
        status: String,
        parent_comment_guid: Option<String>,
        title: Option<String>,
        created_by: Option<String>,
    ) -> Result<review_comment::Model> {
        let base = BaseFields::new();
        let model = review_comment::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            session_guid: Set(session_guid),
            revision_guid: Set(revision_guid),
            file_snapshot_guid: Set(file_snapshot_guid),
            anchor_side: Set(anchor_side),
            anchor_start_line: Set(anchor_start_line),
            anchor_end_line: Set(anchor_end_line),
            anchor_line_range_kind: Set(anchor_line_range_kind),
            anchor_json: Set(anchor_json),
            status: Set(status),
            parent_comment_guid: Set(parent_comment_guid),
            title: Set(title),
            created_by: Set(created_by),
            fixed_at: Set(None),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn list_comments_by_session(
        &self,
        session_guid: &str,
    ) -> Result<Vec<review_comment::Model>> {
        Ok(review_comment::Entity::find()
            .filter(review_comment::Column::SessionGuid.eq(session_guid))
            .filter(review_comment::Column::IsDeleted.eq(false))
            .order_by_asc(review_comment::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn list_comments_by_revision(
        &self,
        revision_guid: &str,
    ) -> Result<Vec<review_comment::Model>> {
        Ok(review_comment::Entity::find()
            .filter(review_comment::Column::RevisionGuid.eq(revision_guid))
            .filter(review_comment::Column::IsDeleted.eq(false))
            .order_by_asc(review_comment::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn update_comment_status(&self, guid: &str, status: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let fixed_at = if status == "fixed" { Some(now) } else { None };
        let result = review_comment::Entity::update_many()
            .col_expr(
                review_comment::Column::Status,
                Expr::value(status.to_string()),
            )
            .col_expr(review_comment::Column::UpdatedAt, Expr::value(now))
            .col_expr(review_comment::Column::FixedAt, Expr::value(fixed_at))
            .filter(review_comment::Column::Guid.eq(guid))
            .filter(review_comment::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review comment not found".into()));
        }
        Ok(())
    }

    pub async fn find_comment_by_guid(&self, guid: &str) -> Result<Option<review_comment::Model>> {
        Ok(review_comment::Entity::find_by_id(guid.to_string())
            .filter(review_comment::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn soft_delete_comment(&self, guid: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_comment::Entity::update_many()
            .col_expr(review_comment::Column::IsDeleted, Expr::value(true))
            .col_expr(review_comment::Column::UpdatedAt, Expr::value(now))
            .filter(review_comment::Column::Guid.eq(guid))
            .filter(review_comment::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review comment not found".into()));
        }
        Ok(())
    }

    pub async fn touch_comment(&self, guid: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_comment::Entity::update_many()
            .col_expr(review_comment::Column::UpdatedAt, Expr::value(now))
            .filter(review_comment::Column::Guid.eq(guid))
            .filter(review_comment::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review comment not found".into()));
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_message(
        &self,
        comment_guid: String,
        author_type: String,
        kind: String,
        body_storage_kind: String,
        body: String,
        body_rel_path: Option<String>,
        agent_run_guid: Option<String>,
    ) -> Result<review_message::Model> {
        let base = BaseFields::new();
        let model = review_message::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            comment_guid: Set(comment_guid),
            author_type: Set(author_type),
            kind: Set(kind),
            body_storage_kind: Set(body_storage_kind),
            body: Set(body),
            body_rel_path: Set(body_rel_path),
            agent_run_guid: Set(agent_run_guid),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn find_message_by_guid(&self, guid: &str) -> Result<Option<review_message::Model>> {
        Ok(review_message::Entity::find_by_id(guid.to_string())
            .filter(review_message::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn update_message_body(
        &self,
        guid: &str,
        body_storage_kind: String,
        body: String,
        body_rel_path: Option<String>,
    ) -> Result<review_message::Model> {
        let now = Utc::now().naive_utc();
        let result = review_message::Entity::update_many()
            .col_expr(
                review_message::Column::BodyStorageKind,
                Expr::value(body_storage_kind),
            )
            .col_expr(review_message::Column::Body, Expr::value(body))
            .col_expr(
                review_message::Column::BodyRelPath,
                Expr::value(body_rel_path),
            )
            .col_expr(review_message::Column::UpdatedAt, Expr::value(now))
            .filter(review_message::Column::Guid.eq(guid))
            .filter(review_message::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review message not found".into()));
        }
        self.find_message_by_guid(guid)
            .await?
            .ok_or_else(|| InfraError::Custom("Review message not found".into()))
    }

    pub async fn soft_delete_message(&self, guid: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_message::Entity::update_many()
            .col_expr(review_message::Column::IsDeleted, Expr::value(true))
            .col_expr(review_message::Column::UpdatedAt, Expr::value(now))
            .filter(review_message::Column::Guid.eq(guid))
            .filter(review_message::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review message not found".into()));
        }
        Ok(())
    }

    pub async fn list_messages_by_comment_guids(
        &self,
        comment_guids: &[String],
    ) -> Result<Vec<review_message::Model>> {
        if comment_guids.is_empty() {
            return Ok(Vec::new());
        }
        Ok(review_message::Entity::find()
            .filter(review_message::Column::CommentGuid.is_in(comment_guids.iter().cloned()))
            .filter(review_message::Column::IsDeleted.eq(false))
            .order_by_asc(review_message::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn reassign_messages_by_agent_run(
        &self,
        agent_run_guid: &str,
        from_comment_guids: &[String],
        to_comment_guids: &[String],
        include_unlinked_agent_messages_since: Option<chrono::NaiveDateTime>,
    ) -> Result<()> {
        if from_comment_guids.len() != to_comment_guids.len() {
            return Err(InfraError::Custom(
                "from_comment_guids and to_comment_guids must have the same length".into(),
            ));
        }
        for (from_guid, to_guid) in from_comment_guids.iter().zip(to_comment_guids.iter()) {
            let now = chrono::Utc::now().naive_utc();
            let mut message_filter = Condition::any()
                .add(review_message::Column::AgentRunGuid.eq(agent_run_guid.to_string()));
            if let Some(since) = include_unlinked_agent_messages_since {
                message_filter = message_filter.add(
                    Condition::all()
                        .add(review_message::Column::AgentRunGuid.is_null())
                        .add(review_message::Column::AuthorType.ne("user"))
                        .add(review_message::Column::CreatedAt.gte(since)),
                );
            }
            review_message::Entity::update_many()
                .col_expr(
                    review_message::Column::CommentGuid,
                    Expr::value(to_guid.clone()),
                )
                .col_expr(review_message::Column::UpdatedAt, Expr::value(now))
                .filter(review_message::Column::CommentGuid.eq(from_guid.clone()))
                .filter(message_filter)
                .filter(review_message::Column::IsDeleted.eq(false))
                .exec(self.db)
                .await?;
        }
        Ok(())
    }
}
