use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use serde_json::{Map, Value};

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentResult, AgentTool, AgentToolKind, AgentToolParams,
    AgentToolResult, AgentToolStatus, UserMessageKind,
};
use crate::map::{
    classify_tool, extract_aspect_ratio, extract_background, extract_command, extract_cwd,
    extract_image_prompt, extract_image_size, extract_path, extract_query, extract_reference_paths,
    extract_skill, extract_subagent, extract_subagent_prompt, extract_task_id, extract_url,
    plan_document_from_tool_input, plan_from_tool_input, ClassifiedTool,
};
use crate::session_source::paths;
use crate::session_source::{HostId, HostSessionRef, SessionSource, TuiResumePlan};

const PROVIDER: &str = "cursor";

pub struct CursorSource;

impl SessionSource for CursorSource {
    fn provider_id(&self) -> &'static str {
        HostId::Cursor.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::cursor_data_roots()
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
            Some(path) if path.is_file() => Ok(parse_transcript(path, native_id)),
            _ => self.parse(native_id),
        }
    }

    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan> {
        Some(HostId::Cursor.tui_resume(native_id, cwd))
    }
}

fn list_in(roots: &[PathBuf]) -> Vec<HostSessionRef> {
    let mut rows = Vec::new();
    for root in roots {
        walk_transcripts(root, |jsonl, native_id, slug, parent_native_id| {
            let Some(peek) = peek_transcript(jsonl) else {
                return;
            };
            let cwd = decode_slug(slug);
            let mtime = file_mtime(jsonl).unwrap_or_else(Utc::now);
            rows.push(HostSessionRef {
                key: HostSessionRef::key_for(PROVIDER, native_id),
                provider_id: PROVIDER.to_string(),
                native_id: native_id.to_string(),
                title: peek
                    .title
                    .filter(|title| !title.is_empty())
                    .unwrap_or_else(|| native_id.to_string()),
                project_name: project_name(&cwd),
                cwd,
                started_at: peek.started_at.unwrap_or(mtime),
                updated_at: mtime,
                message_count: None,
                byte_size: None,
                model: None,
                source_path: jsonl.to_string_lossy().into_owned(),
                parent_native_id: parent_native_id.map(str::to_string),
            });
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
        walk_transcripts(root, |jsonl, id, _slug, _parent| {
            if found.is_none() && id == native_id {
                found = Some(jsonl.to_path_buf());
            }
        });
        if let Some(path) = found {
            return parse_transcript(&path, native_id);
        }
    }
    Vec::new()
}

fn walk_transcripts(root: &Path, mut visit: impl FnMut(&Path, &str, &str, Option<&str>)) {
    let Ok(projects) = fs::read_dir(root) else {
        return;
    };
    for project in projects.flatten() {
        let slug_dir = project.path();
        if !slug_dir.is_dir() || slug_dir.is_symlink() {
            continue;
        }
        let Some(slug) = slug_dir.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let transcripts = slug_dir.join("agent-transcripts");
        let Ok(sessions) = fs::read_dir(&transcripts) else {
            continue;
        };
        for session in sessions.flatten() {
            let session_dir = session.path();
            if !session_dir.is_dir() || session_dir.is_symlink() {
                continue;
            }
            let Some(native_id) = session_dir.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let named = session_dir.join(format!("{native_id}.jsonl"));
            let jsonl = if named.is_file() {
                named
            } else {
                match first_jsonl(&session_dir) {
                    Some(path) => path,
                    None => continue,
                }
            };
            visit(&jsonl, native_id, slug, None);
            let subagents = session_dir.join("subagents");
            let Ok(children) = fs::read_dir(&subagents) else {
                continue;
            };
            for child in children.flatten() {
                let path = child.path();
                if !path.is_file()
                    || !path
                        .extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
                {
                    continue;
                }
                let Some(child_id) = path.file_stem().and_then(|name| name.to_str()) else {
                    continue;
                };
                visit(&path, child_id, slug, Some(native_id));
            }
        }
    }
}

fn first_jsonl(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    entries.flatten().map(|entry| entry.path()).find(|path| {
        path.is_file()
            && path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
    })
}

struct TranscriptPeek {
    title: Option<String>,
    started_at: Option<DateTime<Utc>>,
}

fn peek_transcript(path: &Path) -> Option<TranscriptPeek> {
    let file = File::open(path).ok()?;
    let mut title = None;
    let mut started_at = None;
    let mut has_real = false;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if record.get("type").and_then(Value::as_str) == Some("turn_ended") {
            continue;
        }
        for part in content_parts(&record) {
            match part.get("type").and_then(Value::as_str) {
                Some("tool_use") | Some("tool_result") => has_real = true,
                Some("text") | None => {
                    if let Some(text) = part_text(part) {
                        if record.get("role").and_then(Value::as_str) == Some("user") {
                            let (stripped, timestamp) = strip_user_wrapper(&text);
                            if started_at.is_none() {
                                started_at = timestamp;
                            }
                            if title.is_none() && !stripped.is_empty() {
                                title = Some(stripped);
                            }
                            if !text.trim().is_empty() {
                                has_real = true;
                            }
                        } else if record.get("role").and_then(Value::as_str) == Some("assistant")
                            && !text.trim().is_empty()
                        {
                            has_real = true;
                        }
                    }
                }
                _ => {}
            }
        }
        if has_real && title.is_some() {
            break;
        }
    }
    has_real.then_some(TranscriptPeek { title, started_at })
}

fn parse_transcript(path: &Path, native_id: &str) -> Vec<AgentEventEnvelope> {
    let mut events = Vec::new();
    let mut tools: HashMap<String, TrackedTool> = HashMap::new();
    let mut next_tool = 0usize;
    let mut last_tool_id = None;
    ingest_snapshot_file(
        path,
        native_id,
        None,
        None,
        &mut events,
        &mut tools,
        &mut next_tool,
        &mut last_tool_id,
    );
    ingest_child_sessions(
        path,
        &mut events,
        &mut tools,
        &mut next_tool,
        &mut last_tool_id,
    );
    complete_open_tools(&mut events, &mut tools);
    events
}

#[derive(Default)]
struct PendingAssistant {
    committed: Vec<Value>,
    live: Vec<Value>,
    text: String,
}

struct TrackedTool {
    tool: AgentTool,
    turn_id: String,
}

fn ingest_snapshot_file(
    path: &Path,
    native_id: &str,
    parent_tool_call_id: Option<&str>,
    parent_turn_id: Option<&str>,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    next_tool: &mut usize,
    last_tool_id: &mut Option<String>,
) {
    let Ok(file) = File::open(path) else {
        return;
    };
    // Cursor jsonl is a snapshot log: each assistant line replaces the current
    // in-flight message. Finished tool batches are kept; a later snapshot with
    // tools only updates the live batch when names/inputs look like argument
    // streaming. The last non-empty assistant text wins. Identical user lines
    // are replays.
    let mut pending_assistant: Option<PendingAssistant> = None;
    let mut last_user_text: Option<String> = None;
    let mut turn_seq = 0u32;
    let mut turn_id = parent_turn_id
        .map(str::to_string)
        .unwrap_or_else(|| format!("{native_id}:0"));
    let nested = parent_tool_call_id.is_some();
    let mut last_ts: Option<DateTime<Utc>> = None;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if record.get("type").and_then(Value::as_str) == Some("turn_ended") {
            continue;
        }
        let from = events.len();
        let role = record.get("role").and_then(Value::as_str).unwrap_or("");
        let parts: Vec<Value> = content_parts(&record).into_iter().cloned().collect();
        match role {
            "user" => {
                let refs: Vec<&Value> = parts.iter().collect();
                for part in &refs {
                    if let Some(text) = part_text(part) {
                        if let Some(ts) = strip_user_wrapper(&text).1 {
                            last_ts = Some(ts);
                        }
                    }
                }
                let visible = visible_user_text(&refs);
                if visible.is_empty() {
                    flush_pending_assistant(
                        &mut pending_assistant,
                        &turn_id,
                        parent_tool_call_id,
                        events,
                        tools,
                        next_tool,
                        last_tool_id,
                    );
                    map_user(&refs, &turn_id, events, tools, last_tool_id.as_deref());
                    crate::session_source::stamp_new_envelopes(events, from, last_ts);
                    continue;
                }
                if last_user_text.as_deref() == Some(visible.as_str()) {
                    continue;
                }
                flush_pending_assistant(
                    &mut pending_assistant,
                    &turn_id,
                    parent_tool_call_id,
                    events,
                    tools,
                    next_tool,
                    last_tool_id,
                );
                last_user_text = Some(visible);
                if nested {
                    crate::session_source::stamp_new_envelopes(events, from, last_ts);
                    continue;
                }
                complete_open_tools(events, tools);
                turn_seq += 1;
                turn_id = format!("{native_id}:{turn_seq}");
                map_user(&refs, &turn_id, events, tools, last_tool_id.as_deref());
            }
            "assistant" => {
                let pending = pending_assistant.get_or_insert_with(PendingAssistant::default);
                absorb_assistant_snapshot(pending, parts);
            }
            _ => {}
        }
        crate::session_source::stamp_new_envelopes(events, from, last_ts);
    }
    let from = events.len();
    flush_pending_assistant(
        &mut pending_assistant,
        &turn_id,
        parent_tool_call_id,
        events,
        tools,
        next_tool,
        last_tool_id,
    );
    crate::session_source::stamp_new_envelopes(events, from, last_ts);
}

fn ingest_child_sessions(
    parent_path: &Path,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    next_tool: &mut usize,
    last_tool_id: &mut Option<String>,
) {
    let Some(session_dir) = parent_path.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(session_dir.join("subagents")) else {
        return;
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
        })
        .collect();
    files.sort();
    let mut used = HashSet::new();
    for path in files {
        let Some(child_id) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        let child_prompt = peek_transcript(&path)
            .and_then(|peek| peek.title)
            .unwrap_or_default();
        let Some(parent) = match_child_parent(tools, child_id, &child_prompt, &used) else {
            continue;
        };
        used.insert(parent.tool_call_id.clone());
        ingest_snapshot_file(
            &path,
            child_id,
            Some(&parent.tool_call_id),
            Some(&parent.turn_id),
            events,
            tools,
            next_tool,
            last_tool_id,
        );
    }
}

#[derive(Clone)]
struct ChildParent {
    tool_call_id: String,
    turn_id: String,
}

fn match_child_parent(
    tools: &HashMap<String, TrackedTool>,
    child_id: &str,
    child_prompt: &str,
    used: &HashSet<String>,
) -> Option<ChildParent> {
    let mut prompt_hits = Vec::new();
    let mut task_id_hit = None;
    let mut id_hit = None;
    for tracked in tools.values() {
        if tracked.tool.kind != AgentToolKind::Subagent {
            continue;
        }
        if used.contains(&tracked.tool.tool_call_id) {
            continue;
        }
        let parent = ChildParent {
            tool_call_id: tracked.tool.tool_call_id.clone(),
            turn_id: tracked.turn_id.clone(),
        };
        if tracked.tool.tool_call_id == child_id {
            id_hit = Some(parent.clone());
        }
        let AgentToolParams::Subagent {
            prompt,
            task_id,
            description,
            ..
        } = &tracked.tool.params
        else {
            continue;
        };
        if task_id.as_deref() == Some(child_id) {
            task_id_hit = Some(parent.clone());
        }
        let hay = prompt.as_deref().unwrap_or(description.as_str());
        if prompts_overlap(hay, child_prompt)
            || (!description.is_empty() && child_prompt.contains(description.as_str()))
        {
            prompt_hits.push(parent);
        }
    }
    if prompt_hits.len() == 1 {
        return prompt_hits.pop();
    }
    task_id_hit.or(id_hit)
}

fn utf8_prefix(text: &str, max_bytes: usize) -> &str {
    let mut end = max_bytes.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

fn prompts_overlap(left: &str, right: &str) -> bool {
    let left = left.trim();
    let right = right.trim();
    if left.is_empty() || right.is_empty() {
        return false;
    }
    let n = 80.min(left.len()).min(right.len());
    let head_l = utf8_prefix(left, n);
    let head_r = utf8_prefix(right, n);
    if head_l.is_empty() || head_r.is_empty() {
        return false;
    }
    left.starts_with(head_r)
        || right.starts_with(head_l)
        || left.contains(head_r)
        || right.contains(head_l)
}

fn absorb_assistant_snapshot(pending: &mut PendingAssistant, parts: Vec<Value>) {
    let mut tools = Vec::new();
    let mut text = String::new();
    for part in parts {
        match part.get("type").and_then(Value::as_str) {
            Some("tool_use") => {
                let name = part.get("name").and_then(Value::as_str).unwrap_or("");
                if classify_tool(name, Some(name), part.get("input")) == ClassifiedTool::Hide {
                    continue;
                }
                tools.push(part);
            }
            Some("tool_result") => {}
            _ => {
                if let Some(chunk) = part_text(&part) {
                    text.push_str(&chunk);
                }
            }
        }
    }
    if !tools.is_empty() {
        if is_stream_update(&pending.live, &tools) {
            pending.live = tools;
        } else {
            pending.committed.extend(std::mem::take(&mut pending.live));
            pending.live = tools;
        }
    }
    if !text.is_empty() {
        pending.text = text;
    }
}

fn is_stream_update(prev: &[Value], next: &[Value]) -> bool {
    if prev.is_empty() || prev.len() != next.len() {
        return false;
    }
    prev.iter().zip(next).all(|(left, right)| {
        tool_use_name(left) == tool_use_name(right)
            && values_streamable(
                left.get("input").unwrap_or(&Value::Null),
                right.get("input").unwrap_or(&Value::Null),
            )
    })
}

fn tool_use_name(part: &Value) -> &str {
    part.get("name").and_then(Value::as_str).unwrap_or("")
}

fn values_streamable(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::String(a), Value::String(b)) => a == b || a.starts_with(b) || b.starts_with(a),
        (Value::Object(a), Value::Object(b)) => {
            a.iter().all(|(key, value)| match b.get(key) {
                Some(other) => values_streamable(value, other),
                None => true,
            }) && b.iter().all(|(key, value)| match a.get(key) {
                Some(other) => values_streamable(other, value),
                None => true,
            })
        }
        (Value::Array(a), Value::Array(b)) => a
            .iter()
            .zip(b.iter())
            .all(|(left, right)| values_streamable(left, right)),
        (Value::Null, _) | (_, Value::Null) => true,
        _ => left == right,
    }
}

fn flush_pending_assistant(
    pending: &mut Option<PendingAssistant>,
    turn_id: &str,
    parent_tool_call_id: Option<&str>,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    next_tool: &mut usize,
    last_tool_id: &mut Option<String>,
) {
    let Some(pending) = pending.take() else {
        return;
    };
    let mut parts = pending.committed;
    parts.extend(pending.live);
    if !pending.text.is_empty() {
        parts.push(Value::Object({
            let mut map = Map::new();
            map.insert("type".into(), Value::String("text".into()));
            map.insert("text".into(), Value::String(pending.text));
            map
        }));
    }
    let refs: Vec<&Value> = parts.iter().collect();
    map_assistant(
        &refs,
        turn_id,
        parent_tool_call_id,
        events,
        tools,
        next_tool,
        last_tool_id,
    );
}

fn complete_open_tools(
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
) {
    for tracked in tools.values_mut() {
        if matches!(
            tracked.tool.status,
            AgentToolStatus::Pending | AgentToolStatus::Running
        ) {
            tracked.tool.status = AgentToolStatus::Completed;
            if tracked.tool.result.is_none() {
                tracked.tool.result = Some(AgentToolResult::Empty);
            }
            events.push(wrap(
                Some(tracked.turn_id.clone()),
                AgentEvent::ToolCallCompleted {
                    tool_call: tracked.tool.clone(),
                },
            ));
        }
    }
}

fn visible_user_text(parts: &[&Value]) -> String {
    let mut texts = Vec::new();
    for part in parts {
        if part.get("type").and_then(Value::as_str) == Some("tool_result") {
            continue;
        }
        if let Some(text) = part_text(part) {
            let (stripped, _) = strip_user_wrapper(&text);
            if !stripped.is_empty() {
                texts.push(stripped);
            }
        }
    }
    texts.join("\n")
}

fn map_user(
    parts: &[&Value],
    turn_id: &str,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    last_tool_id: Option<&str>,
) {
    let mut texts = Vec::new();
    for part in parts {
        match part.get("type").and_then(Value::as_str) {
            Some("tool_result") => apply_tool_result(part, turn_id, events, tools, last_tool_id),
            _ => {
                if let Some(text) = part_text(part) {
                    let (stripped, _) = strip_user_wrapper(&text);
                    if !stripped.is_empty() {
                        texts.push(stripped);
                    }
                }
            }
        }
    }
    let text = texts.join("\n");
    if text.is_empty() {
        return;
    }
    events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::UserMessage {
            turn_id: turn_id.to_string(),
            message_id: uuid::Uuid::new_v4().to_string(),
            kind: UserMessageKind::Normal,
            text,
            attachments: Vec::new(),
        },
    ));
}

fn map_assistant(
    parts: &[&Value],
    turn_id: &str,
    parent_tool_call_id: Option<&str>,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    next_tool: &mut usize,
    last_tool_id: &mut Option<String>,
) {
    let mut text = String::new();
    for part in parts {
        match part.get("type").and_then(Value::as_str) {
            Some("tool_use") => {
                flush_assistant(&mut text, turn_id, parent_tool_call_id, events);
                if let Some(event) = map_tool_use(
                    part,
                    turn_id,
                    parent_tool_call_id,
                    next_tool,
                    tools,
                    last_tool_id,
                ) {
                    events.push(wrap(Some(turn_id.to_string()), event));
                }
            }
            Some("tool_result") => {
                flush_assistant(&mut text, turn_id, parent_tool_call_id, events);
                apply_tool_result(part, turn_id, events, tools, last_tool_id.as_deref());
            }
            _ => {
                if let Some(chunk) = part_text(part) {
                    text.push_str(&chunk);
                }
            }
        }
    }
    flush_assistant(&mut text, turn_id, parent_tool_call_id, events);
}

fn flush_assistant(
    text: &mut String,
    turn_id: &str,
    parent_tool_call_id: Option<&str>,
    events: &mut Vec<AgentEventEnvelope>,
) {
    if text.is_empty() {
        return;
    }
    let message_id = uuid::Uuid::new_v4().to_string();
    events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::AssistantMessageDelta {
            message_id: message_id.clone(),
            delta: std::mem::take(text),
            parent_tool_call_id: parent_tool_call_id.map(str::to_string),
        },
    ));
    events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::AssistantMessageCompleted { message_id },
    ));
}

fn map_tool_use(
    part: &Value,
    turn_id: &str,
    parent_tool_call_id: Option<&str>,
    next_tool: &mut usize,
    tools: &mut HashMap<String, TrackedTool>,
    last_tool_id: &mut Option<String>,
) -> Option<AgentEvent> {
    let input = part
        .get("input")
        .cloned()
        .unwrap_or(Value::Object(Map::new()));
    let name = part
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("tool")
        .to_string();
    let tool_call_id = part
        .get("id")
        .or_else(|| part.get("toolUseId"))
        .or_else(|| part.get("tool_use_id"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .or_else(|| {
            crate::map::extract::first_string(&input, &["resume"])
                .filter(|resume| uuid::Uuid::parse_str(resume).is_ok())
        })
        .unwrap_or_else(|| {
            *next_tool += 1;
            format!("tool-{next_tool}")
        });
    let classified = classify_tool(&name, Some(&name), Some(&input));
    match classified {
        ClassifiedTool::Hide | ClassifiedTool::Thinking => return None,
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
    let mut params = tool_params(kind, &input);
    if kind == AgentToolKind::Subagent {
        if let AgentToolParams::Subagent { task_id, .. } = &mut params {
            if task_id.is_none() {
                if let Some(resume) = crate::map::extract::first_string(&input, &["resume"]) {
                    if uuid::Uuid::parse_str(&resume).is_ok() {
                        *task_id = Some(resume);
                    }
                }
            }
        }
    }
    let kind = match &params {
        AgentToolParams::Other { .. } => AgentToolKind::Other,
        _ => kind,
    };
    let tool = AgentTool {
        tool_call_id: tool_call_id.clone(),
        parent_tool_call_id: parent_tool_call_id.map(str::to_string),
        name,
        title: None,
        kind,
        status: AgentToolStatus::Running,
        params,
        result: None,
    };
    tools.insert(
        tool_call_id.clone(),
        TrackedTool {
            tool: tool.clone(),
            turn_id: turn_id.to_string(),
        },
    );
    *last_tool_id = Some(tool_call_id);
    Some(AgentEvent::ToolCallStarted { tool_call: tool })
}

fn apply_tool_result(
    part: &Value,
    turn_id: &str,
    events: &mut Vec<AgentEventEnvelope>,
    tools: &mut HashMap<String, TrackedTool>,
    last_tool_id: Option<&str>,
) {
    let id = part
        .get("tool_use_id")
        .or_else(|| part.get("toolUseId"))
        .or_else(|| part.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| last_tool_id.map(str::to_string));
    let Some(id) = id else {
        return;
    };
    let Some(tracked) = tools.get_mut(&id) else {
        return;
    };
    let text = part_text(part).unwrap_or_default();
    tracked.tool.status = AgentToolStatus::Completed;
    tracked.tool.result = Some(if tracked.tool.kind == AgentToolKind::Read {
        if let AgentToolParams::Read { path, .. } = &tracked.tool.params {
            AgentToolResult::FileContent {
                path: path.clone(),
                text,
            }
        } else {
            result_text(text)
        }
    } else if tracked.tool.kind == AgentToolKind::Execute {
        AgentToolResult::Execute {
            output: text,
            exit_code: None,
        }
    } else {
        result_text(text)
    });
    events.push(wrap(
        Some(turn_id.to_string()),
        AgentEvent::ToolCallCompleted {
            tool_call: tracked.tool.clone(),
        },
    ));
}

fn result_text(text: String) -> AgentToolResult {
    if text.is_empty() {
        AgentToolResult::Empty
    } else {
        AgentToolResult::Text { text }
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

fn content_parts(record: &Value) -> Vec<&Value> {
    let message = record.get("message").unwrap_or(record);
    match message.get("content") {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(other) => vec![other],
        None => Vec::new(),
    }
}

fn part_text(part: &Value) -> Option<String> {
    if let Some(text) = part.as_str() {
        return Some(text.to_string());
    }
    if let Some(text) = part.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(content) = part.get("content") {
        return match content {
            Value::String(text) => Some(text.clone()),
            Value::Array(items) => {
                let mut out = String::new();
                for item in items {
                    if let Some(text) = part_text(item) {
                        out.push_str(&text);
                    }
                }
                Some(out)
            }
            other => part_text(other),
        }
        .filter(|text| !text.is_empty());
    }
    None
}

fn strip_user_wrapper(text: &str) -> (String, Option<DateTime<Utc>>) {
    let timestamp = between(text, "<timestamp>", "</timestamp>").and_then(parse_timestamp);
    let query = between(text, "<user_query>", "</user_query>").unwrap_or(text);
    let body = between(query, "<user_request>", "</user_request>").unwrap_or(query);
    (body.trim().to_string(), timestamp)
}

fn between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let from = text.find(start)? + start.len();
    let rest = text.get(from..)?;
    let to = rest.find(end)?;
    rest.get(..to)
}

fn parse_timestamp(text: &str) -> Option<DateTime<Utc>> {
    let text = text.trim();
    if let Ok(parsed) = DateTime::parse_from_rfc3339(text) {
        return Some(parsed.with_timezone(&Utc));
    }
    if let Ok(seconds) = text.parse::<i64>() {
        return DateTime::from_timestamp(seconds, 0);
    }
    parse_cursor_clock(text)
}

/// Cursor wraps prompts as `Thursday, Sep 17, 2026, 9:55 PM (UTC+8)`.
fn parse_cursor_clock(text: &str) -> Option<DateTime<Utc>> {
    let (body, tz) = text.rsplit_once("(UTC")?;
    let offset = parse_utc_offset(tz.trim().trim_end_matches(')').trim())?;
    let body = pad_clock_hour(body.trim().trim_end_matches(',').trim());
    const FMTS: &[&str] = &[
        "%A, %b %d, %Y, %I:%M:%S %p",
        "%A, %b %d, %Y, %I:%M %p",
        "%A, %B %d, %Y, %I:%M %p",
        "%b %d, %Y, %I:%M %p",
    ];
    for fmt in FMTS {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&body, fmt) {
            return offset
                .from_local_datetime(&naive)
                .single()
                .map(|dt| dt.with_timezone(&Utc));
        }
    }
    None
}

fn pad_clock_hour(body: &str) -> String {
    let Some(idx) = body.rfind(", ") else {
        return body.to_string();
    };
    let tail = &body[idx + 2..];
    if tail.len() >= 4 && tail.as_bytes()[0].is_ascii_digit() && tail.as_bytes()[1] == b':' {
        return format!("{}0{tail}", &body[..idx + 2]);
    }
    body.to_string()
}

fn parse_utc_offset(text: &str) -> Option<FixedOffset> {
    let sign = if text.starts_with('-') { -1 } else { 1 };
    let digits: String = text.chars().filter(|ch| ch.is_ascii_digit()).collect();
    let (hours, minutes) = match digits.len() {
        1 | 2 => (digits.parse::<i32>().ok()?, 0),
        4 => (
            digits[..2].parse::<i32>().ok()?,
            digits[2..].parse::<i32>().ok()?,
        ),
        _ => return None,
    };
    FixedOffset::east_opt(sign * (hours * 3600 + minutes * 60))
}

fn decode_slug(slug: &str) -> String {
    let decoded = slug.replace('-', "/");
    if decoded.is_empty() || decoded.starts_with('/') {
        return decoded;
    }
    // Cursor stores `/Users/foo` as `Users-foo` (leading slash stripped).
    format!("/{decoded}")
}

fn project_name(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
        .to_string()
}

fn file_mtime(path: &Path) -> Option<DateTime<Utc>> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified))
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

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const SESSION_ID: &str = "dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee";
    const SHELL_ID: &str = "eeeeeeee-eeee-4ccc-8ddd-ffffffffffff";

    fn write_home(home: &Path) -> PathBuf {
        let projects = home.join(".cursor").join("projects");
        let session_dir = projects
            .join("tmp-demo")
            .join("agent-transcripts")
            .join(SESSION_ID);
        fs::create_dir_all(&session_dir).unwrap();
        fs::write(
            session_dir.join(format!("{SESSION_ID}.jsonl")),
            include_str!("../testdata/cursor/session.jsonl"),
        )
        .unwrap();
        let shell_dir = projects
            .join("tmp-demo")
            .join("agent-transcripts")
            .join(SHELL_ID);
        fs::create_dir_all(&shell_dir).unwrap();
        fs::write(
            shell_dir.join(format!("{SHELL_ID}.jsonl")),
            include_str!("../testdata/cursor/turn_ended_only.jsonl"),
        )
        .unwrap();
        projects
    }

    #[test]
    fn missing_root_lists_empty() {
        assert!(list_in(&[PathBuf::from("/no/such/cursor-projects")]).is_empty());
    }

    #[test]
    fn parse_timestamp_reads_cursor_wrapper_clock() {
        let parsed = super::parse_timestamp("Thursday, Sep 17, 2026, 9:55 PM (UTC+8)")
            .expect("cursor clock");
        assert_eq!(parsed.to_rfc3339(), "2026-09-17T13:55:00+00:00");
        let unix = super::parse_timestamp("1711972800").expect("unix");
        assert_eq!(unix.timestamp(), 1_711_972_800);
    }

    #[test]
    fn parse_missing_is_ok_empty() {
        assert!(parse_in(&[PathBuf::from("/no/such/cursor-projects")], "missing").is_empty());
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        assert!(parse_in(&[root], "missing").is_empty());
    }

    #[test]
    fn list_in_skips_turn_ended_only_and_decodes_slug() {
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        let rows = list_in(&[root]);
        let ids: Vec<_> = rows.iter().map(|row| row.native_id.as_str()).collect();
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0], SESSION_ID);
        let row = rows.first().unwrap();
        assert_eq!(row.provider_id, "cursor");
        assert_eq!(row.key, format!("cursor:{SESSION_ID}"));
        assert_eq!(row.title, "List the files");
        assert_eq!(row.cwd, "/tmp/demo");
        assert_eq!(row.project_name, "demo");
        assert_eq!(
            row.started_at,
            DateTime::parse_from_rfc3339("2024-01-02T03:04:05Z")
                .unwrap()
                .with_timezone(&Utc)
        );
    }

    #[test]
    fn decode_slug_restores_unix_root() {
        assert_eq!(
            decode_slug("Users-aarynlu-OpenSource-atmos"),
            "/Users/aarynlu/OpenSource/atmos"
        );
        assert_eq!(decode_slug("tmp-demo"), "/tmp/demo");
        assert_eq!(decode_slug("private-tmp"), "/private/tmp");
        assert_eq!(decode_slug("-Users-foo"), "/Users/foo");
        assert_eq!(decode_slug(""), "");
    }

    #[test]
    fn parse_strips_user_wrapper_and_maps_tools() {
        let tmp = tempfile::tempdir().unwrap();
        let root = write_home(tmp.path());
        let events = parse_in(&[root], SESSION_ID);
        let user = events.iter().find_map(|event| match &event.payload {
            AgentEvent::UserMessage { text, .. } => Some(text.as_str()),
            _ => None,
        });
        assert_eq!(user, Some("List the files"));
        assert!(events.iter().all(|event| match &event.payload {
            AgentEvent::UserMessage { text, .. } => !text.contains("<user_query>"),
            _ => true,
        }));

        let assistant: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::AssistantMessageDelta { delta, .. } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(assistant, ["I'll list them.", "Found one file."]);

        let started = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call } => Some(tool_call),
            _ => None,
        });
        let started = started.expect("glob start");
        assert_eq!(started.name, "Glob");
        assert_eq!(started.kind, AgentToolKind::Search);
        match &started.params {
            AgentToolParams::Search { query, path, .. } => {
                assert_eq!(query, "*.rs");
                assert_eq!(path.as_deref(), Some("/tmp/demo"));
            }
            other => panic!("expected search params, got {other:?}"),
        }

        let completed = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallCompleted { tool_call } => Some(tool_call),
            _ => None,
        });
        let completed = completed.expect("glob complete");
        match &completed.result {
            Some(AgentToolResult::Text { text }) => assert_eq!(text, "src/main.rs"),
            other => panic!("expected text result, got {other:?}"),
        }
    }

    #[test]
    fn parse_keeps_last_assistant_snapshot_and_drops_duplicate_users() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("snapshots.jsonl");
        fs::write(&path, include_str!("../testdata/cursor/snapshots.jsonl")).unwrap();
        let events = parse_transcript(&path, "snap");
        let users: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::UserMessage { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(users, ["Hello", "Next"]);

        let assistant: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::AssistantMessageDelta { delta, .. } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(assistant, ["Hello there, done.", "Next reply"]);
        let started: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::ToolCallStarted { tool_call } => Some(tool_call.name.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(started, ["Read", "Grep"]);

        let user_turns: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::UserMessage { turn_id, .. } => Some(turn_id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(user_turns.len(), 2);
        assert_ne!(user_turns[0], user_turns[1]);
        let assistant_turns: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::AssistantMessageDelta { .. } => event.turn_id.as_deref(),
                _ => None,
            })
            .collect();
        assert_eq!(assistant_turns, user_turns);
    }

    #[test]
    fn parse_attaches_subagent_child_under_task() {
        const PARENT: &str = "11111111-1111-4111-8111-111111111111";
        const CHILD: &str = "22222222-2222-4222-8222-222222222222";
        let tmp = tempfile::tempdir().unwrap();
        let session_dir = tmp
            .path()
            .join("projects")
            .join("tmp-demo")
            .join("agent-transcripts")
            .join(PARENT);
        fs::create_dir_all(session_dir.join("subagents")).unwrap();
        fs::write(
            session_dir.join(format!("{PARENT}.jsonl")),
            include_str!("../testdata/cursor/task_parent.jsonl"),
        )
        .unwrap();
        fs::write(
            session_dir.join("subagents").join(format!("{CHILD}.jsonl")),
            include_str!("../testdata/cursor/task_child.jsonl"),
        )
        .unwrap();

        let rows = list_in(&[tmp.path().join("projects")]);
        assert_eq!(rows.len(), 2);
        let child = rows
            .iter()
            .find(|row| row.native_id == CHILD)
            .expect("child row");
        assert_eq!(child.parent_native_id.as_deref(), Some(PARENT));

        let events = parse_transcript(&session_dir.join(format!("{PARENT}.jsonl")), PARENT);
        let users: Vec<_> = events
            .iter()
            .filter_map(|event| match &event.payload {
                AgentEvent::UserMessage { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(users, ["Delegate this"]);

        let task = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call }
                if tool_call.kind == AgentToolKind::Subagent =>
            {
                Some(tool_call)
            }
            _ => None,
        });
        let task = task.expect("task start");
        let nested_read = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallStarted { tool_call }
                if tool_call.name == "Read" && tool_call.parent_tool_call_id.is_some() =>
            {
                Some(tool_call)
            }
            _ => None,
        });
        let nested_read = nested_read.expect("nested read");
        assert_eq!(
            nested_read.parent_tool_call_id.as_deref(),
            Some(task.tool_call_id.as_str())
        );

        let nested_text = events.iter().find_map(|event| match &event.payload {
            AgentEvent::AssistantMessageDelta {
                delta,
                parent_tool_call_id: Some(parent),
                ..
            } if parent == &task.tool_call_id => Some(delta.as_str()),
            _ => None,
        });
        assert_eq!(nested_text, Some("Child finished."));
    }

    #[test]
    fn prompts_overlap_chinese_prefix_stays_on_char_boundary() {
        let text = "完成上一个 Agent 没完成的，上下文如下：\nAPP-075 已经按规格落地，并在你这台机器的真实 CLI home 上扫过一遍。";
        assert!(text.len() > 80);
        assert!(!text.is_char_boundary(80));
        assert!(prompts_overlap(text, text));
        let shorter: String = text.chars().take(20).collect();
        assert!(prompts_overlap(text, &shorter));
        assert!(!prompts_overlap(text, "unrelated child prompt"));
    }
}
