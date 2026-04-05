use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Child;
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
        let binary_found = super::provider_command("cloudflared")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);

        let warnings = if !binary_found {
            vec!["Install cloudflared: `brew install cloudflared` or visit https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/".to_string()]
        } else {
            vec![]
        };

        ProviderDiagnostics {
            provider: ProviderKind::Cloudflare,
            binary_found,
            daemon_running: None,
            logged_in: binary_found,
            warnings,
            last_error: self.last_error.read().await.clone(),
            logs: self.logs.read().await.clone(),
        }
    }

    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        if req.mode == ProviderAccessMode::Private {
            self.logs.write().await.push(ProviderLogEntry {
                at: Utc::now(),
                level: "warn".to_string(),
                message: "cloudflare quick tunnel is public-only; started in public mode".to_string(),
            });
        }

        let mut child = super::provider_command("cloudflared")
            .args(["tunnel", "--url", &req.target_url, "--no-autoupdate"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()?;

        let (url_tx, mut url_rx) = mpsc::unbounded_channel();
        if let Some(stdout) = child.stdout.take() {
            Self::spawn_log_drain(stdout, "info", Arc::clone(&self.logs), Some(url_tx.clone()));
        }
        if let Some(stderr) = child.stderr.take() {
            Self::spawn_log_drain(stderr, "warn", Arc::clone(&self.logs), Some(url_tx.clone()));
        }
        drop(url_tx);

        // Use a separate OS-thread timer to kill the child after the deadline.
        // This avoids relying on tokio::time (which can be unreliable in the
        // Tauri runtime context).  Killing the child closes its pipes, which
        // causes the log drain tasks to EOF and drop the url_tx senders, which
        // causes url_rx.recv() below to return None and unblock.
        //
        // The cancel flag lets us skip the kill once a URL has been extracted.
        let cancel_kill = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancel_kill_clone = Arc::clone(&cancel_kill);
        let child_id = child.id();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(15));
            if cancel_kill_clone.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            if let Some(pid) = child_id {
                // SIGTERM the child so cloudflared can clean up; if it doesn't
                // die in time kill_on_drop (when Child is dropped) finishes it.
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as libc::pid_t, libc::SIGTERM);
                }
                #[cfg(not(unix))]
                let _ = pid;
            }
        });

        let mut public_url = None;
        // url_rx.recv() completes when a URL is sent OR all senders are dropped
        // (which happens when the log drain tasks hit EOF after the child is killed).
        if let Some(url) = url_rx.recv().await {
            cancel_kill.store(true, std::sync::atomic::Ordering::Relaxed);
            public_url = Some(url);
        }

        let Some(public_url) = public_url else {
            let message = "cloudflare quick tunnel did not report a public URL".to_string();
            *self.last_error.write().await = Some(message.clone());
            let _ = child.kill().await;
            let _ = child.wait().await;
            *self.status.write().await = ProviderStatus {
                state: ProviderStatusState::Error,
                public_url: None,
                message: Some(message.clone()),
                started_at: None,
            };
            anyhow::bail!(message);
        };

        *self.child.lock().await = Some(child);

        let status = ProviderStatus {
            state: ProviderStatusState::Running,
            public_url: Some(public_url),
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
