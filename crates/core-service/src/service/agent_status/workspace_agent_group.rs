//! Workspace-level Agent grouping snapshot.
//!
//! Derived from in-memory hook sessions + sticky attention latches so a
//! browser refresh can restore By Agent Status buckets without waiting for
//! the next live hook event.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::{AgentAttentionReason, AgentOccupancy, AgentStatusService};

/// Sidebar / kanban buckets for live Agent activity.
/// Distinct from workflow status (`backlog` / `todo` / …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceAgentGroupKey {
    Permission,
    Attention,
    Running,
    /// Remainder bucket (never-run, acknowledged, or no live status).
    /// `idle` is accepted for older API snapshots.
    #[serde(alias = "idle")]
    Done,
}

/// One workspace (or project-context) row in the grouping snapshot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceAgentGroupSnapshot {
    pub context_id: String,
    pub group_key: WorkspaceAgentGroupKey,
}

/// Grouping bucket for one workspace.
///
/// Priority: permission (live or sticky) > running > task_complete attention > done.
/// A still-running agent with a leftover `task_complete` latch stays `running`.
pub fn resolve_workspace_agent_group_key(
    live_state: AgentOccupancy,
    attention_reason: Option<AgentAttentionReason>,
) -> WorkspaceAgentGroupKey {
    if live_state == AgentOccupancy::PermissionRequest
        || attention_reason == Some(AgentAttentionReason::PermissionRequest)
    {
        return WorkspaceAgentGroupKey::Permission;
    }
    if live_state == AgentOccupancy::Running {
        return WorkspaceAgentGroupKey::Running;
    }
    if attention_reason == Some(AgentAttentionReason::TaskComplete) {
        return WorkspaceAgentGroupKey::Attention;
    }
    WorkspaceAgentGroupKey::Done
}

impl AgentStatusService {
    /// In-memory snapshot of non-remainder Agent grouping keys, keyed by workspace
    /// (or project) context id. Survives browser refresh until the API process
    /// itself restarts.
    pub fn list_workspace_agent_groups(&self) -> Vec<WorkspaceAgentGroupSnapshot> {
        let mut context_ids = HashSet::new();
        let mut live_by_context: HashMap<String, AgentOccupancy> = HashMap::new();

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
                    .or_insert(AgentOccupancy::Idle);
                match (session.state, *entry) {
                    (AgentOccupancy::PermissionRequest, _) => {
                        *entry = AgentOccupancy::PermissionRequest;
                    }
                    (AgentOccupancy::Running, AgentOccupancy::Idle) => {
                        *entry = AgentOccupancy::Running;
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
                    .unwrap_or(AgentOccupancy::Idle);
                let attention_reason = attention_by_context.get(&context_id).copied();
                let group_key = resolve_workspace_agent_group_key(live_state, attention_reason);
                if group_key == WorkspaceAgentGroupKey::Done {
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
    use crate::service::agent_status::{AgentStatusContext, AgentToolType, OccupancyUpdateKind};

    fn ctx(context_id: &str, pane: &str) -> AgentStatusContext {
        AgentStatusContext {
            context_id: Some(context_id.to_string()),
            pane_id: Some(pane.to_string()),
            ..AgentStatusContext::default()
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
                AgentOccupancy::PermissionRequest,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentOccupancy::Idle,
                Some(AgentAttentionReason::PermissionRequest),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentOccupancy::Running,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Running
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentOccupancy::Running,
                Some(AgentAttentionReason::PermissionRequest),
            ),
            WorkspaceAgentGroupKey::Permission
        );
        assert_eq!(
            resolve_workspace_agent_group_key(
                AgentOccupancy::Idle,
                Some(AgentAttentionReason::TaskComplete),
            ),
            WorkspaceAgentGroupKey::Attention
        );
        assert_eq!(
            resolve_workspace_agent_group_key(AgentOccupancy::Idle, None),
            WorkspaceAgentGroupKey::Done
        );
    }

    #[test]
    fn snapshot_keeps_running_workspace_in_memory() {
        let service = AgentStatusService::new();
        service.update_state(
            "ws-run:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &ctx("ws-run", "ws-run:agent"),
            OccupancyUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-run").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Running)
        );
    }

    #[test]
    fn snapshot_survives_idle_sweep_via_attention_latch() {
        let service = AgentStatusService::new();
        let pane_ctx = ctx("ws-done", "ws-done:agent");
        service.update_state(
            "ws-done:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            Some("/tmp/p".into()),
            &pane_ctx,
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-done:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Idle,
            Some("/tmp/p".into()),
            &pane_ctx,
            OccupancyUpdateKind::TerminalIdle,
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
        let service = AgentStatusService::new();
        let pane_ctx = ctx("ws-perm", "ws-perm:agent");
        service.update_state(
            "ws-perm:agent",
            AgentToolType::Codex,
            AgentOccupancy::PermissionRequest,
            None,
            &pane_ctx,
            OccupancyUpdateKind::Permission,
        );
        service.update_state(
            "ws-perm:agent",
            AgentToolType::Codex,
            AgentOccupancy::Idle,
            None,
            &pane_ctx,
            OccupancyUpdateKind::ForcedIdle,
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
        let service = AgentStatusService::new();
        let pane_ctx = ctx("ws-both", "ws-both:agent");
        service.update_state(
            "ws-both:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::PermissionRequest,
            None,
            &pane_ctx,
            OccupancyUpdateKind::Permission,
        );
        service.update_state(
            "ws-both:agent",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &pane_ctx,
            OccupancyUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-both").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Permission)
        );
    }

    #[test]
    fn snapshot_permission_beats_running_on_same_context() {
        let service = AgentStatusService::new();
        service.update_state(
            "ws-mix:run",
            AgentToolType::ClaudeCode,
            AgentOccupancy::Running,
            None,
            &ctx("ws-mix", "ws-mix:run"),
            OccupancyUpdateKind::NewTurn,
        );
        service.update_state(
            "ws-mix:perm",
            AgentToolType::Codex,
            AgentOccupancy::PermissionRequest,
            None,
            &ctx("ws-mix", "ws-mix:perm"),
            OccupancyUpdateKind::Permission,
        );

        let groups = service.list_workspace_agent_groups();
        assert_eq!(
            group_for(&groups, "ws-mix").map(|row| row.group_key),
            Some(WorkspaceAgentGroupKey::Permission)
        );
    }

    #[test]
    fn snapshot_omits_remainder_done_contexts() {
        let service = AgentStatusService::new();
        service.update_state(
            "ws-idle:agent",
            AgentToolType::Cursor,
            AgentOccupancy::Idle,
            None,
            &ctx("ws-idle", "ws-idle:agent"),
            OccupancyUpdateKind::NewTurn,
        );

        let groups = service.list_workspace_agent_groups();
        assert!(group_for(&groups, "ws-idle").is_none());
    }
}
