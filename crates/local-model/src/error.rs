use thiserror::Error;

#[derive(Debug, Error)]
pub enum LocalModelError {
    #[error("Home directory not found")]
    HomeDirNotFound,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("SHA-256 checksum mismatch for {path}: expected {expected}, got {actual}")]
    ChecksumMismatch {
        path: String,
        expected: String,
        actual: String,
    },

    #[error("Model not found in manifest: {0}")]
    ModelNotFound(String),

    #[error("Binary not found in manifest for platform: {0}")]
    BinaryNotFound(String),

    #[error("Runtime error: {0}")]
    Runtime(String),

    #[error("Process spawn failed: {0}")]
    SpawnFailed(String),

    #[error("Server did not become ready in time")]
    StartupTimeout,

    #[error("No running instance")]
    NotRunning,

    #[error("Download cancelled")]
    Cancelled,
}

pub type Result<T> = std::result::Result<T, LocalModelError>;
