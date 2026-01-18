use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsMessage {
    Ping,
    Pong,
    Message(MessagePayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    pub id: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl WsMessage {
    pub fn ping() -> Self {
        Self::Ping
    }

    pub fn pong() -> Self {
        Self::Pong
    }

    pub fn message(id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: None,
        })
    }

    pub fn message_with_metadata(
        id: impl Into<String>,
        content: impl Into<String>,
        metadata: serde_json::Value,
    ) -> Self {
        Self::Message(MessagePayload {
            id: id.into(),
            content: content.into(),
            metadata: Some(metadata),
        })
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
