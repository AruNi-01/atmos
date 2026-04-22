use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::RwLock;

use crate::installer::Installer;
use crate::registry::{builtin_lsp_registry, find_by_extension, LspDefinition};
use crate::transport::{
    initialize_request_with_options, initialized_notification, JsonRpcMessage, LspTransport,
};

#[derive(Debug, Clone)]
pub enum LspRuntimeStatus {
    Installing,
    Starting,
    Running,
    Error(String),
    Unavailable,
}

#[derive(Debug, Clone)]
pub struct LspActivationSnapshot {
    pub server_id: Option<String>,
    pub server_name: Option<String>,
    pub status: LspRuntimeStatus,
    pub version: Option<String>,
    pub install_path: Option<String>,
    pub workspace_root: Option<String>,
    pub restart_count: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct RuntimeState {
    status: LspRuntimeStatus,
    install_path: Option<String>,
    restart_count: u32,
    last_error: Option<String>,
}

struct RunningLsp {
    child: Child,
    #[allow(dead_code)]
    transport: LspTransport<ChildStdout, ChildStdin>,
}

pub struct LspManager {
    registry: Vec<LspDefinition>,
    installer: Installer,
    state: RwLock<HashMap<String, RuntimeState>>,
    active: RwLock<HashMap<String, RunningLsp>>,
}

impl LspManager {
    pub fn new(installer: Installer) -> Self {
        Self::with_registry(installer, builtin_lsp_registry())
    }

    pub fn with_registry(installer: Installer, registry: Vec<LspDefinition>) -> Self {
        Self {
            registry,
            installer,
            state: RwLock::new(HashMap::new()),
            active: RwLock::new(HashMap::new()),
        }
    }

    pub fn definition_for_file_path(&self, file_path: &str) -> Option<&LspDefinition> {
        let extension = Path::new(file_path).extension()?.to_string_lossy();
        find_by_extension(&self.registry, &extension)
    }

    fn runtime_key(definition_id: &str, workspace_root: &str) -> String {
        format!("{workspace_root}::{definition_id}")
    }

    fn normalize_workspace_root(file_path: &str, workspace_root: Option<&str>) -> String {
        if let Some(root) = workspace_root {
            return root.to_string();
        }

        PathBuf::from(file_path)
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_string_lossy()
            .to_string()
    }

    pub async fn snapshot_for_file(
        &self,
        file_path: &str,
        workspace_root: Option<&str>,
    ) -> LspActivationSnapshot {
        let Some(definition) = self.definition_for_file_path(file_path) else {
            return LspActivationSnapshot {
                server_id: None,
                server_name: None,
                status: LspRuntimeStatus::Unavailable,
                version: None,
                install_path: None,
                workspace_root: None,
                restart_count: 0,
                last_error: None,
            };
        };

        let root = Self::normalize_workspace_root(file_path, workspace_root);
        let key = Self::runtime_key(definition.id, &root);
        let state = self.state.read().await.get(&key).cloned();

        LspActivationSnapshot {
            server_id: Some(definition.id.to_string()),
            server_name: Some(definition.name.to_string()),
            status: state
                .as_ref()
                .map(|s| s.status.clone())
                .unwrap_or(LspRuntimeStatus::Unavailable),
            version: Some(definition.version.to_string()),
            install_path: state.as_ref().and_then(|s| s.install_path.clone()),
            workspace_root: Some(root),
            restart_count: state.as_ref().map(|s| s.restart_count).unwrap_or_default(),
            last_error: state.and_then(|s| s.last_error),
        }
    }

    pub async fn activate_for_file(
        self: &Arc<Self>,
        file_path: &str,
        workspace_root: Option<&str>,
    ) -> LspActivationSnapshot {
        let Some(definition) = self.definition_for_file_path(file_path).cloned() else {
            return LspActivationSnapshot {
                server_id: None,
                server_name: None,
                status: LspRuntimeStatus::Unavailable,
                version: None,
                install_path: None,
                workspace_root: None,
                restart_count: 0,
                last_error: None,
            };
        };

        let root = Self::normalize_workspace_root(file_path, workspace_root);
        let key = Self::runtime_key(definition.id, &root);

        if self.active.read().await.contains_key(&key) {
            self.update_state(
                &key,
                RuntimeState {
                    status: LspRuntimeStatus::Running,
                    install_path: self
                        .state
                        .read()
                        .await
                        .get(&key)
                        .and_then(|state| state.install_path.clone()),
                    restart_count: self
                        .state
                        .read()
                        .await
                        .get(&key)
                        .map(|state| state.restart_count)
                        .unwrap_or_default(),
                    last_error: None,
                },
            )
            .await;
            return self.snapshot_for_file(file_path, Some(&root)).await;
        }

        if let Some(existing_state) = self.state.read().await.get(&key) {
            if matches!(
                existing_state.status,
                LspRuntimeStatus::Installing
                    | LspRuntimeStatus::Starting
                    | LspRuntimeStatus::Running
            ) {
                return self.snapshot_for_file(file_path, Some(&root)).await;
            }
        }

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Installing,
                install_path: None,
                restart_count: 0,
                last_error: None,
            },
        )
        .await;

        let manager = Arc::clone(self);
        tokio::spawn(async move {
            let _ = manager.start_runtime(key, root, definition).await;
        });

        self.snapshot_for_file(file_path, workspace_root).await
    }

    pub async fn restart_for_file(
        self: &Arc<Self>,
        file_path: &str,
        workspace_root: Option<&str>,
    ) -> LspActivationSnapshot {
        let Some(definition) = self.definition_for_file_path(file_path).cloned() else {
            return self.snapshot_for_file(file_path, workspace_root).await;
        };
        let root = Self::normalize_workspace_root(file_path, workspace_root);
        let key = Self::runtime_key(definition.id, &root);

        if let Some(mut running) = self.active.write().await.remove(&key) {
            let _ = running.child.kill().await;
        }

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Starting,
                install_path: self
                    .state
                    .read()
                    .await
                    .get(&key)
                    .and_then(|s| s.install_path.clone()),
                restart_count: self
                    .state
                    .read()
                    .await
                    .get(&key)
                    .map(|s| s.restart_count + 1)
                    .unwrap_or(1),
                last_error: None,
            },
        )
        .await;

        let manager = Arc::clone(self);
        tokio::spawn(async move {
            let _ = manager.start_runtime(key, root, definition).await;
        });

        self.snapshot_for_file(file_path, workspace_root).await
    }

    async fn start_runtime(
        self: Arc<Self>,
        key: String,
        workspace_root: String,
        definition: LspDefinition,
    ) -> anyhow::Result<()> {
        let binary = match self.installer.ensure_installed(&definition).await {
            Ok(path) => path,
            Err(error) => {
                self.mark_error(&key, error.to_string()).await;
                return Err(error);
            }
        };

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Starting,
                install_path: Some(binary.to_string_lossy().to_string()),
                restart_count: self
                    .state
                    .read()
                    .await
                    .get(&key)
                    .map(|s| s.restart_count)
                    .unwrap_or_default(),
                last_error: None,
            },
        )
        .await;

        let mut command = Command::new(&binary);
        command
            .current_dir(&workspace_root)
            .args(definition.launch_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                self.mark_error(&key, error.to_string()).await;
                return Err(error.into());
            }
        };

        let (stdout, stdin) = match (child.stdout.take(), child.stdin.take()) {
            (Some(stdout), Some(stdin)) => (stdout, stdin),
            _ => {
                let message = format!("failed to acquire stdio pipes for {}", definition.id);
                self.mark_error(&key, message.clone()).await;
                let _ = child.kill().await;
                return Err(anyhow::anyhow!(message));
            }
        };

        let root_uri = format!("file://{}", workspace_root);
        let mut transport = LspTransport::new(stdout, stdin);
        let initialize =
            match initialize_request_with_options(&root_uri, definition.initialization_options) {
                Ok(request) => request,
                Err(error) => {
                    self.mark_error(&key, error.to_string()).await;
                    let _ = child.kill().await;
                    return Err(error);
                }
            };
        if let Err(error) = transport.send(&initialize).await {
            self.mark_error(&key, error.to_string()).await;
            let _ = child.kill().await;
            return Err(error);
        }

        match transport.read().await {
            Ok(JsonRpcMessage::Response { error, .. }) if error.is_none() => {}
            Ok(_) => {
                let message = format!("invalid initialize response for {}", definition.id);
                self.mark_error(&key, message.clone()).await;
                let _ = child.kill().await;
                return Err(anyhow::anyhow!(message));
            }
            Err(error) => {
                self.mark_error(&key, error.to_string()).await;
                let _ = child.kill().await;
                return Err(error);
            }
        }

        if let Err(error) = transport.send(&initialized_notification()).await {
            self.mark_error(&key, error.to_string()).await;
            let _ = child.kill().await;
            return Err(error);
        }

        self.active
            .write()
            .await
            .insert(key.clone(), RunningLsp { child, transport });
        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Running,
                install_path: Some(binary.to_string_lossy().to_string()),
                restart_count: self
                    .state
                    .read()
                    .await
                    .get(&key)
                    .map(|s| s.restart_count)
                    .unwrap_or_default(),
                last_error: None,
            },
        )
        .await;

        Ok(())
    }

    async fn mark_error(&self, key: &str, message: String) {
        let previous = self.state.read().await.get(key).cloned();
        self.update_state(
            key,
            RuntimeState {
                status: LspRuntimeStatus::Error(message.clone()),
                install_path: previous.as_ref().and_then(|s| s.install_path.clone()),
                restart_count: previous
                    .as_ref()
                    .map(|s| s.restart_count)
                    .unwrap_or_default(),
                last_error: Some(message),
            },
        )
        .await;
    }

    async fn update_state(&self, key: &str, state: RuntimeState) {
        self.state.write().await.insert(key.to_string(), state);
    }

    pub async fn shutdown(&self) {
        let mut active = self.active.write().await;
        for (_, mut process) in active.drain() {
            let _ = process.child.start_kill();
        }
    }
}
