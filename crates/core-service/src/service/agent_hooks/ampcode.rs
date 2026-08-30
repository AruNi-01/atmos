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

    let session_id = resolve_session_id(payload, AgentToolType::Ampcode, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!(
        "ampcode hook event: {} session_id={}",
        hook_event, session_id
    );

    match hook_event {
        // Session init → Idle baseline
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        // Agent begins a turn → Running
        "AgentStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        // Tool events → Running, idempotent: skip broadcast if already Running
        "ToolCall" | "ToolResult" => {
            let current = service.sessions.read().get(&session_id).map(|s| s.state);
            if current != Some(AgentOccupancy::Running) {
                service.update_state(
                    &session_id,
                    AgentToolType::Ampcode,
                    AgentOccupancy::Running,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Progress,
                );
            }
        }
        // Agent turn finished (done/error/cancelled) → Idle
        // This is the compensation event: even if AgentStart or ToolCall were lost,
        // AgentEnd always fires and resets state to Idle.
        "AgentEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        _ => {
            debug!("Unhandled ampcode hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_start_sets_idle() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "SessionStart",
            "session_id": "s1",
        });
        handle_event(&service, &payload, &AgentStatusContext::default());
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn agent_start_sets_running() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "AgentStart",
            "session_id": "s1",
        });
        handle_event(&service, &payload, &AgentStatusContext::default());
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn tool_call_idempotent_when_already_running() {
        let service = AgentStatusService::new();
        let start = serde_json::json!({ "hook_event_name": "AgentStart", "session_id": "s1" });
        let tool_call = serde_json::json!({ "hook_event_name": "ToolCall", "session_id": "s1", "tool": "bash" });
        handle_event(&service, &start, &AgentStatusContext::default());
        handle_event(&service, &tool_call, &AgentStatusContext::default());
        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn agent_end_sets_idle() {
        let service = AgentStatusService::new();
        let start = serde_json::json!({ "hook_event_name": "AgentStart", "session_id": "s1" });
        let end = serde_json::json!({
            "hook_event_name": "AgentEnd",
            "session_id": "s1",
            "status": "done",
        });
        handle_event(&service, &start, &AgentStatusContext::default());
        handle_event(&service, &end, &AgentStatusContext::default());
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn agent_end_error_and_cancelled_also_set_idle() {
        for status in ["error", "cancelled"] {
            let service = AgentStatusService::new();
            let start = serde_json::json!({ "hook_event_name": "AgentStart", "session_id": "s1" });
            let end = serde_json::json!({
                "hook_event_name": "AgentEnd",
                "session_id": "s1",
                "status": status,
            });
            handle_event(&service, &start, &AgentStatusContext::default());
            handle_event(&service, &end, &AgentStatusContext::default());
            let sessions = service.get_all_sessions();
            assert_eq!(sessions[0].state, AgentOccupancy::Idle, "status={}", status);
        }
    }
}
