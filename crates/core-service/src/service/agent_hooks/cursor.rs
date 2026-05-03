use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Cursor, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "Cursor hook event: {} session_id={}",
        hook_event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Cursor && existing.state != AgentHookState::Idle {
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
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "beforeSubmitPrompt"
        | "preToolUse"
        | "postToolUse"
        | "postToolUseFailure"
        | "beforeShellExecution"
        | "afterAgentResponse" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "stop" | "sessionEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::Cursor,
                AgentHookState::Idle,
                project_path,
                ctx,
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
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "sessionStart",
            "conversation_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Cursor);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn cursor_pre_tool_use_sets_running() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "preToolUse",
            "conversation_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Cursor);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn cursor_stop_sets_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "preToolUse",
            "conversation_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "stop",
            "conversation_id": "cursor-conv-1",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &stop, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn cursor_session_end_sets_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "afterAgentResponse",
            "conversation_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });
        let end = serde_json::json!({
            "hook_event_name": "sessionEnd",
            "conversation_id": "cursor-conv-2",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &end, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
