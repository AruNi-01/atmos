use agent::{AgentTool, AgentToolParams, AgentToolResult};

use super::types::{AgentChatEvent, AgentChatPayload, FoldedMessage, MessagePart};

pub const AGENT_CHAT_MESSAGE_PAGE_DEFAULT: usize = 20;
pub const AGENT_CHAT_MESSAGE_PAGE_MAX: usize = 100;
pub const AGENT_CHAT_TOOL_GET_MAX: usize = 20;
const SUMMARY_TEXT_MAX: usize = 240;

pub fn clamp_message_limit(limit: u32) -> usize {
    (limit as usize).clamp(1, AGENT_CHAT_MESSAGE_PAGE_MAX)
}

pub fn clamp_tool_get_ids(len: usize) -> usize {
    len.min(AGENT_CHAT_TOOL_GET_MAX)
}

/// Exclusive older-than window in fold order (oldest → newest).
/// Unknown `before_message_id` returns an empty page so clients do not loop.
pub fn page_messages(
    messages: &[FoldedMessage],
    limit: usize,
    before_message_id: Option<&str>,
) -> (Vec<FoldedMessage>, bool) {
    let limit = limit.clamp(1, AGENT_CHAT_MESSAGE_PAGE_MAX);
    let end = match before_message_id {
        Some(id) => match messages.iter().position(|message| message.id == id) {
            Some(index) => index,
            None => return (Vec::new(), false),
        },
        None => messages.len(),
    };
    let start = end.saturating_sub(limit);
    (messages[start..end].to_vec(), start > 0)
}

pub fn strip_message_tool_details(messages: &mut [FoldedMessage]) {
    for message in messages {
        for part in &mut message.parts {
            if let MessagePart::ToolCall { params, result, .. } = part {
                *params = summarize_params(params);
                *result = result.take().map(summarize_result);
            }
        }
    }
}

pub fn strip_event_tool_details(event: &mut AgentChatEvent) {
    match &mut event.payload {
        AgentChatPayload::TurnSnapshot { messages, .. } => {
            strip_message_tool_details(messages);
        }
        AgentChatPayload::ToolCallStarted { tool_call }
        | AgentChatPayload::ToolCallUpdated { tool_call }
        | AgentChatPayload::ToolCallCompleted { tool_call }
        | AgentChatPayload::ToolCallFailed { tool_call, .. } => {
            strip_agent_tool(tool_call);
        }
        _ => {}
    }
}

pub fn strip_agent_tool(tool: &mut AgentTool) {
    tool.params = summarize_params(&tool.params);
    if let Some(result) = tool.result.take() {
        tool.result = Some(summarize_result(result));
    }
}

pub fn collect_tool_parts(messages: &[FoldedMessage], ids: &[String]) -> Vec<MessagePart> {
    let mut parts = Vec::new();
    for id in ids.iter().take(AGENT_CHAT_TOOL_GET_MAX) {
        let found = messages.iter().find_map(|message| {
            message.parts.iter().find(|part| match part {
                MessagePart::ToolCall { tool_call_id, .. } => tool_call_id == id,
                _ => false,
            })
        });
        if let Some(part) = found {
            parts.push(part.clone());
        }
    }
    parts
}

/// Walk a serialized snapshot/event and flag stripped tool objects for the client.
pub fn mark_tool_details_omitted(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            let is_tool_part = map.get("type").and_then(|ty| ty.as_str()) == Some("tool_call");
            let is_tool_object = map.contains_key("tool_call_id")
                && map.contains_key("params")
                && map.contains_key("kind")
                && map.contains_key("status");
            if is_tool_part || is_tool_object {
                map.insert("detail_omitted".to_string(), serde_json::Value::Bool(true));
            }
            for child in map.values_mut() {
                mark_tool_details_omitted(child);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                mark_tool_details_omitted(child);
            }
        }
        _ => {}
    }
}

fn summarize_params(params: &AgentToolParams) -> AgentToolParams {
    match params {
        AgentToolParams::Execute {
            command,
            cwd,
            background,
            task_id,
        } => AgentToolParams::Execute {
            command: truncate_chars(command, SUMMARY_TEXT_MAX),
            cwd: cwd.clone(),
            background: *background,
            task_id: task_id.clone(),
        },
        AgentToolParams::Subagent {
            description,
            agent_type,
            task_id,
            prompt: _,
        } => AgentToolParams::Subagent {
            description: description.clone(),
            agent_type: agent_type.clone(),
            task_id: task_id.clone(),
            prompt: None,
        },
        AgentToolParams::ImageGen {
            prompt,
            aspect_ratio,
            size,
            path,
            reference_paths: _,
        } => AgentToolParams::ImageGen {
            prompt: truncate_chars(prompt, SUMMARY_TEXT_MAX),
            aspect_ratio: aspect_ratio.clone(),
            size: size.clone(),
            path: path.clone(),
            reference_paths: None,
        },
        AgentToolParams::PlanDocument {
            name,
            overview,
            is_project,
            ..
        } => AgentToolParams::PlanDocument {
            name: name.clone(),
            overview: overview.clone(),
            plan: String::new(),
            todos: Vec::new(),
            is_project: *is_project,
            phases: None,
        },
        AgentToolParams::Other { .. } => AgentToolParams::Other {
            value: serde_json::Value::Null,
        },
        other => other.clone(),
    }
}

fn summarize_result(result: AgentToolResult) -> AgentToolResult {
    match result {
        AgentToolResult::Diff {
            path,
            old_content,
            new_content,
        } => AgentToolResult::DiffStats {
            path,
            additions: line_count(&new_content),
            deletions: line_count(old_content.as_deref().unwrap_or("")),
        },
        AgentToolResult::FileContent { .. } | AgentToolResult::Text { .. } => {
            AgentToolResult::Empty
        }
        AgentToolResult::Execute { exit_code, .. } => AgentToolResult::Execute {
            output: String::new(),
            exit_code,
        },
        AgentToolResult::WebFetch { url, title, .. } => AgentToolResult::WebFetch {
            url,
            title,
            markdown: None,
            text: None,
        },
        AgentToolResult::SearchHits { query, hits } => AgentToolResult::SearchHits {
            query,
            hits: hits
                .into_iter()
                .map(|mut hit| {
                    hit.snippet = None;
                    hit
                })
                .collect(),
        },
        AgentToolResult::WebSearch { query, links } => AgentToolResult::WebSearch {
            query,
            links: links
                .into_iter()
                .map(|mut link| {
                    link.snippet = None;
                    link
                })
                .collect(),
        },
        AgentToolResult::Other { .. } => AgentToolResult::Other {
            value: serde_json::Value::Null,
        },
        other => other,
    }
}

fn line_count(text: &str) -> u32 {
    if text.is_empty() {
        0
    } else {
        text.lines().count() as u32
    }
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    text.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent::{AgentToolKind, AgentToolStatus};
    use chrono::Utc;

    fn msg(id: &str, tool: Option<MessagePart>) -> FoldedMessage {
        FoldedMessage {
            id: id.into(),
            role: if tool.is_some() { "assistant" } else { "user" }.into(),
            parts: tool.into_iter().collect(),
            created_at: Utc::now(),
            ..Default::default()
        }
    }

    fn diff_tool() -> MessagePart {
        MessagePart::ToolCall {
            tool_call_id: "edit-1".into(),
            parent_tool_call_id: None,
            name: "Edit".into(),
            title: Some("src/a.ts".into()),
            kind: AgentToolKind::Edit,
            status: AgentToolStatus::Completed,
            params: AgentToolParams::Edit {
                path: "src/a.ts".into(),
            },
            result: Some(AgentToolResult::Diff {
                path: "src/a.ts".into(),
                old_content: Some("a\nb\n".into()),
                new_content: "a\nb\nc\n".into(),
            }),
        }
    }

    #[test]
    fn page_messages_keeps_the_tail() {
        let messages: Vec<_> = (1..=25).map(|n| msg(&format!("m{n}"), None)).collect();
        let (page, has_more) = page_messages(&messages, 20, None);
        assert!(has_more);
        assert_eq!(page.len(), 20);
        assert_eq!(page[0].id, "m6");
        assert_eq!(page[19].id, "m25");
    }

    #[test]
    fn page_messages_before_id_loads_older_window() {
        let messages: Vec<_> = (1..=25).map(|n| msg(&format!("m{n}"), None)).collect();
        let (page, has_more) = page_messages(&messages, 20, Some("m6"));
        assert!(!has_more);
        assert_eq!(
            page.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            ["m1", "m2", "m3", "m4", "m5"]
        );
    }

    #[test]
    fn unknown_before_id_returns_empty() {
        let messages = vec![msg("m1", None)];
        let (page, has_more) = page_messages(&messages, 20, Some("missing"));
        assert!(page.is_empty());
        assert!(!has_more);
    }

    #[test]
    fn strip_replaces_diff_and_execute_bodies() {
        let mut messages = vec![msg("a1", Some(diff_tool()))];
        if let MessagePart::ToolCall { result, .. } = &mut messages[0].parts[0] {
            *result = Some(AgentToolResult::Execute {
                output: "lots of logs".into(),
                exit_code: Some(0),
            });
        }
        strip_message_tool_details(&mut messages);
        let MessagePart::ToolCall { result, params, .. } = &messages[0].parts[0] else {
            panic!("tool");
        };
        assert!(matches!(
            params,
            AgentToolParams::Edit { path } if path == "src/a.ts"
        ));
        match result {
            Some(AgentToolResult::Execute { output, exit_code }) => {
                assert!(output.is_empty());
                assert_eq!(*exit_code, Some(0));
            }
            other => panic!("expected execute summary, got {other:?}"),
        }
    }

    #[test]
    fn strip_diff_becomes_stats_and_json_is_flagged() {
        let mut messages = vec![msg("a1", Some(diff_tool()))];
        strip_message_tool_details(&mut messages);
        let MessagePart::ToolCall { result, .. } = &messages[0].parts[0] else {
            panic!("tool");
        };
        match result {
            Some(AgentToolResult::DiffStats {
                path,
                additions,
                deletions,
            }) => {
                assert_eq!(path, "src/a.ts");
                assert_eq!(*additions, 3);
                assert_eq!(*deletions, 2);
            }
            other => panic!("expected diff_stats, got {other:?}"),
        }
        let mut value = serde_json::to_value(&messages).expect("json");
        mark_tool_details_omitted(&mut value);
        assert_eq!(value[0]["parts"][0]["detail_omitted"], true);
        assert!(value[0]["parts"][0]["result"]["old_content"].is_null());
        assert!(value[0]["parts"][0]["result"]["new_content"].is_null());
    }

    #[test]
    fn collect_tools_keeps_request_order_and_skips_missing() {
        let messages = vec![msg("a1", Some(diff_tool())), msg("u1", None)];
        let parts = collect_tool_parts(
            &messages,
            &["missing".into(), "edit-1".into(), "edit-1".into()],
        );
        assert_eq!(parts.len(), 2);
        assert!(matches!(
            &parts[0],
            MessagePart::ToolCall { tool_call_id, .. } if tool_call_id == "edit-1"
        ));
    }
}
