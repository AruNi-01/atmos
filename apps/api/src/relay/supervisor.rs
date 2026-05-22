//! Hot start/stop for the outbound relay WebSocket (APP-016).
//!
//! Auto-reconnect: when the upstream WebSocket drops for any non-terminal reason
//! (network blip, Cloudflare edge restart, daemon laptop returning from sleep),
//! the supervisor reconnects with exponential backoff (1 s → 2 s → 4 s … capped
//! at 60 s). Connectivity flips to `false` while disconnected; the next
//! successful upgrade flips it back to `true` and resets backoff. Terminal
//! errors (401/403, bad URL) stop the loop and surface via `last_error`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use runtime_manager::{read_server_identity, ServerIdentity};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::app_state::AppState;
use crate::relay::ingest::{self, RelayLifecycle, RunOutcome};

/// Backoff schedule for relay reconnect attempts.
const RECONNECT_BACKOFF_INITIAL: Duration = Duration::from_secs(1);
const RECONNECT_BACKOFF_MAX: Duration = Duration::from_secs(60);

struct SupervisorInner {
    cancel: Option<CancellationToken>,
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
                cancel: None,
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
        let (cancel, task) = {
            let mut guard = self.inner.lock().await;
            (guard.cancel.take(), guard.task.take())
        };

        if let Some(token) = cancel {
            token.cancel();
        }
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

    /// Start (or restart) the outbound relay with auto-reconnect. Calling this
    /// while another supervisor task is running first cancels the old one.
    pub async fn start(&self, state: AppState, identity: ServerIdentity) {
        self.stop().await;
        self.upstream_connected.store(false, Ordering::SeqCst);
        *self.last_error.lock().await = None;

        let cancel = CancellationToken::new();
        let task_cancel = cancel.clone();
        let upstream_connected = Arc::clone(&self.upstream_connected);
        let last_error = Arc::clone(&self.last_error);

        let handle = tokio::spawn(async move {
            let mut backoff = RECONNECT_BACKOFF_INITIAL;

            loop {
                if task_cancel.is_cancelled() {
                    break;
                }

                let lifecycle =
                    RelayLifecycle::new(Arc::clone(&upstream_connected), Arc::clone(&last_error));
                let attempt_state = state.clone();
                let attempt_identity = identity.clone();
                let attempt_cancel = task_cancel.clone();

                let outcome =
                    ingest::run(attempt_state, attempt_identity, attempt_cancel, lifecycle).await;

                match outcome {
                    RunOutcome::Shutdown => {
                        info!(target: "atmos_relay", "relay supervisor shutdown requested");
                        break;
                    }
                    RunOutcome::Terminal(msg) => {
                        warn!(
                            target: "atmos_relay",
                            error = %msg,
                            "relay terminated permanently; supervisor stopping"
                        );
                        break;
                    }
                    RunOutcome::Disconnected => {
                        if task_cancel.is_cancelled() {
                            break;
                        }
                        warn!(
                            target: "atmos_relay",
                            backoff_secs = backoff.as_secs(),
                            "relay disconnected; reconnecting after backoff"
                        );
                        tokio::select! {
                            _ = task_cancel.cancelled() => break,
                            _ = tokio::time::sleep(backoff) => {}
                        }
                        backoff = (backoff * 2).min(RECONNECT_BACKOFF_MAX);
                        continue;
                    }
                }
            }

            // Reset for the next call to `start`.
            backoff = RECONNECT_BACKOFF_INITIAL;
            let _ = backoff;
        });

        let mut guard = self.inner.lock().await;
        guard.cancel = Some(cancel);
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
            // Supervisor task finishing during wait_upstream means we either
            // hit a terminal failure (bad creds) or were stopped externally —
            // either way, give up early instead of spinning until timeout.
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
            self.last_error().await.or_else(|| {
                Some(format!(
                    "Relay did not connect within {} seconds. Check network access to the control plane.",
                    timeout.as_secs()
                ))
            }),
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
