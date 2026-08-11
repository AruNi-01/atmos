//! Sticky attention latches for agent panes.
//!
//! Latches are independent of idle session rows so browser refresh still shows
//! need-attention until the user focuses/acknowledges the pane.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use tracing::{debug, warn};

use super::{
    AgentHookEvent, AgentHookState, AgentHookStateUpdate, AgentHooksService, AgentToolType,
    StateUpdateKind,
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

impl AgentHooksService {
    pub fn get_all_attention(&self) -> Vec<AgentAttentionLatch> {
        self.attention.read().values().cloned().collect()
    }

    fn context_id_from_stable_pane_id(stable_pane_id: &str) -> String {
        match stable_pane_id.split_once(':') {
            Some((ctx, _)) if !ctx.is_empty() => ctx.to_string(),
            _ => stable_pane_id.to_string(),
        }
    }

    fn resolve_stable_pane_id(update: &AgentHookStateUpdate) -> String {
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
        previous_state: Option<AgentHookState>,
        update: &AgentHookStateUpdate,
        kind: StateUpdateKind,
    ) {
        // QuietIdle settles child-only work without a new task-complete signal.
        if kind == StateUpdateKind::QuietIdle {
            return;
        }

        let reason = if update.state == AgentHookState::PermissionRequest
            && previous_state != Some(AgentHookState::PermissionRequest)
        {
            Some(AgentAttentionReason::PermissionRequest)
        } else if update.state == AgentHookState::Idle
            && previous_state == Some(AgentHookState::Running)
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
        self.clear_attention_matching_ids_not_after(&[pane_id.to_string()], Some(not_after))
    }

    /// Clear latches whose map key or stored `session_id` matches any of `ids`.
    pub fn clear_attention_matching_ids(&self, ids: &[String]) -> Vec<String> {
        self.clear_attention_matching_ids_not_after(ids, None)
    }

    fn clear_attention_matching_ids_not_after(
        &self,
        ids: &[String],
        not_after: Option<&str>,
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

        // Drop summary chrome for cleared panes. When not_after guards skipped a
        // newer latch, leave its summary alone (to_clear won't include it).
        // Also drop orphan summaries for the requested ids only when we are not
        // guarded, or when no newer latch remains for that id.
        let mut summary_ids = cleared.clone();
        if not_after_ts.is_none() {
            summary_ids.extend(ids.iter().cloned());
        } else {
            // For guarded clears: also drop orphan summaries for requested ids
            // that currently have no latch (dismiss of a finished summary whose
            // latch was already gone).
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
        if let Err(error) = self.event_tx.send(AgentHookEvent::AttentionRaised(latch)) {
            warn!("Failed to publish agent attention raised: {}", error);
        }
    }

    fn broadcast_attention_cleared(&self, stable_pane_ids: Vec<String>) {
        if let Err(error) = self
            .event_tx
            .send(AgentHookEvent::AttentionCleared { stable_pane_ids })
        {
            warn!("Failed to publish agent attention cleared: {}", error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_hooks::attention_summary::{
        AttentionSummaryPayload, AttentionSummaryStatus,
    };
    use crate::service::agent_hooks::{
        AgentHookState, AgentHooksService, AgentToolType, AtmosContext, StateUpdateKind,
    };

    fn ctx_with_pane(pane_id: &str) -> AtmosContext {
        AtmosContext {
            pane_id: Some(pane_id.to_string()),
            ..AtmosContext::default()
        }
    }

    #[test]
    fn running_to_idle_raises_task_complete_attention() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        let attention = service.get_all_attention();
        assert_eq!(attention.len(), 1);
        assert_eq!(attention[0].stable_pane_id, "ws-1:main");
        assert_eq!(attention[0].context_id, "ws-1");
        assert_eq!(attention[0].reason, AgentAttentionReason::TaskComplete);
        assert_eq!(attention[0].project_path.as_deref(), Some("/tmp/p"));
    }

    #[test]
    fn permission_raises_attention_and_survives_idle_session_clear() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::PermissionRequest,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::Permission,
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
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        let cleared = service.clear_attention_for_pane("ws-1:main");
        assert_eq!(cleared, vec!["ws-1:main".to_string()]);
        assert!(service.get_all_attention().is_empty());
    }

    #[test]
    fn quiet_idle_does_not_raise_task_complete_attention() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::QuietIdle,
        );
        assert!(service.get_all_attention().is_empty());
    }

    #[test]
    fn new_task_complete_turn_invalidates_in_flight_summary() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
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
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
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
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
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
        // Remove latch without going through clear (simulate orphan).
        service.test_remove_attention_latch_only("ws-1:main");
        assert!(service.get_attention_summary("ws-1:main").is_some());

        // Clear by pane id must still drop the orphan summary.
        let cleared = service.clear_attention_for_pane("ws-1:main");
        assert!(cleared.is_empty());
        assert!(service.get_attention_summary("ws-1:main").is_none());
    }

    #[test]
    fn clear_not_after_skips_newer_latch() {
        let service = AgentHooksService::new();
        let ctx = ctx_with_pane("ws-1:main");
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
        );
        let old_raised = service.get_all_attention()[0].raised_at.clone();

        // Newer turn.
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-1:main",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &ctx,
            StateUpdateKind::TerminalIdle,
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
}
