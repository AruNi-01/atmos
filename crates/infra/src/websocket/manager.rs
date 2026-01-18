use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use super::connection::{ClientType, WsConnection};
use super::error::{WsError, WsResult};
use super::message::WsMessage;

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

    pub async fn register_connection_with_metadata(
        &self,
        client_type: ClientType,
        sender: mpsc::Sender<String>,
        metadata: HashMap<String, String>,
    ) -> String {
        let connection = WsConnection::with_metadata(client_type, sender, metadata);
        let id = connection.id.clone();
        let mut connections = self.connections.write().await;
        connections.insert(id.clone(), connection);
        info!("WebSocket connection registered with metadata: {}", id);
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
        let connections = self.connections.read().await;

        if let Some(connection) = connections.get(id) {
            connection.send(json).await?;
            debug!("Message sent to connection: {}", id);
            Ok(())
        } else {
            warn!("Connection not found: {}", id);
            Err(WsError::ConnectionNotFound(id.to_string()))
        }
    }

    pub async fn send_raw(&self, id: &str, message: String) -> WsResult<()> {
        let connections = self.connections.read().await;

        if let Some(connection) = connections.get(id) {
            connection.send(message).await?;
            debug!("Raw message sent to connection: {}", id);
            Ok(())
        } else {
            warn!("Connection not found: {}", id);
            Err(WsError::ConnectionNotFound(id.to_string()))
        }
    }

    pub async fn broadcast(&self, message: &WsMessage) -> WsResult<()> {
        let json = message.to_json()?;
        self.broadcast_raw(json).await
    }

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

    pub async fn broadcast_except(&self, exclude_id: &str, message: &WsMessage) -> WsResult<()> {
        let json = message.to_json()?;
        self.broadcast_except_raw(exclude_id, json).await
    }

    pub async fn broadcast_except_raw(&self, exclude_id: &str, message: String) -> WsResult<()> {
        let connections = self.connections.read().await;
        let mut failed_ids = Vec::new();

        for (id, connection) in connections.iter() {
            if id == exclude_id {
                continue;
            }
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
        }

        Ok(())
    }

    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }

    pub async fn has_connection(&self, id: &str) -> bool {
        self.connections.read().await.contains_key(id)
    }

    pub async fn get_sender(&self, id: &str) -> Option<mpsc::Sender<String>> {
        let connections = self.connections.read().await;
        connections.get(id).map(|conn| conn.sender().clone())
    }

    /// Update the last active time for a connection
    pub async fn touch_connection(&self, id: &str) {
        let mut connections = self.connections.write().await;
        if let Some(conn) = connections.get_mut(id) {
            conn.touch();
            debug!("Connection {} touched", id);
        }
    }

    /// Get list of expired connection IDs
    pub async fn get_expired_connections(&self, timeout_secs: u64) -> Vec<String> {
        let connections = self.connections.read().await;
        connections
            .iter()
            .filter(|(_, conn)| conn.is_expired(timeout_secs))
            .map(|(id, _)| id.clone())
            .collect()
    }
}
