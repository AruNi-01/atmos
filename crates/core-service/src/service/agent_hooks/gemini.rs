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

    let session_id = resolve_session_id(payload, AgentToolType::Gemini, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!(
        "Gemini CLI hook event: {} session_id={}",
        hook_event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Gemini && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Gemini CLI event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Gemini,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "BeforeAgent"
        | "BeforeModel"
        | "BeforeToolSelection"
        | "BeforeTool"
        | "AfterTool"
        | "AfterModel" => {
            service.update_state(
                &session_id,
                AgentToolType::Gemini,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "Notification" => {
            service.update_state(
                &session_id,
                AgentToolType::Gemini,
                AgentOccupancy::PermissionRequest,
                project_path,
                ctx,
                OccupancyUpdateKind::Permission,
            );
        }
        "SessionEnd" | "AfterAgent" | "PreCompress" => {
            service.update_state(
                &session_id,
                AgentToolType::Gemini,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        _ => {
            debug!("Unhandled Gemini CLI hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_running_events_update_state() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "BeforeTool",
            "session_id": "gemini-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn gemini_notification_sets_permission_request() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "Notification",
            "session_id": "gemini-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::PermissionRequest
        );
    }

    #[test]
    fn gemini_session_end_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "AfterTool",
            "session_id": "gemini-session",
            "cwd": "/tmp/project",
        });
        let end = serde_json::json!({
            "hook_event_name": "SessionEnd",
            "session_id": "gemini-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &end, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }
}
