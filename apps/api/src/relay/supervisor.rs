//! Hot start/stop for the outbound relay WebSocket (APP-016).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use runtime_manager::{read_server_identity, ServerIdentity};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::app_state::AppState;
use crate::relay::ingest::{self, RelayLifecycle};

struct SupervisorInner {
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

#[derive(Clone)]
pub struct RelaySupervisor {
    inner: Arc<Mutex<SupervisorInner>>,
    upstream_connected: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
}

impl RelaySupervisor {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SupervisorInner {
                shutdown_tx: None,
                task: None,
            })),
            upstream_connected: Arc::new(AtomicBool::new(false)),
            last_error: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn is_upstream_connected(&self) -> bool {
        self.upstream_connected.load(Ordering::SeqCst)
    }

    pub async fn last_error(&self) -> Option<String> {
        self.last_error.lock().await.clone()
    }

    /// Stop the outbound relay connection and clean up relay-backed WS sessions.
    pub async fn stop(&self) {
        let (shutdown_tx, task) = {
            let mut guard = self.inner.lock().await;
            (guard.shutdown_tx.take(), guard.task.take())
        };

        drop(shutdown_tx);
        self.upstream_connected.store(false, Ordering::SeqCst);

        if let Some(task) = task {
            match tokio::time::timeout(Duration::from_secs(15), task).await {
                Ok(Ok(())) => info!(target: "atmos_relay", "relay supervisor stopped"),
                Ok(Err(e)) => {
                    let msg = join_error_message(&e);
                    *self.last_error.lock().await = Some(msg.clone());
                    warn!(target: "atmos_relay", error = %msg, "relay task join error");
                }
                Err(_) => warn!(target: "atmos_relay", "relay stop timed out"),
            }
        }
    }

    /// Start (or restart) outbound relay with the given identity.
    pub async fn start(&self, state: AppState, identity: ServerIdentity) {
        self.stop().await;
        self.upstream_connected.store(false, Ordering::SeqCst);
        *self.last_error.lock().await = None;

        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let st = state.clone();
        let lifecycle = RelayLifecycle::new(
            Arc::clone(&self.upstream_connected),
            Arc::clone(&self.last_error),
        );

        let handle = tokio::spawn(async move {
            match ingest::run(st, identity, shutdown_rx, lifecycle).await {
                Ok(()) => info!(target: "atmos_relay", "relay connection ended"),
                Err(err) => warn!(target: "atmos_relay", error = %err, "relay connection failed"),
            }
        });

        let mut guard = self.inner.lock().await;
        guard.shutdown_tx = Some(shutdown_tx);
        guard.task = Some(handle);
        info!(target: "atmos_relay", "relay supervisor started");
    }

    /// Read `relay_identity.json`, connect, and wait briefly for upstream WSS.
    pub async fn sync_from_disk(&self, state: AppState) -> (bool, Option<String>) {
        if std::env::var("ATMOS_RELAY_DISABLE").unwrap_or_default() == "1" {
            self.stop().await;
            let msg = "Relay is disabled (ATMOS_RELAY_DISABLE=1).".to_string();
            *self.last_error.lock().await = Some(msg.clone());
            return (false, Some(msg));
        }

        let identity = match read_server_identity() {
            Ok(Some(id)) => id,
            Ok(None) => {
                self.stop().await;
                let msg = "This machine is not registered to remote.".to_string();
                *self.last_error.lock().await = Some(msg.clone());
                return (false, Some(msg));
            }
            Err(e) => {
                self.stop().await;
                let msg = format!("Could not read relay identity: {e}");
                *self.last_error.lock().await = Some(msg.clone());
                return (false, Some(msg));
            }
        };

        self.start(state, identity).await;
        self.wait_upstream(Duration::from_secs(8)).await
    }

    pub async fn wait_upstream(&self, timeout: Duration) -> (bool, Option<String>) {
        let steps = (timeout.as_millis() / 200).max(1) as usize;
        for _ in 0..steps {
            if self.is_upstream_connected().await {
                return (true, None);
            }
            if let Some(err) = self.last_error().await {
                return (false, Some(err));
            }
            let finished = {
                let guard = self.inner.lock().await;
                guard.task.as_ref().is_some_and(|t| t.is_finished())
            };
            if finished {
                let mut guard = self.inner.lock().await;
                if let Some(task) = guard.task.take() {
                    if let Err(e) = task.await {
                        let msg = join_error_message(&e);
                        *self.last_error.lock().await = Some(msg.clone());
                        return (false, Some(msg));
                    }
                }
                let err = self
                    .last_error()
                    .await
                    .unwrap_or_else(|| "Relay connection closed immediately.".into());
                return (false, Some(err));
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }

        (
            false,
            Some(format!(
                "Relay did not connect within {} seconds. Check network access to the control plane.",
                timeout.as_secs()
            )),
        )
    }

    /// Read `relay_identity.json` and connect if present (no-op when relay disabled).
    pub async fn start_if_identity_on_disk(&self, state: AppState) -> Result<(), String> {
        let (_ok, _err) = self.sync_from_disk(state).await;
        Ok(())
    }
}

fn join_error_message(e: &tokio::task::JoinError) -> String {
    if e.is_panic() {
        "Relay worker panicked — check API logs (often a TLS/rustls setup issue).".into()
    } else if e.is_cancelled() {
        "Relay worker was cancelled.".into()
    } else {
        format!("Relay worker failed: {e}")
    }
}
