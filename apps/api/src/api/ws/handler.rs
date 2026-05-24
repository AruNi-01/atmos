//! WebSocket business message handler trait.
//!
//! `WsService` is intentionally transport-only: framing, lifecycle, and
//! WebSocket protocol-level ping/pong belong to the upstream framework
//! (axum/tokio-tungstenite/Cloudflare). Application code never sends
//! app-level `"ping"`/`"pong"` strings — those wake hibernated Durable
//! Objects in relay mode and burn billable CPU for zero functional value.
//! See `docs/architecture/relay.md` for the cost rationale.

use async_trait::async_trait;

/// Trait for handling business messages (implemented by core-service).
///
/// Dependency inversion — `infra` defines the interface, upper layers
/// provide the implementation, so `infra` stays free of business deps.
#[async_trait]
pub trait WsMessageHandler: Send + Sync {
    /// Handle a business message.
    ///
    /// # Arguments
    /// * `conn_id` - Connection ID.
    /// * `message` - The raw text payload.
    ///
    /// # Returns
    /// * `Some(response)` - Text payload to send back.
    /// * `None` - No reply.
    async fn handle_message(&self, conn_id: &str, message: &str) -> Option<String>;

    /// Called when a new connection is established.
    async fn on_connect(&self, _conn_id: &str) {}

    /// Called when a connection is closed.
    async fn on_disconnect(&self, _conn_id: &str) {}
}
