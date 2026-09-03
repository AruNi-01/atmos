//! Map OpenCode tool parts onto Atmos `AgentTool`.

use serde_json::Value;

use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::{classify_tool, plan_from_tool_input, ClassifiedTool};
use crate::map::{
    extract_command, extract_cwd, extract_links, extract_path, extract_query, extract_search_hits,
    extract_skill, extract_subagent, extract_url,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolEventKind {
    Started,
    Updated,
    Completed,
    Failed,
}

#[derive(Debug, Clone)]
pub(crate) enum ToolMapOut {
    FoldThinking {
        text: String,
        done: bool,
    },
    FoldPlan {
        plan: Value,
    },
    Hide,
    Tool {
        tool: AgentTool,
        kind: ToolEventKind,
    },
}

pub(crate) fn map_tool_part(part: &Value) -> Option<ToolMapOut> {
    if part.get("type").and_then(Value::as_str) != Some("tool") {
        return None;
    }
    let name = part
        .get("tool")
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let call_id = part
        .get("callID")
        .or_else(|| part.get("callId"))
        .or_else(|| part.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let state = part.get("state").unwrap_or(&Value::Null);
    let status_name = state.get("status").and_then(Value::as_str).unwrap_or("");
    let input = state.get("input");
    let title = state.get("title").and_then(Value::as_str);

    match classify_open_code(&name, title, input) {
        ClassifiedTool::Thinking => {
            let text = thinking_from_state(state, input);
            return Some(ToolMapOut::FoldThinking {
                text,
                done: matches!(status_name, "completed" | "error"),
            });
        }
        ClassifiedTool::Plan => {
            return match plan_from_tool_input(input) {
                Some(plan) => Some(ToolMapOut::FoldPlan { plan }),
                None => Some(ToolMapOut::Hide),
            };
        }
        ClassifiedTool::Hide => return Some(ToolMapOut::Hide),
        ClassifiedTool::Call(_) => {}
    }

    let (status, event_kind) = match status_name {
        "completed" => (AgentToolStatus::Completed, ToolEventKind::Completed),
        "error" | "failed" => (AgentToolStatus::Failed, ToolEventKind::Failed),
        "running" => (AgentToolStatus::Running, ToolEventKind::Started),
        _ => (AgentToolStatus::Pending, ToolEventKind::Started),
    };

    let classified = classify_open_code(&name, title, input);
    let kind = match classified {
        ClassifiedTool::Call(kind) => kind,
        _ => crate::contract::AgentToolKind::Other,
    };

    let output_value = output_value(state);
    let metadata = state.get("metadata");
    Some(ToolMapOut::Tool {
        tool: build_tool(
            call_id,
            name,
            title.map(str::to_string),
            kind,
            status,
            input.unwrap_or(&Value::Null),
            output_value.as_ref(),
            metadata,
            event_kind == ToolEventKind::Failed,
        ),
        kind: event_kind,
    })
}

fn classify_open_code(name: &str, title: Option<&str>, input: Option<&Value>) -> ClassifiedTool {
    let normalized = name.trim().to_ascii_lowercase().replace([' ', '-'], "_");
    match normalized.as_str() {
        "bash" | "shell" => ClassifiedTool::Call(crate::contract::AgentToolKind::Execute),
        "read" => ClassifiedTool::Call(crate::contract::AgentToolKind::Read),
        "edit" | "write" | "patch" => ClassifiedTool::Call(crate::contract::AgentToolKind::Edit),
        "grep" | "glob" | "find" => ClassifiedTool::Call(crate::contract::AgentToolKind::Search),
        "websearch" | "web_search" => {
            ClassifiedTool::Call(crate::contract::AgentToolKind::WebSearch)
        }
        "webfetch" | "web_fetch" => ClassifiedTool::Call(crate::contract::AgentToolKind::Fetch),
        "skill" => ClassifiedTool::Call(crate::contract::AgentToolKind::Skill),
        "task" => ClassifiedTool::Call(crate::contract::AgentToolKind::Subagent),
        "reasoning" => ClassifiedTool::Thinking,
        "plan" | "todowrite" | "todo_write" => ClassifiedTool::Plan,
        _ => classify_tool(name, title, input),
    }
}

fn thinking_from_state(state: &Value, input: Option<&Value>) -> String {
    if let Some(text) = state.get("output").and_then(Value::as_str) {
        if !text.is_empty() {
            return text.to_string();
        }
    }
    input
        .and_then(|value| {
            value
                .get("text")
                .or_else(|| value.get("content"))
                .and_then(Value::as_str)
        })
        .unwrap_or("")
        .to_string()
}

fn output_value(state: &Value) -> Option<Value> {
    if let Some(error) = state.get("error") {
        if !error.is_null() {
            return Some(error.clone());
        }
    }
    match state.get("output") {
        Some(Value::String(text)) => serde_json::from_str(text)
            .ok()
            .or_else(|| Some(Value::String(text.clone()))),
        Some(value) => Some(value.clone()),
        None => None,
    }
}

#[allow(clippy::too_many_arguments)]
fn build_tool(
    tool_call_id: String,
    name: String,
    title: Option<String>,
    kind: crate::contract::AgentToolKind,
    status: AgentToolStatus,
    input: &Value,
    output: Option<&Value>,
    metadata: Option<&Value>,
    failed: bool,
) -> AgentTool {
    let params = typed_params(kind, input).unwrap_or_else(|| AgentToolParams::Other {
        value: input.clone(),
    });
    let result = match status {
        AgentToolStatus::Pending | AgentToolStatus::Running => None,
        AgentToolStatus::Failed if failed => Some(error_result(output, metadata)),
        AgentToolStatus::Completed | AgentToolStatus::Failed => {
            Some(mapped_result(kind, input, output, metadata, failed))
        }
    };
    let kind = match &params {
        AgentToolParams::Other { .. } => crate::contract::AgentToolKind::Other,
        _ => kind,
    };
    AgentTool {
        tool_call_id,
        name,
        title,
        kind,
        status,
        params,
        result,
    }
}

fn typed_params(kind: crate::contract::AgentToolKind, input: &Value) -> Option<AgentToolParams> {
    match kind {
        crate::contract::AgentToolKind::Read => Some(AgentToolParams::Read {
            path: extract_path(input)?,
            offset: int_field(input, &["offset", "start_line"]),
            limit: int_field(input, &["limit", "count", "num_lines"]),
        }),
        crate::contract::AgentToolKind::Edit => Some(AgentToolParams::Edit {
            path: extract_path(input)?,
        }),
        crate::contract::AgentToolKind::Delete => Some(AgentToolParams::Delete {
            path: extract_path(input)?,
        }),
        crate::contract::AgentToolKind::Move => Some(AgentToolParams::Move {
            from: first_string(input, &["from", "source", "old_path"])
                .or_else(|| extract_path(input))?,
            to: first_string(input, &["to", "destination", "new_path"])?,
        }),
        crate::contract::AgentToolKind::Search => Some(AgentToolParams::Search {
            query: extract_query(input)?,
            path: extract_path(input),
            glob: first_string(input, &["glob"])
                .filter(|glob| extract_query(input).as_ref() != Some(glob)),
        }),
        crate::contract::AgentToolKind::WebSearch => Some(AgentToolParams::WebSearch {
            query: extract_query(input)?,
        }),
        crate::contract::AgentToolKind::Execute => Some(AgentToolParams::Execute {
            command: extract_command(input)?,
            cwd: extract_cwd(input),
            background: false,
            task_id: None,
        }),
        crate::contract::AgentToolKind::Fetch => Some(AgentToolParams::Fetch {
            url: extract_url(input)?,
        }),
        crate::contract::AgentToolKind::Skill => Some(AgentToolParams::Skill {
            skill: extract_skill(input)?,
        }),
        crate::contract::AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(input).unwrap_or_else(|| {
                (
                    first_string(input, &["description", "prompt", "text"]).unwrap_or_default(),
                    first_string(input, &["subagent_type", "agent_type"]),
                )
            });
            if description.is_empty() {
                return None;
            }
            Some(AgentToolParams::Subagent {
                description,
                agent_type,
            })
        }
        crate::contract::AgentToolKind::Other => Some(AgentToolParams::Other {
            value: input.clone(),
        }),
    }
}

fn mapped_result(
    kind: crate::contract::AgentToolKind,
    input: &Value,
    output: Option<&Value>,
    metadata: Option<&Value>,
    failed: bool,
) -> AgentToolResult {
    if failed {
        return error_result(output, metadata);
    }
    match kind {
        crate::contract::AgentToolKind::Execute => AgentToolResult::Execute {
            output: value_text(output),
            exit_code: exit_code(output, metadata),
        },
        crate::contract::AgentToolKind::WebSearch => {
            let query = extract_query(input).unwrap_or_default();
            let links = output.map(extract_links).unwrap_or_default();
            if links.is_empty() {
                AgentToolResult::Text {
                    text: value_text(output),
                }
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        crate::contract::AgentToolKind::Fetch => fetch_result(input, output),
        crate::contract::AgentToolKind::Read => {
            let path = extract_path(input).unwrap_or_default();
            let text = value_text(output);
            if text.is_empty() {
                AgentToolResult::Empty
            } else {
                AgentToolResult::FileContent { path, text }
            }
        }
        crate::contract::AgentToolKind::Edit => {
            let path = extract_path(input).unwrap_or_default();
            if let Some((additions, deletions)) = metadata
                .and_then(diff_counts)
                .or_else(|| output.and_then(diff_counts))
            {
                AgentToolResult::DiffStats {
                    path,
                    additions,
                    deletions,
                }
            } else {
                AgentToolResult::Text {
                    text: value_text(output),
                }
            }
        }
        crate::contract::AgentToolKind::Search => {
            let query = extract_query(input).unwrap_or_default();
            let content = output.unwrap_or(&Value::Null);
            let hits = extract_search_hits(content);
            if hits.is_empty() {
                AgentToolResult::Text {
                    text: value_text(output),
                }
            } else {
                AgentToolResult::SearchHits { query, hits }
            }
        }
        crate::contract::AgentToolKind::Other => match output {
            Some(value) => AgentToolResult::Other {
                value: value.clone(),
            },
            None => AgentToolResult::Empty,
        },
        _ => AgentToolResult::Text {
            text: value_text(output),
        },
    }
}

fn error_result(output: Option<&Value>, metadata: Option<&Value>) -> AgentToolResult {
    let message = output
        .and_then(|value| {
            value.as_str().map(str::to_string).or_else(|| {
                value
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        })
        .or_else(|| {
            metadata
                .and_then(|value| value.get("error"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "tool failed".into());
    AgentToolResult::Error { message }
}

fn fetch_result(input: &Value, output: Option<&Value>) -> AgentToolResult {
    let url = extract_url(input)
        .or_else(|| output.and_then(extract_url))
        .unwrap_or_default();
    let title = output.and_then(|value| first_string(value, &["title"]));
    let markdown = output.and_then(|value| first_string(value, &["markdown", "md"]));
    let text = output.and_then(|value| first_string(value, &["text", "content", "body"]));
    if title.is_some() || markdown.is_some() || text.is_some() {
        AgentToolResult::WebFetch {
            url,
            title,
            markdown,
            text,
        }
    } else {
        AgentToolResult::Text {
            text: value_text(output),
        }
    }
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(text) = object
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return Some(text.to_string());
        }
    }
    None
}

fn int_field(value: &Value, keys: &[&str]) -> Option<i64> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(Value::Number(number)) => return number.as_i64(),
            Some(Value::String(text)) => return text.trim().parse().ok(),
            _ => {}
        }
    }
    None
}

fn exit_code(output: Option<&Value>, metadata: Option<&Value>) -> Option<i32> {
    metadata
        .and_then(|value| int_field(value, &["exit", "exit_code", "exitCode"]))
        .or_else(|| output.and_then(|value| int_field(value, &["exit", "exit_code", "exitCode"])))
        .map(|value| value as i32)
}

fn diff_counts(value: &Value) -> Option<(u32, u32)> {
    let additions = int_field(value, &["additions", "added"])? as u32;
    let deletions = int_field(value, &["deletions", "removed", "deleted"])? as u32;
    Some((additions, deletions))
}

fn value_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(other) => other
            .as_str()
            .map(str::to_string)
            .or_else(|| serde_json::to_string(other).ok())
            .unwrap_or_default(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use serde_json::json;

    fn tool_named(name: &str, input: Value, output: Option<&str>, status: &str) -> AgentTool {
        let part = json!({
            "type": "tool",
            "id": "prt",
            "callID": "call_1",
            "tool": name,
            "state": {
                "status": status,
                "input": input,
                "output": output,
                "metadata": { "exit": 0 },
                "title": name,
            }
        });
        match map_tool_part(&part).expect("mapped") {
            ToolMapOut::Tool { tool, .. } => tool,
            other => panic!("expected tool, got {other:?}"),
        }
    }

    #[test]
    fn bash_maps_to_execute() {
        let tool = tool_named(
            "bash",
            json!({"command": "ls -la"}),
            Some("README.md\n"),
            "completed",
        );
        assert_eq!(tool.kind, AgentToolKind::Execute);
        assert_eq!(
            tool.params,
            AgentToolParams::Execute {
                command: "ls -la".into(),
                cwd: None,
                background: false,
                task_id: None,
            }
        );
        match tool.result {
            Some(AgentToolResult::Execute {
                ref output,
                exit_code,
            }) => {
                assert_eq!(output, "README.md\n");
                assert_eq!(exit_code, Some(0));
            }
            other => panic!("{other:?}"),
        }
        let json = serde_json::to_value(&tool).expect("json");
        assert!(json.get("input").is_none());
        assert!(json.get("native").is_none());
    }

    #[test]
    fn grep_is_workspace_search_not_web_search() {
        let tool = tool_named(
            "grep",
            json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some("tool.rs:12"),
            "completed",
        );
        assert_eq!(tool.kind, AgentToolKind::Search);
        assert_ne!(tool.kind, AgentToolKind::WebSearch);
    }

    #[test]
    fn grep_stdout_emits_search_hits() {
        let tool = tool_named(
            "grep",
            json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some("crates/agent/src/lib.rs:12: pub struct AgentTool"),
            "completed",
        );
        assert_eq!(
            tool.result,
            Some(AgentToolResult::SearchHits {
                query: "AgentTool".into(),
                hits: vec![crate::contract::SearchHit {
                    path: "crates/agent/src/lib.rs".into(),
                    line: Some(12),
                    snippet: Some(" pub struct AgentTool".into()),
                }],
            })
        );
    }

    #[test]
    fn grep_empty_stdout_stays_text() {
        let tool = tool_named(
            "grep",
            json!({"pattern": "AgentTool", "path": "crates/agent"}),
            Some(""),
            "completed",
        );
        assert_eq!(tool.result, Some(AgentToolResult::Text { text: "".into() }));
    }

    #[test]
    fn websearch_is_web_search() {
        let tool = tool_named(
            "websearch",
            json!({"query": "atmos acp"}),
            Some("{\"links\":[]}"),
            "completed",
        );
        assert_eq!(tool.kind, AgentToolKind::WebSearch);
        assert!(!matches!(
            tool.result,
            Some(AgentToolResult::SearchHits { .. })
        ));
    }

    #[test]
    fn unknown_tool_is_other_with_vendor_value_once() {
        let tool = tool_named(
            "vendor_mystery",
            json!({"opaque": true}),
            Some("{\"n\":1}"),
            "completed",
        );
        assert_eq!(tool.kind, AgentToolKind::Other);
        match tool.params {
            AgentToolParams::Other { value } => {
                assert_eq!(value, json!({"opaque": true}));
            }
            other => panic!("{other:?}"),
        }
        match tool.result {
            Some(AgentToolResult::Other { value }) => {
                assert_eq!(value, json!({"n": 1}));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn todowrite_folds_to_plan() {
        let part = json!({
            "type": "tool",
            "callID": "t1",
            "tool": "todowrite",
            "state": {
                "status": "completed",
                "input": { "todos": [{ "content": "Ship", "status": "pending" }] }
            }
        });
        assert!(matches!(
            map_tool_part(&part),
            Some(ToolMapOut::FoldPlan { .. })
        ));
    }
}
