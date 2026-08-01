//! SQLite-backed durable queue for third-party trigger events (APP-051).
//!
//! Persist-on-accept: `enqueue` writes a row before the caller ACKs the provider.
//! Workers claim `pending` rows, run handlers, and retry on failure until max attempts.
//! [`super::LocalMemoryQueue`] remains available for process-local, droppable buffering.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use tokio::sync::{Mutex, Notify};
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::db::entities::queue_event::{self, status as event_status};

use super::types::{EnqueueError, QueueError, QueueMessage, Topic};

const DEFAULT_MAX_ATTEMPTS: i32 = 5;
const POLL_IDLE: Duration = Duration::from_millis(250);
const MAX_BACKOFF_SECS: i64 = 300;

type DynHandler = Arc<
    dyn Fn(QueueMessage) -> std::pin::Pin<Box<dyn Future<Output = Result<(), QueueError>> + Send>>
        + Send
        + Sync,
>;

/// Durable local queue stored in the main Atmos SQLite database.
pub struct LocalPersistentQueue {
    db: DatabaseConnection,
    notify: Arc<Notify>,
    shutting_down: Arc<AtomicBool>,
    workers: Mutex<HashMap<String, JoinHandle<()>>>,
    default_max_attempts: i32,
}

impl LocalPersistentQueue {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            db,
            notify: Arc::new(Notify::new()),
            shutting_down: Arc::new(AtomicBool::new(false)),
            workers: Mutex::new(HashMap::new()),
            default_max_attempts: DEFAULT_MAX_ATTEMPTS,
        }
    }

    pub fn with_max_attempts(mut self, max_attempts: u32) -> Self {
        self.default_max_attempts = max_attempts.max(1) as i32;
        self
    }

    /// Persist a message as `pending` and wake workers. Safe to ACK the provider after this returns.
    pub async fn enqueue(&self, topic: &Topic, payload: Vec<u8>) -> Result<String, EnqueueError> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(EnqueueError::ShuttingDown);
        }

        let now = Utc::now().naive_utc();
        let guid = Uuid::new_v4().to_string();
        let model = queue_event::ActiveModel {
            guid: Set(guid.clone()),
            created_at: Set(now),
            updated_at: Set(now),
            topic: Set(topic.as_str().to_string()),
            payload: Set(payload),
            status: Set(event_status::PENDING.to_string()),
            attempts: Set(0),
            max_attempts: Set(self.default_max_attempts),
            last_error: Set(None),
            available_at: Set(now),
            processed_at: Set(None),
        };

        model.insert(&self.db).await.map_err(|error| {
            warn!(error = %error, "persistent queue enqueue failed");
            EnqueueError::Internal(format!("persist enqueue failed: {error}"))
        })?;

        debug!(topic = %topic, guid = %guid, "persistent queue enqueued");
        self.notify.notify_waiters();
        Ok(guid)
    }

    /// Start a single background worker for `topic` (one worker per topic in v1).
    pub async fn subscribe_worker<F, Fut>(&self, topic: Topic, handler: F) -> Result<(), QueueError>
    where
        F: Fn(QueueMessage) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), QueueError>> + Send + 'static,
    {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(QueueError::ShuttingDown);
        }

        let mut workers = self.workers.lock().await;
        if workers.contains_key(topic.as_str()) {
            return Err(QueueError::ConsumerExists(topic.as_str().to_string()));
        }

        self.requeue_stuck_processing(topic.as_str()).await?;

        let dyn_handler: DynHandler = Arc::new(move |msg| {
            let fut = handler(msg);
            Box::pin(fut) as std::pin::Pin<Box<dyn Future<Output = Result<(), QueueError>> + Send>>
        });

        let db = self.db.clone();
        let notify = Arc::clone(&self.notify);
        let shutting_down = Arc::clone(&self.shutting_down);
        let topic_for_task = topic.as_str().to_string();

        let handle = tokio::spawn(async move {
            loop {
                if shutting_down.load(Ordering::SeqCst) {
                    break;
                }

                match claim_next(&db, &topic_for_task).await {
                    Ok(Some(model)) => {
                        let msg = QueueMessage {
                            id: model.guid.clone(),
                            payload: model.payload.clone(),
                            enqueued_at: model.created_at.and_utc(),
                        };
                        match dyn_handler(msg).await {
                            Ok(()) => {
                                if let Err(error) = mark_succeeded(&db, &model.guid).await {
                                    warn!(
                                        guid = %model.guid,
                                        error = %error,
                                        "failed to mark queue event succeeded"
                                    );
                                }
                            }
                            Err(error) => {
                                if let Err(mark_error) =
                                    mark_failure(&db, &model, error.to_string()).await
                                {
                                    warn!(
                                        guid = %model.guid,
                                        error = %mark_error,
                                        "failed to mark queue event failure"
                                    );
                                }
                            }
                        }
                    }
                    Ok(None) => {
                        tokio::select! {
                            _ = notify.notified() => {}
                            _ = tokio::time::sleep(POLL_IDLE) => {}
                        }
                    }
                    Err(error) => {
                        warn!(topic = %topic_for_task, error = %error, "queue claim failed");
                        tokio::time::sleep(POLL_IDLE).await;
                    }
                }
            }
        });

        workers.insert(topic.as_str().to_string(), handle);
        info!(topic = %topic, "persistent queue worker started");
        Ok(())
    }

    async fn requeue_stuck_processing(&self, topic: &str) -> Result<(), QueueError> {
        let now = Utc::now().naive_utc();
        let result = queue_event::Entity::update_many()
            .col_expr(
                queue_event::Column::Status,
                sea_orm::sea_query::Expr::value(event_status::PENDING),
            )
            .col_expr(
                queue_event::Column::UpdatedAt,
                sea_orm::sea_query::Expr::value(now),
            )
            .filter(queue_event::Column::Topic.eq(topic))
            .filter(queue_event::Column::Status.eq(event_status::PROCESSING))
            .exec(&self.db)
            .await
            .map_err(|e| QueueError::Internal(e.to_string()))?;
        if result.rows_affected > 0 {
            warn!(
                topic = %topic,
                count = result.rows_affected,
                "requeued stuck processing queue events after restart"
            );
        }
        Ok(())
    }

    /// Delete terminal events older than `retention` (e.g. 30 days).
    pub async fn cleanup_older_than(&self, retention: Duration) -> Result<u64, QueueError> {
        let cutoff = Utc::now().naive_utc()
            - ChronoDuration::from_std(retention).unwrap_or_else(|_| ChronoDuration::days(30));
        let result = queue_event::Entity::delete_many()
            .filter(queue_event::Column::CreatedAt.lt(cutoff))
            .filter(
                queue_event::Column::Status.is_in([event_status::SUCCEEDED, event_status::FAILED]),
            )
            .exec(&self.db)
            .await
            .map_err(|e| QueueError::Internal(e.to_string()))?;
        if result.rows_affected > 0 {
            info!(
                deleted = result.rows_affected,
                "cleaned up old queue events"
            );
        }
        Ok(result.rows_affected)
    }

    pub async fn shutdown(&self) -> Result<(), QueueError> {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
        let mut workers = self.workers.lock().await;
        for (_, handle) in workers.drain() {
            let abort = handle.abort_handle();
            match tokio::time::timeout(Duration::from_secs(5), handle).await {
                Ok(_) => {}
                Err(_) => abort.abort(),
            }
        }
        Ok(())
    }
}

async fn claim_next(
    db: &DatabaseConnection,
    topic: &str,
) -> Result<Option<queue_event::Model>, QueueError> {
    let now = Utc::now().naive_utc();
    let candidate = queue_event::Entity::find()
        .filter(queue_event::Column::Topic.eq(topic))
        .filter(queue_event::Column::Status.eq(event_status::PENDING))
        .filter(queue_event::Column::AvailableAt.lte(now))
        .order_by_asc(queue_event::Column::AvailableAt)
        .order_by_asc(queue_event::Column::CreatedAt)
        .one(db)
        .await
        .map_err(|e| QueueError::Internal(e.to_string()))?;

    let Some(model) = candidate else {
        return Ok(None);
    };

    let attempts = model.attempts + 1;
    let updated = queue_event::ActiveModel {
        guid: Set(model.guid.clone()),
        status: Set(event_status::PROCESSING.to_string()),
        attempts: Set(attempts),
        updated_at: Set(now),
        ..Default::default()
    }
    .update(db)
    .await
    .map_err(|e| QueueError::Internal(e.to_string()))?;

    // Ensure we only process if still ours — single-process is enough for v1.
    if updated.status != event_status::PROCESSING {
        return Ok(None);
    }

    Ok(Some(updated))
}

async fn mark_succeeded(db: &DatabaseConnection, guid: &str) -> Result<(), QueueError> {
    let now = Utc::now().naive_utc();
    queue_event::ActiveModel {
        guid: Set(guid.to_string()),
        status: Set(event_status::SUCCEEDED.to_string()),
        last_error: Set(None),
        processed_at: Set(Some(now)),
        updated_at: Set(now),
        ..Default::default()
    }
    .update(db)
    .await
    .map_err(|e| QueueError::Internal(e.to_string()))?;
    Ok(())
}

async fn mark_failure(
    db: &DatabaseConnection,
    model: &queue_event::Model,
    error: String,
) -> Result<(), QueueError> {
    let now = Utc::now().naive_utc();
    let attempts = model.attempts; // already incremented at claim
    if attempts >= model.max_attempts {
        queue_event::ActiveModel {
            guid: Set(model.guid.clone()),
            status: Set(event_status::FAILED.to_string()),
            last_error: Set(Some(error)),
            processed_at: Set(Some(now)),
            updated_at: Set(now),
            ..Default::default()
        }
        .update(db)
        .await
        .map_err(|e| QueueError::Internal(e.to_string()))?;
        warn!(
            guid = %model.guid,
            attempts,
            "queue event permanently failed after max attempts"
        );
        return Ok(());
    }

    let backoff_secs = (1_i64 << (attempts.saturating_sub(1).min(8))).min(MAX_BACKOFF_SECS);
    let available_at = now + ChronoDuration::seconds(backoff_secs);
    queue_event::ActiveModel {
        guid: Set(model.guid.clone()),
        status: Set(event_status::PENDING.to_string()),
        last_error: Set(Some(error)),
        available_at: Set(available_at),
        updated_at: Set(now),
        ..Default::default()
    }
    .update(db)
    .await
    .map_err(|e| QueueError::Internal(e.to_string()))?;
    debug!(
        guid = %model.guid,
        attempts,
        backoff_secs,
        "queue event requeued after failure"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migration::Migrator;
    use sea_orm::Database;
    use sea_orm_migration::MigratorTrait;
    use tokio::sync::oneshot;

    async fn test_db() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        Migrator::up(&db, None).await.unwrap();
        db
    }

    #[tokio::test]
    async fn enqueue_persist_and_worker_processes() {
        let db = test_db().await;
        let queue = Arc::new(LocalPersistentQueue::new(db).with_max_attempts(3));
        let (tx, rx) = oneshot::channel::<Vec<u8>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let topic = Topic::new("test.topic");

        let tx_h = Arc::clone(&tx);
        queue
            .subscribe_worker(topic.clone(), move |msg| {
                let tx_h = Arc::clone(&tx_h);
                async move {
                    if let Some(sender) = tx_h.lock().await.take() {
                        let _ = sender.send(msg.payload);
                    }
                    Ok(())
                }
            })
            .await
            .unwrap();

        let id = queue
            .enqueue(&topic, b"hello-durable".to_vec())
            .await
            .unwrap();
        assert!(!id.is_empty());

        let payload = tokio::time::timeout(Duration::from_secs(3), rx)
            .await
            .expect("timeout")
            .expect("rx");
        assert_eq!(payload, b"hello-durable");

        // Row should be succeeded
        tokio::time::sleep(Duration::from_millis(50)).await;
        let row = queue_event::Entity::find_by_id(id)
            .one(&queue.db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.status, event_status::SUCCEEDED);

        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn failure_retries_then_marks_failed() {
        let db = test_db().await;
        let queue = Arc::new(LocalPersistentQueue::new(db).with_max_attempts(2));
        let topic = Topic::new("test.retry");
        let attempts = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let a = Arc::clone(&attempts);

        queue
            .subscribe_worker(topic.clone(), move |_msg| {
                let a = Arc::clone(&a);
                async move {
                    a.fetch_add(1, Ordering::SeqCst);
                    Err(QueueError::Handler("boom".into()))
                }
            })
            .await
            .unwrap();

        let id = queue.enqueue(&topic, b"x".to_vec()).await.unwrap();

        tokio::time::sleep(Duration::from_secs(3)).await;
        assert!(attempts.load(Ordering::SeqCst) >= 2);

        let row = queue_event::Entity::find_by_id(id)
            .one(&queue.db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.status, event_status::FAILED);
        assert!(row.last_error.as_deref().unwrap_or("").contains("boom"));

        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn cleanup_deletes_old_terminal_rows() {
        let db = test_db().await;
        let queue = LocalPersistentQueue::new(db.clone());
        let old = Utc::now().naive_utc() - ChronoDuration::days(40);
        let model = queue_event::ActiveModel {
            guid: Set(Uuid::new_v4().to_string()),
            created_at: Set(old),
            updated_at: Set(old),
            topic: Set("t".into()),
            payload: Set(b"x".to_vec()),
            status: Set(event_status::SUCCEEDED.to_string()),
            attempts: Set(1),
            max_attempts: Set(5),
            last_error: Set(None),
            available_at: Set(old),
            processed_at: Set(Some(old)),
        };
        model.insert(&db).await.unwrap();

        let deleted = queue
            .cleanup_older_than(Duration::from_secs(30 * 24 * 3600))
            .await
            .unwrap();
        assert_eq!(deleted, 1);
    }
}
