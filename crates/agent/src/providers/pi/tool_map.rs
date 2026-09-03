//! `tool_execution_*` → Atmos `AgentTool`. Execute card is never RPC `bash`.

use serde_json::Value;

use crate::contract::AgentToolKind;
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::{classify_tool, plan_from_tool_input, ClassifiedTool};
use crate::map::{
    extract_command, extract_cwd, extract_links, extract_path, extract_query, extract_search_hits,
    extract_skill, extract_subagent, extract_url,
};

#[derive(Debug, Clone)]
pub enum ToolMapOut {
    FoldThinking { text: String, done: bool },
    FoldPlan { plan: Value },
    Hide,
    Tool(AgentTool),
}

pub fn map_tool_execution(
    tool_call_id: &str,
    tool_name: &str,
    args: &Value,
    status: AgentToolStatus,
    result: Option<&Value>,
    is_error: bool,
) -> ToolMapOut {
    match classify_pi_tool(tool_name, args) {
        ClassifiedTool::Thinking => ToolMapOut::FoldThinking {
            text: result_text(result.unwrap_or(args)),
            done: matches!(status, AgentToolStatus::Completed | AgentToolStatus::Failed),
        },
        ClassifiedTool::Plan => match plan_from_tool_input(Some(args)) {
            Some(plan) => ToolMapOut::FoldPlan { plan },
            None => ToolMapOut::Hide,
        },
        ClassifiedTool::Hide => ToolMapOut::Hide,
        ClassifiedTool::Call(kind) => match build_typed(
            tool_call_id,
            tool_name,
            kind,
            args,
            status,
            result,
            is_error,
        ) {
            Some(tool) => ToolMapOut::Tool(tool),
            None => ToolMapOut::Tool(other_tool(
                tool_call_id,
                tool_name,
                args,
                result,
                status,
                is_error,
            )),
        },
    }
}

fn classify_pi_tool(name: &str, args: &Value) -> ClassifiedTool {
    let lower = name.trim().to_ascii_lowercase();
    match lower.as_str() {
        "bash" | "shell" => ClassifiedTool::Call(AgentToolKind::Execute),
        "read" => ClassifiedTool::Call(AgentToolKind::Read),
        "write" | "edit" => ClassifiedTool::Call(AgentToolKind::Edit),
        "grep" | "find" | "ls" => ClassifiedTool::Call(AgentToolKind::Search),
        "web_search" | "websearch" => ClassifiedTool::Call(AgentToolKind::WebSearch),
        "web_fetch" | "webfetch" => ClassifiedTool::Call(AgentToolKind::Fetch),
        "fetch" => {
            if extract_url(args).is_some() {
                ClassifiedTool::Call(AgentToolKind::Fetch)
            } else {
                ClassifiedTool::Call(AgentToolKind::Other)
            }
        }
        _ => classify_tool(name, None, Some(args)),
    }
}

fn build_typed(
    tool_call_id: &str,
    name: &str,
    kind: AgentToolKind,
    args: &Value,
    status: AgentToolStatus,
    result: Option<&Value>,
    is_error: bool,
) -> Option<AgentTool> {
    if kind == AgentToolKind::Other {
        return None;
    }
    let params = typed_params(kind, args)?;
    let result = mapped_result(kind, args, result, status, is_error);
    Some(AgentTool {
        tool_call_id: tool_call_id.to_string(),
        name: name.to_string(),
        title: None,
        kind,
        status,
        params,
        result,
    })
}

fn typed_params(kind: AgentToolKind, args: &Value) -> Option<AgentToolParams> {
    match kind {
        AgentToolKind::Read => Some(AgentToolParams::Read {
            path: extract_path(args)?,
            offset: as_i64(args, &["offset", "start_line"]),
            limit: as_i64(args, &["limit", "count", "num_lines"]),
        }),
        AgentToolKind::Edit => Some(AgentToolParams::Edit {
            path: extract_path(args)?,
        }),
        AgentToolKind::Delete => Some(AgentToolParams::Delete {
            path: extract_path(args)?,
        }),
        AgentToolKind::Move => Some(AgentToolParams::Move {
            from: string_field(args, &["from", "source", "old_path"])
                .or_else(|| extract_path(args))?,
            to: string_field(args, &["to", "destination", "new_path"])?,
        }),
        AgentToolKind::Search => {
            let path = extract_path(args);
            let query = extract_query(args).or_else(|| path.clone())?;
            let glob = string_field(args, &["glob"]).filter(|glob| glob != &query);
            Some(AgentToolParams::Search { query, path, glob })
        }
        AgentToolKind::WebSearch => Some(AgentToolParams::WebSearch {
            query: extract_query(args)?,
        }),
        AgentToolKind::Execute => Some(AgentToolParams::Execute {
            command: extract_command(args)?,
            cwd: extract_cwd(args),
            background: false,
            task_id: None,
        }),
        AgentToolKind::Fetch => Some(AgentToolParams::Fetch {
            url: extract_url(args)?,
        }),
        AgentToolKind::Skill => Some(AgentToolParams::Skill {
            skill: extract_skill(args)?,
        }),
        AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(args).or_else(|| {
                Some((
                    string_field(args, &["description", "prompt"]).unwrap_or_default(),
                    string_field(args, &["subagent_type", "agent_type"]),
                ))
            })?;
            if description.is_empty() {
                return None;
            }
            Some(AgentToolParams::Subagent {
                description,
                agent_type,
            })
        }
        AgentToolKind::Other => None,
    }
}

fn mapped_result(
    kind: AgentToolKind,
    args: &Value,
    result: Option<&Value>,
    status: AgentToolStatus,
    is_error: bool,
) -> Option<AgentToolResult> {
    if matches!(status, AgentToolStatus::Pending | AgentToolStatus::Running) && result.is_none() {
        return None;
    }
    if is_error || status == AgentToolStatus::Failed {
        let message = result.map(result_text).filter(|text| !text.is_empty());
        return Some(AgentToolResult::Error {
            message: message.unwrap_or_else(|| "tool failed".into()),
        });
    }
    let result = result?;
    Some(match kind {
        AgentToolKind::Execute => AgentToolResult::Execute {
            output: result_text(result),
            exit_code: exit_code(result),
        },
        AgentToolKind::WebSearch => {
            let query = extract_query(args).unwrap_or_default();
            let links = extract_links(result);
            if links.is_empty() {
                AgentToolResult::Text {
                    text: result_text(result),
                }
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        AgentToolKind::Fetch => fetch_result(args, result),
        AgentToolKind::Read => {
            let path = extract_path(args).unwrap_or_default();
            let text = result_text(result);
            if path.is_empty() {
                AgentToolResult::Text { text }
            } else {
                AgentToolResult::FileContent { path, text }
            }
        }
        AgentToolKind::Edit => diff_or_text(args, result),
        AgentToolKind::Search => {
            let query = extract_query(args).unwrap_or_default();
            let hits = extract_search_hits(result);
            if hits.is_empty() {
                AgentToolResult::Text {
                    text: result_text(result),
                }
            } else {
                AgentToolResult::SearchHits { query, hits }
            }
        }
        AgentToolKind::Delete
        | AgentToolKind::Move
        | AgentToolKind::Skill
        | AgentToolKind::Subagent => AgentToolResult::Text {
            text: result_text(result),
        },
        AgentToolKind::Other => AgentToolResult::Other {
            value: result.clone(),
        },
    })
}

fn other_tool(
    tool_call_id: &str,
    name: &str,
    args: &Value,
    result: Option<&Value>,
    status: AgentToolStatus,
    is_error: bool,
) -> AgentTool {
    let result = if is_error || status == AgentToolStatus::Failed {
        Some(AgentToolResult::Error {
            message: result
                .map(result_text)
                .unwrap_or_else(|| "tool failed".into()),
        })
    } else {
        match (status, result) {
            (AgentToolStatus::Pending | AgentToolStatus::Running, None) => None,
            (_, Some(value)) => Some(AgentToolResult::Other {
                value: value.clone(),
            }),
            (_, None) => Some(AgentToolResult::Empty),
        }
    };
    AgentTool {
        tool_call_id: tool_call_id.to_string(),
        name: name.to_string(),
        title: None,
        kind: AgentToolKind::Other,
        status,
        params: AgentToolParams::Other {
            value: args.clone(),
        },
        result,
    }
}

pub fn result_text(value: &Value) -> String {
    if let Some(items) = value.get("content").and_then(Value::as_array) {
        let text: String = items
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    item.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect();
        if !text.is_empty() {
            return text;
        }
    }
    value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn exit_code(result: &Value) -> Option<i32> {
    let details = result.get("details")?;
    details
        .get("exitCode")
        .or_else(|| details.get("exit_code"))
        .and_then(Value::as_i64)
        .map(|n| n as i32)
}

fn fetch_result(args: &Value, result: &Value) -> AgentToolResult {
    let url = extract_url(args)
        .or_else(|| extract_url(result))
        .unwrap_or_default();
    let title = string_field(result, &["title"]);
    let markdown = string_field(result, &["markdown", "md"]);
    let text = string_field(result, &["text", "body"]).or_else(|| {
        let text = result_text(result);
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    });
    if title.is_some() || markdown.is_some() || text.is_some() {
        AgentToolResult::WebFetch {
            url,
            title,
            markdown,
            text,
        }
    } else {
        AgentToolResult::Text {
            text: result_text(result),
        }
    }
}

fn diff_or_text(args: &Value, result: &Value) -> AgentToolResult {
    let path = extract_path(args).unwrap_or_default();
    let additions = as_u32(result, &["additions", "added"]);
    let deletions = as_u32(result, &["deletions", "removed"]);
    if let (Some(additions), Some(deletions)) = (additions, deletions) {
        AgentToolResult::DiffStats {
            path,
            additions,
            deletions,
        }
    } else {
        AgentToolResult::Text {
            text: result_text(result),
        }
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
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

fn as_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    let object = value.as_object()?;
    for key in keys {
        if let Some(number) = object.get(*key).and_then(Value::as_i64) {
            return Some(number);
        }
    }
    None
}

fn as_u32(value: &Value, keys: &[&str]) -> Option<u32> {
    as_i64(value, keys).and_then(|n| u32::try_from(n).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolParams;

    fn load_bash() -> Vec<Value> {
        super::super::codec::parse_jsonl(include_str!("testdata/tool-bash.jsonl"))
    }

    #[test]
    fn bash_tool_execution_maps_to_execute() {
        let frames = load_bash();
        let start = map_tool_execution(
            "call_abc",
            "bash",
            &frames[0]["args"],
            AgentToolStatus::Running,
            None,
            false,
        );
        let ToolMapOut::Tool(started) = start else {
            panic!("expected tool");
        };
        assert_eq!(started.kind, AgentToolKind::Execute);
        assert_eq!(
            started.params,
            AgentToolParams::Execute {
                command: "ls -la".into(),
                cwd: None,
                background: false,
                task_id: None,
            }
        );
        let update = map_tool_execution(
            "call_abc",
            "bash",
            &frames[1]["args"],
            AgentToolStatus::Running,
            frames[1].get("partialResult"),
            false,
        );
        let ToolMapOut::Tool(updated) = update else {
            panic!("expected tool");
        };
        assert_eq!(
            updated.result,
            Some(AgentToolResult::Execute {
                output: "total 48\n".into(),
                exit_code: None,
            })
        );
        let end = map_tool_execution(
            "call_abc",
            "bash",
            &serde_json::json!({"command":"ls -la"}),
            AgentToolStatus::Completed,
            frames[2].get("result"),
            false,
        );
        let ToolMapOut::Tool(completed) = end else {
            panic!("expected tool");
        };
        assert_eq!(
            completed.result,
            Some(AgentToolResult::Execute {
                output: "total 48\nREADME.md\n".into(),
                exit_code: None,
            })
        );
        let json = serde_json::to_value(&completed).unwrap();
        assert!(json.get("input").is_none());
        assert!(json.get("output").is_none());
        assert!(json.get("native").is_none());
    }

    #[test]
    fn unmapped_tool_is_other_once() {
        let out = map_tool_execution(
            "tc_x",
            "vendor_mystery",
            &serde_json::json!({"opaque": true}),
            AgentToolStatus::Completed,
            Some(&serde_json::json!({"n": 1})),
            false,
        );
        let ToolMapOut::Tool(tool) = out else {
            panic!("expected tool");
        };
        assert_eq!(tool.kind, AgentToolKind::Other);
        assert_eq!(
            tool.params,
            AgentToolParams::Other {
                value: serde_json::json!({"opaque": true}),
            }
        );
        assert_eq!(
            tool.result,
            Some(AgentToolResult::Other {
                value: serde_json::json!({"n": 1}),
            })
        );
    }

    #[test]
    fn grep_is_search_find_stays_search_even_with_url_query() {
        let grep = map_tool_execution(
            "g1",
            "grep",
            &serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            AgentToolStatus::Completed,
            Some(&serde_json::json!({"content":[{"type":"text","text":"hit"}]})),
            false,
        );
        let ToolMapOut::Tool(grep) = grep else {
            panic!("grep");
        };
        assert_eq!(grep.kind, AgentToolKind::Search);
        let find = map_tool_execution(
            "f1",
            "find",
            &serde_json::json!({"pattern": "https://example.com", "path": "."}),
            AgentToolStatus::Running,
            None,
            false,
        );
        let ToolMapOut::Tool(find) = find else {
            panic!("find");
        };
        assert_eq!(find.kind, AgentToolKind::Search);
        assert_ne!(find.kind, AgentToolKind::WebSearch);
    }

    #[test]
    fn grep_stdout_emits_search_hits() {
        let grep = map_tool_execution(
            "g1",
            "grep",
            &serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            AgentToolStatus::Completed,
            Some(&serde_json::json!({
                "content": [{
                    "type": "text",
                    "text": "crates/agent/src/lib.rs:12: pub struct AgentTool"
                }]
            })),
            false,
        );
        let ToolMapOut::Tool(grep) = grep else {
            panic!("grep");
        };
        assert_eq!(
            grep.result,
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
        let grep = map_tool_execution(
            "g1",
            "grep",
            &serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"}),
            AgentToolStatus::Completed,
            Some(&serde_json::json!({"content":[{"type":"text","text":""}]})),
            false,
        );
        let ToolMapOut::Tool(grep) = grep else {
            panic!("grep");
        };
        assert_eq!(grep.result, Some(AgentToolResult::Text { text: "".into() }));
    }

    #[test]
    fn web_search_result_is_never_search_hits() {
        let out = map_tool_execution(
            "w1",
            "web_search",
            &serde_json::json!({"query": "atmos acp"}),
            AgentToolStatus::Completed,
            Some(&serde_json::json!({
                "links": [{ "url": "https://example.com", "title": "Example" }]
            })),
            false,
        );
        let ToolMapOut::Tool(tool) = out else {
            panic!("web_search");
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

    #[test]
    fn write_tool_execution_maps_to_edit_without_permission_shape() {
        let frames = super::super::codec::parse_jsonl(include_str!("testdata/tool-write.jsonl"));
        let start = map_tool_execution(
            "call_write",
            "write",
            &frames[0]["args"],
            AgentToolStatus::Running,
            None,
            false,
        );
        let ToolMapOut::Tool(started) = start else {
            panic!("expected tool");
        };
        assert_eq!(started.kind, AgentToolKind::Edit);
        assert_eq!(
            started.params,
            AgentToolParams::Edit {
                path: "atmos-pi-write-probe.txt".into(),
            }
        );
        let end = map_tool_execution(
            "call_write",
            "write",
            &frames[0]["args"],
            AgentToolStatus::Completed,
            frames[1].get("result"),
            false,
        );
        let ToolMapOut::Tool(completed) = end else {
            panic!("expected tool");
        };
        assert_eq!(completed.status, AgentToolStatus::Completed);
        assert_eq!(
            completed.result,
            Some(AgentToolResult::Text {
                text: "Wrote atmos-pi-write-probe.txt".into(),
            })
        );
    }

    #[test]
    fn fetch_with_url_is_fetch() {
        let out = map_tool_execution(
            "w1",
            "fetch",
            &serde_json::json!({"url": "https://example.com/page"}),
            AgentToolStatus::Running,
            None,
            false,
        );
        let ToolMapOut::Tool(tool) = out else {
            panic!("fetch");
        };
        assert_eq!(tool.kind, AgentToolKind::Fetch);
    }
}
