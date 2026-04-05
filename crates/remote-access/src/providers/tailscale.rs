use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;
use tokio::sync::RwLock;

use super::{
    ProviderAccessMode, ProviderDiagnostics, ProviderKind, ProviderLogEntry, ProviderStartRequest,
    ProviderStatus, ProviderStatusState, TunnelProvider,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TailscaleLoginState {
    LoggedIn,
    LoggedOut,
    Unknown,
}

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
        let binary_found = super::provider_command("tailscale")
            .arg("version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);

        let (logged_in, daemon_running) = if binary_found {
            match super::provider_command("tailscale")
                .args(["status", "--json"])
                .output()
                .await
            {
                Ok(output) if output.status.success() => {
                    let json: Option<serde_json::Value> =
                        serde_json::from_slice(&output.stdout).ok();
                    let logged_in = json
                        .map(|v| matches!(Self::login_state(&v), TailscaleLoginState::LoggedIn))
                        .unwrap_or(false);
                    (logged_in, true)
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let no_daemon = stderr.contains("failed to connect")
                        || stderr.contains("is Tailscale running");
                    (false, !no_daemon)
                }
                Err(_) => (false, false),
            }
        } else {
            (false, false)
        };

        let mut warnings = Vec::new();
        if !binary_found {
            warnings.push("Install Tailscale: `brew install tailscale` or visit https://tailscale.com/download".to_string());
        } else if !daemon_running {
            warnings.push("Tailscale service is not running. Install the Tailscale macOS app or start the daemon with `sudo tailscaled &`".to_string());
        } else if !logged_in {
            warnings.push("Run `tailscale login` to authenticate".to_string());
        }

        ProviderDiagnostics {
            provider: ProviderKind::Tailscale,
            binary_found,
            daemon_running: Some(daemon_running),
            logged_in,
            warnings,
            last_error: self.last_error.read().await.clone(),
            logs: self.logs.read().await.clone(),
        }
    }

    async fn start(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        let mut args = vec!["serve", "--bg"];
        if req.mode == ProviderAccessMode::Public {
            args = vec!["funnel", "--bg"];
        }

        // `tailscale serve --bg` forks a background daemon.  The daemon
        // inherits all file descriptors, so piping stdout/stderr causes
        // read_to_end() to block forever (the daemon keeps the pipes open
        // even after the CLI parent exits).  Discard output and wait for
        // just the CLI parent to exit via child.wait() (uses SIGCHLD, not
        // the tokio timer driver).
        //
        // An OS-thread watchdog notifies the async task after 10 s if the CLI
        // parent hasn't exited on its own (e.g. "Serve is not enabled on
        // tailnet" causes it to hang waiting for the user).
        let mut child = super::provider_command("tailscale")
            .args(&args)
            .arg(&req.target_url)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;

        let (watchdog_tx, watchdog_rx) = tokio::sync::oneshot::channel();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(10));
            let _ = watchdog_tx.send(());
        });

        // Wait for the CLI parent to exit (tokio's SIGCHLD-based wait,
        // not timer-based).  Returns as soon as the CLI exits or the watchdog
        // asks us to kill the same child handle.
        let exit_status = tokio::select! {
            status = child.wait() => status,
            _ = watchdog_rx => {
                let _ = child.start_kill();
                child.wait().await
            }
        };
        let exit_ok = exit_status.map(|s| s.success()).unwrap_or(false);

        if !exit_ok {
            let subcmd = if req.mode == ProviderAccessMode::Public { "funnel" } else { "serve" };
            let err = format!(
                "tailscale {subcmd} failed to start.\n\n\
                If this is your first time using Funnel, run this in a terminal — it will open \
                a browser page where you can approve Funnel for your tailnet:\n\n\
                    tailscale funnel --bg {target}\n\n\
                After approving in the browser, try starting the tunnel again.",
                subcmd = subcmd,
                target = req.target_url,
            );
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

        let Some(public_url) = self.public_url().await else {
            let error = "tailscale did not report a DNS name".to_string();
            *self.last_mode.write().await = None;
            *self.last_error.write().await = Some(error.clone());
            *self.status.write().await = ProviderStatus {
                state: ProviderStatusState::Error,
                public_url: None,
                message: Some(error.clone()),
                started_at: None,
            };
            anyhow::bail!(error);
        };

        *self.last_mode.write().await = Some(req.mode);
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
        let mut failures = Vec::new();
        for reset_args in [["serve", "reset"], ["funnel", "reset"]] {
            match Self::run_command(reset_args).await {
                Ok(output) if output.status.success() => {}
                Ok(output) => {
                    let details = Self::command_output_details(&output);
                    let error = format!("tailscale {} failed: {details}", reset_args.join(" "));
                    self.logs.write().await.push(ProviderLogEntry {
                        at: Utc::now(),
                        level: "error".to_string(),
                        message: error.clone(),
                    });
                    failures.push(error);
                }
                Err(err) => {
                    let error = format!("tailscale {} failed: {err}", reset_args.join(" "));
                    self.logs.write().await.push(ProviderLogEntry {
                        at: Utc::now(),
                        level: "error".to_string(),
                        message: error.clone(),
                    });
                    failures.push(error);
                }
            }
        }

        if !failures.is_empty() {
            let error = failures.join("; ");
            let current_status = self.refresh_status().await;
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
        self.refresh_status().await
    }

    async fn diagnostics(&self) -> ProviderDiagnostics {
        self.detect().await
    }

    async fn recover(&self, req: ProviderStartRequest) -> anyhow::Result<ProviderStatus> {
        let status = self.refresh_status().await;
        if matches!(status.state, ProviderStatusState::Running) {
            return Ok(status);
        }
        self.start(req).await
    }
}

impl TailscaleProvider {
    async fn refresh_status(&self) -> ProviderStatus {
        let current_status = self.status.read().await.clone();
        if !matches!(current_status.state, ProviderStatusState::Running) {
            return current_status;
        }

        let Some(value) = self.status_json().await else {
            return current_status;
        };

        let refreshed = match Self::login_state(&value) {
            TailscaleLoginState::LoggedOut => ProviderStatus {
                state: ProviderStatusState::Error,
                public_url: None,
                message: Some("tailscale is not logged in".to_string()),
                started_at: current_status.started_at,
            },
            TailscaleLoginState::LoggedIn => {
                if let Some(public_url) = Self::public_url_from_status_json(&value) {
                    ProviderStatus {
                        public_url: Some(public_url),
                        ..current_status.clone()
                    }
                } else {
                    ProviderStatus {
                        state: ProviderStatusState::Error,
                        public_url: None,
                        message: Some("tailscale did not report a DNS name".to_string()),
                        started_at: current_status.started_at,
                    }
                }
            }
            TailscaleLoginState::Unknown => current_status,
        };
        *self.status.write().await = refreshed.clone();
        refreshed
    }

    async fn public_url(&self) -> Option<String> {
        let value = self.status_json().await?;
        Self::public_url_from_status_json(&value)
    }

    async fn status_json(&self) -> Option<Value> {
        let output = super::provider_command("tailscale")
            .args(["status", "--json"])
            .output()
            .await
            .ok()?;
        if !output.status.success() {
            return None;
        }

        serde_json::from_slice::<Value>(&output.stdout).ok()
    }

    fn login_state(value: &Value) -> TailscaleLoginState {
        match value.get("BackendState").and_then(Value::as_str) {
            Some("NeedsLogin" | "NoState") => TailscaleLoginState::LoggedOut,
            Some(_) => TailscaleLoginState::LoggedIn,
            None => TailscaleLoginState::Unknown,
        }
    }

    fn public_url_from_status_json(value: &Value) -> Option<String> {
        let dns_name = value
            .get("Self")
            .and_then(|self_value| self_value.get("DNSName"))
            .and_then(Value::as_str)?
            .trim_end_matches('.');

        Some(format!("https://{dns_name}"))
    }

    async fn run_command(args: [&str; 2]) -> std::io::Result<std::process::Output> {
        super::provider_command("tailscale")
            .args(args)
            .output()
            .await
    }

    fn command_output_details(output: &std::process::Output) -> String {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            return stderr;
        }

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() {
            return stdout;
        }

        format!("exit status {}", output.status)
    }
}

#[cfg(test)]
mod tests {
    use super::{TailscaleLoginState, TailscaleProvider};
    use serde_json::json;

    #[test]
    fn login_state_is_explicit_about_logged_out_backend_states() {
        assert_eq!(
            TailscaleProvider::login_state(&json!({ "BackendState": "NeedsLogin" })),
            TailscaleLoginState::LoggedOut
        );
        assert_eq!(
            TailscaleProvider::login_state(&json!({ "BackendState": "NoState" })),
            TailscaleLoginState::LoggedOut
        );
    }

    #[test]
    fn login_state_treats_other_or_missing_backend_states_as_not_logged_out() {
        assert_eq!(
            TailscaleProvider::login_state(&json!({ "BackendState": "Running" })),
            TailscaleLoginState::LoggedIn
        );
        assert_eq!(
            TailscaleProvider::login_state(&json!({ "BackendState": "Stopped" })),
            TailscaleLoginState::LoggedIn
        );
        assert_eq!(
            TailscaleProvider::login_state(&json!({})),
            TailscaleLoginState::Unknown
        );
    }

    #[test]
    fn public_url_parsing_trims_trailing_dot() {
        let value = json!({
            "Self": {
                "DNSName": "example.ts.net."
            }
        });

        assert_eq!(
            TailscaleProvider::public_url_from_status_json(&value),
            Some("https://example.ts.net".to_string())
        );
    }
}
