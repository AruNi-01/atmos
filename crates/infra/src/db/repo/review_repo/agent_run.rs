use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;

use super::ReviewRepo;
use crate::db::entities::base::BaseFields;
use crate::db::entities::review_agent_run;
use crate::error::{InfraError, Result};

pub struct CreateAgentRunParams {
    pub session_guid: String,
    pub base_revision_guid: String,
    pub run_kind: String,
    pub execution_mode: String,
    pub skill_id: Option<String>,
    pub prompt_rel_path: Option<String>,
    pub created_by: Option<String>,
}

impl<'a> ReviewRepo<'a> {
    pub async fn create_agent_run(
        &self,
        params: CreateAgentRunParams,
    ) -> Result<review_agent_run::Model> {
        let base = BaseFields::new();
        let model = review_agent_run::ActiveModel {
            guid: Set(base.guid),
            created_at: Set(base.created_at),
            updated_at: Set(base.updated_at),
            is_deleted: Set(false),
            session_guid: Set(params.session_guid),
            base_revision_guid: Set(params.base_revision_guid),
            result_revision_guid: Set(None),
            run_kind: Set(params.run_kind),
            execution_mode: Set(params.execution_mode),
            status: Set("pending".to_string()),
            skill_id: Set(params.skill_id),
            prompt_rel_path: Set(params.prompt_rel_path),
            result_rel_path: Set(None),
            patch_rel_path: Set(None),
            summary_rel_path: Set(None),
            agent_session_ref: Set(None),
            finalize_attempts: Set(0),
            failure_reason: Set(None),
            created_by: Set(params.created_by),
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

    pub async fn find_agent_run_by_guid(
        &self,
        guid: &str,
    ) -> Result<Option<review_agent_run::Model>> {
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
            update = update.col_expr(
                review_agent_run::Column::StartedAt,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = finished_at {
            update = update.col_expr(
                review_agent_run::Column::FinishedAt,
                Expr::value(Some(value)),
            );
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
            update = update.col_expr(
                review_agent_run::Column::StartedAt,
                Expr::value(Some(value)),
            );
        }
        if let Some(value) = finished_at {
            update = update.col_expr(
                review_agent_run::Column::FinishedAt,
                Expr::value(Some(value)),
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
}
