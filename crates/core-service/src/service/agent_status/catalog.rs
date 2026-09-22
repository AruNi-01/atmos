//! Async inbox-catalog writer. Live occupancy stays in memory.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use infra::db::entities::workspace;
use infra::db::repo::{AgentSessionCatalogRepo, AgentSessionCatalogRow};
use parking_lot::Mutex;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use tokio::sync::{mpsc, oneshot};
use tracing::warn;

#[async_trait::async_trait]
pub(super) trait AgentSessionCatalogStore: Send + Sync {
    async fn upsert(&self, row: AgentSessionCatalogRow) -> Result<(), String>;
    async fn list_open(&self) -> Result<Vec<AgentSessionCatalogRow>, String>;
    async fn archived_session_ids(&self) -> Result<HashSet<String>, String>;
    async fn archive(&self, session_id: &str) -> Result<(), String>;
    async fn archived_workspace_ids(&self) -> Result<HashSet<String>, String>;
}

pub(super) struct SqliteAgentSessionCatalog {
    db: Arc<DatabaseConnection>,
}

impl SqliteAgentSessionCatalog {
    pub(super) fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }
}

#[async_trait::async_trait]
impl AgentSessionCatalogStore for SqliteAgentSessionCatalog {
    async fn upsert(&self, row: AgentSessionCatalogRow) -> Result<(), String> {
        AgentSessionCatalogRepo::new(self.db.as_ref())
            .upsert(&row)
            .await
            .map_err(|err| err.to_string())
    }

    async fn list_open(&self) -> Result<Vec<AgentSessionCatalogRow>, String> {
        AgentSessionCatalogRepo::new(self.db.as_ref())
            .list_open()
            .await
            .map_err(|err| err.to_string())
    }

    async fn archived_session_ids(&self) -> Result<HashSet<String>, String> {
        AgentSessionCatalogRepo::new(self.db.as_ref())
            .list_archived_ids()
            .await
            .map(|ids| ids.into_iter().collect())
            .map_err(|err| err.to_string())
    }

    async fn archive(&self, session_id: &str) -> Result<(), String> {
        AgentSessionCatalogRepo::new(self.db.as_ref())
            .archive(session_id)
            .await
            .map_err(|err| err.to_string())
    }

    async fn archived_workspace_ids(&self) -> Result<HashSet<String>, String> {
        let rows = workspace::Entity::find()
            .filter(workspace::Column::IsArchived.eq(true))
            .all(self.db.as_ref())
            .await
            .map_err(|err| err.to_string())?;
        Ok(rows.into_iter().map(|row| row.guid).collect())
    }
}

enum CatalogJob {
    Upsert(AgentSessionCatalogRow),
    Archive {
        session_id: String,
        done: oneshot::Sender<Result<(), String>>,
    },
    #[allow(dead_code)]
    Flush(oneshot::Sender<()>),
}

pub(super) struct CatalogBridge {
    store: Arc<dyn AgentSessionCatalogStore>,
    senders: Mutex<HashMap<String, mpsc::UnboundedSender<CatalogJob>>>,
    upserts: AtomicU64,
}

impl CatalogBridge {
    pub(super) fn new(store: Arc<dyn AgentSessionCatalogStore>) -> Self {
        Self {
            store,
            senders: Mutex::new(HashMap::new()),
            upserts: AtomicU64::new(0),
        }
    }

    pub(super) fn enqueue_upsert(&self, row: AgentSessionCatalogRow) -> Result<(), String> {
        let session_id = row.session_id.clone();
        let tx = self.sender_for(&session_id)?;
        tx.send(CatalogJob::Upsert(row))
            .map_err(|_| "catalog queue closed".to_string())?;
        self.upserts.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    pub(super) async fn archive(&self, session_id: &str) -> Result<(), String> {
        let tx = self.sender_for(session_id)?;
        let (done_tx, done_rx) = oneshot::channel();
        tx.send(CatalogJob::Archive {
            session_id: session_id.to_string(),
            done: done_tx,
        })
        .map_err(|_| "catalog queue closed".to_string())?;
        done_rx
            .await
            .map_err(|_| "catalog archive dropped".to_string())?
    }

    pub(super) async fn list_open(&self) -> Result<Vec<AgentSessionCatalogRow>, String> {
        self.store.list_open().await
    }

    pub(super) async fn archived_session_ids(&self) -> Result<HashSet<String>, String> {
        self.store.archived_session_ids().await
    }

    pub(super) async fn archived_workspace_ids(&self) -> Result<HashSet<String>, String> {
        self.store.archived_workspace_ids().await
    }

    #[allow(dead_code)]
    pub(super) fn upsert_count(&self) -> u64 {
        self.upserts.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub(super) async fn flush(&self) {
        let senders: Vec<_> = self.senders.lock().values().cloned().collect();
        let mut waits = Vec::new();
        for tx in senders {
            let (done_tx, done_rx) = oneshot::channel();
            if tx.send(CatalogJob::Flush(done_tx)).is_ok() {
                waits.push(done_rx);
            }
        }
        for wait in waits {
            let _ = wait.await;
        }
    }

    fn sender_for(&self, session_id: &str) -> Result<mpsc::UnboundedSender<CatalogJob>, String> {
        let mut guard = self.senders.lock();
        if let Some(tx) = guard.get(session_id) {
            return Ok(tx.clone());
        }
        tokio::runtime::Handle::try_current()
            .map_err(|_| "agent session catalog writer has no tokio runtime".to_string())?;
        let (tx, mut rx) = mpsc::unbounded_channel();
        let store = Arc::clone(&self.store);
        tokio::spawn(async move {
            while let Some(job) = rx.recv().await {
                match job {
                    CatalogJob::Upsert(row) => {
                        if let Err(err) = store.upsert(row).await {
                            warn!("agent session catalog upsert failed: {err}");
                        }
                    }
                    CatalogJob::Archive { session_id, done } => {
                        let result = store.archive(&session_id).await;
                        let _ = done.send(result);
                    }
                    CatalogJob::Flush(done) => {
                        let _ = done.send(());
                    }
                }
            }
        });
        guard.insert(session_id.to_string(), tx.clone());
        Ok(tx)
    }
}
