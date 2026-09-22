use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentPermissionOption, AgentPermissionRequest, AgentResult,
    AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus, TextKind,
    UserMessageKind,
};
use crate::map::extract::{first_string, labeled_id_from_text};
use crate::map::subagent::is_subagent_dispatch_ack;
use crate::map::{
    ask_questions_from_input, classify_tool, extract_aspect_ratio, extract_background,
    extract_command, extract_cwd, extract_image_prompt, extract_image_size, extract_path,
    extract_query, extract_reference_paths, extract_skill, extract_subagent,
    extract_subagent_prompt, extract_task_id, extract_url, human_execute_title, is_ask_user_tool,
    is_exit_plan_tool, mcp_ref_from_name, plan_document_from_tool_input,
    plan_from_tool_input_or_stub, plan_markdown_from_input, thinking_text, ClassifiedTool,
};
use crate::session_source::paths;
use crate::session_source::{
    finished_text_part, HostId, HostSessionRef, SessionSource, TuiResumePlan,
};

const LIST_PEEK_BYTES: usize = 8192;
const SKIP_TYPES: &[&str] = &[
    "queue-operation",
    "mode",
    "last-prompt",
    "permission-mode",
    "file-history-snapshot",
    "file-history-delta",
    "pr-link",
    "frame-link",
    "attachment",
    "summary",
    "atis-latch",
    "bridge-session",
    "cost-state",
    "agent-setting",
];

pub struct ClaudeSource;

impl SessionSource for ClaudeSource {
    fn provider_id(&self) -> &'static str {
        HostId::Claude.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::claude_data_roots()
    }

    fn list(&self) -> Vec<HostSessionRef> {
        list_in(&self.data_roots())
    }

    fn parse(&self, native_id: &str) -> AgentResult<Vec<AgentEventEnvelope>> {
        parse_in(&self.data_roots(), native_id)
    }

    fn parse_at(
        &self,
        native_id: &str,
        source_path: Option<&Path>,
    ) -> AgentResult<Vec<AgentEventEnvelope>> {
        match source_path {
            Some(path) if path.is_file() => parse_file(path),
            _ => self.parse(native_id),
        }
    }

    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan> {
        Some(HostId::Claude.tui_resume(native_id, cwd))
    }
}

fn list_in<P: AsRef<Path>>(roots: &[P]) -> Vec<HostSessionRef> {
    let mut out = Vec::new();
    for root in roots {
        let Ok(projects) = fs::read_dir(root.as_ref()) else {
            continue;
        };
        for project in projects.flatten() {
            let Ok(file_type) = project.file_type() else {
                continue;
            };
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }
            let project_path = project.path();
            let encoded = project_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            let decoded_cwd = encoded.replace('-', "/");
            let Ok(files) = fs::read_dir(&project_path) else {
                continue;
            };
            for file in files.flatten() {
                let path = file.path();
                if is_jsonl_file(&path) {
                    if let Some(row) = list_row(&path, &decoded_cwd, None) {
                        out.push(row);
                    }
                    continue;
                }
                let Ok(file_type) = file.file_type() else {
                    continue;
                };
                if file_type.is_symlink() || !file_type.is_dir() {
                    continue;
                }
                let parent_id = file.file_name().to_str().unwrap_or("").to_string();
                if parent_id.is_empty() {
                    continue;
                }
                let Ok(children) = fs::read_dir(file.path().join("subagents")) else {
                    continue;
                };
                for child in children.flatten() {
                    let child_path = child.path();
                    if !is_jsonl_file(&child_path) {
                        continue;
                    }
                    if let Some(row) = list_row(&child_path, &decoded_cwd, Some(parent_id.clone()))
                    {
                        out.push(row);
                    }
                }
            }
        }
    }
    out
}

fn parse_in<P: AsRef<Path>>(roots: &[P], native_id: &str) -> AgentResult<Vec<AgentEventEnvelope>> {
    match find_parent_file(roots, native_id) {
        Some(path) => parse_file(&path),
        None => Ok(Vec::new()),
    }
}

fn parse_file(path: &Path) -> AgentResult<Vec<AgentEventEnvelope>> {
    let mut state = ParseState::default();
    ingest_jsonl(&mut state, path);
    ingest_child_sessions(&mut state, path);
    complete_open_tools(&mut state);
    Ok(state.events)
}

fn ingest_jsonl(state: &mut ParseState, path: &Path) {
    let Ok(file) = File::open(path) else {
        return;
    };
    for line in BufReader::new(file).lines() {
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
        ingest_line(state, &value);
    }
}

fn ingest_child_sessions(state: &mut ParseState, parent_path: &Path) {
    let Some(stem) = parent_path.file_stem().and_then(|name| name.to_str()) else {
        return;
    };
    let Some(parent_dir) = parent_path.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(parent_dir.join(stem).join("subagents")) else {
        return;
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_jsonl_file(path))
        .collect();
    files.sort();
    let mut used = HashSet::new();
    for path in files {
        let Some(agent_id) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(parent_id) = child_parent_tool_id(state, agent_id, &used) else {
            continue;
        };
        used.insert(parent_id.clone());
        let previous = state.forced_parent.replace(parent_id);
        ingest_jsonl(state, &path);
        state.forced_parent = previous;
    }
}

fn child_parent_tool_id(
    state: &ParseState,
    agent_id: &str,
    used: &HashSet<String>,
) -> Option<String> {
    let stripped = agent_id.strip_prefix("agent-").unwrap_or(agent_id);
    for id in [agent_id, stripped] {
        if let Some(parent) = state.agent_ids.get(id) {
            if !used.contains(parent) {
                return Some(parent.clone());
            }
        }
        if state.tools.contains_key(id) && !used.contains(id) {
            return Some(id.to_string());
        }
    }
    let mut unmatched = Vec::new();
    for event in &state.events {
        let Some(tool) = event_tool(event) else {
            continue;
        };
        if tool.kind != AgentToolKind::Subagent || used.contains(&tool.tool_call_id) {
            continue;
        }
        unmatched.push(tool.tool_call_id.clone());
    }
    unmatched.sort();
    unmatched.dedup();
    (unmatched.len() == 1).then(|| unmatched[0].clone())
}

fn event_tool(event: &AgentEventEnvelope) -> Option<&AgentTool> {
    match &event.payload {
        AgentEvent::ToolCallStarted { tool_call }
        | AgentEvent::ToolCallUpdated { tool_call }
        | AgentEvent::ToolCallCompleted { tool_call }
        | AgentEvent::ToolCallFailed { tool_call, .. } => Some(tool_call),
        _ => None,
    }
}

fn find_parent_file<P: AsRef<Path>>(roots: &[P], native_id: &str) -> Option<PathBuf> {
    let filename = format!("{native_id}.jsonl");
    for root in roots {
        let Ok(projects) = fs::read_dir(root.as_ref()) else {
            continue;
        };
        for project in projects.flatten() {
            let path = project.path();
            if !path.is_dir() {
                continue;
            }
            let candidate = path.join(&filename);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn is_jsonl_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
}

fn list_row(
    path: &Path,
    decoded_cwd: &str,
    parent_native_id: Option<String>,
) -> Option<HostSessionRef> {
    let native_id = path.file_stem()?.to_str()?.to_string();
    if native_id.is_empty() {
        return None;
    }
    let mtime = file_mtime_utc(path);
    let peek = peek_meta(path);
    let cwd = peek
        .cwd
        .filter(|cwd| !cwd.is_empty())
        .unwrap_or_else(|| decoded_cwd.to_string());
    let title = peek
        .title
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| native_id.clone());
    let started_at = peek.started_at.unwrap_or(mtime);
    Some(HostSessionRef {
        key: HostSessionRef::key_for(HostId::Claude.as_str(), &native_id),
        provider_id: HostId::Claude.as_str().to_string(),
        native_id,
        title,
        project_name: project_name(&cwd),
        cwd,
        started_at,
        updated_at: mtime,
        message_count: None,
        byte_size: None,
        model: peek.model,
        source_path: path.to_string_lossy().into_owned(),
        parent_native_id,
    })
}

struct PeekMeta {
    title: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    started_at: Option<DateTime<Utc>>,
}

fn peek_meta(path: &Path) -> PeekMeta {
    let prefix = peek_bytes(path, LIST_PEEK_BYTES);
    let truncated = prefix.len() == LIST_PEEK_BYTES;
    let mut title = None;
    let mut cwd = None;
    let mut model = None;
    let mut started_at: Option<DateTime<Utc>> = None;
    for line in complete_lines(&prefix, truncated) {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if cwd.is_none() {
            cwd = string_field(&value, "cwd");
        }
        if let Some(ts) = line_timestamp(&value) {
            started_at = Some(match started_at {
                Some(prev) => prev.min(ts),
                None => ts,
            });
        }
        match line_type(&value) {
            Some("custom-title") => {
                if title.is_none() {
                    title = string_field(&value, "customTitle")
                        .or_else(|| string_field(&value, "title"));
                }
            }
            Some("summary") => {
                if title.is_none() {
                    title =
                        string_field(&value, "summary").or_else(|| string_field(&value, "title"));
                }
            }
            Some("user") if title.is_none() && !is_meta(&value) => {
                let text = user_text(value.get("message").unwrap_or(&Value::Null));
                if !text.is_empty()
                    && !is_task_notification_text(&text)
                    && !is_local_command_caveat(&text)
                {
                    title = Some(preview_title(&text));
                }
            }
            Some("assistant") if model.is_none() => {
                model = value
                    .get("message")
                    .and_then(|message| string_field(message, "model"))
                    .or_else(|| string_field(&value, "model"));
            }
            _ => {}
        }
    }
    PeekMeta {
        title,
        cwd,
        model,
        started_at,
    }
}

#[derive(Default)]
struct ParseState {
    turn_id: Option<String>,
    tools: HashMap<String, AgentTool>,
    events: Vec<AgentEventEnvelope>,
    /// Claude async Task/Agent id (`agentId` / `<task-id>`) → parent `tool_use` id.
    agent_ids: HashMap<String, String>,
    forced_parent: Option<String>,
    pending_asks: HashSet<String>,
}

fn ingest_line(state: &mut ParseState, value: &Value) {
    let from = state.events.len();
    let Some(kind) = line_type(value) else {
        return;
    };
    if SKIP_TYPES.contains(&kind) {
        return;
    }
    match kind {
        "user" => ingest_user(state, value),
        "assistant" => ingest_assistant(state, value),
        "custom-title" => {
            if let Some(title) = string_field(value, "customTitle")
                .or_else(|| string_field(value, "title"))
                .filter(|title| !title.is_empty())
            {
                state.events.push(wrap(
                    state.turn_id.clone(),
                    AgentEvent::SessionTitleUpdated { title },
                ));
            }
        }
        "system" => {}
        _ => state.events.push(wrap(
            state.turn_id.clone(),
            AgentEvent::Unknown {
                event_type: kind.to_string(),
                payload: value.clone(),
            },
        )),
    }
    crate::session_source::stamp_new_envelopes(&mut state.events, from, line_timestamp(value));
}

fn ingest_user(state: &mut ParseState, value: &Value) {
    if is_meta(value) {
        return;
    }
    let message = value.get("message").unwrap_or(&Value::Null);
    let content = message.get("content").unwrap_or(&Value::Null);
    complete_tool_results(state, content);
    if let Some(result) = value.get("toolUseResult") {
        bind_agent_id_from_result(state, result);
    }
    let text = user_text(message);
    if is_task_notification_text(&text) {
        ingest_task_notification(state, &text);
    }
    if text.is_empty() || state.forced_parent.is_some() || is_local_command_caveat(&text) {
        return;
    }
    let message_id = string_field(value, "uuid")
        .or_else(|| string_field(message, "id"))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let turn_id = message_id.clone();
    state.turn_id = Some(turn_id.clone());
    state.events.push(wrap(
        Some(turn_id.clone()),
        AgentEvent::UserMessage {
            turn_id,
            message_id,
            kind: UserMessageKind::Normal,
            text,
            attachments: Vec::new(),
        },
    ));
}

fn ingest_assistant(state: &mut ParseState, value: &Value) {
    let message = value.get("message").unwrap_or(&Value::Null);
    let parent_tool_call_id =
        string_field(value, "parent_tool_use_id").or_else(|| state.forced_parent.clone());
    let message_id = string_field(message, "id")
        .or_else(|| string_field(value, "uuid"))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let turn_id = ensure_turn(state);
    match message.get("content") {
        Some(Value::String(text)) => {
            push_assistant_text(
                state,
                &turn_id,
                &message_id,
                text,
                parent_tool_call_id.clone(),
            );
        }
        Some(Value::Array(blocks)) => {
            for (index, block) in blocks.iter().enumerate() {
                let block_type = line_type(block).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = block.get("text").and_then(Value::as_str) {
                            push_assistant_text(
                                state,
                                &turn_id,
                                &format!("{message_id}-text-{index}"),
                                text,
                                parent_tool_call_id.clone(),
                            );
                        }
                    }
                    "thinking" => {
                        let thinking = block
                            .get("thinking")
                            .or_else(|| block.get("text"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        push_thinking(
                            state,
                            &turn_id,
                            &format!("{message_id}-thinking-{index}"),
                            thinking,
                            parent_tool_call_id.clone(),
                        );
                    }
                    "tool_use" => {
                        ingest_tool_use(state, &turn_id, block, parent_tool_call_id.clone())
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

fn ingest_tool_use(
    state: &mut ParseState,
    turn_id: &str,
    block: &Value,
    parent_tool_call_id: Option<String>,
) {
    let tool_call_id = string_field(block, "id").unwrap_or_default();
    if tool_call_id.is_empty() {
        return;
    }
    let name = string_field(block, "name").unwrap_or_else(|| "unknown".to_string());
    let input = block.get("input").cloned().unwrap_or(Value::Null);
    match classify_tool(&name, None, Some(&input)) {
        ClassifiedTool::Hide => {
            if is_ask_user_tool(&name) || is_exit_plan_tool(&name) {
                emit_hidden_permission(state, turn_id, &tool_call_id, &name, &input);
            }
        }
        ClassifiedTool::Thinking => {
            let text = thinking_text(None, Some(&input), None);
            push_thinking(
                state,
                turn_id,
                &format!("{tool_call_id}-thinking"),
                &text,
                parent_tool_call_id,
            );
        }
        ClassifiedTool::Plan => {
            state.events.push(wrap(
                Some(turn_id.to_string()),
                AgentEvent::PlanUpdated {
                    plan: plan_from_tool_input_or_stub(&name, None, Some(&input)),
                },
            ));
        }
        ClassifiedTool::PlanDocument => start_tool(
            state,
            turn_id,
            tool_call_id,
            name,
            AgentToolKind::PlanDocument,
            &input,
            parent_tool_call_id,
        ),
        ClassifiedTool::Call(kind) => start_tool(
            state,
            turn_id,
            tool_call_id,
            name,
            kind,
            &input,
            parent_tool_call_id,
        ),
    }
}

fn start_tool(
    state: &mut ParseState,
    turn_id: &str,
    tool_call_id: String,
    name: String,
    kind: AgentToolKind,
    input: &Value,
    parent_tool_call_id: Option<String>,
) {
    let params = tool_params(kind, &name, input);
    let title = match kind {
        AgentToolKind::Execute => human_execute_title(Some(input)),
        _ => None,
    };
    let tool = AgentTool {
        tool_call_id: tool_call_id.clone(),
        parent_tool_call_id,
        name,
        title,
        kind,
        status: AgentToolStatus::Running,
        params,
        result: None,
    };
    state.tools.insert(tool_call_id, tool.clone());
    state.events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::ToolCallStarted { tool_call: tool },
    ));
}

fn emit_hidden_permission(
    state: &mut ParseState,
    turn_id: &str,
    tool_call_id: &str,
    name: &str,
    input: &Value,
) {
    let questions = ask_questions_from_input(input);
    let description = if !questions.is_empty() {
        questions
            .iter()
            .map(|question| question.prompt.as_str())
            .collect::<Vec<_>>()
            .join(" · ")
    } else if is_exit_plan_tool(name) {
        "Exit plan mode".into()
    } else {
        name.to_string()
    };
    let options = if questions.len() == 1 {
        questions
            .first()
            .map(|question| {
                question
                    .options
                    .iter()
                    .map(|label| AgentPermissionOption {
                        option_id: label.clone(),
                        name: label.clone(),
                        kind: "allow_once".into(),
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![
            AgentPermissionOption {
                option_id: "allow_once".into(),
                name: "Allow".into(),
                kind: "allow_once".into(),
            },
            AgentPermissionOption {
                option_id: "reject_once".into(),
                name: "Reject".into(),
                kind: "reject".into(),
            },
        ]
    };
    state.pending_asks.insert(tool_call_id.to_string());
    state.events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::PermissionRequested {
            request: AgentPermissionRequest {
                request_id: tool_call_id.to_string(),
                tool: name.to_string(),
                description,
                content_markdown: plan_markdown_from_input(input),
                options,
                questions,
                plan_todos: Vec::new(),
            },
        },
    ));
}

fn bind_agent_id_from_result(state: &mut ParseState, result: &Value) {
    let Some(agent_id) = extract_task_id(result) else {
        return;
    };
    if state.agent_ids.contains_key(&agent_id) {
        return;
    }
    let mut newest = None;
    for event in &state.events {
        if let Some(tool) = event_tool(event) {
            if tool.kind == AgentToolKind::Subagent {
                newest = Some(tool.tool_call_id.clone());
            }
        }
    }
    if let Some(tool_id) = newest {
        state.agent_ids.insert(agent_id, tool_id);
    }
}

fn complete_tool_results(state: &mut ParseState, content: &Value) {
    match content {
        Value::Array(blocks) => {
            for block in blocks {
                if line_type(block) == Some("tool_result") {
                    complete_one_tool(state, block);
                }
            }
        }
        Value::Object(_) if line_type(content) == Some("tool_result") => {
            complete_one_tool(state, content);
        }
        _ => {}
    }
}

fn complete_one_tool(state: &mut ParseState, block: &Value) {
    let Some(tool_call_id) = string_field(block, "tool_use_id") else {
        return;
    };
    let result_content = block.get("content").unwrap_or(&Value::Null);
    let text = tool_result_text(result_content);
    if state.pending_asks.remove(&tool_call_id) {
        state.events.push(wrap(
            state.turn_id.clone(),
            AgentEvent::PermissionResolved {
                request_id: tool_call_id,
                option_id: if text.trim().is_empty() {
                    "allow_once".into()
                } else {
                    text
                },
            },
        ));
        return;
    }
    let Some(mut tool) = state.tools.remove(&tool_call_id) else {
        return;
    };
    let is_error = block
        .get("is_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if is_error {
        tool.status = AgentToolStatus::Failed;
        tool.result = Some(AgentToolResult::Error { message: text });
        state.events.push(wrap(
            state.turn_id.clone(),
            AgentEvent::ToolCallFailed {
                tool_call: tool,
                error: None,
            },
        ));
        return;
    }
    if tool.kind == AgentToolKind::Subagent {
        bind_agent_id_from_result(state, result_content);
        if let Some(agent_id) =
            labeled_id_from_text(&text).or_else(|| extract_task_id(result_content))
        {
            state
                .agent_ids
                .insert(agent_id.clone(), tool.tool_call_id.clone());
            if let AgentToolParams::Subagent { task_id, .. } = &mut tool.params {
                if task_id.is_none() {
                    *task_id = Some(agent_id);
                }
            }
        }
        if is_subagent_dispatch_ack(result_content) {
            state.tools.insert(tool.tool_call_id.clone(), tool);
            return;
        }
    }
    tool.status = AgentToolStatus::Completed;
    tool.result = Some(match tool.kind {
        AgentToolKind::Execute => AgentToolResult::Execute {
            output: text,
            exit_code: None,
        },
        _ if text.is_empty() => AgentToolResult::Empty,
        _ => AgentToolResult::Text { text },
    });
    state.events.push(wrap(
        state.turn_id.clone(),
        AgentEvent::ToolCallCompleted { tool_call: tool },
    ));
}

fn ingest_task_notification(state: &mut ParseState, text: &str) {
    let tool_use_id = xml_tag(text, "tool-use-id");
    if let (Some(task_id), Some(tool_use_id)) = (xml_tag(text, "task-id"), tool_use_id.as_ref()) {
        state.agent_ids.insert(task_id, tool_use_id.clone());
    }
    let Some(tool_use_id) = tool_use_id else {
        return;
    };
    complete_tool_by_id(state, &tool_use_id, None);
}

fn complete_tool_by_id(state: &mut ParseState, tool_call_id: &str, text: Option<String>) {
    let Some(mut tool) = state.tools.remove(tool_call_id) else {
        return;
    };
    let text = text.unwrap_or_default();
    tool.status = AgentToolStatus::Completed;
    tool.result = if text.is_empty() {
        Some(AgentToolResult::Empty)
    } else {
        Some(AgentToolResult::Text { text })
    };
    state.events.push(wrap(
        state.turn_id.clone(),
        AgentEvent::ToolCallCompleted { tool_call: tool },
    ));
}

fn complete_open_tools(state: &mut ParseState) {
    let ids: Vec<String> = state.tools.keys().cloned().collect();
    for id in ids {
        complete_tool_by_id(state, &id, None);
    }
}

fn is_task_notification_text(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("<task-notification>") || trimmed.contains("<task-notification>")
}

fn is_local_command_caveat(text: &str) -> bool {
    text.trim_start().starts_with("<local-command-caveat>")
}

fn xml_tag(text: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close)? + start;
    let value = text[start..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn push_assistant_text(
    state: &mut ParseState,
    turn_id: &str,
    message_id: &str,
    text: &str,
    parent_tool_call_id: Option<String>,
) {
    push_text(
        state,
        turn_id,
        message_id,
        TextKind::Answer,
        text,
        parent_tool_call_id,
    );
}

fn push_thinking(
    state: &mut ParseState,
    turn_id: &str,
    message_id: &str,
    text: &str,
    parent_tool_call_id: Option<String>,
) {
    push_text(
        state,
        turn_id,
        message_id,
        TextKind::Thinking,
        text,
        parent_tool_call_id,
    );
}

fn push_text(
    state: &mut ParseState,
    turn_id: &str,
    message_id: &str,
    kind: TextKind,
    text: &str,
    parent_part_id: Option<String>,
) {
    if text.is_empty() {
        return;
    }
    // `ingest_assistant` already folds the content-block index into `message_id`,
    // so each segment is the sole part of its message.
    for payload in finished_text_part(message_id, 0, kind, text, parent_part_id) {
        state.events.push(wrap(Some(turn_id.to_string()), payload));
    }
}

fn ensure_turn(state: &mut ParseState) -> String {
    if let Some(turn_id) = &state.turn_id {
        return turn_id.clone();
    }
    let turn_id = uuid::Uuid::new_v4().to_string();
    state.turn_id = Some(turn_id.clone());
    turn_id
}

fn tool_params(kind: AgentToolKind, name: &str, input: &Value) -> AgentToolParams {
    match kind {
        AgentToolKind::Read => extract_path(input)
            .map(|path| AgentToolParams::Read {
                path,
                offset: json_i64(input, &["offset", "start_line"]),
                limit: json_i64(input, &["limit", "count", "num_lines"]),
            })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Edit => extract_path(input)
            .map(|path| AgentToolParams::Edit { path })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Delete => extract_path(input)
            .map(|path| AgentToolParams::Delete { path })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Move => match (
            first_string(input, &["from", "old_path", "source"]),
            first_string(input, &["to", "new_path", "destination"]),
        ) {
            (Some(from), Some(to)) => AgentToolParams::Move { from, to },
            _ => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Search => extract_query(input)
            .map(|query| AgentToolParams::Search {
                path: extract_path(input),
                glob: first_string(input, &["glob", "glob_pattern"]),
                query,
            })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::WebSearch => extract_query(input)
            .map(|query| AgentToolParams::WebSearch { query })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Execute => extract_command(input)
            .map(|command| AgentToolParams::Execute {
                cwd: extract_cwd(input),
                background: extract_background(input),
                task_id: extract_task_id(input),
                command,
            })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Fetch => extract_url(input)
            .map(|url| AgentToolParams::Fetch { url })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Skill => extract_skill(input)
            .map(|skill| AgentToolParams::Skill { skill })
            .unwrap_or_else(|| AgentToolParams::Other {
                value: input.clone(),
            }),
        AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(input).unwrap_or_else(|| {
                (
                    first_string(input, &["description", "prompt", "task"]).unwrap_or_default(),
                    first_string(input, &["subagent_type", "agent_type"]),
                )
            });
            if description.is_empty() {
                AgentToolParams::Other {
                    value: input.clone(),
                }
            } else {
                AgentToolParams::Subagent {
                    prompt: extract_subagent_prompt(input, &description),
                    task_id: extract_task_id(input),
                    description,
                    agent_type,
                }
            }
        }
        AgentToolKind::McpList => AgentToolParams::McpList {
            server: first_string(input, &["server", "serverName"]),
        },
        AgentToolKind::McpCall => {
            let mcp = mcp_ref_from_name(name);
            AgentToolParams::McpCall {
                server: mcp.as_ref().and_then(|item| item.server.clone()),
                tool: mcp
                    .as_ref()
                    .and_then(|item| item.tool.clone())
                    .or_else(|| Some(name.to_string())),
            }
        }
        AgentToolKind::ImageGen => AgentToolParams::ImageGen {
            prompt: extract_image_prompt(input).unwrap_or_default(),
            aspect_ratio: extract_aspect_ratio(input),
            size: extract_image_size(input),
            path: extract_path(input),
            reference_paths: extract_reference_paths(input),
        },
        AgentToolKind::PlanDocument => {
            plan_document_from_tool_input(Some(input)).unwrap_or(AgentToolParams::PlanDocument {
                name: None,
                overview: None,
                plan: String::new(),
                todos: Vec::new(),
                is_project: None,
                phases: None,
            })
        }
        AgentToolKind::Other => AgentToolParams::Other {
            value: input.clone(),
        },
    }
}

fn json_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    let mut objects = vec![value];
    if let Some(nested) = value.get("input") {
        objects.push(nested);
    }
    for object in objects {
        for key in keys {
            match object.get(*key) {
                Some(Value::Number(number)) => return number.as_i64(),
                Some(Value::String(text)) => return text.trim().parse().ok(),
                _ => {}
            }
        }
    }
    None
}

fn tool_result_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.as_str().map(ToString::to_string).or_else(|| {
                    item.get("text")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
            })
            .collect::<Vec<_>>()
            .join(""),
        Value::Object(_) => first_string(content, &["text", "content", "output"])
            .unwrap_or_else(|| content.to_string()),
        _ => String::new(),
    }
}

fn user_text(message: &Value) -> String {
    match message.get("content").unwrap_or(message) {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|block| match line_type(block) {
                Some("tool_result") => None,
                Some("text") | None => block
                    .get("text")
                    .and_then(Value::as_str)
                    .or_else(|| block.as_str())
                    .map(ToString::to_string),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn is_meta(value: &Value) -> bool {
    value
        .get("isMeta")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn line_type(value: &Value) -> Option<&str> {
    value.get("type").and_then(Value::as_str)
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn line_timestamp(value: &Value) -> Option<DateTime<Utc>> {
    string_field(value, "timestamp")
        .as_deref()
        .and_then(parse_utc)
}

fn preview_title(text: &str) -> String {
    let collapsed = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    match collapsed.char_indices().nth(120) {
        Some((idx, _)) => collapsed[..idx].to_string(),
        None => collapsed,
    }
}

fn project_name(cwd: &str) -> String {
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

fn peek_bytes(path: &Path, cap: usize) -> Vec<u8> {
    let mut buf = vec![0_u8; cap];
    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    match file.read(&mut buf) {
        Ok(n) => {
            buf.truncate(n);
            buf
        }
        Err(_) => Vec::new(),
    }
}

fn complete_lines(prefix: &[u8], truncated: bool) -> Vec<&str> {
    let text = std::str::from_utf8(prefix).unwrap_or("");
    let mut lines: Vec<&str> = text
        .split('\n')
        .map(|line| line.trim_end_matches('\r'))
        .collect();
    if truncated && !text.ends_with('\n') {
        lines.pop();
    }
    lines
        .into_iter()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect()
}

fn file_mtime_utc(path: &Path) -> DateTime<Utc> {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(Utc::now)
}

fn parse_utc(ts: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const PARENT: &str = include_str!("../testdata/claude/parent.jsonl");
    const NO_CWD: &str = include_str!("../testdata/claude/no_cwd.jsonl");
    const SUBAGENT: &str = include_str!("../testdata/claude/subagent.jsonl");
    const TASK_PARENT: &str = include_str!("../testdata/claude/task_parent.jsonl");
    const TASK_CHILD: &str = include_str!("../testdata/claude/task_child.jsonl");
    const PARENT_ID: &str = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
    const NO_CWD_ID: &str = "bbbbbbbb-cccc-4ddd-8eee-222222222222";
    const TASK_ID: &str = "cccccccc-dddd-4eee-8fff-444444444444";

    fn write_rel(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    fn fixture_tree() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let projects = tmp.path().join("projects");
        write_rel(
            &projects,
            &format!("-Users-fake-encoded/{PARENT_ID}.jsonl"),
            PARENT,
        );
        write_rel(
            &projects,
            &format!("-Users-fake-encoded/{PARENT_ID}/subagents/agent-child.jsonl"),
            SUBAGENT,
        );
        write_rel(
            &projects,
            &format!("-tmp-decoded-cwd/{NO_CWD_ID}.jsonl"),
            NO_CWD,
        );
        (tmp, projects)
    }

    fn user_texts(events: &[AgentEventEnvelope]) -> Vec<String> {
        events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::UserMessage { text, .. } => Some(text.clone()),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn tui_resume_argv() {
        let plan = ClaudeSource
            .tui_resume("sess-1", Path::new("/tmp/ws"))
            .expect("tui plan");
        assert_eq!(plan.bin, "claude");
        assert_eq!(plan.args, ["--resume", "sess-1"]);
        assert_eq!(plan.cwd, Path::new("/tmp/ws"));
    }

    #[test]
    fn list_in_missing_root_is_empty() {
        assert!(list_in(&[PathBuf::from("/no/such/claude-projects")]).is_empty());
    }

    #[test]
    fn list_in_marks_nested_subagents_with_parent() {
        let (_tmp, projects) = fixture_tree();
        let rows = list_in(&[projects]);
        let ids: Vec<_> = rows.iter().map(|row| row.native_id.as_str()).collect();
        assert!(ids.contains(&PARENT_ID));
        assert!(ids.contains(&NO_CWD_ID));
        let parent = rows.iter().find(|row| row.native_id == PARENT_ID).unwrap();
        assert_eq!(parent.key, format!("claude:{PARENT_ID}"));
        assert_eq!(parent.provider_id, "claude");
        assert!(parent.parent_native_id.is_none());
        let child = rows
            .iter()
            .find(|row| row.native_id == "agent-child")
            .unwrap();
        assert_eq!(child.parent_native_id.as_deref(), Some(PARENT_ID));
        assert_eq!(
            child.parent_session_key(),
            Some(format!("claude:{PARENT_ID}"))
        );
        assert_eq!(parent.title, "List src files");
        assert_eq!(parent.cwd, "/tmp/fixture-app");
        assert_eq!(parent.project_name, "fixture-app");
        assert_eq!(parent.model.as_deref(), Some("claude-opus-4-6"));
        assert!(parent.source_path.ends_with(&format!("{PARENT_ID}.jsonl")));
        assert_eq!(
            parent.started_at,
            parse_utc("2026-04-01T10:00:00.000Z").unwrap()
        );
        let decoded = rows.iter().find(|row| row.native_id == NO_CWD_ID).unwrap();
        assert_eq!(decoded.cwd, "/tmp/decoded/cwd");
        assert_eq!(decoded.project_name, "cwd");
        assert_eq!(decoded.title, "No cwd in records.");
    }

    #[test]
    fn list_in_does_not_read_whole_large_jsonl() {
        let tmp = tempfile::tempdir().unwrap();
        let projects = tmp.path().join("projects");
        let mut body = String::from(
            "{\"type\":\"user\",\"uuid\":\"early\",\"timestamp\":\"2026-04-01T10:00:00.000Z\",\"cwd\":\"/tmp/large-app\",\"message\":{\"role\":\"user\",\"content\":\"Peek title\"}}\n",
        );
        let pad = "{\"type\":\"mode\",\"mode\":\"default\"}\n";
        while body.len() < LIST_PEEK_BYTES + 64 {
            body.push_str(pad);
        }
        body.push_str("{\"type\":\"custom-title\",\"customTitle\":\"SHOULD_NOT_BE_TITLE\"}\n");
        body.push_str(&"x".repeat(2 * 1024 * 1024));
        write_rel(
            &projects,
            "encoded/cccccccc-dddd-4eee-8fff-333333333333.jsonl",
            &body,
        );
        let rows = list_in(&[projects]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Peek title");
        assert!(!rows[0].title.contains("SHOULD_NOT_BE_TITLE"));
        assert_eq!(rows[0].cwd, "/tmp/large-app");
    }

    #[test]
    fn parse_missing_is_ok_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let events = parse_in(&[tmp.path().to_path_buf()], "missing").expect("parse");
        assert!(events.is_empty());
    }

    #[test]
    fn parse_maps_messages_tools_and_unknown() {
        let (_tmp, projects) = fixture_tree();
        let events = parse_in(&[projects], PARENT_ID).expect("parse");
        let users = user_texts(&events);
        assert_eq!(users, ["List the files in src.", "Thanks."]);
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk { kind: TextKind::Thinking, text, .. }
                if text.contains("list the directory")
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk { kind: TextKind::Answer, text, offset: 0, .. }
                if text == "I'll list src."
        )));
        assert!(events
            .iter()
            .any(|event| matches!(&event.payload, AgentEvent::PartClosed { .. })));
        let started = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let tool = started.expect("tool start");
        assert_eq!(tool.name, "Bash");
        assert_eq!(tool.kind, AgentToolKind::Execute);
        assert!(matches!(
            &tool.params,
            AgentToolParams::Execute { command, .. } if command == "ls src"
        ));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "tool-bash-1"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::Unknown { event_type, .. } if event_type == "mystery-host-line"
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::Unknown { event_type, .. } if event_type == "mode" || event_type == "queue-operation" || event_type == "cost-state" || event_type == "agent-setting"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionRequested { request }
                if request.tool == "AskUserQuestion" && request.request_id == "ask-1"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionResolved { request_id, option_id }
                if request_id == "ask-1" && option_id == "main.rs"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionRequested { request }
                if request.tool == "ExitPlanMode"
                    && request.content_markdown.as_deref() == Some("# Ready to code")
        )));
    }

    #[test]
    fn parse_file_reads_testdata_directly() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/session_source/testdata/claude/parent.jsonl");
        let events = parse_file(&path).expect("parse_file");
        assert!(!events.is_empty());
        assert!(user_texts(&events).contains(&"List the files in src.".to_string()));
        let user_ts = events.iter().find_map(|event| match &event.payload {
            AgentEvent::UserMessage { text, .. } if text == "List the files in src." => {
                event.timestamp
            }
            _ => None,
        });
        assert_eq!(user_ts, parse_utc("2026-04-01T10:00:01.000Z"));
        assert!(events.iter().any(|event| event.timestamp.is_some()));
    }

    #[test]
    fn parse_keeps_task_notification_user_turn_and_nests_child() {
        let tmp = tempfile::tempdir().unwrap();
        let projects = tmp.path().join("projects");
        write_rel(
            &projects,
            &format!("-Users-fake-encoded/{TASK_ID}.jsonl"),
            TASK_PARENT,
        );
        write_rel(
            &projects,
            &format!("-Users-fake-encoded/{TASK_ID}/subagents/agent-a827867c2504be0f1.jsonl"),
            TASK_CHILD,
        );
        let events = parse_in(&[projects], TASK_ID).expect("parse");
        let users = user_texts(&events);
        assert_eq!(users.len(), 2);
        assert_eq!(users[0], "启动一个 subagent 探索下代码");
        assert!(users[1].contains("<task-notification>"));
        assert!(users[1].contains("call_task_1"));
        let completed: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::ToolCallCompleted { tool_call }
                    if tool_call.tool_call_id == "call_task_1" =>
                {
                    Some((tool_call.status, tool_call.result.clone()))
                }
                _ => None,
            })
            .collect();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].0, AgentToolStatus::Completed);
        assert!(matches!(completed[0].1, Some(AgentToolResult::Empty)));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk {
                kind: TextKind::Answer,
                text,
                parent_part_id: Some(parent),
                ..
            } if text.contains("monorepo") && parent == "call_task_1"
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::UserMessage { text, .. } if text == "Explore the repo"
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk {
                kind: TextKind::Answer,
                text,
                parent_part_id: None,
                ..
            } if text.contains("monorepo")
        )));
    }
}
