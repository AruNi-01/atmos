//! Lead-session child-agent lifecycle and deferred terminal-idle arming.
//!
//! Terminal agents can spawn short-lived children under the same pane. Their
//! traffic must not settle the lead while children are active, and must not
//! fire a second task-complete when children drain after a quiet revive.

use tracing::debug;

use super::{
    AgentOccupancy, AgentStatusContext, AgentStatusService, AgentToolType, OccupancyUpdateKind,
    PendingTerminalIdle,
};

impl AgentStatusService {
    /// Track SubagentStart / SubagentStop under the lead session. Child start
    /// keeps the pane Running; last child stop flushes a deferred TerminalIdle.
    pub fn handle_child_lifecycle(
        &self,
        session_id: &str,
        tool: AgentToolType,
        project_path: Option<String>,
        ctx: &AgentStatusContext,
        child_id: &str,
        started: bool,
    ) {
        if child_id.trim().is_empty() {
            return;
        }

        if started {
            // SessionEnd / interrupt tombstone: ignore late SubagentStart from
            // the ended turn so we do not recreate Running after ForcedIdle.
            if self.force_closed_sessions.read().contains(session_id) {
                debug!(
                    "Ignoring child start for force-closed session {} child={}",
                    session_id, child_id
                );
                return;
            }
            {
                let mut children = self.active_children.write();
                children
                    .entry(session_id.to_string())
                    .or_default()
                    .insert(child_id.to_string());
            }
            // Child work is real activity — do not let the post-idle Progress
            // suppress window hide a live background agent.
            self.suppress_running_until.write().remove(session_id);
            debug!(
                "Child agent started: session={} child={} (active={})",
                session_id,
                child_id,
                self.active_child_count(session_id)
            );
            // Lead may already be Idle from an early Stop; child work must
            // surface as Running without inventing a new turn suppress clear.
            let current = self.sessions.read().get(session_id).map(|s| s.state);
            // If the lead already settled, re-arm a quiet pending idle so the
            // pane returns to Idle when children drain — without a second
            // task-complete notification.
            if current == Some(AgentOccupancy::Idle)
                && !self.pending_terminal_idle.read().contains_key(session_id)
            {
                self.arm_pending_terminal_idle(session_id, tool, project_path.clone(), ctx, false);
            }
            if current != Some(AgentOccupancy::PermissionRequest) {
                self.update_state(
                    session_id,
                    tool,
                    AgentOccupancy::Running,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Progress,
                );
            }
            return;
        }

        let remaining = {
            let mut children = self.active_children.write();
            if let Some(set) = children.get_mut(session_id) {
                set.remove(child_id);
                let left = set.len();
                if set.is_empty() {
                    children.remove(session_id);
                }
                left
            } else {
                0
            }
        };
        debug!(
            "Child agent stopped: session={} child={} (remaining={})",
            session_id, child_id, remaining
        );

        if remaining > 0 {
            // Refresh activity so stale-TTL does not force-idle while siblings run.
            self.touch_session_activity(session_id, tool, project_path, ctx);
            return;
        }

        let pending = self.pending_terminal_idle.write().remove(session_id);
        if let Some(pending) = pending {
            let kind = if pending.fire_completion {
                OccupancyUpdateKind::TerminalIdle
            } else {
                OccupancyUpdateKind::QuietIdle
            };
            debug!(
                "Flushing deferred idle for session {} after last child stopped (completion={})",
                session_id, pending.fire_completion
            );
            self.update_state(
                session_id,
                pending.tool,
                AgentOccupancy::Idle,
                pending.project_path.or(project_path),
                &pending.ctx,
                kind,
            );
        }
    }

    /// Child-origin tool / permission traffic shares the lead pane but must not
    /// own lead completion. Never invents roster rows (only lifecycle does).
    #[allow(clippy::too_many_arguments)] // mirrors update_state; keep call sites explicit
    pub fn handle_child_origin_event(
        &self,
        session_id: &str,
        tool: AgentToolType,
        project_path: Option<String>,
        ctx: &AgentStatusContext,
        child_id: &str,
        state: AgentOccupancy,
        kind: OccupancyUpdateKind,
    ) {
        if matches!(
            kind,
            OccupancyUpdateKind::TerminalIdle | OccupancyUpdateKind::ForcedIdle
        ) || state == AgentOccupancy::Idle
        {
            debug!(
                "Ignoring child-origin idle for session {} child={} (tool={})",
                session_id, child_id, tool
            );
            return;
        }

        // Only surface child traffic if this child is already on the roster
        // (or the lead is already non-idle). Avoid resurrecting a settled /
        // force-closed lead from stray late AskUser / tool events.
        let tracked = self
            .active_children
            .read()
            .get(session_id)
            .is_some_and(|s| s.contains(child_id));
        let lead_busy = self
            .sessions
            .read()
            .get(session_id)
            .is_some_and(|s| s.state != AgentOccupancy::Idle);
        let force_closed = self.force_closed_sessions.read().contains(session_id);
        if force_closed || !(tracked || lead_busy || self.has_active_children(session_id)) {
            debug!(
                "Ignoring child-origin {:?} for session {} child={} (tracked={} lead_busy={} closed={})",
                state, session_id, child_id, tracked, lead_busy, force_closed
            );
            return;
        }

        // Permission from a child still needs user attention on this pane.
        if state == AgentOccupancy::PermissionRequest {
            self.update_state(
                session_id,
                tool,
                AgentOccupancy::PermissionRequest,
                project_path,
                ctx,
                OccupancyUpdateKind::Permission,
            );
            return;
        }

        if state == AgentOccupancy::Running {
            self.update_state(
                session_id,
                tool,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
    }

    pub(super) fn has_active_children(&self, session_id: &str) -> bool {
        self.active_children
            .read()
            .get(session_id)
            .is_some_and(|s| !s.is_empty())
    }

    pub(super) fn active_child_count(&self, session_id: &str) -> usize {
        self.active_children
            .read()
            .get(session_id)
            .map(|s| s.len())
            .unwrap_or(0)
    }

    pub(super) fn clear_child_tracking(&self, session_id: &str) {
        self.active_children.write().remove(session_id);
        self.pending_terminal_idle.write().remove(session_id);
    }

    pub(super) fn arm_pending_terminal_idle(
        &self,
        session_id: &str,
        tool: AgentToolType,
        project_path: Option<String>,
        ctx: &AgentStatusContext,
        fire_completion: bool,
    ) {
        debug!(
            "Deferring TerminalIdle for session {} ({} active child agent(s), completion={})",
            session_id,
            self.active_child_count(session_id),
            fire_completion
        );
        // Prefer keeping an existing "fire completion" arm if a quieter one races in.
        let mut pending = self.pending_terminal_idle.write();
        if let Some(existing) = pending.get_mut(session_id) {
            existing.fire_completion = existing.fire_completion || fire_completion;
            if project_path.is_some() {
                existing.project_path = project_path;
            }
            return;
        }
        pending.insert(
            session_id.to_string(),
            PendingTerminalIdle {
                tool,
                project_path,
                ctx: ctx.clone(),
                fire_completion,
            },
        );
    }

    /// Refresh last-activity timestamp without changing visible state when the
    /// lead is already non-idle; promote Idle→Running when children outlive the
    /// lead turn so the UI does not look settled mid-child-work.
    pub(super) fn touch_session_activity(
        &self,
        session_id: &str,
        tool: AgentToolType,
        project_path: Option<String>,
        ctx: &AgentStatusContext,
    ) {
        let current = self.sessions.read().get(session_id).map(|s| s.state);
        match current {
            Some(AgentOccupancy::PermissionRequest) => {
                // Keep permission attention; only bump timestamp via same state.
                self.update_state(
                    session_id,
                    tool,
                    AgentOccupancy::PermissionRequest,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Permission,
                );
            }
            Some(AgentOccupancy::Running) | Some(AgentOccupancy::Idle) | None => {
                self.update_state(
                    session_id,
                    tool,
                    AgentOccupancy::Running,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Progress,
                );
            }
        }
    }
}
