use thiserror::Error;

#[derive(Error, Debug)]
pub enum WsError {
    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Send failed: {0}")]
    SendFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Channel closed")]
    ChannelClosed,
}

pub type WsResult<T> = std::result::Result<T, WsError>;
