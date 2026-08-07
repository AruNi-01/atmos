//! Sticky attention latches for agent panes.
//!
//! Latches are independent of idle session rows so browser refresh still shows
//! need-attention until the user focuses/acknowledges the pane.

use std::collections::HashSet;

use chrono::Utc;
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
            raised_at: Utc::now().to_rfc3339(),
        });
    }

    pub fn raise_attention(&self, mut latch: AgentAttentionLatch) {
        if latch.stable_pane_id.trim().is_empty() || latch.context_id.trim().is_empty() {
            return;
        }
        latch.stable_pane_id = latch.stable_pane_id.trim().to_string();
        latch.context_id = latch.context_id.trim().to_string();

        let latch = {
            let mut attention = self.attention.write();
            if let Some(existing) = attention.get(&latch.stable_pane_id) {
                // Keep the higher-urgency reason if both fire close together.
                if existing.reason.priority() > latch.reason.priority() {
                    return;
                }
            }
            attention.insert(latch.stable_pane_id.clone(), latch.clone());
            latch
        };
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

    /// Clear latches whose map key or stored `session_id` matches any of `ids`.
    pub fn clear_attention_matching_ids(&self, ids: &[String]) -> Vec<String> {
        let id_set: HashSet<&str> = ids
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if id_set.is_empty() {
            return Vec::new();
        }

        let cleared: Vec<String> = {
            let mut attention = self.attention.write();
            let to_clear: Vec<String> = attention
                .iter()
                .filter(|(key, latch)| {
                    id_set.contains(key.as_str()) || id_set.contains(latch.session_id.as_str())
                })
                .map(|(key, _)| key.clone())
                .collect();
            for key in &to_clear {
                attention.remove(key);
            }
            to_clear
        };

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
}
