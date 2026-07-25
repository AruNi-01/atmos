use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext, StateUpdateKind};

fn hook_event_name(payload: &Value) -> &str {
    payload
        .get("hook_event_name")
        .or_else(|| payload.get("hookEventName"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

fn notification_type(payload: &Value) -> Option<&str> {
    payload
        .get("notificationType")
        .or_else(|| payload.get("notification_type"))
        .and_then(|v| v.as_str())
}

/// Normalize Grok wire names (snake_case / PascalCase / camelCase aliases) to a stable match key.
fn normalize_event(name: &str) -> String {
    name.trim().to_ascii_lowercase().replace('-', "_")
}

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let raw_event = hook_event_name(payload);
    let event = normalize_event(raw_event);

    let session_id = service.resolve_session_id(payload, AgentToolType::GrokBuild, ctx);
    // Prefer payload cwd; fall back to the existing session path so later events
    // without cwd do not wipe a previously known project path.
    let project_path = AgentHooksService::extract_cwd(payload)
        .map(String::from)
        .or_else(|| {
            service
                .sessions
                .read()
                .get(&session_id)
                .and_then(|session| session.project_path.clone())
        });

    debug!(
        "Grok Build hook event: {} (normalized={}) session_id={}",
        raw_event, event, session_id
    );

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::GrokBuild && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Grok Build event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match event.as_str() {
        "sessionstart" | "session_start" => {
            service.update_state(
                &session_id,
                AgentToolType::GrokBuild,
                AgentHookState::Idle,
                project_path,
                ctx,
                StateUpdateKind::NewTurn,
            );
        }
        "userpromptsubmit" | "user_prompt_submit" => {
            service.update_state(
                &session_id,
                AgentToolType::GrokBuild,
                AgentHookState::Running,
                project_path,
                ctx,
                StateUpdateKind::NewTurn,
            );
        }
        "pretooluse"
        | "pre_tool_use"
        | "posttooluse"
        | "post_tool_use"
        | "posttoolusefailure"
        | "post_tool_use_failure" => {
            service.update_state(
                &session_id,
                AgentToolType::GrokBuild,
                AgentHookState::Running,
                project_path,
                ctx,
                StateUpdateKind::Progress,
            );
        }
        "notification" => match notification_type(payload) {
            Some("permission_prompt") | Some("elicitation_dialog") => {
                service.update_state(
                    &session_id,
                    AgentToolType::GrokBuild,
                    AgentHookState::PermissionRequest,
                    project_path,
                    ctx,
                    StateUpdateKind::Permission,
                );
            }
            other => {
                debug!(
                    "Ignoring Grok Build Notification type {:?} for session {}",
                    other, session_id
                );
            }
        },
        "permissiondenied" | "permission_denied" => {
            // Already denied; not waiting on the user.
        }
        "stop" | "stopfailure" | "stop_failure" | "sessionend" | "session_end" => {
            service.update_state(
                &session_id,
                AgentToolType::GrokBuild,
                AgentHookState::Idle,
                project_path,
                ctx,
                StateUpdateKind::TerminalIdle,
            );
        }
        name if name.starts_with("subagent") || name.contains("compact") => {
            // Subagent / compact lifecycle — parent owns status.
        }
        _ => {
            debug!("Unhandled Grok Build hook event: {}", raw_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_hooks::AgentHookState;

    fn fire(service: &AgentHooksService, payload: Value) {
        handle_event(service, &payload, &AtmosContext::default());
    }

    #[test]
    fn grok_state_mapping_matrix() {
        let service = AgentHooksService::new();
        let sid = "grok-session";

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "session_start",
                "sessionId": sid,
                "cwd": "/tmp/proj",
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "user_prompt_submit",
                "sessionId": sid,
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);

        fire(
            &service,
            serde_json::json!({
                "hook_event_name": "PreToolUse",
                "session_id": sid,
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "notification",
                "sessionId": sid,
                "notificationType": "permission_prompt",
            }),
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::PermissionRequest
        );

        // idle_prompt must not change PermissionRequest
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "notification",
                "sessionId": sid,
                "notificationType": "idle_prompt",
            }),
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::PermissionRequest
        );

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "stop",
                "sessionId": sid,
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Idle);
    }

    #[test]
    fn elicitation_dialog_sets_permission_request() {
        let service = AgentHooksService::new();
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "notification",
                "sessionId": "g2",
                "notificationType": "elicitation_dialog",
            }),
        );
        assert_eq!(
            service.get_all_sessions()[0].state,
            AgentHookState::PermissionRequest
        );
    }

    #[test]
    fn task_complete_and_permission_denied_are_noops() {
        let service = AgentHooksService::new();
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "user_prompt_submit",
                "sessionId": "g3",
            }),
        );
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "notification",
                "sessionId": "g3",
                "notificationType": "task_complete",
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "permission_denied",
                "sessionId": "g3",
            }),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentHookState::Running);
    }

    #[test]
    fn foreign_tool_ownership_blocks_takeover() {
        let service = AgentHooksService::new();
        // Seed Claude ownership via its public handler
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "session_id": "shared-pane",
                "cwd": "/tmp",
            }),
            &AtmosContext::default(),
        );

        fire(
            &service,
            serde_json::json!({
                "hookEventName": "pre_tool_use",
                "sessionId": "shared-pane",
            }),
        );

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::ClaudeCode);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn accepts_workspace_root_cwd_fields() {
        let service = AgentHooksService::new();
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "session_start",
                "sessionId": "g4",
                "workspaceRoot": "/Users/me/proj",
            }),
        );
        assert_eq!(
            service.get_all_sessions()[0].project_path.as_deref(),
            Some("/Users/me/proj")
        );
    }

    #[test]
    fn later_events_without_cwd_keep_existing_project_path() {
        let service = AgentHooksService::new();
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "session_start",
                "sessionId": "g5",
                "cwd": "/tmp/kept",
            }),
        );
        fire(
            &service,
            serde_json::json!({
                "hookEventName": "pre_tool_use",
                "sessionId": "g5",
            }),
        );
        assert_eq!(
            service.get_all_sessions()[0].project_path.as_deref(),
            Some("/tmp/kept")
        );
    }
}
