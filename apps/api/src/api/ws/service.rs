//! WebSocket service - unified WebSocket transport for all apps.
//!
//! `WsService` is purely a transport: connection lifecycle + framing +
//! delegating text payloads to a `WsMessageHandler`. It does **not** do
//! application-level ping/pong, and there is no heartbeat monitor — both
//! are intentionally absent so that relay-mode traffic (browser → CF
//! Durable Object → daemon) stays free under Cloudflare's WS Hibernation
//! billing. Liveness comes from:
//!   * Browser ↔ apps/api (loopback) — TCP never stalls on `127.0.0.1`.
//!   * Daemon ↔ Cloudflare relay — protocol PINGs from `apps/api/src/relay/ingest.rs`.
//!   * Browser ↔ Cloudflare relay — relies on the browser/edge TCP layer;
//!     the client reconnects on drop.

use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::warn;

use super::connection::ClientType;
use super::handler::WsMessageHandler;
use super::manager::WsManager;

/// WebSocket service - the main entry point for WebSocket management.
pub struct WsService {
    manager: Arc<WsManager>,
    message_handler: Option<Arc<dyn WsMessageHandler>>,
}

impl WsService {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(WsManager::new()),
            message_handler: None,
        }
    }

    /// Inject a message handler for business logic.
    pub fn with_message_handler(mut self, handler: Arc<dyn WsMessageHandler>) -> Self {
        self.message_handler = Some(handler);
        self
    }

    /// Get the underlying manager (for direct access if needed).
    pub fn manager(&self) -> Arc<WsManager> {
        Arc::clone(&self.manager)
    }

    /// Register a new connection.
    pub async fn register(&self, client_type: ClientType, sender: mpsc::Sender<String>) -> String {
        let conn_id = self.manager.register_connection(client_type, sender).await;

        if let Some(handler) = &self.message_handler {
            handler.on_connect(&conn_id).await;
        }

        conn_id
    }

    /// Unregister a connection.
    pub async fn unregister(&self, conn_id: &str) {
        if let Some(handler) = &self.message_handler {
            handler.on_disconnect(conn_id).await;
        }

        self.manager.unregister_connection(conn_id).await;
    }

    /// Process an incoming text payload by delegating to the injected handler.
    pub async fn handle_message(&self, conn_id: &str, text: &str) -> Option<String> {
        if let Some(handler) = &self.message_handler {
            handler.handle_message(conn_id, text).await
        } else {
            warn!("No message handler configured, ignoring business message");
            None
        }
    }

    /// Send a message to a specific connection.
    pub async fn send_to(&self, conn_id: &str, message: &str) -> Result<(), String> {
        self.manager
            .send_raw(conn_id, message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Broadcast a message to all connections.
    pub async fn broadcast(&self, message: &str) -> Result<(), String> {
        self.manager
            .broadcast_raw(message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Broadcast a message to all connections except one.
    pub async fn broadcast_except(&self, exclude_id: &str, message: &str) -> Result<(), String> {
        self.manager
            .broadcast_except_raw(exclude_id, message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Get connection count.
    pub async fn connection_count(&self) -> usize {
        self.manager.connection_count().await
    }
}

impl Default for WsService {
    fn default() -> Self {
        Self::new()
    }
}
