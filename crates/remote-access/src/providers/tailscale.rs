use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use tokio::process::Command;
use tokio::sync::RwLock;

use super::{
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry, ProviderStartRequest,
    ProviderStatus, ProviderStatusState, TunnelProvider,
};

#[derive(Default)]
pub struct TailscaleProvider {
    status: Arc<RwLock<ProviderStatus>>,
    logs: Arc<RwLock<Vec<ProviderLogEntry>>>,
    last_error: Arc<RwLock<Option<String>>>,
}

#[async_trait]
impl TunnelProvider for TailscaleProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Tailscale
    }

    async fn detect(&self) -> ProviderDiagnostics {
        let binary_found = Command::new("tailscale")
            .arg("version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);

        ProviderDiagnostics {
            provider: ProviderKind::Tailscale,
            binary_found,
            logged_in: binary_found,
            warnings: vec!["tailscale funnel 需要显式开启公网暴露".to_string()],
            last_error: self.last_error.read().await.clone(),
            logs: self.logs.read().await.clone(),
        }
    }

    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        let mut args = vec!["serve", "--bg"];
        if req.mode == ProviderAccessMode::Public {
            args = vec!["funnel", "--bg"];
        }

        let output = Command::new("tailscale")
            .args(args)
            .arg(req.target_url)
            .output()
            .await?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            *self.last_error.write().await = Some(err.clone());
            anyhow::bail!(err);
        }

        self.logs.write().await.push(ProviderLogEntry {
            at: Utc::now(),
            level: "info".to_string(),
            message: format!(
                "tailscale {} started",
                if req.mode == ProviderAccessMode::Public {
                    "funnel"
                } else {
                    "serve"
                }
            ),
        });

        let status = ProviderStatus {
            state: ProviderStatusState::Running,
            public_url: Some(
                if req.mode == ProviderAccessMode::Public {
                    "tailscale://funnel"
                } else {
                    "tailscale://serve"
                }
                .to_string(),
            ),
            message: Some("tailscale tunnel started".to_string()),
            started_at: Some(Utc::now()),
        };
        *self.status.write().await = status.clone();
        Ok(status)
    }

    async fn stop(&self) -> anyhow::Result<()> {
        let _ = Command::new("tailscale")
            .args(["serve", "reset"])
            .output()
            .await?;
        let _ = Command::new("tailscale")
            .args(["funnel", "reset"])
            .output()
            .await;

        *self.status.write().await = ProviderStatus::default();
        self.logs.write().await.push(ProviderLogEntry {
            at: Utc::now(),
            level: "info".to_string(),
            message: "tailscale tunnel stopped".to_string(),
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
