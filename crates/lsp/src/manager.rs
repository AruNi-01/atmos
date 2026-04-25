use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;

use crate::installer::Installer;
use crate::registry::{builtin_lsp_registry, find_by_extension, LspDefinition};
use crate::transport::{read_message_from, send_message_to, JsonRpcMessage};

const IDLE_RUNTIME_GRACE_PERIOD: Duration = Duration::from_secs(60);

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
pub struct LspConnectionSnapshot {
    pub channel_id: Option<String>,
    pub snapshot: LspActivationSnapshot,
}

#[derive(Debug, Clone)]
pub struct LspServerMessage {
    pub channel_id: String,
    pub conn_id: String,
    pub message: String,
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
    writer: Arc<Mutex<ChildStdin>>,
    stderr_task: Option<JoinHandle<()>>,
    reader_task: Option<JoinHandle<()>>,
}

pub struct LspManager {
    registry: Vec<LspDefinition>,
    installer: Installer,
    state: RwLock<HashMap<String, RuntimeState>>,
    active: RwLock<HashMap<String, RunningLsp>>,
    subscriptions: RwLock<HashMap<String, HashSet<String>>>,
    idle_shutdowns: RwLock<HashMap<String, JoinHandle<()>>>,
    events_tx: Option<mpsc::UnboundedSender<LspServerMessage>>,
}

impl LspManager {
    pub fn new(installer: Installer) -> Self {
        Self::with_registry_and_events(installer, builtin_lsp_registry(), None)
    }

    pub fn with_event_sender(
        installer: Installer,
        events_tx: mpsc::UnboundedSender<LspServerMessage>,
    ) -> Self {
        Self::with_registry_and_events(installer, builtin_lsp_registry(), Some(events_tx))
    }

    pub fn with_registry(installer: Installer, registry: Vec<LspDefinition>) -> Self {
        Self::with_registry_and_events(installer, registry, None)
    }

    pub fn with_registry_and_events(
        installer: Installer,
        registry: Vec<LspDefinition>,
        events_tx: Option<mpsc::UnboundedSender<LspServerMessage>>,
    ) -> Self {
        Self {
            registry,
            installer,
            state: RwLock::new(HashMap::new()),
            active: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(HashMap::new()),
            idle_shutdowns: RwLock::new(HashMap::new()),
            events_tx,
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

    pub fn channel_id_for_file(
        &self,
        file_path: &str,
        workspace_root: Option<&str>,
    ) -> Option<String> {
        let definition = self.definition_for_file_path(file_path)?;
        let root = Self::normalize_workspace_root(file_path, workspace_root);
        Some(Self::runtime_key(definition.id, &root))
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
        self.reconcile_runtime_health(&key).await;
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

    pub async fn connect_for_file(
        self: &Arc<Self>,
        conn_id: &str,
        file_path: &str,
        workspace_root: Option<&str>,
    ) -> LspConnectionSnapshot {
        let Some(channel_id) = self.channel_id_for_file(file_path, workspace_root) else {
            return LspConnectionSnapshot {
                channel_id: None,
                snapshot: self.snapshot_for_file(file_path, workspace_root).await,
            };
        };

        self.cancel_idle_shutdown(&channel_id).await;
        self.add_subscription(&channel_id, conn_id).await;
        let snapshot = self.activate_for_file(file_path, workspace_root).await;

        LspConnectionSnapshot {
            channel_id: Some(channel_id),
            snapshot,
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
        self.reconcile_runtime_health(&key).await;

        if self.active.read().await.contains_key(&key) {
            let previous = self.state.read().await.get(&key).cloned();
            self.update_state(
                &key,
                RuntimeState {
                    status: LspRuntimeStatus::Running,
                    install_path: previous.as_ref().and_then(|s| s.install_path.clone()),
                    restart_count: previous
                        .as_ref()
                        .map(|s| s.restart_count)
                        .unwrap_or_default(),
                    last_error: None,
                },
            )
            .await;
            return self.snapshot_for_file(file_path, Some(&root)).await;
        }

        let existing_state = self.state.read().await.get(&key).cloned();
        if let Some(existing_state) = existing_state {
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

        self.stop_runtime(&key, false).await;
        let previous = self.state.read().await.get(&key).cloned();

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Starting,
                install_path: previous.as_ref().and_then(|s| s.install_path.clone()),
                restart_count: previous
                    .as_ref()
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

    pub async fn send_client_message(
        &self,
        conn_id: &str,
        channel_id: &str,
        raw_message: &str,
    ) -> anyhow::Result<()> {
        self.reconcile_runtime_health(channel_id).await;
        self.add_subscription(channel_id, conn_id).await;

        let message: JsonRpcMessage =
            serde_json::from_str(raw_message).context("failed to parse lsp json-rpc message")?;

        let writer = {
            let active = self.active.read().await;
            active
                .get(channel_id)
                .map(|runtime| Arc::clone(&runtime.writer))
        }
        .ok_or_else(|| anyhow::anyhow!("lsp runtime is not active for channel {channel_id}"))?;

        let mut writer = writer.lock().await;
        send_message_to(&mut *writer, &message).await
    }

    pub async fn disconnect_channel(self: &Arc<Self>, conn_id: &str, channel_id: &str) {
        self.remove_subscription(channel_id, conn_id).await;
        if !self.has_subscribers(channel_id).await {
            self.schedule_idle_shutdown(channel_id.to_string()).await;
        }
    }

    pub async fn disconnect_connection(self: &Arc<Self>, conn_id: &str) {
        let idle_channels = {
            let mut subscriptions = self.subscriptions.write().await;
            let mut idle = Vec::new();
            let keys: Vec<String> = subscriptions.keys().cloned().collect();

            for key in keys {
                if let Some(listeners) = subscriptions.get_mut(&key) {
                    listeners.remove(conn_id);
                    if listeners.is_empty() {
                        subscriptions.remove(&key);
                        idle.push(key);
                    }
                }
            }

            idle
        };

        for channel_id in idle_channels {
            self.schedule_idle_shutdown(channel_id).await;
        }
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
        let previous = self.state.read().await.get(&key).cloned();

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Starting,
                install_path: Some(binary.to_string_lossy().to_string()),
                restart_count: previous
                    .as_ref()
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
            .stderr(Stdio::piped())
            .kill_on_drop(true);

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

        let stderr_task = child.stderr.take().map(|stderr| {
            let server_id = definition.id.to_string();
            let workspace = workspace_root.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                loop {
                    match reader.next_line().await {
                        Ok(Some(line)) => {
                            tracing::warn!(
                                target: "logs_debug_lsp_stderr",
                                server_id = %server_id,
                                workspace_root = %workspace,
                                message = %line,
                                "lsp stderr"
                            );
                        }
                        Ok(None) => break,
                        Err(error) => {
                            tracing::error!(
                                target: "logs_debug_lsp_stderr",
                                server_id = %server_id,
                                workspace_root = %workspace,
                                error = %error,
                                "failed to read lsp stderr"
                            );
                            break;
                        }
                    }
                }
            })
        });

        let writer = Arc::new(Mutex::new(stdin));
        let manager = Arc::clone(&self);
        let reader_key = key.clone();
        let reader_task = tokio::spawn(async move {
            manager.read_runtime_messages(reader_key, stdout).await;
        });

        if let Some(mut previous) = self.active.write().await.insert(
            key.clone(),
            RunningLsp {
                child,
                writer,
                stderr_task,
                reader_task: Some(reader_task),
            },
        ) {
            if let Some(task) = previous.stderr_task.take() {
                task.abort();
            }
            if let Some(task) = previous.reader_task.take() {
                task.abort();
            }
            let _ = previous.child.start_kill();
        }

        if !self.has_subscribers(&key).await {
            self.schedule_idle_shutdown(key.clone()).await;
            return Ok(());
        }
        let previous = self.state.read().await.get(&key).cloned();

        self.update_state(
            &key,
            RuntimeState {
                status: LspRuntimeStatus::Running,
                install_path: Some(binary.to_string_lossy().to_string()),
                restart_count: previous
                    .as_ref()
                    .map(|s| s.restart_count)
                    .unwrap_or_default(),
                last_error: None,
            },
        )
        .await;

        Ok(())
    }

    async fn read_runtime_messages(self: Arc<Self>, key: String, stdout: ChildStdout) {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_message_from(&mut reader).await {
                Ok(message) => {
                    if let Err(error) = self.dispatch_server_message(&key, &message).await {
                        tracing::error!(
                            target: "logs_debug_lsp_bridge",
                            channel_id = %key,
                            error = %error,
                            "failed to dispatch lsp server message"
                        );
                    }
                }
                Err(error) => {
                    self.handle_reader_exit(&key, error.to_string()).await;
                    break;
                }
            }
        }
    }

    async fn dispatch_server_message(
        &self,
        channel_id: &str,
        message: &JsonRpcMessage,
    ) -> anyhow::Result<()> {
        let Some(events_tx) = &self.events_tx else {
            return Ok(());
        };

        let raw = serde_json::to_string(message).context("failed to serialize lsp json-rpc")?;
        let subscribers = self
            .subscriptions
            .read()
            .await
            .get(channel_id)
            .cloned()
            .unwrap_or_default();

        for conn_id in subscribers {
            let _ = events_tx.send(LspServerMessage {
                channel_id: channel_id.to_string(),
                conn_id,
                message: raw.clone(),
            });
        }

        Ok(())
    }

    async fn handle_reader_exit(&self, channel_id: &str, error: String) {
        let mut active = self.active.write().await;
        if let Some(mut runtime) = active.remove(channel_id) {
            if let Some(task) = runtime.stderr_task.take() {
                task.abort();
            }
            let _ = runtime.child.start_kill();
        }
        drop(active);
        self.mark_error(channel_id, format!("lsp transport closed: {error}"))
            .await;
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

    async fn reconcile_runtime_health(&self, key: &str) {
        let exit_observation = {
            let mut active = self.active.write().await;
            let Some(outcome) = active.get_mut(key).map(|running| running.child.try_wait()) else {
                return;
            };

            match outcome {
                Ok(None) => None,
                Ok(Some(status)) => {
                    let mut running = active
                        .remove(key)
                        .expect("active runtime should still exist while reconciling");
                    if let Some(task) = running.stderr_task.take() {
                        task.abort();
                    }
                    if let Some(task) = running.reader_task.take() {
                        task.abort();
                    }
                    Some(format!(
                        "lsp process exited unexpectedly with {}",
                        format_exit_status(status)
                    ))
                }
                Err(error) => {
                    let mut running = active
                        .remove(key)
                        .expect("active runtime should still exist while reconciling");
                    if let Some(task) = running.stderr_task.take() {
                        task.abort();
                    }
                    if let Some(task) = running.reader_task.take() {
                        task.abort();
                    }
                    Some(format!("failed to query lsp process status: {error}"))
                }
            }
        };

        if let Some(message) = exit_observation {
            self.mark_error(key, message).await;
        }
    }

    async fn add_subscription(&self, channel_id: &str, conn_id: &str) {
        let mut subscriptions = self.subscriptions.write().await;
        subscriptions
            .entry(channel_id.to_string())
            .or_default()
            .insert(conn_id.to_string());
    }

    async fn cancel_idle_shutdown(&self, channel_id: &str) {
        let mut idle_shutdowns = self.idle_shutdowns.write().await;
        if let Some(task) = idle_shutdowns.remove(channel_id) {
            task.abort();
        }
    }

    async fn remove_subscription(&self, channel_id: &str, conn_id: &str) {
        let mut subscriptions = self.subscriptions.write().await;
        if let Some(listeners) = subscriptions.get_mut(channel_id) {
            listeners.remove(conn_id);
            if listeners.is_empty() {
                subscriptions.remove(channel_id);
            }
        }
    }

    async fn has_subscribers(&self, channel_id: &str) -> bool {
        self.subscriptions
            .read()
            .await
            .get(channel_id)
            .is_some_and(|listeners| !listeners.is_empty())
    }

    async fn update_state(&self, key: &str, state: RuntimeState) {
        self.state.write().await.insert(key.to_string(), state);
    }

    async fn schedule_idle_shutdown(self: &Arc<Self>, channel_id: String) {
        self.cancel_idle_shutdown(&channel_id).await;

        let manager = Arc::clone(self);
        let shutdown_channel_id = channel_id.clone();
        let task = tokio::spawn(async move {
            tokio::time::sleep(IDLE_RUNTIME_GRACE_PERIOD).await;
            if manager.has_subscribers(&shutdown_channel_id).await {
                return;
            }
            manager
                .idle_shutdowns
                .write()
                .await
                .remove(&shutdown_channel_id);
            manager.stop_runtime(&shutdown_channel_id, true).await;
        });

        self.idle_shutdowns.write().await.insert(channel_id, task);
    }

    async fn stop_runtime(&self, channel_id: &str, clear_state: bool) {
        self.cancel_idle_shutdown(channel_id).await;

        let mut active = self.active.write().await;
        if let Some(mut runtime) = active.remove(channel_id) {
            if let Some(task) = runtime.stderr_task.take() {
                task.abort();
            }
            if let Some(task) = runtime.reader_task.take() {
                task.abort();
            }
            let _ = runtime.child.start_kill();
        }
        drop(active);

        if clear_state {
            self.state.write().await.remove(channel_id);
        }
    }

    pub async fn shutdown(&self) {
        let mut active = self.active.write().await;
        for (_, mut process) in active.drain() {
            if let Some(task) = process.stderr_task.take() {
                task.abort();
            }
            if let Some(task) = process.reader_task.take() {
                task.abort();
            }
            let _ = process.child.start_kill();
        }
        drop(active);
        self.subscriptions.write().await.clear();
        let mut idle_shutdowns = self.idle_shutdowns.write().await;
        for (_, task) in idle_shutdowns.drain() {
            task.abort();
        }
    }
}

fn format_exit_status(status: ExitStatus) -> String {
    match status.code() {
        Some(code) => format!("exit code {code}"),
        None => status.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{InstallMethod, LspDefinition};
    use tempfile::tempdir;

    #[cfg(unix)]
    #[tokio::test]
    async fn snapshot_marks_exited_runtime_as_error() {
        let temp = tempdir().expect("temp dir");
        let manager = LspManager::with_registry(
            Installer::new(temp.path().join("home")),
            vec![LspDefinition {
                id: "test-lsp",
                name: "Test LSP",
                version: "1.0.0",
                extensions: &["txt"],
                executable_name: "test-lsp",
                required_relative_paths: &[],
                install: InstallMethod::SystemBinary { bin: "true" },
                launch_args: &[],
                initialization_options: "{}",
            }],
        );

        let workspace_root = temp.path().join("workspace");
        let workspace_root_str = workspace_root.to_string_lossy().to_string();
        let file_path = workspace_root.join("file.txt").to_string_lossy().to_string();
        let key = LspManager::runtime_key("test-lsp", &workspace_root_str);

        let mut command = Command::new("sh");
        command
            .args(["-c", "exit 0"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command.spawn().expect("spawn child");
        let stdout = child.stdout.take().expect("stdout");
        let stdin = child.stdin.take().expect("stdin");
        let stderr = child.stderr.take();
        let reader_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let _ = read_message_from(&mut reader).await;
        });
        let _ = child.wait().await.expect("wait child");

        manager
            .update_state(
                &key,
                RuntimeState {
                    status: LspRuntimeStatus::Running,
                    install_path: Some("/tmp/test-lsp".to_string()),
                    restart_count: 0,
                    last_error: None,
                },
            )
            .await;

        manager.active.write().await.insert(
            key.clone(),
            RunningLsp {
                child,
                writer: Arc::new(Mutex::new(stdin)),
                stderr_task: stderr.map(|stderr| {
                    tokio::spawn(async move {
                        let mut reader = BufReader::new(stderr).lines();
                        while reader.next_line().await.ok().flatten().is_some() {}
                    })
                }),
                reader_task: Some(reader_task),
            },
        );

        let snapshot = manager
            .snapshot_for_file(&file_path, Some(&workspace_root_str))
            .await;

        assert!(matches!(snapshot.status, LspRuntimeStatus::Error(_)));
        assert!(
            snapshot
                .last_error
                .as_deref()
                .is_some_and(|message| message.contains("exited unexpectedly"))
        );
        assert!(!manager.active.read().await.contains_key(&key));
    }

    #[tokio::test]
    async fn channel_id_matches_runtime_key() {
        let manager = LspManager::with_registry(
            Installer::new(PathBuf::from(".")),
            vec![LspDefinition {
                id: "rust-analyzer",
                name: "Rust Analyzer",
                version: "1.0.0",
                extensions: &["rs"],
                executable_name: "rust-analyzer",
                required_relative_paths: &[],
                install: InstallMethod::SystemBinary {
                    bin: "rust-analyzer",
                },
                launch_args: &[],
                initialization_options: "{}",
            }],
        );

        let channel = manager
            .channel_id_for_file("/tmp/project/src/lib.rs", Some("/tmp/project"))
            .expect("channel id");

        assert_eq!(channel, "/tmp/project::rust-analyzer");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn status_after_connect_does_not_deadlock_while_runtime_starts() {
        let temp = tempdir().expect("temp dir");
        let manager = Arc::new(LspManager::with_registry(
            Installer::new(temp.path().join("home")),
            vec![LspDefinition {
                id: "test-lsp",
                name: "Test LSP",
                version: "1.0.0",
                extensions: &["txt"],
                executable_name: "sh",
                required_relative_paths: &[],
                install: InstallMethod::SystemBinary { bin: "sh" },
                launch_args: &["-c", "sleep 5"],
                initialization_options: "{}",
            }],
        ));

        let workspace_root = temp.path().join("workspace");
        let workspace_root_str = workspace_root.to_string_lossy().to_string();
        let file_path = workspace_root.join("file.txt");
        std::fs::create_dir_all(&workspace_root).expect("workspace dir");
        std::fs::write(&file_path, "hello").expect("file");
        let file_path_str = file_path.to_string_lossy().to_string();

        let connection = tokio::time::timeout(
            Duration::from_secs(1),
            manager.connect_for_file("conn-1", &file_path_str, Some(&workspace_root_str)),
        )
        .await
        .expect("connect should not hang");
        assert!(connection.channel_id.is_some());

        tokio::time::sleep(Duration::from_millis(50)).await;

        let snapshot = tokio::time::timeout(
            Duration::from_secs(1),
            manager.snapshot_for_file(&file_path_str, Some(&workspace_root_str)),
        )
        .await
        .expect("status poll should not hang");

        assert_eq!(snapshot.server_id.as_deref(), Some("test-lsp"));
    }
}
