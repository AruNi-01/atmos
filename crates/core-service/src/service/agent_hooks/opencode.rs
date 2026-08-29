use serde_json::Value;
use tracing::debug;

use super::{extract_cwd, resolve_session_id};
use crate::service::agent_status::{
    AgentOccupancy, AgentStatusContext, AgentStatusService, AgentToolType, OccupancyUpdateKind,
};

fn permission_replied_state(payload: &Value) -> Option<AgentOccupancy> {
    let response = payload
        .get("properties")
        .and_then(|v| v.as_object())
        .and_then(|properties| {
            properties
                .get("response")
                .or_else(|| properties.get("decision"))
                .or_else(|| properties.get("outcome"))
        })
        .and_then(|v| v.as_str())?;

    match response {
        "once" | "always" | "allow_once" | "allow_always" | "granted" | "grant" => {
            Some(AgentOccupancy::Running)
        }
        "reject" | "reject_once" | "reject_always" | "denied" | "deny" => {
            Some(AgentOccupancy::Idle)
        }
        _ => None,
    }
}

pub(super) fn handle_event(
    service: &AgentStatusService,
    payload: &Value,
    ctx: &AgentStatusContext,
) {
    let event_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");

    let session_id = resolve_session_id(payload, AgentToolType::Opencode, ctx);
    let project_path = extract_cwd(payload).map(String::from);

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
                AgentOccupancy::Idle,
                project_path,
                ctx,
                if event_type == "session.created" {
                    OccupancyUpdateKind::NewTurn
                } else {
                    OccupancyUpdateKind::TerminalIdle
                },
            );
        }
        "agent.running"
        | "message.part.delta"
        | "message.part.updated"
        | "message.updated"
        | "tool.execute.before"
        | "tool.execute.after" => {
            let current = service.sessions.read().get(&session_id).map(|s| s.state);
            if current != Some(AgentOccupancy::Running) {
                service.update_state(
                    &session_id,
                    AgentToolType::Opencode,
                    AgentOccupancy::Running,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Progress,
                );
            }
        }
        "permission.asked" | "permission.updated" | "question.asked" => {
            service.update_state(
                &session_id,
                AgentToolType::Opencode,
                AgentOccupancy::PermissionRequest,
                project_path,
                ctx,
                OccupancyUpdateKind::Permission,
            );
        }
        "permission.replied" => {
            if let Some(next_state) = permission_replied_state(payload) {
                let kind = if next_state == AgentOccupancy::Idle {
                    OccupancyUpdateKind::TerminalIdle
                } else {
                    OccupancyUpdateKind::Progress
                };
                service.update_state(
                    &session_id,
                    AgentToolType::Opencode,
                    next_state,
                    project_path,
                    ctx,
                    kind,
                );
            }
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
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "type": "permission.asked",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].tool, AgentToolType::Opencode);
        assert_eq!(sessions[0].state, AgentOccupancy::PermissionRequest);
    }

    #[test]
    fn opencode_question_asked_sets_permission_request() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "type": "question.asked",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::PermissionRequest);
    }

    #[test]
    fn opencode_idle_events_set_idle() {
        let service = AgentStatusService::new();
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

        handle_event(&service, &running, &AgentStatusContext::default());
        handle_event(&service, &idle, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn opencode_permission_replied_with_grant_sets_running() {
        let service = AgentStatusService::new();
        let asked = serde_json::json!({
            "type": "permission.asked",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });
        let replied = serde_json::json!({
            "type": "permission.replied",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
            "properties": {
                "response": "once",
            }
        });

        handle_event(&service, &asked, &AgentStatusContext::default());
        handle_event(&service, &replied, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn opencode_permission_replied_with_reject_sets_idle() {
        let service = AgentStatusService::new();
        let asked = serde_json::json!({
            "type": "permission.asked",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
        });
        let replied = serde_json::json!({
            "type": "permission.replied",
            "session_id": "opencode-session",
            "cwd": "/tmp/project",
            "properties": {
                "response": "reject",
            }
        });

        handle_event(&service, &asked, &AgentStatusContext::default());
        handle_event(&service, &replied, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
    }
}
