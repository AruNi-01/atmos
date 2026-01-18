//! WebSocket service - unified WebSocket management for all apps.
//!
//! This service encapsulates:
//! - Connection management (WsManager)
//! - Heartbeat detection (auto cleanup expired connections)
//! - Message processing (ping/pong only, business logic is delegated via trait)
//!
//! Business logic is NOT handled here. Upper layers (core-service) implement
//! WsMessageHandler trait and handle business messages themselves.

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use super::connection::ClientType;
use super::handler::{process_text_message, HandleResult, WsMessageHandler};
use super::manager::WsManager;

/// Configuration for WebSocket service
#[derive(Clone)]
pub struct WsServiceConfig {
    /// Heartbeat check interval in seconds
    pub heartbeat_interval_secs: u64,
    /// Connection timeout in seconds (no activity)
    pub connection_timeout_secs: u64,
}

impl Default for WsServiceConfig {
    fn default() -> Self {
        Self {
            heartbeat_interval_secs: 10,
            connection_timeout_secs: 30,
        }
    }
}

/// WebSocket service - the main entry point for WebSocket management
///
/// This service handles:
/// - Connection lifecycle (register/unregister)
/// - Heartbeat monitoring (auto cleanup expired connections)
/// - Control messages (ping/pong)
/// - Business messages (via WsMessageHandler dependency injection)
pub struct WsService {
    manager: Arc<WsManager>,
    message_handler: Option<Arc<dyn WsMessageHandler>>,
    config: WsServiceConfig,
}

impl WsService {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(WsManager::new()),
            message_handler: None,
            config: WsServiceConfig::default(),
        }
    }

    pub fn with_config(config: WsServiceConfig) -> Self {
        Self {
            manager: Arc::new(WsManager::new()),
            message_handler: None,
            config,
        }
    }

    /// Inject a message handler for business logic
    pub fn with_message_handler(mut self, handler: Arc<dyn WsMessageHandler>) -> Self {
        self.message_handler = Some(handler);
        self
    }

    /// Get the underlying manager (for direct access if needed)
    pub fn manager(&self) -> Arc<WsManager> {
        Arc::clone(&self.manager)
    }

    /// Start the heartbeat monitor
    pub fn start_heartbeat(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
        let service = Arc::clone(self);
        let interval = Duration::from_secs(service.config.heartbeat_interval_secs);
        let timeout = service.config.connection_timeout_secs;

        tokio::spawn(async move {
            info!(
                "Heartbeat monitor started (interval: {:?}, timeout: {}s)",
                interval, timeout
            );

            let mut tick = tokio::time::interval(interval);

            loop {
                tick.tick().await;

                let expired = service.manager.get_expired_connections(timeout).await;

                if expired.is_empty() {
                    debug!("Heartbeat check: all connections healthy");
                } else {
                    for id in expired {
                        warn!(
                            "Connection {} expired (no activity for {}s), closing",
                            id, timeout
                        );
                        service.manager.unregister_connection(&id).await;
                    }
                }
            }
        })
    }

    /// Register a new connection
    pub async fn register(&self, client_type: ClientType, sender: mpsc::Sender<String>) -> String {
        let conn_id = self.manager.register_connection(client_type, sender).await;

        // Notify handler about new connection
        if let Some(handler) = &self.message_handler {
            handler.on_connect(&conn_id).await;
        }

        conn_id
    }

    /// Unregister a connection
    pub async fn unregister(&self, conn_id: &str) {
        // Notify handler before disconnection
        if let Some(handler) = &self.message_handler {
            handler.on_disconnect(conn_id).await;
        }

        self.manager.unregister_connection(conn_id).await;
    }

    /// Process an incoming text message (unified entry point)
    ///
    /// This handles both control messages (ping/pong) and business messages.
    /// Business messages are delegated to the injected WsMessageHandler.
    ///
    /// Returns:
    /// - `Some(response)` if there's a response to send back
    /// - `None` if no response is needed
    pub async fn handle_message(&self, conn_id: &str, text: &str) -> Option<String> {
        // Update last active time
        self.manager.touch_connection(conn_id).await;

        // Process control messages (ping/pong)
        match process_text_message(text, conn_id) {
            HandleResult::Reply(response) => Some(response),
            HandleResult::Close => None,
            HandleResult::None => {
                // Delegate to business message handler
                if let Some(handler) = &self.message_handler {
                    handler.handle_message(conn_id, text).await
                } else {
                    warn!("No message handler configured, ignoring business message");
                    None
                }
            }
        }
    }

    /// Check if a message is a control message (ping/pong)
    pub fn is_control_message(&self, text: &str) -> bool {
        super::handler::is_control_message(text)
    }

    /// Send a message to a specific connection
    pub async fn send_to(&self, conn_id: &str, message: &str) -> Result<(), String> {
        self.manager
            .send_raw(conn_id, message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Broadcast a message to all connections
    pub async fn broadcast(&self, message: &str) -> Result<(), String> {
        self.manager
            .broadcast_raw(message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Broadcast a message to all connections except one
    pub async fn broadcast_except(&self, exclude_id: &str, message: &str) -> Result<(), String> {
        self.manager
            .broadcast_except_raw(exclude_id, message.to_string())
            .await
            .map_err(|e| e.to_string())
    }

    /// Get connection count
    pub async fn connection_count(&self) -> usize {
        self.manager.connection_count().await
    }
}

impl Default for WsService {
    fn default() -> Self {
        Self::new()
    }
}
