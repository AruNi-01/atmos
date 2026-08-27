use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext, StateUpdateKind};

pub(super) fn with_inferred_event_name(payload: &Value) -> Value {
    let name = antigravity_event_name(payload);
    if name.is_empty() {
        return payload.clone();
    }
    let mut next = payload.clone();
    if let Some(obj) = next.as_object_mut() {
        if obj
            .get("hook_event_name")
            .or_else(|| obj.get("hookEventName"))
            .and_then(|v| v.as_str())
            .is_none_or(|s| s.is_empty())
        {
            obj.insert("hook_event_name".to_string(), Value::String(name));
        }
    }
    next
}

fn antigravity_event_name(payload: &Value) -> String {
    if let Some(name) = payload
        .get("hook_event_name")
        .or_else(|| payload.get("hookEventName"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return name.to_string();
    }
    if payload.get("toolCall").is_some() {
        return "PreToolUse".to_string();
    }
    if payload.get("invocationNum").is_some() || payload.get("invocation_num").is_some() {
        return "PreInvocation".to_string();
    }
    String::new()
}

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event_owned = antigravity_event_name(payload);
    let hook_event = hook_event_owned.as_str();

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
