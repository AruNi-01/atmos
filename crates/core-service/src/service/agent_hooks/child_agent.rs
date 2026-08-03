//! Lead-session child-agent helpers.
//!
//! Terminal agents (Claude Code Task tools, Factory Droid subagents, etc.) can
//! spawn short-lived child agents under the same pane / lead session. Their hook
//! traffic often carries an `agent_id` and must not be treated as lead-session
//! completion: only the lead turn settling with no active children should go
//! Idle and fire task-complete notifications / attention.

use serde_json::Value;

/// Extract a non-empty child agent id from a hook payload, if present.
///
/// Lead-session events never carry this field; child tool / lifecycle events do.
pub(crate) fn extract_child_agent_id(payload: &Value) -> Option<&str> {
    payload
        .get("agent_id")
        .or_else(|| payload.get("agentId"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
}

/// True when the named event starts a tracked child.
pub(crate) fn is_child_start_event(event_name: &str) -> bool {
    matches!(
        event_name,
        "SubagentStart" | "subagentStart" | "subagent_start"
    )
}

/// True when the named event ends a tracked child.
pub(crate) fn is_child_stop_event(event_name: &str) -> bool {
    matches!(
        event_name,
        "SubagentStop" | "subagentStop" | "subagent_stop"
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
        assert_eq!(extract_child_agent_id(&serde_json::json!({})), None);
    }
}
