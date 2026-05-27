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
use tokio::sync::RwLock;
use tracing::info;

use crate::error::Result;
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
}

impl AgentSessionService {
    pub fn new(agent_service: Arc<crate::service::agent::AgentService>) -> Self {
        Self {
            agent_service,
            sessions: RwLock::new(HashMap::new()),
            pending_sessions: RwLock::new(HashMap::new()),
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
        list_acp_sessions(launch_spec, cwd, cursor, env_overrides, auth_method_id)
            .await
            .map_err(crate::ServiceError::Processing)
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

#[cfg(test)]
mod tests {
    use super::AgentSessionService;

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
}
