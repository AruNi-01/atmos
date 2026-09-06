//! Agent Status kernel: occupancy of an agent on a surface.
//!
//! Hooks and the Agent Chat host are adapters. This module owns the live
//! occupancy store, attention latches, grouping, and occupancy policy.

mod attention;
mod attention_summary;
mod attention_summary_generate;
mod child_lifecycle;
mod workspace_agent_group;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use super::notification::NotificationService;

pub use attention::{AgentAttentionLatch, AgentAttentionReason};
pub use attention_summary::{
    AgentAttentionSummary, AttentionSummaryPayload, AttentionSummarySettings,
    AttentionSummaryStatus,
};
pub use attention_summary_generate::generate_attention_summary;
pub use workspace_agent_group::{
    resolve_workspace_agent_group_key, WorkspaceAgentGroupKey, WorkspaceAgentGroupSnapshot,
};

/// How long late mid-turn progress events are ignored after a terminal idle /
/// forced idle transition. Prevents a delayed PostToolUse from resurrecting a
/// spinner after the user interrupted or the agent already stopped.
const RUNNING_SUPPRESS_AFTER_IDLE: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentOccupancy {
    Idle,
    Running,
    PermissionRequest,
}

impl std::fmt::Display for AgentOccupancy {
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
pub enum OccupancyUpdateKind {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentSurface {
    #[default]
    Terminal,
    Chat,
}

impl AgentSurface {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Terminal => "terminal",
            Self::Chat => "chat",
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
    Antigravity,
    FactoryDroid,
    Kiro,
    Opencode,
    Ampcode,
    Pi,
    Hermes,
    GrokBuild,
    /// Unknown ACP / generic provider.
    Agent,
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
            Self::Agent => write!(f, "agent"),
        }
    }
}

/// Context injected by Atmos tmux environment variables, carried via HTTP headers.
/// `context_id` is the effective context: workspace GUID when inside a workspace,
/// or project GUID when developing on main/local project.
#[derive(Debug, Clone, Default)]
pub struct AgentStatusContext {
    pub context_id: Option<String>,
    pub pane_id: Option<String>,
    pub terminal_kind: Option<String>,
    pub side_chat_id: Option<String>,
    pub source_pane_id: Option<String>,
    pub hook_version: Option<u32>,
    pub surface: AgentSurface,
    pub surface_id: Option<String>,
    pub space_id: Option<String>,
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusRecord {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentOccupancy,
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
    #[serde(default)]
    pub surface: AgentSurface,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub space_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusUpdate {
    pub session_id: String,
    pub tool: AgentToolType,
    pub state: AgentOccupancy,
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
    #[serde(default)]
    pub surface: AgentSurface,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub space_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentStatusEvent {
    StateChanged(AgentStatusUpdate),
    SessionsCleared { session_ids: Vec<String> },
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
    ctx: AgentStatusContext,
    /// When false, flush with QuietIdle (no task-complete notification).
    fire_completion: bool,
}

use super::agent_chat::AgentChatMeta;
use agent::{AgentEvent, TurnStop};

pub fn chat_status_session_id(chat_id: &str) -> String {
    format!("chat:{chat_id}")
}

pub fn parse_chat_status_session_id(session_id: &str) -> Option<&str> {
    session_id.strip_prefix("chat:")
}

pub fn provider_to_tool(provider_id: &str) -> AgentToolType {
    let id = provider_id.trim().to_ascii_lowercase();
    match id.as_str() {
        "claude" | "claude-code" | "claude_code" | "claude-acp" | "claude-code-acp"
        | "claude-agent-acp" => AgentToolType::ClaudeCode,
        "codex" | "codex-acp" => AgentToolType::Codex,
        "cursor" | "cursor-agent" => AgentToolType::Cursor,
        "gemini" | "gemini-cli" | "gemini_cli" => AgentToolType::Gemini,
        "antigravity" | "antigravity-acp" | "antigravity-cli" | "agy" => AgentToolType::Antigravity,
        "droid" | "factory-droid" | "factory_droid" => AgentToolType::FactoryDroid,
        "kiro" | "kiro-cli" | "kiro-cli-chat" => AgentToolType::Kiro,
        "opencode" => AgentToolType::Opencode,
        "amp" | "amp-acp" | "ampcode" => AgentToolType::Ampcode,
        "pi" | "pi-acp" => AgentToolType::Pi,
        "hermes" | "hermes-acp" | "hermes-agent" => AgentToolType::Hermes,
        "grok" | "grok-build" => AgentToolType::GrokBuild,
        _ => AgentToolType::Agent,
    }
}

fn host_event_to_status(event: &AgentEvent) -> Option<(AgentOccupancy, OccupancyUpdateKind)> {
    match event {
        AgentEvent::TurnStarted { .. } | AgentEvent::UserMessage { .. } => {
            Some((AgentOccupancy::Running, OccupancyUpdateKind::NewTurn))
        }
        AgentEvent::ToolCallStarted { .. }
        | AgentEvent::AssistantMessageDelta { .. }
        | AgentEvent::ThinkingDelta { .. } => {
            Some((AgentOccupancy::Running, OccupancyUpdateKind::Progress))
        }
        AgentEvent::PermissionRequested { .. } => Some((
            AgentOccupancy::PermissionRequest,
            OccupancyUpdateKind::Permission,
        )),
        AgentEvent::PermissionResolved { .. } => {
            Some((AgentOccupancy::Running, OccupancyUpdateKind::Progress))
        }
        AgentEvent::TurnCanceled { .. } => {
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::ForcedIdle))
        }
        AgentEvent::TurnCompleted { stop, .. } => Some((
            AgentOccupancy::Idle,
            if *stop == TurnStop::Canceled {
                OccupancyUpdateKind::ForcedIdle
            } else {
                OccupancyUpdateKind::TerminalIdle
            },
        )),
        AgentEvent::TurnFailed { .. } => {
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::TerminalIdle))
        }
        AgentEvent::SessionClosed => Some((AgentOccupancy::Idle, OccupancyUpdateKind::ForcedIdle)),
        _ => None,
    }
}

pub fn apply_host_event(service: &AgentStatusService, meta: &AgentChatMeta, event: &AgentEvent) {
    let Some((state, kind)) = host_event_to_status(event) else {
        return;
    };
    let session_id = chat_status_session_id(&meta.id);
    // Use the chat session id as the stable pane key so attention / focus ack
    // share one identity with the web `chat:{id}` surface.
    let ctx = AgentStatusContext {
        context_id: meta
            .workspace_id
            .clone()
            .or_else(|| meta.project_id.clone()),
        pane_id: Some(session_id.clone()),
        terminal_kind: None,
        side_chat_id: None,
        source_pane_id: None,
        hook_version: None,
        surface: AgentSurface::Chat,
        surface_id: Some(meta.id.clone()),
        space_id: meta.space_id.clone(),
        provider_id: Some(meta.provider_id.clone()),
    };
    service.update_state(
        &session_id,
        provider_to_tool(&meta.provider_id),
        state,
        Some(meta.cwd.clone()),
        &ctx,
        kind,
    );
}

pub struct AgentStatusService {
    pub(crate) sessions: RwLock<HashMap<String, AgentStatusRecord>>,
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
    event_tx: broadcast::Sender<AgentStatusEvent>,
    /// Known project root paths. Kept for diagnostics / future use but
    /// primary filtering is done at the hook level via ATMOS_MANAGED env var.
    known_project_paths: RwLock<HashSet<String>>,
}

impl AgentStatusService {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(64);
        Self {
            sessions: RwLock::new(HashMap::new()),
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

    pub fn subscribe_events(&self) -> broadcast::Receiver<AgentStatusEvent> {
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

    pub fn get_all_sessions(&self) -> Vec<AgentStatusRecord> {
        self.sessions.read().values().cloned().collect()
    }

    pub fn remove_session(&self, session_id: &str) -> bool {
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
        // Pane is gone — drop sticky attention and auto-summary for this pane
        // and session aliases.
        let mut attention_ids = removed.clone();
        attention_ids.push(stable_pane_id.to_string());
        self.clear_attention_and_summaries_matching_ids(&attention_ids);
        removed
    }

    pub fn force_session_idle(&self, session_id: &str) -> Option<AgentStatusRecord> {
        let existing = {
            let sessions = self.sessions.read();
            sessions.get(session_id).cloned()
        }?;

        // Tombstone the turn so a delayed SubagentStart cannot revive Running.
        self.force_closed_sessions
            .write()
            .insert(session_id.to_string());

        if existing.state == AgentOccupancy::Idle {
            self.clear_child_tracking(session_id);
            return Some(existing);
        }

        let ctx = AgentStatusContext {
            context_id: existing.context_id.clone(),
            pane_id: existing.pane_id.clone(),
            terminal_kind: existing.terminal_kind.clone(),
            side_chat_id: existing.side_chat_id.clone(),
            source_pane_id: existing.source_pane_id.clone(),
            hook_version: existing.hook_version,
            surface: existing.surface,
            surface_id: existing.surface_id.clone(),
            space_id: existing.space_id.clone(),
            provider_id: existing.provider_id.clone(),
        };

        // Interrupt / teardown owns the lead — drop child roster so a late
        // SubagentStop cannot resurrect the pane.
        self.clear_child_tracking(session_id);

        self.update_state(
            session_id,
            existing.tool,
            AgentOccupancy::Idle,
            existing.project_path,
            &ctx,
            OccupancyUpdateKind::ForcedIdle,
        );

        self.sessions.read().get(session_id).cloned()
    }

    pub fn clear_idle_sessions(&self) -> Vec<String> {
        let mut sessions = self.sessions.write();
        let idle_ids: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.state == AgentOccupancy::Idle)
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
        }
        idle_ids
    }

    /// Remove idle sessions whose last activity is older than `timeout_mins` minutes.
    /// Emits `AgentStatusRecordsCleared` with the removed session IDs so clients can
    /// update their local state without a full refresh.
    pub fn clear_idle_older_than(&self, timeout_mins: u64) {
        let cutoff = Utc::now() - chrono::Duration::minutes(timeout_mins as i64);
        let removed: Vec<String> = {
            let mut sessions = self.sessions.write();
            let to_remove: Vec<String> = sessions
                .iter()
                .filter(|(_, s)| {
                    if s.state != AgentOccupancy::Idle {
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
        let stale: Vec<(String, AgentToolType, Option<String>, AgentStatusContext)> = {
            let sessions = self.sessions.read();
            sessions
                .iter()
                .filter(|(_, s)| {
                    if s.surface == AgentSurface::Chat {
                        return false;
                    }
                    if s.state == AgentOccupancy::Idle {
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
                        AgentStatusContext {
                            context_id: s.context_id.clone(),
                            pane_id: s.pane_id.clone(),
                            terminal_kind: s.terminal_kind.clone(),
                            side_chat_id: s.side_chat_id.clone(),
                            source_pane_id: s.source_pane_id.clone(),
                            hook_version: s.hook_version,
                            surface: s.surface,
                            surface_id: s.surface_id.clone(),
                            space_id: s.space_id.clone(),
                            provider_id: s.provider_id.clone(),
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
                AgentOccupancy::Idle,
                project_path,
                &ctx,
                OccupancyUpdateKind::ForcedIdle,
            );
        }
    }

    pub fn update_state(
        &self,
        session_id: &str,
        tool: AgentToolType,
        state: AgentOccupancy,
        project_path: Option<String>,
        ctx: &AgentStatusContext,
        kind: OccupancyUpdateKind,
    ) {
        match kind {
            OccupancyUpdateKind::NewTurn => {
                self.suppress_running_until.write().remove(session_id);
                // A fresh user prompt supersedes a deferred completion; child
                // agents from background work may still be tracked.
                self.pending_terminal_idle.write().remove(session_id);
                // New turn re-opens the pane for child lifecycle traffic.
                self.force_closed_sessions.write().remove(session_id);
                // SessionStart maps to NewTurn+Idle — reset the child roster for
                // a new lead session on the same pane.
                if state == AgentOccupancy::Idle {
                    self.active_children.write().remove(session_id);
                }
            }
            OccupancyUpdateKind::Progress if state == AgentOccupancy::Running => {
                if self.is_running_suppressed(session_id) {
                    debug!(
                        "Suppressing late Progress→Running for session {} (tool={})",
                        session_id, tool
                    );
                    return;
                }
            }
            OccupancyUpdateKind::TerminalIdle if state == AgentOccupancy::Idle => {
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
            OccupancyUpdateKind::ForcedIdle if state == AgentOccupancy::Idle => {
                self.force_closed_sessions
                    .write()
                    .insert(session_id.to_string());
                self.clear_child_tracking(session_id);
            }
            OccupancyUpdateKind::QuietIdle if state == AgentOccupancy::Idle => {
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

        let session = AgentStatusRecord {
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
            surface: ctx.surface,
            surface_id: ctx.surface_id.clone(),
            space_id: ctx.space_id.clone(),
            provider_id: ctx.provider_id.clone(),
        };

        {
            let mut sessions = self.sessions.write();
            sessions.insert(session_id.to_string(), session.clone());
        }

        if state == AgentOccupancy::Idle
            && matches!(
                kind,
                OccupancyUpdateKind::TerminalIdle
                    | OccupancyUpdateKind::ForcedIdle
                    | OccupancyUpdateKind::QuietIdle
            )
        {
            let until = Utc::now()
                + chrono::Duration::from_std(RUNNING_SUPPRESS_AFTER_IDLE)
                    .unwrap_or_else(|_| chrono::Duration::seconds(3));
            self.suppress_running_until
                .write()
                .insert(session_id.to_string(), until);
        }

        let update = AgentStatusUpdate {
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
            surface: ctx.surface,
            surface_id: ctx.surface_id.clone(),
            space_id: ctx.space_id.clone(),
            provider_id: ctx.provider_id.clone(),
        };

        // Only broadcast / notify when the visible state actually changed.
        if previous_state != Some(state) {
            self.broadcast_state_update(update.clone());
            self.maybe_raise_attention(previous_state, &update, kind);

            // QuietIdle settles UI without a second task-complete notification.
            if kind != OccupancyUpdateKind::QuietIdle {
                if let Some(ref notification_service) = *self.notification_service.read() {
                    notification_service.on_agent_state_change(&update, previous_state);
                }
            }
        } else if matches!(
            kind,
            OccupancyUpdateKind::TerminalIdle
                | OccupancyUpdateKind::ForcedIdle
                | OccupancyUpdateKind::QuietIdle
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

    fn broadcast_state_update(&self, update: AgentStatusUpdate) {
        debug!(
            "Publishing state: session={} tool={} state={}",
            update.session_id, update.tool, update.state
        );
        if let Err(error) = self.event_tx.send(AgentStatusEvent::StateChanged(update)) {
            warn!("Failed to publish agent status update: {}", error);
        }
    }

    fn broadcast_sessions_cleared(&self, session_ids: Vec<String>) {
        if let Err(error) = self
            .event_tx
            .send(AgentStatusEvent::SessionsCleared { session_ids })
        {
            warn!("Failed to publish agent status sessions cleared: {}", error);
        }
    }
}

impl Default for AgentStatusService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with_pane(pane: &str) -> AgentStatusContext {
        AgentStatusContext {
            pane_id: Some(pane.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AgentStatusContext::default()
        }
    }

    #[test]
    fn progress_after_forced_idle_is_suppressed() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:agent");
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);

        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::Progress,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::Idle,
            "late progress must not resurrect running after interrupt"
        );
    }

    #[test]
    fn new_turn_after_forced_idle_is_allowed() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:agent");
        service.update_state(
            "ws-1:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn clear_stale_active_forces_idle() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:stale");
        service.update_state(
            "ws-1:stale",
            AgentToolType::Codex,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::Progress,
        );
        // Rewrite timestamp to the past.
        {
            let mut sessions = service.sessions.write();
            let s = sessions.get_mut("ws-1:stale").unwrap();
            s.timestamp = (Utc::now() - chrono::Duration::minutes(45)).to_rfc3339();
        }
        service.clear_stale_active_older_than(30);
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn clear_stale_active_skips_chat_surface() {
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext {
            surface: AgentSurface::Chat,
            surface_id: Some("c1".into()),
            context_id: Some("ws-1".into()),
            space_id: Some("main".into()),
            ..AgentStatusContext::default()
        };
        service.update_state(
            "chat:c1",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        {
            let mut sessions = service.sessions.write();
            let s = sessions.get_mut("chat:c1").unwrap();
            s.timestamp = (Utc::now() - chrono::Duration::minutes(45)).to_rfc3339();
        }
        service.clear_stale_active_older_than(30);
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::Running,
            "chat occupancy is owned by the host, not the hook TTL sweeper"
        );
    }

    #[test]
    fn clear_sessions_for_stable_pane_removes_matching() {
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext {
            pane_id: Some("ws-1:win".into()),
            context_id: Some("ws-1".into()),
            ..AgentStatusContext::default()
        };
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentOccupancy::Running,
            None,
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentOccupancy::Idle,
            None,
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
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
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext {
            pane_id: Some("ws-1:win".into()),
            context_id: Some("ws-1".into()),
            ..AgentStatusContext::default()
        };
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentOccupancy::Running,
            None,
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:win",
            AgentToolType::Cursor,
            AgentOccupancy::Idle,
            None,
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
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
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
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
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::Running,
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
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
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
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        service.handle_child_lifecycle(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            false,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
        assert!(!service.has_active_children("ws-1:lead"));
        assert!(!service
            .pending_terminal_idle
            .read()
            .contains_key("ws-1:lead"));
    }

    #[test]
    fn child_origin_idle_never_settles_lead() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.handle_child_origin_event(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            Some("/tmp/p".into()),
            &ctx,
            "child-a",
            AgentOccupancy::Idle,
            OccupancyUpdateKind::TerminalIdle,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn forced_idle_clears_child_roster_and_pending() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
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
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        service.force_session_idle("ws-1:lead");
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
        assert!(!service.has_active_children("ws-1:lead"));
        assert!(service.pending_terminal_idle.read().is_empty());
    }

    #[test]
    fn child_start_after_lead_idle_revives_then_quietly_settles() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
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
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
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
            AgentOccupancy::Idle,
            "pane must re-settle after child-only revive"
        );
        assert!(!service
            .pending_terminal_idle
            .read()
            .contains_key("ws-1:lead"));
    }

    #[test]
    fn child_start_after_forced_idle_does_not_revive() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:lead");
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
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
            AgentOccupancy::Idle,
            "SessionEnd/ForcedIdle tombstone must ignore delayed SubagentStart"
        );
        assert!(!service.has_active_children("ws-1:lead"));
    }

    #[test]
    fn late_child_permission_ignored_when_untracked_and_idle() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:lead");
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        service.handle_child_origin_event(
            "ws-1:lead",
            AgentToolType::FactoryDroid,
            Some("/tmp/p".into()),
            &ctx,
            "ghost-child",
            AgentOccupancy::PermissionRequest,
            OccupancyUpdateKind::Permission,
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::Idle,
            "untracked late AskUser must not resurrect need-attention"
        );
    }

    #[test]
    fn maps_known_providers() {
        assert_eq!(provider_to_tool("claude-acp"), AgentToolType::ClaudeCode);
        assert_eq!(provider_to_tool("mystery-acp"), AgentToolType::Agent);
    }

    #[test]
    fn folds_host_edges() {
        use agent::TurnStop;

        assert_eq!(
            host_event_to_status(&AgentEvent::TurnStarted {
                turn_id: "t1".into()
            }),
            Some((AgentOccupancy::Running, OccupancyUpdateKind::NewTurn))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::PermissionRequested {
                request: agent::AgentPermissionRequest {
                    request_id: "req-1".into(),
                    tool: "edit".into(),
                    description: "edit file".into(),
                    content_markdown: None,
                    options: vec![],
                    questions: vec![],
                    plan_todos: vec![],
                }
            }),
            Some((
                AgentOccupancy::PermissionRequest,
                OccupancyUpdateKind::Permission
            ))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::PermissionResolved {
                request_id: "req-1".into(),
                option_id: "allow".into(),
            }),
            Some((AgentOccupancy::Running, OccupancyUpdateKind::Progress))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::TurnFailed {
                turn_id: "t1".into(),
                error: "boom".into(),
            }),
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::TerminalIdle))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::TurnCanceled {
                turn_id: "t1".into(),
            }),
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::ForcedIdle))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::TurnCompleted {
                turn_id: "t1".into(),
                stop: TurnStop::Completed,
            }),
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::TerminalIdle))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::TurnCompleted {
                turn_id: "t1".into(),
                stop: TurnStop::Canceled,
            }),
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::ForcedIdle))
        );
        assert_eq!(
            host_event_to_status(&AgentEvent::SessionClosed),
            Some((AgentOccupancy::Idle, OccupancyUpdateKind::ForcedIdle))
        );
    }

    #[test]
    fn chat_permission_requested_raises_attention_latch() {
        use crate::service::agent_chat::types::{
            chat_descriptor, AgentChatMeta, AgentChatOrigin, RuntimeStatus,
        };
        use chrono::Utc;

        let service = AgentStatusService::new();
        let meta = AgentChatMeta {
            id: "abc".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted: false,
            title: None,
            cwd: "/tmp/ws".into(),
            workspace_id: Some("ws-1".into()),
            project_id: None,
            space_id: Some("main".into()),
            origin: AgentChatOrigin::Normal,
            provider_id: "claude".into(),
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::RunningTurn,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            applied_permission_mode: None,
            applied_fast: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: chat_descriptor("claude", agent::AgentCurrentConfig::default()),
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
        };
        apply_host_event(
            &service,
            &meta,
            &AgentEvent::TurnStarted {
                turn_id: "t1".into(),
            },
        );
        apply_host_event(
            &service,
            &meta,
            &AgentEvent::PermissionRequested {
                request: agent::AgentPermissionRequest {
                    request_id: "req-1".into(),
                    tool: "edit".into(),
                    description: "edit file".into(),
                    content_markdown: None,
                    options: vec![],
                    questions: vec![],
                    plan_todos: vec![],
                },
            },
        );
        let attention = service.get_all_attention();
        assert_eq!(attention.len(), 1);
        assert_eq!(attention[0].stable_pane_id, "chat:abc");
        assert_eq!(attention[0].context_id, "ws-1");
        assert_eq!(attention[0].reason, AgentAttentionReason::PermissionRequest);
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::PermissionRequest
        );

        apply_host_event(
            &service,
            &meta,
            &AgentEvent::PermissionResolved {
                request_id: "req-1".into(),
                option_id: "allow".into(),
            },
        );
        assert!(
            service.get_all_attention().is_empty(),
            "chat PermissionResolved must clear the header bell latch"
        );
    }

    #[test]
    fn chat_session_id_round_trip() {
        assert_eq!(chat_status_session_id("abc"), "chat:abc");
        assert_eq!(parse_chat_status_session_id("chat:abc"), Some("abc"));
        assert_eq!(parse_chat_status_session_id("ws-1:main"), None);
    }
}
