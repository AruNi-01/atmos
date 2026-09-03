use crate::acp_client::types::ToolCallUpdate;
use crate::map::{extract_command, extract_path, extract_query, extract_url};

use super::looks_untyped;

/// DeepSeek Harness often reports ACP `kind: other` with typed fields in `rawInput`.
pub(super) fn prepare(update: &ToolCallUpdate) -> ToolCallUpdate {
    let mut next = update.clone();
    if !looks_untyped(&next) {
        return next;
    }
    let input = next.raw_input.as_ref();
    if input.and_then(extract_command).is_some() {
        next.acp_kind = Some("execute".into());
        return next;
    }
    if input.and_then(extract_url).is_some() {
        next.acp_kind = Some("fetch".into());
        return next;
    }
    if input.and_then(extract_query).is_some()
        || input.is_some_and(|value| super::first_string(value, &["glob"]).is_some())
        || !next.locations.is_empty()
    {
        next.acp_kind = Some("search".into());
        return next;
    }
    if input.and_then(extract_path).is_some() {
        next.acp_kind = Some("read".into());
        return next;
    }
    next
}

#[cfg(test)]
mod tests {
    use super::super::super::tool_map::{map_tool_call, ToolMapOut};
    use super::super::OverlayState;
    use super::*;
    use crate::acp_client::types::{AgentToolCallContentItem, ToolCallStatus};
    use crate::contract::AgentToolKind;
    use crate::contract::{AgentToolParams, AgentToolResult};

    fn update(
        name: &str,
        status: ToolCallStatus,
        input: serde_json::Value,
        output: Option<serde_json::Value>,
    ) -> ToolCallUpdate {
        ToolCallUpdate {
            tool_call_id: "tc_1".into(),
            parent_tool_call_id: None,
            tool: name.into(),
            description: String::new(),
            acp_kind: Some("other".into()),
            status,
            raw_input: Some(input),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: output,
            detail: None,
        }
    }

    fn mapped(update: ToolCallUpdate) -> crate::contract::AgentTool {
        match map_tool_call("deepseek-harness", &update, &mut OverlayState::default()) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        }
    }

    #[test]
    fn other_file_path_maps_to_read() {
        let mut call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({"file_path": "/tmp/app/Cargo.toml"}),
            None,
        );
        call.description = "/tmp/app/Cargo.toml".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "[workspace]\n".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Read);
        assert_eq!(tool.title, None);
        match tool.params {
            AgentToolParams::Read { path, .. } => assert_eq!(path, "/tmp/app/Cargo.toml"),
            other => panic!("expected read params, got {other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::FileContent { path, text }) => {
                assert_eq!(path, "/tmp/app/Cargo.toml");
                assert_eq!(text, "[workspace]\n");
            }
            other => panic!("expected file content, got {other:?}"),
        }
    }

    #[test]
    fn other_command_maps_to_execute() {
        let mut call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({
                "command": "ls apps crates packages",
                "description": "List apps, crates, packages layout"
            }),
            None,
        );
        call.description = "List apps, crates, packages layout".into();
        call.content = vec![AgentToolCallContentItem::Text {
            text: "apps\ncrates\npackages\n".into(),
        }];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Execute);
        match tool.params {
            AgentToolParams::Execute { command, .. } => {
                assert_eq!(command, "ls apps crates packages");
            }
            other => panic!("expected execute params, got {other:?}"),
        }
    }

    #[test]
    fn other_locations_map_to_search_hits() {
        let mut call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({}),
            None,
        );
        call.locations = vec!["/tmp/app/Cargo.toml".into(), "/tmp/app/package.json".into()];
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Search);
        match tool.result {
            Some(AgentToolResult::SearchHits { hits, .. }) => {
                assert_eq!(hits.len(), 2);
                assert_eq!(hits[0].path, "/tmp/app/Cargo.toml");
            }
            other => panic!("expected search hits, got {other:?}"),
        }
    }

    #[test]
    fn other_path_and_query_maps_to_search() {
        let call = update(
            "Tool",
            ToolCallStatus::Completed,
            serde_json::json!({
                "path": "/tmp/app",
                "query": "AgentLaunchSpec"
            }),
            None,
        );
        let tool = mapped(call);
        assert_eq!(tool.kind, AgentToolKind::Search);
    }
}
