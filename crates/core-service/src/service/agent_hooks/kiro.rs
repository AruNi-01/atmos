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

    let session_id = resolve_session_id(payload, AgentToolType::Kiro, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!("Kiro hook event: {} session_id={}", hook_event, session_id);

    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::Kiro && existing.state != AgentOccupancy::Idle {
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
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "userPromptSubmit" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "preToolUse" | "postToolUse" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "stop" => {
            service.update_state(
                &session_id,
                AgentToolType::Kiro,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
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
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "agentSpawn",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn kiro_tool_use_events_set_running() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "preToolUse",
            "session_id": "kiro-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn kiro_stop_sets_idle() {
        let service = AgentStatusService::new();
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

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &stop, &AgentStatusContext::default());

        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }
}
