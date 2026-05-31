use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Hermes, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "Hermes hook event: {} session_id={}",
        hook_event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Hermes && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Hermes event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "on_session_start" => {
            service.update_state(
                &session_id,
                AgentToolType::Hermes,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "pre_llm_call" | "pre_tool_call" | "post_tool_call" => {
            service.update_state(
                &session_id,
                AgentToolType::Hermes,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "post_llm_call" | "on_session_end" => {
            service.update_state(
                &session_id,
                AgentToolType::Hermes,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        _ => {
            debug!("Unhandled Hermes hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hermes_pre_tool_call_sets_running() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "pre_tool_call",
            "session_id": "hermes-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Hermes);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn hermes_post_llm_call_sets_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "pre_llm_call",
            "session_id": "hermes-session",
            "cwd": "/tmp/project",
        });
        let idle = serde_json::json!({
            "hook_event_name": "post_llm_call",
            "session_id": "hermes-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &idle, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
