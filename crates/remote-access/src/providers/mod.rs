mod cloudflare;
mod ngrok;
mod tailscale;

use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub use cloudflare::CloudflareQuickTunnelProvider;
pub use ngrok::NgrokProvider;
pub use tailscale::TailscaleProvider;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Tailscale,
    Cloudflare,
    Ngrok,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderAccessMode {
    Private,
    Public,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderStatusState {
    Unavailable,
    Idle,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub state: ProviderStatusState,
    pub public_url: Option<String>,
    pub message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderLogEntry {
    pub at: DateTime<Utc>,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDiagnostics {
    pub provider: ProviderKind,
    pub binary_found: bool,
    pub logged_in: bool,
    pub warnings: Vec<String>,
    pub last_error: Option<String>,
    pub logs: Vec<ProviderLogEntry>,
}

#[derive(Debug, Clone)]
pub struct ProviderStartRequest {
    pub target_url: String,
    pub mode: ProviderAccessMode,
    pub credential: Option<String>,
}

#[async_trait]
pub trait TunnelProvider: Send + Sync {
    fn kind(&self) -> ProviderKind;
    async fn detect(&self) -> ProviderDiagnostics;
    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus>;
    async fn stop(&self) -> anyhow::Result<()>;
    async fn status(&self) -> ProviderStatus;
    async fn diagnostics(&self) -> ProviderDiagnostics;
    async fn recover(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus>;
}

pub fn build_provider(kind: ProviderKind) -> Arc<dyn TunnelProvider> {
    match kind {
        ProviderKind::Tailscale => Arc::new(TailscaleProvider::default()),
        ProviderKind::Cloudflare => Arc::new(CloudflareQuickTunnelProvider::default()),
        ProviderKind::Ngrok => Arc::new(NgrokProvider::default()),
    }
}

impl Default for ProviderStatus {
    fn default() -> Self {
        Self {
            state: ProviderStatusState::Idle,
            public_url: None,
            message: None,
            started_at: None,
        }
    }
}
