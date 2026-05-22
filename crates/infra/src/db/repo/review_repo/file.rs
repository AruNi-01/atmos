use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use super::ReviewRepo;
use crate::db::entities::base::BaseFields;
use crate::db::entities::{review_file_identity, review_file_snapshot, review_file_state};
use crate::error::{InfraError, Result};

impl<'a> ReviewRepo<'a> {
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
}
