use thiserror::Error;

#[derive(Error, Debug)]
pub enum InfraError {
    #[error("Database error: {0}")]
    Database(#[from] sea_orm::DbErr),

    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Connection not found: {0}")]
    ConnectionNotFound(String),

    #[error("Home directory not found")]
    HomeDirNotFound,

    #[error("{0}")]
    Custom(String),
}

pub type Result<T> = std::result::Result<T, InfraError>;
