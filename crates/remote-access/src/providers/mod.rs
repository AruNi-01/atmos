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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
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
    pub daemon_running: Option<bool>,
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

/// Create a `tokio::process::Command` whose PATH matches what the user sees
/// in their normal terminal.  macOS .app bundles launched from Finder don't
/// inherit the shell's PATH, so we start a login shell once, capture its
/// `$PATH`, cache it, and inject it into every provider sub-process.
pub fn provider_command(program: &str) -> tokio::process::Command {
    let path = provider_shell_path();

    let mut cmd = tokio::process::Command::new(program);
    cmd.env("PATH", path);
    cmd.stdin(std::process::Stdio::null());
    cmd
}

pub fn blocking_provider_command(program: &str) -> std::process::Command {
    let path = provider_shell_path();

    let mut cmd = std::process::Command::new(program);
    cmd.env("PATH", path);
    cmd.stdin(std::process::Stdio::null());
    cmd
}

fn provider_shell_path() -> &'static str {
    static SHELL_PATH: std::sync::OnceLock<String> = std::sync::OnceLock::new();

    SHELL_PATH
        .get_or_init(|| {
            resolve_login_shell_path().unwrap_or_else(|| {
                // Fallback: current PATH + common Homebrew dirs
                let current = std::env::var("PATH").unwrap_or_default();
                let extra = [
                    "/opt/homebrew/bin",
                    "/opt/homebrew/sbin",
                    "/usr/local/bin",
                    "/usr/local/sbin",
                ];
                let mut parts: Vec<&str> = extra.to_vec();
                for p in current.split(':') {
                    if !parts.contains(&p) {
                        parts.push(p);
                    }
                }
                parts.join(":")
            })
        })
        .as_str()
}

/// Run the user's login shell to extract the full PATH.
/// e.g.  `/bin/zsh -l -c 'echo $PATH'`
fn resolve_login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            // Fallback: try common shells
            for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
                if std::path::Path::new(candidate).exists() {
                    return Some(candidate.to_string());
                }
            }
            None
        })?;

    let output = std::process::Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
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
