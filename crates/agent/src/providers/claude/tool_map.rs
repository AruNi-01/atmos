//! Claude tool names → Atmos `AgentTool` (kind + params + result only).

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::{classify_tool, plan_from_tool_input, ClassifiedTool};
use crate::map::{
    extract_background, extract_command, extract_cwd, extract_links, extract_path, extract_query,
    extract_search_hits, extract_skill, extract_subagent, extract_task_id, extract_url,
};

#[derive(Debug, Clone)]
pub(crate) enum ToolMapOut {
    FoldThinking { text: String },
    FoldPlan { plan: Value },
    Hide,
    Merge { tool: AgentTool },
    Tool(AgentTool),
}

pub(crate) fn map_tool_use(
    name: &str,
    tool_use_id: &str,
    input: &Value,
    tools: &mut HashMap<String, AgentTool>,
) -> ToolMapOut {
    match classify_claude_name(name, input) {
        ClassifiedTool::Thinking => ToolMapOut::FoldThinking {
            text: thinking_from_input(input),
        },
        ClassifiedTool::Plan => match plan_from_tool_input(Some(input)) {
            Some(plan) => ToolMapOut::FoldPlan { plan },
            None => ToolMapOut::Hide,
        },
        ClassifiedTool::Hide => merge_hidden_output(name, tool_use_id, input, None, tools),
        ClassifiedTool::Call(kind) => {
            let tool = build_tool(
                name,
                tool_use_id,
                kind,
                input,
                AgentToolStatus::Running,
                None,
            );
            remember_execute(&tool, tools);
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
    if tools.get(tool_use_id).is_none() {
        if extract_parent_id(content, None).is_some() {
            return merge_hidden_output("BashOutput", tool_use_id, content, Some(content), tools);
        }
        return ToolMapOut::Tool(unknown_completed(tool_use_id, content, is_error));
    }
    let mut tool = tools.get(tool_use_id).cloned().expect("checked");
    tool.status = if is_error {
        AgentToolStatus::Failed
    } else {
        AgentToolStatus::Completed
    };
    tool.result = Some(if is_error {
        AgentToolResult::Error {
            message: content_text(content),
        }
    } else {
        result_for_kind(tool.kind, &tool.params, content)
    });
    remember_execute(&tool, tools);
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
        "Bash" => ClassifiedTool::Call(crate::contract::AgentToolKind::Execute),
        "Read" => ClassifiedTool::Call(crate::contract::AgentToolKind::Read),
        "Edit" | "Write" | "NotebookEdit" => {
            ClassifiedTool::Call(crate::contract::AgentToolKind::Edit)
        }
        "Grep" | "Glob" => ClassifiedTool::Call(crate::contract::AgentToolKind::Search),
        "WebSearch" => ClassifiedTool::Call(crate::contract::AgentToolKind::WebSearch),
        "WebFetch" => ClassifiedTool::Call(crate::contract::AgentToolKind::Fetch),
        "Skill" => ClassifiedTool::Call(crate::contract::AgentToolKind::Skill),
        "Task" | "Agent" => ClassifiedTool::Call(crate::contract::AgentToolKind::Subagent),
        "BashOutput" | "TaskOutput" => ClassifiedTool::Hide,
        "TodoWrite" => ClassifiedTool::Plan,
        other => classify_tool(other, None, Some(input)),
    }
}

fn build_tool(
    name: &str,
    tool_use_id: &str,
    kind: crate::contract::AgentToolKind,
    input: &Value,
    status: AgentToolStatus,
    result: Option<AgentToolResult>,
) -> AgentTool {
    match typed_params(kind, name, input) {
        Some(params) => AgentTool {
            tool_call_id: tool_use_id.to_string(),
            name: name.to_string(),
            title: None,
            kind,
            status,
            params,
            result,
        },
        None => AgentTool {
            tool_call_id: tool_use_id.to_string(),
            name: name.to_string(),
            title: None,
            kind: crate::contract::AgentToolKind::Other,
            status,
            params: AgentToolParams::Other {
                value: input.clone(),
            },
            result: result.map(|result| match result {
                AgentToolResult::Empty => AgentToolResult::Other { value: json!({}) },
                other => other,
            }),
        },
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
            let glob = first_string(input, &["glob"]).filter(|glob| glob != &query);
            let glob = if name == "Glob" && glob.is_none() {
                None
            } else {
                glob
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
            })
        }
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
        crate::contract::AgentToolKind::Other => AgentToolResult::Other {
            value: content.clone(),
        },
        _ => AgentToolResult::Text {
            text: content_text(content),
        },
    }
}

fn merge_hidden_output(
    name: &str,
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
        parent.result = Some(AgentToolResult::Execute {
            output: content_text(payload),
            exit_code: extract_exit_code(payload),
        });
        if looks_complete(payload, name) {
            parent.status = AgentToolStatus::Completed;
        }
        if let AgentToolParams::Execute { task_id, .. } = &mut parent.params {
            if task_id.is_none() {
                *task_id = extract_task_id(payload).or_else(|| Some(parent_id.clone()));
            }
        }
        remember_execute(&parent, tools);
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
        &["bash_id", "bashId", "task_id", "taskId", "tool_use_id"],
    )
    .or_else(|| {
        output.and_then(|value| {
            first_string(
                value,
                &["bash_id", "bashId", "task_id", "taskId", "tool_use_id"],
            )
        })
    })
    .or_else(|| extract_task_id(input))
}

fn remember_execute(tool: &AgentTool, tools: &mut HashMap<String, AgentTool>) {
    tools.insert(tool.tool_call_id.clone(), tool.clone());
    if let AgentToolParams::Execute {
        task_id: Some(task_id),
        ..
    } = &tool.params
    {
        tools.insert(task_id.clone(), tool.clone());
    }
}

fn unknown_completed(tool_use_id: &str, content: &Value, is_error: bool) -> AgentTool {
    AgentTool {
        tool_call_id: tool_use_id.to_string(),
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

fn looks_complete(payload: &Value, name: &str) -> bool {
    matches!(
        first_string(payload, &["status"]).as_deref(),
        Some("completed" | "complete" | "done")
    ) || name == "BashOutput"
        || name == "TaskOutput"
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
    extract_i64(value, &["exit_code", "exitCode", "status_code"])
        .map(|value| value as i32)
        .or_else(|| {
            value
                .get("Result")
                .and_then(|nested| extract_i64(nested, &["exit_code", "exitCode"]))
                .map(|value| value as i32)
        })
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
