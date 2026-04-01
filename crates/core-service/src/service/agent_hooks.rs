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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookSession {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentHookState,
    pub timestamp: String,
    pub project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookStateUpdate {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentHookState,
    pub timestamp: String,
    pub project_path: Option<String>,
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

    fn update_state(&self, session_id: &str, tool: AgentToolType, state: AgentHookState, project_path: Option<String>) {
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
        };

        self.broadcast_state_update(update.clone());

        if let Some(ref notification_service) = *self.notification_service.read() {
            notification_service.on_agent_state_change(&update, previous_state);
        }
    }

    fn broadcast_state_update(&self, update: AgentHookStateUpdate) {
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
        }
    }

    pub fn handle_claude_code_event(&self, payload: &Value) {
        let hook_event = payload
            .get("hook_event_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.extract_session_id(payload, AgentToolType::ClaudeCode);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("Claude Code hook event: {} session_id={}", hook_event, session_id);

        match hook_event {
            "SessionStart" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Idle, project_path);
            }
            "UserPromptSubmit" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Running, project_path);
            }
            "Notification" => {
                let notification_type = payload
                    .get("notification_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if notification_type == "permissionprompt" {
                    self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::PermissionRequest, project_path);
                }
            }
            "PreToolUse" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Running, project_path);
            }
            "Stop" => {
                self.update_state(&session_id, AgentToolType::ClaudeCode, AgentHookState::Idle, project_path);
            }
            _ => {
                debug!("Unhandled Claude Code hook event: {}", hook_event);
            }
        }
    }

    pub fn handle_codex_event(&self, payload: &Value) {
        let hook_event = payload
            .get("hook_event_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.extract_session_id(payload, AgentToolType::Codex);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("Codex hook event: {} session_id={}", hook_event, session_id);

        match hook_event {
            "SessionStart" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Idle, project_path);
            }
            "UserPromptSubmit" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Running, project_path);
            }
            "PreToolUse" | "PostToolUse" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Running, project_path);
            }
            "Stop" => {
                self.update_state(&session_id, AgentToolType::Codex, AgentHookState::Idle, project_path);
            }
            _ => {
                debug!("Unhandled Codex hook event: {}", hook_event);
            }
        }
    }

    pub fn handle_opencode_event(&self, payload: &Value) {
        let event_type = payload
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let session_id = self.extract_session_id(payload, AgentToolType::Opencode);
        let project_path = Self::extract_cwd(payload).map(String::from);

        debug!("opencode hook event: {} session_id={}", event_type, session_id);

        match event_type {
            "session.created" | "session.idle" | "session.error" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Idle, project_path);
            }
            "message.updated" => {
                let role = payload
                    .get("properties")
                    .and_then(|p| p.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if role == "user" {
                    self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Running, project_path);
                }
            }
            "tool.execute.before" | "tool.execute.after" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Running, project_path);
            }
            "permission.asked" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::PermissionRequest, project_path);
            }
            "permission.replied" => {
                self.update_state(&session_id, AgentToolType::Opencode, AgentHookState::Running, project_path);
            }
            _ => {
                debug!("Unhandled opencode hook event: {}", event_type);
            }
        }
    }

    fn extract_session_id(&self, payload: &Value, tool: AgentToolType) -> String {
        payload
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                let cwd = payload
                    .get("cwd")
                    .or_else(|| payload.get("project_path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
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

