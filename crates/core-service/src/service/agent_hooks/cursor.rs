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

    let session_id = resolve_session_id(payload, AgentToolType::Cursor, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!(
        "Cursor hook event: {} session_id={}",
        hook_event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Cursor && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Cursor event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "sessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "beforeSubmitPrompt" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "preToolUse" | "postToolUse" | "postToolUseFailure" | "beforeShellExecution" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        // Agent finished producing a response; turn is idle until the next prompt.
        "afterAgentResponse" | "stop" | "sessionEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        _ => {
            debug!("Unhandled Cursor hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_session_start_sets_idle() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "sessionStart",
            "chat_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Cursor);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn cursor_pre_tool_use_sets_running() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "preToolUse",
            "chat_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Cursor);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn cursor_stop_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "preToolUse",
            "chat_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "stop",
            "chat_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &stop, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn cursor_after_agent_response_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "beforeSubmitPrompt",
            "chat_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });
        let after = serde_json::json!({
            "hook_event_name": "afterAgentResponse",
            "chat_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &after, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn cursor_session_end_sets_idle() {
        let service = AgentStatusService::new();
        let running = serde_json::json!({
            "hook_event_name": "preToolUse",
            "chat_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });
        let end = serde_json::json!({
            "hook_event_name": "sessionEnd",
            "chat_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &end, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }
}
