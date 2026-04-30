use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

fn extract_tool_name(payload: &Value) -> Option<&str> {
    payload
        .get("tool_name")
        .or_else(|| payload.get("toolName"))
        .or_else(|| payload.get("tool"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            payload
                .get("tool")
                .and_then(|t| t.get("name"))
                .and_then(|v| v.as_str())
        })
}

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::FactoryDroid, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "Factory Droid hook event: {} session_id={}",
        hook_event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::FactoryDroid && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Factory Droid event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::FactoryDroid,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "PreToolUse" => {
            let tool_name = extract_tool_name(payload);
            if tool_name == Some("AskUser") {
                service.update_state(
                    &session_id,
                    AgentToolType::FactoryDroid,
                    AgentHookState::PermissionRequest,
                    project_path,
                    ctx,
                );
            } else {
                service.update_state(
                    &session_id,
                    AgentToolType::FactoryDroid,
                    AgentHookState::Running,
                    project_path,
                    ctx,
                );
            }
        }
        "UserPromptSubmit" | "PostToolUse" | "SubagentStart" | "PreCompact" => {
            service.update_state(
                &session_id,
                AgentToolType::FactoryDroid,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "Notification" => {
            service.update_state(
                &session_id,
                AgentToolType::FactoryDroid,
                AgentHookState::PermissionRequest,
                project_path,
                ctx,
            );
        }
        "Stop" | "SessionEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::FactoryDroid,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "SubagentStop" => {
            // SubagentStop doesn't mean the main agent stopped — keep current state
        }
        _ => {
            debug!("Unhandled Factory Droid hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_droid_pretooluse_sets_running() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
            "tool_name": "Execute",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::FactoryDroid);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn factory_droid_askuser_sets_permission_request() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
            "tool_name": "AskUser",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::PermissionRequest);
    }

    #[test]
    fn factory_droid_notification_sets_permission_request() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "Notification",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::PermissionRequest);
    }

    #[test]
    fn factory_droid_subagent_stop_keeps_state() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
        });
        let subagent_stop = serde_json::json!({
            "hook_event_name": "SubagentStop",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &subagent_stop, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn factory_droid_stop_sets_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "Stop",
            "session_id": "droid-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &stop, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }
}
