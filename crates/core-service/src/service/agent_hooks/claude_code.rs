use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if is_subagent(payload) {
        debug!(
            "Skipping Claude Code subagent hook event: {} agent_id={:?} agent_type={:?}",
            hook_event,
            payload.get("agent_id").and_then(|v| v.as_str()),
            payload.get("agent_type").and_then(|v| v.as_str())
        );
        return;
    }

    let session_id = service.resolve_session_id(payload, AgentToolType::ClaudeCode, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!(
        "Claude Code hook event: {} session_id={}",
        hook_event, session_id
    );

    // If this session is actively running/waiting under a different tool
    // (e.g. opencode using Claude as backend), skip — the owning tool is
    // authoritative. But if the session is idle, allow takeover (the user
    // may have quit one agent and started another in the same terminal).
    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::ClaudeCode && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Claude Code event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "PermissionRequest" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentHookState::PermissionRequest,
                project_path,
                ctx,
            );
        }
        "Notification" => {
            let notification_type = payload
                .get("notification_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if notification_type == "permission_prompt" || notification_type == "permissionprompt" {
                service.update_state(
                    &session_id,
                    AgentToolType::ClaudeCode,
                    AgentHookState::PermissionRequest,
                    project_path,
                    ctx,
                );
            }
        }
        "Stop" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        _ => {
            debug!("Unhandled Claude Code hook event: {}", hook_event);
        }
    }
}

fn is_subagent(payload: &Value) -> bool {
    payload
        .get("agent_id")
        .and_then(|v| v.as_str())
        .is_some_and(|v| !v.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_code_root_events_still_update_state() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "root-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "root-session");
        assert_eq!(sessions[0].tool, AgentToolType::ClaudeCode);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn claude_code_subagent_events_are_ignored() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "subagent-session",
            "cwd": "/tmp/project",
            "agent_id": "agent-123",
            "agent_type": "Explore",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        assert!(service.get_all_sessions().is_empty());
    }
}
