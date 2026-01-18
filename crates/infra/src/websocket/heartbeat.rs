//! Heartbeat detection for WebSocket connections.
//!
//! This module handles connection health monitoring and stale connection cleanup.

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use super::manager::WsManager;

/// Default heartbeat check interval in seconds
pub const DEFAULT_CHECK_INTERVAL_SECS: u64 = 10;

/// Default connection timeout in seconds (no activity)
pub const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// Heartbeat monitor for WebSocket connections
pub struct HeartbeatMonitor {
    ws_manager: Arc<WsManager>,
    check_interval: Duration,
    timeout_secs: u64,
    shutdown_tx: broadcast::Sender<()>,
}

impl HeartbeatMonitor {
    pub fn new(ws_manager: Arc<WsManager>) -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            ws_manager,
            check_interval: Duration::from_secs(DEFAULT_CHECK_INTERVAL_SECS),
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            shutdown_tx,
        }
    }

    pub fn with_config(
        ws_manager: Arc<WsManager>,
        check_interval_secs: u64,
        timeout_secs: u64,
    ) -> Self {
        let (shutdown_tx, _) = broadcast::channel(1);
        Self {
            ws_manager,
            check_interval: Duration::from_secs(check_interval_secs),
            timeout_secs,
            shutdown_tx,
        }
    }

    /// Start the heartbeat monitor in a background task
    pub fn start(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        let monitor = Arc::clone(&self);
        let mut shutdown_rx = self.shutdown_tx.subscribe();

        tokio::spawn(async move {
            info!(
                "Heartbeat monitor started (interval: {:?}, timeout: {}s)",
                monitor.check_interval, monitor.timeout_secs
            );

            let mut interval = tokio::time::interval(monitor.check_interval);

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        monitor.check_connections().await;
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Heartbeat monitor shutting down");
                        break;
                    }
                }
            }
        })
    }

    /// Check all connections and remove expired ones
    async fn check_connections(&self) {
        let expired_ids = self
            .ws_manager
            .get_expired_connections(self.timeout_secs)
            .await;

        if expired_ids.is_empty() {
            debug!("Heartbeat check: all connections healthy");
            return;
        }

        for id in expired_ids {
            warn!(
                "Connection {} expired (no activity for {}s), closing",
                id, self.timeout_secs
            );
            self.ws_manager.unregister_connection(&id).await;
        }
    }

    /// Stop the heartbeat monitor
    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(());
    }
}

impl Drop for HeartbeatMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}
