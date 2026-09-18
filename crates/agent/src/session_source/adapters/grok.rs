use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde_json::{Map, Value};

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentResult, AgentTool, AgentToolKind, AgentToolParams,
    AgentToolResult, AgentToolStatus, UserMessageKind, GROK_CHROME_SUBAGENT_NAME,
};
use crate::map::subagent::is_xai_session_notification_method;
use crate::map::{
    classify_tool, extract_aspect_ratio, extract_background, extract_command, extract_cwd,
    extract_image_prompt, extract_image_size, extract_path, extract_query, extract_reference_paths,
    extract_skill, extract_subagent, extract_subagent_prompt, extract_task_id, extract_url,
    plan_document_from_tool_input, plan_from_tool_input, ClassifiedTool,
};
use crate::providers::grok::{looks_like_grok_goal_child, map_xai_ext_events};
use crate::session_source::paths;
use crate::session_source::{HostId, HostSessionRef, SessionSource, TuiResumePlan};

const PROVIDER: &str = "grok";

pub struct GrokSource;

impl SessionSource for GrokSource {
    fn provider_id(&self) -> &'static str {
        HostId::Grok.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::grok_data_roots()
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
        if let Some(path) = source_path {
            let updates = if path.is_file() {
                path.to_path_buf()
            } else if path.is_dir() {
                path.join("updates.jsonl")
            } else {
                return self.parse(native_id);
            };
            if updates.is_file() {
                return Ok(parse_updates(&updates, native_id));
            }
        }
        self.parse(native_id)
    }

    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan> {
        Some(HostId::Grok.tui_resume(native_id, cwd))
    }
}

fn list_in(roots: &[PathBuf]) -> Vec<HostSessionRef> {
    let mut rows = Vec::new();
    for root in roots {
        walk_sessions(root, |session_dir, summary, native_id, parent_native_id| {
            if let Some(row) = row_from_summary(session_dir, &summary, &native_id, parent_native_id)
            {
                rows.push(row);
            }
        });
    }
    rows
}

fn parse_in(roots: &[PathBuf], native_id: &str) -> Vec<AgentEventEnvelope> {
    if native_id.is_empty() {
        return Vec::new();
    }
    for root in roots {
        let mut found = None;
        walk_sessions(root, |session_dir, _, id, _| {
            if found.is_none() && id == native_id {
                found = Some(session_dir.to_path_buf());
            }
        });
        if let Some(dir) = found {
            return parse_updates(&dir.join("updates.jsonl"), native_id);
        }
    }
    Vec::new()
}

fn walk_sessions(root: &Path, mut visit: impl FnMut(&Path, Value, String, Option<String>)) {
    let Ok(cwd_dirs) = fs::read_dir(root) else {
        return;
    };
    for cwd_entry in cwd_dirs.flatten() {
        let cwd_dir = cwd_entry.path();
        if !cwd_dir.is_dir() || cwd_dir.is_symlink() {
            continue;
        }
        let Ok(sessions) = fs::read_dir(&cwd_dir) else {
            continue;
        };
        for session_entry in sessions.flatten() {
            let session_dir = session_entry.path();
            if !session_dir.is_dir() || session_dir.is_symlink() {
                continue;
            }
            if session_dir
                .file_name()
                .is_some_and(|name| name == "subagents")
            {
                continue;
            }
            let Some((summary, native_id)) = load_session_summary(&session_dir) else {
                continue;
            };
            let parent_native_id = parent_from_summary(&summary);
            visit(&session_dir, summary, native_id.clone(), parent_native_id);
            let Ok(children) = fs::read_dir(session_dir.join("subagents")) else {
                continue;
            };
            for child in children.flatten() {
                let child_dir = child.path();
                if !child_dir.is_dir() || child_dir.is_symlink() {
                    continue;
                }
                let Some((child_summary, child_id)) = load_session_summary(&child_dir) else {
                    continue;
                };
                visit(&child_dir, child_summary, child_id, Some(native_id.clone()));
            }
        }
    }
}

fn load_session_summary(session_dir: &Path) -> Option<(Value, String)> {
    let raw = fs::read_to_string(session_dir.join("summary.json")).ok()?;
    let summary: Value = serde_json::from_str(&raw).ok()?;
    let folder_id = session_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();
    let native_id = summary
        .get("info")
        .and_then(|info| info.get("id"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .unwrap_or(&folder_id)
        .to_string();
    if native_id.is_empty() {
        return None;
    }
    Some((summary, native_id))
}

fn parent_from_summary(summary: &Value) -> Option<String> {
    first_nonempty_str(summary, &["parent_session_id", "parentSessionId"]).or_else(|| {
        summary
            .get("info")
            .and_then(|info| first_nonempty_str(info, &["parent_session_id", "parentSessionId"]))
    })
}

fn session_kind(summary: &Value) -> Option<String> {
    first_nonempty_str(summary, &["session_kind", "sessionKind"]).or_else(|| {
        summary
            .get("info")
            .and_then(|info| first_nonempty_str(info, &["session_kind", "sessionKind"]))
    })
}

fn row_from_summary(
    session_dir: &Path,
    summary: &Value,
    native_id: &str,
    parent_native_id: Option<String>,
) -> Option<HostSessionRef> {
    let info = summary.get("info");
    let cwd = info
        .and_then(|info| info.get("cwd"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|cwd| !cwd.is_empty())
        .map(str::to_string)
        .or_else(|| {
            session_dir.parent().and_then(|parent| {
                parent
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(percent_decode)
            })
        })
        .unwrap_or_default();
    let title = first_nonempty_str(summary, &["generated_title", "session_summary"])
        .or_else(|| {
            info.and_then(|info| first_nonempty_str(info, &["generated_title", "session_summary"]))
        })
        .unwrap_or_else(|| native_id.to_string());
    let created = parse_time(summary.get("created_at"))
        .or_else(|| info.and_then(|info| parse_time(info.get("created_at"))))
        .or_else(|| file_mtime(&session_dir.join("summary.json")))
        .unwrap_or_else(Utc::now);
    let updated = parse_time(summary.get("updated_at"))
        .or_else(|| parse_time(summary.get("last_active_at")))
        .or_else(|| info.and_then(|info| parse_time(info.get("updated_at"))))
        .unwrap_or(created);
    let model = first_nonempty_str(summary, &["current_model_id"])
        .or_else(|| info.and_then(|info| first_nonempty_str(info, &["current_model_id"])));
    Some(HostSessionRef {
        key: HostSessionRef::key_for(PROVIDER, native_id),
        provider_id: PROVIDER.to_string(),
        native_id: native_id.to_string(),
        title,
        project_name: project_name(&cwd),
        cwd,
        started_at: created,
        updated_at: updated,
        // `num_messages` counts ACP updates; enrich fills visible user + assistant text.
        message_count: None,
        byte_size: None,
        model,
        source_path: session_dir.to_string_lossy().into_owned(),
        parent_native_id,
    })
}

fn parse_updates(path: &Path, native_id: &str) -> Vec<AgentEventEnvelope> {
    parse_updates_with(path, native_id, true)
}

fn parse_updates_with(
    path: &Path,
    native_id: &str,
    ingest_children: bool,
) -> Vec<AgentEventEnvelope> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    let mut open: Option<OpenText> = None;
    let mut tools: HashMap<String, TrackedTool> = HashMap::new();
    let mut chrome_tools: HashMap<String, AgentTool> = HashMap::new();
    let mut grok_goal = None;
    let mut grok_workflow = None;
    let mut last_ts = None;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let method = record.get("method").and_then(Value::as_str).unwrap_or("");
        if !is_grok_session_update_method(method) {
            continue;
        }
        let ts = parse_time(record.get("timestamp"));
        if ts.is_some() {
            last_ts = ts;
        }
        let from = events.len();
        let params = record.get("params").cloned().unwrap_or(Value::Null);
        let update = params.get("update").cloned().unwrap_or(Value::Null);
        let session_update = update
            .get("sessionUpdate")
            .and_then(Value::as_str)
            .unwrap_or("");
        let turn_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or(native_id)
            .to_string();
        match session_update {
            "user_message_chunk" => {
                append_open(
                    &mut open,
                    &mut events,
                    OpenKind::User,
                    &turn_id,
                    &text_from_value(update.get("content").unwrap_or(&Value::Null)),
                );
            }
            "agent_message_chunk" => {
                append_open(
                    &mut open,
                    &mut events,
                    OpenKind::Assistant,
                    &turn_id,
                    &text_from_value(update.get("content").unwrap_or(&Value::Null)),
                );
            }
            "agent_thought_chunk" => {
                append_open(
                    &mut open,
                    &mut events,
                    OpenKind::Thinking,
                    &turn_id,
                    &text_from_value(update.get("content").unwrap_or(&Value::Null)),
                );
            }
            "tool_call" | "tool_call_update" => {
                flush_open(&mut open, &mut events);
                if let Some(mut event) =
                    map_tool_update(session_update == "tool_call_update", &update, &mut tools)
                {
                    if let Some(tool) = tool_from_event_mut(&mut event) {
                        stamp_host_grok_chrome_tool(tool, &chrome_tools);
                        chrome_tools.insert(tool.tool_call_id.clone(), tool.clone());
                    }
                    events.push(wrap(Some(turn_id), event));
                }
            }
            "plan" => {
                flush_open(&mut open, &mut events);
                let entries = update
                    .get("entries")
                    .cloned()
                    .unwrap_or(Value::Array(vec![]));
                events.push(wrap(
                    Some(turn_id),
                    AgentEvent::PlanUpdated {
                        plan: serde_json::json!({ "entries": entries }),
                    },
                ));
            }
            other if is_chrome_session_update(other) => {
                flush_open(&mut open, &mut events);
                for event in map_xai_ext_events(
                    &mut chrome_tools,
                    &mut grok_goal,
                    &mut grok_workflow,
                    chrome_method(method),
                    &params,
                ) {
                    events.push(wrap(Some(turn_id.clone()), event));
                }
            }
            other if omit_session_update(other) => {
                flush_open(&mut open, &mut events);
            }
            other if !other.is_empty() => {
                flush_open(&mut open, &mut events);
                events.push(wrap(
                    Some(turn_id),
                    AgentEvent::Unknown {
                        event_type: other.to_string(),
                        payload: update,
                    },
                ));
            }
            _ => {}
        }
        crate::session_source::stamp_new_envelopes(&mut events, from, ts.or(last_ts));
    }
    let from = events.len();
    flush_open(&mut open, &mut events);
    crate::session_source::stamp_new_envelopes(&mut events, from, last_ts);
    if ingest_children {
        ingest_sibling_children(path, native_id, &mut events);
    }
    events
}

fn ingest_sibling_children(
    parent_updates: &Path,
    parent_id: &str,
    events: &mut Vec<AgentEventEnvelope>,
) {
    let Some(session_dir) = parent_updates.parent() else {
        return;
    };
    let Some(cwd_dir) = session_dir.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(cwd_dir) else {
        return;
    };
    let mut used = HashSet::new();
    let mut children: Vec<(PathBuf, String)> = Vec::new();
    for entry in entries.flatten() {
        let child_dir = entry.path();
        if child_dir == session_dir || !child_dir.is_dir() || child_dir.is_symlink() {
            continue;
        }
        let Some((summary, child_id)) = load_session_summary(&child_dir) else {
            continue;
        };
        if parent_from_summary(&summary).as_deref() != Some(parent_id) {
            continue;
        }
        // User forks inherit parent_session_id but are sibling chats, not spawn overlays.
        if session_kind(&summary).is_some_and(|kind| kind.eq_ignore_ascii_case("fork")) {
            continue;
        }
        let updates = child_dir.join("updates.jsonl");
        if updates.is_file() {
            children.push((updates, child_id));
        }
    }
    children.sort_by(|a, b| a.1.cmp(&b.1));
    for (updates, child_id) in children {
        let Some(parent_tool) = match_child_parent(events, &child_id, &used) else {
            continue;
        };
        used.insert(parent_tool.clone());
        let nested = parse_updates_with(&updates, &child_id, false);
        for mut event in nested {
            match &event.payload {
                AgentEvent::SessionStarted { .. } | AgentEvent::UserMessage { .. } => continue,
                _ => {}
            }
            stamp_nested(&mut event.payload, &parent_tool);
            events.push(event);
        }
    }
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
        AgentEvent::AssistantMessageDelta {
            parent_tool_call_id,
            ..
        }
        | AgentEvent::ThinkingDelta {
            parent_tool_call_id,
            ..
        } => {
            *parent_tool_call_id = Some(parent.to_string());
        }
        AgentEvent::ToolCallStarted { tool_call }
        | AgentEvent::ToolCallUpdated { tool_call }
        | AgentEvent::ToolCallCompleted { tool_call }
        | AgentEvent::ToolCallFailed { tool_call, .. } => {
            if tool_call.parent_tool_call_id.is_none() {
                tool_call.parent_tool_call_id = Some(parent.to_string());
            }
        }
        _ => {}
    }
}

fn omit_session_update(kind: &str) -> bool {
    matches!(
        kind,
        "hook_execution"
            | "turn_completed"
            | "current_mode_update"
            | "available_commands_update"
            | "available_commands"
            | "session_info_update"
            | "usage_update"
            | "config_update"
            | "background_tasks"
            | "task_backgrounded"
            | "task_completed"
            | "retry_state"
            | "session_recap"
            | "memory_flush_started"
            | "memory_flush_completed"
    )
}

fn is_chrome_session_update(kind: &str) -> bool {
    matches!(
        kind,
        "goal_updated"
            | "workflow_updated"
            | "subagent_spawned"
            | "subagent_finished"
            | "subagent_progress"
    )
}

fn is_grok_session_update_method(method: &str) -> bool {
    let method = method.strip_prefix('_').unwrap_or(method);
    matches!(
        method,
        "session/update" | "x.ai/session/update" | "x.ai/session_notification"
    )
}

fn chrome_method(method: &str) -> &str {
    if is_xai_session_notification_method(method) {
        method
    } else {
        "_x.ai/session/update"
    }
}

fn tool_from_event_mut(event: &mut AgentEvent) -> Option<&mut AgentTool> {
    match event {
        AgentEvent::ToolCallStarted { tool_call }
        | AgentEvent::ToolCallUpdated { tool_call }
        | AgentEvent::ToolCallCompleted { tool_call }
        | AgentEvent::ToolCallFailed { tool_call, .. } => Some(tool_call),
        _ => None,
    }
}

fn stamp_host_grok_chrome_tool(tool: &mut AgentTool, chrome_tools: &HashMap<String, AgentTool>) {
    if tool.name == GROK_CHROME_SUBAGENT_NAME {
        return;
    }
    let already = chrome_tools
        .get(&tool.tool_call_id)
        .is_some_and(|prev| prev.name == GROK_CHROME_SUBAGENT_NAME);
    if already || looks_like_grok_goal_child(tool) {
        tool.name = GROK_CHROME_SUBAGENT_NAME.to_string();
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum OpenKind {
    User,
    Assistant,
    Thinking,
}

struct OpenText {
    kind: OpenKind,
    turn_id: String,
    message_id: String,
    text: String,
}

fn append_open(
    open: &mut Option<OpenText>,
    events: &mut Vec<AgentEventEnvelope>,
    kind: OpenKind,
    turn_id: &str,
    text: &str,
) {
    if text.is_empty() {
        return;
    }
    if let Some(current) = open.as_mut() {
        if current.kind == kind && current.turn_id == turn_id {
            current.text.push_str(text);
            return;
        }
    }
    flush_open(open, events);
    *open = Some(OpenText {
        kind,
        turn_id: turn_id.to_string(),
        message_id: uuid::Uuid::new_v4().to_string(),
        text: text.to_string(),
    });
}

fn flush_open(open: &mut Option<OpenText>, events: &mut Vec<AgentEventEnvelope>) {
    let Some(current) = open.take() else {
        return;
    };
    if current.text.is_empty() {
        return;
    }
    let turn = Some(current.turn_id.clone());
    match current.kind {
        OpenKind::User => events.push(wrap(
            turn,
            AgentEvent::UserMessage {
                turn_id: current.turn_id,
                message_id: current.message_id,
                kind: UserMessageKind::Normal,
                text: current.text,
                attachments: Vec::new(),
            },
        )),
        OpenKind::Assistant => {
            events.push(wrap(
                turn.clone(),
                AgentEvent::AssistantMessageDelta {
                    message_id: current.message_id.clone(),
                    delta: current.text,
                    parent_tool_call_id: None,
                },
            ));
            events.push(wrap(
                turn,
                AgentEvent::AssistantMessageCompleted {
                    message_id: current.message_id,
                },
            ));
        }
        OpenKind::Thinking => {
            events.push(wrap(
                turn.clone(),
                AgentEvent::ThinkingDelta {
                    message_id: current.message_id.clone(),
                    delta: current.text,
                    parent_tool_call_id: None,
                },
            ));
            events.push(wrap(
                turn,
                AgentEvent::ThinkingCompleted {
                    message_id: current.message_id,
                },
            ));
        }
    }
}

struct TrackedTool {
    tool: AgentTool,
    input: Value,
}

fn map_tool_update(
    is_patch: bool,
    update: &Value,
    tools: &mut HashMap<String, TrackedTool>,
) -> Option<AgentEvent> {
    let tool_call_id = update
        .get("toolCallId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?
        .to_string();
    let title = update
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string);
    let prev = tools.get(&tool_call_id);
    let input = merge_json(
        prev.map(|prev| prev.input.clone()),
        update.get("rawInput").cloned(),
    )
    .unwrap_or(Value::Object(Map::new()));
    let name = tool_name(update, title.as_deref(), &input);
    let name = if name == "tool" {
        prev.map(|prev| prev.tool.name.clone()).unwrap_or(name)
    } else {
        name
    };
    let classified = classify_tool(&name, title.as_deref(), Some(&input));
    match classified {
        ClassifiedTool::Hide => return None,
        ClassifiedTool::Thinking => return None,
        ClassifiedTool::Plan => {
            return plan_from_tool_input(Some(&input)).map(|plan| AgentEvent::PlanUpdated { plan });
        }
        ClassifiedTool::PlanDocument | ClassifiedTool::Call(_) => {}
    }
    let kind = match classified {
        ClassifiedTool::Call(kind) => kind,
        ClassifiedTool::PlanDocument => AgentToolKind::PlanDocument,
        _ => AgentToolKind::Other,
    };
    let params = tool_params(kind, &input);
    let kind = match &params {
        AgentToolParams::Other { .. } => AgentToolKind::Other,
        _ => kind,
    };
    let status =
        parse_tool_status(update.get("status").and_then(Value::as_str)).unwrap_or(if is_patch {
            prev.map(|prev| prev.tool.status)
                .unwrap_or(AgentToolStatus::Running)
        } else {
            AgentToolStatus::Running
        });
    let result = if matches!(status, AgentToolStatus::Completed | AgentToolStatus::Failed) {
        tool_result(kind, &input, update)
    } else {
        None
    };
    let tool = AgentTool {
        tool_call_id: tool_call_id.clone(),
        parent_tool_call_id: prev.and_then(|prev| prev.tool.parent_tool_call_id.clone()),
        name,
        title: title.or_else(|| prev.and_then(|prev| prev.tool.title.clone())),
        kind,
        status,
        params,
        result: result.or_else(|| prev.and_then(|prev| prev.tool.result.clone())),
    };
    tools.insert(
        tool_call_id,
        TrackedTool {
            tool: tool.clone(),
            input,
        },
    );
    Some(match (is_patch, status) {
        (_, AgentToolStatus::Failed) => AgentEvent::ToolCallFailed {
            error: None,
            tool_call: tool,
        },
        (_, AgentToolStatus::Completed) => AgentEvent::ToolCallCompleted { tool_call: tool },
        (false, _) => AgentEvent::ToolCallStarted { tool_call: tool },
        (true, _) => AgentEvent::ToolCallUpdated { tool_call: tool },
    })
}

fn tool_name(update: &Value, title: Option<&str>, input: &Value) -> String {
    update
        .pointer("/_meta/x.ai/tool/name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .or(title)
        .or_else(|| input.get("name").and_then(Value::as_str).map(str::trim))
        .filter(|name| !name.is_empty())
        .unwrap_or("tool")
        .to_string()
}

fn parse_tool_status(status: Option<&str>) -> Option<AgentToolStatus> {
    Some(match status?.trim().to_ascii_lowercase().as_str() {
        "completed" | "complete" | "success" => AgentToolStatus::Completed,
        "failed" | "error" | "cancelled" | "canceled" => AgentToolStatus::Failed,
        "pending" => AgentToolStatus::Pending,
        "in_progress" | "running" => AgentToolStatus::Running,
        _ => return None,
    })
}

fn tool_result(kind: AgentToolKind, input: &Value, update: &Value) -> Option<AgentToolResult> {
    let content = update
        .get("content")
        .cloned()
        .or_else(|| update.get("rawOutput").cloned())
        .unwrap_or(Value::Null);
    let text = text_from_value(&content);
    if kind == AgentToolKind::Read {
        if let Some(path) = extract_path(input) {
            return Some(AgentToolResult::FileContent { path, text });
        }
    }
    if kind == AgentToolKind::Execute {
        return Some(AgentToolResult::Execute {
            output: text,
            exit_code: None,
        });
    }
    if text.is_empty() {
        Some(AgentToolResult::Empty)
    } else {
        Some(AgentToolResult::Text { text })
    }
}

fn tool_params(kind: AgentToolKind, input: &Value) -> AgentToolParams {
    match kind {
        AgentToolKind::Read => match extract_path(input) {
            Some(path) => AgentToolParams::Read {
                path,
                offset: json_i64(input, &["offset", "start_line"]),
                limit: json_i64(input, &["limit", "count", "num_lines"]),
            },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Edit => match extract_path(input) {
            Some(path) => AgentToolParams::Edit { path },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Delete => match extract_path(input) {
            Some(path) => AgentToolParams::Delete { path },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Move => {
            let from = crate::map::extract::first_string(input, &["from", "source", "old_path"])
                .or_else(|| extract_path(input));
            let to = crate::map::extract::first_string(input, &["to", "destination", "new_path"]);
            match (from, to) {
                (Some(from), Some(to)) => AgentToolParams::Move { from, to },
                _ => AgentToolParams::Other {
                    value: input.clone(),
                },
            }
        }
        AgentToolKind::Search => match extract_query(input) {
            Some(query) => AgentToolParams::Search {
                glob: crate::map::extract::first_string(input, &["glob"])
                    .filter(|glob| extract_query(input).as_ref() != Some(glob)),
                path: extract_path(input),
                query,
            },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::WebSearch => AgentToolParams::WebSearch {
            query: extract_query(input).unwrap_or_default(),
        },
        AgentToolKind::Execute => match extract_command(input) {
            Some(command) => AgentToolParams::Execute {
                cwd: extract_cwd(input),
                background: extract_background(input),
                task_id: extract_task_id(input),
                command,
            },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Fetch => match extract_url(input) {
            Some(url) => AgentToolParams::Fetch { url },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Skill => match extract_skill(input) {
            Some(skill) => AgentToolParams::Skill { skill },
            None => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::Subagent => {
            let (description, agent_type) = extract_subagent(input).unwrap_or_else(|| {
                (
                    crate::map::extract::first_string(input, &["description", "prompt", "text"])
                        .unwrap_or_default(),
                    crate::map::extract::first_string(input, &["subagent_type", "agent_type"]),
                )
            });
            if description.is_empty() {
                AgentToolParams::Other {
                    value: input.clone(),
                }
            } else {
                let prompt = extract_subagent_prompt(input, &description);
                AgentToolParams::Subagent {
                    description,
                    agent_type,
                    task_id: extract_task_id(input),
                    prompt,
                }
            }
        }
        AgentToolKind::McpList => AgentToolParams::McpList {
            server: crate::map::extract::first_string(input, &["server", "serverName"]),
        },
        AgentToolKind::McpCall => AgentToolParams::McpCall {
            server: crate::map::extract::first_string(input, &["server", "serverName"]),
            tool: crate::map::extract::first_string(input, &["tool", "toolName", "name"]),
        },
        AgentToolKind::ImageGen => AgentToolParams::ImageGen {
            prompt: extract_image_prompt(input).unwrap_or_default(),
            aspect_ratio: extract_aspect_ratio(input),
            size: extract_image_size(input),
            path: crate::map::extract::first_string(
                input,
                &["filename", "path", "file", "file_path", "output_path"],
            ),
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

fn merge_json(prev: Option<Value>, incoming: Option<Value>) -> Option<Value> {
    match (prev, incoming) {
        (Some(Value::Object(mut prev)), Some(Value::Object(incoming))) => {
            for (key, value) in incoming {
                prev.insert(key, value);
            }
            Some(Value::Object(prev))
        }
        (_, Some(incoming)) => Some(incoming),
        (prev, None) => prev,
    }
}

fn text_from_value(value: &Value) -> String {
    let mut out = String::new();
    collect_text(value, &mut out);
    out
}

fn collect_text(value: &Value, out: &mut String) {
    match value {
        Value::String(text) => out.push_str(text),
        Value::Array(items) => {
            for item in items {
                collect_text(item, out);
            }
        }
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                out.push_str(text);
            } else if let Some(nested) = map.get("content") {
                collect_text(nested, out);
            }
        }
        _ => {}
    }
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

fn first_nonempty_str(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = value
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

fn parse_time(value: Option<&Value>) -> Option<DateTime<Utc>> {
    let value = value?;
    if let Some(text) = value.as_str() {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(text) {
            return Some(parsed.with_timezone(&Utc));
        }
        if let Ok(seconds) = text.trim().parse::<i64>() {
            return DateTime::from_timestamp(seconds, 0);
        }
    }
    value
        .as_i64()
        .or_else(|| value.as_f64().map(|number| number as i64))
        .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
}

fn json_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    fn from_map(map: &Map<String, Value>, keys: &[&str]) -> Option<i64> {
        for key in keys {
            match map.get(*key) {
                Some(Value::Number(number)) => return number.as_i64(),
                Some(Value::String(text)) => return text.trim().parse().ok(),
                _ => {}
            }
        }
        None
    }
    let map = value.as_object()?;
    if let Some(number) = from_map(map, keys) {
        return Some(number);
    }
    for wrapper in ["args", "parameters", "input"] {
        if let Some(nested) = map.get(wrapper).and_then(Value::as_object) {
            if let Some(number) = from_map(nested, keys) {
                return Some(number);
            }
        }
    }
    None
}

fn file_mtime(path: &Path) -> Option<DateTime<Utc>> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified))
}

fn project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
        .to_string()
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (from_hex(bytes[index + 1]), from_hex(bytes[index + 2]))
            {
                out.push((high << 4) | low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(byte: u8) -> Option<u8> {
    Some(match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        b'A'..=b'F' => byte - b'A' + 10,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const MAIN_ID: &str = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const SUMMARY_ONLY_ID: &str = "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee";
    const SUBAGENT_ID: &str = "bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff";
    const SIBLING_ID: &str = "eeeeeeee-eeee-4ccc-8ddd-ffffffffffff";
    const FORK_ID: &str = "ffffffff-ffff-4ccc-8ddd-ffffffffffff";

    fn write_home(home: &Path) -> PathBuf {
        let encoded = "%2Ftmp%2Fdemo";
        let sessions = home.join(".grok").join("sessions").join(encoded);
        let main = sessions.join(MAIN_ID);
        fs::create_dir_all(&main).unwrap();
        fs::write(
            main.join("summary.json"),
            include_str!("../testdata/grok/summary.json"),
        )
        .unwrap();
        fs::write(
            main.join("updates.jsonl"),
            include_str!("../testdata/grok/updates.jsonl"),
        )
        .unwrap();
        fs::write(
            main.join("chat_history.jsonl"),
            include_str!("../testdata/grok/chat_history.jsonl"),
        )
        .unwrap();
        let nested = main.join("subagents").join(SUBAGENT_ID);
        fs::create_dir_all(&nested).unwrap();
        fs::write(
            nested.join("summary.json"),
            include_str!("../testdata/grok/subagent-summary.json"),
        )
        .unwrap();
        let sibling = sessions.join(SIBLING_ID);
        fs::create_dir_all(&sibling).unwrap();
        fs::write(
            sibling.join("summary.json"),
            include_str!("../testdata/grok/sibling-summary.json"),
        )
        .unwrap();
        fs::write(
            sibling.join("updates.jsonl"),
            include_str!("../testdata/grok/sibling-updates.jsonl"),
        )
        .unwrap();
        let fork = sessions.join(FORK_ID);
        fs::create_dir_all(&fork).unwrap();
        fs::write(
            fork.join("summary.json"),
            include_str!("../testdata/grok/fork-summary.json"),
        )
        .unwrap();
        fs::write(
            fork.join("updates.jsonl"),
            include_str!("../testdata/grok/fork-updates.jsonl"),
        )
        .unwrap();
        let summary_only = sessions.join(SUMMARY_ONLY_ID);
        fs::create_dir_all(&summary_only).unwrap();
        fs::write(
            summary_only.join("summary.json"),
            include_str!("../testdata/grok/summary-only.json"),
        )
        .unwrap();
        let no_summary = sessions.join("dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee");
        fs::create_dir_all(&no_summary).unwrap();
        fs::write(no_summary.join("updates.jsonl"), "{}\n").unwrap();
        home.join(".grok").join("sessions")
    }

    #[test]
    fn missing_root_lists_empty() {
        assert!(list_in(&[PathBuf::from("/no/such/grok-sessions")]).is_empty());
    }

    #[test]
    fn parse_missing_is_ok_empty() {
        assert!(parse_in(&[PathBuf::from("/no/such/grok-sessions")], "missing").is_empty());
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        assert!(parse_in(&[root], "missing").is_empty());
    }

    #[test]
    fn list_reads_summary_and_marks_nested_subagents() {
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        let rows = list_in(&[root]);
        let ids: Vec<_> = rows.iter().map(|row| row.native_id.as_str()).collect();
        assert!(ids.contains(&MAIN_ID));
        assert!(ids.contains(&SUMMARY_ONLY_ID));
        assert!(ids.contains(&SUBAGENT_ID));
        assert!(ids.contains(&SIBLING_ID));
        assert!(ids.contains(&FORK_ID));
        assert!(!ids.contains(&"dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee"));
        let main = rows.iter().find(|row| row.native_id == MAIN_ID).unwrap();
        assert_eq!(main.provider_id, "grok");
        assert_eq!(main.key, format!("grok:{MAIN_ID}"));
        assert!(main.parent_native_id.is_none());
        let child = rows
            .iter()
            .find(|row| row.native_id == SUBAGENT_ID)
            .unwrap();
        assert_eq!(child.parent_native_id.as_deref(), Some(MAIN_ID));
        let sibling = rows.iter().find(|row| row.native_id == SIBLING_ID).unwrap();
        assert_eq!(sibling.parent_native_id.as_deref(), Some(MAIN_ID));
        let fork = rows.iter().find(|row| row.native_id == FORK_ID).unwrap();
        assert_eq!(fork.parent_native_id.as_deref(), Some(MAIN_ID));
        assert_eq!(main.title, "Read the demo readme");
        assert_eq!(main.cwd, "/tmp/demo");
        assert_eq!(main.project_name, "demo");
        assert_eq!(main.model.as_deref(), Some("grok-4.6"));
        assert_eq!(main.message_count, None);
    }

    #[test]
    fn parse_merges_chunks_maps_tools_and_skips_chat_history() {
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        let events = parse_in(&[root.clone()], MAIN_ID);
        assert!(!events.is_empty());

        let user = events.iter().find_map(|event| match &event.payload {
            AgentEvent::UserMessage { text, .. } => Some(text.as_str()),
            _ => None,
        });
        assert_eq!(user, Some("Hello world"));

        let thinking = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ThinkingDelta { delta, .. } => Some(delta.as_str()),
            _ => None,
        });
        assert_eq!(thinking, Some("thinking now"));
        assert!(events
            .iter()
            .any(|event| matches!(event.payload, AgentEvent::ThinkingCompleted { .. })));

        let assistant = events.iter().find_map(|event| match &event.payload {
            AgentEvent::AssistantMessageDelta { delta, .. } => Some(delta.as_str()),
            _ => None,
        });
        assert_eq!(assistant, Some("I will read it."));

        let started = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let started = started.expect("tool start");
        assert_eq!(started.tool_call_id, "call-1");
        assert_eq!(started.kind, AgentToolKind::Read);
        match &started.params {
            AgentToolParams::Read { path, limit, .. } => {
                assert_eq!(path, "/tmp/demo/README.md");
                assert_eq!(*limit, Some(20));
            }
            other => panic!("expected read params, got {other:?}"),
        }

        let completed = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallCompleted { tool_call } => Some(tool_call),
            _ => None,
        });
        let completed = completed.expect("tool complete");
        match &completed.result {
            Some(AgentToolResult::FileContent { text, .. }) => assert_eq!(text, "# Demo"),
            Some(AgentToolResult::Text { text }) => assert_eq!(text, "# Demo"),
            other => panic!("expected file/text result, got {other:?}"),
        }

        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::Unknown {
                event_type,
                ..
            } if event_type == "not_a_real_update"
        )));
        let blob = serde_json::to_string(&events).unwrap();
        assert!(!blob.contains("CHAT_HISTORY_ONLY_PHRASE"));
        assert!(parse_in(&[root], SUMMARY_ONLY_ID).is_empty());
    }

    #[test]
    fn parse_maps_goal_deep_research_and_chrome_children() {
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        let events = parse_in(&[root], MAIN_ID);

        let goal = events.iter().rev().find_map(|event| match &event.payload {
            AgentEvent::GrokGoalUpdated { goal } => goal.as_ref(),
            _ => None,
        });
        let goal = goal.expect("grok goal");
        assert_eq!(goal.goal_id, "goal-1");
        assert_eq!(goal.objective, "Ship the demo");
        assert!(!goal.planning);
        assert_eq!(goal.tokens_used, 99);
        assert_eq!(goal.children.len(), 1);
        assert_eq!(goal.children[0].id, "sa-plan");
        assert_eq!(goal.children[0].label, "goal plan writer");

        let workflow = events.iter().find_map(|event| match &event.payload {
            AgentEvent::GrokWorkflowUpdated { workflow } => workflow.as_ref(),
            _ => None,
        });
        let workflow = workflow.expect("grok workflow");
        assert_eq!(workflow.name, "deep-research");
        assert_eq!(workflow.objective, "Compare DBs");
        assert_eq!(workflow.phases.len(), 2);

        let chrome = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call } if tool_call.tool_call_id == "sa-plan" => {
                Some(tool_call)
            }
            _ => None,
        });
        let chrome = chrome.expect("goal plan writer");
        assert_eq!(chrome.name, GROK_CHROME_SUBAGENT_NAME);
        assert_eq!(chrome.kind, AgentToolKind::Subagent);

        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::Unknown { event_type, .. }
                if event_type == "goal_updated"
                    || event_type == "workflow_updated"
                    || event_type == "subagent_spawned"
                    || event_type == "background_tasks"
                    || event_type == "plan"
        )));
        assert!(events
            .iter()
            .any(|event| matches!(&event.payload, AgentEvent::PlanUpdated { .. })));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::AssistantMessageDelta {
                delta,
                parent_tool_call_id: Some(parent),
                ..
            } if delta == "Sibling found README." && parent == SIBLING_ID
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "sib-read"
                    && tool_call.parent_tool_call_id.as_deref() == Some(SIBLING_ID)
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::UserMessage { text, .. } if text == "Explore sibling files"
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::AssistantMessageDelta { delta, .. } if delta == "Fork only."
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::UserMessage { text, .. } if text == "Forked from parent"
        )));
    }
}
