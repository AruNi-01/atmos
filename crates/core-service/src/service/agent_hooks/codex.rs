use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Codex, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!("Codex hook event: {} session_id={}", hook_event, session_id);

    // If this session is actively running/waiting under a different tool
    // (e.g. another adapter owning the same pane_id), skip — the owning tool is
    // authoritative. But if the session is idle, allow takeover.
    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Codex && existing.state != AgentHookState::Idle {
            debug!(
                "Skipping Codex event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        // Codex only reliably fires SessionStart and Stop.
        // SessionStart means the user has started a session → running.
        "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        "Stop" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        _ => {
            debug!("Unhandled Codex hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_running_events_update_state() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "codex-session");
        assert_eq!(sessions[0].tool, AgentToolType::Codex);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn codex_stop_events_set_idle() {
        let service = AgentHooksService::new();
        let running = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });
        let stop = serde_json::json!({
            "hook_event_name": "Stop",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &running, &AtmosContext::default());
        handle_event(&service, &stop, &AtmosContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn codex_does_not_take_over_active_session_owned_by_other_tool() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext {
            pane_id: Some("shared-pane".to_string()),
            ..AtmosContext::default()
        };

        service.update_state(
            "shared-pane",
            AgentToolType::Opencode,
            AgentHookState::Running,
            Some("/tmp/project".to_string()),
            &ctx,
        );

        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &ctx);

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "shared-pane");
        assert_eq!(sessions[0].tool, AgentToolType::Opencode);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn codex_can_take_over_when_other_tool_session_is_idle() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext {
            pane_id: Some("shared-pane".to_string()),
            ..AtmosContext::default()
        };

        service.update_state(
            "shared-pane",
            AgentToolType::Opencode,
            AgentHookState::Idle,
            Some("/tmp/project".to_string()),
            &ctx,
        );

        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &ctx);

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "shared-pane");
        assert_eq!(sessions[0].tool, AgentToolType::Codex);
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }
}
