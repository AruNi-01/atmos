use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Kiro, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!("Kiro hook event: {} session_id={}", hook_event, session_id);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Kiro && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Kiro event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "agentSpawn" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "userPromptSubmit" | "preToolUse" | "postToolUse" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "stop" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        _ => {
            debug!("Unhandled Kiro hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kiro_agent_spawn_sets_idle() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "agentSpawn",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Kiro);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn kiro_tool_use_events_set_running() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "preToolUse",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn kiro_stop_sets_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "postToolUse",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "stop",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &stop, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
