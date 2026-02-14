//! Agent session management - creates and manages ACP chat sessions.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use agent::{run_acp_session, AcpSessionHandle, AcpToolHandler};
use async_trait::async_trait;
use core_engine::FsEngine;
use parking_lot::RwLock;
use tracing::info;

use crate::error::Result;

/// Tool handler that routes ACP tool calls to FsEngine.
/// When allow_file_access is false (general assistant mode, no workspace), rejects file operations.
struct AgentToolHandler {
    fs_engine: FsEngine,
    allow_file_access: bool,
}

#[async_trait]
impl AcpToolHandler for AgentToolHandler {
    fn resolve_path(&self, session_cwd: &PathBuf, path: &str) -> PathBuf {
        let path_buf = PathBuf::from(path);
        if path_buf.is_absolute() {
            if path_buf.starts_with(session_cwd) {
                return path_buf;
            }
            path_buf
        } else {
            session_cwd.join(path)
        }
    }

    async fn read_text_file(&self, path: &PathBuf) -> std::result::Result<String, String> {
        if !self.allow_file_access {
            return Err(
                "File access disabled. Open a workspace to grant the Agent access to project files.".to_string(),
            );
        }
        self.fs_engine
            .read_file(path)
            .map(|(content, _)| content)
            .map_err(|e| e.to_string())
    }

    async fn write_text_file(&self, path: &PathBuf, content: &str) -> std::result::Result<(), String> {
        if !self.allow_file_access {
            return Err(
                "File access disabled. Open a workspace to grant the Agent access to project files.".to_string(),
            );
        }
        self.fs_engine
            .write_file(path, content)
            .map_err(|e| e.to_string())
    }
}

/// Manages active Agent chat sessions
pub struct AgentSessionService {
    agent_service: Arc<crate::service::agent::AgentService>,
    sessions: RwLock<HashMap<String, AcpSessionHandle>>,
    pending_permissions: RwLock<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

impl AgentSessionService {
    pub fn new(agent_service: Arc<crate::service::agent::AgentService>) -> Self {
        Self {
            agent_service,
            sessions: RwLock::new(HashMap::new()),
            pending_permissions: RwLock::new(HashMap::new()),
        }
    }

    /// Create a new Agent session. Returns session_id for WebSocket connection.
    /// - workspace_path: When Some(workspace), Agent has file access. When None (general assistant), use temp dir and deny file ops.
    pub async fn create_session(
        &self,
        workspace_id: Option<&str>,
        registry_id: &str,
        cwd: PathBuf,
    ) -> Result<String> {
        let launch_spec = self
            .agent_service
            .get_registry_agent_launch_spec(registry_id)
            .await
            .map_err(|e| crate::ServiceError::Processing(e.to_string()))?;

        let env_overrides = self
            .agent_service
            .get_registry_agent_env_overrides(registry_id);

        let session_id = uuid::Uuid::new_v4().to_string();
        let allow_file_access = workspace_id.is_some();
        let handler: Arc<dyn AcpToolHandler> = Arc::new(AgentToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access,
        });

        let handle = run_acp_session(
            session_id.clone(),
            launch_spec,
            cwd,
            handler,
            env_overrides,
        )
        .map_err(|e| crate::ServiceError::Processing(e))?;

        self.sessions.write().insert(session_id.clone(), handle);
        info!(
            "Created Agent session {} (workspace: {}, file_access: {})",
            session_id,
            workspace_id.unwrap_or("none"),
            allow_file_access
        );
        Ok(session_id)
    }

    /// Get session handle (removes from map - caller owns it for the WebSocket lifetime)
    pub fn take_session(&self, session_id: &str) -> Option<AcpSessionHandle> {
        self.sessions.write().remove(session_id)
    }

    /// Send prompt to session
    pub fn send_prompt(&self, session_id: &str, message: String) -> Result<()> {
        let sessions = self.sessions.read();
        if let Some(handle) = sessions.get(session_id) {
            handle.send_prompt(message);
            Ok(())
        } else {
            Err(crate::ServiceError::NotFound(format!(
                "Session {} not found",
                session_id
            )))
        }
    }

    /// Store a pending permission response sender (called when we receive permission request)
    pub fn store_pending_permission(
        &self,
        request_id: String,
        tx: tokio::sync::oneshot::Sender<bool>,
    ) {
        self.pending_permissions.write().insert(request_id, tx);
    }

    /// Respond to a permission request
    pub fn respond_permission(
        &self,
        request_id: &str,
        allowed: bool,
        _remember_for_session: bool,
    ) -> Result<()> {
        let mut pending = self.pending_permissions.write();
        if let Some(tx) = pending.remove(request_id) {
            let _ = tx.send(allowed);
            Ok(())
        } else {
            Err(crate::ServiceError::NotFound(format!(
                "Permission request {} not found",
                request_id
            )))
        }
    }
}
