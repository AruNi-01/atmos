mod ampcode;
mod claude_code;
mod codex;
mod cursor;
mod factory_droid;
mod gemini;
mod hermes;
mod kiro;
mod opencode;
mod pi;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

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
    Cursor,
    Gemini,
    FactoryDroid,
    Kiro,
    Opencode,
    Ampcode,
    Pi,
    Hermes,
}

impl std::fmt::Display for AgentToolType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ClaudeCode => write!(f, "claude-code"),
            Self::Codex => write!(f, "codex"),
            Self::Cursor => write!(f, "cursor"),
            Self::Gemini => write!(f, "gemini"),
            Self::FactoryDroid => write!(f, "factory-droid"),
            Self::Kiro => write!(f, "kiro"),
            Self::Opencode => write!(f, "opencode"),
            Self::Ampcode => write!(f, "ampcode"),
            Self::Pi => write!(f, "pi"),
            Self::Hermes => write!(f, "hermes"),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentHookEvent {
    StateChanged(AgentHookStateUpdate),
    SessionsCleared { session_ids: Vec<String> },
}

pub struct AgentHooksService {
    sessions: RwLock<HashMap<String, AgentHookSession>>,
    notification_service: RwLock<Option<Arc<NotificationService>>>,
    event_tx: broadcast::Sender<AgentHookEvent>,
    /// Known project root paths. Kept for diagnostics / future use but
    /// primary filtering is done at the hook level via ATMOS_MANAGED env var.
    known_project_paths: RwLock<HashSet<String>>,
}

impl AgentHooksService {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(64);
        Self {
            sessions: RwLock::new(HashMap::new()),
            notification_service: RwLock::new(None),
            event_tx,
            known_project_paths: RwLock::new(HashSet::new()),
        }
    }

    pub fn set_notification_service(&self, service: Arc<NotificationService>) {
        *self.notification_service.write() = Some(service);
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<AgentHookEvent> {
        self.event_tx.subscribe()
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
        info!(
            "Agent hooks: known project paths updated ({} entries)",
            guard.len()
        );
    }

    pub fn get_all_sessions(&self) -> Vec<AgentHookSession> {
        self.sessions.read().values().cloned().collect()
    }

    pub fn remove_session(&self, session_id: &str) -> bool {
        let removed = self.sessions.write().remove(session_id).is_some();
        if removed {
            self.broadcast_sessions_cleared(vec![session_id.to_string()]);
        }
        removed
    }

    pub fn force_session_idle(&self, session_id: &str) -> Option<AgentHookSession> {
        let existing = {
            let sessions = self.sessions.read();
            sessions.get(session_id).cloned()
        }?;

        let ctx = AtmosContext {
            context_id: existing.context_id.clone(),
            pane_id: existing.pane_id.clone(),
        };

        self.update_state(
            session_id,
            existing.tool,
            AgentHookState::Idle,
            existing.project_path,
            &ctx,
        );

        self.sessions.read().get(session_id).cloned()
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
        drop(sessions);
        if !idle_ids.is_empty() {
            self.broadcast_sessions_cleared(idle_ids.clone());
        }
        idle_ids
    }

    /// Remove idle sessions whose last activity is older than `timeout_mins` minutes.
    /// Emits `AgentHookSessionsCleared` with the removed session IDs so clients can
    /// update their local state without a full refresh.
    pub fn clear_idle_older_than(&self, timeout_mins: u64) {
        let cutoff = Utc::now() - chrono::Duration::minutes(timeout_mins as i64);
        let removed: Vec<String> = {
            let mut sessions = self.sessions.write();
            let to_remove: Vec<String> = sessions
                .iter()
                .filter(|(_, s)| {
                    if s.state != AgentHookState::Idle {
                        return false;
                    }
                    chrono::DateTime::parse_from_rfc3339(&s.timestamp)
                        .map(|t| t < cutoff)
                        .unwrap_or(true)
                })
                .map(|(id, _)| id.clone())
                .collect();
            for id in &to_remove {
                sessions.remove(id);
            }
            to_remove
        };

        if removed.is_empty() {
            return;
        }

        info!(
            "Cleared {} idle agent hook session(s) older than {} min",
            removed.len(),
            timeout_mins
        );

        self.broadcast_sessions_cleared(removed);
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
            "Publishing state: session={} tool={} state={}",
            update.session_id, update.tool, update.state
        );
        if let Err(error) = self.event_tx.send(AgentHookEvent::StateChanged(update)) {
            warn!("Failed to publish agent hook state update: {}", error);
        }
    }

    fn broadcast_sessions_cleared(&self, session_ids: Vec<String>) {
        if let Err(error) = self
            .event_tx
            .send(AgentHookEvent::SessionsCleared { session_ids })
        {
            warn!("Failed to publish agent hook sessions cleared: {}", error);
        }
    }

    pub fn handle_claude_code_event(&self, payload: &Value, ctx: &AtmosContext) {
        claude_code::handle_event(self, payload, ctx);
    }

    pub fn handle_codex_event(&self, payload: &Value, ctx: &AtmosContext) {
        codex::handle_event(self, payload, ctx);
    }

    pub fn handle_cursor_event(&self, payload: &Value, ctx: &AtmosContext) {
        cursor::handle_event(self, payload, ctx);
    }

    pub fn handle_gemini_event(&self, payload: &Value, ctx: &AtmosContext) {
        gemini::handle_event(self, payload, ctx);
    }

    pub fn handle_factory_droid_event(&self, payload: &Value, ctx: &AtmosContext) {
        factory_droid::handle_event(self, payload, ctx);
    }

    pub fn handle_kiro_event(&self, payload: &Value, ctx: &AtmosContext) {
        kiro::handle_event(self, payload, ctx);
    }

    pub fn handle_opencode_event(&self, payload: &Value, ctx: &AtmosContext) {
        opencode::handle_event(self, payload, ctx);
    }

    pub fn handle_ampcode_event(&self, payload: &Value, ctx: &AtmosContext) {
        ampcode::handle_event(self, payload, ctx);
    }

    pub fn handle_pi_event(&self, payload: &Value, ctx: &AtmosContext) {
        pi::handle_event(self, payload, ctx);
    }

    pub fn handle_hermes_event(&self, payload: &Value, ctx: &AtmosContext) {
        hermes::handle_event(self, payload, ctx);
    }

    /// Prefer Atmos pane_id (stable, per-terminal-pane) > payload session_id > fallback.
    fn resolve_session_id(
        &self,
        payload: &Value,
        tool: AgentToolType,
        ctx: &AtmosContext,
    ) -> String {
        if let Some(ref pane_id) = ctx.pane_id {
            return pane_id.clone();
        }
        Self::extract_session_id(payload)
            .map(String::from)
            .unwrap_or_else(|| {
                let cwd = Self::extract_cwd(payload).unwrap_or("unknown");
                format!("{}:{}", tool, cwd)
            })
    }

    fn extract_cwd(payload: &Value) -> Option<&str> {
        payload
            .get("cwd")
            .and_then(|v| v.as_str())
            .or_else(|| payload.get("project_path").and_then(|v| v.as_str()))
            .or_else(|| {
                payload
                    .get("workspace_roots")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
            })
    }

    fn extract_session_id(payload: &Value) -> Option<&str> {
        payload
            .get("session_id")
            .and_then(|v| v.as_str())
            .or_else(|| payload.get("conversation_id").and_then(|v| v.as_str()))
    }
}
