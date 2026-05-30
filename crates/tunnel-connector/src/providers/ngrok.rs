use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use ngrok::config::ForwarderBuilder;
use ngrok::prelude::{EndpointInfo, TunnelCloser};
use tokio::sync::{oneshot, Mutex, RwLock};

use super::{
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry, ProviderStartRequest,
    ProviderStatus, ProviderStatusState, TunnelProvider,
};

#[derive(Default)]
pub struct NgrokProvider {
    status: Arc<RwLock<ProviderStatus>>,
    stop_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    logs: Arc<RwLock<Vec<ProviderLogEntry>>>,
    last_error: Arc<RwLock<Option<String>>>,
}

#[async_trait]
impl TunnelProvider for NgrokProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Ngrok
    }

    async fn detect(&self) -> ProviderDiagnostics {
        let has_authtoken = std::env::var("NGROK_AUTHTOKEN").is_ok();
        ProviderDiagnostics {
            provider: ProviderKind::Ngrok,
            binary_found: has_authtoken,
            daemon_running: None,
            logged_in: has_authtoken,
            warnings: if has_authtoken {
                vec![]
            } else {
                vec!["Uses embedded SDK (no external binary needed). Set NGROK_AUTHTOKEN or save your token in Settings".to_string()]
            },
            last_error: self.last_error.read().await.clone(),
            logs: self.logs.read().await.clone(),
        }
    }

    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        if req.mode == ProviderAccessMode::Private {
            self.logs.write().await.push(ProviderLogEntry {
                at: Utc::now(),
                level: "warn".to_string(),
                message: "ngrok provider 通常用于公网访问".to_string(),
            });
        }

        let mut builder = ngrok::Session::builder();
        if let Some(token) = req.credential {
            builder.authtoken(token);
        } else {
            builder.authtoken_from_env();
        }

        // connect() and listen_and_forward() are network calls that may hang.
        // Wrap with tokio::time::timeout as a best-effort; the ngrok SDK uses
        // tokio internally so this should fire even if the Tauri timer driver
        // behaves unexpectedly.
        let session = tokio::time::timeout(tokio::time::Duration::from_secs(15), builder.connect())
            .await
            .map_err(|_| anyhow::anyhow!("ngrok connect timed out after 15s"))?
            .map_err(|e| anyhow::anyhow!("ngrok connect failed: {e}"))?;

        let to_url = reqwest::Url::parse(&req.target_url)?;
        let mut forwarder = tokio::time::timeout(
            tokio::time::Duration::from_secs(15),
            session.http_endpoint().listen_and_forward(to_url),
        )
        .await
        .map_err(|_| anyhow::anyhow!("ngrok listen_and_forward timed out after 15s"))?
        .map_err(|e| anyhow::anyhow!("ngrok listen_and_forward failed: {e}"))?;

        let public_url = forwarder.url().to_string();
        let (stop_tx, stop_rx) = oneshot::channel();

        let logs = Arc::clone(&self.logs);
        let status = Arc::clone(&self.status);
        let last_error = Arc::clone(&self.last_error);
        let task = tokio::spawn(async move {
            let stopped_by_request = tokio::select! {
                _ = stop_rx => {
                    let _ = forwarder.close().await;
                    true
                }
                _ = forwarder.join() => false
            };

            let next_status = if stopped_by_request {
                ProviderStatus::default()
            } else {
                let message = "ngrok forwarder exited unexpectedly".to_string();
                *last_error.write().await = Some(message.clone());
                ProviderStatus {
                    state: ProviderStatusState::Error,
                    public_url: None,
                    message: Some(message.clone()),
                    started_at: None,
                }
            };
            *status.write().await = next_status;
            logs.write().await.push(ProviderLogEntry {
                at: Utc::now(),
                level: if stopped_by_request {
                    "info".to_string()
                } else {
                    "error".to_string()
                },
                message: if stopped_by_request {
                    "ngrok forwarder finished".to_string()
                } else {
                    "ngrok forwarder exited unexpectedly".to_string()
                },
            });
        });

        *self.stop_tx.lock().await = Some(stop_tx);
        *self.task.lock().await = Some(task);

        let status = ProviderStatus {
            state: ProviderStatusState::Running,
            public_url: Some(public_url),
            message: Some("ngrok SDK tunnel started".to_string()),
            started_at: Some(Utc::now()),
        };

        *self.status.write().await = status.clone();
        Ok(status)
    }

    async fn stop(&self) -> anyhow::Result<()> {
        if let Some(tx) = self.stop_tx.lock().await.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.task.lock().await.take() {
            let _ = task.await;
        }
        *self.status.write().await = ProviderStatus::default();
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
