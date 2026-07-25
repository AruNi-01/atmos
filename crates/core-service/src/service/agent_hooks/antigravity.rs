use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext, StateUpdateKind};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Antigravity, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "Antigravity CLI hook event: {} session_id={}",
        hook_event, session_id
    );

    let existing_state = service
        .sessions
        .read()
        .get(&session_id)
        .map(|s| s.state)
        .unwrap_or(AgentHookState::Idle);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Antigravity && existing.state != AgentHookState::Idle {
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
                AgentHookState::Idle,
                project_path,
                ctx,
                StateUpdateKind::NewTurn,
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
                AgentHookState::Running,
                project_path,
                ctx,
                StateUpdateKind::Progress,
            );
        }
        "PostToolUse" | "PostInvocation" | "AfterTool" | "AfterModel" => {
            if existing_state != AgentHookState::Idle {
                service.update_state(
                    &session_id,
                    AgentToolType::Antigravity,
                    AgentHookState::Running,
                    project_path,
                    ctx,
                    StateUpdateKind::Progress,
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
                AgentHookState::PermissionRequest,
                project_path,
                ctx,
                StateUpdateKind::Permission,
            );
        }
        "SessionEnd" | "AfterAgent" | "PreCompress" | "Stop" => {
            service.update_state(
                &session_id,
                AgentToolType::Antigravity,
                AgentHookState::Idle,
                project_path,
                ctx,
                StateUpdateKind::TerminalIdle,
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
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);
    }

    #[test]
    fn antigravity_notification_sets_permission_request() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "Notification",
            "session_id": "ag-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::PermissionRequest
        );
    }

    #[test]
    fn antigravity_session_end_sets_idle() {
        let service = AgentHooksService::new();
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

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &stop, &AtmosContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
    }
}
