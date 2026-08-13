//! Workspace-level Agent grouping snapshot.
//!
//! Derived from in-memory hook sessions + sticky attention latches so a
//! browser refresh can restore By Agent Status buckets without waiting for
//! the next live hook event.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::{AgentAttentionReason, AgentHookState, AgentHooksService};

/// Sidebar / kanban buckets for live Agent activity.
/// Distinct from workflow status (`backlog` / `todo` / …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceAgentGroupKey {
    Permission,
    Attention,
    Running,
    Idle,
}

/// One workspace (or project-context) row in the grouping snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceAgentGroupSnapshot {
    pub context_id: String,
    pub group_key: WorkspaceAgentGroupKey,
}

/// Grouping bucket for one workspace.
///
/// Priority: permission (live or sticky) > running > task_complete attention > idle.
/// A still-running agent with a leftover `task_complete` latch stays `running`.
pub fn resolve_workspace_agent_group_key(
    live_state: AgentHookState,
    attention_reason: Option<AgentAttentionReason>,
) -> WorkspaceAgentGroupKey {
    if live_state == AgentHookState::PermissionRequest
        || attention_reason == Some(AgentAttentionReason::PermissionRequest)
    {
        return WorkspaceAgentGroupKey::Permission;
    }
    if live_state == AgentHookState::Running {
        return WorkspaceAgentGroupKey::Running;
    }
    if attention_reason == Some(AgentAttentionReason::TaskComplete) {
        return WorkspaceAgentGroupKey::Attention;
    }
    WorkspaceAgentGroupKey::Idle
}

impl AgentHooksService {
    /// In-memory snapshot of non-idle Agent grouping keys, keyed by workspace
    /// (or project) context id. Survives browser refresh until the API process
    /// itself restarts.
    pub fn list_workspace_agent_groups(&self) -> Vec<WorkspaceAgentGroupSnapshot> {
        let mut context_ids = HashSet::new();
        let mut live_by_context: HashMap<String, AgentHookState> = HashMap::new();

        {
            let sessions = self.sessions.read();
            for session in sessions.values() {
                let Some(context_id) = session
                    .context_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|id| !id.is_empty())
                else {
                    continue;
                };
                context_ids.insert(context_id.to_string());
                let entry = live_by_context
                    .entry(context_id.to_string())
                    .or_insert(AgentHookState::Idle);
                match (session.state, *entry) {
                    (AgentHookState::PermissionRequest, _) => {
                        *entry = AgentHookState::PermissionRequest;
                    }
                    (AgentHookState::Running, AgentHookState::Idle) => {
                        *entry = AgentHookState::Running;
                    }
                    _ => {}
                }
            }
        }

        let mut attention_by_context: HashMap<String, AgentAttentionReason> = HashMap::new();
        {
            let attention = self.attention.read();
            for latch in attention.values() {
                let context_id = latch.context_id.trim();
                if context_id.is_empty() {
                    continue;
                }
                context_ids.insert(context_id.to_string());
                let entry = attention_by_context
                    .entry(context_id.to_string())
                    .or_insert(latch.reason);
                if latch.reason.priority() > entry.priority() {
                    *entry = latch.reason;
                }
            }
        }

        let mut groups: Vec<WorkspaceAgentGroupSnapshot> = context_ids
            .into_iter()
            .filter_map(|context_id| {
                let live_state = live_by_context
                    .get(&context_id)
                    .copied()
                    .unwrap_or(AgentHookState::Idle);
                let attention_reason = attention_by_context.get(&context_id).copied();
                let group_key = resolve_workspace_agent_group_key(live_state, attention_reason);
                if group_key == WorkspaceAgentGroupKey::Idle {
                    return None;
                }
                Some(WorkspaceAgentGroupSnapshot {
                    context_id,
                    group_key,
                })
            })
            .collect();
        groups.sort_by_key(|row| row.context_id.clone());
        groups
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_hooks::{AgentToolType, AtmosContext, StateUpdateKind};

    fn ctx(context_id: &str, pane: &str) -> AtmosContext {
        AtmosContext {
            context_id: Some(context_id.to_string()),
            pane_id: Some(pane.to_string()),
            ..AtmosContext::default()
        }
    }

    fn group_for<'a>(
        groups: &'a [WorkspaceAgentGroupSnapshot],
        context_id: &str,
    ) -> Option<&'a WorkspaceAgentGroupSnapshot> {
        groups.iter().find(|row| row.context_id == context_id)
    }

    #[test]
    fn resolve_priority_matches_list_surface_rules() {
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentHookState::PermissionRequest,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentHookState::Idle,
                Some(AgentAttentionReason::PermissionRequest),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentHookState::Running,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Running
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentHookState::Running,
                Some(AgentAttentionReason::PermissionRequest),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentHookState::Idle,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Attention
        );
        assert_eq!(
            resolve_workspace_agent_group_key(AgentHookState::Idle, None),
            WorkspaceAgentGroupKey::Idle
        );
    }

    #[test]
    fn snapshot_keeps_running_workspace_in_memory() {
        let service = AgentHooksService::new();
        service.update_state(
            "ws-run:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &ctx("ws-run", "ws-run:agent"),
            StateUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-run").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Running)
        );
    }

    #[test]
    fn snapshot_survives_idle_sweep_via_attention_latch() {
        let service = AgentHooksService::new();
        let pane_ctx = ctx("ws-done", "ws-done:agent");
        service.update_state(
            "ws-done:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            Some("/tmp/p".into()),
            &pane_ctx,
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-done:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Idle,
            Some("/tmp/p".into()),
            &pane_ctx,
            StateUpdateKind::TerminalIdle,
        );

        service.clear_idle_sessions();
        assert!(service.get_all_sessions().is_empty());
        assert!(!service.get_all_attention().is_empty());

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-done").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Attention),
            "refresh hydrate must still see need-attention after idle rows are swept"
        );
    }

    #[test]
    fn snapshot_maps_sticky_permission_after_live_state_leaves() {
        let service = AgentHooksService::new();
        let pane_ctx = ctx("ws-perm", "ws-perm:agent");
        service.update_state(
            "ws-perm:agent",
            AgentToolType::Codex,
            AgentHookState::PermissionRequest,
            None,
            &pane_ctx,
            StateUpdateKind::Permission,
        );
        service.update_state(
            "ws-perm:agent",
            AgentToolType::Codex,
            AgentHookState::Idle,
            None,
            &pane_ctx,
            StateUpdateKind::ForcedIdle,
        );
        service.clear_idle_sessions();

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-perm").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Permission)
        );
    }

    #[test]
    fn snapshot_keeps_permission_when_running_with_sticky_latch() {
        let service = AgentHooksService::new();
        let pane_ctx = ctx("ws-both", "ws-both:agent");
        service.update_state(
            "ws-both:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::PermissionRequest,
            None,
            &pane_ctx,
            StateUpdateKind::Permission,
        );
        service.update_state(
            "ws-both:agent",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            None,
            &pane_ctx,
            StateUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-both").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Permission)
        );
    }

    #[test]
    fn snapshot_permission_beats_running_on_same_context() {
        let service = AgentHooksService::new();
        service.update_state(
            "ws-mix:run",
            AgentToolType::ClaudeCode,
            AgentHookState::Running,
            None,
            &ctx("ws-mix", "ws-mix:run"),
            StateUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-mix:perm",
            AgentToolType::Codex,
            AgentHookState::PermissionRequest,
            None,
            &ctx("ws-mix", "ws-mix:perm"),
            StateUpdateKind::Permission,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-mix").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Permission)
        );
    }

    #[test]
    fn snapshot_omits_pure_idle_contexts() {
        let service = AgentHooksService::new();
        service.update_state(
            "ws-idle:agent",
            AgentToolType::Cursor,
            AgentHookState::Idle,
            None,
            &ctx("ws-idle", "ws-idle:agent"),
            StateUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert!(group_for(&groups, "ws-idle").is_none());
    }
}
