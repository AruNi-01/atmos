use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::providers::{ProviderDiagnostics, ProviderKind, ProviderStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionMode {
    Private,
    Public,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionPermission {
    Control,
    View,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub provider: ProviderKind,
    pub mode: SessionMode,
    pub permission: SessionPermission,
    pub ttl_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionValidation {
    Authorized { session_id: String },
    Unauthorized,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteAccessStatus {
    pub gateway_url: Option<String>,
    pub public_url: Option<String>,
    pub share_url: Option<String>,
    pub provider: Option<ProviderKind>,
    pub provider_status: ProviderStatus,
    pub active_session_id: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteAccessStatusSnapshot {
    pub status: RemoteAccessStatus,
    pub diagnostics: ProviderDiagnostics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RemoteAccessEvent {
    Started {
        provider: ProviderKind,
        public_url: String,
        session_id: String,
        expires_at: DateTime<Utc>,
    },
    Stopped,
    Error {
        message: String,
    },
}
