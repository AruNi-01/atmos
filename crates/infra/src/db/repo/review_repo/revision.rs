use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use super::ReviewRepo;
use crate::db::entities::base::BaseFields;
use crate::db::entities::review_revision;
use crate::error::{InfraError, Result};

impl<'a> ReviewRepo<'a> {
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
        let result = update.exec(self.db).await?;
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
}
