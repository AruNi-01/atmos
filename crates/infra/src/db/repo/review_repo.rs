use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use crate::db::entities::base::BaseFields;
use crate::db::entities::{
    review_agent_run, review_comment, review_file_identity, review_file_snapshot, review_file_state,
    review_message, review_revision, review_session,
};
use crate::db::repo::base::BaseRepo;
use crate::error::{InfraError, Result};

pub struct ReviewRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> BaseRepo<review_session::Entity, review_session::Model, review_session::ActiveModel>
    for ReviewRepo<'a>
{
    fn db(&self) -> &DatabaseConnection {
        self.db
    }
}

impl<'a> ReviewRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

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

    #[allow(clippy::too_many_arguments)]
    pub async fn create_revision(
        &self,
        guid: Option<String>,
        session_guid: String,
        parent_revision_guid: Option<String>,
        source_kind: String,
        agent_run_guid: Option<String>,
        title: Option<String>,
        storage_root_rel_path: String,
        base_revision_guid: Option<String>,
        created_by: Option<String>,
    ) -> Result<review_revision::Model> {
        let mut base = BaseFields::new();
        if let Some(guid) = guid {
            base.guid = guid;
        }
        let model = review_revision::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            session_guid: Set(session_guid),
            parent_revision_guid: Set(parent_revision_guid),
            source_kind: Set(source_kind),
            agent_run_guid: Set(agent_run_guid),
            title: Set(title),
            storage_root_rel_path: Set(storage_root_rel_path),
            base_revision_guid: Set(base_revision_guid),
            created_by: Set(created_by),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn find_revision_by_guid(
        &self,
        guid: &str,
    ) -> Result<Option<review_revision::Model>> {
        Ok(review_revision::Entity::find_by_id(guid.to_string())
            .filter(review_revision::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn update_revision_title_and_source_kind(
        &self,
        guid: &str,
        title: Option<&str>,
        source_kind: &str,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let mut update = review_revision::Entity::update_many()
            .filter(review_revision::Column::Guid.eq(guid))
            .filter(review_revision::Column::IsDeleted.eq(false))
            .col_expr(review_revision::Column::UpdatedAt, Expr::value(now))
            .col_expr(
                review_revision::Column::SourceKind,
                Expr::value(source_kind.to_string()),
            );
        if let Some(title) = title {
            update = update.col_expr(
                review_revision::Column::Title,
                Expr::value(Some(title.to_string())),
            );
        }
        let result = update
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review revision not found".into()));
        }
        Ok(())
    }

    pub async fn list_revisions_by_session(
        &self,
        session_guid: &str,
    ) -> Result<Vec<review_revision::Model>> {
        Ok(review_revision::Entity::find()
            .filter(review_revision::Column::SessionGuid.eq(session_guid))
            .filter(review_revision::Column::IsDeleted.eq(false))
            .order_by_asc(review_revision::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    pub async fn find_or_create_file_identity(
        &self,
        session_guid: String,
        canonical_file_path: String,
    ) -> Result<review_file_identity::Model> {
        if let Some(model) = review_file_identity::Entity::find()
            .filter(review_file_identity::Column::SessionGuid.eq(session_guid.clone()))
            .filter(review_file_identity::Column::CanonicalFilePath.eq(canonical_file_path.clone()))
            .filter(review_file_identity::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?
        {
            return Ok(model);
        }

        let base = BaseFields::new();
        let model = review_file_identity::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            session_guid: Set(session_guid),
            canonical_file_path: Set(canonical_file_path),
        };
        Ok(model.insert(self.db).await?)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_file_snapshot(
        &self,
        revision_guid: String,
        file_identity_guid: String,
        file_path: String,
        git_status: String,
        old_rel_path: String,
        new_rel_path: String,
        meta_rel_path: String,
        old_sha256: Option<String>,
        new_sha256: Option<String>,
        old_size: i64,
        new_size: i64,
        is_binary: bool,
        display_order: i32,
    ) -> Result<review_file_snapshot::Model> {
        let base = BaseFields::new();
        let model = review_file_snapshot::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            revision_guid: Set(revision_guid),
            file_identity_guid: Set(file_identity_guid),
            file_path: Set(file_path),
            git_status: Set(git_status),
            old_rel_path: Set(old_rel_path),
            new_rel_path: Set(new_rel_path),
            meta_rel_path: Set(meta_rel_path),
            old_sha256: Set(old_sha256),
            new_sha256: Set(new_sha256),
            old_size: Set(old_size),
            new_size: Set(new_size),
            is_binary: Set(is_binary),
            display_order: Set(display_order),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn list_file_snapshots_by_revision(
        &self,
        revision_guid: &str,
    ) -> Result<Vec<review_file_snapshot::Model>> {
        Ok(review_file_snapshot::Entity::find()
            .filter(review_file_snapshot::Column::RevisionGuid.eq(revision_guid))
            .filter(review_file_snapshot::Column::IsDeleted.eq(false))
            .order_by_asc(review_file_snapshot::Column::DisplayOrder)
            .all(self.db)
            .await?)
    }

    pub async fn find_file_snapshot_by_guid(
        &self,
        guid: &str,
    ) -> Result<Option<review_file_snapshot::Model>> {
        Ok(review_file_snapshot::Entity::find_by_id(guid.to_string())
            .filter(review_file_snapshot::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_file_snapshot_content(
        &self,
        guid: &str,
        git_status: String,
        old_sha256: Option<String>,
        new_sha256: Option<String>,
        old_size: i64,
        new_size: i64,
        is_binary: bool,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_file_snapshot::Entity::update_many()
            .col_expr(
                review_file_snapshot::Column::GitStatus,
                Expr::value(git_status),
            )
            .col_expr(
                review_file_snapshot::Column::OldSha256,
                Expr::value(old_sha256),
            )
            .col_expr(
                review_file_snapshot::Column::NewSha256,
                Expr::value(new_sha256),
            )
            .col_expr(review_file_snapshot::Column::OldSize, Expr::value(old_size))
            .col_expr(review_file_snapshot::Column::NewSize, Expr::value(new_size))
            .col_expr(
                review_file_snapshot::Column::IsBinary,
                Expr::value(is_binary),
            )
            .col_expr(review_file_snapshot::Column::UpdatedAt, Expr::value(now))
            .filter(review_file_snapshot::Column::Guid.eq(guid))
            .filter(review_file_snapshot::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review file snapshot not found".into()));
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_file_state(
        &self,
        revision_guid: String,
        file_identity_guid: String,
        file_snapshot_guid: String,
        reviewed: bool,
        reviewed_at: Option<chrono::NaiveDateTime>,
        reviewed_by: Option<String>,
        inherited_from_file_state_guid: Option<String>,
        last_code_change_at: Option<chrono::NaiveDateTime>,
    ) -> Result<review_file_state::Model> {
        let base = BaseFields::new();
        let model = review_file_state::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            revision_guid: Set(revision_guid),
            file_identity_guid: Set(file_identity_guid),
            file_snapshot_guid: Set(file_snapshot_guid),
            reviewed: Set(reviewed),
            reviewed_at: Set(reviewed_at),
            reviewed_by: Set(reviewed_by),
            inherited_from_file_state_guid: Set(inherited_from_file_state_guid),
            last_code_change_at: Set(last_code_change_at),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn update_file_state_code_change(
        &self,
        guid: &str,
        last_code_change_at: Option<chrono::NaiveDateTime>,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_file_state::Entity::update_many()
            .col_expr(
                review_file_state::Column::LastCodeChangeAt,
                Expr::value(last_code_change_at),
            )
            .col_expr(review_file_state::Column::UpdatedAt, Expr::value(now))
            .filter(review_file_state::Column::Guid.eq(guid))
            .filter(review_file_state::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review file state not found".into()));
        }
        Ok(())
    }

    pub async fn list_file_states_by_revision(
        &self,
        revision_guid: &str,
    ) -> Result<Vec<review_file_state::Model>> {
        Ok(review_file_state::Entity::find()
            .filter(review_file_state::Column::RevisionGuid.eq(revision_guid))
            .filter(review_file_state::Column::IsDeleted.eq(false))
            .all(self.db)
            .await?)
    }

    pub async fn update_file_reviewed(
        &self,
        guid: &str,
        reviewed: bool,
        reviewed_by: Option<String>,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let reviewed_at = if reviewed { Some(now) } else { None };
        let reviewed_by_value = if reviewed { reviewed_by } else { None };
        let result = review_file_state::Entity::update_many()
            .col_expr(review_file_state::Column::Reviewed, Expr::value(reviewed))
            .col_expr(
                review_file_state::Column::ReviewedAt,
                Expr::value(reviewed_at),
            )
            .col_expr(
                review_file_state::Column::ReviewedBy,
                Expr::value(reviewed_by_value),
            )
            .col_expr(review_file_state::Column::UpdatedAt, Expr::value(now))
            .filter(review_file_state::Column::Guid.eq(guid))
            .filter(review_file_state::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review file state not found".into()));
        }
        Ok(())
    }

    pub async fn find_file_state_by_guid(
        &self,
        guid: &str,
    ) -> Result<Option<review_file_state::Model>> {
        Ok(review_file_state::Entity::find_by_id(guid.to_string())
            .filter(review_file_state::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

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

    pub async fn create_agent_run(
        &self,
        session_guid: String,
        base_revision_guid: String,
        run_kind: String,
        execution_mode: String,
        skill_id: Option<String>,
        prompt_rel_path: Option<String>,
        created_by: Option<String>,
    ) -> Result<review_agent_run::Model> {
        let base = BaseFields::new();
        let model = review_agent_run::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            session_guid: Set(session_guid),
            base_revision_guid: Set(base_revision_guid),
            result_revision_guid: Set(None),
            run_kind: Set(run_kind),
            execution_mode: Set(execution_mode),
            status: Set("pending".to_string()),
            skill_id: Set(skill_id),
            prompt_rel_path: Set(prompt_rel_path),
            result_rel_path: Set(None),
            patch_rel_path: Set(None),
            summary_rel_path: Set(None),
            agent_session_ref: Set(None),
            finalize_attempts: Set(0),
            failure_reason: Set(None),
            created_by: Set(created_by),
            started_at: Set(None),
            finished_at: Set(None),
        };
        Ok(model.insert(self.db).await?)
    }

    pub async fn update_agent_run_prompt_rel_path(
        &self,
        guid: &str,
        prompt_rel_path: &str,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = review_agent_run::Entity::update_many()
            .col_expr(
                review_agent_run::Column::PromptRelPath,
                Expr::value(Some(prompt_rel_path.to_string())),
            )
            .col_expr(review_agent_run::Column::UpdatedAt, Expr::value(now))
            .filter(review_agent_run::Column::Guid.eq(guid))
            .filter(review_agent_run::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review agent run not found".into()));
        }
        Ok(())
    }

    pub async fn find_agent_run_by_guid(&self, guid: &str) -> Result<Option<review_agent_run::Model>> {
        Ok(review_agent_run::Entity::find_by_id(guid.to_string())
            .filter(review_agent_run::Column::IsDeleted.eq(false))
            .one(self.db)
            .await?)
    }

    pub async fn list_agent_runs_by_session(
        &self,
        session_guid: &str,
    ) -> Result<Vec<review_agent_run::Model>> {
        Ok(review_agent_run::Entity::find()
            .filter(review_agent_run::Column::SessionGuid.eq(session_guid))
            .filter(review_agent_run::Column::IsDeleted.eq(false))
            .order_by_desc(review_agent_run::Column::CreatedAt)
            .all(self.db)
            .await?)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_agent_run_status(
        &self,
        guid: &str,
        status: &str,
        result_revision_guid: Option<String>,
        result_rel_path: Option<String>,
        patch_rel_path: Option<String>,
        summary_rel_path: Option<String>,
        started_at: Option<chrono::NaiveDateTime>,
        finished_at: Option<chrono::NaiveDateTime>,
        failure_reason: Option<String>,
        increment_finalize_attempts: bool,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let mut update = review_agent_run::Entity::update_many()
            .col_expr(
                review_agent_run::Column::Status,
                Expr::value(status.to_string()),
            )
            .col_expr(review_agent_run::Column::UpdatedAt, Expr::value(now));

        if let Some(value) = result_revision_guid {
            update = update.col_expr(
                review_agent_run::Column::ResultRevisionGuid,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = result_rel_path {
            update = update.col_expr(
                review_agent_run::Column::ResultRelPath,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = patch_rel_path {
            update = update.col_expr(
                review_agent_run::Column::PatchRelPath,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = summary_rel_path {
            update = update.col_expr(
                review_agent_run::Column::SummaryRelPath,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = started_at {
            update = update.col_expr(review_agent_run::Column::StartedAt, Expr::value(Some(value)));
        }
        if let Some(value) = finished_at {
            update = update.col_expr(review_agent_run::Column::FinishedAt, Expr::value(Some(value)));
        }
        if let Some(value) = failure_reason {
            update = update.col_expr(
                review_agent_run::Column::FailureReason,
                Expr::value(Some(value)),
            );
        }
        if increment_finalize_attempts {
            update = update.col_expr(
                review_agent_run::Column::FinalizeAttempts,
                Expr::col(review_agent_run::Column::FinalizeAttempts).add(1),
            );
        }

        let result = update
            .filter(review_agent_run::Column::Guid.eq(guid))
            .filter(review_agent_run::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review agent run not found".into()));
        }
        Ok(())
    }

    /// Persist the summary artifact path (and optionally the run's finish
    /// timestamp / start timestamp) without touching the lifecycle status.
    /// Intended for "summary written, not yet finalized" transitions — the
    /// terminal status must only be set by `finalize_agent_run` once all
    /// artifacts have been persisted.
    pub async fn update_agent_run_summary_path(
        &self,
        guid: &str,
        summary_rel_path: String,
        started_at: Option<chrono::NaiveDateTime>,
        finished_at: Option<chrono::NaiveDateTime>,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let mut update = review_agent_run::Entity::update_many()
            .col_expr(review_agent_run::Column::UpdatedAt, Expr::value(now))
            .col_expr(
                review_agent_run::Column::SummaryRelPath,
                Expr::value(Some(summary_rel_path)),
            );
        if let Some(value) = started_at {
            update = update.col_expr(review_agent_run::Column::StartedAt, Expr::value(Some(value)));
        }
        if let Some(value) = finished_at {
            update = update.col_expr(review_agent_run::Column::FinishedAt, Expr::value(Some(value)));
        }

        let result = update
            .filter(review_agent_run::Column::Guid.eq(guid))
            .filter(review_agent_run::Column::IsDeleted.eq(false))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom("Review agent run not found".into()));
        }
        Ok(())
    }
}
