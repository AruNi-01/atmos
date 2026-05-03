//! Agent session management - creates and manages ACP chat sessions.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use agent::{run_acp_session, AcpSessionHandle, AcpToolHandler};
use async_trait::async_trait;
use core_engine::FsEngine;
use infra::db::repo::AgentChatSessionRepo;
use infra::DatabaseConnection;
use serde::Serialize;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::Result;
use crate::service::session_title::{SessionTitleGenerationContext, SessionTitleGenerator};

/// DTO for session list - decouples API from infra entity
#[derive(Debug, Serialize)]
pub struct AgentSessionSummary {
    pub guid: String,
    pub title: Option<String>,
    pub title_source: Option<String>,
    pub context_type: String,
    pub context_guid: Option<String>,
    pub registry_id: String,
    pub status: String,
    pub mode: String,
    pub cwd: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Tool handler that routes ACP tool calls to FsEngine.
/// When allow_file_access is false (general assistant mode, no workspace), rejects file operations.
struct AgentToolHandler {
    fs_engine: FsEngine,
    allow_file_access: bool,
}

#[async_trait]
impl AcpToolHandler for AgentToolHandler {
    fn resolve_path(&self, session_cwd: &Path, path: &str) -> PathBuf {
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

    async fn read_text_file(&self, path: &Path) -> std::result::Result<String, String> {
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

    async fn write_text_file(&self, path: &Path, content: &str) -> std::result::Result<(), String> {
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

/// Stored parameters for a session that hasn't been ACP-connected yet.
#[derive(Clone)]
pub struct LazySessionSpec {
    pub session_id: String,
    pub launch_spec: agent::AgentLaunchSpec,
    pub cwd: PathBuf,
    pub allow_file_access: bool,
    pub env_overrides: Option<std::collections::HashMap<String, String>>,
    pub resume_session_id: Option<String>,
    pub auth_method_id: Option<String>,
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

/// Manages active Agent chat sessions
pub struct AgentSessionService {
    agent_service: Arc<crate::service::agent::AgentService>,
    db: Arc<DatabaseConnection>,
    sessions: RwLock<HashMap<String, AcpSessionHandle>>,
    pending_sessions: RwLock<HashMap<String, LazySessionSpec>>,
    pending_permissions: RwLock<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

impl AgentSessionService {
    pub fn new(
        agent_service: Arc<crate::service::agent::AgentService>,
        db: Arc<DatabaseConnection>,
    ) -> Self {
        Self {
            agent_service,
            db,
            sessions: RwLock::new(HashMap::new()),
            pending_sessions: RwLock::new(HashMap::new()),
            pending_permissions: RwLock::new(HashMap::new()),
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

    fn resolve_context(
        workspace_id: Option<&str>,
        project_id: Option<&str>,
    ) -> (&'static str, Option<String>) {
        if workspace_id.is_some() {
            ("workspace", workspace_id.map(String::from))
        } else if project_id.is_some() {
            ("project", project_id.map(String::from))
        } else {
            ("temp", None)
        }
    }

    async fn persist_new_session(
        &self,
        session_id: &str,
        context_type: &str,
        context_guid: Option<&str>,
        registry_id: &str,
        cwd_str: &str,
        allow_file_access: bool,
        mode: &str,
    ) {
        let repo = AgentChatSessionRepo::new(&self.db);
        if let Err(e) = repo
            .create(
                session_id,
                context_type,
                context_guid,
                registry_id,
                cwd_str,
                allow_file_access,
                mode,
            )
            .await
        {
            tracing::warn!("Failed to persist agent session {}: {}", session_id, e);
        }
    }

    /// Create a new Agent session. Returns session_id for WebSocket connection.
    pub async fn create_session(
        &self,
        workspace_id: Option<&str>,
        project_id: Option<&str>,
        registry_id: &str,
        cwd: PathBuf,
        auth_method_id: Option<String>,
        mode: &str,
    ) -> Result<String> {
        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(registry_id).await?;

        let session_id_hint = uuid::Uuid::new_v4().to_string();
        let allow_file_access = workspace_id.is_some();
        let handler: Arc<dyn AcpToolHandler> = Arc::new(AgentToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access,
        });

        let cwd_str = cwd.to_string_lossy().to_string();
        let handle = run_acp_session(
            session_id_hint,
            launch_spec,
            cwd,
            handler,
            env_overrides,
            None,
            auth_method_id,
            default_config,
        )
        .await
        .map_err(crate::ServiceError::Processing)?;
        let session_id = handle.session_id.clone();

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), handle);

        let (context_type, context_guid) = Self::resolve_context(workspace_id, project_id);
        self.persist_new_session(
            &session_id,
            context_type,
            context_guid.as_deref(),
            registry_id,
            &cwd_str,
            allow_file_access,
            mode,
        )
        .await;

        info!(
            "Created Agent session {} (workspace: {}, file_access: {})",
            session_id,
            workspace_id.unwrap_or("none"),
            allow_file_access
        );
        Ok(session_id)
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
        mode: &str,
    ) -> Result<String> {
        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(registry_id).await?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let allow_file_access = workspace_id.is_some();
        let cwd_str = cwd.to_string_lossy().to_string();

        let spec = LazySessionSpec {
            session_id: session_id.clone(),
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
            .insert(session_id.clone(), spec);

        let (context_type, context_guid) = Self::resolve_context(workspace_id, project_id);
        self.persist_new_session(
            &session_id,
            context_type,
            context_guid.as_deref(),
            registry_id,
            &cwd_str,
            allow_file_access,
            mode,
        )
        .await;

        info!(
            "Created lazy Agent session {} (pending ACP connect)",
            session_id
        );
        Ok(session_id)
    }

    /// Prepare a lazy resume spec. Returns immediately.
    pub async fn resume_session_lazy(
        &self,
        session_id: &str,
        mode: Option<&str>,
    ) -> Result<(String, String)> {
        let repo = AgentChatSessionRepo::new(&self.db);
        let model = repo
            .find_by_guid(session_id)
            .await
            .map_err(crate::ServiceError::Infra)?
            .ok_or_else(|| {
                tracing::error!(
                    "resume_session_lazy failed: session {} not found in DB",
                    session_id
                );
                crate::ServiceError::NotFound(format!("Session {} not found", session_id))
            })?;
        if let Some(target_mode) = mode {
            if model.mode != target_mode {
                return Err(crate::ServiceError::NotFound(format!(
                    "Session {} not found",
                    session_id
                )));
            }
        }

        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(&model.registry_id).await?;

        let spec = LazySessionSpec {
            session_id: model.guid.clone(),
            launch_spec,
            cwd: PathBuf::from(model.cwd.clone()),
            allow_file_access: model.allow_file_access,
            env_overrides,
            resume_session_id: Some(
                model
                    .acp_session_id
                    .clone()
                    .unwrap_or_else(|| model.guid.clone()),
            ),
            auth_method_id: None,
            default_config,
        };
        self.pending_sessions
            .write()
            .await
            .insert(model.guid.clone(), spec);

        info!(
            "Created lazy resume for session {} (pending ACP connect)",
            model.guid
        );
        Ok((model.guid.clone(), model.cwd))
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
        let handler: Arc<dyn AcpToolHandler> = Arc::new(AgentToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access: spec.allow_file_access,
        });

        let handle = run_acp_session(
            spec.session_id.clone(),
            spec.launch_spec,
            spec.cwd,
            handler,
            spec.env_overrides,
            spec.resume_session_id,
            spec.auth_method_id,
            spec.default_config,
        )
        .await?;

        let runtime_id = handle.session_id.clone();
        info!(
            "ACP connected for session {} (runtime: {})",
            spec.session_id, runtime_id
        );

        let repo = AgentChatSessionRepo::new(&self.db);
        let _ = repo.mark_active(&spec.session_id).await;
        let _ = repo.set_acp_session_id(&spec.session_id, &runtime_id).await;

        Ok(handle)
    }

    /// Re-create a runtime for an existing persisted session.
    /// Returns cwd for client display and upload base path.
    pub async fn resume_session(&self, session_id: &str) -> Result<(String, String)> {
        let repo = AgentChatSessionRepo::new(&self.db);
        let model = repo
            .find_by_guid(session_id)
            .await
            .map_err(crate::ServiceError::Infra)?
            .ok_or_else(|| {
                crate::ServiceError::NotFound(format!("Session {} not found", session_id))
            })?;

        let (launch_spec, env_overrides, default_config) =
            self.resolve_agent_launch(&model.registry_id).await?;

        let handler: Arc<dyn AcpToolHandler> = Arc::new(AgentToolHandler {
            fs_engine: FsEngine::new(),
            allow_file_access: model.allow_file_access,
        });
        let cwd = PathBuf::from(model.cwd.clone());
        let handle = run_acp_session(
            model.guid.clone(),
            launch_spec,
            cwd,
            handler,
            env_overrides,
            Some(
                model
                    .acp_session_id
                    .clone()
                    .unwrap_or_else(|| model.guid.clone()),
            ),
            None,
            default_config,
        )
        .await
        .map_err(crate::ServiceError::Processing)?;
        let runtime_session_id = handle.session_id.clone();
        self.sessions
            .write()
            .await
            .insert(runtime_session_id.clone(), handle);

        if runtime_session_id != model.guid {
            tracing::warn!(
                "Resume fallback created new ACP session id {}, requested {}",
                runtime_session_id,
                model.guid
            );
        }
        if let Err(e) = repo.mark_active(&model.guid).await {
            tracing::warn!(
                "Failed to mark resumed session {} active: {}",
                model.guid,
                e
            );
        }
        if let Err(e) = repo
            .set_acp_session_id(&model.guid, &runtime_session_id)
            .await
        {
            tracing::warn!(
                "Failed to persist ACP session id {} for {}: {}",
                runtime_session_id,
                model.guid,
                e
            );
        }

        info!(
            "Resumed Agent session {} (requested {})",
            runtime_session_id, model.guid
        );
        Ok((runtime_session_id, model.cwd))
    }

    /// Get session handle (removes from map - caller owns it for the WebSocket lifetime)
    pub async fn take_session(&self, session_id: &str) -> Option<AcpSessionHandle> {
        self.sessions.write().await.remove(session_id)
    }

    /// Send prompt to session
    pub async fn send_prompt(&self, session_id: &str, message: String) -> Result<()> {
        let sessions = self.sessions.read().await;
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
    pub async fn store_pending_permission(
        &self,
        request_id: String,
        tx: tokio::sync::oneshot::Sender<bool>,
    ) {
        self.pending_permissions
            .write()
            .await
            .insert(request_id, tx);
    }

    /// Generate and persist an automatic title for the first user prompt.
    /// Returns the stored title when the session was updated, or None when skipped.
    pub async fn auto_set_title_from_prompt(
        &self,
        session_id: &str,
        first_message: &str,
    ) -> Option<String> {
        let session_repo = AgentChatSessionRepo::new(&self.db);
        match session_repo.can_auto_set_title(session_id).await {
            Ok(true) => {}
            Ok(false) => return None,
            Err(error) => {
                warn!(
                    "Failed to check auto-title eligibility for session {}: {}",
                    session_id, error
                );
                return None;
            }
        }

        let model = match session_repo.find_by_guid(session_id).await {
            Ok(Some(model)) => model,
            Ok(None) => return None,
            Err(error) => {
                warn!(
                    "Failed to load session {} before auto-title generation: {}",
                    session_id, error
                );
                return None;
            }
        };
        let agent_name = self.resolve_agent_display_name(&model.registry_id).await;
        let generator = SessionTitleGenerator::new();
        let title = generator
            .generate(
                first_message,
                &SessionTitleGenerationContext {
                    cwd: &model.cwd,
                    mode: &model.mode,
                    context_type: &model.context_type,
                    agent_name: agent_name.as_deref(),
                },
            )
            .await;

        match session_repo.can_auto_set_title(session_id).await {
            Ok(true) => {}
            Ok(false) => return None,
            Err(error) => {
                warn!(
                    "Failed to re-check auto-title eligibility for session {}: {}",
                    session_id, error
                );
                return None;
            }
        }

        if let Err(error) = session_repo.update_title(session_id, &title, "auto").await {
            warn!(
                "Failed to auto-set title for session {}: {}",
                session_id, error
            );
            None
        } else {
            tracing::info!("Auto-set title for session {}: {}", session_id, title);
            Some(title)
        }
    }

    async fn resolve_agent_display_name(&self, registry_id: &str) -> Option<String> {
        if let Ok(custom_agents) = self.agent_service.list_custom_agents() {
            if let Some(agent) = custom_agents
                .into_iter()
                .find(|agent| agent.name == registry_id)
            {
                return Some(agent.name);
            }
        }

        if let Ok(registry_agents) = self.agent_service.list_registry_agents(false).await {
            if let Some(agent) = registry_agents
                .into_iter()
                .find(|agent| agent.id == registry_id)
            {
                return Some(agent.name);
            }
        }

        None
    }

    /// Get one session summary by id.
    pub async fn get_session(&self, session_id: &str) -> Result<Option<AgentSessionSummary>> {
        let repo = AgentChatSessionRepo::new(&self.db);
        let model = repo
            .find_by_guid(session_id)
            .await
            .map_err(crate::ServiceError::Infra)?;
        Ok(model.map(|m| AgentSessionSummary {
            guid: m.guid,
            title: m.title,
            title_source: m.title_source,
            context_type: m.context_type,
            context_guid: m.context_guid,
            registry_id: m.registry_id,
            status: m.status,
            mode: m.mode,
            cwd: m.cwd,
            created_at: m.created_at.to_string(),
            updated_at: m.updated_at.to_string(),
        }))
    }

    /// List sessions with cursor pagination and additional filters
    #[allow(clippy::too_many_arguments)]
    pub async fn list_sessions_with_filters(
        &self,
        context_type: Option<&str>,
        context_guid: Option<&str>,
        registry_id: Option<&str>,
        status: Option<&str>,
        mode: Option<&str>,
        limit: u64,
        cursor: Option<&str>,
    ) -> Result<(Vec<AgentSessionSummary>, Option<String>, bool)> {
        let repo = AgentChatSessionRepo::new(&self.db);
        let (items, next_cursor, has_more) = repo
            .list_with_cursor_and_filters(
                context_type,
                context_guid,
                registry_id,
                status,
                mode,
                limit,
                cursor,
            )
            .await
            .map_err(crate::ServiceError::Infra)?;
        let summaries: Vec<AgentSessionSummary> = items
            .into_iter()
            .map(|m| AgentSessionSummary {
                guid: m.guid,
                title: m.title,
                title_source: m.title_source,
                context_type: m.context_type,
                context_guid: m.context_guid,
                registry_id: m.registry_id,
                status: m.status,
                mode: m.mode,
                cwd: m.cwd,
                created_at: m.created_at.to_string(),
                updated_at: m.updated_at.to_string(),
            })
            .collect();
        Ok((summaries, next_cursor, has_more))
    }

    /// List sessions with cursor pagination (backward compatible)
    pub async fn list_sessions(
        &self,
        context_type: Option<&str>,
        context_guid: Option<&str>,
        mode: Option<&str>,
        limit: u64,
        cursor: Option<&str>,
    ) -> Result<(Vec<AgentSessionSummary>, Option<String>, bool)> {
        self.list_sessions_with_filters(context_type, context_guid, None, None, mode, limit, cursor)
            .await
    }

    /// Update session title (user-edited)
    pub async fn update_session_title(&self, session_id: &str, title: &str) -> Result<()> {
        let repo = AgentChatSessionRepo::new(&self.db);
        repo.update_title(session_id, title, "user")
            .await
            .map_err(crate::ServiceError::Infra)
    }

    /// Mark session as closed in DB (call when WebSocket disconnects)
    pub async fn mark_session_closed(&self, session_id: &str) {
        let repo = AgentChatSessionRepo::new(&self.db);
        if let Err(e) = repo.mark_closed(session_id).await {
            tracing::warn!("Failed to mark agent session {} closed: {}", session_id, e);
        }
    }

    /// Close all active ACP sessions belonging to a workspace.
    ///
    /// For every active session in DB with `context_type = "workspace"` and the
    /// given `context_guid`, this:
    ///   * removes any in-memory `AcpSessionHandle` (dropping it triggers
    ///     `kill_on_drop` on the agent child process),
    ///   * drops any pending lazy-session spec,
    ///   * marks the session as closed in DB.
    ///
    /// Sessions whose handle is currently held by an attached WebSocket bridge
    /// cannot be force-killed from here; they will be marked closed in DB and
    /// the running process will be cleaned up when the WS disconnects.
    pub async fn close_workspace_sessions(&self, workspace_guid: &str) -> usize {
        let repo = AgentChatSessionRepo::new(&self.db);
        let active = match repo.list_active_by_context("workspace", workspace_guid).await {
            Ok(rows) => rows,
            Err(e) => {
                warn!(
                    "Failed to list active agent sessions for workspace {}: {}",
                    workspace_guid, e
                );
                return 0;
            }
        };

        if active.is_empty() {
            return 0;
        }

        let mut sessions = self.sessions.write().await;
        let mut pending = self.pending_sessions.write().await;
        for m in &active {
            sessions.remove(&m.guid);
            pending.remove(&m.guid);
        }
        drop(sessions);
        drop(pending);

        let mut closed = 0usize;
        for m in &active {
            if let Err(e) = repo.mark_closed(&m.guid).await {
                warn!("Failed to mark agent session {} closed: {}", m.guid, e);
            } else {
                closed += 1;
            }
        }

        info!(
            "Closed {} ACP session(s) for archived workspace {}",
            closed, workspace_guid
        );
        closed
    }

    /// Respond to a permission request
    pub async fn respond_permission(
        &self,
        request_id: &str,
        allowed: bool,
        _remember_for_session: bool,
    ) -> Result<()> {
        let mut pending = self.pending_permissions.write().await;
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

    /// Soft delete a session by guid, returns the session's cwd if it was a temp session
    pub async fn delete_session(&self, session_id: &str) -> Result<Option<String>> {
        let repo = AgentChatSessionRepo::new(&self.db);

        // Get session first to check if it's a temp session
        let model = repo.find_by_guid(session_id).await?;

        if let Some(m) = model {
            let is_temp = m.context_type == "temp";
            let cwd = if is_temp { Some(m.cwd.clone()) } else { None };

            // If temp session, delete the temp directory
            if is_temp {
                let temp_path = std::path::PathBuf::from(&m.cwd);
                if temp_path.exists() {
                    if let Err(e) = std::fs::remove_dir_all(&temp_path) {
                        tracing::warn!(
                            "Failed to delete temp session directory {}: {}",
                            temp_path.display(),
                            e
                        );
                    } else {
                        info!("Deleted temp session directory: {}", temp_path.display());
                    }
                }
            }

            // Soft delete the session
            repo.soft_delete(session_id).await?;

            info!(
                "Soft deleted agent session {} (temp: {})",
                session_id, is_temp
            );
            Ok(cwd)
        } else {
            Err(crate::ServiceError::NotFound(format!(
                "Session {} not found",
                session_id
            )))
        }
    }
}
