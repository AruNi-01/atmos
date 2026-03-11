use thiserror::Error;

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("Home directory not found")]
    HomeDirNotFound,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Invalid config: {0}")]
    InvalidConfig(String),

    #[error("Missing API key for provider `{0}`")]
    MissingApiKey(String),

    #[error("Environment variable `{0}` is not set")]
    MissingEnvironmentVariable(String),

    #[error("Provider request failed: {0}")]
    Provider(String),
}

pub type Result<T> = std::result::Result<T, LlmError>;
