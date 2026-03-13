//! WebSocket message handler - processes incoming messages.
//!
//! This module handles ping/pong and defines traits for business message handling.
//! Business logic is injected from upper layers (core-service), not called directly.

use async_trait::async_trait;
use tracing::debug;

/// Result of processing a WebSocket message
#[derive(Debug, Clone)]
pub enum HandleResult {
    /// Send response back to the client
    Reply(String),
    /// No response needed
    None,
    /// Close the connection
    Close,
}

/// Trait for handling business messages (implemented by core-service)
///
/// This trait allows dependency inversion - infra defines the interface,
/// upper layers provide the implementation.
#[async_trait]
pub trait WsMessageHandler: Send + Sync {
    /// Handle a business message (not ping/pong)
    ///
    /// # Arguments
    /// * `conn_id` - Connection ID
    /// * `message` - The message content
    ///
    /// # Returns
    /// * `Some(response)` - Reply to send back
    /// * `None` - No reply needed
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String>;

    /// Called when a new connection is established
    async fn on_connect(&self, _conn_id: &str) {}

    /// Called when a connection is closed
    async fn on_disconnect(&self, _conn_id: &str) {}
}

/// Process an incoming WebSocket text message
///
/// Handles:
/// - "ping" / "Ping" -> replies "pong"
/// - "pong" / "Pong" -> ignored
/// - Other messages -> returns None (caller should delegate to WsMessageHandler)
pub fn process_text_message(text: &str, conn_id: &str) -> HandleResult {
    let text_trimmed = text.trim();
    let text_lower = text_trimmed.to_lowercase();

    // Handle ping/pong
    if text_lower == "ping" {
        debug!("Received ping from {}, replying pong", conn_id);
        return HandleResult::Reply("pong".to_string());
    }

    if text_lower == "pong" {
        debug!("Received pong from {}", conn_id);
        return HandleResult::None;
    }

    // Not a control message, needs business handling
    HandleResult::None
}

/// Check if a message is a control message (ping/pong)
pub fn is_control_message(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.eq_ignore_ascii_case("ping") || trimmed.eq_ignore_ascii_case("pong")
}

/// Configuration for WebSocket connection handling
#[derive(Clone)]
pub struct WsHandlerConfig {
    /// Whether to auto-reply pong for ping messages
    pub auto_pong: bool,
}

impl Default for WsHandlerConfig {
    fn default() -> Self {
        Self { auto_pong: true }
    }
}
