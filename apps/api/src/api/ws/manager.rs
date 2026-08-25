use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use super::connection::{ClientType, WsConnection};
use super::error::{WsError, WsResult};
use super::message::WsMessage;

#[derive(Debug)]
pub struct ConnectionInfo {
    pub id: String,
    pub client_type: String,
    pub connected_seconds: u64,
}

pub struct WsManager {
    connections: Arc<RwLock<HashMap<String, WsConnection>>>,
}

impl Default for WsManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WsManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_connection(
        &self,
        client_type: ClientType,
        sender: mpsc::Sender<String>,
    ) -> String {
        let connection = WsConnection::new(client_type, sender);
        let id = connection.id.clone();
        let mut connections = self.connections.write().await;
        connections.insert(id.clone(), connection);
        info!("WebSocket connection registered: {}", id);
        debug!("Total connections: {}", connections.len());
        id
    }

    pub async fn unregister_connection(&self, id: &str) -> Option<mpsc::Sender<String>> {
        let mut connections = self.connections.write().await;
        let removed = connections.remove(id);
        if let Some(ref conn) = removed {
            info!("WebSocket connection unregistered: {}", id);
            debug!("Total connections: {}", connections.len());
            return Some(conn.sender().clone());
        }
        None
    }

    pub async fn send_to(&self, id: &str, message: &WsMessage) -> WsResult<()> {
        let json = message.to_json()?;
        let sender = {
            let connections = self.connections.read().await;
            connections
                .get(id)
                .map(|connection| connection.sender().clone())
        };

        match sender {
            Some(sender) => {
                sender
                    .send(json)
                    .await
                    .map_err(|_| WsError::ChannelClosed)?;
                debug!("Message sent to connection: {}", id);
                Ok(())
            }
            None => {
                warn!("Connection not found: {}", id);
                Err(WsError::ConnectionNotFound(id.to_string()))
            }
        }
    }

    pub async fn broadcast(&self, message: &WsMessage) -> WsResult<()> {
        let json = message.to_json()?;
        self.broadcast_raw(json).await
    }

    // TODO: Consider changing the mpsc channel type to Arc<str> so broadcast
    // can share a single allocation instead of cloning the String per connection.
    pub async fn broadcast_raw(&self, message: String) -> WsResult<()> {
        let connections = self.connections.read().await;
        let mut failed_ids = Vec::new();

        for (id, connection) in connections.iter() {
            if connection.send(message.clone()).await.is_err() {
                warn!("Failed to send message to connection: {}", id);
                failed_ids.push(id.clone());
            }
        }

        drop(connections);

        if !failed_ids.is_empty() {
            let mut connections = self.connections.write().await;
            for id in failed_ids {
                connections.remove(&id);
                info!("Removed failed connection: {}", id);
            }
            debug!(
                "Broadcast complete, remaining connections: {}",
                connections.len()
            );
        }

        Ok(())
    }

    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }

    /// Return a snapshot of all active connections.
    pub async fn list_connections(&self) -> Vec<ConnectionInfo> {
        let connections = self.connections.read().await;
        connections
            .values()
            .map(|conn| ConnectionInfo {
                id: conn.id.clone(),
                client_type: conn.client_type.as_str().to_string(),
                connected_seconds: conn.last_active().elapsed().as_secs(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use tokio::sync::mpsc;

    use super::WsManager;
    use crate::api::ws::connection::ClientType;
    use crate::api::ws::message::WsMessage;

    /// S7 — `send_to` is connection-scoped; a second conn receives nothing.
    #[tokio::test]
    async fn send_to_does_not_deliver_to_a_second_connection() {
        let manager = WsManager::new();
        let (tx_a, mut rx_a) = mpsc::channel::<String>(8);
        let (tx_b, mut rx_b) = mpsc::channel::<String>(8);
        let subscriber = manager.register_connection(ClientType::Web, tx_a).await;
        let _other = manager.register_connection(ClientType::Web, tx_b).await;

        let message = WsMessage::notification(
            crate::api::ws::message::WsEvent::ResourceMonitorUpdated,
            serde_json::json!({ "collected_at_ms": 1 }),
        );
        manager
            .send_to(&subscriber, &message)
            .await
            .expect("subscriber send_to");

        let received = rx_a.try_recv().expect("subscriber must receive send_to");
        assert!(
            received.contains("resource_monitor_updated"),
            "unexpected subscriber payload: {received}"
        );
        assert!(
            rx_b.try_recv().is_err(),
            "non-subscriber must not receive a send_to payload"
        );
    }

    #[tokio::test]
    async fn send_to_does_not_hold_lock_across_channel_backpressure() {
        let manager = Arc::new(WsManager::new());
        let (tx, mut rx) = mpsc::channel::<String>(1);
        let blocked_id = manager.register_connection(ClientType::Web, tx).await;
        manager
            .send_to(&blocked_id, &WsMessage::pong())
            .await
            .expect("first send fills the bounded channel");

        let send_manager = Arc::clone(&manager);
        let send_id = blocked_id.clone();
        let send_task =
            tokio::spawn(async move { send_manager.send_to(&send_id, &WsMessage::ping()).await });

        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(
            !send_task.is_finished(),
            "send_to should still be waiting on channel backpressure"
        );

        let (other_tx, _other_rx) = mpsc::channel::<String>(1);
        let other_id = tokio::time::timeout(
            Duration::from_millis(200),
            manager.register_connection(ClientType::Desktop, other_tx),
        )
        .await
        .expect("register_connection blocked while send_to held the connections lock");

        tokio::time::timeout(
            Duration::from_millis(200),
            manager.unregister_connection(&other_id),
        )
        .await
        .expect("unregister_connection blocked while send_to held the connections lock");

        assert!(
            !send_task.is_finished(),
            "register/unregister must not depend on the blocked send completing"
        );

        let fill = tokio::time::timeout(Duration::from_millis(200), rx.recv())
            .await
            .expect("blocked send_to should complete once the receiver is ready")
            .expect("channel closed before the fill message was read");
        assert!(fill.contains("pong"), "unexpected fill payload: {fill}");
        send_task
            .await
            .expect("send_to task panicked")
            .expect("send_to should succeed after backpressure clears");
        let received = rx
            .try_recv()
            .expect("ping should be queued after send_to completes");
        assert!(received.contains("ping"), "unexpected payload: {received}");
    }
}
