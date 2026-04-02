use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let event_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Opencode, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "opencode hook event: type={} session_id={} payload_keys={:?}",
        event_type,
        session_id,
        payload
            .as_object()
            .map(|o| o.keys().collect::<Vec<_>>())
            .unwrap_or_default()
    );

    match event_type {
        "session.created" | "session.idle" | "session.error" => {
            service.update_state(
                &session_id,
                AgentToolType::Opencode,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "agent.running"
        | "message.part.delta"
        | "message.part.updated"
        | "message.updated"
        | "tool.execute.before"
        | "tool.execute.after" => {
            let current = service.sessions.read().get(&session_id).map(|s| s.state);
            if current != Some(AgentHookState::Running) {
                service.update_state(
                    &session_id,
                    AgentToolType::Opencode,
                    AgentHookState::Running,
                    project_path,
                    ctx,
                );
            }
        }
        "permission.asked" | "permission.updated" => {
            service.update_state(
                &session_id,
                AgentToolType::Opencode,
                AgentHookState::PermissionRequest,
                project_path,
                ctx,
            );
        }
        "permission.replied" => {
            service.update_state(
                &session_id,
                AgentToolType::Opencode,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        _ => {
            // session.updated, session.status, session.diff, etc. — ignored
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opencode_permission_events_request_permission() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "type": "permission.asked",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Opencode);
        assert_eq!(sessions[0].state, AgentHookState::PermissionRequest);
    }

    #[test]
    fn opencode_idle_events_set_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "type": "tool.execute.before",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });
        let idle = serde_json::json!({
            "type": "session.idle",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &idle, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
