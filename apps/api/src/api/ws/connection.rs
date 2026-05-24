use std::time::Instant;
use tokio::sync::mpsc;

use super::error::{WsError, WsResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientType {
    Web,
    Desktop,
    Cli,
    Mobile,
    Unknown,
}

impl ClientType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClientType::Web => "web",
            ClientType::Desktop => "desktop",
            ClientType::Cli => "cli",
            ClientType::Mobile => "mobile",
            ClientType::Unknown => "unknown",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "web" => ClientType::Web,
            "desktop" => ClientType::Desktop,
            "cli" => ClientType::Cli,
            "mobile" => ClientType::Mobile,
            _ => ClientType::Unknown,
        }
    }
}

pub fn generate_conn_id(client_type: ClientType) -> String {
    format!("{}-{}", client_type.as_str(), uuid::Uuid::new_v4())
}

pub struct WsConnection {
    pub id: String,
    pub client_type: ClientType,
    sender: mpsc::Sender<String>,
    last_active: Instant,
}

impl WsConnection {
    pub fn new(client_type: ClientType, sender: mpsc::Sender<String>) -> Self {
        Self {
            id: generate_conn_id(client_type),
            client_type,
            sender,
            last_active: Instant::now(),
        }
    }

    pub fn last_active(&self) -> Instant {
        self.last_active
    }

    pub async fn send(&self, message: String) -> WsResult<()> {
        self.sender
            .send(message)
            .await
            .map_err(|_| WsError::ChannelClosed)
    }

    pub fn sender(&self) -> &mpsc::Sender<String> {
        &self.sender
    }
}
