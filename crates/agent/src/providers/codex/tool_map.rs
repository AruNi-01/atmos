//! Codex `ThreadItem` → Atmos `AgentTool` (kind + params + result only).

use serde_json::Value;

use crate::contract::AgentToolKind;
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::{classify_tool, ClassifiedTool};
use crate::map::{
    extract_command, extract_cwd, extract_links, extract_path, extract_query, extract_search_hits,
    extract_subagent, extract_url,
};

#[derive(Debug, Clone, Copy)]
pub enum ItemPhase {
    Started,
    Updated,
    Completed,
}

#[derive(Debug)]
pub enum ItemMapOut {
    Hide,
    Tools(Vec<AgentTool>),
}

pub fn map_item(item: &Value, phase: ItemPhase) -> ItemMapOut {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    match item_type {
        "userMessage" | "agentMessage" | "reasoning" | "plan" | "contextCompaction"
        | "enteredReviewMode" | "exitedReviewMode" | "compacted" => ItemMapOut::Hide,
        "commandExecution" => ItemMapOut::Tools(vec![map_command(item, phase)]),
        "fileChange" => ItemMapOut::Tools(map_file_changes(item, phase)),
        "webSearch" => ItemMapOut::Tools(vec![map_web_search(item, phase)]),
        "imageView" => ItemMapOut::Tools(vec![map_image_view(item, phase)]),
        "collabAgentToolCall" | "collabToolCall" => {
            ItemMapOut::Tools(vec![map_collab(item, phase)])
        }
        "mcpToolCall" | "dynamicToolCall" => {
            ItemMapOut::Tools(vec![map_mcp_or_dynamic(item, phase)])
        }
        _ => ItemMapOut::Tools(vec![other_tool(item, phase)]),
    }
}

fn map_command(item: &Value, phase: ItemPhase) -> AgentTool {
    let command = extract_command(item)
        .or_else(|| {
            item.get("command")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();
    if command.is_empty() {
        return other_tool(item, phase);
    }
    let status = status_of(item, phase);
    let output = item
        .get("aggregatedOutput")
        .and_then(Value::as_str)
        .map(str::to_string);
    let exit_code = item
        .get("exitCode")
        .and_then(Value::as_i64)
        .map(|n| n as i32);
    let result = match (phase, status) {
        (
            ItemPhase::Started | ItemPhase::Updated,
            AgentToolStatus::Running | AgentToolStatus::Pending,
        ) => output.map(|text| AgentToolResult::Execute {
            output: text,
            exit_code,
        }),
        (_, AgentToolStatus::Failed) => Some(failed_result(item, output)),
        _ => Some(AgentToolResult::Execute {
            output: output.unwrap_or_default(),
            exit_code,
        }),
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: "commandExecution".into(),
        title: None,
        kind: AgentToolKind::Execute,
        status,
        params: AgentToolParams::Execute {
            command,
            cwd: extract_cwd(item),
            background: false,
            task_id: None,
        },
        result,
    }
}

fn map_file_changes(item: &Value, phase: ItemPhase) -> Vec<AgentTool> {
    let changes = item.get("changes").and_then(Value::as_array);
    let Some(changes) = changes else {
        return vec![other_tool(item, phase)];
    };
    if changes.is_empty() {
        return vec![other_tool(item, phase)];
    }
    let base_id = item_id(item);
    let multi = changes.len() > 1;
    let status = status_of(item, phase);
    changes
        .iter()
        .filter_map(|change| {
            let path = change
                .get("path")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| extract_path(change))?;
            let kind_raw = change_kind(change);
            let (kind, params) = if kind_raw == "delete" || kind_raw == "deleted" {
                (
                    AgentToolKind::Delete,
                    AgentToolParams::Delete { path: path.clone() },
                )
            } else {
                (
                    AgentToolKind::Edit,
                    AgentToolParams::Edit { path: path.clone() },
                )
            };
            let tool_call_id = if multi {
                format!("{base_id}:{path}")
            } else {
                base_id.clone()
            };
            let diff = change.get("diff").and_then(Value::as_str);
            let result = match status {
                AgentToolStatus::Failed => Some(failed_result(item, None)),
                AgentToolStatus::Completed if diff.is_some() => Some(AgentToolResult::Text {
                    text: diff.unwrap().to_string(),
                }),
                _ => diff.map(|text| AgentToolResult::Text {
                    text: text.to_string(),
                }),
            };
            Some(AgentTool {
                tool_call_id,
                name: "fileChange".into(),
                title: Some(path),
                kind,
                status,
                params,
                result,
            })
        })
        .collect()
}

fn map_web_search(item: &Value, phase: ItemPhase) -> AgentTool {
    let action_type = action_type(item);
    if matches!(
        action_type.as_deref(),
        Some("openPage" | "open_page" | "findInPage" | "find_in_page")
    ) {
        return map_web_fetch(item, phase, action_type.as_deref());
    }
    let query = web_query(item);
    if query.is_empty() && action_type.is_none() {
        return other_tool(item, phase);
    }
    if query.is_empty() {
        return other_tool(item, phase);
    }
    let status = status_of(item, phase);
    let links = extract_links(item);
    let result = match status {
        AgentToolStatus::Running | AgentToolStatus::Pending => None,
        AgentToolStatus::Failed => Some(failed_result(item, None)),
        AgentToolStatus::Completed if links.is_empty() => Some(AgentToolResult::Text {
            text: query.clone(),
        }),
        AgentToolStatus::Completed => Some(AgentToolResult::WebSearch {
            query: query.clone(),
            links,
        }),
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: "webSearch".into(),
        title: None,
        kind: AgentToolKind::WebSearch,
        status,
        params: AgentToolParams::WebSearch { query },
        result,
    }
}

fn map_web_fetch(item: &Value, phase: ItemPhase, action_type: Option<&str>) -> AgentTool {
    let url = extract_url(item)
        .or_else(|| {
            item.get("action")
                .and_then(|action| action.get("url"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default();
    if url.is_empty() {
        return other_tool(item, phase);
    }
    let status = status_of(item, phase);
    let pattern = item
        .get("action")
        .and_then(|action| action.get("pattern").or_else(|| action.get("query")))
        .and_then(Value::as_str)
        .map(str::to_string);
    let result = match status {
        AgentToolStatus::Running | AgentToolStatus::Pending => None,
        AgentToolStatus::Failed => Some(failed_result(item, None)),
        AgentToolStatus::Completed
            if action_type == Some("findInPage") || action_type == Some("find_in_page") =>
        {
            Some(AgentToolResult::Text {
                text: pattern.unwrap_or_default(),
            })
        }
        AgentToolStatus::Completed => Some(AgentToolResult::WebFetch {
            url: url.clone(),
            title: None,
            markdown: None,
            text: pattern,
        }),
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: "webSearch".into(),
        title: None,
        kind: AgentToolKind::Fetch,
        status,
        params: AgentToolParams::Fetch { url },
        result,
    }
}

fn map_image_view(item: &Value, phase: ItemPhase) -> AgentTool {
    let Some(path) = item
        .get("path")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| extract_path(item))
    else {
        return other_tool(item, phase);
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: "imageView".into(),
        title: None,
        kind: AgentToolKind::Read,
        status: status_of(item, phase),
        params: AgentToolParams::Read {
            path,
            offset: None,
            limit: None,
        },
        result: None,
    }
}

fn map_mcp_or_dynamic(item: &Value, phase: ItemPhase) -> AgentTool {
    let name = item
        .get("tool")
        .or_else(|| item.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let arguments = item
        .get("arguments")
        .or_else(|| item.get("input"))
        .unwrap_or(&Value::Null);
    if matches!(
        classify_tool(name, None, Some(arguments)),
        ClassifiedTool::Call(AgentToolKind::Search)
    ) {
        return map_search(item, name, arguments, phase);
    }
    other_tool(item, phase)
}

fn map_search(item: &Value, name: &str, arguments: &Value, phase: ItemPhase) -> AgentTool {
    let Some(query) = extract_query(arguments) else {
        return other_tool(item, phase);
    };
    let params = AgentToolParams::Search {
        query: query.clone(),
        path: extract_path(arguments),
        glob: arguments
            .get("glob")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|glob| !glob.is_empty() && *glob != query.as_str())
            .map(str::to_string),
    };
    let status = status_of(item, phase);
    let content = item
        .get("result")
        .or_else(|| item.get("aggregatedOutput"))
        .unwrap_or(&Value::Null);
    let result = match status {
        AgentToolStatus::Running | AgentToolStatus::Pending => None,
        AgentToolStatus::Failed => Some(failed_result(item, None)),
        AgentToolStatus::Completed => {
            Some(result_for_kind(AgentToolKind::Search, &params, content))
        }
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: if name.is_empty() {
            item.get("type")
                .and_then(Value::as_str)
                .unwrap_or("item")
                .to_string()
        } else {
            name.to_string()
        },
        title: None,
        kind: AgentToolKind::Search,
        status,
        params,
        result,
    }
}

fn result_for_kind(
    kind: AgentToolKind,
    params: &AgentToolParams,
    content: &Value,
) -> AgentToolResult {
    match kind {
        AgentToolKind::Search => {
            let query = match params {
                AgentToolParams::Search { query, .. } => query.clone(),
                _ => extract_query(content).unwrap_or_default(),
            };
            let hits = extract_search_hits(content);
            if hits.is_empty() {
                AgentToolResult::Text {
                    text: value_text(content),
                }
            } else {
                AgentToolResult::SearchHits { query, hits }
            }
        }
        _ => AgentToolResult::Text {
            text: value_text(content),
        },
    }
}

fn value_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .get("output")
        .or_else(|| content.get("text"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn map_collab(item: &Value, phase: ItemPhase) -> AgentTool {
    if let Some((description, agent_type)) = extract_subagent(item).or_else(|| {
        item.get("prompt")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(|text| (text.to_string(), None))
    }) {
        return AgentTool {
            tool_call_id: item_id(item),
            name: "collabToolCall".into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: status_of(item, phase),
            params: AgentToolParams::Subagent {
                description,
                agent_type,
            },
            result: complete_other_result(item, phase),
        };
    }
    other_tool(item, phase)
}

fn other_tool(item: &Value, phase: ItemPhase) -> AgentTool {
    let status = status_of(item, phase);
    AgentTool {
        tool_call_id: item_id(item),
        name: item
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("item")
            .to_string(),
        title: None,
        kind: AgentToolKind::Other,
        status,
        params: AgentToolParams::Other {
            value: item.clone(),
        },
        result: complete_other_result(item, phase),
    }
}

fn complete_other_result(item: &Value, phase: ItemPhase) -> Option<AgentToolResult> {
    match phase {
        ItemPhase::Started | ItemPhase::Updated => None,
        ItemPhase::Completed => {
            if status_of(item, phase) == AgentToolStatus::Failed {
                Some(failed_result(item, None))
            } else if let Some(result) = item.get("result") {
                Some(AgentToolResult::Other {
                    value: result.clone(),
                })
            } else {
                Some(AgentToolResult::Other {
                    value: item.clone(),
                })
            }
        }
    }
}

fn failed_result(item: &Value, fallback: Option<String>) -> AgentToolResult {
    let message = item
        .get("error")
        .and_then(|error| {
            error.as_str().map(str::to_string).or_else(|| {
                error
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        })
        .or(fallback)
        .or_else(|| {
            if item.get("status").and_then(Value::as_str) == Some("declined") {
                Some("declined".into())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "failed".into());
    AgentToolResult::Error { message }
}

fn status_of(item: &Value, phase: ItemPhase) -> AgentToolStatus {
    match item.get("status").and_then(Value::as_str) {
        Some("inProgress") => AgentToolStatus::Running,
        Some("completed") => AgentToolStatus::Completed,
        Some("failed" | "declined") => AgentToolStatus::Failed,
        _ => match phase {
            ItemPhase::Started | ItemPhase::Updated => AgentToolStatus::Running,
            ItemPhase::Completed => AgentToolStatus::Completed,
        },
    }
}

fn item_id(item: &Value) -> String {
    item.get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn change_kind(change: &Value) -> &str {
    change
        .get("kind")
        .and_then(|kind| {
            kind.as_str()
                .or_else(|| kind.get("type").and_then(Value::as_str))
        })
        .unwrap_or("update")
}

fn action_type(item: &Value) -> Option<String> {
    item.get("action")
        .and_then(|action| action.get("type"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn web_query(item: &Value) -> String {
    extract_query(item)
        .or_else(|| {
            item.get("action")
                .and_then(|action| action.get("query"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            item.get("action")
                .and_then(|action| action.get("queries"))
                .and_then(Value::as_array)
                .and_then(|queries| queries.first())
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_default()
}

pub fn apply_output_delta(tool: &mut AgentTool, delta: &str) {
    let previous = match &tool.result {
        Some(AgentToolResult::Execute { output, .. }) => output.clone(),
        _ => String::new(),
    };
    tool.result = Some(AgentToolResult::Execute {
        output: format!("{previous}{delta}"),
        exit_code: None,
    });
    tool.status = AgentToolStatus::Running;
}

pub fn apply_diff_stats(tool: &mut AgentTool, path: &str, additions: u32, deletions: u32) {
    tool.result = Some(AgentToolResult::DiffStats {
        path: path.to_string(),
        additions,
        deletions,
    });
}

pub fn parse_unified_diff_stats(diff: &str) -> Vec<(String, u32, u32)> {
    let mut out = Vec::new();
    let mut path: Option<String> = None;
    let mut additions = 0u32;
    let mut deletions = 0u32;
    let flush = |path: &mut Option<String>,
                 additions: &mut u32,
                 deletions: &mut u32,
                 out: &mut Vec<(String, u32, u32)>| {
        if let Some(current) = path.take() {
            out.push((current, *additions, *deletions));
            *additions = 0;
            *deletions = 0;
        }
    };
    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("+++ ") {
            let next = rest
                .trim()
                .trim_start_matches("b/")
                .trim_start_matches("a/")
                .to_string();
            if next != "/dev/null" {
                if path.as_ref() != Some(&next) {
                    flush(&mut path, &mut additions, &mut deletions, &mut out);
                    path = Some(next);
                }
            }
            continue;
        }
        if line.starts_with("diff ")
            || line.starts_with("index ")
            || line.starts_with("@@")
            || line.starts_with("--- ")
        {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        } else if line.starts_with('-') {
            deletions += 1;
        }
    }
    flush(&mut path, &mut additions, &mut deletions, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_items() -> Vec<(String, Value)> {
        include_str!("testdata/turn-tools.jsonl")
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str::<Value>(line).expect("json"))
            .filter_map(|value| {
                let method = value.get("method")?.as_str()?.to_string();
                let params = value.get("params").cloned()?;
                Some((method, params))
            })
            .collect()
    }

    #[test]
    fn maps_execute_edit_web_search_and_fetch() {
        let mut execute = None;
        let mut edit = None;
        let mut web = None;
        let mut fetch = None;
        let mut other = None;
        for (method, params) in load_items() {
            if method != "item/completed" {
                continue;
            }
            let item = params.get("item").cloned().unwrap_or(Value::Null);
            match map_item(&item, ItemPhase::Completed) {
                ItemMapOut::Hide => {}
                ItemMapOut::Tools(tools) => {
                    for tool in tools {
                        match tool.kind {
                            AgentToolKind::Execute => execute = Some(tool),
                            AgentToolKind::Edit => edit = Some(tool),
                            AgentToolKind::WebSearch => web = Some(tool),
                            AgentToolKind::Fetch => fetch = Some(tool),
                            AgentToolKind::Other => other = Some(tool),
                            _ => {}
                        }
                    }
                }
            }
        }
        let execute = execute.expect("execute");
        assert!(matches!(
            execute.params,
            AgentToolParams::Execute { ref command, background: false, .. } if command.contains("cargo test")
        ));
        assert!(matches!(
            execute.result,
            Some(AgentToolResult::Execute {
                exit_code: Some(0),
                ..
            })
        ));

        let edit = edit.expect("edit");
        assert!(matches!(edit.params, AgentToolParams::Edit { ref path } if path == "src/lib.rs"));

        let web = web.expect("web_search");
        assert_eq!(web.kind, AgentToolKind::WebSearch);
        assert!(
            matches!(web.params, AgentToolParams::WebSearch { ref query } if query == "atmos acp")
        );
        assert_ne!(web.kind, AgentToolKind::Search);

        let fetch = fetch.expect("fetch");
        assert_eq!(fetch.kind, AgentToolKind::Fetch);
        assert!(
            matches!(fetch.params, AgentToolParams::Fetch { ref url } if url == "https://example.com/page")
        );

        let other = other.expect("unmapped mcp");
        assert_eq!(other.kind, AgentToolKind::Other);
        let json = serde_json::to_value(&other).expect("json");
        assert!(json.get("input").is_none());
        assert!(json.get("native").is_none());
        assert_eq!(json["params"]["type"], "other");
    }

    #[test]
    fn web_search_is_not_workspace_search() {
        let item = serde_json::json!({
            "type": "webSearch",
            "id": "ws_1",
            "query": "atmos acp",
            "action": { "type": "search", "query": "atmos acp" },
            "status": "completed"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::WebSearch);
                assert!(!matches!(tools[0].params, AgentToolParams::Search { .. }));
                assert!(!matches!(
                    tools[0].result,
                    Some(AgentToolResult::SearchHits { .. })
                ));
            }
            ItemMapOut::Hide => panic!("web search must be a tool"),
        }
    }

    #[test]
    fn grep_stdout_emits_search_hits() {
        let item = serde_json::json!({
            "type": "mcpToolCall",
            "id": "grep_1",
            "tool": "grep",
            "status": "completed",
            "arguments": { "pattern": "AgentTool", "path": "crates/agent" },
            "result": "crates/agent/src/lib.rs:12: pub struct AgentTool"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Search);
                assert_eq!(
                    tools[0].result,
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
            ItemMapOut::Hide => panic!("grep must be a tool"),
        }
    }

    #[test]
    fn grep_empty_stdout_stays_text() {
        let item = serde_json::json!({
            "type": "mcpToolCall",
            "id": "grep_1",
            "tool": "grep",
            "status": "completed",
            "arguments": { "pattern": "AgentTool", "path": "crates/agent" },
            "result": ""
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Search);
                assert_eq!(
                    tools[0].result,
                    Some(AgentToolResult::Text { text: "".into() })
                );
            }
            ItemMapOut::Hide => panic!("grep must be a tool"),
        }
    }
}
