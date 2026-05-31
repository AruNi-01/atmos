use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Pi, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!("Pi hook event: {} session_id={}", hook_event, session_id);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Pi && existing.state != AgentHookState::Idle {
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
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "BeforeAgentStart" | "AgentStart" | "ToolCall" | "ToolResult" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "AgentEnd" | "SessionShutdown" => {
            service.update_state(
                &session_id,
                AgentToolType::Pi,
                AgentHookState::Idle,
                project_path,
                ctx,
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
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "ToolCall",
            "session_id": "pi-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Pi);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn pi_agent_end_sets_idle() {
        let service = AgentHooksService::new();
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

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &end, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
