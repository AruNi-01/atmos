use std::collections::HashMap;
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
    metadata: HashMap<String, String>,
    last_active: Instant,
}

impl WsConnection {
    pub fn new(client_type: ClientType, sender: mpsc::Sender<String>) -> Self {
        Self {
            id: generate_conn_id(client_type),
            client_type,
            sender,
            metadata: HashMap::new(),
            last_active: Instant::now(),
        }
    }

    pub fn with_id(
        id: impl Into<String>,
        client_type: ClientType,
        sender: mpsc::Sender<String>,
    ) -> Self {
        Self {
            id: id.into(),
            client_type,
            sender,
            metadata: HashMap::new(),
            last_active: Instant::now(),
        }
    }

    pub fn with_metadata(
        client_type: ClientType,
        sender: mpsc::Sender<String>,
        metadata: HashMap<String, String>,
    ) -> Self {
        Self {
            id: generate_conn_id(client_type),
            client_type,
            sender,
            metadata,
            last_active: Instant::now(),
        }
    }

    pub fn touch(&mut self) {
        self.last_active = Instant::now();
    }

    pub fn last_active(&self) -> Instant {
        self.last_active
    }

    pub fn is_expired(&self, timeout_secs: u64) -> bool {
        self.last_active.elapsed().as_secs() > timeout_secs
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

    pub fn metadata(&self) -> &HashMap<String, String> {
        &self.metadata
    }

    pub fn set_metadata(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.metadata.insert(key.into(), value.into());
    }

    pub fn get_metadata(&self, key: &str) -> Option<&String> {
        self.metadata.get(key)
    }
}
