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

    let session_id = resolve_session_id(payload, AgentToolType::Antigravity, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!(
        "Antigravity CLI hook event: {} session_id={}",
        hook_event, session_id
    );

    let existing_state = service
        .sessions
        .read()
        .get(&session_id)
        .map(|s| s.state)
        .unwrap_or(AgentOccupancy::Idle);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Antigravity && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Antigravity CLI event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Antigravity,
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
        | "PreToolUse"
        | "PreInvocation" => {
            service.update_state(
                &session_id,
                AgentToolType::Antigravity,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "PostToolUse" | "PostInvocation" | "AfterTool" | "AfterModel" => {
            if existing_state != AgentOccupancy::Idle {
                service.update_state(
                    &session_id,
                    AgentToolType::Antigravity,
                    AgentOccupancy::Running,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Progress,
                );
            } else {
                debug!(
                    "Ignoring completion event '{}' for session '{}' because the session is already Idle",
                    hook_event, session_id
                );
            }
        }
        "Notification" => {
            service.update_state(
                &session_id,
                AgentToolType::Antigravity,
                AgentOccupancy::PermissionRequest,
                project_path,
                ctx,
                OccupancyUpdateKind::Permission,
            );
        }
        "SessionEnd" | "AfterAgent" | "PreCompress" | "Stop" => {
            service.update_state(
                &session_id,
                AgentToolType::Antigravity,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        _ => {
            debug!("Unhandled Antigravity CLI hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn antigravity_running_events_update_state() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn antigravity_notification_sets_permission_request() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "Notification",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentOccupancy::PermissionRequest
        );
    }

    #[test]
    fn antigravity_session_end_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "PreInvocation",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "Stop",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &stop, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }
}
