use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use reqwest::Client;
use tokio::process::Child;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::config::{ensure_dirs, llama_server_bin, logs_dir, model_path};
use crate::download::{download_with_fallback, verify_file, DownloadProgress};
use crate::error::{LocalModelError, Result};
use crate::manifest::{find_binary_for_platform, find_model, ModelManifest};
use crate::runtime::port::reserve_runtime_port;
use crate::runtime::process::{spawn_llama_server, wait_for_ready};
use crate::runtime::state::LocalModelState;

/// A broadcast channel sender for state change notifications.
pub type StateSender = broadcast::Sender<LocalModelState>;

struct Inner {
    state: LocalModelState,
    child: Option<Child>,
    port: Option<u16>,
    model_id: Option<String>,
    starting: bool,
}

/// The central manager for the local llama-server sidecar.
///
/// It is cheap to clone (Arc-backed) and safe to share across threads.
#[derive(Clone)]
pub struct LocalRuntimeManager {
    inner: Arc<Mutex<Inner>>,
    state_tx: StateSender,
    http: Client,
}

impl LocalRuntimeManager {
    pub fn new() -> Self {
        let (state_tx, _) = broadcast::channel(64);
        Self {
            inner: Arc::new(Mutex::new(Inner {
                state: LocalModelState::NotInstalled,
                child: None,
                port: None,
                model_id: None,
                starting: false,
            })),
            state_tx,
            http: Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
        }
    }

    /// Subscribe to state change notifications.
    pub fn subscribe(&self) -> broadcast::Receiver<LocalModelState> {
        self.state_tx.subscribe()
    }

    /// Current state snapshot.
    pub fn state(&self) -> LocalModelState {
        self.inner.lock().state.clone()
    }

    fn set_state(&self, state: LocalModelState) {
        self.inner.lock().state = state.clone();
        let _ = self.state_tx.send(state);
    }

    /// Mark the runtime as fully installed and idle (binary + model present,
    /// no llama-server running). Public so the download flow in the
    /// websocket layer can drive lifecycle transitions without exposing the
    /// generic state setter.
    pub fn mark_installed_not_running(&self) {
        self.set_state(LocalModelState::InstalledNotRunning);
    }

    /// Mark the runtime as failed with the given error message. Public so
    /// callers driving lifecycle transitions (e.g. the download flow) can
    /// surface terminal failures to subscribers.
    pub fn mark_failed(&self, error: impl Into<String>) {
        self.set_state(LocalModelState::Failed {
            error: error.into(),
        });
    }

    // ─── Download ────────────────────────────────────────────────────────────

    /// Ensure the llama-server binary is present and valid.
    /// Emits `DownloadingBinary` state updates during download.
    pub async fn ensure_binary(&self, manifest: &ModelManifest) -> Result<()> {
        let bin_path = llama_server_bin()?;
        let binary_entry = find_binary_for_platform(manifest).ok_or_else(|| {
            LocalModelError::BinaryNotFound(crate::manifest::current_platform().to_string())
        })?;

        if verify_file(&bin_path, &binary_entry.sha256).await? {
            info!("llama-server binary already present and valid");
            return Ok(());
        }

        info!("Downloading llama-server binary…");
        ensure_dirs()?;

        let tx = self.state_tx.clone();
        let _total = binary_entry.size_bytes;
        let start = Instant::now();

        let urls: Vec<String> = std::iter::once(binary_entry.url.clone()).collect();
        download_with_fallback(
            &self.http,
            &urls,
            &bin_path,
            &binary_entry.sha256,
            move |p: DownloadProgress| {
                let progress = p
                    .total
                    .map(|t| p.downloaded as f32 / t as f32)
                    .unwrap_or(0.0);
                let eta = p.total.map(|_t| {
                    let elapsed = start.elapsed().as_secs_f64();
                    if progress > 0.0 {
                        ((elapsed / progress as f64) * (1.0 - progress as f64)) as u64
                    } else {
                        0
                    }
                });
                let _ = tx.send(LocalModelState::DownloadingBinary {
                    progress,
                    eta_seconds: eta,
                });
            },
        )
        .await?;

        // Make executable on Unix.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&bin_path)?.permissions();
            perms.set_mode(perms.mode() | 0o111);
            std::fs::set_permissions(&bin_path, perms)?;
        }

        info!("llama-server binary ready at {}", bin_path.display());
        Ok(())
    }

    /// Ensure the model GGUF file is present and valid.
    /// Emits `DownloadingModel` state updates during download.
    pub async fn ensure_model(&self, manifest: &ModelManifest, model_id: &str) -> Result<()> {
        let entry = find_model(manifest, model_id)
            .ok_or_else(|| LocalModelError::ModelNotFound(model_id.to_string()))?;

        let dest = model_path(model_id)?;
        if verify_file(&dest, &entry.sha256).await? {
            info!("Model {model_id} already present and valid");
            return Ok(());
        }

        info!("Downloading model {model_id}…");
        ensure_dirs()?;

        let tx = self.state_tx.clone();
        let start = Instant::now();

        let mut urls = vec![entry.gguf_url.clone()];
        urls.extend(entry.mirror_urls.clone());

        download_with_fallback(
            &self.http,
            &urls,
            &dest,
            &entry.sha256,
            move |p: DownloadProgress| {
                let progress = p
                    .total
                    .map(|t| p.downloaded as f32 / t as f32)
                    .unwrap_or(0.0);
                let eta = p.total.map(|_t| {
                    let elapsed = start.elapsed().as_secs_f64();
                    if progress > 0.0 {
                        ((elapsed / progress as f64) * (1.0 - progress as f64)) as u64
                    } else {
                        0
                    }
                });
                let _ = tx.send(LocalModelState::DownloadingModel {
                    progress,
                    eta_seconds: eta,
                });
            },
        )
        .await?;

        info!("Model {model_id} ready at {}", dest.display());
        Ok(())
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    /// Start the llama-server for the given model.
    ///
    /// This method:
    /// 1. Ensures binary + model are downloaded (emitting progress states).
    /// 2. Spawns the process.
    /// 3. Waits for the health endpoint to respond.
    /// 4. Transitions to `Running`.
    pub async fn start(&self, manifest: &ModelManifest, model_id: &str) -> Result<()> {
        {
            let mut inner = self.inner.lock();
            if inner.state.is_running() {
                info!("llama-server already running");
                return Ok(());
            }
            if inner.starting {
                info!("llama-server already starting");
                return Ok(());
            }
            inner.starting = true;
        }

        let result = async {
            // Download binary if needed.
            self.ensure_binary(manifest).await?;
            // Download model if needed.
            self.ensure_model(manifest, model_id).await?;

            self.set_state(LocalModelState::InstalledNotRunning);
            self.set_state(LocalModelState::Starting);

            let bin_path = llama_server_bin()?;
            let model_path = model_path(model_id)?;
            let _listener = reserve_runtime_port()?;
            let port = crate::runtime::port::LOCAL_RUNTIME_PORT;

            let context_size = find_model(manifest, model_id)
                .map(|m| m.recommended_context_size)
                .unwrap_or(2048);

            let log_path = logs_dir()?.join(format!("{model_id}.log"));

            let mut child =
                match spawn_llama_server(&bin_path, &model_path, port, context_size, &log_path).await {
                    Ok(c) => c,
                    Err(e) => {
                        let msg = e.to_string();
                        self.set_state(LocalModelState::Failed { error: msg.clone() });
                        return Err(LocalModelError::SpawnFailed(msg));
                    }
                };

            // Wait for readiness.
            if let Err(e) = wait_for_ready(port).await {
                let msg = e.to_string();
                self.set_state(LocalModelState::Failed { error: msg.clone() });
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(e);
            }

            let endpoint = format!("http://127.0.0.1:{port}");
            {
                let mut inner = self.inner.lock();
                inner.child = Some(child);
                inner.port = Some(port);
                inner.model_id = Some(model_id.to_string());
            }
            self.set_state(LocalModelState::Running {
                endpoint,
                model_id: model_id.to_string(),
            });
            Ok(())
        }.await;

        // Reset starting flag regardless of success or failure
        self.inner.lock().starting = false;
        result
    }

    /// Stop the running llama-server.
    pub async fn stop(&self) -> Result<()> {
        let child = {
            let mut inner = self.inner.lock();
            inner.port = None;
            inner.model_id = None;
            inner.child.take()
        };

        if let Some(mut child) = child {
            let _ = child.kill().await;
            info!("llama-server stopped");
        } else {
            warn!("stop() called but no child process found");
        }

        self.set_state(LocalModelState::InstalledNotRunning);
        Ok(())
    }

    /// Delete a downloaded model file.
    pub async fn delete_model(&self, model_id: &str) -> Result<()> {
        // Stop first if this model is running.
        {
            let running_model = self.inner.lock().model_id.clone();
            if running_model.as_deref() == Some(model_id) {
                self.stop().await?;
            }
        }

        let path = model_path(model_id)?;
        if path.exists() {
            tokio::fs::remove_file(&path).await?;
            info!("Deleted model file {}", path.display());
        }
        self.set_state(LocalModelState::NotInstalled);
        Ok(())
    }

    /// Check whether a model GGUF file exists on disk (without verifying hash).
    pub fn is_model_installed(&self, model_id: &str) -> bool {
        model_path(model_id).map(|p| p.exists()).unwrap_or(false)
    }

    /// Return the current endpoint if running.
    pub fn endpoint(&self) -> Option<String> {
        self.inner.lock().state.endpoint().map(ToOwned::to_owned)
    }
}

impl Default for LocalRuntimeManager {
    fn default() -> Self {
        Self::new()
    }
}
