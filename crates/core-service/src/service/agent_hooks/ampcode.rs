use serde_json::Value;
use tracing::debug;

use super::{AgentHookState, AgentHooksService, AgentToolType, AtmosContext};

pub(super) fn handle_event(service: &AgentHooksService, payload: &Value, ctx: &AtmosContext) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = service.resolve_session_id(payload, AgentToolType::Ampcode, ctx);
    let project_path = AgentHooksService::extract_cwd(payload).map(String::from);

    debug!("ampcode hook event: {} session_id={}", hook_event, session_id);

    match hook_event {
        // Session init → Idle baseline
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        // Agent begins a turn → Running
        "AgentStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentHookState::Running,
                project_path,
                ctx,
            );
        }
        // Tool events → Running, idempotent: skip broadcast if already Running
        "ToolCall" | "ToolResult" => {
            let current = service.sessions.read().get(&session_id).map(|s| s.state);
            if current != Some(AgentHookState::Running) {
                service.update_state(
                    &session_id,
                    AgentToolType::Ampcode,
                    AgentHookState::Running,
                    project_path,
                    ctx,
                );
            }
        }
        // Agent turn finished (done/error/cancelled) → Idle
        // This is the compensation event: even if AgentStart or ToolCall were lost,
        // AgentEnd always fires and resets state to Idle.
        "AgentEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::Ampcode,
                AgentHookState::Idle,
                project_path,
                ctx,
            );
        }
        _ => {
            debug!("Unhandled ampcode hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_start_sets_idle() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "SessionStart",
            "session_id": "amp-session-1",
        });
        handle_event(&service, &payload, &AtmosContext::default());
        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Ampcode);
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn agent_start_sets_running() {
        let service = AgentHooksService::new();
        let payload = serde_json::json!({
            "hook_event_name": "AgentStart",
            "session_id": "amp-session-1",
        });
        handle_event(&service, &payload, &AtmosContext::default());
        let sessions = service.get_all_sessions();
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn tool_call_idempotent_when_already_running() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext::default();
        let start = serde_json::json!({ "hook_event_name": "AgentStart", "session_id": "s1" });
        let tool_call = serde_json::json!({ "hook_event_name": "ToolCall", "session_id": "s1", "tool": "bash" });
        handle_event(&service, &start, &ctx);
        handle_event(&service, &tool_call, &ctx);
        // Still Running, no duplicate broadcast needed
        let sessions = service.get_all_sessions();
        assert_eq!(sessions[0].state, AgentHookState::Running);
    }

    #[test]
    fn agent_end_compensates_for_missed_start() {
        let service = AgentHooksService::new();
        let ctx = AtmosContext::default();
        // Simulate: AgentStart was lost, only AgentEnd arrives
        let end = serde_json::json!({
            "hook_event_name": "AgentEnd",
            "session_id": "s1",
            "status": "done",
        });
        handle_event(&service, &end, &ctx);
        let sessions = service.get_all_sessions();
        assert_eq!(sessions[0].state, AgentHookState::Idle);
    }

    #[test]
    fn agent_end_error_and_cancelled_also_set_idle() {
        for status in ["error", "cancelled"] {
            let service = AgentHooksService::new();
            let ctx = AtmosContext::default();
            let start = serde_json::json!({ "hook_event_name": "AgentStart", "session_id": "s1" });
            let end = serde_json::json!({
                "hook_event_name": "AgentEnd",
                "session_id": "s1",
                "status": status,
            });
            handle_event(&service, &start, &ctx);
            handle_event(&service, &end, &ctx);
            let sessions = service.get_all_sessions();
            assert_eq!(sessions[0].state, AgentHookState::Idle, "status={}", status);
        }
    }
}
