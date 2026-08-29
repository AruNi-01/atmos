use serde_json::Value;
use tracing::debug;

use super::{extract_cwd, resolve_session_id};
use crate::service::agent_status::{
    AgentOccupancy, AgentStatusContext, AgentStatusService, AgentToolType, OccupancyUpdateKind,
};

pub(super) fn handle_event(
    service: &AgentStatusService,
    payload: &Value,
    ctx: &AgentStatusContext,
) {
    let hook_event = payload
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let session_id = resolve_session_id(payload, AgentToolType::Codex, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!("Codex hook event: {} session_id={}", hook_event, session_id);

    // If this session is actively running/waiting under a different tool
    // (e.g. another adapter owning the same pane_id), skip — the owning tool is
    // authoritative. But if the session is idle, allow takeover.
    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Codex && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Codex event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    match hook_event {
        // Session open is not a turn; only prompt/tool events mark running.
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "UserPromptSubmit" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "PreToolUse" | "PostToolUse" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "Stop" | "StopFailure" | "SessionEnd" => {
            service.update_state(
                &session_id,
                AgentToolType::Codex,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
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
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "codex-session");
        assert_eq!(sessions[0].tool, AgentToolType::Codex);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn codex_session_start_sets_idle() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "SessionStart",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });
        handle_event(&service, &payload, &AgentStatusContext::default());
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn codex_stop_events_set_idle() {
        let service = AgentStatusService::new();
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

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &stop, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn codex_does_not_take_over_active_session_owned_by_other_tool() {
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext {
            pane_id: Some("shared-pane".to_string()),
            ..AgentStatusContext::default()
        };

        service.update_state(
            "shared-pane",
            AgentToolType::Opencode,
            AgentOccupancy::Running,
            Some("/tmp/project".to_string()),
            &ctx,
            OccupancyUpdateKind::Progress,
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
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn codex_can_take_over_when_other_tool_session_is_idle() {
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext {
            pane_id: Some("shared-pane".to_string()),
            ..AgentStatusContext::default()
        };

        // Session-start style idle (NewTurn) so the next tool can take over;
        // TerminalIdle would suppress Progress for a short window.
        service.update_state(
            "shared-pane",
            AgentToolType::Opencode,
            AgentOccupancy::Idle,
            Some("/tmp/project".to_string()),
            &ctx,
            OccupancyUpdateKind::NewTurn,
        );

        let payload = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "codex-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &ctx);

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "shared-pane");
        assert_eq!(sessions[0].tool, AgentToolType::Codex);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }
}
