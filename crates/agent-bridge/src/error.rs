use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum BridgeError {
    #[error("ambiguous Agent Bridge target; pass chat_id")]
    AmbiguousTarget { count: usize },
    #[error("connect to Computer {server_id} first")]
    CrossMachineConnect { server_id: String },
    #[error("context bag is on another Computer; pull it there")]
    ContextRefRemote { context_ref: String },
    #[error("unknown provider {provider_id}")]
    UnknownProvider { provider_id: String },
    #[error("inject failed: {0}")]
    Inject(String),
    #[error("{0}")]
    Invalid(String),
}

impl BridgeError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::AmbiguousTarget { .. } => "AMBIGUOUS_TARGET",
            Self::CrossMachineConnect { .. } => "CROSS_MACHINE_CONNECT",
            Self::ContextRefRemote { .. } => "CONTEXT_REF_REMOTE",
            Self::UnknownProvider { .. } => "UNKNOWN_PROVIDER",
            Self::Inject(_) => "INJECT_FAILED",
            Self::Invalid(_) => "INVALID_BRIDGE",
        }
    }
}
