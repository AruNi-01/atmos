//! Sticky attention latches for agent panes.
//!
//! Latches are independent of idle session rows so browser refresh still shows
//! need-attention until the user focuses/acknowledges the pane.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use tracing::{debug, warn};

use super::{
    AgentOccupancy, AgentStatusEvent, AgentStatusService, AgentStatusUpdate, AgentToolType,
    OccupancyUpdateKind,
};

/// Sticky "needs attention" reason (mirrors the web client latch).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentAttentionReason {
    PermissionRequest,
    TaskComplete,
}

impl AgentAttentionReason {
    pub(super) fn priority(self) -> u8 {
        match self {
            Self::PermissionRequest => 2,
            Self::TaskComplete => 1,
        }
    }
}

/// In-memory sticky attention latch for a terminal pane.
/// Survives browser refresh until the user acknowledges the pane.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentAttentionLatch {
    pub stable_pane_id: String,
    pub context_id: String,
    pub reason: AgentAttentionReason,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<AgentToolType>,
    /// Project / workspace path when known (used by unattended auto-summary).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    /// RFC3339 timestamp when the latch was raised (or last upgraded).
    pub raised_at: String,
}

impl AgentStatusService {
    pub fn get_all_attention(&self) -> Vec<AgentAttentionLatch> {
        self.attention.read().values().cloned().collect()
    }

    fn context_id_from_stable_pane_id(stable_pane_id: &str) -> String {
        match stable_pane_id.split_once(':') {
            Some((ctx, _)) if !ctx.is_empty() => ctx.to_string(),
            _ => stable_pane_id.to_string(),
        }
    }

    fn resolve_stable_pane_id(update: &AgentStatusUpdate) -> String {
        update
            .pane_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(update.session_id.as_str())
            .to_string()
    }

    /// Raise a sticky attention latch when the agent needs the user (permission
    /// or task complete). Survives browser refresh until acknowledged.
    pub(super) fn maybe_raise_attention(
        &self,
        previous_state: Option<AgentOccupancy>,
        update: &AgentStatusUpdate,
        kind: OccupancyUpdateKind,
    ) {
        // QuietIdle settles child-only work without a new task-complete signal.
        // ForcedIdle is a user interrupt (footer mark-idle, Ctrl+C) — do not
        // treat it as an unattended finish that needs attention.
        if kind == OccupancyUpdateKind::QuietIdle || kind == OccupancyUpdateKind::ForcedIdle {
            return;
        }

        let reason = if update.state == AgentOccupancy::PermissionRequest
            && previous_state != Some(AgentOccupancy::PermissionRequest)
        {
            Some(AgentAttentionReason::PermissionRequest)
        } else if update.state == AgentOccupancy::Idle
            && (previous_state == Some(AgentOccupancy::Running)
                || previous_state == Some(AgentOccupancy::PermissionRequest))
        {
            Some(AgentAttentionReason::TaskComplete)
        } else {
            None
        };

        let Some(reason) = reason else {
            return;
        };

        let stable_pane_id = Self::resolve_stable_pane_id(update);
        if stable_pane_id.is_empty() {
            return;
        }
        let context_id = update
            .context_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Self::context_id_from_stable_pane_id(&stable_pane_id));
        if context_id.is_empty() {
            return;
        }

        if reason == AgentAttentionReason::TaskComplete
            && previous_state == Some(AgentOccupancy::PermissionRequest)
        {
            // Turn ended while permission was pending — drop the stale prompt latch.
            self.clear_attention_for_pane(&stable_pane_id);
        }

        self.raise_attention(AgentAttentionLatch {
            stable_pane_id,
            context_id,
            reason,
            session_id: update.session_id.clone(),
            tool: Some(update.tool),
            project_path: update.project_path.clone(),
            raised_at: Utc::now().to_rfc3339(),
        });
    }

    pub fn raise_attention(&self, mut latch: AgentAttentionLatch) {
        if latch.stable_pane_id.trim().is_empty() || latch.context_id.trim().is_empty() {
            return;
        }
        latch.stable_pane_id = latch.stable_pane_id.trim().to_string();
        latch.context_id = latch.context_id.trim().to_string();

        // Insert the latch and drop any pane-keyed summary under the *same*
        // attention write lock. Holding attention.write across the summary
        // clear closes the race where `complete_attention_summary` could:
        //   1. pass its latch-exists check against the *new* turn, then
        //   2. write the previous generation's payload before the clear ran.
        // `complete` always acquires `attention` before `summaries`, so it
        // cannot interleave between insert and clear while we hold this write.
        let (latch, cleared_summaries) = {
            let mut attention = self.attention.write();
            if let Some(existing) = attention.get(&latch.stable_pane_id) {
                // Keep the higher-urgency reason if both fire close together.
                if existing.reason.priority() > latch.reason.priority() {
                    return;
                }
                // Preserve project_path if the upgrade omits it.
                if latch.project_path.is_none() {
                    latch.project_path = existing.project_path.clone();
                }
            }

            let cleared_summaries = {
                let mut summaries = self.summaries.write();
                let pane = latch.stable_pane_id.as_str();
                let to_clear: Vec<String> = summaries
                    .iter()
                    .filter(|(key, row)| key.as_str() == pane || row.session_id.as_str() == pane)
                    .map(|(key, _)| key.clone())
                    .collect();
                for key in &to_clear {
                    summaries.remove(key);
                }
                to_clear
            };

            attention.insert(latch.stable_pane_id.clone(), latch.clone());
            (latch, cleared_summaries)
        };
        if !cleared_summaries.is_empty() {
            self.broadcast_summary_cleared(cleared_summaries);
        }
        self.broadcast_attention_raised(latch);
    }

    /// Clear sticky attention for a focused/acknowledged pane (and session aliases).
    /// Does not drop auto-summary chrome — focusing the pane is how the user
    /// *sees* "while you were away".
    pub fn clear_attention_for_pane(&self, stable_pane_id: &str) -> Vec<String> {
        let pane_id = stable_pane_id.trim();
        if pane_id.is_empty() {
            return Vec::new();
        }
        self.clear_attention_matching_ids(&[pane_id.to_string()])
    }

    /// Like [`Self::clear_attention_for_pane`], but skip latches raised after
    /// `not_after` (RFC3339). Prevents a late dismiss from wiping a newer turn.
    pub fn clear_attention_for_pane_not_after(
        &self,
        stable_pane_id: &str,
        not_after: &str,
    ) -> Vec<String> {
        let pane_id = stable_pane_id.trim();
        if pane_id.is_empty() {
            return Vec::new();
        }
        self.clear_attention_matching_ids_not_after(&[pane_id.to_string()], Some(not_after), false)
    }

    /// Clear latches whose map key or stored `session_id` matches any of `ids`.
    /// Leaves auto-summaries in place unless `dismiss_summary` is set.
    pub fn clear_attention_matching_ids(&self, ids: &[String]) -> Vec<String> {
        self.clear_attention_matching_ids_not_after(ids, None, false)
    }

    /// Pane/session destroy: drop both the latch and any auto-summary chrome.
    pub fn clear_attention_and_summaries_matching_ids(&self, ids: &[String]) -> Vec<String> {
        self.clear_attention_matching_ids_not_after(ids, None, true)
    }

    /// Acknowledge a pane. When `dismiss_summary` is true, also drop the
    /// auto-summary (explicit Dismiss / send / pane destroy). Focus-ack
    /// passes false so the user can still read the recap.
    pub fn clear_attention_matching_ids_not_after(
        &self,
        ids: &[String],
        not_after: Option<&str>,
        dismiss_summary: bool,
    ) -> Vec<String> {
        let id_set: HashSet<&str> = ids
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if id_set.is_empty() {
            return Vec::new();
        }

        let not_after_ts = not_after.and_then(|raw| {
            DateTime::parse_from_rfc3339(raw.trim())
                .ok()
                .map(|t| t.with_timezone(&Utc))
        });

        let cleared: Vec<String> = {
            let mut attention = self.attention.write();
            let to_clear: Vec<String> = attention
                .iter()
                .filter(|(key, latch)| {
                    if !(id_set.contains(key.as_str())
                        || id_set.contains(latch.session_id.as_str()))
                    {
                        return false;
                    }
                    if let Some(cutoff) = not_after_ts {
                        let Ok(raised) = DateTime::parse_from_rfc3339(&latch.raised_at) else {
                            return true;
                        };
                        // Skip latches raised after the client observed state.
                        if raised.with_timezone(&Utc) > cutoff {
                            return false;
                        }
                    }
                    true
                })
                .map(|(key, _)| key.clone())
                .collect();
            for key in &to_clear {
                attention.remove(key);
            }
            to_clear
        };

        if dismiss_summary {
            // Drop summary chrome for cleared panes. When not_after guards skipped
            // a newer latch, leave its summary alone (to_clear won't include it).
            // Also drop orphan summaries (latch already gone after a focus-ack)
            // when no newer latch remains for that id.
            let mut summary_ids = cleared.clone();
            if not_after_ts.is_none() {
                summary_ids.extend(ids.iter().cloned());
            } else {
                let attention = self.attention.read();
                for id in &id_set {
                    if !attention.contains_key(*id)
                        && !attention
                            .values()
                            .any(|latch| latch.session_id.as_str() == *id)
                    {
                        summary_ids.push((*id).to_string());
                    }
                }
            }
            self.clear_attention_summaries_matching_ids(&summary_ids);
        }

        if !cleared.is_empty() {
            self.broadcast_attention_cleared(cleared.clone());
        }
        cleared
    }

    fn broadcast_attention_raised(&self, latch: AgentAttentionLatch) {
        debug!(
            "Publishing attention raised: pane={} reason={:?}",
            latch.stable_pane_id, latch.reason
        );
        if let Err(error) = self.event_tx.send(AgentStatusEvent::AttentionRaised(latch)) {
            warn!("Failed to publish agent attention raised: {}", error);
        }
    }

    fn broadcast_attention_cleared(&self, stable_pane_ids: Vec<String>) {
        if let Err(error) = self
            .event_tx
            .send(AgentStatusEvent::AttentionCleared { stable_pane_ids })
        {
            warn!("Failed to publish agent attention cleared: {}", error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_status::attention_summary::{
        AttentionSummaryPayload, AttentionSummaryStatus,
    };
    use crate::service::agent_status::{
        AgentOccupancy, AgentStatusContext, AgentStatusService, AgentToolType, OccupancyUpdateKind,
    };

    fn ctx_with_pane(pane_id: &str) -> AgentStatusContext {
        AgentStatusContext {
            pane_id: Some(pane_id.to_string()),
            ..AgentStatusContext::default()
        }
    }

    #[test]
    fn running_to_idle_raises_task_complete_attention() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let attention = service.get_all_attention();
        assert_eq!(attention.len(), 1);
        assert_eq!(attention[0].stable_pane_id, "ws-1:main");
        assert_eq!(attention[0].context_id, "ws-1");
        assert_eq!(attention[0].reason, AgentAttentionReason::TaskComplete);
        assert_eq!(attention[0].project_path.as_deref(), Some("/tmp/p"));
    }

    #[test]
    fn forced_idle_from_running_does_not_raise_task_complete() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.force_session_idle("ws-1:main");
        assert!(
            service.get_all_attention().is_empty(),
            "user-forced idle must not raise need-attention"
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn canceled_turn_via_forced_idle_does_not_raise_task_complete() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::ForcedIdle,
        );
        assert!(
            service.get_all_attention().is_empty(),
            "user cancel must not raise need-attention"
        );
    }

    #[test]
    fn permission_to_idle_on_terminal_raises_task_complete() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::PermissionRequest,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::Permission,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let attention = service.get_all_attention();
        assert_eq!(attention.len(), 1);
        assert_eq!(attention[0].reason, AgentAttentionReason::TaskComplete);
    }

    #[test]
    fn permission_raises_attention_and_survives_idle_session_clear() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::PermissionRequest,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::Permission,
        );
        assert_eq!(service.get_all_attention().len(), 1);
        assert_eq!(
            service.get_all_attention()[0].reason,
            AgentAttentionReason::PermissionRequest
        );
        // Idle sweeper must not drop sticky attention — only user acknowledge does.
        service.force_session_idle("ws-1:main");
        service.clear_idle_sessions();
        assert!(service.get_all_sessions().is_empty());
        assert_eq!(service.get_all_attention().len(), 1);
    }

    #[test]
    fn clear_attention_for_pane_drops_latch() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let cleared = service.clear_attention_for_pane("ws-1:main");
        assert_eq!(cleared, vec!["ws-1:main".to_string()]);
        assert!(service.get_all_attention().is_empty());
    }

    #[test]
    fn quiet_idle_does_not_raise_task_complete_attention() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::QuietIdle,
        );
        assert!(service.get_all_attention().is_empty());
    }

    #[test]
    fn new_task_complete_turn_invalidates_in_flight_summary() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let (_, _, gen) = service
            .begin_attention_summary("ws-1:main")
            .expect("begin first summary");
        assert_eq!(
            service.get_attention_summary("ws-1:main").unwrap().status,
            AttentionSummaryStatus::Summarizing
        );

        // Second turn on the same pane replaces the latch and drops the summary.
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        assert!(service.get_attention_summary("ws-1:main").is_none());

        // Stale completion from the previous generation must not reappear.
        assert!(service
            .complete_attention_summary(
                "ws-1:main",
                gen,
                AttentionSummaryPayload {
                    summary: "stale prior turn".into(),
                    next_steps: vec![],
                    can_close_session: true,
                },
            )
            .is_none());
        assert!(service.get_attention_summary("ws-1:main").is_none());
    }

    #[test]
    fn clear_attention_drops_orphan_summary_without_latch() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let (_, _, gen) = service.begin_attention_summary("ws-1:main").expect("begin");
        let _ = service.complete_attention_summary(
            "ws-1:main",
            gen,
            AttentionSummaryPayload {
                summary: "done".into(),
                next_steps: vec![],
                can_close_session: true,
            },
        );
        // Remove latch without going through clear (simulate focus-ack already
        // dropped the latch while the recap is still showing).
        service.test_remove_attention_latch_only("ws-1:main");
        assert!(service.get_attention_summary("ws-1:main").is_some());

        // Focus-style clear must keep the orphan recap.
        let cleared = service.clear_attention_for_pane("ws-1:main");
        assert!(cleared.is_empty());
        assert!(service.get_attention_summary("ws-1:main").is_some());

        // Explicit dismiss drops the orphan summary.
        service.clear_attention_matching_ids_not_after(&["ws-1:main".to_string()], None, true);
        assert!(service.get_attention_summary("ws-1:main").is_none());
    }

    #[test]
    fn clear_not_after_skips_newer_latch() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let old_raised = service.get_all_attention()[0].raised_at.clone();

        // Newer turn.
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        assert_eq!(service.get_all_attention().len(), 1);
        let new_raised = service.get_all_attention()[0].raised_at.clone();
        assert_ne!(old_raised, new_raised);

        // Dismiss with the old raised_at must not wipe the newer latch.
        let cleared = service.clear_attention_for_pane_not_after("ws-1:main", &old_raised);
        assert!(cleared.is_empty());
        assert_eq!(service.get_all_attention().len(), 1);
        assert_eq!(service.get_all_attention()[0].raised_at, new_raised);
    }

    #[test]
    fn dismiss_summary_not_after_skips_newer_turn() {
        let service = AgentStatusService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let old_raised = service.get_all_attention()[0].raised_at.clone();
        let (_, _, gen) = service
            .begin_attention_summary("ws-1:main")
            .expect("begin first");
        let _ = service.complete_attention_summary(
            "ws-1:main",
            gen,
            AttentionSummaryPayload {
                summary: "old turn".into(),
                next_steps: vec![],
                can_close_session: true,
            },
        );

        // Newer turn replaces the latch and drops the old summary.
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &ctx,
            OccupancyUpdateKind::TerminalIdle,
        );
        let (_, _, gen2) = service
            .begin_attention_summary("ws-1:main")
            .expect("begin second");
        let _ = service.complete_attention_summary(
            "ws-1:main",
            gen2,
            AttentionSummaryPayload {
                summary: "new turn".into(),
                next_steps: vec![],
                can_close_session: false,
            },
        );

        // Late dismiss of the old recap must not wipe the newer latch or summary.
        service.clear_attention_matching_ids_not_after(
            &["ws-1:main".to_string()],
            Some(&old_raised),
            true,
        );
        assert_eq!(service.get_all_attention().len(), 1);
        assert_eq!(
            service
                .get_attention_summary("ws-1:main")
                .unwrap()
                .summary
                .as_deref(),
            Some("new turn")
        );
    }
}
