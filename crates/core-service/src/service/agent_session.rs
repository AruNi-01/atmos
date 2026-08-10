//! Agent session management - creates and manages ACP chat sessions.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent::{
    list_acp_sessions, logout_acp_agent, run_acp_session, AcpSessionControl, AcpSessionHandle,
    AcpToolHandler, AgentLogoutResult, NativeAgentSessionList,
};
use async_trait::async_trait;
use core_engine::FsEngine;
use tokio::sync::{Mutex, RwLock};
use tracing::{info, warn};

use crate::error::{Result, ServiceError};
use crate::utils::path_boundary::{path_or_existing_parent_within_root, path_within_root};

#[derive(Debug, serde::Serialize)]
pub struct LazyAgentSession {
    pub runtime_session_id: String,
    pub registry_id: String,
    pub cwd: String,
    pub status: String,
}

/// Tool handler that routes ACP tool calls to FsEngine.
/// When allow_file_access is false (temp/general assistant mode), rejects file operations.
struct AgentToolHandler {
    fs_engine: FsEngine,
    allow_file_access: bool,
    session_root: PathBuf,
}

#[async_trait]
impl AcpToolHandler for AgentToolHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
        let path_buf = PathBuf::from(path);
        if path_buf.is_absolute() {
            path_buf
        } else {
            session_cwd.join(path)
        }
    }

    async fn read_text_file(&self, path: &Path) -> std::result::Result<String, String> {
        if !self.allow_file_access {
            return Err(
                "File access disabled. Open a workspace to grant the Agent access to project files.".to_string(),
            );
        }
        if !path_within_root(path, &self.session_root) {
            return Err("File access outside the active workspace is disabled.".to_string());
        }
        self.fs_engine
            .read_file(path)
            .map(|(content, _, _)| content)
            .map_err(|e| e.to_string())
    }

    async fn write_text_file(&self, path: &Path, content: &str) -> std::result::Result<(), String> {
        if !self.allow_file_access {
            return Err(
                "File access disabled. Open a workspace to grant the Agent access to project files.".to_string(),
            );
        }
        if !path_or_existing_parent_within_root(path, &self.session_root) {
            return Err("File access outside the active workspace is disabled.".to_string());
        }
        self.fs_engine
            .write_file(path, content)
            .map_err(|e| e.to_string())
    }
}

/// Stored parameters for a session that hasn't been ACP-connected yet.
#[derive(Clone)]
pub struct LazySessionSpec {
    pub runtime_session_id: String,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub registry_id: String,
    pub launch_spec: agent::AgentLaunchSpec,
    pub cwd: PathBuf,
    pub allow_file_access: bool,
    pub env_overrides: Option<std::collections::HashMap<String, String>>,
    pub resume_session_id: Option<String>,
    pub auth_method_id: Option<String>,
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

pub struct ResumeNativeSessionSpec {
    pub registry_id: String,
    pub acp_session_id: String,
    pub cwd: Option<PathBuf>,
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub auth_method_id: Option<String>,
}

#[derive(Clone)]
struct ActiveAgentSession {
    workspace_id: Option<String>,
    control: AcpSessionControl,
}

/// Manages active Agent chat sessions
pub struct AgentSessionService {
    agent_service: Arc<crate::service::agent::AgentService>,
    sessions: RwLock<HashMap<String, ActiveAgentSession>>,
    pending_sessions: RwLock<HashMap<String, LazySessionSpec>>,
    session_config_snapshots_lock: Mutex<()>,
}

impl AgentSessionService {
    pub fn new(agent_service: Arc<crate::service::agent::AgentService>) -> Self {
        Self {
            agent_service,
            sessions: RwLock::new(HashMap::new()),
            pending_sessions: RwLock::new(HashMap::new()),
            session_config_snapshots_lock: Mutex::new(()),
        }
    }

    /// Resolve launch spec, env overrides, and default config for a registry/custom agent.
    async fn resolve_agent_launch(
        &self,
        registry_id: &str,
    ) -> Result<(
        agent::AgentLaunchSpec,
        Option<HashMap<String, String>>,
        Option<HashMap<String, String>>,
    )> {
        let launch_spec = self
            .agent_service
            .get_registry_agent_launch_spec(registry_id)
            .await
            .or_else(|_| self.agent_service.get_custom_agent_launch_spec(registry_id))?;

        let env_overrides = self
            .agent_service
            .get_registry_agent_env_overrides(registry_id);
        let default_config = self.agent_service.get_agent_default_config(registry_id);

        Ok((launch_spec, env_overrides, default_config))
    }

    fn allow_file_access(workspace_id: Option<&str>, project_id: Option<&str>) -> bool {
        workspace_id.is_some() || project_id.is_some()
    }

    /// Create a session stub that returns immediately. The actual ACP connection
    /// is deferred to `connect_session()` (called from the WebSocket handler).
    pub async fn create_session_lazy(
        &self,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        registry_id: &str,
        cwd: PathBuf,
        auth_method_id: Option<String>,
    ) -> Result<LazyAgentSession> {
        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(registry_id).await?;

        let runtime_session_id = uuid::Uuid::new_v4().to_string();
        let allow_file_access = Self::allow_file_access(workspace_id, project_id);
        let cwd_str = cwd.to_string_lossy().to_string();

        let spec = LazySessionSpec {
            runtime_session_id: runtime_session_id.clone(),
            workspace_id: workspace_id.map(str::to_string),
            project_id: project_id.map(str::to_string),
            registry_id: registry_id.to_string(),
            launch_spec,
            cwd,
            allow_file_access,
            env_overrides,
            resume_session_id: None,
            auth_method_id,
            default_config,
        };
        self.pending_sessions
            .write()
            .await
            .insert(runtime_session_id.clone(), spec);

        info!(
            "Created lazy Agent session {} (pending ACP connect)",
            runtime_session_id
        );
        Ok(LazyAgentSession {
            runtime_session_id,
            registry_id: registry_id.to_string(),
            cwd: cwd_str,
            status: "pending".to_string(),
        })
    }

    /// Prepare a runtime-only ACP native resume. The persisted Atmos session table
    /// is intentionally not consulted; the agent owns the session id and metadata.
    pub async fn resume_native_session_lazy(
        &self,
        request: ResumeNativeSessionSpec,
    ) -> Result<LazyAgentSession> {
        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(&request.registry_id).await?;
        let cwd = request.cwd.unwrap_or_else(|| {
            std::env::var("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| std::env::temp_dir())
        });
        let cwd_str = cwd.to_string_lossy().to_string();
        let runtime_session_id = uuid::Uuid::new_v4().to_string();
        let allow_file_access = Self::allow_file_access(
            request.workspace_id.as_deref(),
            request.project_id.as_deref(),
        );

        let spec = LazySessionSpec {
            runtime_session_id: runtime_session_id.clone(),
            workspace_id: request.workspace_id,
            project_id: request.project_id,
            registry_id: request.registry_id.clone(),
            launch_spec,
            cwd,
            allow_file_access,
            env_overrides,
            resume_session_id: Some(request.acp_session_id.clone()),
            auth_method_id: request.auth_method_id,
            default_config,
        };
        self.pending_sessions
            .write()
            .await
            .insert(runtime_session_id.clone(), spec);

        info!(
            "Created lazy native ACP resume {} for agent session {}",
            runtime_session_id, request.acp_session_id
        );
        Ok(LazyAgentSession {
            runtime_session_id,
            registry_id: request.registry_id,
            cwd: cwd_str,
            status: "pending".to_string(),
        })
    }

    pub async fn list_native_sessions(
        &self,
        registry_id: &str,
        cwd: Option<PathBuf>,
        cursor: Option<String>,
        auth_method_id: Option<String>,
    ) -> Result<NativeAgentSessionList> {
        let (launch_spec, env_overrides, _) = self.resolve_agent_launch(registry_id).await?;
        let requested_cwd = cwd.clone();
        let mut native = list_acp_sessions(launch_spec, cwd, cursor, env_overrides, auth_method_id)
            .await
            .map_err(crate::ServiceError::Processing)?;

        if let Some(filter_cwd) = requested_cwd.as_deref() {
            filter_native_sessions_by_cwd(&mut native, filter_cwd);
        }

        Ok(native)
    }

    pub async fn logout_agent(
        &self,
        registry_id: &str,
        cwd: Option<PathBuf>,
        auth_method_id: Option<String>,
    ) -> Result<AgentLogoutResult> {
        let (launch_spec, env_overrides, _) = self.resolve_agent_launch(registry_id).await?;
        logout_acp_agent(launch_spec, cwd, env_overrides, auth_method_id)
            .await
            .map_err(crate::ServiceError::Processing)
    }

    /// Take a pending session spec (removes from pending map).
    pub async fn take_pending_session(&self, session_id: &str) -> Option<LazySessionSpec> {
        self.pending_sessions.write().await.remove(session_id)
    }

    /// Actually connect an ACP session from a LazySessionSpec.
    /// Called from the WebSocket handler so phases can be reported in real-time.
    pub async fn connect_session(
        &self,
        spec: LazySessionSpec,
    ) -> std::result::Result<AcpSessionHandle, String> {
        let runtime_session_id = spec.runtime_session_id.clone();
        let workspace_id = spec.workspace_id.clone();
        let session_config_snapshot = match spec.resume_session_id.as_deref() {
            Some(acp_session_id) => {
                self.session_config_snapshot(&spec.registry_id, acp_session_id)
                    .await
            }
            None => None,
        };
        let handler: Arc<dyn AcpToolHandler> = Arc::new(AgentToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access: spec.allow_file_access,
            session_root: spec.cwd.clone(),
        });

        let handle = run_acp_session(
            spec.runtime_session_id.clone(),
            spec.launch_spec,
            spec.cwd,
            handler,
            spec.env_overrides,
            spec.resume_session_id,
            spec.auth_method_id,
            spec.default_config,
            session_config_snapshot,
        )
        .await?;
        self.sessions.write().await.insert(
            runtime_session_id.clone(),
            ActiveAgentSession {
                workspace_id,
                control: handle.control(),
            },
        );

        info!(
            "ACP connected for runtime session {} (agent: {}, acp: {})",
            spec.runtime_session_id, spec.registry_id, handle.session_id
        );

        Ok(handle)
    }

    /// Return the latest Atmos-observed config values for a native ACP session.
    pub async fn session_config_snapshot(
        &self,
        registry_id: &str,
        acp_session_id: &str,
    ) -> Option<HashMap<String, String>> {
        let _guard = self.session_config_snapshots_lock.lock().await;
        let store = match read_session_config_snapshot_store().await {
            Ok(store) => store,
            Err(error) => {
                warn!("Failed to read ACP session config snapshots: {}", error);
                return None;
            }
        };
        store
            .sessions
            .get(&session_config_snapshot_key(registry_id, acp_session_id))
            .map(|snapshot| snapshot.config.clone())
            .filter(|config| !config.is_empty())
    }

    /// Merge current config values observed from ACP into the local session snapshot.
    pub async fn remember_session_config_snapshot(
        &self,
        registry_id: &str,
        acp_session_id: &str,
        cwd: Option<&str>,
        updates: HashMap<String, Option<String>>,
    ) -> Result<()> {
        if updates.is_empty() {
            return Ok(());
        }

        let _guard = self.session_config_snapshots_lock.lock().await;
        let mut store = read_session_config_snapshot_store().await?;
        let key = session_config_snapshot_key(registry_id, acp_session_id);
        let snapshot = store
            .sessions
            .entry(key)
            .or_insert_with(|| SessionConfigSnapshot {
                registry_id: registry_id.to_string(),
                acp_session_id: acp_session_id.to_string(),
                cwd: cwd.map(str::to_string),
                config: HashMap::new(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            });

        snapshot.registry_id = registry_id.to_string();
        snapshot.acp_session_id = acp_session_id.to_string();
        if let Some(cwd) = cwd {
            snapshot.cwd = Some(cwd.to_string());
        }
        for (config_id, value) in updates {
            match value {
                Some(value) => {
                    snapshot.config.insert(config_id, value);
                }
                None => {
                    snapshot.config.remove(&config_id);
                }
            }
        }
        snapshot.updated_at = chrono::Utc::now().to_rfc3339();

        write_session_config_snapshot_store(&store).await
    }

    /// Drop runtime state when a WebSocket disconnects.
    pub async fn mark_session_closed(&self, session_id: &str) {
        self.sessions.write().await.remove(session_id);
        self.pending_sessions.write().await.remove(session_id);
    }

    /// ACP sessions are runtime-only; workspace archive no longer queries a
    /// local session catalog.
    pub async fn close_workspace_sessions(&self, workspace_guid: &str) -> usize {
        let mut active_sessions = self.sessions.write().await;
        let active_ids: Vec<String> = active_sessions
            .iter()
            .filter_map(|(session_id, session)| {
                if session.workspace_id.as_deref() == Some(workspace_guid) {
                    Some(session_id.clone())
                } else {
                    None
                }
            })
            .collect();

        let mut closed = 0;
        for session_id in active_ids {
            if let Some(session) = active_sessions.remove(&session_id) {
                session.control.send_close();
                closed += 1;
            }
        }
        drop(active_sessions);

        let mut pending_sessions = self.pending_sessions.write().await;
        let pending_before = pending_sessions.len();
        pending_sessions.retain(|_, spec| spec.workspace_id.as_deref() != Some(workspace_guid));
        let removed_pending = pending_before.saturating_sub(pending_sessions.len());

        info!(
            "Workspace {} archived; requested ACP close for {} active sessions and removed {} pending sessions",
            workspace_guid, closed, removed_pending
        );
        closed + removed_pending
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
struct SessionConfigSnapshotStore {
    #[serde(default)]
    sessions: HashMap<String, SessionConfigSnapshot>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SessionConfigSnapshot {
    registry_id: String,
    acp_session_id: String,
    cwd: Option<String>,
    #[serde(default)]
    config: HashMap<String, String>,
    updated_at: String,
}

fn session_config_snapshot_key(registry_id: &str, acp_session_id: &str) -> String {
    format!("{}::{}", registry_id, acp_session_id)
}

fn session_config_snapshot_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| ServiceError::Processing("Unable to resolve home directory".to_string()))?;
    Ok(home
        .join(".atmos")
        .join("data")
        .join("agent")
        .join("session_config_snapshots.json"))
}

async fn read_session_config_snapshot_store() -> Result<SessionConfigSnapshotStore> {
    let path = session_config_snapshot_path()?;
    let exists = tokio::fs::try_exists(&path).await.map_err(|error| {
        ServiceError::Processing(format!(
            "Failed to stat ACP session config snapshots at {}: {}",
            path.display(),
            error
        ))
    })?;
    if !exists {
        return Ok(SessionConfigSnapshotStore::default());
    }
    let text = tokio::fs::read_to_string(&path).await.map_err(|error| {
        ServiceError::Processing(format!(
            "Failed to read ACP session config snapshots at {}: {}",
            path.display(),
            error
        ))
    })?;
    serde_json::from_str(&text).map_err(|error| {
        ServiceError::Processing(format!(
            "Failed to parse ACP session config snapshots at {}: {}",
            path.display(),
            error
        ))
    })
}

async fn write_session_config_snapshot_store(store: &SessionConfigSnapshotStore) -> Result<()> {
    let path = session_config_snapshot_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|error| {
            ServiceError::Processing(format!(
                "Failed to create ACP session config snapshot directory {}: {}",
                parent.display(),
                error
            ))
        })?;
    }
    infra::utils::review_artifacts::write_json_atomic(&path, store).await?;
    set_owner_only_file_permissions(&path).await
}

#[cfg(unix)]
async fn set_owner_only_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .await
        .map_err(|error| {
            ServiceError::Processing(format!(
                "Failed to restrict ACP session config snapshots at {}: {}",
                path.display(),
                error
            ))
        })
}

#[cfg(not(unix))]
async fn set_owner_only_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

fn filter_native_sessions_by_cwd(native: &mut NativeAgentSessionList, filter_cwd: &Path) {
    native
        .sessions
        .retain(|session| session_cwd_matches_filter(Path::new(&session.cwd), filter_cwd));
}

fn session_cwd_matches_filter(session_cwd: &Path, filter_cwd: &Path) -> bool {
    if session_cwd.as_os_str().is_empty() || filter_cwd.as_os_str().is_empty() {
        return false;
    }

    let session_path = comparable_history_path(session_cwd);
    let filter_path = comparable_history_path(filter_cwd);
    session_path == filter_path || session_path.starts_with(filter_path)
}

fn comparable_history_path(path: &Path) -> PathBuf {
    path.canonicalize()
        .unwrap_or_else(|_| normalize_history_path(path))
}

fn normalize_history_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            std::path::Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            std::path::Component::RootDir => normalized.push(component.as_os_str()),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::Normal(segment) => normalized.push(segment),
        }
    }

    normalized
}

#[cfg(test)]
mod tests {
    use super::{
        session_config_snapshot_key, session_cwd_matches_filter, AgentSessionService,
        SessionConfigSnapshot, SessionConfigSnapshotStore,
    };
    use std::collections::HashMap;
    use std::path::Path;

    #[test]
    fn file_access_enabled_for_workspace_context() {
        assert!(AgentSessionService::allow_file_access(Some("ws-1"), None));
    }

    #[test]
    fn file_access_enabled_for_project_context() {
        assert!(AgentSessionService::allow_file_access(None, Some("pj-1")));
    }

    #[test]
    fn file_access_disabled_for_temp_context() {
        assert!(!AgentSessionService::allow_file_access(None, None));
    }

    #[test]
    fn session_config_snapshot_key_is_scoped_by_agent() {
        assert_ne!(
            session_config_snapshot_key("codex-acp", "session-1"),
            session_config_snapshot_key("opencode", "session-1")
        );
    }

    #[test]
    fn session_config_snapshot_store_round_trips_current_values() {
        let mut config = HashMap::new();
        config.insert("model".to_string(), "gpt-5.4".to_string());
        config.insert("reasoning_effort".to_string(), "high".to_string());

        let mut store = SessionConfigSnapshotStore::default();
        store.sessions.insert(
            session_config_snapshot_key("codex-acp", "session-1"),
            SessionConfigSnapshot {
                registry_id: "codex-acp".to_string(),
                acp_session_id: "session-1".to_string(),
                cwd: Some("/tmp/project".to_string()),
                config,
                updated_at: "2026-06-27T00:00:00Z".to_string(),
            },
        );

        let encoded = serde_json::to_string(&store).expect("encode snapshot store");
        let decoded: SessionConfigSnapshotStore =
            serde_json::from_str(&encoded).expect("decode snapshot store");
        let snapshot = decoded
            .sessions
            .get(&session_config_snapshot_key("codex-acp", "session-1"))
            .expect("snapshot exists");

        assert_eq!(
            snapshot.config.get("model").map(String::as_str),
            Some("gpt-5.4")
        );
        assert_eq!(
            snapshot.config.get("reasoning_effort").map(String::as_str),
            Some("high")
        );
    }

    #[test]
    fn session_cwd_filter_matches_exact_project_path() {
        assert!(session_cwd_matches_filter(
            Path::new("/Users/example/project"),
            Path::new("/Users/example/project")
        ));
    }

    #[test]
    fn session_cwd_filter_matches_project_child_path() {
        assert!(session_cwd_matches_filter(
            Path::new("/Users/example/project/apps/web"),
            Path::new("/Users/example/project")
        ));
    }

    #[test]
    fn session_cwd_filter_rejects_sibling_workspace_clone() {
        assert!(!session_cwd_matches_filter(
            Path::new("/Users/example/.atmos/workspaces/atmos/pinsir"),
            Path::new("/Users/example/own_space/OpenSource/atmos")
        ));
    }

    #[test]
    fn session_cwd_filter_rejects_prefix_collision() {
        assert!(!session_cwd_matches_filter(
            Path::new("/Users/example/project-other"),
            Path::new("/Users/example/project")
        ));
    }

    #[test]
    fn session_cwd_filter_normalizes_nonexistent_child_path() {
        assert!(session_cwd_matches_filter(
            Path::new("/Users/example/project/new/../apps/web"),
            Path::new("/Users/example/project")
        ));
    }
}
