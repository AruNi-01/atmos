//! Claude tool names → Atmos `AgentTool` (kind + params + result only).

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::contract::{
    AgentMcpRef, AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus,
};
use crate::map::{classify_tool, plan_from_tool_input_or_stub, ClassifiedTool};
use crate::map::{
    extract_background, extract_command, extract_cwd, extract_links, extract_path, extract_query,
    extract_search_hits, extract_skill, extract_subagent, extract_task_id, extract_url,
    mcp_ref_from_name,
};

#[derive(Debug, Clone)]
pub(crate) enum ToolMapOut {
    FoldThinking {
        text: String,
    },
    FoldPlan {
        plan: Value,
    },
    /// Mode enter/exit: sync Mode UI via ConfigChanged; also surface a readable Other card.
    SyncMode {
        mode: String,
        tool: AgentTool,
    },
    Hide,
    Merge {
        tool: AgentTool,
    },
    Tool(AgentTool),
}

#[cfg(test)]
pub(crate) fn map_tool_use(
    name: &str,
    tool_use_id: &str,
    input: &Value,
    tools: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    map_tool_use_nested(name, tool_use_id, input, tools, None)
}

pub(crate) fn map_tool_use_nested(
    name: &str,
    tool_use_id: &str,
    input: &Value,
    tools: &mut HashMap<String, AgentTool>,
    parent_tool_call_id: Option<String>,
) -> ToolMapOut {
    match classify_claude_name(name, input) {
        ClassifiedTool::Thinking => ToolMapOut::FoldThinking {
            text: thinking_from_input(input),
        },
        ClassifiedTool::Plan => {
            // Remember the id so tool_result does not surface as `unknown`.
            tools.insert(
                tool_use_id.to_string(),
                folded_away_marker(name, tool_use_id, parent_tool_call_id.clone()),
            );
            ToolMapOut::FoldPlan {
                plan: plan_from_tool_input_or_stub(name, plan_fold_title(name), Some(input)),
            }
        }
        ClassifiedTool::PlanDocument => {
            let params = crate::map::plan_document_from_tool_input(Some(input)).unwrap_or(
                AgentToolParams::PlanDocument {
                    name: None,
                    overview: None,
                    plan: String::new(),
                    todos: Vec::new(),
                    is_project: None,
                    phases: None,
                },
            );
            let title = match &params {
                AgentToolParams::PlanDocument {
                    name: plan_name,
                    overview,
                    ..
                } => plan_name.clone().or_else(|| overview.clone()),
                _ => None,
            };
            let tool = AgentTool {
                tool_call_id: tool_use_id.to_string(),
                parent_tool_call_id: parent_tool_call_id.clone(),
                name: name.to_string(),
                title,
                kind: AgentToolKind::PlanDocument,
                status: AgentToolStatus::Running,
                params,
                result: None,
            };
            tools.insert(tool_use_id.to_string(), tool.clone());
            ToolMapOut::Tool(tool)
        }
        ClassifiedTool::Hide => {
            if is_poll_output_name(name) {
                merge_hidden_output(name, tool_use_id, input, None, tools)
            } else {
                // AskUserQuestion: permission chrome owns the card.
                tools.insert(
                    tool_use_id.to_string(),
                    folded_away_marker(name, tool_use_id, parent_tool_call_id.clone()),
                );
                ToolMapOut::Hide
            }
        }
        ClassifiedTool::Call(kind) => {
            if let Some(mode) = mode_from_claude_name(name) {
                let tool = mode_tool(name, tool_use_id, mode, parent_tool_call_id.clone());
                tools.insert(tool_use_id.to_string(), tool.clone());
                return ToolMapOut::SyncMode {
                    mode: mode.into(),
                    tool,
                };
            }
            let tool = build_tool(
                name,
                tool_use_id,
                kind,
                input,
                AgentToolStatus::Running,
                None,
                parent_tool_call_id.clone(),
            );
            remember_task(&tool, tools);
            ToolMapOut::Tool(tool)
        }
    }
}

pub(crate) fn map_tool_result(
    tool_use_id: &str,
    content: &Value,
    is_error: bool,
    tools: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    if tools
        .get(tool_use_id)
        .is_some_and(|tool| is_folded_away_name(&tool.name))
    {
        tools.remove(tool_use_id);
        return ToolMapOut::Hide;
    }
    if tools.get(tool_use_id).is_none() {
        if extract_parent_id(content, None).is_some() {
            return merge_hidden_output("BashOutput", tool_use_id, content, Some(content), tools);
        }
        return ToolMapOut::Tool(unknown_completed(tool_use_id, content, is_error));
    }
    let mut tool = tools.get(tool_use_id).cloned().expect("checked");
    if tool.kind == AgentToolKind::Subagent {
        let is_original_dispatch = tool.tool_call_id == tool_use_id;
        if is_original_dispatch && !is_error {
            if let Some(task_id) = extract_claude_task_id(content) {
                if let AgentToolParams::Subagent {
                    task_id: stored_task_id,
                    ..
                } = &mut tool.params
                {
                    *stored_task_id = Some(task_id);
                }
                let terminal =
                    task_status(content).is_some_and(|status| status != AgentToolStatus::Running);
                if !terminal {
                    // A Task's first result only acknowledges dispatch. TaskOutput
                    // carries the child's eventual output and terminal status.
                    remember_task(&tool, tools);
                    return ToolMapOut::Tool(tool);
                }
            }
        }
        if let Some(status) = task_status(content) {
            tool.status = status;
        } else {
            tool.status = if is_error {
                AgentToolStatus::Failed
            } else {
                AgentToolStatus::Completed
            };
        }
        if is_error {
            tool.status = AgentToolStatus::Failed;
        }
        tool.result = Some(if is_error {
            AgentToolResult::Error {
                message: content_text(content),
            }
        } else {
            AgentToolResult::Text {
                text: content_text(content),
            }
        });
        remember_task(&tool, tools);
        tools.insert(tool.tool_call_id.clone(), tool.clone());
        tools.insert(tool_use_id.to_string(), tool.clone());
        return ToolMapOut::Tool(tool);
    }
    tool.status = if is_error {
        AgentToolStatus::Failed
    } else {
        AgentToolStatus::Completed
    };
    // Bash failures still carry structured exit codes in stdout ("Exit code N\n…").
    // Keep Execute+exit_code instead of opaque Error so the UI can show the code.
    tool.result = Some(if is_error && tool.kind != AgentToolKind::Execute {
        AgentToolResult::Error {
            message: content_text(content),
        }
    } else {
        result_for_kind(tool.kind, &tool.params, content)
    });
    remember_task(&tool, tools);
    tools.insert(tool_use_id.to_string(), tool.clone());
    ToolMapOut::Tool(tool)
}

#[cfg(test)]
pub(crate) fn map_hidden_poll(
    name: &str,
    poll_id: &str,
    input: &Value,
    output: Option<&Value>,
    tools: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    merge_hidden_output(name, poll_id, input, output, tools)
}

fn classify_claude_name(name: &str, input: &Value) -> ClassifiedTool {
    match name {
        "Bash" => ClassifiedTool::Call(AgentToolKind::Execute),
        "Read" => ClassifiedTool::Call(AgentToolKind::Read),
        "Edit" | "Write" | "NotebookEdit" => ClassifiedTool::Call(AgentToolKind::Edit),
        "Grep" | "Glob" => ClassifiedTool::Call(AgentToolKind::Search),
        "WebSearch" => ClassifiedTool::Call(AgentToolKind::WebSearch),
        "WebFetch" => ClassifiedTool::Call(AgentToolKind::Fetch),
        "Skill" => ClassifiedTool::Call(AgentToolKind::Skill),
        "Task" | "Agent" => ClassifiedTool::Call(AgentToolKind::Subagent),
        // Task list tools → Plan always (never Hide).
        "TodoWrite" | "TaskCreate" | "TaskUpdate" | "TaskGet" | "TaskList" => ClassifiedTool::Plan,
        // AskUser lives in permission chrome (can_use_tool → PermissionRequested).
        "AskUserQuestion" => ClassifiedTool::Hide,
        // Mode enter/exit: SyncMode + Other card (not Hide).
        "EnterPlanMode" | "ExitPlanMode" => ClassifiedTool::Call(AgentToolKind::Other),
        // Scheduler / wait / peer / LSP symbol: visible Other (not Hide / not fake Read).
        "CronCreate" | "CronDelete" | "CronList" | "Sleep" | "Wait" | "Monitor" | "ListAgents"
        | "LSP" => ClassifiedTool::Call(AgentToolKind::Other),
        "BashOutput" | "TaskOutput" => ClassifiedTool::Hide,
        "ListMcpResourcesTool" | "ListMcpResources" => ClassifiedTool::Call(AgentToolKind::McpList),
        "ReadMcpResourceTool" | "ReadMcpResource" => ClassifiedTool::Call(AgentToolKind::Read),
        other if other.starts_with("mcp__") => ClassifiedTool::Call(AgentToolKind::McpCall),
        other => classify_tool(other, None, Some(input)),
    }
}

fn mode_from_claude_name(name: &str) -> Option<&'static str> {
    match name {
        "EnterPlanMode" => Some("plan"),
        "ExitPlanMode" => Some("default"),
        _ => None,
    }
}

fn is_poll_output_name(name: &str) -> bool {
    matches!(name, "BashOutput" | "TaskOutput")
}

fn is_folded_away_name(name: &str) -> bool {
    matches!(
        name,
        "AskUserQuestion" | "TodoWrite" | "TaskCreate" | "TaskUpdate" | "TaskGet" | "TaskList"
    )
}

fn plan_fold_title(name: &str) -> Option<&str> {
    match name {
        "TaskList" => Some("Tasks"),
        _ => None,
    }
}

fn folded_away_marker(
    name: &str,
    tool_use_id: &str,
    parent_tool_call_id: Option<String>,
) -> AgentTool {
    AgentTool {
        tool_call_id: tool_use_id.to_string(),
        parent_tool_call_id,
        name: name.to_string(),
        title: None,
        kind: AgentToolKind::Other,
        status: AgentToolStatus::Running,
        params: AgentToolParams::Other { value: json!({}) },
        result: None,
    }
}

fn mode_tool(
    name: &str,
    tool_use_id: &str,
    mode: &str,
    parent_tool_call_id: Option<String>,
) -> AgentTool {
    let title = if mode == "plan" {
        "Enter plan mode"
    } else {
        "Exit plan mode"
    };
    AgentTool {
        tool_call_id: tool_use_id.to_string(),
        parent_tool_call_id,
        name: name.to_string(),
        title: Some(title.into()),
        kind: AgentToolKind::Other,
        status: AgentToolStatus::Running,
        params: AgentToolParams::Other {
            value: json!({ "mode": mode }),
        },
        result: None,
    }
}

fn build_tool(
    name: &str,
    tool_use_id: &str,
    kind: AgentToolKind,
    input: &Value,
    status: AgentToolStatus,
    result: Option<AgentToolResult>,
    parent_tool_call_id: Option<String>,
) -> AgentTool {
    let mcp = mcp_ref_from_input(name, input).or_else(|| mcp_ref_from_name(name));
    match typed_params(kind, name, input) {
        Some(params) => AgentTool {
            tool_call_id: tool_use_id.to_string(),
            parent_tool_call_id: parent_tool_call_id.clone(),
            name: name.to_string(),
            title: mcp_title(name, mcp.as_ref()),
            kind,
            status,
            params,
            result,
        },
        None => AgentTool {
            tool_call_id: tool_use_id.to_string(),
            parent_tool_call_id,
            name: name.to_string(),
            title: mcp_title(name, mcp.as_ref()),
            kind: match kind {
                AgentToolKind::McpList => AgentToolKind::McpList,
                AgentToolKind::McpCall => AgentToolKind::McpCall,
                _ => AgentToolKind::Other,
            },
            status,
            params: match kind {
                AgentToolKind::McpList => AgentToolParams::McpList {
                    server: mcp.as_ref().and_then(|item| item.server.clone()),
                },
                AgentToolKind::McpCall => AgentToolParams::McpCall {
                    server: mcp.as_ref().and_then(|item| item.server.clone()),
                    tool: mcp.as_ref().and_then(|item| item.tool.clone()),
                },
                _ => AgentToolParams::Other {
                    value: input.clone(),
                },
            },
            result: result.map(|result| match result {
                AgentToolResult::Empty => AgentToolResult::Other { value: json!({}) },
                other => other,
            }),
        },
    }
}

fn mcp_ref_from_input(name: &str, input: &Value) -> Option<AgentMcpRef> {
    if name == "ListMcpResourcesTool"
        || name == "ListMcpResources"
        || name == "ReadMcpResourceTool"
        || name == "ReadMcpResource"
    {
        let server = input
            .get("server")
            .or_else(|| input.get("serverName"))
            .and_then(Value::as_str)
            .map(str::to_string);
        return Some(AgentMcpRef {
            server,
            tool: Some(name.to_string()),
        });
    }
    None
}

fn mcp_title(name: &str, mcp: Option<&AgentMcpRef>) -> Option<String> {
    let mcp = mcp?;
    match (&mcp.server, &mcp.tool) {
        (Some(server), Some(tool)) if tool != name => Some(format!("MCP {server}/{tool}")),
        (Some(server), _) => Some(format!("MCP {server}")),
        (None, Some(tool)) => Some(format!("MCP {tool}")),
        _ => Some("MCP".into()),
    }
}

fn typed_params(
    kind: crate::contract::AgentToolKind,
    name: &str,
    input: &Value,
) -> Option<AgentToolParams> {
    match kind {
        crate::contract::AgentToolKind::Read => Some(AgentToolParams::Read {
            path: extract_path(input)?,
            offset: extract_i64(input, &["offset", "start_line"]),
            limit: extract_i64(input, &["limit", "count", "num_lines"]),
        }),
        crate::contract::AgentToolKind::Edit => Some(AgentToolParams::Edit {
            path: extract_path(input)?,
        }),
        crate::contract::AgentToolKind::Search => {
            let query = extract_query(input)?;
            // Claude Glob puts the filesystem pattern in `pattern` (mapped via
            // extract_query). Surface it on `glob` too so Search UI can treat it
            // as a path glob, not a text query.
            let glob = if name == "Glob" {
                Some(query.clone())
            } else {
                first_string(input, &["glob"]).filter(|glob| glob != &query)
            };
            Some(AgentToolParams::Search {
                query,
                path: extract_path(input),
                glob,
            })
        }
        crate::contract::AgentToolKind::WebSearch => Some(AgentToolParams::WebSearch {
            query: extract_query(input)?,
        }),
        crate::contract::AgentToolKind::Execute => Some(AgentToolParams::Execute {
            command: extract_command(input)?,
            cwd: extract_cwd(input),
            background: extract_background(input),
            task_id: extract_task_id(input),
        }),
        crate::contract::AgentToolKind::Fetch => Some(AgentToolParams::Fetch {
            url: extract_url(input)?,
        }),
        crate::contract::AgentToolKind::Skill => Some(AgentToolParams::Skill {
            skill: extract_skill(input).or_else(|| first_string(input, &["skill_name"]))?,
        }),
        crate::contract::AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(input).unwrap_or_else(|| {
                (
                    first_string(input, &["description", "prompt", "task"]).unwrap_or_default(),
                    first_string(input, &["subagent_type", "agent_type"]),
                )
            });
            if description.is_empty() {
                return None;
            }
            Some(AgentToolParams::Subagent {
                description,
                agent_type,
                task_id: extract_task_id(input),
            })
        }
        crate::contract::AgentToolKind::McpList => Some(AgentToolParams::McpList {
            server: first_string(input, &["server", "serverName"]),
        }),
        crate::contract::AgentToolKind::McpCall => {
            let mcp = mcp_ref_from_input(name, input).or_else(|| mcp_ref_from_name(name));
            Some(AgentToolParams::McpCall {
                server: mcp.as_ref().and_then(|item| item.server.clone()),
                tool: mcp
                    .as_ref()
                    .and_then(|item| item.tool.clone())
                    .or_else(|| Some(name.to_string())),
            })
        }
        crate::contract::AgentToolKind::ImageGen => {
            use crate::map::{
                extract_aspect_ratio, extract_image_prompt, extract_image_size,
                extract_reference_paths,
            };
            Some(AgentToolParams::ImageGen {
                prompt: extract_image_prompt(input).unwrap_or_default(),
                aspect_ratio: extract_aspect_ratio(input),
                size: extract_image_size(input),
                path: first_string(
                    input,
                    &["filename", "path", "file", "file_path", "output_path"],
                ),
                reference_paths: extract_reference_paths(input),
            })
        }
        crate::contract::AgentToolKind::PlanDocument => Some(
            crate::map::plan_document_from_tool_input(Some(input)).unwrap_or(
                AgentToolParams::PlanDocument {
                    name: None,
                    overview: None,
                    plan: String::new(),
                    todos: Vec::new(),
                    is_project: None,
                    phases: None,
                },
            ),
        ),
        crate::contract::AgentToolKind::Other => Some(AgentToolParams::Other {
            value: input.clone(),
        }),
        crate::contract::AgentToolKind::Delete | crate::contract::AgentToolKind::Move => None,
    }
}

fn result_for_kind(
    kind: crate::contract::AgentToolKind,
    params: &AgentToolParams,
    content: &Value,
) -> AgentToolResult {
    match kind {
        crate::contract::AgentToolKind::Execute => AgentToolResult::Execute {
            output: content_text(content),
            exit_code: extract_exit_code(content),
        },
        crate::contract::AgentToolKind::WebSearch => {
            let query = match params {
                AgentToolParams::WebSearch { query } => query.clone(),
                _ => extract_query(content).unwrap_or_default(),
            };
            let payload = nested_object(content);
            let links = extract_links(payload);
            if links.is_empty() {
                AgentToolResult::Text {
                    text: content_text(content),
                }
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        crate::contract::AgentToolKind::Fetch => {
            let url = match params {
                AgentToolParams::Fetch { url } => url.clone(),
                _ => extract_url(nested_object(content)).unwrap_or_default(),
            };
            let payload = nested_object(content);
            let title = first_string(payload, &["title"]);
            let markdown = first_string(payload, &["markdown", "md"]);
            let text = first_string(payload, &["text", "content", "body"]);
            if title.is_some() || markdown.is_some() || text.is_some() {
                AgentToolResult::WebFetch {
                    url,
                    title,
                    markdown,
                    text,
                }
            } else {
                AgentToolResult::Text {
                    text: content_text(content),
                }
            }
        }
        crate::contract::AgentToolKind::Read => {
            let path = match params {
                AgentToolParams::Read { path, .. } => path.clone(),
                _ => extract_path(nested_object(content)).unwrap_or_default(),
            };
            AgentToolResult::FileContent {
                path,
                text: content_text(content),
            }
        }
        crate::contract::AgentToolKind::Search => {
            let query = match params {
                AgentToolParams::Search { query, .. } => query.clone(),
                _ => extract_query(content).unwrap_or_default(),
            };
            let hits = extract_search_hits(content);
            if hits.is_empty() {
                AgentToolResult::Text {
                    text: content_text(content),
                }
            } else {
                AgentToolResult::SearchHits { query, hits }
            }
        }
        crate::contract::AgentToolKind::ImageGen => {
            let images = crate::map::extract_generated_images(content);
            if images.is_empty() {
                AgentToolResult::Text {
                    text: content_text(content),
                }
            } else {
                AgentToolResult::Images { images }
            }
        }
        crate::contract::AgentToolKind::Other => AgentToolResult::Other {
            value: content.clone(),
        },
        _ => AgentToolResult::Text {
            text: content_text(content),
        },
    }
}

fn merge_hidden_output(
    _name: &str,
    poll_id: &str,
    input: &Value,
    output: Option<&Value>,
    tools: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    let parent_id = extract_parent_id(input, output);
    let Some(parent_id) = parent_id else {
        return ToolMapOut::Hide;
    };
    let Some(mut parent) = tools.get(&parent_id).cloned() else {
        return ToolMapOut::Hide;
    };
    if output.is_some() {
        let payload = output.unwrap_or(input);
        parent.result = Some(match parent.kind {
            AgentToolKind::Subagent => AgentToolResult::Text {
                text: content_text(payload),
            },
            _ => AgentToolResult::Execute {
                output: content_text(payload),
                exit_code: extract_exit_code(payload),
            },
        });
        if let Some(status) = task_status(payload) {
            parent.status = status;
        }
        match &mut parent.params {
            AgentToolParams::Execute { task_id, .. }
            | AgentToolParams::Subagent { task_id, .. } => {
                if task_id.is_none() {
                    *task_id = extract_task_id(payload).or_else(|| Some(parent_id.clone()));
                }
            }
            _ => {}
        }
        remember_task(&parent, tools);
        tools.insert(poll_id.to_string(), parent.clone());
        ToolMapOut::Merge { tool: parent }
    } else {
        tools.insert(poll_id.to_string(), parent);
        ToolMapOut::Hide
    }
}

fn extract_parent_id(input: &Value, output: Option<&Value>) -> Option<String> {
    first_string(
        input,
        &[
            "bash_id",
            "bashId",
            "task_id",
            "taskId",
            "agentId",
            "agent_id",
            "tool_use_id",
        ],
    )
    .or_else(|| output.and_then(extract_claude_task_id))
    .or_else(|| extract_claude_task_id(input))
}

fn extract_claude_task_id(content: &Value) -> Option<String> {
    extract_task_id(content)
        .or_else(|| first_string(content, &["agentId", "agent_id"]))
        .or_else(|| {
            let text = content_text(content);
            if text.is_empty() {
                return None;
            }
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if let Some(id) = extract_task_id(&value)
                    .or_else(|| first_string(&value, &["agentId", "agent_id"]))
                {
                    return Some(id);
                }
            }
            extract_agent_id_from_text(&text)
        })
}

fn extract_agent_id_from_text(text: &str) -> Option<String> {
    let marker = "agentId: ";
    let pos = text.find(marker)?;
    let start = pos + marker.len();
    let rest = &text[start..];
    let end = rest
        .find(|c: char| !c.is_ascii_alphanumeric())
        .unwrap_or(rest.len());
    if end > 0 {
        Some(rest[..end].to_string())
    } else {
        None
    }
}

fn remember_task(tool: &AgentTool, tools: &mut HashMap<String, AgentTool>) {
    tools.insert(tool.tool_call_id.clone(), tool.clone());
    match &tool.params {
        AgentToolParams::Execute {
            task_id: Some(task_id),
            ..
        }
        | AgentToolParams::Subagent {
            task_id: Some(task_id),
            ..
        } => {
            tools.insert(task_id.clone(), tool.clone());
        }
        _ => {}
    }
}

fn unknown_completed(tool_use_id: &str, content: &Value, is_error: bool) -> AgentTool {
    AgentTool {
        tool_call_id: tool_use_id.to_string(),
        parent_tool_call_id: None,
        name: "unknown".into(),
        title: None,
        kind: crate::contract::AgentToolKind::Other,
        status: if is_error {
            AgentToolStatus::Failed
        } else {
            AgentToolStatus::Completed
        },
        params: AgentToolParams::Other { value: json!({}) },
        result: Some(if is_error {
            AgentToolResult::Error {
                message: content_text(content),
            }
        } else {
            AgentToolResult::Other {
                value: content.clone(),
            }
        }),
    }
}

fn thinking_from_input(input: &Value) -> String {
    first_string(input, &["thought", "text", "content", "thinking"]).unwrap_or_default()
}

fn task_status(payload: &Value) -> Option<AgentToolStatus> {
    match first_string(payload, &["status", "state"])
        .as_deref()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("completed" | "complete" | "done") => Some(AgentToolStatus::Completed),
        Some("failed" | "error" | "cancelled" | "canceled") => Some(AgentToolStatus::Failed),
        _ if payload
            .get("failed")
            .or_else(|| payload.get("error"))
            .and_then(Value::as_bool)
            .unwrap_or(false) =>
        {
            Some(AgentToolStatus::Failed)
        }
        _ if payload
            .get("completed")
            .or_else(|| payload.get("done"))
            .and_then(Value::as_bool)
            .unwrap_or(false) =>
        {
            Some(AgentToolStatus::Completed)
        }
        _ => None,
    }
}

fn nested_object(content: &Value) -> &Value {
    content
}

fn content_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    if let Some(items) = content.as_array() {
        return items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("");
    }
    first_string(
        content,
        &["output", "text", "content", "stdout", "body", "raw_output"],
    )
    .or_else(|| {
        content
            .get("Result")
            .and_then(|nested| first_string(nested, &["output", "text", "content"]))
    })
    .unwrap_or_else(|| {
        if content.is_object() || content.is_array() {
            content.to_string()
        } else {
            String::new()
        }
    })
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for key in keys {
        match object.get(*key) {
            Some(Value::String(text)) if !text.trim().is_empty() => {
                return Some(text.trim().to_string());
            }
            Some(Value::Number(number)) => return Some(number.to_string()),
            _ => {}
        }
    }
    None
}

fn extract_i64(value: &Value, keys: &[&str]) -> Option<i64> {
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

fn extract_exit_code(value: &Value) -> Option<i32> {
    extract_i64(
        value,
        &["exit_code", "exitCode", "status_code", "returnCode"],
    )
    .map(|value| value as i32)
    .or_else(|| {
        value
            .get("Result")
            .and_then(|nested| extract_i64(nested, &["exit_code", "exitCode"]))
            .map(|value| value as i32)
    })
    // Claude stream-json Bash: no structured exit field on tool_result — only a
    // leading "Exit code N" line inside content text (usually with is_error).
    .or_else(|| parse_exit_code_from_text(&content_text(value)))
}

/// Claude Code formats failed Bash stdout as `Exit code <n>\n…` (no JSON field).
fn parse_exit_code_from_text(text: &str) -> Option<i32> {
    let trimmed = text.trim_start();
    let rest = trimmed.strip_prefix("Exit code ")?;
    let end = rest
        .find(|c: char| !(c.is_ascii_digit() || c == '-'))
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let digits = &rest[..end];
    let after = &rest[end..];
    if !after.is_empty() && !after.starts_with(['\n', '\r', ' ', '\t']) {
        return None;
    }
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;

    #[test]
    fn exact_claude_names_map_kinds() {
        let mut tools = HashMap::new();
        let bash = match map_tool_use(
            "Bash",
            "tu_bash",
            &json!({"command":"ls -la","run_in_background":true}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        };
        assert_eq!(bash.kind, AgentToolKind::Execute);
        assert!(matches!(
            bash.params,
            AgentToolParams::Execute {
                ref command,
                background: true,
                ..
            } if command == "ls -la"
        ));

        let read = match map_tool_use(
            "Read",
            "tu_read",
            &json!({"file_path":"README.md","offset":1,"limit":20}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(read.kind, AgentToolKind::Read);
        assert!(matches!(
            read.params,
            AgentToolParams::Read { ref path, offset: Some(1), limit: Some(20) } if path == "README.md"
        ));

        let web = match map_tool_use(
            "WebSearch",
            "tu_web",
            &json!({"query":"atmos acp"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(web.kind, AgentToolKind::WebSearch);

        let fetch = match map_tool_use(
            "WebFetch",
            "tu_fetch",
            &json!({"url":"https://example.com/page"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(fetch.kind, AgentToolKind::Fetch);

        let grep = match map_tool_use(
            "Grep",
            "tu_grep",
            &json!({"pattern":"AgentTool","path":"crates/agent"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(grep.kind, AgentToolKind::Search);
        assert_ne!(grep.kind, AgentToolKind::WebSearch);

        assert!(matches!(
            map_tool_use(
                "TodoWrite",
                "tu_todo",
                &json!({"todos":[{"content":"Inspect","status":"pending"}]}),
                &mut tools
            ),
            ToolMapOut::FoldPlan { .. }
        ));
        // Even if input has both `plan` markdown and `todos`, Claude stays execution Plan
        // (not Cursor PlanDocument).
        assert!(matches!(
            map_tool_use(
                "TodoWrite",
                "tu_todo_plan_field",
                &json!({
                    "plan": "# Notes\n\nDo work.",
                    "todos":[{"content":"Inspect","status":"pending"}]
                }),
                &mut tools
            ),
            ToolMapOut::FoldPlan { .. }
        ));
        assert!(matches!(
            map_tool_use(
                "BashOutput",
                "tu_poll",
                &json!({"bash_id":"tu_bash"}),
                &mut tools
            ),
            ToolMapOut::Merge { .. } | ToolMapOut::Hide
        ));
    }

    #[test]
    fn ask_user_is_hidden_mode_syncs_not_hide() {
        let mut tools = HashMap::new();
        assert!(matches!(
            map_tool_use(
                "AskUserQuestion",
                "tu_ask",
                &json!({"questions":[{"question":"Ship it?","options":[{"label":"Yes"}]}]}),
                &mut tools
            ),
            ToolMapOut::Hide
        ));
        assert!(matches!(
            map_tool_result("tu_ask", &json!({"ok":true}), false, &mut tools),
            ToolMapOut::Hide
        ));
        assert!(matches!(
            map_tool_use("EnterPlanMode", "tu_enter", &json!({}), &mut tools),
            ToolMapOut::SyncMode { mode, .. } if mode == "plan"
        ));
        assert!(matches!(
            map_tool_use("ExitPlanMode", "tu_exit", &json!({}), &mut tools),
            ToolMapOut::SyncMode { mode, .. } if mode == "default"
        ));
    }

    #[test]
    fn task_create_always_folds_to_plan() {
        let mut tools = HashMap::new();
        assert!(matches!(
            map_tool_use(
                "TaskCreate",
                "tu_task",
                &json!({"subject":"Add auth","description":"sessions"}),
                &mut tools
            ),
            ToolMapOut::FoldPlan { .. }
        ));
        assert!(matches!(
            map_tool_result("tu_task", &json!("Task #1 created"), false, &mut tools),
            ToolMapOut::Hide
        ));
        assert!(matches!(
            map_tool_use(
                "TaskUpdate",
                "tu_upd",
                &json!({"taskId":"1","status":"completed"}),
                &mut tools
            ),
            ToolMapOut::FoldPlan { .. }
        ));
        assert!(matches!(
            map_tool_use("TaskList", "tu_list", &json!({}), &mut tools),
            ToolMapOut::FoldPlan {
                plan
            } if plan
                .get("entries")
                .and_then(|entries| entries.as_array())
                .and_then(|entries| entries.first())
                .and_then(|entry| entry.get("content"))
                .and_then(Value::as_str)
                == Some("Tasks")
        ));
        assert!(matches!(
            map_tool_result("tu_list", &json!("No tasks found"), false, &mut tools),
            ToolMapOut::Hide
        ));
    }

    #[test]
    fn notebook_edit_keeps_edit_kind_via_notebook_path() {
        let mut tools = HashMap::new();
        let tool = match map_tool_use(
            "NotebookEdit",
            "tu_nb",
            &json!({
                "notebook_path": "/tmp/demo.ipynb",
                "cell_id": "c1",
                "new_source": "print(1)"
            }),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        };
        assert_eq!(tool.kind, AgentToolKind::Edit);
        assert!(matches!(
            tool.params,
            AgentToolParams::Edit { ref path } if path == "/tmp/demo.ipynb"
        ));
    }

    #[test]
    fn lsp_and_list_agents_stay_other_not_read() {
        let mut tools = HashMap::new();
        let lsp = match map_tool_use(
            "LSP",
            "tu_lsp",
            &json!({"file_path":"crates/agent/src/lib.rs"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(lsp.kind, AgentToolKind::Other);
        let agents = match map_tool_use("ListAgents", "tu_agents", &json!({}), &mut tools) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(agents.kind, AgentToolKind::Other);
    }

    #[test]
    fn cron_and_mcp_list_are_visible_tools() {
        let mut tools = HashMap::new();
        let cron = match map_tool_use(
            "CronCreate",
            "tu_cron",
            &json!({"cron":"0 * * * *"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        };
        assert_eq!(cron.kind, AgentToolKind::Other);
        let mcp = match map_tool_use(
            "ListMcpResources",
            "tu_mcp",
            &json!({"server":"filesystem"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        };
        assert_eq!(mcp.kind, AgentToolKind::McpList);
        assert!(
            mcp.title
                .as_deref()
                .is_some_and(|title| title.contains("MCP") && title.contains("filesystem")),
            "title={:?}",
            mcp.title
        );
        match mcp.params {
            AgentToolParams::McpList { server } => {
                assert_eq!(server.as_deref(), Some("filesystem"));
            }
            other => panic!("expected mcp list params, got {other:?}"),
        }
    }

    #[test]
    fn unmapped_name_is_other_with_vendor_json_once() {
        let mut tools = HashMap::new();
        let tool = match map_tool_use(
            "vendor_mystery",
            "tc_x",
            &json!({"opaque": true}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(tool.kind, AgentToolKind::Other);
        assert!(
            matches!(tool.params, AgentToolParams::Other { ref value } if *value == json!({"opaque": true}))
        );
        let json = serde_json::to_value(&tool).expect("serialize");
        assert!(json.get("input").is_none());
        assert!(json.get("native").is_none());
    }

    #[test]
    fn bash_exit_code_parsed_from_stdout_prefix_even_when_is_error() {
        let mut tools = HashMap::new();
        let _ = map_tool_use("Bash", "tu_bash", &json!({"command":"false"}), &mut tools);
        let tool = match map_tool_result(
            "tu_bash",
            &json!("Exit code 1\n(eval):1: unmatched '"),
            true,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(tool.status, AgentToolStatus::Failed);
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::Execute {
                exit_code: Some(1),
                ..
            })
        ));
    }

    #[test]
    fn bash_success_stdout_without_exit_prefix_keeps_exit_none() {
        let mut tools = HashMap::new();
        let _ = map_tool_use("Bash", "tu_ok", &json!({"command":"echo hi"}), &mut tools);
        let tool = match map_tool_result("tu_ok", &json!("hi\n"), false, &mut tools) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::Execute {
                exit_code: None,
                ref output
            }) if output == "hi\n"
        ));
    }

    #[test]
    fn glob_pattern_surfaces_on_search_glob() {
        let mut tools = HashMap::new();
        let tool = match map_tool_use(
            "Glob",
            "tu_glob",
            &json!({"pattern":"**/*.rs","path":"./tmp"}),
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(tool.kind, AgentToolKind::Search);
        assert!(matches!(
            tool.params,
            AgentToolParams::Search {
                ref query,
                path: Some(ref path),
                glob: Some(ref glob),
            } if query == "**/*.rs" && path == "./tmp" && glob == "**/*.rs"
        ));
    }

    #[test]
    fn bashoutput_merges_onto_parent_execute() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Bash",
            "tu_bash",
            &json!({"command":"sleep 1","run_in_background":true}),
            &mut tools,
        );
        let merged = match map_hidden_poll(
            "BashOutput",
            "tu_poll",
            &json!({"bash_id":"tu_bash"}),
            Some(&json!({"output":"done","exit_code":0})),
            &mut tools,
        ) {
            ToolMapOut::Merge { tool } => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(merged.tool_call_id, "tu_bash");
        assert_eq!(merged.kind, AgentToolKind::Execute);
        assert!(matches!(
            merged.result,
            Some(AgentToolResult::Execute { ref output, exit_code: Some(0) }) if output == "done"
        ));
    }

    #[test]
    fn task_output_completes_the_original_subagent_card() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Task",
            "tu_task",
            &json!({"description":"Inspect tests","subagent_type":"explore"}),
            &mut tools,
        );
        let dispatched = match map_tool_result(
            "tu_task",
            &json!({"task_id":"child-1","status":"running"}),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected dispatched task, got {other:?}"),
        };
        assert_eq!(dispatched.status, AgentToolStatus::Running);

        let completed = match map_hidden_poll(
            "TaskOutput",
            "tu_poll",
            &json!({"task_id":"child-1"}),
            Some(&json!({"task_id":"child-1","status":"completed","output":"All tests pass."})),
            &mut tools,
        ) {
            ToolMapOut::Merge { tool } => tool,
            other => panic!("expected merged task output, got {other:?}"),
        };
        assert_eq!(completed.tool_call_id, "tu_task");
        assert_eq!(completed.status, AgentToolStatus::Completed);
        assert_eq!(
            completed.result,
            Some(AgentToolResult::Text {
                text: "All tests pass.".into()
            })
        );
    }

    #[test]
    fn task_output_failure_fails_the_original_subagent_card() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Task",
            "tu_task",
            &json!({"description":"Inspect tests","subagent_type":"explore"}),
            &mut tools,
        );
        let _ = map_tool_result(
            "tu_task",
            &json!({"task_id":"child-1","status":"running"}),
            false,
            &mut tools,
        );

        let failed = match map_hidden_poll(
            "TaskOutput",
            "tu_poll",
            &json!({"task_id":"child-1"}),
            Some(&json!({
                "task_id":"child-1",
                "status":"failed",
                "output":"The child agent could not inspect the tests."
            })),
            &mut tools,
        ) {
            ToolMapOut::Merge { tool } => tool,
            other => panic!("expected merged task output, got {other:?}"),
        };
        assert_eq!(failed.tool_call_id, "tu_task");
        assert_eq!(failed.status, AgentToolStatus::Failed);
    }

    #[test]
    fn task_output_tool_result_completes_the_original_subagent_card() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Task",
            "tu_task",
            &json!({"description":"Inspect tests","subagent_type":"explore"}),
            &mut tools,
        );
        let _ = map_tool_result(
            "tu_task",
            &json!({"task_id":"child-1","status":"running"}),
            false,
            &mut tools,
        );
        assert!(matches!(
            map_tool_use(
                "TaskOutput",
                "tu_poll",
                &json!({"task_id":"child-1"}),
                &mut tools,
            ),
            ToolMapOut::Hide
        ));

        let completed = match map_tool_result(
            "tu_poll",
            &json!({
                "task_id":"child-1",
                "status":"completed",
                "output":"All tests pass."
            }),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected completed task output, got {other:?}"),
        };
        assert_eq!(completed.tool_call_id, "tu_task");
        assert_eq!(completed.status, AgentToolStatus::Completed);
        assert_eq!(
            completed.result,
            Some(AgentToolResult::Text {
                text: "All tests pass.".into()
            })
        );
    }

    #[test]
    fn agent_id_text_result_keeps_the_subagent_running() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Task",
            "tu_task",
            &json!({"description":"Inspect tests","subagent_type":"explore"}),
            &mut tools,
        );
        let dispatched = match map_tool_result(
            "tu_task",
            &json!([{
                "type": "text",
                "text": "agentId: child1 (use SendMessage to resume)"
            }]),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected dispatch ack, got {other:?}"),
        };
        assert_eq!(dispatched.status, AgentToolStatus::Running);
        match dispatched.params {
            AgentToolParams::Subagent {
                task_id: Some(task_id),
                ..
            } => assert_eq!(task_id, "child1"),
            other => panic!("expected stored agent id, got {other:?}"),
        }

        assert!(matches!(
            map_tool_use(
                "TaskOutput",
                "tu_poll",
                &json!({"task_id":"child1"}),
                &mut tools,
            ),
            ToolMapOut::Hide
        ));
        let completed = match map_tool_result(
            "tu_poll",
            &json!([{ "type": "text", "text": "All tests pass." }]),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected completed task output, got {other:?}"),
        };
        assert_eq!(completed.tool_call_id, "tu_task");
        assert_eq!(completed.status, AgentToolStatus::Completed);
        assert_eq!(
            completed.result,
            Some(AgentToolResult::Text {
                text: "All tests pass.".into()
            })
        );
    }

    #[test]
    fn nested_tool_use_keeps_parent_tool_call_id() {
        let mut tools = HashMap::new();
        let tool = match map_tool_use_nested(
            "Read",
            "tu_child",
            &json!({"file_path":"README.md"}),
            &mut tools,
            Some("tu_task".into()),
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected nested read, got {other:?}"),
        };
        assert_eq!(tool.parent_tool_call_id.as_deref(), Some("tu_task"));
        assert_eq!(tool.kind, AgentToolKind::Read);
    }

    #[test]
    fn app069_s1_grep_stdout_emits_search_hits() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Grep",
            "tu_grep",
            &json!({"pattern":"AgentTool","path":"crates/agent"}),
            &mut tools,
        );
        let tool = match map_tool_result(
            "tu_grep",
            &json!("crates/agent/src/lib.rs:12: pub struct AgentTool"),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
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
    fn app069_s2_grep_empty_stdout_stays_text() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "Grep",
            "tu_grep",
            &json!({"pattern":"AgentTool","path":"crates/agent"}),
            &mut tools,
        );
        let tool = match map_tool_result("tu_grep", &json!(""), false, &mut tools) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(tool.result, Some(AgentToolResult::Text { text: "".into() }));
    }

    #[test]
    fn app069_s2_web_search_result_is_never_search_hits() {
        let mut tools = HashMap::new();
        let _ = map_tool_use(
            "WebSearch",
            "tu_web",
            &json!({"query":"atmos acp"}),
            &mut tools,
        );
        let tool = match map_tool_result(
            "tu_web",
            &json!({
                "links": [{ "url": "https://example.com", "title": "Example" }],
                "text": "src/lib.rs:1:should not become a workspace hit"
            }),
            false,
            &mut tools,
        ) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("{other:?}"),
        };
        assert_eq!(tool.kind, AgentToolKind::WebSearch);
        assert!(matches!(
            tool.result,
            Some(AgentToolResult::WebSearch { .. })
        ));
        assert!(!matches!(
            tool.result,
            Some(AgentToolResult::SearchHits { .. })
        ));
    }
}
