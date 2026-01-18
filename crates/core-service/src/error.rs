use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("Engine error: {0}")]
    Engine(#[from] core_engine::EngineError),

    #[error("Repository error: {0}")]
    Repository(String),

    #[error("Processing error: {0}")]
    Processing(String),
}

pub type Result<T> = std::result::Result<T, ServiceError>;
