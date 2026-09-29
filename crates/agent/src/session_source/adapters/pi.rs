use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentResult, AgentTool, AgentToolKind, AgentToolParams,
    AgentToolResult, AgentToolStatus, TextKind, UserMessageKind,
};
use crate::map::{
    classify_tool, extract_aspect_ratio, extract_background, extract_command, extract_cwd,
    extract_image_prompt, extract_image_size, extract_links, extract_path, extract_query,
    extract_reference_paths, extract_search_hits, extract_skill, extract_subagent,
    extract_subagent_prompt, extract_task_id, extract_url, plan_document_from_tool_input,
    plan_from_tool_input_or_stub, thinking_text, ClassifiedTool,
};
use crate::session_source::paths;
use crate::session_source::{
    finished_text_part, HostId, HostSessionRef, SessionSource, TuiResumePlan,
};

pub struct PiSource;

impl SessionSource for PiSource {
    fn provider_id(&self) -> &'static str {
        HostId::Pi.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::pi_data_roots()
    }

    fn list(&self) -> Vec<HostSessionRef> {
        list_in(&self.data_roots())
    }

    fn parse(&self, native_id: &str) -> AgentResult<Vec<AgentEventEnvelope>> {
        Ok(parse_in(&self.data_roots(), native_id))
    }

    fn parse_at(
        &self,
        native_id: &str,
        source_path: Option<&Path>,
    ) -> AgentResult<Vec<AgentEventEnvelope>> {
        match source_path {
            Some(path) if path.is_file() => Ok(parse_file(path, native_id)),
            _ => self.parse(native_id),
        }
    }

    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan> {
        Some(HostId::Pi.tui_resume(native_id, cwd))
    }
}

fn list_in(roots: &[PathBuf]) -> Vec<HostSessionRef> {
    let mut sessions = Vec::new();
    for root in roots {
        for_each_session_file(root, |path| {
            if let Some(session) = list_file(path) {
                sessions.push(session);
            }
        });
    }
    sessions.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then(a.native_id.cmp(&b.native_id))
    });
    sessions
}

fn parse_in(roots: &[PathBuf], native_id: &str) -> Vec<AgentEventEnvelope> {
    if native_id.is_empty() {
        return Vec::new();
    }
    for root in roots {
        let mut found = None;
        for_each_session_file(root, |path| {
            if found.is_none() && native_id_from_path(path).as_deref() == Some(native_id) {
                found = Some(path.to_path_buf());
            }
        });
        if let Some(path) = found {
            return parse_file(&path, native_id);
        }
    }
    Vec::new()
}

fn for_each_session_file(root: &Path, mut visit: impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_jsonl(&path) {
            visit(&path);
            continue;
        }
        if !path.is_dir() || path.is_symlink() {
            continue;
        }
        let Ok(files) = fs::read_dir(&path) else {
            continue;
        };
        for file in files.flatten() {
            let file_path = file.path();
            if file_path.is_file() && is_jsonl(&file_path) {
                visit(&file_path);
            }
        }
    }
}

fn is_jsonl(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
}

fn native_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    Some(
        stem.rsplit_once('_')
            .map(|(_, id)| id)
            .unwrap_or(stem)
            .to_string(),
    )
}

fn list_file(path: &Path) -> Option<HostSessionRef> {
    let native_id = native_id_from_path(path).filter(|id| !id.is_empty())?;
    let mtime = datetime_from_mtime(path);
    let headers = read_header_values(path, 12);
    let session = headers
        .iter()
        .find(|value| value.get("type").and_then(Value::as_str) == Some("session"));
    let cwd = session
        .and_then(|value| value.get("cwd").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let started_at = session
        .and_then(|value| value.get("timestamp"))
        .and_then(parse_pi_time)
        .or_else(|| {
            headers
                .first()
                .and_then(|value| value.get("timestamp"))
                .and_then(parse_pi_time)
        })
        .unwrap_or(mtime);
    let model = headers.iter().find_map(|value| {
        if value.get("type").and_then(Value::as_str) == Some("model_change") {
            value
                .get("modelId")
                .or_else(|| value.get("model_id"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        } else {
            None
        }
    });
    let parent_native_id = session.and_then(parent_native_from_session);
    let project_name = project_name_of(&cwd);
    let title = if project_name.is_empty() {
        native_id.clone()
    } else {
        project_name.clone()
    };
    Some(HostSessionRef {
        key: HostSessionRef::key_for(HostId::Pi.as_str(), &native_id),
        provider_id: HostId::Pi.as_str().to_string(),
        native_id,
        title,
        cwd,
        project_name,
        started_at,
        updated_at: mtime.max(started_at),
        message_count: None,
        byte_size: None,
        model,
        source_path: path.to_string_lossy().into_owned(),
        parent_native_id,
    })
}

fn parse_file(path: &Path, native_id: &str) -> Vec<AgentEventEnvelope> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    let mut pending_tools: HashMap<String, PendingTool> = HashMap::new();
    let reader = BufReader::new(file);
    for line in reader.lines() {
        let Ok(line) = line else {
            continue;
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let from = events.len();
        let ts = value.get("timestamp").and_then(parse_pi_time).or_else(|| {
            value
                .get("message")
                .and_then(|message| message.get("timestamp"))
                .and_then(parse_pi_time)
        });
        map_line(&mut events, &mut pending_tools, native_id, value);
        crate::session_source::stamp_new_envelopes(&mut events, from, ts);
    }
    for pending in pending_tools.into_values() {
        push_tool(
            &mut events,
            pending.turn_id,
            &pending.call_id,
            &pending.name,
            None,
            &pending.input,
            None,
            "running",
        );
    }
    events
}

struct PendingTool {
    turn_id: Option<String>,
    call_id: String,
    name: String,
    input: Value,
}

fn map_line(
    events: &mut Vec<AgentEventEnvelope>,
    pending_tools: &mut HashMap<String, PendingTool>,
    native_id: &str,
    value: Value,
) {
    let ty = value.get("type").and_then(Value::as_str).unwrap_or("");
    match ty {
        "session" => {
            events.push(wrap(
                None,
                AgentEvent::SessionStarted {
                    persistence_handle: Some(native_id.to_string()),
                },
            ));
        }
        "model_change" | "thinking_level_change" => {
            let config = config_from_pi_event(&value);
            if config.as_object().is_some_and(|object| !object.is_empty()) {
                events.push(wrap(None, AgentEvent::ConfigChanged { config }));
            }
        }
        "message" => map_message(events, pending_tools, value),
        "" => {}
        other => events.push(wrap(
            None,
            AgentEvent::Unknown {
                event_type: other.to_string(),
                payload: value,
            },
        )),
    }
}

fn map_message(
    events: &mut Vec<AgentEventEnvelope>,
    pending_tools: &mut HashMap<String, PendingTool>,
    value: Value,
) {
    let line_id = value
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let message = value.get("message").cloned().unwrap_or(value);
    let role = message
        .get("role")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase()
        .replace('_', "");
    let turn_id = if line_id.is_empty() {
        None
    } else {
        Some(line_id.clone())
    };
    match role.as_str() {
        "user" => {
            let text = content_text(message.get("content"));
            if text.is_empty() {
                return;
            }
            events.push(wrap(
                turn_id.clone(),
                AgentEvent::UserMessage {
                    turn_id: line_id.clone(),
                    message_id: line_id,
                    kind: UserMessageKind::Normal,
                    text,
                    attachments: Vec::new(),
                },
            ));
        }
        "assistant" => map_assistant(events, pending_tools, turn_id, &line_id, &message),
        "toolresult" => map_tool_result(events, pending_tools, turn_id, &message),
        _ => {}
    }
}

fn map_assistant(
    events: &mut Vec<AgentEventEnvelope>,
    pending_tools: &mut HashMap<String, PendingTool>,
    turn_id: Option<String>,
    message_id: &str,
    message: &Value,
) {
    let Some(content) = message.get("content").and_then(Value::as_array) else {
        if let Some(text) = message.get("content").and_then(Value::as_str) {
            if !text.is_empty() {
                push_assistant_text(events, turn_id, message_id, text);
                return;
            }
        }
        push_error_message(events, turn_id, message_id, message);
        return;
    };
    let mut saw_text = false;
    // A message can hold several text and thinking blocks, so the block's position
    // in the message is what keeps their parts apart.
    for (index, block) in content.iter().enumerate() {
        let index = index as u32;
        let ty = normalize_type(block.get("type").and_then(Value::as_str).unwrap_or(""));
        match ty.as_str() {
            "text" => {
                let text = block.get("text").and_then(Value::as_str).unwrap_or("");
                if !text.is_empty() {
                    saw_text = true;
                    push_text_part(
                        events,
                        turn_id.clone(),
                        message_id,
                        index,
                        TextKind::Answer,
                        text,
                    );
                }
            }
            "thinking" | "reasoning" => {
                let text = block
                    .get("thinking")
                    .or_else(|| block.get("text"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if text.is_empty() {
                    continue;
                }
                push_text_part(
                    events,
                    turn_id.clone(),
                    message_id,
                    index,
                    TextKind::Thinking,
                    text,
                );
            }
            "toolcall" => {
                let call_id = block
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("tool")
                    .to_string();
                let name = block
                    .get("name")
                    .or_else(|| block.get("toolName"))
                    .and_then(Value::as_str)
                    .unwrap_or("tool")
                    .to_string();
                let input = block
                    .get("arguments")
                    .or_else(|| block.get("args"))
                    .cloned()
                    .map(parse_args)
                    .unwrap_or(Value::Null);
                pending_tools.insert(
                    call_id.clone(),
                    PendingTool {
                        turn_id: turn_id.clone(),
                        call_id,
                        name,
                        input,
                    },
                );
            }
            _ => {}
        }
    }
    if !saw_text {
        push_error_message(events, turn_id, message_id, message);
    }
}

fn map_tool_result(
    events: &mut Vec<AgentEventEnvelope>,
    pending_tools: &mut HashMap<String, PendingTool>,
    turn_id: Option<String>,
    message: &Value,
) {
    let call_id = message
        .get("toolCallId")
        .or_else(|| message.get("tool_call_id"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let name = message
        .get("toolName")
        .or_else(|| message.get("tool_name"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let is_error = message
        .get("isError")
        .or_else(|| message.get("is_error"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let output = message
        .get("content")
        .filter(|value| !is_empty_tool_content(value))
        .cloned()
        .or_else(|| {
            message
                .get("details")
                .and_then(|details| details.get("patch"))
                .cloned()
        })
        .or_else(|| message.get("details").cloned());
    let pending = pending_tools.remove(&call_id);
    let (name, input, turn_id) = match pending {
        Some(pending) => (pending.name, pending.input, pending.turn_id.or(turn_id)),
        None => (name, Value::Null, turn_id),
    };
    let status = if is_error { "error" } else { "completed" };
    push_tool(
        events,
        turn_id,
        &call_id,
        &name,
        None,
        &input,
        output.as_ref(),
        status,
    );
}

fn push_assistant_text(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    message_id: &str,
    text: &str,
) {
    push_text_part(events, turn_id, message_id, 0, TextKind::Answer, text);
}

fn push_text_part(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    message_id: &str,
    index: u32,
    kind: TextKind,
    text: &str,
) {
    for payload in finished_text_part(message_id, index, kind, text, None) {
        events.push(wrap(turn_id.clone(), payload));
    }
}

#[allow(clippy::too_many_arguments)]
fn push_tool(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    call_id: &str,
    name: &str,
    title: Option<&str>,
    input: &Value,
    output: Option<&Value>,
    status_raw: &str,
) {
    match classify_tool(name, title, Some(input)) {
        ClassifiedTool::Hide => {}
        ClassifiedTool::Thinking => {
            let text = thinking_text(title, Some(input), output);
            if text.is_empty() {
                return;
            }
            // One folded Think tool is one part, addressed by its call id.
            push_text_part(events, turn_id, call_id, 0, TextKind::Thinking, &text);
        }
        ClassifiedTool::Plan => {
            events.push(wrap(
                turn_id,
                AgentEvent::PlanUpdated {
                    plan: plan_from_tool_input_or_stub(name, title, Some(input)),
                },
            ));
        }
        ClassifiedTool::PlanDocument => {
            let params = plan_document_from_tool_input(Some(input)).unwrap_or(
                AgentToolParams::PlanDocument {
                    name: None,
                    overview: None,
                    plan: String::new(),
                    todos: Vec::new(),
                    is_project: None,
                    phases: None,
                },
            );
            let status = tool_status(status_raw);
            events.push(wrap(
                turn_id,
                tool_payload(
                    status,
                    AgentTool {
                        tool_call_id: call_id.to_string(),
                        parent_tool_call_id: None,
                        name: name.to_string(),
                        title: None,
                        kind: AgentToolKind::PlanDocument,
                        status,
                        params,
                        result: None,
                    },
                ),
            ));
        }
        ClassifiedTool::Call(kind) => {
            let status = tool_status(status_raw);
            let failed = status == AgentToolStatus::Failed;
            let mut params = typed_params(kind, input);
            if let AgentToolParams::Subagent { task_id, .. } = &mut params {
                if task_id.is_none() {
                    *task_id = output
                        .and_then(extract_task_id)
                        .or_else(|| extract_task_id(input));
                }
            }
            let kind = match &params {
                AgentToolParams::Other { .. } => AgentToolKind::Other,
                _ => kind,
            };
            let result = tool_result(kind, input, output, status, failed);
            events.push(wrap(
                turn_id,
                tool_payload(
                    status,
                    AgentTool {
                        tool_call_id: call_id.to_string(),
                        parent_tool_call_id: None,
                        name: name.to_string(),
                        title: title.map(str::to_string),
                        kind,
                        status,
                        params,
                        result,
                    },
                ),
            ));
        }
    }
}

fn tool_status(status_raw: &str) -> AgentToolStatus {
    match status_raw {
        "completed" => AgentToolStatus::Completed,
        "error" | "failed" => AgentToolStatus::Failed,
        "running" => AgentToolStatus::Running,
        _ => AgentToolStatus::Pending,
    }
}

fn tool_payload(status: AgentToolStatus, tool_call: AgentTool) -> AgentEvent {
    match status {
        AgentToolStatus::Completed => AgentEvent::ToolCallCompleted { tool_call },
        AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
            tool_call,
            error: None,
        },
        AgentToolStatus::Pending | AgentToolStatus::Running => {
            AgentEvent::ToolCallStarted { tool_call }
        }
    }
}

fn typed_params(kind: AgentToolKind, input: &Value) -> AgentToolParams {
    let other = || AgentToolParams::Other {
        value: input.clone(),
    };
    match kind {
        AgentToolKind::Read => extract_path(input)
            .map(|path| AgentToolParams::Read {
                path,
                offset: json_i64(input, &["offset", "start_line"]),
                limit: json_i64(input, &["limit", "count", "num_lines"]),
            })
            .unwrap_or_else(other),
        AgentToolKind::Edit => extract_path(input)
            .map(|path| AgentToolParams::Edit { path })
            .unwrap_or_else(other),
        AgentToolKind::Delete => extract_path(input)
            .map(|path| AgentToolParams::Delete { path })
            .unwrap_or_else(other),
        AgentToolKind::Move => {
            match (
                json_string(input, &["from", "source", "old_path"]).or_else(|| extract_path(input)),
                json_string(input, &["to", "destination", "new_path"]),
            ) {
                (Some(from), Some(to)) => AgentToolParams::Move { from, to },
                _ => other(),
            }
        }
        AgentToolKind::Search => extract_query(input)
            .or_else(|| extract_path(input))
            .map(|query| AgentToolParams::Search {
                path: extract_path(input),
                glob: json_string(input, &["glob"])
                    .filter(|glob| extract_query(input).as_ref() != Some(glob)),
                query,
            })
            .unwrap_or_else(other),
        AgentToolKind::WebSearch => extract_query(input)
            .map(|query| AgentToolParams::WebSearch { query })
            .unwrap_or_else(other),
        AgentToolKind::Execute => extract_command(input)
            .map(|command| AgentToolParams::Execute {
                command,
                cwd: extract_cwd(input),
                background: extract_background(input),
                task_id: None,
            })
            .unwrap_or_else(other),
        AgentToolKind::Fetch => extract_url(input)
            .map(|url| AgentToolParams::Fetch { url })
            .unwrap_or_else(other),
        AgentToolKind::Skill => extract_skill(input)
            .map(|skill| AgentToolParams::Skill { skill })
            .unwrap_or_else(other),
        AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(input).unwrap_or_else(|| {
                (
                    json_string(input, &["description", "prompt", "task"]).unwrap_or_default(),
                    json_string(input, &["subagent_type", "agent_type", "agent"]),
                )
            });
            if description.is_empty() {
                return other();
            }
            AgentToolParams::Subagent {
                prompt: extract_subagent_prompt(input, &description),
                description,
                agent_type,
                task_id: extract_task_id(input),
            }
        }
        AgentToolKind::McpList => AgentToolParams::McpList {
            server: json_string(input, &["server", "serverName"]),
        },
        AgentToolKind::McpCall => AgentToolParams::McpCall {
            server: json_string(input, &["server", "serverName"]),
            tool: json_string(input, &["tool", "toolName", "name"]),
        },
        AgentToolKind::ImageGen => AgentToolParams::ImageGen {
            prompt: extract_image_prompt(input).unwrap_or_default(),
            aspect_ratio: extract_aspect_ratio(input),
            size: extract_image_size(input),
            path: json_string(
                input,
                &["filename", "path", "file", "file_path", "output_path"],
            ),
            reference_paths: extract_reference_paths(input),
        },
        AgentToolKind::PlanDocument => {
            plan_document_from_tool_input(Some(input)).unwrap_or_else(|| {
                AgentToolParams::PlanDocument {
                    name: None,
                    overview: None,
                    plan: String::new(),
                    todos: Vec::new(),
                    is_project: None,
                    phases: None,
                }
            })
        }
        AgentToolKind::Other => other(),
    }
}

fn tool_result(
    kind: AgentToolKind,
    input: &Value,
    output: Option<&Value>,
    status: AgentToolStatus,
    failed: bool,
) -> Option<AgentToolResult> {
    if matches!(status, AgentToolStatus::Pending | AgentToolStatus::Running) && output.is_none() {
        return None;
    }
    if failed || status == AgentToolStatus::Failed {
        let message = value_text(output);
        return Some(AgentToolResult::Error {
            message: if message.is_empty() {
                "tool failed".into()
            } else {
                message
            },
        });
    }
    let output = output?;
    Some(match kind {
        AgentToolKind::Execute => AgentToolResult::Execute {
            output: value_text(Some(output)),
            exit_code: json_i64(output, &["exit", "exit_code", "exitCode"])
                .or_else(|| {
                    output
                        .get("details")
                        .and_then(|details| json_i64(details, &["exitCode", "exit_code"]))
                })
                .map(|n| n as i32),
        },
        AgentToolKind::WebSearch => {
            let query = extract_query(input).unwrap_or_default();
            let links = extract_links(output);
            if links.is_empty() {
                AgentToolResult::Text {
                    text: value_text(Some(output)),
                }
            } else {
                AgentToolResult::WebSearch { query, links }
            }
        }
        AgentToolKind::Fetch => {
            let url = extract_url(input)
                .or_else(|| extract_url(output))
                .unwrap_or_default();
            AgentToolResult::WebFetch {
                url,
                title: json_string(output, &["title"]),
                markdown: json_string(output, &["markdown", "md"]),
                text: Some(value_text(Some(output))).filter(|text| !text.is_empty()),
            }
        }
        AgentToolKind::Read => {
            let path = extract_path(input).unwrap_or_default();
            let text = value_text(Some(output));
            if path.is_empty() {
                AgentToolResult::Text { text }
            } else {
                AgentToolResult::FileContent { path, text }
            }
        }
        AgentToolKind::Search => {
            let query = extract_query(input).unwrap_or_default();
            let hits = extract_search_hits(output);
            if hits.is_empty() {
                AgentToolResult::Text {
                    text: value_text(Some(output)),
                }
            } else {
                AgentToolResult::SearchHits { query, hits }
            }
        }
        AgentToolKind::Other => match output {
            Value::String(text) => AgentToolResult::Text { text: text.clone() },
            other => AgentToolResult::Other {
                value: other.clone(),
            },
        },
        _ => AgentToolResult::Text {
            text: value_text(Some(output)),
        },
    })
}

fn read_header_values(path: &Path, max_lines: usize) -> Vec<Value> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut values = Vec::new();
    for line in BufReader::new(file).lines().take(max_lines) {
        let Ok(line) = line else {
            continue;
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            values.push(value);
        }
    }
    values
}

fn parent_native_from_session(value: &Value) -> Option<String> {
    let raw = value
        .get("parentSession")
        .or_else(|| value.get("parent_session"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())?;
    if raw.contains('/') || raw.contains('\\') {
        native_id_from_path(Path::new(raw))
    } else {
        Some(raw.to_string())
    }
}

fn is_empty_tool_content(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(text) => text.trim().is_empty(),
        Value::Array(items) => items.is_empty(),
        Value::Object(map) => map.is_empty(),
        _ => false,
    }
}

fn push_error_message(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    message_id: &str,
    message: &Value,
) {
    let Some(text) = message
        .get("errorMessage")
        .or_else(|| message.get("error_message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    else {
        return;
    };
    push_assistant_text(events, turn_id, message_id, text);
}

fn parse_args(value: Value) -> Value {
    match value {
        Value::String(text) => serde_json::from_str(&text).unwrap_or(Value::String(text)),
        other => other,
    }
}

fn content_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter(|item| {
                normalize_type(item.get("type").and_then(Value::as_str).unwrap_or("")) == "text"
            })
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect(),
        _ => String::new(),
    }
}

fn normalize_type(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace('_', "")
}

fn parse_pi_time(value: &Value) -> Option<DateTime<Utc>> {
    if let Some(text) = value.as_str() {
        return DateTime::parse_from_rfc3339(text)
            .ok()
            .map(|dt| dt.with_timezone(&Utc));
    }
    if let Some(ms) = value.as_i64() {
        return DateTime::<Utc>::from_timestamp_millis(ms)
            .or_else(|| DateTime::<Utc>::from_timestamp(ms, 0));
    }
    None
}

fn datetime_from_mtime(path: &Path) -> DateTime<Utc> {
    path.metadata()
        .and_then(|meta| meta.modified())
        .ok()
        .map(DateTime::<Utc>::from)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
}

fn project_name_of(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
        .to_string()
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn config_from_pi_event(value: &Value) -> Value {
    let mut config = serde_json::Map::new();
    let model_id = value
        .get("modelId")
        .or_else(|| value.get("model_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty());
    if let Some(model_id) = model_id {
        let provider = value
            .get("provider")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty());
        let model = match provider {
            Some(provider) if !model_id.contains('/') => format!("{provider}/{model_id}"),
            _ => model_id.to_string(),
        };
        config.insert("model".into(), Value::String(model));
    }
    if let Some(thinking) = value
        .get("thinkingLevel")
        .or_else(|| value.get("thinking_level"))
        .or_else(|| value.get("level"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        config.insert("thinking".into(), Value::String(thinking.to_string()));
    }
    Value::Object(config)
}

fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
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

fn json_i64(value: &Value, keys: &[&str]) -> Option<i64> {
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

fn value_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    item.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect(),
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
    use std::fs;

    const BASIC: &str = include_str!("../testdata/pi/basic.jsonl");
    const NATIVE_ID: &str = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const FILENAME: &str = "2026-01-02T03-04-05-000Z_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl";

    #[test]
    fn unit_struct_and_missing_paths() {
        assert_eq!(std::mem::size_of::<PiSource>(), 0);
        assert_eq!(PiSource.provider_id(), "pi");
        let missing = PathBuf::from("/no/such/pi-sessions");
        assert!(list_in(std::slice::from_ref(&missing)).is_empty());
        assert!(parse_in(&[missing], "missing").is_empty());
        assert!(PiSource.parse("missing").unwrap().is_empty());
    }

    #[test]
    fn list_reads_first_line_only_and_uses_uuid_suffix() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_session(tmp.path(), BASIC);
        let mut huge = BASIC.to_string();
        huge.push_str("\n{\"type\":\"message\",\"id\":\"later\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"SECRET_SHOULD_NOT_BE_TITLE\"}]}}\n");
        huge.push_str(&"x".repeat(64 * 1024));
        huge.push('\n');
        fs::write(&path, huge).unwrap();

        let listed = list_in(&[tmp.path().to_path_buf()]);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].native_id, NATIVE_ID);
        assert_eq!(listed[0].key, format!("pi:{NATIVE_ID}"));
        assert_eq!(listed[0].cwd, "/tmp/fixture-proj");
        assert_eq!(listed[0].project_name, "fixture-proj");
        assert_eq!(listed[0].title, "fixture-proj");
        assert_eq!(
            listed[0].started_at,
            DateTime::parse_from_rfc3339("2026-01-02T03:04:05.000Z")
                .unwrap()
                .with_timezone(&Utc)
        );
        assert_eq!(listed[0].message_count, None);
        assert_eq!(listed[0].model.as_deref(), Some("claude"));
        assert_eq!(
            listed[0].parent_native_id.as_deref(),
            Some("parent-session-id")
        );
        assert!(!listed[0].title.contains("SECRET"));
    }

    #[test]
    fn parse_maps_messages_skips_chrome_and_unknown_does_not_err() {
        let tmp = tempfile::tempdir().unwrap();
        write_session(tmp.path(), BASIC);
        let events = parse_in(&[tmp.path().to_path_buf()], NATIVE_ID);
        assert!(matches!(
            events[0].payload,
            AgentEvent::SessionStarted {
                persistence_handle: Some(ref id)
            } if id == NATIVE_ID
        ));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::UserMessage { ref text, .. } if text == "List the files"
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::TextChunk { kind: TextKind::Thinking, ref text, .. }
                if text.contains("list the directory")
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::TextChunk { kind: TextKind::Answer, ref text, offset: 0, .. }
                if text == "Running ls."
        )));
        let tool = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallCompleted { tool_call } => Some(tool_call),
            _ => None,
        });
        let tool = tool.expect("tool completed");
        assert_eq!(tool.name, "bash");
        assert_eq!(tool.kind, AgentToolKind::Execute);
        assert_eq!(
            tool.params,
            AgentToolParams::Execute {
                command: "ls".into(),
                cwd: None,
                background: false,
                task_id: None,
            }
        );
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::ConfigChanged { ref config }
                if config.get("thinking").and_then(|item| item.as_str()) == Some("medium")
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::ConfigChanged { ref config }
                if config.get("model").and_then(|item| item.as_str()) == Some("anthropic/claude")
        )));
        assert!(!events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::Unknown { ref event_type, .. }
                if event_type == "model_change" || event_type == "thinking_level_change"
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::Unknown { ref event_type, .. } if event_type == "weird_vendor"
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::ToolCallCompleted { ref tool_call }
                if tool_call.tool_call_id == "call_edit"
                    && tool_call.kind == AgentToolKind::Edit
                    && matches!(&tool_call.result, Some(AgentToolResult::Text { text }) if text.contains("Update File: README.md"))
        )));
        assert!(events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::TextChunk { kind: TextKind::Answer, ref text, .. }
                if text == "Model failed"
        )));
        assert!(parse_in(&[tmp.path().to_path_buf()], "missing").is_empty());
    }

    fn write_session(root: &Path, body: &str) -> PathBuf {
        let dir = root.join("--tmp-fixture-proj--");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(FILENAME);
        fs::write(&path, body).unwrap();
        path
    }
}
