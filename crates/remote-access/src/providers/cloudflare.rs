use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
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

        let (url_tx, mut url_rx) = mpsc::unbounded_channel();
        if let Some(stdout) = child.stdout.take() {
            Self::spawn_log_drain(stdout, "info", Arc::clone(&self.logs), Some(url_tx.clone()));
        }
        if let Some(stderr) = child.stderr.take() {
            Self::spawn_log_drain(stderr, "warn", Arc::clone(&self.logs), Some(url_tx.clone()));
        }
        drop(url_tx);

        let mut public_url = None;
        let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(8);
        while tokio::time::Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            match tokio::time::timeout(remaining, url_rx.recv()).await {
                Ok(Some(url)) => {
                    public_url = Some(url);
                    break;
                }
                Ok(None) | Err(_) => break,
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
            let _ = child.wait().await;
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
        self.refresh_child_state().await;
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

impl CloudflareQuickTunnelProvider {
    fn spawn_log_drain<R>(
        reader: R,
        level: &'static str,
        logs: Arc<RwLock<Vec<ProviderLogEntry>>>,
        url_tx: Option<mpsc::UnboundedSender<String>>,
    ) where
        R: AsyncRead + Unpin + Send + 'static,
    {
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(url) = extract_trycloudflare_url(&line) {
                    if let Some(url_tx) = &url_tx {
                        let _ = url_tx.send(url);
                    }
                }
                logs.write().await.push(ProviderLogEntry {
                    at: Utc::now(),
                    level: level.to_string(),
                    message: line,
                });
            }
        });
    }

    async fn refresh_child_state(&self) {
        let exit = {
            let mut child_guard = self.child.lock().await;
            let Some(child) = child_guard.as_mut() else {
                return;
            };

            match child.try_wait() {
                Ok(Some(status)) => {
                    *child_guard = None;
                    Ok(Some(status))
                }
                Ok(None) => Ok(None),
                Err(err) => {
                    *child_guard = None;
                    Err(err.to_string())
                }
            }
        };

        let exit = match exit {
            Ok(Some(exit)) => exit,
            Ok(None) => return,
            Err(err) => {
                *self.last_error.write().await = Some(err.clone());
                *self.status.write().await = ProviderStatus {
                    state: ProviderStatusState::Error,
                    public_url: None,
                    message: Some(err.clone()),
                    started_at: None,
                };
                self.logs.write().await.push(ProviderLogEntry {
                    at: Utc::now(),
                    level: "error".to_string(),
                    message: err,
                });
                return;
            }
        };

        let message = if exit.success() {
            "cloudflare quick tunnel exited".to_string()
        } else {
            let message = format!("cloudflare quick tunnel exited with status {exit}");
            *self.last_error.write().await = Some(message.clone());
            message
        };

        *self.status.write().await = ProviderStatus {
            state: if exit.success() {
                ProviderStatusState::Idle
            } else {
                ProviderStatusState::Error
            },
            public_url: None,
            message: Some(message.clone()),
            started_at: None,
        };
        self.logs.write().await.push(ProviderLogEntry {
            at: Utc::now(),
            level: if exit.success() {
                "info".to_string()
            } else {
                "error".to_string()
            },
            message,
        });
    }
}

fn extract_trycloudflare_url(line: &str) -> Option<String> {
    line.split_whitespace()
        .find(|token| token.starts_with("https://") && token.contains("trycloudflare.com"))
        .map(ToString::to_string)
}
