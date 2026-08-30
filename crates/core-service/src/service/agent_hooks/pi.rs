use serde_json::Value;
use tracing::debug;

use super::{extract_cwd, resolve_session_id};
use crate::service::agent_status::{
    AgentOccupancy, AgentStatusContext, AgentStatusService, AgentToolType, OccupancyUpdateKind,
};

pub(super) fn handle_event(
    service: &AgentStatusService,
    payload: &Value,
    ctx: &AgentStatusContext,
) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = resolve_session_id(payload, AgentToolType::Pi, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!("Pi hook event: {} session_id={}", hook_event, session_id);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Pi && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Pi event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "BeforeAgentStart" | "AgentStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "ToolCall" | "ToolResult" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "AgentEnd" | "SessionShutdown" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        _ => {
            debug!("Unhandled Pi hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pi_tool_call_sets_running() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "ToolCall",
            "session_id": "pi-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Pi);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn pi_agent_end_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "AgentStart",
            "session_id": "pi-session",
            "cwd": "/tmp/project",
        });
        let end = serde_json::json!({
            "hook_event_name": "AgentEnd",
            "session_id": "pi-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &end, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }
}
