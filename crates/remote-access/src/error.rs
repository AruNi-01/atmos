use thiserror::Error;

#[derive(Debug, Error)]
pub enum RemoteAccessError {
    #[error("provider is unavailable: {0}")]
    ProviderUnavailable(String),
    #[error("provider start failed: {0}")]
    ProviderStartFailed(String),
    #[error("provider stop failed: {0}")]
    ProviderStopFailed(String),
    #[error("gateway failed: {0}")]
    GatewayFailed(String),
    #[error("session not found")]
    SessionNotFound,
    #[error("session revoked")]
    SessionRevoked,
    #[error("session expired")]
    SessionExpired,
    #[error("unauthorized")]
    Unauthorized,
}
