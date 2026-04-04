use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;
use tokio::process::Command;
use tokio::sync::RwLock;

use super::{
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry, ProviderStartRequest,
    ProviderStatus, ProviderStatusState, TunnelProvider,
};

#[derive(Default)]
pub struct TailscaleProvider {
    status: Arc<RwLock<ProviderStatus>>,
    last_mode: Arc<RwLock<Option<ProviderAccessMode>>>,
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
        let logged_in = self
            .status_json()
            .await
            .and_then(|value| {
                value
                    .get("BackendState")
                    .and_then(Value::as_str)
                    .map(|state| !matches!(state, "NeedsLogin" | "NoState"))
            })
            .unwrap_or(false);

        ProviderDiagnostics {
            provider: ProviderKind::Tailscale,
            binary_found,
            logged_in,
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
        *self.last_mode.write().await = Some(req.mode);

        let output = Command::new("tailscale")
            .args(args)
            .arg(req.target_url)
            .output()
            .await?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            *self.last_mode.write().await = None;
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

        let public_url = self.public_url().await.unwrap_or_else(|| {
            if req.mode == ProviderAccessMode::Public {
                "tailscale://funnel".to_string()
            } else {
                "tailscale://serve".to_string()
            }
        });

        let status = ProviderStatus {
            state: ProviderStatusState::Running,
            public_url: Some(public_url),
            message: Some("tailscale tunnel started".to_string()),
            started_at: Some(Utc::now()),
        };
        *self.status.write().await = status.clone();
        Ok(status)
    }

    async fn stop(&self) -> anyhow::Result<()> {
        let mode = *self.last_mode.read().await;
        let reset_args = match mode.unwrap_or(ProviderAccessMode::Private) {
            ProviderAccessMode::Private => ["serve", "reset"],
            ProviderAccessMode::Public => ["funnel", "reset"],
        };

        let output = match Self::run_command(reset_args).await {
            Ok(output) => output,
            Err(err) => {
                let error = format!("tailscale {} failed: {err}", reset_args.join(" "));
                let current_status = self.status.read().await.clone();
                *self.last_error.write().await = Some(error.clone());
                *self.status.write().await = ProviderStatus {
                    state: ProviderStatusState::Error,
                    public_url: current_status.public_url,
                    message: Some(error.clone()),
                    started_at: current_status.started_at,
                };
                anyhow::bail!(error);
            }
        };
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let error = if stderr.is_empty() {
                format!("tailscale {} failed", reset_args.join(" "))
            } else {
                stderr
            };
            let current_status = self.status.read().await.clone();
            *self.last_error.write().await = Some(error.clone());
            *self.status.write().await = ProviderStatus {
                state: ProviderStatusState::Error,
                public_url: current_status.public_url,
                message: Some(error.clone()),
                started_at: current_status.started_at,
            };
            anyhow::bail!(error);
        }

        *self.status.write().await = ProviderStatus::default();
        *self.last_mode.write().await = None;
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

impl TailscaleProvider {
    async fn public_url(&self) -> Option<String> {
        let value = self.status_json().await?;
        let dns_name = value
            .get("Self")
            .and_then(|self_value| self_value.get("DNSName"))
            .and_then(Value::as_str)?
            .trim_end_matches('.');

        Some(format!("https://{dns_name}"))
    }

    async fn status_json(&self) -> Option<Value> {
        let output = Self::run_command(["status", "--json"]).await.ok()?;
        if !output.status.success() {
            return None;
        }

        serde_json::from_slice::<Value>(&output.stdout).ok()
    }

    async fn run_command(args: [&str; 2]) -> std::io::Result<std::process::Output> {
        Command::new("tailscale").args(args).output().await
    }
}
