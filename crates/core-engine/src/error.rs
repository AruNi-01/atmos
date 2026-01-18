use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Processing error: {0}")]
    Processing(String),

    #[error("PTY error: {0}")]
    Pty(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("Tmux error: {0}")]
    Tmux(String),

    #[error("FileSystem error: {0}")]
    FileSystem(String),
}

pub type Result<T> = std::result::Result<T, EngineError>;
