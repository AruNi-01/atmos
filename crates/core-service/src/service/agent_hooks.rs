mod activity;
mod ampcode;
mod antigravity;
mod attention;
mod attention_summary;
mod attention_summary_generate;
mod child_agent;
mod child_lifecycle;
mod claude_code;
mod codex;
mod cursor;
mod factory_droid;
mod gemini;
mod grok_build;
mod hermes;
mod kiro;
mod opencode;
mod pi;
mod workspace_agent_group;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use super::notification::NotificationService;

pub use activity::{AgentActivity, AgentChildActivity, AgentTodoItem, AgentToolLine, AgentTurn};
pub use attention::{AgentAttentionLatch, AgentAttentionReason};
pub use attention_summary::{
    AgentAttentionSummary, AttentionSummaryPayload, AttentionSummarySettings,
    AttentionSummaryStatus,
};
pub use attention_summary_generate::generate_attention_summary;
pub(super) use child_agent::{extract_child_agent_id, is_child_start_event, is_child_stop_event};
pub use workspace_agent_group::{
    resolve_workspace_agent_group_key, WorkspaceAgentGroupKey, WorkspaceAgentGroupSnapshot,
};

/// How long late mid-turn progress events are ignored after a terminal idle /
/// forced idle transition. Prevents a delayed PostToolUse from resurrecting a
/// spinner after the user interrupted or the agent already stopped.
const RUNNING_SUPPRESS_AFTER_IDLE: Duration = Duration::from_secs(3);

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

/// Classifies a state write so the service can apply suppress / re-entry rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum StateUpdateKind {
    /// Session start or a fresh user prompt. Always applied; clears suppress.
    NewTurn,
    /// Mid-turn progress (tools, streaming). Suppressed after recent idle.
    Progress,
    /// Permission / interactive wait.
    Permission,
    /// Agent reported turn/session finished (Stop, SessionEnd, AgentEnd, …).
    TerminalIdle,
    /// Manual force, interrupt inference, stale TTL, or pane teardown.
    ForcedIdle,
    /// Settle Idle after child-only work without a new task-complete notify
    /// (lead already completed; children briefly revived the pane).
    QuietIdle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentToolType {
    ClaudeCode,
    Codex,
    Cursor,
    Gemini,
    Antigravity,
    FactoryDroid,
    Kiro,
    Opencode,
    Ampcode,
    Pi,
    Hermes,
    GrokBuild,
}

impl std::fmt::Display for AgentToolType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ClaudeCode => write!(f, "claude-code"),
            Self::Codex => write!(f, "codex"),
            Self::Cursor => write!(f, "cursor"),
            Self::Gemini => write!(f, "gemini"),
            Self::Antigravity => write!(f, "antigravity"),
            Self::FactoryDroid => write!(f, "factory-droid"),
            Self::Kiro => write!(f, "kiro"),
            Self::Opencode => write!(f, "opencode"),
            Self::Ampcode => write!(f, "ampcode"),
            Self::Pi => write!(f, "pi"),
            Self::Hermes => write!(f, "hermes"),
            Self::GrokBuild => write!(f, "grok-build"),
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
    pub terminal_kind: Option<String>,
    pub side_chat_id: Option<String>,
    pub source_pane_id: Option<String>,
    pub hook_version: Option<u32>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hook_version: Option<u32>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hook_version: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentHookEvent {
    StateChanged(AgentHookStateUpdate),
    SessionsCleared { session_ids: Vec<String> },
    ActivityUpdated(AgentActivity),
    ActivityCleared { session_ids: Vec<String> },
    AttentionRaised(AgentAttentionLatch),
    AttentionCleared { stable_pane_ids: Vec<String> },
    AttentionSummaryUpdated(AgentAttentionSummary),
    AttentionSummaryCleared { stable_pane_ids: Vec<String> },
}

/// Snapshot of a lead TerminalIdle that arrived while child agents were still
/// active. Flushed when the last child stops so task-complete fires once.
#[derive(Debug, Clone)]
pub(super) struct PendingTerminalIdle {
    tool: AgentToolType,
    project_path: Option<String>,
    ctx: AtmosContext,
    /// When false, flush with QuietIdle (no task-complete notification).
    fire_completion: bool,
}

pub struct AgentHooksService {
    sessions: RwLock<HashMap<String, AgentHookSession>>,
    /// Observer turn history. Outlives idle session-row sweep.
    activity: RwLock<HashMap<String, AgentActivity>>,
    /// Sticky attention latches keyed by stable pane id (`{context}:{tmux_window}`).
    /// Independent of idle session rows so refresh still shows need-attention.
    attention: RwLock<HashMap<String, AgentAttentionLatch>>,
    /// Unattended task-complete auto-summaries keyed by stable pane id.
    summaries: RwLock<HashMap<String, AgentAttentionSummary>>,
    /// Monotonic token for in-flight summary generations.
    summary_generation: RwLock<u64>,
    /// After terminal/forced idle, ignore Progress→Running until this time.
    suppress_running_until: RwLock<HashMap<String, DateTime<Utc>>>,
    /// Lead session → active child agent ids (Task / SubagentStart roster).
    active_children: RwLock<HashMap<String, HashSet<String>>>,
    /// Lead TerminalIdle deferred until `active_children` drains.
    pending_terminal_idle: RwLock<HashMap<String, PendingTerminalIdle>>,
    /// Sessions closed via ForcedIdle / SessionEnd / interrupt. Blocks late
    /// SubagentStart from recreating Running until the next NewTurn.
    force_closed_sessions: RwLock<HashSet<String>>,
    notification_service: RwLock<Option<Arc<NotificationService>>>,
    event_tx: broadcast::Sender<AgentHookEvent>,
    /// Known project root paths. Kept for diagnostics / future use but
    /// primary filtering is done at the hook level via ATMOS_MANAGED env var.
    known_project_paths: RwLock<HashSet<String>>,
}

impl AgentHooksService {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            sessions: RwLock::new(HashMap::new()),
            activity: RwLock::new(HashMap::new()),
            attention: RwLock::new(HashMap::new()),
            summaries: RwLock::new(HashMap::new()),
            summary_generation: RwLock::new(0),
            suppress_running_until: RwLock::new(HashMap::new()),
            active_children: RwLock::new(HashMap::new()),
            pending_terminal_idle: RwLock::new(HashMap::new()),
            force_closed_sessions: RwLock::new(HashSet::new()),
            notification_service: RwLock::new(None),
            event_tx,
            known_project_paths: RwLock::new(HashSet::new()),
        }
    }

    pub fn set_notification_service(&self, service: Arc<NotificationService>) {
        *self.notification_service.write() = Some(service);
    }

    /// Test-only: drop a latch without clearing its summary (orphan simulation).
    #[cfg(test)]
    pub(crate) fn test_remove_attention_latch_only(&self, stable_pane_id: &str) {
        self.attention.write().remove(stable_pane_id);
    }

    #[cfg(test)]
    pub(crate) fn test_backdate_session(&self, session_id: &str, timestamp: &str) {
        if let Some(session) = self.sessions.write().get_mut(session_id) {
            session.timestamp = timestamp.to_string();
        }
    }

    /// Test-only: rewrite summary timestamps so stale pruning can be exercised.
    #[cfg(test)]
    pub(crate) fn test_set_summary_timestamps(
        &self,
        stable_pane_id: &str,
        started_at: String,
        completed_at: Option<String>,
    ) {
        if let Some(entry) = self.summaries.write().get_mut(stable_pane_id) {
            entry.started_at = started_at;
            entry.completed_at = completed_at;
        }
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
        self.remove_session_with_activity(session_id, true)
    }

    /// Drop an activity row even when the coarse session is already gone
    /// (idle sweep / pane-focus dismiss). Returns true if a record was removed.
    pub fn drop_orphaned_activity(&self, session_id: &str) -> bool {
        let had = self.activity.read().contains_key(session_id);
        if had {
            self.drop_activity(&[session_id.to_string()]);
        }
        had
    }

    pub fn remove_session_keep_activity(&self, session_id: &str) -> bool {
        self.remove_session_with_activity(session_id, false)
    }

    fn remove_session_with_activity(&self, session_id: &str, drop_activity: bool) -> bool {
        let removed = self.sessions.write().remove(session_id).is_some();
        self.suppress_running_until.write().remove(session_id);
        self.force_closed_sessions.write().remove(session_id);
        self.clear_child_tracking(session_id);
        if removed {
            self.broadcast_sessions_cleared(vec![session_id.to_string()]);
            // Removing the session row drops the latch but keeps auto-summary
            // chrome — the pane may still exist, so the user can still read the
            // recap. Only explicit Dismiss / send / pane destroy drop it.
            self.clear_attention_matching_ids(&[session_id.to_string()]);
        }
        if drop_activity {
            self.drop_activity(&[session_id.to_string()]);
        }
        removed
    }

    /// Drop every session keyed by, or attributed to, a stable pane id
    /// (`{context}:{tmux_window_name}`). Used when a terminal pane is destroyed.
    pub fn clear_sessions_for_stable_pane(&self, stable_pane_id: &str) -> Vec<String> {
        if stable_pane_id.is_empty() {
            return Vec::new();
        }
        let removed: Vec<String> = {
            let mut sessions = self.sessions.write();
            let to_remove: Vec<String> = sessions
                .iter()
                .filter(|(id, s)| {
                    *id == stable_pane_id
                        || s.pane_id.as_deref() == Some(stable_pane_id)
                        || s.source_pane_id.as_deref() == Some(stable_pane_id)
                })
                .map(|(id, _)| id.clone())
                .collect();
            for id in &to_remove {
                sessions.remove(id);
            }
            to_remove
        };
        {
            let mut suppress = self.suppress_running_until.write();
            for id in &removed {
                suppress.remove(id);
            }
        }
        for id in &removed {
            self.clear_child_tracking(id);
        }
        if !removed.is_empty() {
            info!(
                "Cleared {} agent hook session(s) for destroyed pane {}",
                removed.len(),
                stable_pane_id
            );
            self.broadcast_sessions_cleared(removed.clone());
        }
        self.drop_activity(&removed);
        self.drop_activity_matching_pane(stable_pane_id);
        // Pane is gone — drop sticky attention and auto-summary for this pane
        // and session aliases.
        let mut attention_ids = removed.clone();
        attention_ids.push(stable_pane_id.to_string());
        self.clear_attention_and_summaries_matching_ids(&attention_ids);
        removed
    }

    pub fn force_session_idle(&self, session_id: &str) -> Option<AgentHookSession> {
        let existing = {
            let sessions = self.sessions.read();
            sessions.get(session_id).cloned()
        }?;

        // Tombstone the turn so a delayed SubagentStart cannot revive Running.
        self.force_closed_sessions
            .write()
            .insert(session_id.to_string());

        if existing.state == AgentHookState::Idle {
            self.clear_child_tracking(session_id);
            return Some(existing);
        }

        let ctx = AtmosContext {
            context_id: existing.context_id.clone(),
            pane_id: existing.pane_id.clone(),
            terminal_kind: existing.terminal_kind.clone(),
            side_chat_id: existing.side_chat_id.clone(),
            source_pane_id: existing.source_pane_id.clone(),
            hook_version: existing.hook_version,
        };

        // Interrupt / teardown owns the lead — drop child roster so a late
        // SubagentStop cannot resurrect the pane.
        self.clear_child_tracking(session_id);

        self.update_state(
            session_id,
            existing.tool,
            AgentHookState::Idle,
            existing.project_path,
            &ctx,
            StateUpdateKind::ForcedIdle,
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
        {
            let mut suppress = self.suppress_running_until.write();
            for id in &idle_ids {
                suppress.remove(id);
            }
        }
        for id in &idle_ids {
            self.clear_child_tracking(id);
        }
        if !idle_ids.is_empty() {
            self.broadcast_sessions_cleared(idle_ids.clone());
            self.drop_activity(&idle_ids);
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

        {
            let mut suppress = self.suppress_running_until.write();
            for id in &removed {
                suppress.remove(id);
            }
        }
        for id in &removed {
            self.clear_child_tracking(id);
        }

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

    /// Force non-idle sessions that have not updated within `timeout_mins` back to Idle.
    /// Covers missed Stop/SessionEnd hooks after user interrupt or process death.
    pub fn clear_stale_active_older_than(&self, timeout_mins: u64) {
        let cutoff = Utc::now() - chrono::Duration::minutes(timeout_mins as i64);
        let stale: Vec<(String, AgentToolType, Option<String>, AtmosContext)> = {
            let sessions = self.sessions.read();
            sessions
                .iter()
                .filter(|(_, s)| {
                    if s.state == AgentHookState::Idle {
                        return false;
                    }
                    chrono::DateTime::parse_from_rfc3339(&s.timestamp)
                        .map(|t| t < cutoff)
                        .unwrap_or(true)
                })
                .map(|(id, s)| {
                    (
                        id.clone(),
                        s.tool,
                        s.project_path.clone(),
                        AtmosContext {
                            context_id: s.context_id.clone(),
                            pane_id: s.pane_id.clone(),
                            terminal_kind: s.terminal_kind.clone(),
                            side_chat_id: s.side_chat_id.clone(),
                            source_pane_id: s.source_pane_id.clone(),
                            hook_version: s.hook_version,
                        },
                    )
                })
                .collect()
        };

        if stale.is_empty() {
            return;
        }

        info!(
            "Forcing {} stale active agent hook session(s) idle (older than {} min)",
            stale.len(),
            timeout_mins
        );

        for (session_id, tool, project_path, ctx) in stale {
            self.update_state(
                &session_id,
                tool,
                AgentHookState::Idle,
                project_path,
                &ctx,
                StateUpdateKind::ForcedIdle,
            );
        }
    }

    pub(super) fn update_state(
        &self,
        session_id: &str,
        tool: AgentToolType,
        state: AgentHookState,
        project_path: Option<String>,
        ctx: &AtmosContext,
        kind: StateUpdateKind,
    ) {
        match kind {
            StateUpdateKind::NewTurn => {
                self.suppress_running_until.write().remove(session_id);
                // A fresh user prompt supersedes a deferred completion; child
                // agents from background work may still be tracked.
                self.pending_terminal_idle.write().remove(session_id);
                // New turn re-opens the pane for child lifecycle traffic.
                self.force_closed_sessions.write().remove(session_id);
                // SessionStart maps to NewTurn+Idle — reset the child roster for
                // a new lead session on the same pane.
                if state == AgentHookState::Idle {
                    self.active_children.write().remove(session_id);
                }
            }
            StateUpdateKind::Progress if state == AgentHookState::Running => {
                if self.is_running_suppressed(session_id) {
                    debug!(
                        "Suppressing late Progress→Running for session {} (tool={})",
                        session_id, tool
                    );
                    return;
                }
            }
            StateUpdateKind::TerminalIdle if state == AgentHookState::Idle => {
                if self.has_active_children(session_id) {
                    self.arm_pending_terminal_idle(
                        session_id,
                        tool,
                        project_path.clone(),
                        ctx,
                        true,
                    );
                    // Close the race: the last child may have stopped between the
                    // active-child check and arming. If the roster is empty now,
                    // fall through to settle Idle (completion still fires).
                    if self.has_active_children(session_id) {
                        // Keep the lead non-idle so spinners / attention stay live
                        // while background children finish.
                        self.touch_session_activity(session_id, tool, project_path, ctx);
                        return;
                    }
                }
                self.pending_terminal_idle.write().remove(session_id);
            }
            StateUpdateKind::ForcedIdle if state == AgentHookState::Idle => {
                self.force_closed_sessions
                    .write()
                    .insert(session_id.to_string());
                self.clear_child_tracking(session_id);
            }
            StateUpdateKind::QuietIdle if state == AgentHookState::Idle => {
                self.clear_child_tracking(session_id);
            }
            _ => {}
        }

        let timestamp = Utc::now().to_rfc3339();

        let previous_state = {
            let sessions = self.sessions.read();
            sessions.get(session_id).map(|s| s.state)
        };

        // Always insert/refresh the session row (including identical Running /
        // PermissionRequest) so the stale-TTL timestamp stays current. Broadcast
        // and notifications are gated below on actual state change.

        let session = AgentHookSession {
            session_id: session_id.to_string(),
            tool,
            state,
            timestamp: timestamp.clone(),
            project_path,
            context_id: ctx.context_id.clone(),
            pane_id: ctx.pane_id.clone(),
            terminal_kind: ctx.terminal_kind.clone(),
            side_chat_id: ctx.side_chat_id.clone(),
            source_pane_id: ctx.source_pane_id.clone(),
            hook_version: ctx.hook_version,
        };

        {
            let mut sessions = self.sessions.write();
            sessions.insert(session_id.to_string(), session.clone());
        }

        if state == AgentHookState::Idle
            && matches!(
                kind,
                StateUpdateKind::TerminalIdle
                    | StateUpdateKind::ForcedIdle
                    | StateUpdateKind::QuietIdle
            )
        {
            let until = Utc::now()
                + chrono::Duration::from_std(RUNNING_SUPPRESS_AFTER_IDLE)
                    .unwrap_or_else(|_| chrono::Duration::seconds(3));
            self.suppress_running_until
                .write()
                .insert(session_id.to_string(), until);
            self.close_activity_turn(session_id);
        }

        let update = AgentHookStateUpdate {
            session_id: session_id.to_string(),
            tool,
            state,
            timestamp,
            project_path: session.project_path,
            context_id: ctx.context_id.clone(),
            pane_id: ctx.pane_id.clone(),
            terminal_kind: ctx.terminal_kind.clone(),
            side_chat_id: ctx.side_chat_id.clone(),
            source_pane_id: ctx.source_pane_id.clone(),
            hook_version: ctx.hook_version,
        };

        // Only broadcast / notify when the visible state actually changed.
        if previous_state != Some(state) {
            self.broadcast_state_update(update.clone());
            self.maybe_raise_attention(previous_state, &update, kind);

            // QuietIdle settles UI without a second task-complete notification.
            if kind != StateUpdateKind::QuietIdle {
                if let Some(ref notification_service) = *self.notification_service.read() {
                    notification_service.on_agent_state_change(&update, previous_state);
                }
            }
        } else if matches!(
            kind,
            StateUpdateKind::TerminalIdle
                | StateUpdateKind::ForcedIdle
                | StateUpdateKind::QuietIdle
        ) {
            // Re-arm suppress without spamming clients when already idle.
            debug!(
                "Re-armed running suppress for already-idle session {}",
                session_id
            );
        }
    }

    fn is_running_suppressed(&self, session_id: &str) -> bool {
        let now = Utc::now();
        let mut guard = self.suppress_running_until.write();
        match guard.get(session_id).copied() {
            Some(until) if until > now => true,
            Some(_) => {
                guard.remove(session_id);
                false
            }
            None => false,
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
        self.observe_if_owned(payload, AgentToolType::ClaudeCode, ctx);
    }

    pub fn handle_codex_event(&self, payload: &Value, ctx: &AtmosContext) {
        codex::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Codex, ctx);
    }

    pub fn handle_cursor_event(&self, payload: &Value, ctx: &AtmosContext) {
        cursor::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Cursor, ctx);
    }

    pub fn handle_gemini_event(&self, payload: &Value, ctx: &AtmosContext) {
        gemini::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Gemini, ctx);
    }

    pub fn handle_antigravity_event(&self, payload: &Value, ctx: &AtmosContext) {
        let payload = antigravity::with_inferred_event_name(payload);
        antigravity::handle_event(self, &payload, ctx);
        self.observe_if_owned(&payload, AgentToolType::Antigravity, ctx);
    }

    pub fn handle_factory_droid_event(&self, payload: &Value, ctx: &AtmosContext) {
        factory_droid::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::FactoryDroid, ctx);
    }

    pub fn handle_kiro_event(&self, payload: &Value, ctx: &AtmosContext) {
        kiro::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Kiro, ctx);
    }

    pub fn handle_opencode_event(&self, payload: &Value, ctx: &AtmosContext) {
        opencode::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Opencode, ctx);
    }

    pub fn handle_ampcode_event(&self, payload: &Value, ctx: &AtmosContext) {
        ampcode::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Ampcode, ctx);
    }

    pub fn handle_pi_event(&self, payload: &Value, ctx: &AtmosContext) {
        pi::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Pi, ctx);
    }

    pub fn handle_hermes_event(&self, payload: &Value, ctx: &AtmosContext) {
        hermes::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::Hermes, ctx);
    }

    pub fn handle_grok_build_event(&self, payload: &Value, ctx: &AtmosContext) {
        grok_build::handle_event(self, payload, ctx);
        self.observe_if_owned(payload, AgentToolType::GrokBuild, ctx);
    }

    fn observe_if_owned(&self, payload: &Value, tool: AgentToolType, ctx: &AtmosContext) {
        let session_id = self.resolve_session_id(payload, tool, ctx);
        self.observe_hook(&session_id, tool, payload, ctx);
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
            .or_else(|| payload.get("workspaceRoot").and_then(|v| v.as_str()))
            .or_else(|| payload.get("workspace_root").and_then(|v| v.as_str()))
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
            .or_else(|| payload.get("sessionId").and_then(|v| v.as_str()))
            .or_else(|| payload.get("conversation_id").and_then(|v| v.as_str()))
    }
}

impl Default for AgentHooksService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with_pane(pane: &str) -> AtmosContext {
        AtmosContext {
            pane_id: Some(pane.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AtmosContext::default()
        }
    }

    #[test]
    fn progress_after_forced_idle_is_suppressed() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:agent");
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);

        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::Progress,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::Idle,
            "late progress must not resurrect running after interrupt"
        );
    }

    #[test]
    fn new_turn_after_forced_idle_is_allowed() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);
    }

    #[test]
    fn clear_stale_active_forces_idle() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:stale");
        service.update_state(
            "ws-1:stale",
            AgentToolType::Codex,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::Progress,
        );
        // Rewrite timestamp to the past.
        {
            let mut sessions = service.sessions.write();
            let s = sessions.get_mut("ws-1:stale").unwrap();
            s.timestamp = (Utc::now() - chrono::Duration::minutes(45)).to_rfc3339();
        }
        service.clear_stale_active_older_than(30);
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
    }

    #[test]
    fn clear_sessions_for_stable_pane_removes_matching() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext {
            pane_id: Some("ws-1:win".into()),
            context_id: Some("ws-1".into()),
            ..AtmosContext::default()
        };
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentHookState::Running,
            None,
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentHookState::Idle,
            None,
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        let (_, _, gen) = service.begin_attention_summary("ws-1:win").expect("begin");
        let _ = service.complete_attention_summary(
            "ws-1:win",
            gen,
            AttentionSummaryPayload {
                summary: "done".into(),
                next_steps: vec![],
                can_close_session: true,
            },
        );
        assert!(!service.get_all_attention().is_empty());
        assert!(service.get_attention_summary("ws-1:win").is_some());

        let removed = service.clear_sessions_for_stable_pane("ws-1:win");
        assert_eq!(removed, vec!["ws-1:win".to_string()]);
        assert!(service.get_all_sessions().is_empty());
        assert!(service.get_all_attention().is_empty());
        assert!(service.get_all_attention_summaries().is_empty());
    }

    #[test]
    fn remove_session_drops_latch_but_keeps_summary() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext {
            pane_id: Some("ws-1:win".into()),
            context_id: Some("ws-1".into()),
            ..AtmosContext::default()
        };
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentHookState::Running,
            None,
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentHookState::Idle,
            None,
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        let (_, _, gen) = service.begin_attention_summary("ws-1:win").expect("begin");
        let _ = service.complete_attention_summary(
            "ws-1:win",
            gen,
            AttentionSummaryPayload {
                summary: "keep me".into(),
                next_steps: vec![],
                can_close_session: true,
            },
        );
        assert!(service.remove_session("ws-1:win"));
        assert!(service.get_all_sessions().is_empty());
        assert!(service.get_all_attention().is_empty());
        assert_eq!(
            service
                .get_attention_summary("ws-1:win")
                .unwrap()
                .summary
                .as_deref(),
            Some("keep me")
        );
    }

    #[test]
    fn terminal_idle_deferred_while_child_agents_active() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            true,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::Running,
            "lead Stop must not complete while a child is active"
        );
        assert!(service.has_active_children("ws-1:lead"));
        assert!(service
            .pending_terminal_idle
            .read()
            .contains_key("ws-1:lead"));
    }

    #[test]
    fn last_child_stop_flushes_deferred_terminal_idle() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            true,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            false,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
        assert!(!service.has_active_children("ws-1:lead"));
        assert!(!service
            .pending_terminal_idle
            .read()
            .contains_key("ws-1:lead"));
    }

    #[test]
    fn child_origin_idle_never_settles_lead() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.handle_child_origin_event(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            AgentHookState::Idle,
            StateUpdateKind::TerminalIdle,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);
    }

    #[test]
    fn forced_idle_clears_child_roster_and_pending() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            true,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        service.force_session_idle("ws-1:lead");
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
        assert!(!service.has_active_children("ws-1:lead"));
        assert!(service.pending_terminal_idle.read().is_empty());
    }

    #[test]
    fn child_start_after_lead_idle_revives_then_quietly_settles() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        // Background child can outlive the lead turn.
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-late",
            true,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-late",
            false,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::Idle,
            "pane must re-settle after child-only revive"
        );
        assert!(!service
            .pending_terminal_idle
            .read()
            .contains_key("ws-1:lead"));
    }

    #[test]
    fn child_start_after_forced_idle_does_not_revive() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:lead");
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            Some("/tmp/p".into()),
            &ctx,
            "late-child",
            true,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::Idle,
            "SessionEnd/ForcedIdle tombstone must ignore delayed SubagentStart"
        );
        assert!(!service.has_active_children("ws-1:lead"));
    }

    #[test]
    fn late_child_permission_ignored_when_untracked_and_idle() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        service.handle_child_origin_event(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            Some("/tmp/p".into()),
            &ctx,
            "ghost-child",
            AgentHookState::PermissionRequest,
            StateUpdateKind::Permission,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::Idle,
            "untracked late AskUser must not resurrect need-attention"
        );
    }
}
