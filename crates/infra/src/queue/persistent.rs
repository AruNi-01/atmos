//! SQLite-backed durable queue for third-party trigger events (APP-051).
//!
//! Persist-on-accept: `enqueue` writes a row before the caller ACKs the provider.
//! Workers claim `pending` rows, run handlers, and retry on failure until max attempts.
//! [`super::LocalMemoryQueue`] remains available for process-local, droppable buffering.
//!
//! DB access goes through [`crate::db::repo::QueueEventRepo`].
//!
//! ## Handler idempotency
//!
//! Topic handlers **must be idempotent**. After a successful handler run, if the
//! terminal `succeeded` write keeps failing, the row stays `processing` (not
//! re-queued) so a non-idempotent handler is not re-executed for a completed job.
//! Crash recovery reclaims only stale `processing` rows (lease / startup).
//! `handle_external_trigger` satisfies idempotency via delivery-claim recovery
//! or `DuplicateDelivery` rejection.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sea_orm::DatabaseConnection;
use tokio::sync::{Mutex, Notify};
use tokio::task::{AbortHandle, JoinHandle};
use tracing::{debug, info, warn};
use uuid::Uuid;

struct WorkerSlot {
    handle: JoinHandle<()>,
    /// In-flight nested handler task (if any). Shutdown aborts this so domain
    /// work does not outlive the outer worker after the join handle is dropped.
    current_handler: Arc<Mutex<Option<AbortHandle>>>,
}

use crate::db::entities::queue_event;
use crate::db::repo::QueueEventRepo;

use super::types::{EnqueueError, QueueError, QueueMessage, Topic};

const DEFAULT_MAX_ATTEMPTS: i32 = 5;
const POLL_IDLE: Duration = Duration::from_millis(250);
/// Max time a handler may run before we treat it as failed and requeue.
const HANDLER_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// While a worker is running, reclaim `processing` rows older than this.
/// Must exceed [`HANDLER_TIMEOUT`] so a live handler is not double-claimed.
const STALE_PROCESSING_LEASE: ChronoDuration = ChronoDuration::minutes(20);
/// How often the worker reclaims stale processing rows during idle polls.
const STALE_RECLAIM_EVERY: Duration = Duration::from_secs(60);
const FINALIZE_RETRIES: u32 = 5;
const FINALIZE_RETRY_DELAY: Duration = Duration::from_millis(100);

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
    workers: Mutex<HashMap<String, WorkerSlot>>,
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
        // Column is signed INTEGER; clamp so we never wrap to a negative limit.
        let clamped = max_attempts.clamp(1, i32::MAX as u32) as i32;
        self.default_max_attempts = clamped;
        self
    }

    /// Persist a message as `pending` and wake workers. Safe to ACK the provider after this returns.
    pub async fn enqueue(&self, topic: &Topic, payload: Vec<u8>) -> Result<String, EnqueueError> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(EnqueueError::ShuttingDown);
        }

        let guid = Uuid::new_v4().to_string();
        QueueEventRepo::new(&self.db)
            .insert_pending(&guid, topic.as_str(), payload, self.default_max_attempts)
            .await
            .map_err(|error| {
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
        // Drop finished handles so a panicked worker does not permanently block resubscribe.
        workers.retain(|_, slot| !slot.handle.is_finished());
        if workers.contains_key(topic.as_str()) {
            return Err(QueueError::ConsumerExists(topic.as_str().to_string()));
        }

        // Reclaim only *stale* processing rows. A zero lease would steal live
        // work from another process (hot reload / dual API on the same DB).
        // Crash leftovers older than STALE_PROCESSING_LEASE are reclaimed here
        // and again on the periodic loop below.
        self.requeue_stale_processing(topic.as_str(), STALE_PROCESSING_LEASE)
            .await?;

        let dyn_handler: DynHandler = Arc::new(move |msg| {
            let fut = handler(msg);
            Box::pin(fut) as std::pin::Pin<Box<dyn Future<Output = Result<(), QueueError>> + Send>>
        });

        let db = self.db.clone();
        let notify = Arc::clone(&self.notify);
        let shutting_down = Arc::clone(&self.shutting_down);
        let topic_for_task = topic.as_str().to_string();
        let current_handler: Arc<Mutex<Option<AbortHandle>>> = Arc::new(Mutex::new(None));
        let current_handler_for_task = Arc::clone(&current_handler);

        let handle = tokio::spawn(async move {
            let mut last_stale_reclaim = tokio::time::Instant::now();
            loop {
                if shutting_down.load(Ordering::SeqCst) {
                    break;
                }

                if last_stale_reclaim.elapsed() >= STALE_RECLAIM_EVERY {
                    let repo = QueueEventRepo::new(&db);
                    match repo
                        .requeue_stale_processing(&topic_for_task, STALE_PROCESSING_LEASE)
                        .await
                    {
                        Ok(n) if n > 0 => {
                            warn!(
                                topic = %topic_for_task,
                                count = n,
                                "requeued stale processing queue events"
                            );
                        }
                        Ok(_) => {}
                        Err(error) => {
                            warn!(
                                topic = %topic_for_task,
                                error = %error,
                                "stale processing reclaim failed"
                            );
                        }
                    }
                    last_stale_reclaim = tokio::time::Instant::now();
                }

                match claim_next(&db, &topic_for_task).await {
                    Ok(Some(model)) => {
                        let msg = QueueMessage {
                            id: model.guid.clone(),
                            payload: model.payload.clone(),
                            enqueued_at: model.created_at.and_utc(),
                        };
                        // Bound handler so a hang cannot block reclaim forever.
                        // Timeout must stay below STALE_PROCESSING_LEASE.
                        // Nested spawn isolates handler panics so the topic
                        // worker keeps running and the row can be retried.
                        let handler = Arc::clone(&dyn_handler);
                        let join = tokio::spawn(async move { handler(msg).await });
                        let abort = join.abort_handle();
                        {
                            let mut slot = current_handler_for_task.lock().await;
                            *slot = Some(abort.clone());
                        }
                        let handler_result = tokio::time::timeout(HANDLER_TIMEOUT, join).await;
                        {
                            let mut slot = current_handler_for_task.lock().await;
                            *slot = None;
                        }
                        match handler_result {
                            Ok(Ok(Ok(()))) => {
                                finalize_succeeded(&db, &model.guid).await;
                            }
                            Ok(Ok(Err(error))) => {
                                finalize_failure(&db, &model, error).await;
                            }
                            Ok(Err(join_error)) => {
                                let message = if join_error.is_panic() {
                                    "queue handler panicked".to_string()
                                } else {
                                    format!("queue handler task failed: {join_error}")
                                };
                                warn!(
                                    guid = %model.guid,
                                    topic = %topic_for_task,
                                    error = %message,
                                    "queue handler join failed; requeue for retry"
                                );
                                finalize_failure(&db, &model, QueueError::Handler(message)).await;
                            }
                            Err(_) => {
                                abort.abort();
                                warn!(
                                    guid = %model.guid,
                                    topic = %topic_for_task,
                                    "queue handler timed out; requeue for retry"
                                );
                                finalize_failure(
                                    &db,
                                    &model,
                                    QueueError::Handler("handler timed out".into()),
                                )
                                .await;
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

        workers.insert(
            topic.as_str().to_string(),
            WorkerSlot {
                handle,
                current_handler,
            },
        );
        info!(topic = %topic, "persistent queue worker started");
        Ok(())
    }

    async fn requeue_stale_processing(
        &self,
        topic: &str,
        stale_after: ChronoDuration,
    ) -> Result<(), QueueError> {
        let count = QueueEventRepo::new(&self.db)
            .requeue_stale_processing(topic, stale_after)
            .await
            .map_err(|e| QueueError::Internal(e.to_string()))?;
        if count > 0 {
            warn!(
                topic = %topic,
                count,
                "requeued stuck processing queue events"
            );
        }
        Ok(())
    }

    /// Delete terminal events older than `retention` (e.g. 30 days).
    pub async fn cleanup_older_than(&self, retention: Duration) -> Result<u64, QueueError> {
        let chrono_retention = ChronoDuration::from_std(retention).map_err(|error| {
            QueueError::Internal(format!("invalid queue retention duration: {error}"))
        })?;
        let cutoff = Utc::now().naive_utc() - chrono_retention;
        let deleted = QueueEventRepo::new(&self.db)
            .delete_terminal_older_than(cutoff)
            .await
            .map_err(|e| QueueError::Internal(e.to_string()))?;
        if deleted > 0 {
            info!(deleted, "cleaned up old queue events");
        }
        Ok(deleted)
    }

    pub async fn shutdown(&self) -> Result<(), QueueError> {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
        let mut workers = self.workers.lock().await;
        for (_, slot) in workers.drain() {
            // Cancel nested handler first so domain work cannot outlive shutdown.
            if let Some(handler_abort) = slot.current_handler.lock().await.take() {
                handler_abort.abort();
            }
            let abort = slot.handle.abort_handle();
            match tokio::time::timeout(Duration::from_secs(5), slot.handle).await {
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
    QueueEventRepo::new(db)
        .claim_next(topic)
        .await
        .map_err(|e| QueueError::Internal(e.to_string()))
}

/// Retry terminal succeed write. On persistent failure leave the row `processing`
/// so a successful handler is not immediately re-executed (handlers must still
/// be idempotent for crash-reclaim paths).
async fn finalize_succeeded(db: &DatabaseConnection, guid: &str) {
    let repo = QueueEventRepo::new(db);
    for attempt in 1..=FINALIZE_RETRIES {
        match repo.mark_succeeded(guid).await {
            Ok(()) => return,
            Err(error) => {
                warn!(
                    guid = %guid,
                    attempt,
                    error = %error,
                    "failed to mark queue event succeeded"
                );
                tokio::time::sleep(FINALIZE_RETRY_DELAY * attempt).await;
            }
        }
    }
    // Do NOT release_to_pending here: that would re-run a completed handler with
    // no attempt advance. Stale processing reclaim covers process crashes.
    warn!(
        guid = %guid,
        "leaving queue event processing after succeed finalize failures; will reclaim if stale"
    );
}

async fn finalize_failure(db: &DatabaseConnection, model: &queue_event::Model, error: QueueError) {
    let permanent = error.is_permanent();
    let message = error.to_string();
    let repo = QueueEventRepo::new(db);
    for attempt in 1..=FINALIZE_RETRIES {
        match repo.mark_failure(model, message.clone(), permanent).await {
            Ok(()) => {
                if permanent || model.attempts >= model.max_attempts {
                    warn!(
                        guid = %model.guid,
                        attempts = model.attempts,
                        permanent,
                        "queue event permanently failed"
                    );
                } else {
                    debug!(
                        guid = %model.guid,
                        attempts = model.attempts,
                        "queue event requeued after failure"
                    );
                }
                return;
            }
            Err(mark_error) => {
                warn!(
                    guid = %model.guid,
                    attempt,
                    error = %mark_error,
                    "failed to mark queue event failure"
                );
                tokio::time::sleep(FINALIZE_RETRY_DELAY * attempt).await;
            }
        }
    }
    // Terminal outcomes must not re-enter `pending`. Force-fail as a last resort
    // so stale reclaim cannot re-dispatch permanent / exhausted rows.
    if permanent || model.attempts >= model.max_attempts {
        if let Err(force_error) = repo
            .force_mark_failed(
                &model.guid,
                &format!("finalize failure failed after retries; last handler error: {message}"),
            )
            .await
        {
            warn!(
                guid = %model.guid,
                error = %force_error,
                "failed to force-mark queue event failed after finalize retries"
            );
        }
        return;
    }
    if let Err(release_error) = repo
        .release_to_pending(
            &model.guid,
            &format!("finalize failure failed after retries; last handler error: {message}"),
        )
        .await
    {
        warn!(
            guid = %model.guid,
            error = %release_error,
            "failed to release queue event after failure finalize failure"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::entities::queue_event::status as event_status;
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
        let row = QueueEventRepo::new(&queue.db)
            .find_by_guid(&id)
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

        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        let row = loop {
            let row = QueueEventRepo::new(&queue.db)
                .find_by_guid(&id)
                .await
                .unwrap()
                .unwrap();
            if row.status == event_status::FAILED {
                break row;
            }
            if tokio::time::Instant::now() >= deadline {
                panic!(
                    "queue event did not reach FAILED before deadline (status={})",
                    row.status
                );
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        };
        assert!(attempts.load(Ordering::SeqCst) >= 2);
        assert!(row.last_error.as_deref().unwrap_or("").contains("boom"));

        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn permanent_failure_skips_retries() {
        let db = test_db().await;
        let queue = Arc::new(LocalPersistentQueue::new(db).with_max_attempts(5));
        let topic = Topic::new("test.permanent");
        let attempts = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let a = Arc::clone(&attempts);

        queue
            .subscribe_worker(topic.clone(), move |_msg| {
                let a = Arc::clone(&a);
                async move {
                    a.fetch_add(1, Ordering::SeqCst);
                    Err(QueueError::Permanent("bad payload".into()))
                }
            })
            .await
            .unwrap();

        let id = queue.enqueue(&topic, b"x".to_vec()).await.unwrap();

        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        let row = loop {
            let row = QueueEventRepo::new(&queue.db)
                .find_by_guid(&id)
                .await
                .unwrap()
                .unwrap();
            if row.status == event_status::FAILED {
                break row;
            }
            if tokio::time::Instant::now() >= deadline {
                panic!(
                    "permanent failure did not mark FAILED before deadline (status={})",
                    row.status
                );
            }
            tokio::time::sleep(Duration::from_millis(30)).await;
        };
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert_eq!(row.attempts, 1);
        assert!(row
            .last_error
            .as_deref()
            .unwrap_or("")
            .contains("bad payload"));

        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn cleanup_deletes_old_terminal_rows() {
        let db = test_db().await;
        let queue = LocalPersistentQueue::new(db.clone());
        let old = Utc::now().naive_utc() - ChronoDuration::days(40);
        use sea_orm::{ActiveModelTrait, Set};
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

    #[tokio::test]
    async fn with_max_attempts_clamps_to_i32() {
        let db = test_db().await;
        let queue = LocalPersistentQueue::new(db).with_max_attempts(u32::MAX);
        assert_eq!(queue.default_max_attempts, i32::MAX);
        let queue = LocalPersistentQueue::new(queue.db.clone()).with_max_attempts(0);
        assert_eq!(queue.default_max_attempts, 1);
    }

    #[tokio::test]
    async fn claim_is_conditional_on_pending() {
        let db = test_db().await;
        let repo = QueueEventRepo::new(&db);
        let guid = Uuid::new_v4().to_string();
        repo.insert_pending(&guid, "t", b"p".to_vec(), 3)
            .await
            .unwrap();

        let first = repo.claim_next("t").await.unwrap().unwrap();
        assert_eq!(first.guid, guid);
        assert_eq!(first.status, event_status::PROCESSING);
        assert_eq!(first.attempts, 1);

        // Second claim should not re-take the processing row.
        assert!(repo.claim_next("t").await.unwrap().is_none());
    }
}
