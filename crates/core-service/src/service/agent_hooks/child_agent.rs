//! Lead-session child-agent helpers.
//!
//! Terminal agents (Claude Code Task tools, Factory Droid subagents, etc.) can
//! spawn short-lived child agents under the same pane / lead session. Their hook
//! traffic often carries an `agent_id` and must not be treated as lead-session
//! completion: only the lead turn settling with no active children should go
//! Idle and fire task-complete notifications / attention.

use serde_json::Value;

const CHILD_ID_KEYS: &[&str] = &[
    "agent_id",
    "agentId",
    "subagent_id",
    "subagentId",
    "child_session_id",
    "childSessionId",
    "child_id",
    "childId",
];

/// Extract a non-empty child agent id from a hook payload, if present.
///
/// Lead-session events never carry this field; child tool / lifecycle events do.
/// Grok uses `subagent_id` / `child_session_id` instead of Claude's `agent_id`.
pub(crate) fn extract_child_agent_id(payload: &Value) -> Option<&str> {
    extract_id_from(payload)
        .or_else(|| payload.get("tool_input").and_then(extract_id_from))
        .or_else(|| payload.get("toolInput").and_then(extract_id_from))
        .or_else(|| payload.get("toolCall").and_then(extract_id_from))
        .or_else(|| payload.get("tool_call").and_then(extract_id_from))
        .or_else(|| payload.get("properties").and_then(extract_id_from))
}

fn extract_id_from(value: &Value) -> Option<&str> {
    for key in CHILD_ID_KEYS {
        if let Some(id) = value
            .get(*key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            return Some(id);
        }
    }
    None
}

/// True when the named event starts a tracked child.
pub(crate) fn is_child_start_event(event_name: &str) -> bool {
    matches!(
        event_name,
        "SubagentStart"
            | "subagentStart"
            | "subagent_start"
            | "subagent_spawned"
            | "subagentSpawned"
    )
}

/// True when the named event ends a tracked child.
pub(crate) fn is_child_stop_event(event_name: &str) -> bool {
    matches!(
        event_name,
        "SubagentStop"
            | "subagentStop"
            | "subagent_stop"
            | "subagent_finished"
            | "subagentFinished"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_agent_id_variants() {
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({"agent_id": "a1"})),
            Some("a1")
        );
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({"agentId": "  b2  "})),
            Some("b2")
        );
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({"agent_id": ""})),
            None
        );
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({"subagent_id": "sa-1"})),
            Some("sa-1")
        );
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({"child_session_id": "child-9"})),
            Some("child-9")
        );
        assert_eq!(extract_child_agent_id(&serde_json::json!({})), None);
        assert_eq!(
            extract_child_agent_id(&serde_json::json!({
                "tool_input": { "subagent_id": "nested-1" }
            })),
            Some("nested-1")
        );
    }
}
