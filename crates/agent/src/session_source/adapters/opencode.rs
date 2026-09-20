use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Utc};
use rusqlite::{Connection, OpenFlags};
use serde_json::Value;

use crate::contract::{
    AgentEvent, AgentEventEnvelope, AgentPermissionOption, AgentPermissionRequest, AgentResult,
    AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus, TextKind,
    UserMessageKind,
};
use crate::map::{
    ask_questions_from_input, classify_tool, extract_aspect_ratio, extract_background,
    extract_command, extract_cwd, extract_image_prompt, extract_image_size, extract_links,
    extract_path, extract_query, extract_reference_paths, extract_search_hits, extract_skill,
    extract_subagent, extract_subagent_prompt, extract_task_id, extract_url, is_ask_user_tool,
    plan_document_from_tool_input, plan_from_tool_input_or_stub, strip_subagent_footers,
    thinking_text, ClassifiedTool,
};
use crate::session_source::paths;
use crate::session_source::{
    finished_text_part, HostId, HostSessionRef, SessionSource, TuiResumePlan,
};

const DB_NAMES: [&str; 2] = ["opencode.db", "opencode-next.db"];
const LIST_SQL: &str =
    "SELECT id, directory, title, time_created, time_updated, parent_id, model FROM session";

pub struct OpenCodeSource;

impl SessionSource for OpenCodeSource {
    fn provider_id(&self) -> &'static str {
        HostId::OpenCode.as_str()
    }

    fn data_roots(&self) -> Vec<PathBuf> {
        paths::opencode_data_roots()
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
            Some(path) if path.is_file() => Ok(parse_db(path, native_id).unwrap_or_default()),
            _ => self.parse(native_id),
        }
    }

    fn tui_resume(&self, native_id: &str, cwd: &Path) -> Option<TuiResumePlan> {
        Some(HostId::OpenCode.tui_resume(native_id, cwd))
    }
}

fn list_in(roots: &[PathBuf]) -> Vec<HostSessionRef> {
    let mut sessions = Vec::new();
    let mut seen = HashSet::new();
    for root in roots {
        for db in sqlite_files(root) {
            for session in list_db(&db) {
                if seen.insert(session.native_id.clone()) {
                    sessions.push(session);
                }
            }
        }
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
        for db in sqlite_files(root) {
            if let Some(events) = parse_db(&db, native_id) {
                return events;
            }
        }
    }
    Vec::new()
}

fn sqlite_files(root: &Path) -> Vec<PathBuf> {
    DB_NAMES
        .iter()
        .map(|name| root.join(name))
        .filter(|path| path.is_file())
        .collect()
}

fn list_db(path: &Path) -> Vec<HostSessionRef> {
    let Some(conn) = open_readonly(path) else {
        return Vec::new();
    };
    let stats = load_session_stats(&conn);
    let mut stmt = match conn.prepare(LIST_SQL) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([], |row| {
        Ok(SessionRow {
            id: row.get::<_, String>(0)?,
            directory: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            title: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            time_created: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            time_updated: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            parent_id: row.get::<_, Option<String>>(5)?,
            model: row.get::<_, Option<String>>(6)?,
        })
    }) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|row| row.ok())
        .filter(|row| !row.id.is_empty())
        .map(|row| {
            let stat = stats.get(&row.id).copied();
            row.into_ref(path, stat)
        })
        .collect()
}

fn load_session_stats(conn: &Connection) -> HashMap<String, (u32, u64)> {
    let mut map: HashMap<String, (u32, u64)> = HashMap::new();
    let text_sql = r#"
        SELECT m.session_id,
               SUM(
                 CASE
                   WHEN lower(coalesce(json_extract(m.data, '$.role'), '')) IN ('user', 'assistant')
                    AND EXISTS (
                      SELECT 1 FROM part p
                      WHERE p.message_id = m.id
                        AND json_extract(p.data, '$.type') = 'text'
                        AND length(trim(coalesce(json_extract(p.data, '$.text'), ''))) > 0
                    )
                   THEN 1 ELSE 0
                 END
               ),
               SUM(length(m.data))
        FROM message m
        GROUP BY m.session_id
        "#;
    let role_sql = r#"
        SELECT session_id,
               SUM(
                 CASE
                   WHEN lower(coalesce(json_extract(data, '$.role'), '')) IN ('user', 'assistant')
                   THEN 1 ELSE 0
                 END
               ),
               SUM(length(data))
        FROM message
        GROUP BY session_id
        "#;
    let counts_sql = if conn.prepare(text_sql).is_ok() {
        text_sql
    } else {
        role_sql
    };
    if let Ok(mut stmt) = conn.prepare(counts_sql) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1).unwrap_or(0).max(0) as u32,
                row.get::<_, i64>(2).unwrap_or(0).max(0) as u64,
            ))
        }) {
            for (id, count, bytes) in rows.flatten() {
                if !id.is_empty() {
                    map.insert(id, (count, bytes));
                }
            }
        }
    }
    if let Ok(mut stmt) =
        conn.prepare("SELECT session_id, SUM(length(data)) FROM part GROUP BY session_id")
    {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1).unwrap_or(0).max(0) as u64,
            ))
        }) {
            for (id, bytes) in rows.flatten() {
                map.entry(id)
                    .and_modify(|stat| stat.1 = stat.1.saturating_add(bytes))
                    .or_insert((0, bytes));
            }
        }
    }
    map
}

fn parse_db(path: &Path, native_id: &str) -> Option<Vec<AgentEventEnvelope>> {
    let conn = open_readonly(path)?;
    let exists = conn
        .prepare("SELECT 1 FROM session WHERE id = ?1")
        .and_then(|mut stmt| stmt.exists([native_id]))
        .unwrap_or(false);
    if !exists {
        return None;
    }
    Some(parse_session(&conn, native_id))
}

fn parse_session(conn: &Connection, native_id: &str) -> Vec<AgentEventEnvelope> {
    let mut events = vec![wrap(
        None,
        AgentEvent::SessionStarted {
            persistence_handle: Some(native_id.to_string()),
        },
    )];
    map_session_body(conn, native_id, false, &mut events);
    let mut visited = HashSet::from([native_id.to_string()]);
    ingest_child_sessions(conn, native_id, &mut events, &mut visited);
    events
}

fn map_session_body(
    conn: &Connection,
    native_id: &str,
    nested: bool,
    events: &mut Vec<AgentEventEnvelope>,
) {
    let messages = load_messages(conn, native_id);
    let mut parts_by_msg: HashMap<String, Vec<Value>> = HashMap::new();
    for (message_id, data) in load_parts(conn, native_id) {
        parts_by_msg.entry(message_id).or_default().push(data);
    }
    for message in messages {
        let parts = parts_by_msg.remove(&message.id).unwrap_or_default();
        map_message(events, &message, parts, nested);
    }
}

fn ingest_child_sessions(
    conn: &Connection,
    parent_id: &str,
    events: &mut Vec<AgentEventEnvelope>,
    visited: &mut HashSet<String>,
) {
    let mut used = HashSet::new();
    for child_id in load_child_ids(conn, parent_id) {
        if !visited.insert(child_id.clone()) {
            continue;
        }
        let Some(parent_tool) = match_child_parent(events, &child_id, &used) else {
            continue;
        };
        used.insert(parent_tool.clone());
        let start = events.len();
        map_session_body(conn, &child_id, true, events);
        for event in events[start..].iter_mut() {
            stamp_nested(&mut event.payload, &parent_tool);
        }
        ingest_child_sessions(conn, &child_id, events, visited);
    }
}

fn load_child_ids(conn: &Connection, parent_id: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT id FROM session WHERE parent_id = ?1 AND TRIM(id) != '' ORDER BY time_created ASC, id ASC",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([parent_id], |row| row.get::<_, String>(0)) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|row| row.ok())
        .filter(|id| !id.is_empty())
        .collect()
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

struct SessionRow {
    id: String,
    directory: String,
    title: String,
    time_created: i64,
    time_updated: i64,
    parent_id: Option<String>,
    model: Option<String>,
}

impl SessionRow {
    fn into_ref(self, db: &Path, stats: Option<(u32, u64)>) -> HostSessionRef {
        let cwd = self.directory;
        let project_name = project_name_of(&cwd);
        let title = if self.title.trim().is_empty() {
            project_name.clone()
        } else {
            self.title
        };
        let started_at = datetime_from_millis(self.time_created);
        let updated_at = datetime_from_millis(self.time_updated).max(started_at);
        HostSessionRef {
            key: HostSessionRef::key_for(HostId::OpenCode.as_str(), &self.id),
            provider_id: HostId::OpenCode.as_str().to_string(),
            native_id: self.id,
            title,
            cwd,
            project_name,
            started_at,
            updated_at,
            message_count: stats.map(|stat| stat.0),
            byte_size: stats.map(|stat| stat.1),
            model: model_label(self.model.as_deref()),
            source_path: db.to_string_lossy().into_owned(),
            parent_native_id: self
                .parent_id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToOwned::to_owned),
        }
    }
}

struct MessageRow {
    id: String,
    role: String,
    time_created: i64,
    time_updated: i64,
}

fn load_messages(conn: &Connection, native_id: &str) -> Vec<MessageRow> {
    let mut stmt = match conn.prepare(
        "SELECT id, time_created, time_updated, data FROM message WHERE session_id = ?1 ORDER BY time_created ASC, id ASC",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([native_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            row.get::<_, Option<i64>>(2)?.unwrap_or(0),
            row.get::<_, String>(3)?,
        ))
    }) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|row| row.ok())
        .filter_map(|(id, time_created, time_updated, data)| {
            let value: Value = serde_json::from_str(&data).ok()?;
            let role = value
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            Some(MessageRow {
                id,
                role,
                time_created,
                time_updated,
            })
        })
        .collect()
}

fn load_parts(conn: &Connection, native_id: &str) -> Vec<(String, Value)> {
    let mut stmt = match conn.prepare(
        "SELECT message_id, data FROM part WHERE session_id = ?1 ORDER BY time_created ASC, id ASC",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([native_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(rows) => rows,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|row| row.ok())
        .filter_map(|(message_id, data)| {
            let value: Value = serde_json::from_str(&data).ok()?;
            Some((message_id, value))
        })
        .collect()
}

fn map_message(
    events: &mut Vec<AgentEventEnvelope>,
    message: &MessageRow,
    parts: Vec<Value>,
    nested: bool,
) {
    let role = message.role.to_ascii_lowercase();
    let turn_id = Some(message.id.clone());
    if role == "user" {
        let text = concat_text_parts(&parts);
        let from = events.len();
        if !nested && !text.is_empty() {
            events.push(wrap(
                turn_id.clone(),
                AgentEvent::UserMessage {
                    turn_id: message.id.clone(),
                    message_id: message.id.clone(),
                    kind: UserMessageKind::Normal,
                    text,
                    attachments: Vec::new(),
                },
            ));
        }
        for (index, part) in parts.into_iter().enumerate() {
            if part_type(&part) == "text" {
                continue;
            }
            map_part(events, turn_id.clone(), &message.id, index as u32, part);
        }
        crate::session_source::stamp_new_envelopes(
            events,
            from,
            Some(datetime_from_millis(message.time_created)),
        );
        return;
    }
    let from = events.len();
    for (index, part) in parts.into_iter().enumerate() {
        map_part(events, turn_id.clone(), &message.id, index as u32, part);
    }
    crate::session_source::stamp_new_envelopes(
        events,
        from,
        Some(datetime_from_millis(
            message.time_updated.max(message.time_created),
        )),
    );
}

fn map_part(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    message_id: &str,
    index: u32,
    part: Value,
) {
    match part_type(&part) {
        // A message can hold several text parts, so the part's position in the
        // message is what keeps them apart.
        "text" => {
            let text = part.get("text").and_then(Value::as_str).unwrap_or("");
            let text = strip_subagent_footers(text);
            if text.is_empty() {
                return;
            }
            push_text_part(events, turn_id, message_id, index, TextKind::Answer, &text);
        }
        "reasoning" | "thinking" => {
            let text = part.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                return;
            }
            push_text_part(events, turn_id, message_id, index, TextKind::Thinking, text);
        }
        "tool" => map_tool_part(events, turn_id, part),
        "patch" => map_patch_part(events, turn_id, &part),
        "step-start" | "step-finish" | "file" | "snapshot" | "" => {}
        other => events.push(wrap(
            turn_id,
            AgentEvent::Unknown {
                event_type: other.to_string(),
                payload: part,
            },
        )),
    }
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

fn map_tool_part(events: &mut Vec<AgentEventEnvelope>, turn_id: Option<String>, part: Value) {
    let name = part
        .get("tool")
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let call_id = part
        .get("callID")
        .or_else(|| part.get("callId"))
        .or_else(|| part.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();
    let state = part.get("state").cloned().unwrap_or(Value::Null);
    let title = state.get("title").and_then(Value::as_str);
    let input = state.get("input").cloned().unwrap_or(Value::Null);
    let output = state.get("output").cloned();
    let mut status = state.get("status").and_then(Value::as_str).unwrap_or("");
    if status.is_empty() && output.is_some() {
        status = "completed";
    }
    if is_ask_user_tool(&name) {
        map_question_part(events, turn_id, &call_id, &input, output.as_ref());
        return;
    }
    let session_id = state
        .get("metadata")
        .and_then(|metadata| {
            metadata
                .get("sessionId")
                .or_else(|| metadata.get("session_id"))
        })
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string);
    push_tool(
        events,
        turn_id,
        &call_id,
        &name,
        title,
        &input,
        output.as_ref(),
        status,
        session_id,
    );
}

fn map_question_part(
    events: &mut Vec<AgentEventEnvelope>,
    turn_id: Option<String>,
    call_id: &str,
    input: &Value,
    output: Option<&Value>,
) {
    let questions = ask_questions_from_input(input);
    if questions.is_empty() {
        return;
    }
    let description = questions
        .iter()
        .map(|question| question.prompt.as_str())
        .collect::<Vec<_>>()
        .join(" · ");
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
        vec![AgentPermissionOption {
            option_id: "reject_once".into(),
            name: "Reject".into(),
            kind: "reject".into(),
        }]
    };
    events.push(wrap(
        turn_id.clone(),
        AgentEvent::PermissionRequested {
            request: AgentPermissionRequest {
                request_id: call_id.to_string(),
                tool: "question".into(),
                description,
                content_markdown: None,
                options,
                questions,
                plan_todos: Vec::new(),
            },
        },
    ));
    if output.is_some() {
        events.push(wrap(
            turn_id,
            AgentEvent::PermissionResolved {
                request_id: call_id.to_string(),
                option_id: value_text(output),
            },
        ));
    }
}

fn map_patch_part(events: &mut Vec<AgentEventEnvelope>, turn_id: Option<String>, part: &Value) {
    let hash = part.get("hash").and_then(Value::as_str).unwrap_or("patch");
    let files = part.get("files").and_then(Value::as_array);
    let Some(files) = files else {
        return;
    };
    for (index, file) in files.iter().enumerate() {
        let Some(path) = file.as_str().map(str::trim).filter(|path| !path.is_empty()) else {
            continue;
        };
        let call_id = format!("{hash}-{index}");
        let input = serde_json::json!({ "path": path });
        push_tool(
            events,
            turn_id.clone(),
            &call_id,
            "edit",
            None,
            &input,
            None,
            "completed",
            None,
        );
    }
}

fn concat_text_parts(parts: &[Value]) -> String {
    parts
        .iter()
        .filter(|part| part_type(part) == "text")
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect()
}

fn part_type(part: &Value) -> &str {
    part.get("type").and_then(Value::as_str).unwrap_or("")
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
    session_id: Option<String>,
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
            let title = match &params {
                AgentToolParams::PlanDocument { name, overview, .. } => {
                    name.clone().or_else(|| overview.clone())
                }
                _ => title.map(str::to_string),
            };
            let status = tool_status(status_raw);
            events.push(wrap(
                turn_id,
                tool_payload(
                    status,
                    AgentTool {
                        tool_call_id: call_id.to_string(),
                        parent_tool_call_id: None,
                        name: name.to_string(),
                        title,
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
                    *task_id = session_id
                        .clone()
                        .or_else(|| output.and_then(extract_task_id))
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
            .map(|query| AgentToolParams::Search {
                path: extract_path(input),
                glob: json_string(input, &["glob"])
                    .filter(|glob| extract_query(input).as_ref() != Some(glob)),
                query,
            })
            .unwrap_or_else(other),
        AgentToolKind::WebSearch => AgentToolParams::WebSearch {
            query: extract_query(input).unwrap_or_default(),
        },
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
                    json_string(input, &["description", "prompt", "text"]).unwrap_or_default(),
                    json_string(input, &["subagent_type", "agent_type"]),
                )
            });
            if description.is_empty() {
                return other();
            }
            let prompt = extract_subagent_prompt(input, &description);
            AgentToolParams::Subagent {
                description,
                agent_type,
                task_id: extract_task_id(input),
                prompt,
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
            exit_code: json_i64(output, &["exit", "exit_code", "exitCode"]).map(|n| n as i32),
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

fn open_readonly(path: &Path) -> Option<Connection> {
    let uri_flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI;
    let conn = sqlite_readonly_uri(path)
        .and_then(|uri| Connection::open_with_flags(uri, uri_flags).ok())
        .or_else(|| Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok())?;
    let _ = conn.busy_timeout(Duration::from_millis(250));
    let _ = conn.pragma_update(None, "query_only", true);
    Some(conn)
}

fn sqlite_readonly_uri(path: &Path) -> Option<String> {
    let raw = path.to_str()?;
    let mut encoded = String::from("file:");
    for ch in raw.chars() {
        match ch {
            '%' => encoded.push_str("%25"),
            '?' => encoded.push_str("%3F"),
            '#' => encoded.push_str("%23"),
            _ => encoded.push(ch),
        }
    }
    encoded.push_str("?mode=ro");
    Some(encoded)
}

fn model_label(raw: Option<&str>) -> Option<String> {
    let raw = raw.map(str::trim).filter(|text| !text.is_empty())?;
    if let Ok(value) = serde_json::from_str::<Value>(raw) {
        return value
            .get("id")
            .or_else(|| value.get("modelID"))
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    Some(raw.to_string())
}

fn project_name_of(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(cwd)
        .to_string()
}

fn datetime_from_millis(ms: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp_millis(ms).unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
}

fn wrap(turn_id: Option<String>, payload: AgentEvent) -> AgentEventEnvelope {
    AgentEventEnvelope::new(turn_id, payload)
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
    use rusqlite::params;
    use std::fs;

    const FIXTURE: &str = include_str!("../testdata/opencode/fixture.json");

    #[test]
    fn unit_struct_and_missing_paths() {
        assert_eq!(std::mem::size_of::<OpenCodeSource>(), 0);
        assert_eq!(OpenCodeSource.provider_id(), "opencode");
        let missing = PathBuf::from("/no/such/opencode-home");
        assert!(list_in(std::slice::from_ref(&missing)).is_empty());
        assert!(parse_in(&[missing], "missing").is_empty());
        assert!(OpenCodeSource.parse("missing").unwrap().is_empty());
    }

    #[test]
    fn list_marks_child_sessions_and_does_not_need_part_table() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let conn = Connection::open(root.join("opencode.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY,
                directory TEXT,
                title TEXT,
                time_created INTEGER,
                time_updated INTEGER,
                parent_id TEXT,
                model TEXT
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session (id, directory, title, time_created, time_updated, parent_id, model)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "ses_top",
                "/tmp/fixture-proj",
                "Fixture session",
                1_700_000_000_000i64,
                1_700_000_005_000i64,
                None::<String>,
                r#"{"id":"big-pickle","providerID":"opencode"}"#
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session (id, directory, title, time_created, time_updated, parent_id, model)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "ses_child",
                "/tmp/fixture-proj",
                "Child session",
                1_700_000_002_000i64,
                1_700_000_004_000i64,
                Some("ses_top"),
                None::<String>
            ],
        )
        .unwrap();
        drop(conn);

        let listed = list_in(&[root.to_path_buf()]);
        assert_eq!(listed.len(), 2);
        let top = listed
            .iter()
            .find(|row| row.native_id == "ses_top")
            .unwrap();
        let child = listed
            .iter()
            .find(|row| row.native_id == "ses_child")
            .unwrap();
        assert_eq!(top.key, "opencode:ses_top");
        assert!(top.parent_native_id.is_none());
        assert_eq!(child.parent_native_id.as_deref(), Some("ses_top"));
        assert_eq!(top.title, "Fixture session");
        assert_eq!(top.cwd, "/tmp/fixture-proj");
        assert_eq!(top.project_name, "fixture-proj");
        assert_eq!(top.model.as_deref(), Some("big-pickle"));
        assert_eq!(top.started_at.timestamp_millis(), 1_700_000_000_000);
        assert_eq!(top.updated_at.timestamp_millis(), 1_700_000_005_000);
        assert_eq!(top.message_count, None);
    }

    #[test]
    fn list_degrades_on_corrupt_db_and_scans_next_channel() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("opencode.db"), b"not sqlite").unwrap();
        assert!(list_in(&[tmp.path().to_path_buf()]).is_empty());

        let conn = Connection::open(tmp.path().join("opencode-next.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY,
                directory TEXT,
                title TEXT,
                time_created INTEGER,
                time_updated INTEGER,
                parent_id TEXT,
                model TEXT
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO session (id, directory, title, time_created, time_updated, parent_id, model)
             VALUES ('ses_next', '/tmp/next', 'Next', 1, 2, NULL, 'plain-model')",
            [],
        )
        .unwrap();
        drop(conn);

        let listed = list_in(&[tmp.path().to_path_buf()]);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].native_id, "ses_next");
        assert_eq!(listed[0].model.as_deref(), Some("plain-model"));
    }

    #[test]
    fn parse_maps_text_reasoning_tool_and_omits_chrome() {
        let tmp = tempfile::tempdir().unwrap();
        write_fixture_db(tmp.path());
        let listed = list_in(&[tmp.path().to_path_buf()]);
        let top = listed
            .iter()
            .find(|row| row.native_id == "ses_top")
            .unwrap();
        assert_eq!(top.message_count, Some(2));
        let events = parse_in(&[tmp.path().to_path_buf()], "ses_top");
        assert!(matches!(
            events[0].payload,
            AgentEvent::SessionStarted {
                persistence_handle: Some(ref id)
            } if id == "ses_top"
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
        assert!(events
            .iter()
            .any(|event| matches!(event.payload, AgentEvent::PartClosed { .. })));
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
        let edit = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.kind == AgentToolKind::Edit =>
            {
                Some(tool_call)
            }
            _ => None,
        });
        let edit = edit.expect("patch edit");
        assert!(matches!(
            &edit.params,
            AgentToolParams::Edit { path } if path == "/tmp/fixture-proj/README.md"
        ));
        let task = events.iter().find_map(|event| match &event.payload {
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.kind == AgentToolKind::Subagent =>
            {
                Some(tool_call)
            }
            _ => None,
        });
        let task = task.expect("task subagent");
        assert_eq!(task.tool_call_id, "call_task");
        assert!(matches!(
            &task.params,
            AgentToolParams::Subagent { task_id: Some(id), .. } if id == "ses_child"
        ));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::TextChunk {
                kind: TextKind::Answer,
                text,
                parent_part_id: Some(parent),
                ..
            } if text == "README looks good." && parent == "call_task"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::ToolCallCompleted { tool_call }
                if tool_call.tool_call_id == "call_child_read"
                    && tool_call.parent_tool_call_id.as_deref() == Some("call_task")
        )));
        assert!(!events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::UserMessage { ref text, .. } if text == "Look at README"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionRequested { request } if request.tool == "question"
        )));
        assert!(events.iter().any(|event| matches!(
            &event.payload,
            AgentEvent::PermissionResolved { request_id, .. } if request_id == "call_q"
        )));
        assert!(!events.iter().any(|event| matches!(
            event.payload,
            AgentEvent::Unknown { ref event_type, .. } if event_type.starts_with("step")
                || event_type == "patch"
                || event_type == "file"
        )));
        assert!(parse_in(&[tmp.path().to_path_buf()], "missing").is_empty());
    }

    fn write_fixture_db(root: &Path) {
        let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
        let conn = Connection::open(root.join("opencode.db")).unwrap();
        conn.execute_batch(
            "CREATE TABLE session (
                id TEXT PRIMARY KEY,
                directory TEXT,
                title TEXT,
                time_created INTEGER,
                time_updated INTEGER,
                parent_id TEXT,
                model TEXT
            );
            CREATE TABLE message (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                time_created INTEGER,
                time_updated INTEGER,
                data TEXT
            );
            CREATE TABLE part (
                id TEXT PRIMARY KEY,
                message_id TEXT,
                session_id TEXT,
                time_created INTEGER,
                time_updated INTEGER,
                data TEXT
            );",
        )
        .unwrap();
        for session in fixture["sessions"].as_array().unwrap() {
            conn.execute(
                "INSERT INTO session (id, directory, title, time_created, time_updated, parent_id, model)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    session["id"].as_str().unwrap(),
                    session["directory"].as_str().unwrap(),
                    session["title"].as_str().unwrap(),
                    session["time_created"].as_i64().unwrap(),
                    session["time_updated"].as_i64().unwrap(),
                    session["parent_id"].as_str(),
                    session["model"].as_str()
                ],
            )
            .unwrap();
        }
        for message in fixture["messages"].as_array().unwrap() {
            conn.execute(
                "INSERT INTO message (id, session_id, time_created, time_updated, data)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    message["id"].as_str().unwrap(),
                    message["session_id"].as_str().unwrap(),
                    message["time_created"].as_i64().unwrap(),
                    message["time_updated"].as_i64().unwrap(),
                    message["data"].to_string()
                ],
            )
            .unwrap();
        }
        for part in fixture["parts"].as_array().unwrap() {
            conn.execute(
                "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    part["id"].as_str().unwrap(),
                    part["message_id"].as_str().unwrap(),
                    part["session_id"].as_str().unwrap(),
                    part["time_created"].as_i64().unwrap(),
                    part["time_updated"].as_i64().unwrap(),
                    part["data"].to_string()
                ],
            )
            .unwrap();
        }
    }
}
