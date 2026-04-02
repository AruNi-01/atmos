use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{debug, info, warn};

use infra::{WsEvent, WsManager, WsMessage};

use super::notification::NotificationService;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentHookState {
    Idle,
    Running,
    PermissionRequest,
}

impl std::fmt::Display for AgentHookState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Idle => write!(f, "idle"),
            Self::Running => write!(f, "running"),
            Self::PermissionRequest => write!(f, "permission_request"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentToolType {
    ClaudeCode,
    Codex,
    Opencode,
}

impl std::fmt::Display for AgentToolType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ClaudeCode => write!(f, "claude-code"),
            Self::Codex => write!(f, "codex"),
            Self::Opencode => write!(f, "opencode"),
        }
    }
}

/// Context injected by Atmos tmux environment variables, carried via HTTP headers.
/// `context_id` is the effective context: workspace GUID when inside a workspace,
/// or project GUID when developing on main/local project.
#[derive(Debug, Clone, Default)]
pub struct AtmosContext {
    pub context_id: Option<String>,
    pub pane_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookSession {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentHookState,
    pub timestamp: String,
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookStateUpdate {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentHookState,
    pub timestamp: String,
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
}

pub struct AgentHooksService {
    sessions: RwLock<HashMap<String, AgentHookSession>>,
    ws_manager: RwLock<Option<Arc<WsManager>>>,
    notification_service: RwLock<Option<Arc<NotificationService>>>,
    /// Known project root paths. Kept for diagnostics / future use but
    /// primary filtering is done at the hook level via ATMOS_MANAGED env var.
    known_project_paths: RwLock<HashSet<String>>,
}

impl AgentHooksService {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            ws_manager: RwLock::new(None),
            notification_service: RwLock::new(None),
            known_project_paths: RwLock::new(HashSet::new()),
        }
    }

    pub fn set_ws_manager(&self, manager: Arc<WsManager>) {
        *self.ws_manager.write() = Some(manager);
    }

    pub fn set_notification_service(&self, service: Arc<NotificationService>) {
        *self.notification_service.write() = Some(service);
    }

    /// Replace the set of known project root paths.
    /// Called on startup and whenever projects change.
    pub fn set_known_project_paths(&self, paths: Vec<String>) {
        let mut guard = self.known_project_paths.write();
        guard.clear();
        for p in paths {
            if !p.is_empty() {
                guard.insert(p);
            }
        }
        info!("Agent hooks: known project paths updated ({} entries)", guard.len());
    }


    pub fn get_all_sessions(&self) -> Vec<AgentHookSession> {
        self.sessions.read().values().cloned().collect()
    }

    pub fn remove_session(&self, session_id: &str) {
        self.sessions.write().remove(session_id);
    }

    pub fn clear_idle_sessions(&self) -> Vec<String> {
        let mut sessions = self.sessions.write();
        let idle_ids: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.state == AgentHookState::Idle)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &idle_ids {
            sessions.remove(id);
        }
        idle_ids
    }

    fn update_state(
        &self,
        session_id: &str,
        tool: AgentToolType,
        state: AgentHookState,
        project_path: Option<String>,
        ctx: &AtmosContext,
    ) {
        let timestamp = Utc::now().to_rfc3339();

        let previous_state = {
            let sessions = self.sessions.read();
            sessions.get(session_id).map(|s| s.state)
        };

        let session = AgentHookSession {
            session_id: session_id.to_string(),
            tool,
            state,
            timestamp: timestamp.clone(),
            project_path,
            context_id: ctx.context_id.clone(),
            pane_id: ctx.pane_id.clone(),
        };

        {
            let mut sessions = self.sessions.write();
            sessions.insert(session_id.to_string(), session.clone());
        }

        let update = AgentHookStateUpdate {
            session_id: session_id.to_string(),
            tool,
            state,
            timestamp,
            project_path: session.project_path,
            context_id: ctx.context_id.clone(),
            pane_id: ctx.pane_id.clone(),
        };

        self.broadcast_state_update(update.clone());

        if let Some(ref notification_service) = *self.notification_service.read() {
            notification_service.on_agent_state_change(&update, previous_state);
        }
    }

    fn broadcast_state_update(&self, update: AgentHookStateUpdate) {
        debug!(
            "Broadcasting state: session={} tool={} state={}",
            update.session_id, update.tool, update.state
        );
        let ws = self.ws_manager.read();
        if let Some(ref manager) = *ws {
            let manager = Arc::clone(manager);
            let data = serde_json::to_value(&update).unwrap_or_default();
            let msg = WsMessage::notification(WsEvent::AgentHookStateChanged, data);
            tokio::spawn(async move {
                if let Err(e) = manager.broadcast(&msg).await {
                    warn!("Failed to broadcast agent hook state update: {}", e);
                }
            });
        } else {
            warn!("Cannot broadcast: WsManager not set");
        }
    }

    pub fn handle_claude_code_event(&self, payload: &Value, ctx: &AtmosContext) {
        let hook_event = payload
            .get("hook_event_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.resolve_session_id(payload, AgentToolType::ClaudeCode, ctx);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("Claude Code hook event: {} session_id={}", hook_event, session_id);

        // If this session is actively running/waiting under a different tool
        // (e.g. opencode using Claude as backend), skip — the owning tool is
        // authoritative. But if the session is idle, allow takeover (the user
        // may have quit one agent and started another in the same terminal).
        if let Some(existing) = self.sessions.read().get(&session_id) {
            if existing.tool != AgentToolType::ClaudeCode
                && existing.state != AgentHookState::Idle
            {
                debug!(
                    "Skipping Claude Code event for session {} actively owned by {}",
                    session_id, existing.tool
                );
                return;
            }
        }

        match hook_event {
            "SessionStart" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Idle, project_path, ctx);
            }
            "UserPromptSubmit" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Running, project_path, ctx);
            }
            "Notification" => {
                let notification_type = payload
                    .get("notification_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if notification_type == "permissionprompt" {
                    self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::PermissionRequest, project_path, ctx);
                }
            }
            "PreToolUse" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Running, project_path, ctx);
            }
            "Stop" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Idle, project_path, ctx);
            }
            _ => {
                debug!("Unhandled Claude Code hook event: {}", hook_event);
            }
        }
    }

    pub fn handle_codex_event(&self, payload: &Value, ctx: &AtmosContext) {
        let hook_event = payload
            .get("hook_event_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.resolve_session_id(payload, AgentToolType::Codex, ctx);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("Codex hook event: {} session_id={}", hook_event, session_id);

        match hook_event {
            // Codex only reliably fires SessionStart and Stop.
            // SessionStart means the user has started a session → running.
            "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Running, project_path, ctx);
            }
            "Stop" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Idle, project_path, ctx);
            }
            _ => {
                debug!("Unhandled Codex hook event: {}", hook_event);
            }
        }
    }

    pub fn handle_opencode_event(&self, payload: &Value, ctx: &AtmosContext) {
        let event_type = payload
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.resolve_session_id(payload, AgentToolType::Opencode, ctx);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("opencode hook event: type={} session_id={} payload_keys={:?}",
            event_type, session_id,
            payload.as_object().map(|o| o.keys().collect::<Vec<_>>()).unwrap_or_default()
        );

        match event_type {
            "session.created" | "session.idle" | "session.error" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Idle, project_path, ctx);
            }
            "agent.running" | "message.part.delta" | "message.part.updated"
            | "message.updated" | "tool.execute.before" | "tool.execute.after" => {
                let current = self.sessions.read().get(&session_id).map(|s| s.state);
                if current != Some(AgentHookState::Running) {
                    self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Running, project_path, ctx);
                }
            }
            "permission.asked" | "permission.updated" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::PermissionRequest, project_path, ctx);
            }
            "permission.replied" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Running, project_path, ctx);
            }
            _ => {
                // session.updated, session.status, session.diff, etc. — ignored
            }
        }
    }

    /// Prefer Atmos pane_id (stable, per-terminal-pane) > payload session_id > fallback.
    fn resolve_session_id(&self, payload: &Value, tool: AgentToolType, ctx: &AtmosContext) -> String {
        if let Some(ref pane_id) = ctx.pane_id {
            return pane_id.clone();
        }
        payload
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                let cwd = Self::extract_cwd(payload).unwrap_or("unknown");
                format!("{}:{}", tool, cwd)
            })
    }

    fn extract_cwd(payload: &Value) -> Option<&str> {
        payload
            .get("cwd")
            .or_else(|| payload.get("project_path"))
            .and_then(|v| v.as_str())
    }
}

