use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};

use super::{
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry, ProviderStartRequest,
    ProviderStatus, ProviderStatusState, TunnelProvider,
};

#[derive(Default)]
pub struct CloudflareQuickTunnelProvider {
    status: Arc<RwLock<ProviderStatus>>,
    child: Arc<Mutex<Option<Child>>>,
    logs: Arc<RwLock<Vec<ProviderLogEntry>>>,
    last_error: Arc<RwLock<Option<String>>>,
}

#[async_trait]
impl TunnelProvider for CloudflareQuickTunnelProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Cloudflare
    }

    async fn detect(&self) -> ProviderDiagnostics {
        let binary_found = Command::new("cloudflared")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);

        ProviderDiagnostics {
            provider: ProviderKind::Cloudflare,
            binary_found,
            logged_in: true,
            warnings: vec!["quick tunnel 默认临时域名，不保证长期稳定".to_string()],
            last_error: self.last_error.read().await.clone(),
            logs: self.logs.read().await.clone(),
        }
    }

    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        if req.mode == ProviderAccessMode::Private {
            self.logs.write().await.push(ProviderLogEntry {
                at: Utc::now(),
                level: "warn".to_string(),
                message: "cloudflare quick tunnel 为公网模式，已按公网模式启动".to_string(),
            });
        }

        let mut child = Command::new("cloudflared")
            .args(["tunnel", "--url", &req.target_url, "--no-autoupdate"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        let mut public_url = None;
        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(8);
            while tokio::time::Instant::now() < deadline {
                if let Ok(Ok(Some(line))) =
                    tokio::time::timeout(tokio::time::Duration::from_millis(500), lines.next_line())
                        .await
                {
                    if let Some(url) = line
                        .split_whitespace()
                        .find(|x| x.starts_with("https://") && x.contains("trycloudflare.com"))
                    {
                        public_url = Some(url.to_string());
                    }
                    self.logs.write().await.push(ProviderLogEntry {
                        at: Utc::now(),
                        level: "info".to_string(),
                        message: line,
                    });
                    if public_url.is_some() {
                        break;
                    }
                }
            }
        }

        *self.child.lock().await = Some(child);

        let status = ProviderStatus {
            state: ProviderStatusState::Running,
            public_url,
            message: Some("cloudflare quick tunnel started".to_string()),
            started_at: Some(Utc::now()),
        };
        *self.status.write().await = status.clone();
        Ok(status)
    }

    async fn stop(&self) -> anyhow::Result<()> {
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.kill().await;
        }
        *self.status.write().await = ProviderStatus::default();
        self.logs.write().await.push(ProviderLogEntry {
            at: Utc::now(),
            level: "info".to_string(),
            message: "cloudflare quick tunnel stopped".to_string(),
        });
        Ok(())
    }

    async fn status(&self) -> ProviderStatus {
        self.status.read().await.clone()
    }

    async fn diagnostics(&self) -> ProviderDiagnostics {
        self.detect().await
    }

    async fn recover(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        if matches!(self.status.read().await.state, ProviderStatusState::Running) {
            return Ok(self.status.read().await.clone());
        }
        self.start(req).await
    }
}
