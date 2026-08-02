//! Repository for durable `queue_event` rows (APP-051 LocalPersistentQueue).

use chrono::{Duration as ChronoDuration, NaiveDateTime, Utc};
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};

use crate::db::entities::queue_event::{self, status as event_status};
use crate::error::{InfraError, Result};

const MAX_BACKOFF_SECS: i64 = 300;

pub struct QueueEventRepo<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> QueueEventRepo<'a> {
    pub fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn insert_pending(
        &self,
        guid: &str,
        topic: &str,
        payload: Vec<u8>,
        max_attempts: i32,
    ) -> Result<queue_event::Model> {
        let now = Utc::now().naive_utc();
        let model = queue_event::ActiveModel {
            guid: Set(guid.to_string()),
            created_at: Set(now),
            updated_at: Set(now),
            topic: Set(topic.to_string()),
            payload: Set(payload),
            status: Set(event_status::PENDING.to_string()),
            attempts: Set(0),
            max_attempts: Set(max_attempts),
            last_error: Set(None),
            available_at: Set(now),
            processed_at: Set(None),
        };
        Ok(model.insert(self.db).await?)
    }

    /// Atomically claim the next available pending row for `topic`.
    ///
    /// Uses `UPDATE … WHERE status = pending` so a concurrent claim loses cleanly
    /// (`rows_affected == 0`) instead of select-then-unconditional-update.
    pub async fn claim_next(&self, topic: &str) -> Result<Option<queue_event::Model>> {
        let now = Utc::now().naive_utc();
        let candidate = queue_event::Entity::find()
            .filter(queue_event::Column::Topic.eq(topic))
            .filter(queue_event::Column::Status.eq(event_status::PENDING))
            .filter(queue_event::Column::AvailableAt.lte(now))
            .order_by_asc(queue_event::Column::AvailableAt)
            .order_by_asc(queue_event::Column::CreatedAt)
            .one(self.db)
            .await?;

        let Some(model) = candidate else {
            return Ok(None);
        };

        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::PROCESSING),
            )
            .col_expr(
                queue_event::Column::Attempts,
                Expr::col(queue_event::Column::Attempts).add(1),
            )
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Guid.eq(&model.guid))
            .filter(queue_event::Column::Status.eq(event_status::PENDING))
            // Re-check availability so a concurrent requeue with future
            // available_at cannot be claimed early.
            .filter(queue_event::Column::AvailableAt.lte(now))
            .exec(self.db)
            .await?;

        if result.rows_affected == 0 {
            // Lost the race to another claim (or row was deleted).
            return Ok(None);
        }

        Ok(queue_event::Entity::find_by_id(model.guid)
            .one(self.db)
            .await?)
    }

    pub async fn mark_succeeded(&self, guid: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::SUCCEEDED),
            )
            .col_expr(
                queue_event::Column::LastError,
                Expr::value(Option::<String>::None),
            )
            .col_expr(queue_event::Column::ProcessedAt, Expr::value(Some(now)))
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Guid.eq(guid))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom(format!(
                "queue event {guid} not in processing for succeed"
            )));
        }
        Ok(())
    }

    /// After a handler error: permanent fail, or requeue with backoff.
    ///
    /// `attempts` is the already-incremented claim count on the model.
    /// When `permanent` is true, mark `failed` immediately (no retries).
    pub async fn mark_failure(
        &self,
        model: &queue_event::Model,
        error: String,
        permanent: bool,
    ) -> Result<()> {
        let now = Utc::now().naive_utc();
        let attempts = model.attempts;
        if permanent || attempts >= model.max_attempts {
            let result = queue_event::Entity::update_many()
                .col_expr(
                    queue_event::Column::Status,
                    Expr::value(event_status::FAILED),
                )
                .col_expr(queue_event::Column::LastError, Expr::value(Some(error)))
                .col_expr(queue_event::Column::ProcessedAt, Expr::value(Some(now)))
                .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
                .filter(queue_event::Column::Guid.eq(&model.guid))
                .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
                .exec(self.db)
                .await?;
            if result.rows_affected == 0 {
                return Err(InfraError::Custom(format!(
                    "queue event {} not in processing for fail",
                    model.guid
                )));
            }
            return Ok(());
        }

        // Cap exponent at 9 so 2^n can reach MAX_BACKOFF_SECS (300).
        let backoff_secs = (1_i64 << (attempts.saturating_sub(1).min(9))).min(MAX_BACKOFF_SECS);
        let available_at = now + ChronoDuration::seconds(backoff_secs);
        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::PENDING),
            )
            .col_expr(queue_event::Column::LastError, Expr::value(Some(error)))
            .col_expr(queue_event::Column::AvailableAt, Expr::value(available_at))
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Guid.eq(&model.guid))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom(format!(
                "queue event {} not in processing for requeue",
                model.guid
            )));
        }
        Ok(())
    }

    /// Force a stuck `processing` row back to `pending` (used when terminal writes fail).
    pub async fn release_to_pending(&self, guid: &str, last_error: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::PENDING),
            )
            .col_expr(
                queue_event::Column::LastError,
                Expr::value(Some(last_error.to_string())),
            )
            .col_expr(queue_event::Column::AvailableAt, Expr::value(now))
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Guid.eq(guid))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .exec(self.db)
            .await?;
        Ok(())
    }

    /// Requeue `processing` rows that have not been updated within `stale_after`.
    ///
    /// Reclaim `processing` rows whose `updated_at` is older than `stale_after`.
    /// Pass a lease longer than the handler timeout so live handlers are not
    /// double-claimed by another process (including on worker start).
    ///
    /// Rows that already exhausted `max_attempts` are marked `failed` instead of
    /// being re-queued, so attempt limits stay terminal across reclaim.
    pub async fn requeue_stale_processing(
        &self,
        topic: &str,
        stale_after: ChronoDuration,
    ) -> Result<u64> {
        let cutoff = Utc::now().naive_utc() - stale_after;
        let now = Utc::now().naive_utc();

        let exhausted = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::FAILED),
            )
            .col_expr(
                queue_event::Column::LastError,
                Expr::value(Some(
                    "stale processing reclaim: max attempts already exhausted".to_string(),
                )),
            )
            .col_expr(queue_event::Column::ProcessedAt, Expr::value(Some(now)))
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Topic.eq(topic))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .filter(queue_event::Column::UpdatedAt.lte(cutoff))
            .filter(
                Expr::col(queue_event::Column::Attempts)
                    .gte(Expr::col(queue_event::Column::MaxAttempts)),
            )
            .exec(self.db)
            .await?;

        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::PENDING),
            )
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .col_expr(queue_event::Column::AvailableAt, Expr::value(now))
            .filter(queue_event::Column::Topic.eq(topic))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .filter(queue_event::Column::UpdatedAt.lte(cutoff))
            .filter(
                Expr::col(queue_event::Column::Attempts)
                    .lt(Expr::col(queue_event::Column::MaxAttempts)),
            )
            .exec(self.db)
            .await?;
        Ok(exhausted.rows_affected + result.rows_affected)
    }

    /// Force a `processing` row to `failed` (last-resort terminalization).
    pub async fn force_mark_failed(&self, guid: &str, error: &str) -> Result<()> {
        let now = Utc::now().naive_utc();
        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                Expr::value(event_status::FAILED),
            )
            .col_expr(
                queue_event::Column::LastError,
                Expr::value(Some(error.to_string())),
            )
            .col_expr(queue_event::Column::ProcessedAt, Expr::value(Some(now)))
            .col_expr(queue_event::Column::UpdatedAt, Expr::value(now))
            .filter(queue_event::Column::Guid.eq(guid))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .exec(self.db)
            .await?;
        if result.rows_affected == 0 {
            return Err(InfraError::Custom(format!(
                "queue event {guid} not in processing for force fail"
            )));
        }
        Ok(())
    }

    /// Delete terminal rows whose **completion** time is older than `cutoff`.
    ///
    /// Prefer `processed_at` so a long-waiting job that finished recently is
    /// retained for the full terminal retention window. Fall back to
    /// `updated_at` when `processed_at` is missing (legacy / partial rows).
    pub async fn delete_terminal_older_than(&self, cutoff: NaiveDateTime) -> Result<u64> {
        let result = queue_event::Entity::delete_many()
            .filter(
                queue_event::Column::Status.is_in([event_status::SUCCEEDED, event_status::FAILED]),
            )
            .filter(Expr::cust_with_values(
                "(COALESCE(processed_at, updated_at) < ?)",
                [cutoff],
            ))
            .exec(self.db)
            .await?;
        Ok(result.rows_affected)
    }

    pub async fn find_by_guid(&self, guid: &str) -> Result<Option<queue_event::Model>> {
        Ok(queue_event::Entity::find_by_id(guid.to_string())
            .one(self.db)
            .await?)
    }
}
