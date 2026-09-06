//! Codex `ThreadItem` → Atmos `AgentTool` (kind + params + result only).

use serde_json::Value;

use crate::contract::AgentToolKind;
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::{classify_tool, ClassifiedTool};
use crate::map::{
    extract_command, extract_cwd, extract_links, extract_path, extract_query, extract_search_hits,
    extract_skill, extract_subagent, extract_url,
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
        "subAgentActivity" => ItemMapOut::Tools(vec![map_subagent_activity(item, phase)]),
        "mcpToolCall" | "dynamicToolCall" => {
            ItemMapOut::Tools(vec![map_mcp_or_dynamic(item, phase)])
        }
        "functionCallOutput" => ItemMapOut::Tools(vec![map_function_call_output(item, phase)]),
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
    // Live Codex often starts webSearch with empty query / action.type=other
    // before the real query arrives — keep WebSearch, never demote to Other.
    let query = web_query(item);
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
    // Empty URL on start is normal progressive fill — keep Fetch kind.
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
    // Empty path on start is progressive fill — keep Read, never demote to Other.
    let path = item
        .get("path")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| extract_path(item))
        .unwrap_or_default();
    let status = status_of(item, phase);
    AgentTool {
        tool_call_id: item_id(item),
        name: "imageView".into(),
        title: None,
        kind: AgentToolKind::Read,
        status,
        params: AgentToolParams::Read {
            path: path.clone(),
            offset: None,
            limit: None,
        },
        result: match status {
            AgentToolStatus::Running | AgentToolStatus::Pending => None,
            AgentToolStatus::Failed => Some(failed_result(item, None)),
            AgentToolStatus::Completed => Some(AgentToolResult::Text { text: path }),
        },
    }
}

fn map_function_call_output(item: &Value, phase: ItemPhase) -> AgentTool {
    let name = item.get("name").and_then(Value::as_str).unwrap_or("");
    let arguments = item
        .get("arguments")
        .or_else(|| item.get("input"))
        .unwrap_or(&Value::Null);
    let server = item
        .get("server")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    match classify_tool(name, None, Some(arguments)) {
        ClassifiedTool::Call(AgentToolKind::McpList) => mcp_list_tool(item, name, server, phase),
        ClassifiedTool::Call(AgentToolKind::McpCall) => mcp_call_tool(item, name, server, phase),
        ClassifiedTool::Call(AgentToolKind::Search) => map_search(item, name, arguments, phase),
        ClassifiedTool::Call(AgentToolKind::Skill) => map_skill(item, name, arguments, phase),
        ClassifiedTool::Call(AgentToolKind::Read) => map_read_like(item, name, arguments, phase),
        _ if server.is_some() => mcp_call_tool(item, name, server, phase),
        _ => other_tool(item, phase),
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
    let server = item
        .get("server")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
    let classified = classify_tool(name, None, Some(arguments));

    match classified {
        ClassifiedTool::Call(AgentToolKind::McpList) => {
            return mcp_list_tool(item, name, server, phase);
        }
        ClassifiedTool::Call(AgentToolKind::Search)
            if item_type != "mcpToolCall" && server.is_none() =>
        {
            return map_search(item, name, arguments, phase);
        }
        ClassifiedTool::Call(AgentToolKind::Skill)
            if item_type != "mcpToolCall" && server.is_none() =>
        {
            return map_skill(item, name, arguments, phase);
        }
        ClassifiedTool::Call(AgentToolKind::Read)
            if item_type != "mcpToolCall" && server.is_none() =>
        {
            return map_read_like(item, name, arguments, phase);
        }
        _ => {}
    }

    if item_type == "mcpToolCall"
        || server.is_some()
        || matches!(classified, ClassifiedTool::Call(AgentToolKind::McpCall))
    {
        return mcp_call_tool(item, name, server, phase);
    }

    if matches!(classified, ClassifiedTool::Call(AgentToolKind::Search)) {
        return map_search(item, name, arguments, phase);
    }
    if matches!(classified, ClassifiedTool::Call(AgentToolKind::Skill)) {
        return map_skill(item, name, arguments, phase);
    }
    other_tool(item, phase)
}

fn mcp_list_tool(item: &Value, name: &str, server: Option<String>, phase: ItemPhase) -> AgentTool {
    let status = status_of(item, phase);
    let content = tool_content(item);
    AgentTool {
        tool_call_id: item_id(item),
        name: if name.is_empty() {
            "mcp_list".into()
        } else {
            name.to_string()
        },
        title: server
            .as_ref()
            .map(|server| format!("MCP {server}"))
            .or_else(|| Some("MCP list".into())),
        kind: AgentToolKind::McpList,
        status,
        params: AgentToolParams::McpList { server },
        result: match status {
            AgentToolStatus::Running | AgentToolStatus::Pending => None,
            AgentToolStatus::Failed => Some(failed_result(item, None)),
            AgentToolStatus::Completed => Some(AgentToolResult::Text {
                text: content
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| content.to_string()),
            }),
        },
    }
}

fn mcp_call_tool(item: &Value, name: &str, server: Option<String>, phase: ItemPhase) -> AgentTool {
    let tool_name = if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    };
    let status = status_of(item, phase);
    let content = tool_content(item);
    let title = match (&server, &tool_name) {
        (Some(server), Some(tool)) => Some(format!("MCP {server}/{tool}")),
        (Some(server), None) => Some(format!("MCP {server}")),
        (None, Some(tool)) => Some(format!("MCP {tool}")),
        _ => Some("MCP".into()),
    };
    AgentTool {
        tool_call_id: item_id(item),
        name: tool_name.clone().unwrap_or_else(|| "mcp_call".into()),
        title,
        kind: AgentToolKind::McpCall,
        status,
        params: AgentToolParams::McpCall {
            server,
            tool: tool_name,
        },
        result: match status {
            AgentToolStatus::Running | AgentToolStatus::Pending => None,
            AgentToolStatus::Failed => Some(failed_result(item, None)),
            AgentToolStatus::Completed => Some(AgentToolResult::Text {
                text: content
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| content.to_string()),
            }),
        },
    }
}

fn map_skill(item: &Value, name: &str, arguments: &Value, phase: ItemPhase) -> AgentTool {
    let skill = extract_skill(arguments)
        .or_else(|| extract_skill(item))
        .or_else(|| {
            if name.is_empty() {
                None
            } else {
                Some(name.to_string())
            }
        })
        .unwrap_or_default();
    let status = status_of(item, phase);
    let content = tool_content(item);
    AgentTool {
        tool_call_id: item_id(item),
        name: if name.is_empty() {
            "skill".into()
        } else {
            name.to_string()
        },
        title: (!skill.is_empty()).then(|| skill.clone()),
        kind: AgentToolKind::Skill,
        status,
        params: AgentToolParams::Skill { skill },
        result: match status {
            AgentToolStatus::Running | AgentToolStatus::Pending => None,
            AgentToolStatus::Failed => Some(failed_result(item, None)),
            AgentToolStatus::Completed => Some(AgentToolResult::Text {
                text: content
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| content.to_string()),
            }),
        },
    }
}

fn map_read_like(item: &Value, name: &str, arguments: &Value, phase: ItemPhase) -> AgentTool {
    let path = extract_path(arguments)
        .or_else(|| extract_path(item))
        .unwrap_or_default();
    let status = status_of(item, phase);
    let content = tool_content(item);
    AgentTool {
        tool_call_id: item_id(item),
        name: if name.is_empty() {
            "read".into()
        } else {
            name.to_string()
        },
        title: (!path.is_empty()).then(|| path.clone()),
        kind: AgentToolKind::Read,
        status,
        params: AgentToolParams::Read {
            path: path.clone(),
            offset: None,
            limit: None,
        },
        result: match status {
            AgentToolStatus::Running | AgentToolStatus::Pending => None,
            AgentToolStatus::Failed => Some(failed_result(item, None)),
            AgentToolStatus::Completed => Some(AgentToolResult::Text {
                text: content
                    .as_str()
                    .map(str::to_string)
                    .filter(|text| !text.is_empty())
                    .unwrap_or(path),
            }),
        },
    }
}

fn map_search(item: &Value, name: &str, arguments: &Value, phase: ItemPhase) -> AgentTool {
    // Empty query on start is progressive fill — keep Search, never demote to Other.
    let query = extract_query(arguments)
        .or_else(|| extract_query(item))
        .unwrap_or_default();
    let params = AgentToolParams::Search {
        query: query.clone(),
        path: extract_path(arguments).or_else(|| extract_path(item)),
        glob: arguments
            .get("glob")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|glob| !glob.is_empty() && *glob != query.as_str())
            .map(str::to_string),
    };
    let status = status_of(item, phase);
    let content = tool_content(item);
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

fn tool_content(item: &Value) -> &Value {
    item.get("result")
        .or_else(|| item.get("output"))
        .or_else(|| item.get("aggregatedOutput"))
        .unwrap_or(&Value::Null)
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
    let extracted = extract_subagent(item);
    let description = extracted
        .as_ref()
        .map(|(description, _)| description.clone())
        .or_else(|| {
            item.get("prompt")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            item.get("tool")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            item.get("agentPath")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "collab".into());
    let agent_type = extracted
        .and_then(|(_, agent_type)| agent_type)
        .or_else(|| {
            item.get("tool")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        });
    AgentTool {
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
    }
}

fn map_subagent_activity(item: &Value, phase: ItemPhase) -> AgentTool {
    let description = item
        .get("agentPath")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .or_else(|| {
            item.get("agentThreadId")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
        })
        .unwrap_or("subagent")
        .to_string();
    let agent_type = item
        .get("kind")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string);
    AgentTool {
        tool_call_id: item_id(item),
        name: "subAgentActivity".into(),
        title: None,
        kind: AgentToolKind::Subagent,
        status: status_of(item, phase),
        params: AgentToolParams::Subagent {
            description,
            agent_type,
        },
        result: complete_other_result(item, phase),
    }
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
            if next != "/dev/null" && path.as_ref() != Some(&next) {
                flush(&mut path, &mut additions, &mut deletions, &mut out);
                path = Some(next);
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
                            AgentToolKind::McpCall | AgentToolKind::Other => other = Some(tool),
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

        let other = other.expect("mcp call");
        assert_eq!(other.kind, AgentToolKind::McpCall);
        let json = serde_json::to_value(&other).expect("json");
        assert!(json.get("input").is_none());
        assert!(json.get("native").is_none());
        assert_eq!(json["params"]["type"], "mcp_call");
        assert_eq!(json["params"]["server"], "demo");
        assert_eq!(json["params"]["tool"], "lookup");
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
            "type": "dynamicToolCall",
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
            "type": "dynamicToolCall",
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

    #[test]
    fn mcp_tool_call_maps_to_mcp_call_kind() {
        let item = serde_json::json!({
            "type": "mcpToolCall",
            "id": "mcp_1",
            "server": "demo",
            "tool": "lookup",
            "status": "completed",
            "arguments": { "id": "1" },
            "result": { "n": 1 }
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::McpCall);
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::McpCall {
                        server: Some("demo".into()),
                        tool: Some("lookup".into()),
                    }
                );
            }
            ItemMapOut::Hide => panic!("mcp must be a tool"),
        }
    }

    #[test]
    fn web_search_empty_query_start_stays_web_search() {
        let item = serde_json::json!({
            "type": "webSearch",
            "id": "ws_start",
            "query": "",
            "action": { "type": "other" },
            "results": null
        });
        match map_item(&item, ItemPhase::Started) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::WebSearch);
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::WebSearch { query: "".into() }
                );
            }
            ItemMapOut::Hide => panic!("web search start must be a tool"),
        }
    }

    #[test]
    fn subagent_activity_maps_to_subagent() {
        let item = serde_json::json!({
            "type": "subAgentActivity",
            "id": "sa_1",
            "kind": "started",
            "agentThreadId": "thread-1",
            "agentPath": "/root/tool_test_echo"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Subagent);
                assert_eq!(tools[0].name, "subAgentActivity");
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::Subagent {
                        description: "/root/tool_test_echo".into(),
                        agent_type: Some("started".into()),
                    }
                );
            }
            ItemMapOut::Hide => panic!("subAgentActivity must be a tool"),
        }
    }

    #[test]
    fn collab_wait_without_prompt_maps_to_subagent() {
        let item = serde_json::json!({
            "type": "collabAgentToolCall",
            "id": "collab_1",
            "tool": "wait",
            "status": "inProgress",
            "senderThreadId": "thread-main",
            "receiverThreadIds": [],
            "prompt": null,
            "agentsStates": {}
        });
        match map_item(&item, ItemPhase::Started) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Subagent);
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::Subagent {
                        description: "wait".into(),
                        agent_type: Some("wait".into()),
                    }
                );
            }
            ItemMapOut::Hide => panic!("collab wait must be a tool"),
        }
    }

    #[test]
    fn image_view_maps_to_read_even_with_empty_path() {
        let item = serde_json::json!({
            "type": "imageView",
            "id": "img_start",
            "path": ""
        });
        match map_item(&item, ItemPhase::Started) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Read);
                assert_eq!(tools[0].name, "imageView");
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::Read {
                        path: "".into(),
                        offset: None,
                        limit: None,
                    }
                );
            }
            ItemMapOut::Hide => panic!("imageView must be a tool"),
        }
    }

    #[test]
    fn image_view_completed_keeps_read() {
        let item = serde_json::json!({
            "type": "imageView",
            "id": "img_1",
            "path": "./tmp/codex_probe.png"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Read);
                assert!(matches!(
                    tools[0].params,
                    AgentToolParams::Read { ref path, .. } if path == "./tmp/codex_probe.png"
                ));
            }
            ItemMapOut::Hide => panic!("imageView must be a tool"),
        }
    }

    #[test]
    fn file_change_delete_maps_to_delete() {
        let item = serde_json::json!({
            "type": "fileChange",
            "id": "fc_del",
            "status": "completed",
            "changes": [{
                "path": "tmp/codex_delete_probe.txt",
                "kind": { "type": "delete" },
                "diff": "@@ -1 +0,0 @@\n-bye\n"
            }]
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools.len(), 1);
                assert_eq!(tools[0].kind, AgentToolKind::Delete);
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::Delete {
                        path: "tmp/codex_delete_probe.txt".into()
                    }
                );
            }
            ItemMapOut::Hide => panic!("fileChange delete must be a tool"),
        }
    }

    #[test]
    fn skill_dynamic_tool_maps_to_skill() {
        let item = serde_json::json!({
            "type": "dynamicToolCall",
            "id": "sk_1",
            "tool": "skill",
            "status": "completed",
            "arguments": { "skill": "screenshot" },
            "result": "loaded"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Skill);
                assert_eq!(
                    tools[0].params,
                    AgentToolParams::Skill {
                        skill: "screenshot".into()
                    }
                );
            }
            ItemMapOut::Hide => panic!("skill must be a tool"),
        }
    }

    #[test]
    fn function_call_list_mcp_resources_maps_to_mcp_list() {
        let item = serde_json::json!({
            "type": "functionCallOutput",
            "id": "fn_1",
            "name": "list_mcp_resources",
            "output": "server=node_repl"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::McpList);
                assert_eq!(tools[0].name, "list_mcp_resources");
            }
            ItemMapOut::Hide => panic!("list_mcp_resources must be a tool"),
        }
    }

    #[test]
    fn function_call_view_image_maps_to_read() {
        let item = serde_json::json!({
            "type": "functionCallOutput",
            "id": "fn_img",
            "name": "view_image",
            "arguments": { "path": "./tmp/codex_probe.png" },
            "output": "ok"
        });
        match map_item(&item, ItemPhase::Completed) {
            ItemMapOut::Tools(tools) => {
                assert_eq!(tools[0].kind, AgentToolKind::Read);
                assert!(matches!(
                    tools[0].params,
                    AgentToolParams::Read { ref path, .. } if path == "./tmp/codex_probe.png"
                ));
            }
            ItemMapOut::Hide => panic!("view_image must be a tool"),
        }
    }
}
