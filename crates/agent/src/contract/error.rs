use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentProviderError {
    #[error("{0}")]
    Message(String),
    #[error("unsupported: {0}")]
    Unsupported(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("steer requires a matching running turn")]
    SteerTurnMismatch,
    #[error("authentication required")]
    AuthRequired(String),
}

impl AgentProviderError {
    pub fn message(msg: impl Into<String>) -> Self {
        Self::Message(msg.into())
    }

    pub fn unsupported(msg: impl Into<String>) -> Self {
        Self::Unsupported(msg.into())
    }
}

pub type AgentResult<T> = std::result::Result<T, AgentProviderError>;
