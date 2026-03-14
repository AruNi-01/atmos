use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("Engine error: {0}")]
    Engine(#[from] core_engine::EngineError),

    #[error("Infrastructure error: {0}")]
    Infra(#[from] infra::InfraError),

    #[error("Repository error: {0}")]
    Repository(String),

    #[error("Processing error: {0}")]
    Processing(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),
}

impl From<agent::manager::AgentError> for ServiceError {
    fn from(e: agent::manager::AgentError) -> Self {
        ServiceError::Processing(e.to_string())
    }
}

impl From<anyhow::Error> for ServiceError {
    fn from(e: anyhow::Error) -> Self {
        ServiceError::Processing(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ServiceError>;
