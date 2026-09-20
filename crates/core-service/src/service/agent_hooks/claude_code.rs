use serde_json::Value;
use tracing::debug;

use super::{
    extract_child_agent_id, extract_cwd, is_child_start_event, is_child_stop_event,
    resolve_session_id,
};
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

    let session_id = resolve_session_id(payload, AgentToolType::ClaudeCode, ctx);
    let project_path = extract_cwd(payload).map(String::from);

    debug!(
        "Claude Code hook event: {} session_id={}",
        hook_event, session_id
    );

    // If this session is actively running/waiting under a different tool
    // (e.g. opencode using Claude as backend), skip — the owning tool is
    // authoritative. But if the session is idle, allow takeover (the user
    // may have quit one agent and started another in the same terminal).
    if let Some(existing) = service.sessions.read().get(&session_id) {
        if existing.tool != AgentToolType::ClaudeCode && existing.state != AgentOccupancy::Idle {
            debug!(
                "Skipping Claude Code event for session {} actively owned by {}",
                session_id, existing.tool
            );
            return;
        }
    }

    // Explicit child lifecycle (SubagentStart / SubagentStop).
    if is_child_start_event(hook_event) || is_child_stop_event(hook_event) {
        if let Some(child_id) = extract_child_agent_id(payload) {
            service.handle_child_lifecycle(
                &session_id,
                AgentToolType::ClaudeCode,
                project_path,
                ctx,
                child_id,
                is_child_start_event(hook_event),
            );
        } else {
            debug!(
                "Claude Code {} missing agent_id; ignoring lifecycle event",
                hook_event
            );
        }
        return;
    }

    // Child-origin traffic carries agent_id; never owns lead completion.
    if let Some(child_id) = extract_child_agent_id(payload) {
        match hook_event {
            "PreToolUse" | "PostToolUse" | "PostToolUseFailure" => {
                service.handle_child_origin_event(
                    &session_id,
                    AgentToolType::ClaudeCode,
                    project_path,
                    ctx,
                    child_id,
                    AgentOccupancy::Running,
                    OccupancyUpdateKind::Progress,
                );
            }
            "PermissionRequest" => {
                service.handle_child_origin_event(
                    &session_id,
                    AgentToolType::ClaudeCode,
                    project_path,
                    ctx,
                    child_id,
                    AgentOccupancy::PermissionRequest,
                    OccupancyUpdateKind::Permission,
                );
            }
            "Notification" => {
                let notification_type = payload
                    .get("notification_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if notification_type == "permission_prompt"
                    || notification_type == "permissionprompt"
                {
                    service.handle_child_origin_event(
                        &session_id,
                        AgentToolType::ClaudeCode,
                        project_path,
                        ctx,
                        child_id,
                        AgentOccupancy::PermissionRequest,
                        OccupancyUpdateKind::Permission,
                    );
                }
            }
            "Stop" | "StopFailure" | "SessionEnd" | "UserPromptSubmit" | "SessionStart" => {
                debug!(
                    "Ignoring child-origin {} for session {} child={}",
                    hook_event, session_id, child_id
                );
            }
            _ => {
                debug!(
                    "Ignoring child-origin Claude Code event {} child={}",
                    hook_event, child_id
                );
            }
        }
        return;
    }

    match hook_event {
        "SessionStart" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "UserPromptSubmit" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::NewTurn,
            );
        }
        "PreToolUse" | "PostToolUse" | "PostToolUseFailure" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentOccupancy::Running,
                project_path,
                ctx,
                OccupancyUpdateKind::Progress,
            );
        }
        "PermissionRequest" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentOccupancy::PermissionRequest,
                project_path,
                ctx,
                OccupancyUpdateKind::Permission,
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
                    AgentOccupancy::PermissionRequest,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::Permission,
                );
            }
        }
        "Stop" | "StopFailure" => {
            service.update_state(
                &session_id,
                AgentToolType::ClaudeCode,
                AgentOccupancy::Idle,
                project_path,
                ctx,
                OccupancyUpdateKind::TerminalIdle,
            );
        }
        "SessionEnd" => {
            // Session teardown — drop child roster and settle.
            service.force_session_idle(&session_id);
            // force_session_idle no-ops when missing; ensure a row if needed.
            if service.sessions.read().get(&session_id).is_none() {
                service.update_state(
                    &session_id,
                    AgentToolType::ClaudeCode,
                    AgentOccupancy::Idle,
                    project_path,
                    ctx,
                    OccupancyUpdateKind::ForcedIdle,
                );
            }
        }
        _ => {
            debug!("Unhandled Claude Code hook event: {}", hook_event);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_code_root_events_still_update_state() {
        let service = AgentStatusService::new();
        let payload = serde_json::json!({
            "hook_event_name": "UserPromptSubmit",
            "session_id": "root-session",
            "cwd": "/tmp/project",
        });

        handle_event(&service, &payload, &AgentStatusContext::default());

        let sessions = service.get_all_sessions();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "root-session");
        assert_eq!(sessions[0].tool, AgentToolType::ClaudeCode);
        assert_eq!(sessions[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn claude_code_child_stop_does_not_idle_lead() {
        let service = AgentStatusService::new();
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "Stop",
                "session_id": "s1",
                "cwd": "/tmp/project",
                "agent_id": "agent-123",
            }),
            &AgentStatusContext::default(),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);
    }

    #[test]
    fn claude_code_lead_stop_defers_while_child_active() {
        let service = AgentStatusService::new();
        let ctx = AgentStatusContext::default();
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &ctx,
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "session_id": "s1",
                "cwd": "/tmp/project",
                "agent_id": "a1",
                "agent_type": "Explore",
            }),
            &ctx,
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "Stop",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &ctx,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Running);

        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "SubagentStop",
                "session_id": "s1",
                "cwd": "/tmp/project",
                "agent_id": "a1",
            }),
            &ctx,
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn claude_code_session_end_and_stop_failure_set_idle() {
        let service = AgentStatusService::new();
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "StopFailure",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);

        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "SessionEnd",
                "session_id": "s1",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn claude_code_late_post_tool_after_stop_stays_idle() {
        let service = AgentStatusService::new();
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s2",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "Stop",
                "session_id": "s2",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "session_id": "s2",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }

    #[test]
    fn claude_code_child_tool_does_not_invent_roster() {
        let service = AgentStatusService::new();
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "session_id": "s3",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "session_id": "s3",
                "cwd": "/tmp/project",
                "agent_id": "ghost",
                "tool_name": "Bash",
            }),
            &AgentStatusContext::default(),
        );
        // Lead Stop should complete — untracked child tool traffic must not
        // invent a roster row that defers completion forever.
        handle_event(
            &service,
            &serde_json::json!({
                "hook_event_name": "Stop",
                "session_id": "s3",
                "cwd": "/tmp/project",
            }),
            &AgentStatusContext::default(),
        );
        assert_eq!(service.get_all_sessions()[0].state, AgentOccupancy::Idle);
    }
}
