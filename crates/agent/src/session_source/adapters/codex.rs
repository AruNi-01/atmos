use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentResult, AgentTool, AgentToolKind, AgentToolParams,
    AgentToolResult, AgentToolStatus, TextKind, UserMessageKind,
};
use crate::map::extract::first_string;
use crate::map::{
    classify_tool, extract_aspect_ratio, extract_background, extract_command, extract_cwd,
    extract_image_prompt, extract_image_size, extract_path, extract_query, extract_reference_paths,
    extract_skill, extract_subagent, extract_subagent_prompt, extract_task_id, extract_url,
    human_execute_title, mcp_ref_from_name, plan_document_from_tool_input,
    plan_from_tool_input_or_stub, thinking_text, ClassifiedTool,
};
use crate::session_source::paths;
use crate::session_source::{
    finished_text_part, HostId, HostSessionRef, SessionSource, TuiResumePlan,
};

const LIST_PEEK_BYTES: usize = 8192;
const SKIPPED_THREAD_SOURCES: &[&str] = &["guardian_review", "memory_consolidation"];

pub struct CodexSource;

impl SessionSource for CodexSource {
    fn provider_id(&self) -> &'static str {
        HostId::Codex.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::codex_data_roots()
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
        Some(HostId::Codex.tui_resume(native_id, cwd))
    }
}

fn list_in<P: AsRef<Path>>(roots: &[P]) -> Vec<HostSessionRef> {
    let mut files = Vec::new();
    for root in roots {
        collect_rollout_files(root.as_ref(), 0, 8, &mut files);
    }
    files
        .into_iter()
        .filter_map(|path| list_row(&path))
        .collect()
}

fn parse_in<P: AsRef<Path>>(roots: &[P], native_id: &str) -> AgentResult<Vec<AgentEventEnvelope>> {
    match find_rollout(roots, native_id) {
        Some(path) => parse_file(&path),
        None => Ok(Vec::new()),
    }
}

fn parse_file(path: &Path) -> AgentResult<Vec<AgentEventEnvelope>> {
    parse_file_with_children(path, true)
}

fn parse_file_with_children(
    path: &Path,
    ingest_children: bool,
) -> AgentResult<Vec<AgentEventEnvelope>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return Ok(Vec::new()),
    };
    let mut state = ParseState::default();
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
        ingest_line(&mut state, &value);
    }
    if ingest_children {
        ingest_child_rollouts(&mut state, path);
    }
    Ok(state.events)
}

fn ingest_child_rollouts(state: &mut ParseState, parent_path: &Path) {
    let Some(parent_id) = state.native_id.clone() else {
        return;
    };
    let Some(dir) = parent_path.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut siblings: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_rollout_name(path) && path != parent_path)
        .collect();
    siblings.sort();
    let mut used = HashSet::new();
    for path in siblings {
        if peek_file_parent(&path).as_deref() != Some(parent_id.as_str()) {
            continue;
        }
        let Some(child_id) = rollout_native_id(&path).or_else(|| peek_session_id(&path)) else {
            continue;
        };
        let Some(parent_tool) = match_child_parent(&state.events, &child_id, &used) else {
            continue;
        };
        used.insert(parent_tool.clone());
        let Ok(child_events) = parse_file_with_children(&path, false) else {
            continue;
        };
        for mut event in child_events {
            match &event.payload {
                AgentEvent::SessionStarted { .. } | AgentEvent::UserMessage { .. } => continue,
                _ => {}
            }
            stamp_nested(&mut event.payload, &parent_tool);
            state.events.push(event);
        }
    }
}

fn peek_file_parent(path: &Path) -> Option<String> {
    let prefix = peek_bytes(path, LIST_PEEK_BYTES);
    let truncated = prefix.len() == LIST_PEEK_BYTES;
    let lines = complete_lines(&prefix, truncated);
    peek_meta(&lines, "").parent_native_id
}

fn match_child_parent(
    events: &[AgentEventEnvelope],
    child_id: &str,
    used: &HashSet<String>,
) -> Option<String> {
    let mut by_id: HashMap<String, AgentTool> = HashMap::new();
    for event in events {
        if let Some(tool) = event_tool(event) {
            if tool.kind == AgentToolKind::Subagent {
                by_id.insert(tool.tool_call_id.clone(), tool.clone());
            }
        }
    }
    let mut unmatched = Vec::new();
    for tool in by_id.values() {
        if used.contains(&tool.tool_call_id) {
            continue;
        }
        if tool.tool_call_id == child_id {
            return Some(tool.tool_call_id.clone());
        }
        let AgentToolParams::Subagent { task_id, .. } = &tool.params else {
            continue;
        };
        if task_id.as_deref() == Some(child_id) {
            return Some(tool.tool_call_id.clone());
        }
        if task_id.is_none() {
            unmatched.push(tool.tool_call_id.clone());
        }
    }
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

fn stamp_nested(payload: &mut AgentEvent, parent: &str) {
    match payload {
        AgentEvent::TextChunk { parent_part_id, .. } => {
            *parent_part_id = Some(parent.to_string());
        }
        AgentEvent::ToolCallStarted { tool_call }
        | AgentEvent::ToolCallUpdated { tool_call }
        | AgentEvent::ToolCallCompleted { tool_call }
        | AgentEvent::ToolCallFailed { tool_call, .. }
            if tool_call.parent_tool_call_id.is_none() =>
        {
            tool_call.parent_tool_call_id = Some(parent.to_string());
        }
        _ => {}
    }
}

fn find_rollout<P: AsRef<Path>>(roots: &[P], native_id: &str) -> Option<PathBuf> {
    let mut files = Vec::new();
    for root in roots {
        collect_rollout_files(root.as_ref(), 0, 8, &mut files);
    }
    if let Some(path) = files
        .iter()
        .find(|path| rollout_native_id(path).as_deref() == Some(native_id))
    {
        return Some(path.clone());
    }
    files
        .into_iter()
        .find(|path| peek_session_id(path).as_deref() == Some(native_id))
}

fn collect_rollout_files(dir: &Path, depth: usize, max_depth: usize, files: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_rollout_files(&path, depth + 1, max_depth, files);
        } else if file_type.is_file() && is_rollout_name(&path) {
            files.push(path);
        }
    }
}

fn is_rollout_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            let lower = name.to_ascii_lowercase();
            lower.starts_with("rollout-") && lower.ends_with(".jsonl")
        })
}

fn rollout_native_id(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    let stem = name
        .strip_suffix(".jsonl")
        .or_else(|| name.strip_suffix(".JSONL"))?;
    const UUID_LEN: usize = 36;
    if stem.len() >= UUID_LEN {
        let candidate = &stem[stem.len() - UUID_LEN..];
        if looks_like_uuid(candidate) {
            return Some(candidate.to_string());
        }
    }
    Some(stem.trim_start_matches("rollout-").to_string())
}

fn looks_like_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes[8] == b'-'
        && bytes[13] == b'-'
        && bytes[18] == b'-'
        && bytes[23] == b'-'
        && value
            .bytes()
            .enumerate()
            .all(|(idx, ch)| matches!(idx, 8 | 13 | 18 | 23) || ch.is_ascii_hexdigit())
}

fn list_row(path: &Path) -> Option<HostSessionRef> {
    let filename_id = rollout_native_id(path)?;
    let prefix = peek_bytes(path, LIST_PEEK_BYTES);
    let truncated = prefix.len() == LIST_PEEK_BYTES;
    let lines = complete_lines(&prefix, truncated);
    if let Some(first) = lines.first() {
        if is_internal_thread(first) {
            return None;
        }
    }
    let mtime = file_mtime_utc(path);
    let peek = peek_meta(&lines, &filename_id);
    let native_id = peek
        .native_id
        .filter(|id| !id.is_empty())
        .unwrap_or(filename_id);
    let cwd = peek.cwd.unwrap_or_default();
    let title = peek
        .title
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| native_id.clone());
    Some(HostSessionRef {
        key: HostSessionRef::key_for(HostId::Codex.as_str(), &native_id),
        provider_id: HostId::Codex.as_str().to_string(),
        native_id,
        title,
        project_name: project_name(&cwd),
        cwd,
        started_at: peek.started_at.unwrap_or(mtime),
        updated_at: mtime,
        message_count: None,
        byte_size: None,
        model: peek.model,
        source_path: path.to_string_lossy().into_owned(),
        parent_native_id: peek.parent_native_id,
    })
}

struct PeekMeta {
    native_id: Option<String>,
    title: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    started_at: Option<DateTime<Utc>>,
    parent_native_id: Option<String>,
}

fn peek_meta(lines: &[&str], filename_id: &str) -> PeekMeta {
    let mut native_id = None;
    let mut title = None;
    let mut cwd = None;
    let mut model = None;
    let mut started_at: Option<DateTime<Utc>> = None;
    let mut parent_native_id = None;
    for line in lines {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if let Some(ts) = line_timestamp(&value) {
            started_at = Some(match started_at {
                Some(prev) => prev.min(ts),
                None => ts,
            });
        }
        let payload = value.get("payload").unwrap_or(&Value::Null);
        match line_type(&value) {
            Some("session_meta") => {
                if native_id.is_none() {
                    native_id =
                        string_field(payload, "id").or_else(|| string_field(payload, "session_id"));
                }
                if cwd.is_none() {
                    cwd = string_field(payload, "cwd");
                }
                if model.is_none() {
                    model = string_field(payload, "model")
                        .or_else(|| string_field(payload, "model_provider"));
                }
                if parent_native_id.is_none() {
                    parent_native_id = parent_thread_id(payload);
                }
            }
            Some("turn_context") => {
                if cwd.is_none() {
                    cwd = string_field(payload, "cwd");
                }
                if let Some(found) = string_field(payload, "model") {
                    model = Some(found);
                }
            }
            Some("response_item")
                if title.is_none()
                    && payload_type(payload) == Some("message")
                    && payload.get("role").and_then(Value::as_str) == Some("user") =>
            {
                let text = message_text(payload, &["input_text", "text"]);
                if !text.is_empty() && !is_environment_context_only(&text) {
                    title = Some(preview_title(&text));
                }
            }
            _ => {}
        }
    }
    if native_id.is_none() {
        native_id = Some(filename_id.to_string());
    }
    PeekMeta {
        native_id,
        title,
        cwd,
        model,
        started_at,
        parent_native_id,
    }
}

fn peek_session_id(path: &Path) -> Option<String> {
    let prefix = peek_bytes(path, LIST_PEEK_BYTES);
    let first = complete_lines(&prefix, prefix.len() == LIST_PEEK_BYTES)
        .into_iter()
        .next()?;
    let value: Value = serde_json::from_str(first).ok()?;
    let payload = value.get("payload")?;
    string_field(payload, "id").or_else(|| string_field(payload, "session_id"))
}

fn is_internal_thread(first_line: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(first_line) else {
        return false;
    };
    if line_type(&value) != Some("session_meta") {
        return false;
    }
    let Some(payload) = value.get("payload") else {
        return false;
    };
    payload
        .get("thread_source")
        .and_then(Value::as_str)
        .is_some_and(|source| SKIPPED_THREAD_SOURCES.contains(&source))
}

fn parent_thread_id(payload: &Value) -> Option<String> {
    payload
        .pointer("/source/subagent/thread_spawn/parent_thread_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
}

#[derive(Default)]
struct ParseState {
    turn_id: Option<String>,
    tools: HashMap<String, AgentTool>,
    events: Vec<AgentEventEnvelope>,
    native_id: Option<String>,
}

fn ingest_line(state: &mut ParseState, value: &Value) {
    let from = state.events.len();
    let Some(kind) = line_type(value) else {
        return;
    };
    let payload = value.get("payload").unwrap_or(&Value::Null);
    match kind {
        "session_meta" => {
            let id = string_field(payload, "id").or_else(|| string_field(payload, "session_id"));
            if state.native_id.is_none() {
                state.native_id = id.clone();
            }
            state.events.push(wrap(
                state.turn_id.clone(),
                AgentEvent::SessionStarted {
                    persistence_handle: id,
                },
            ));
        }
        "turn_context"
        | "event_msg"
        | "compacted"
        | "world_state"
        | "token_usage_record"
        | "inter_agent_communication_metadata" => {}
        "response_item" => ingest_response_item(state, payload),
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

fn ingest_response_item(state: &mut ParseState, payload: &Value) {
    match payload_type(payload) {
        Some("message") => ingest_message(state, payload),
        Some("reasoning") => {
            let text = reasoning_text(payload);
            let turn_id = ensure_turn(state);
            let message_id =
                string_field(payload, "id").unwrap_or_else(|| format!("{turn_id}-thinking"));
            push_thinking(state, &turn_id, &message_id, &text);
        }
        Some("function_call") | Some("custom_tool_call") => ingest_function_call(state, payload),
        Some("function_call_output") | Some("custom_tool_call_output") => {
            complete_function_output(state, payload)
        }
        Some("web_search_call") => ingest_web_search_call(state, payload),
        _ => {}
    }
}

fn ingest_message(state: &mut ParseState, payload: &Value) {
    let role = payload.get("role").and_then(Value::as_str).unwrap_or("");
    match role {
        "user" => {
            let text = message_text(payload, &["input_text", "text"]);
            if text.is_empty() || is_environment_context_only(&text) {
                return;
            }
            let message_id =
                string_field(payload, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
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
        "assistant" => {
            let text = message_text(payload, &["output_text", "text"]);
            let turn_id = ensure_turn(state);
            let message_id =
                string_field(payload, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            push_assistant_text(state, &turn_id, &message_id, &text);
        }
        _ => {}
    }
}

fn ingest_function_call(state: &mut ParseState, payload: &Value) {
    let tool_call_id = string_field(payload, "call_id")
        .or_else(|| string_field(payload, "id"))
        .unwrap_or_default();
    if tool_call_id.is_empty() {
        return;
    }
    let name = string_field(payload, "name").unwrap_or_else(|| "unknown".to_string());
    let input = function_input(payload);
    let turn_id = ensure_turn(state);
    match classify_tool(&name, None, Some(&input)) {
        ClassifiedTool::Hide => {}
        ClassifiedTool::Thinking => {
            let text = thinking_text(None, Some(&input), None);
            push_thinking(state, &turn_id, &format!("{tool_call_id}-thinking"), &text);
        }
        ClassifiedTool::Plan => {
            state.events.push(wrap(
                Some(turn_id),
                AgentEvent::PlanUpdated {
                    plan: plan_from_tool_input_or_stub(&name, None, Some(&input)),
                },
            ));
        }
        ClassifiedTool::PlanDocument => ingest_classified_tool(
            state,
            &turn_id,
            &tool_call_id,
            &name,
            AgentToolKind::PlanDocument,
            &input,
        ),
        ClassifiedTool::Call(kind) => {
            ingest_classified_tool(state, &turn_id, &tool_call_id, &name, kind, &input);
        }
    }
}

fn ingest_classified_tool(
    state: &mut ParseState,
    turn_id: &str,
    tool_call_id: &str,
    name: &str,
    kind: AgentToolKind,
    input: &Value,
) {
    let params = tool_params(kind, name, input);
    let title = match kind {
        AgentToolKind::Execute => human_execute_title(Some(input)),
        _ => None,
    };
    let tool = AgentTool {
        tool_call_id: tool_call_id.to_string(),
        parent_tool_call_id: None,
        name: name.to_string(),
        title,
        kind,
        status: AgentToolStatus::Running,
        params,
        result: None,
    };
    state.tools.insert(tool_call_id.to_string(), tool.clone());
    state.events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::ToolCallStarted { tool_call: tool },
    ));
}

fn complete_function_output(state: &mut ParseState, payload: &Value) {
    let Some(tool_call_id) = string_field(payload, "call_id")
        .or_else(|| string_field(payload, "callId"))
        .or_else(|| string_field(payload, "id"))
    else {
        return;
    };
    let Some(mut tool) = state.tools.remove(&tool_call_id) else {
        return;
    };
    let text = match payload.get("output").or_else(|| payload.get("result")) {
        Some(Value::String(text)) => text.clone(),
        Some(other) => {
            first_string(other, &["text", "output", "content"]).unwrap_or_else(|| other.to_string())
        }
        None => String::new(),
    };
    apply_subagent_output(&mut tool, &text);
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

fn ingest_web_search_call(state: &mut ParseState, payload: &Value) {
    let tool_call_id = string_field(payload, "id")
        .or_else(|| string_field(payload, "call_id"))
        .unwrap_or_default();
    if tool_call_id.is_empty() {
        return;
    }
    let query = extract_query(payload).unwrap_or_default();
    let input = serde_json::json!({ "query": query });
    let turn_id = ensure_turn(state);
    ingest_classified_tool(
        state,
        &turn_id,
        &tool_call_id,
        "web_search",
        AgentToolKind::WebSearch,
        &input,
    );
    let status = string_field(payload, "status").unwrap_or_default();
    if status.eq_ignore_ascii_case("completed") || status.eq_ignore_ascii_case("complete") {
        complete_function_output(
            state,
            &serde_json::json!({
                "call_id": tool_call_id,
                "output": payload.get("action").cloned().unwrap_or(Value::Null),
            }),
        );
    }
}

fn apply_subagent_output(tool: &mut AgentTool, text: &str) {
    if tool.kind != AgentToolKind::Subagent {
        return;
    }
    let parsed =
        serde_json::from_str::<Value>(text).unwrap_or_else(|_| Value::String(text.to_string()));
    let Some(agent_id) =
        extract_task_id(&parsed).or_else(|| extract_task_id(&Value::String(text.to_string())))
    else {
        return;
    };
    match &mut tool.params {
        AgentToolParams::Subagent { task_id, .. } => {
            if task_id.is_none() {
                *task_id = Some(agent_id);
            }
        }
        AgentToolParams::Other { .. } => {
            tool.params = AgentToolParams::Subagent {
                prompt: None,
                task_id: Some(agent_id),
                description: String::new(),
                agent_type: None,
            };
        }
        _ => {}
    }
}

fn parse_arguments(raw: &Value) -> Value {
    match raw {
        Value::String(text) => serde_json::from_str(text).unwrap_or_else(|_| raw.clone()),
        other => other.clone(),
    }
}

fn function_input(payload: &Value) -> Value {
    let mut input = parse_arguments(
        payload
            .get("arguments")
            .or_else(|| payload.get("input"))
            .unwrap_or(&Value::Null),
    );
    if let Some(object) = input.as_object_mut() {
        if !object.contains_key("command") {
            if let Some(cmd) = object.get("cmd").cloned() {
                object.insert("command".into(), cmd);
            }
        }
    }
    input
}

fn message_text(payload: &Value, types: &[&str]) -> String {
    match payload.get("content") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|block| {
                let block_type = line_type(block).unwrap_or("text");
                if types.contains(&block_type) || block_type == "text" {
                    block
                        .get("text")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn reasoning_text(payload: &Value) -> String {
    if let Some(items) = payload.get("summary").and_then(Value::as_array) {
        let text = items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        if !text.is_empty() {
            return text;
        }
    }
    payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn is_environment_context_only(text: &str) -> bool {
    let trimmed = text.trim();
    let Some(rest) = trimmed.strip_prefix("<environment_context>") else {
        return false;
    };
    rest.trim_end()
        .strip_suffix("</environment_context>")
        .is_some()
}

fn push_assistant_text(state: &mut ParseState, turn_id: &str, message_id: &str, text: &str) {
    push_text(state, turn_id, message_id, TextKind::Answer, text);
}

fn push_thinking(state: &mut ParseState, turn_id: &str, message_id: &str, text: &str) {
    push_text(state, turn_id, message_id, TextKind::Thinking, text);
}

fn push_text(state: &mut ParseState, turn_id: &str, message_id: &str, kind: TextKind, text: &str) {
    if text.is_empty() {
        return;
    }
    // Every caller derives a `message_id` that names one text segment, so each is
    // the sole part of its message.
    for payload in finished_text_part(message_id, 0, kind, text, None) {
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

fn line_type(value: &Value) -> Option<&str> {
    value.get("type").and_then(Value::as_str)
}

fn payload_type(payload: &Value) -> Option<&str> {
    payload.get("type").and_then(Value::as_str)
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
        .or_else(|| {
            value
                .get("payload")
                .and_then(|payload| string_field(payload, "timestamp"))
                .as_deref()
                .and_then(parse_utc)
        })
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

    const USER_THREAD: &str = include_str!("../testdata/codex/user_thread.jsonl");
    const INTERNAL: &str = include_str!("../testdata/codex/internal_thread.jsonl");
    const CHILD_THREAD: &str = include_str!("../testdata/codex/child_thread.jsonl");
    const ARCHIVED: &str = include_str!("../testdata/codex/archived_thread.jsonl");
    const UNREADABLE: &str = include_str!("../testdata/codex/unreadable.jsonl");
    const USER_ID: &str = "019d6344-42fe-7ec0-aae0-b24916d4e28e";
    const CHILD_ID: &str = "019d6344-cccc-7ec0-aae0-b24916d4e999";
    const INTERNAL_ID: &str = "019d9999-0000-7000-8000-000000000001";
    const GUARDIAN_ID: &str = "019d8888-0000-7000-8000-000000000002";
    const ARCHIVED_ID: &str = "019d5555-1111-7222-8333-444444444444";
    const UNREADABLE_ID: &str = "019d4444-aaaa-4bbb-8ccc-dddddddddddd";
    const GUARDIAN: &str = r#"{"timestamp":"2026-04-06T14:48:31.234Z","type":"session_meta","payload":{"id":"019d8888-0000-7000-8000-000000000002","cwd":"/tmp/fixture-app","thread_source":"guardian_review"}}"#;

    fn write_rel(root: &Path, rel: &str, body: &str) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, body).unwrap();
    }

    fn fixture_roots() -> (tempfile::TempDir, Vec<PathBuf>) {
        let tmp = tempfile::tempdir().unwrap();
        let sessions = tmp.path().join("sessions");
        let archived = tmp.path().join("archived_sessions");
        write_rel(
            &sessions,
            &format!("2026/04/06/rollout-2026-04-06T14-48-31-{USER_ID}.jsonl"),
            USER_THREAD,
        );
        write_rel(
            &sessions,
            &format!("2026/04/06/rollout-2026-04-06T14-48-47-{CHILD_ID}.jsonl"),
            CHILD_THREAD,
        );
        write_rel(
            &sessions,
            &format!("2026/04/06/rollout-2026-04-06T14-48-31-{INTERNAL_ID}.jsonl"),
            INTERNAL,
        );
        write_rel(
            &sessions,
            &format!("2026/04/06/rollout-2026-04-06T14-48-31-{GUARDIAN_ID}.jsonl"),
            GUARDIAN,
        );
        write_rel(
            &archived,
            &format!("2026/04/07/rollout-2026-04-07T10-00-00-{ARCHIVED_ID}.jsonl"),
            ARCHIVED,
        );
        write_rel(
            &archived,
            &format!("2026/04/08/rollout-2026-04-08T10-00-00-{UNREADABLE_ID}.jsonl"),
            UNREADABLE,
        );
        (tmp, vec![sessions, archived])
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
        let plan = CodexSource
            .tui_resume("sess-1", Path::new("/tmp/ws"))
            .expect("tui plan");
        assert_eq!(plan.bin, "codex");
        assert_eq!(plan.args, ["resume", "sess-1"]);
        assert_eq!(plan.cwd, Path::new("/tmp/ws"));
    }

    #[test]
    fn list_in_missing_root_is_empty() {
        assert!(list_in(&[PathBuf::from("/no/such/codex-sessions")]).is_empty());
    }

    #[test]
    fn list_in_walks_nested_and_skips_internal_threads() {
        let (_tmp, roots) = fixture_roots();
        let rows = list_in(&roots);
        let ids: Vec<_> = rows.iter().map(|row| row.native_id.clone()).collect();
        assert!(ids.contains(&USER_ID.to_string()));
        assert!(ids.contains(&ARCHIVED_ID.to_string()));
        assert!(ids.contains(&UNREADABLE_ID.to_string()));
        assert!(ids.contains(&INTERNAL_ID.to_string()));
        assert!(ids.contains(&CHILD_ID.to_string()));
        assert!(!ids.contains(&GUARDIAN_ID.to_string()));
        let user = rows.iter().find(|row| row.native_id == USER_ID).unwrap();
        assert_eq!(user.key, format!("codex:{USER_ID}"));
        assert_eq!(user.provider_id, "codex");
        assert!(user.parent_native_id.is_none());
        let child = rows
            .iter()
            .find(|row| row.native_id == INTERNAL_ID)
            .unwrap();
        assert_eq!(child.parent_native_id.as_deref(), Some(USER_ID));
        assert_eq!(user.title, "Say hello.");
        assert_eq!(user.cwd, "/tmp/fixture-app");
        assert_eq!(user.project_name, "fixture-app");
        assert_eq!(user.model.as_deref(), Some("gpt-5"));
        let archived = rows
            .iter()
            .find(|row| row.native_id == ARCHIVED_ID)
            .unwrap();
        assert_eq!(archived.title, "Archived hello.");
        assert_eq!(archived.cwd, "/tmp/archived-app");
        let unreadable = rows
            .iter()
            .find(|row| row.native_id == UNREADABLE_ID)
            .unwrap();
        assert_eq!(unreadable.title, "Recovered after bad line.");
    }

    #[test]
    fn list_in_does_not_read_whole_large_jsonl() {
        let tmp = tempfile::tempdir().unwrap();
        let sessions = tmp.path().join("sessions");
        let id = "019d7777-aaaa-4bbb-8ccc-dddddddddddd";
        let mut body = format!(
            "{{\"timestamp\":\"2026-04-06T14:48:31.234Z\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"{id}\",\"cwd\":\"/tmp/large-app\",\"source\":\"cli\"}}}}\n"
        );
        body.push_str(
            "{\"timestamp\":\"2026-04-06T14:48:33.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"Peek title\"}]}}\n",
        );
        let pad = "{\"timestamp\":\"2026-04-06T14:48:34.000Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\"}}\n";
        while body.len() < LIST_PEEK_BYTES + 64 {
            body.push_str(pad);
        }
        body.push_str(
            "{\"timestamp\":\"2026-04-06T14:48:35.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"SHOULD_NOT_BE_TITLE\"}]}}\n",
        );
        body.push_str(&"x".repeat(2 * 1024 * 1024));
        write_rel(
            &sessions,
            &format!("2026/04/06/rollout-2026-04-06T14-48-31-{id}.jsonl"),
            &body,
        );
        let rows = list_in(&[sessions]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Peek title");
        assert!(!rows[0].title.contains("SHOULD_NOT_BE_TITLE"));
        assert_eq!(rows[0].native_id, id);
    }

    #[test]
    fn parse_missing_is_ok_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let events = parse_in(&[tmp.path().to_path_buf()], "missing").expect("parse");
        assert!(events.is_empty());
    }

    #[test]
    fn parse_maps_messages_tools_and_skips_env_context() {
        let (_tmp, roots) = fixture_roots();
        let events = parse_in(&roots, USER_ID).expect("parse");
        let users = user_texts(&events);
        assert_eq!(users, ["Say hello.", "Thanks."]);
        assert!(users
            .iter()
            .all(|text| !text.contains("environment_context")));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::SessionStarted {
                persistence_handle: Some(handle)
            } if handle == USER_ID
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk { kind: TextKind::Thinking, text, .. }
                if text.contains("greeting")
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk { kind: TextKind::Answer, text, offset: 0, .. }
                if text == "Hello from disk."
        )));
        let started = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let tool = started.expect("tool start");
        assert_eq!(tool.name, "exec_command");
        assert_eq!(tool.kind, AgentToolKind::Execute);
        assert!(matches!(
            &tool.params,
            AgentToolParams::Execute { command, cwd, .. }
                if command == "ls" && cwd.as_deref() == Some("/tmp/fixture-app")
        ));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "call-1"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::Unknown { event_type, .. } if event_type == "mystery-host-line"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.name == "apply_patch"
                    && tool_call.kind == AgentToolKind::Edit
                    && matches!(&tool_call.params, AgentToolParams::Edit { path, .. } if path == "README.md")
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.name == "web_search"
                    && matches!(&tool_call.params, AgentToolParams::WebSearch { query } if query == "rust hashmap")
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "call-spawn"
                    && matches!(
                        &tool_call.params,
                        AgentToolParams::Subagent { task_id, description, .. }
                            if task_id.as_deref() == Some(CHILD_ID) && description == "Explore the child thread"
                    )
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk {
                kind: TextKind::Answer,
                text,
                parent_part_id: Some(parent),
                ..
            } if text == "Nested child answer." && parent == "call-spawn"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "call-child-ls"
                    && tool_call.parent_tool_call_id.as_deref() == Some("call-spawn")
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::UserMessage { text, .. } if text == "Explore the child thread"
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallStarted { tool_call }
                | AgentEvent::ToolCallCompleted { tool_call }
                if matches!(
                    tool_call.name.as_str(),
                    "wait_agent" | "list_agents" | "close_agent"
                )
        )));
    }

    #[test]
    fn parse_file_skips_bad_line_and_continues() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/session_source/testdata/codex/unreadable.jsonl");
        let events = parse_file(&path).expect("parse_file");
        assert_eq!(user_texts(&events), ["Recovered after bad line."]);
    }
}
