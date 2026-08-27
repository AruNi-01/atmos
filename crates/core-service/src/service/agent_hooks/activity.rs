//! Fine-grained Agent Observer activity (turns, tools, todos, children).
//!
//! Coarse `idle` / `running` / `permission_request` stays on the session map.
//! This module is the only writer of turn history.

use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    extract_child_agent_id, is_child_start_event, is_child_stop_event, AgentHookEvent,
    AgentHookState, AgentHooksService, AgentToolType, AtmosContext,
};

const TURNS_MAX: usize = 50;
const TOOLS_PER_TURN: usize = 32;
const RECENT_TOOLS_CHILD: usize = 8;
const DETAIL_CHARS: usize = 120;
const PROMPT_CHARS: usize = 240;
const TODO_WIRE: usize = 40;
const RUN_GAP: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentToolLine {
    pub name: String,
    pub detail: String,
    pub state: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    pub repeat: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTodoItem {
    pub content: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentChildActivity {
    pub child_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub state: AgentHookState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_tool: Option<AgentToolLine>,
    pub recent_tools: Vec<AgentToolLine>,
    pub started_at: String,
    pub last_event_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTurn {
    pub turn_id: u32,
    pub prompt: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub tools: Vec<AgentToolLine>,
    pub todos: Vec<AgentTodoItem>,
    pub spawned_child_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentActivity {
    pub session_id: String,
    pub tool: AgentToolType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side_chat_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_pane_id: Option<String>,
    pub last_state: AgentHookState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_tool: Option<AgentToolLine>,
    pub todos: Vec<AgentTodoItem>,
    pub children: Vec<AgentChildActivity>,
    pub turns: Vec<AgentTurn>,
    pub turns_omitted: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_turn_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_file: Option<String>,
    pub started_at: String,
    pub last_event_at: String,
}

impl AgentActivity {
    fn visible_clone(&self) -> Self {
        let mut copy = self.clone();
        copy.last_event_at.clear();
        for child in &mut copy.children {
            child.last_event_at.clear();
        }
        copy
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActivityKind {
    Ignore,
    PromptSubmit,
    ToolPending,
    ToolOk,
    ToolError,
    Permission,
    CloseTurn,
    ChildStart,
    ChildStop,
}

impl AgentHooksService {
    pub fn get_all_activity(&self) -> Vec<AgentActivity> {
        self.activity.read().values().cloned().collect()
    }

    pub(super) fn observe_hook(
        &self,
        session_id: &str,
        tool: AgentToolType,
        payload: &Value,
        ctx: &AtmosContext,
    ) {
        let session = {
            let sessions = self.sessions.read();
            match sessions.get(session_id) {
                Some(s) if s.tool == tool => s.clone(),
                _ => return,
            }
        };

        let now = Utc::now().to_rfc3339();
        let kind = classify_event(payload);
        let previous = self.activity.read().get(session_id).cloned();
        if previous.as_ref().is_some_and(|p| p.tool != tool) {
            let replacement = new_activity(&session, ctx, &now);
            {
                let mut map = self.activity.write();
                map.insert(session_id.to_string(), replacement.clone());
            }
            let _ = self
                .event_tx
                .send(AgentHookEvent::ActivityUpdated(replacement.clone()));
            if kind == ActivityKind::Ignore && extract_prompt(payload).is_none() {
                return;
            }
        } else if kind == ActivityKind::Ignore && extract_prompt(payload).is_none() {
            self.touch_activity_bind(session_id, &session, ctx, &now);
            return;
        }
        if kind == ActivityKind::CloseTurn && !self.activity.read().contains_key(session_id) {
            return;
        }

        let previous = self.activity.read().get(session_id).cloned();
        let mut next = previous
            .clone()
            .unwrap_or_else(|| new_activity(&session, ctx, &now));

        if next.tool != tool {
            next = new_activity(&session, ctx, &now);
        }

        copy_bind(&mut next, &session, ctx);
        next.last_state = session.state;
        next.last_event_at = now.clone();

        let child_id = extract_child_agent_id(payload).map(str::to_string);
        apply_kind(
            &mut next,
            kind,
            payload,
            child_id.as_deref(),
            &now,
            session.state == AgentHookState::Idle,
        );

        let changed = previous
            .as_ref()
            .map(|p| p.visible_clone() != next.visible_clone())
            .unwrap_or(true);

        {
            let mut map = self.activity.write();
            map.insert(session_id.to_string(), next.clone());
        }

        if changed {
            if let Err(error) = self.event_tx.send(AgentHookEvent::ActivityUpdated(next)) {
                tracing::warn!("Failed to publish agent activity update: {}", error);
            }
        }
    }

    pub(super) fn close_activity_turn(&self, session_id: &str) {
        let now = Utc::now().to_rfc3339();
        let mut map = self.activity.write();
        let Some(activity) = map.get_mut(session_id) else {
            return;
        };
        let before = activity.visible_clone();
        close_open_turn(activity, &now);
        activity.current_tool = None;
        activity.current_turn_id = None;
        activity.last_state = AgentHookState::Idle;
        activity.last_event_at = now;
        if activity.visible_clone() != before {
            let snapshot = activity.clone();
            drop(map);
            let _ = self
                .event_tx
                .send(AgentHookEvent::ActivityUpdated(snapshot));
        }
    }

    pub(super) fn drop_activity(&self, session_ids: &[String]) {
        if session_ids.is_empty() {
            return;
        }
        {
            let mut map = self.activity.write();
            let mut any = false;
            for id in session_ids {
                if map.remove(id).is_some() {
                    any = true;
                }
            }
            if !any {
                return;
            }
        }
        let _ = self.event_tx.send(AgentHookEvent::ActivityCleared {
            session_ids: session_ids.to_vec(),
        });
    }

    pub(super) fn drop_activity_matching_pane(&self, stable_pane_id: &str) {
        if stable_pane_id.is_empty() {
            return;
        }
        let ids: Vec<String> = self
            .activity
            .read()
            .iter()
            .filter(|(id, record)| {
                *id == stable_pane_id
                    || record.session_id == stable_pane_id
                    || record.pane_id.as_deref() == Some(stable_pane_id)
                    || record.source_pane_id.as_deref() == Some(stable_pane_id)
            })
            .map(|(id, _)| id.clone())
            .collect();
        self.drop_activity(&ids);
    }

    fn touch_activity_bind(
        &self,
        session_id: &str,
        session: &super::AgentHookSession,
        ctx: &AtmosContext,
        now: &str,
    ) {
        let mut map = self.activity.write();
        let Some(activity) = map.get_mut(session_id) else {
            return;
        };
        copy_bind(activity, session, ctx);
        activity.last_state = session.state;
        activity.last_event_at = now.to_string();
    }
}

fn new_activity(session: &super::AgentHookSession, ctx: &AtmosContext, now: &str) -> AgentActivity {
    AgentActivity {
        session_id: session.session_id.clone(),
        tool: session.tool,
        context_id: session
            .context_id
            .clone()
            .or_else(|| ctx.context_id.clone()),
        pane_id: session.pane_id.clone().or_else(|| ctx.pane_id.clone()),
        project_path: session.project_path.clone(),
        terminal_kind: session.terminal_kind.clone(),
        side_chat_id: session.side_chat_id.clone(),
        source_pane_id: session.source_pane_id.clone(),
        last_state: session.state,
        current_tool: None,
        todos: Vec::new(),
        children: Vec::new(),
        turns: Vec::new(),
        turns_omitted: 0,
        current_turn_id: None,
        last_file: None,
        started_at: now.to_string(),
        last_event_at: now.to_string(),
    }
}

fn copy_bind(activity: &mut AgentActivity, session: &super::AgentHookSession, ctx: &AtmosContext) {
    activity.context_id = session
        .context_id
        .clone()
        .or_else(|| ctx.context_id.clone())
        .or_else(|| activity.context_id.clone());
    activity.pane_id = session
        .pane_id
        .clone()
        .or_else(|| ctx.pane_id.clone())
        .or_else(|| activity.pane_id.clone());
    if session.project_path.is_some() {
        activity.project_path = session.project_path.clone();
    }
    activity.terminal_kind = session
        .terminal_kind
        .clone()
        .or(activity.terminal_kind.clone());
    activity.side_chat_id = session
        .side_chat_id
        .clone()
        .or(activity.side_chat_id.clone());
    activity.source_pane_id = session
        .source_pane_id
        .clone()
        .or(activity.source_pane_id.clone());
}

fn apply_kind(
    activity: &mut AgentActivity,
    kind: ActivityKind,
    payload: &Value,
    child_id: Option<&str>,
    now: &str,
    session_idle: bool,
) {
    match kind {
        ActivityKind::Ignore => {}
        ActivityKind::PromptSubmit => {
            close_open_turn(activity, now);
            open_turn(activity, extract_prompt(payload).unwrap_or_default(), now);
            activity.current_tool = None;
        }
        ActivityKind::ToolPending => {
            if let Some(child_id) = child_id {
                upsert_child_tool(activity, child_id, payload, now, true, false);
                return;
            }
            if session_idle {
                activity.current_tool = None;
                return;
            }
            ensure_open_turn(activity, now);
            let line = tool_line(payload, activity.project_path.as_deref(), now, "pending");
            if let Some(path) = file_from_payload(payload, activity.project_path.as_deref()) {
                activity.last_file = Some(path);
            }
            activity.current_tool = Some(line);
        }
        ActivityKind::ToolOk | ActivityKind::ToolError => {
            let error = kind == ActivityKind::ToolError;
            let state = if error { "error" } else { "ok" };
            if let Some(child_id) = child_id {
                upsert_child_tool(activity, child_id, payload, now, false, error);
                return;
            }
            if session_idle {
                complete_late_tool(activity, payload, now, state);
                activity.current_tool = None;
                return;
            }
            ensure_open_turn(activity, now);
            complete_lead_tool(activity, payload, now, state);
            if is_todo_write(payload) {
                if let Some(todos) = extract_todos(payload) {
                    activity.todos = todos.clone();
                    if let Some(turn) = current_turn_mut(activity) {
                        turn.todos = todos;
                    }
                }
            }
        }
        ActivityKind::Permission => {
            if let Some(child_id) = child_id {
                if let Some(child) = activity
                    .children
                    .iter_mut()
                    .find(|c| c.child_id == child_id)
                {
                    child.state = AgentHookState::PermissionRequest;
                    child.last_event_at = now.to_string();
                }
            }
        }
        ActivityKind::CloseTurn => {
            close_open_turn(activity, now);
            activity.current_tool = None;
            activity.current_turn_id = None;
        }
        ActivityKind::ChildStart => {
            if let Some(child_id) = child_id {
                upsert_child(activity, child_id, payload, now);
                if let Some(turn) = current_turn_mut(activity) {
                    if !turn.spawned_child_ids.iter().any(|id| id == child_id) {
                        turn.spawned_child_ids.push(child_id.to_string());
                    }
                }
            }
        }
        ActivityKind::ChildStop => {
            if let Some(child_id) = child_id {
                activity.children.retain(|c| c.child_id != child_id);
            }
        }
    }
}

fn ensure_open_turn(activity: &mut AgentActivity, now: &str) {
    if activity.current_turn_id.is_none() {
        open_turn(activity, String::new(), now);
    }
}

fn open_turn(activity: &mut AgentActivity, prompt: String, now: &str) {
    let next_id = activity.turns.last().map(|t| t.turn_id + 1).unwrap_or(1);
    activity.turns.push(AgentTurn {
        turn_id: next_id,
        prompt: truncate(&prompt, PROMPT_CHARS),
        started_at: now.to_string(),
        ended_at: None,
        tools: Vec::new(),
        todos: activity.todos.clone(),
        spawned_child_ids: Vec::new(),
    });
    while activity.turns.len() > TURNS_MAX {
        activity.turns.remove(0);
        activity.turns_omitted += 1;
    }
    activity.current_turn_id = Some(next_id);
    if activity.started_at.is_empty() {
        activity.started_at = now.to_string();
    }
}

fn close_open_turn(activity: &mut AgentActivity, now: &str) {
    if let Some(turn) = current_turn_mut(activity) {
        if turn.ended_at.is_none() {
            turn.ended_at = Some(now.to_string());
        }
    }
    activity.current_turn_id = None;
    activity.current_tool = None;
}

fn current_turn_mut(activity: &mut AgentActivity) -> Option<&mut AgentTurn> {
    let id = activity.current_turn_id?;
    activity.turns.iter_mut().rev().find(|t| t.turn_id == id)
}

fn last_turn_mut(activity: &mut AgentActivity) -> Option<&mut AgentTurn> {
    activity.turns.last_mut()
}

fn complete_lead_tool(activity: &mut AgentActivity, payload: &Value, now: &str, state: &str) {
    let project_path = activity.project_path.clone();
    let mut line = activity
        .current_tool
        .take()
        .unwrap_or_else(|| tool_line(payload, project_path.as_deref(), now, state));
    line.state = state.to_string();
    line.ended_at = Some(now.to_string());
    if let Ok(start) = DateTime::parse_from_rfc3339(&line.started_at) {
        if let Ok(end) = DateTime::parse_from_rfc3339(now) {
            line.duration_ms = Some((end - start).num_milliseconds().max(0));
        }
    }
    if line.detail.is_empty() {
        line.detail = tool_detail(payload, project_path.as_deref());
    }
    if let Some(path) = file_from_payload(payload, project_path.as_deref()) {
        activity.last_file = Some(path);
    }
    if let Some(turn) = current_turn_mut(activity) {
        push_aggregated_tool(&mut turn.tools, line, now, TOOLS_PER_TURN);
    }
}

fn complete_late_tool(activity: &mut AgentActivity, payload: &Value, now: &str, state: &str) {
    let project_path = activity.project_path.clone();
    let Some(turn) = last_turn_mut(activity) else {
        return;
    };
    let name = tool_name(payload).unwrap_or_else(|| "tool".to_string());
    if let Some(existing) = turn
        .tools
        .iter_mut()
        .rev()
        .find(|t| t.name == name && t.state == "pending")
    {
        existing.state = state.to_string();
        existing.ended_at = Some(now.to_string());
        return;
    }
    let line = tool_line(payload, project_path.as_deref(), now, state);
    push_aggregated_tool(&mut turn.tools, line, now, TOOLS_PER_TURN);
}

fn push_aggregated_tool(
    tools: &mut Vec<AgentToolLine>,
    line: AgentToolLine,
    now: &str,
    cap: usize,
) {
    if let Some(last) = tools.last_mut() {
        if last.name == line.name && last.state != "pending" {
            let prev = last.ended_at.as_deref().unwrap_or(&last.started_at);
            if let (Ok(prev_end), Ok(now_ts)) = (
                DateTime::parse_from_rfc3339(prev),
                DateTime::parse_from_rfc3339(now),
            ) {
                let gap_ms = (now_ts - prev_end).num_milliseconds();
                if gap_ms >= 0 && (gap_ms as u64) <= RUN_GAP.as_millis() as u64 {
                    last.repeat = last.repeat.saturating_add(line.repeat.max(1));
                    last.detail = line.detail;
                    last.state = line.state;
                    last.ended_at = line.ended_at;
                    last.duration_ms = line.duration_ms;
                    return;
                }
            }
        }
    }
    tools.push(line);
    while tools.len() > cap {
        tools.remove(0);
    }
}

fn upsert_child(activity: &mut AgentActivity, child_id: &str, payload: &Value, now: &str) {
    if let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == child_id)
    {
        child.state = AgentHookState::Running;
        child.last_event_at = now.to_string();
        if child.name.is_none() {
            child.name = child_name(payload);
        }
        return;
    }
    activity.children.push(AgentChildActivity {
        child_id: child_id.to_string(),
        name: child_name(payload),
        state: AgentHookState::Running,
        current_tool: None,
        recent_tools: Vec::new(),
        started_at: now.to_string(),
        last_event_at: now.to_string(),
    });
}

fn upsert_child_tool(
    activity: &mut AgentActivity,
    child_id: &str,
    payload: &Value,
    now: &str,
    pending: bool,
    error: bool,
) {
    let project_path = activity.project_path.clone();
    upsert_child(activity, child_id, payload, now);
    let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == child_id)
    else {
        return;
    };
    child.state = AgentHookState::Running;
    child.last_event_at = now.to_string();
    if pending {
        child.current_tool = Some(tool_line(payload, project_path.as_deref(), now, "pending"));
        return;
    }
    let state = if error { "error" } else { "ok" };
    let mut line = child
        .current_tool
        .take()
        .unwrap_or_else(|| tool_line(payload, project_path.as_deref(), now, state));
    line.state = state.to_string();
    line.ended_at = Some(now.to_string());
    push_aggregated_tool(&mut child.recent_tools, line, now, RECENT_TOOLS_CHILD);
}

fn classify_event(payload: &Value) -> ActivityKind {
    let raw = event_name(payload);
    if is_child_start_event(&raw) {
        return ActivityKind::ChildStart;
    }
    if is_child_stop_event(&raw) {
        return ActivityKind::ChildStop;
    }
    let key = collapse_event(&raw);
    match key.as_str() {
        "userpromptsubmit" | "beforeagent" | "beforesubmitprompt" | "beforeagentstart"
        | "chatmessage" => ActivityKind::PromptSubmit,
        "preinvocation" => {
            let invocation = payload
                .get("invocationNum")
                .or_else(|| payload.get("invocation_num"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            if invocation == 0 && extract_prompt(payload).is_some() {
                ActivityKind::PromptSubmit
            } else {
                ActivityKind::Ignore
            }
        }
        "agentstart" => {
            if extract_prompt(payload).is_some() {
                ActivityKind::PromptSubmit
            } else {
                ActivityKind::Ignore
            }
        }
        "pretooluse" | "beforetool" | "toolexecutebefore" | "toolcall" | "pretoolcall" => {
            ActivityKind::ToolPending
        }
        "posttooluse" | "aftertool" | "toolexecuteafter" | "toolresult" | "posttoolcall" => {
            ActivityKind::ToolOk
        }
        "posttoolusefailure" => ActivityKind::ToolError,
        "permissionrequest" | "permissionasked" | "questionasked" => ActivityKind::Permission,
        "stop" | "stopfailure" | "sessionend" | "agentend" | "afteragent" | "sessionidle"
        | "sessionerror" | "sessionshutdown" | "onsessionend" | "afteragentresponse" => {
            ActivityKind::CloseTurn
        }
        "notification" => {
            let n = payload
                .get("notification_type")
                .or_else(|| payload.get("notificationType"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if n.contains("permission") || n.contains("elicitation") {
                ActivityKind::Permission
            } else {
                ActivityKind::Ignore
            }
        }
        _ => {
            if payload.get("type").and_then(|v| v.as_str()) == Some("tool.execute.before") {
                ActivityKind::ToolPending
            } else if payload.get("type").and_then(|v| v.as_str()) == Some("tool.execute.after") {
                ActivityKind::ToolOk
            } else {
                ActivityKind::Ignore
            }
        }
    }
}

fn event_name(payload: &Value) -> String {
    payload
        .get("hook_event_name")
        .or_else(|| payload.get("hookEventName"))
        .or_else(|| payload.get("type"))
        .or_else(|| payload.get("event"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn collapse_event(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

fn text_from_parts(parts: Option<&Value>) -> Option<String> {
    let arr = parts?.as_array()?;
    let mut out = String::new();
    for item in arr {
        if item.get("type").and_then(|v| v.as_str()) != Some("text") {
            continue;
        }
        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
            out.push_str(text);
        }
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_prompt(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &["prompt", "content", "user_prompt", "text"];
    for key in KEYS {
        if let Some(s) = payload.get(*key).and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(s) = payload.get("message").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(prompt) = payload
        .get("properties")
        .and_then(|p| p.get("prompt"))
        .and_then(|v| v.as_str())
    {
        let trimmed = prompt.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    text_from_parts(
        payload
            .get("output")
            .and_then(|output| output.get("parts"))
            .or_else(|| payload.get("parts")),
    )
}

fn tool_name(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &["tool_name", "toolName", "tool", "name"];
    for key in KEYS {
        if let Some(s) = payload.get(*key).and_then(|v| v.as_str()) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    payload
        .get("toolCall")
        .and_then(|call| call.get("name").or_else(|| call.get("tool")))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("input")
                .and_then(|input| input.get("tool").or_else(|| input.get("toolName")))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            payload
                .get("properties")
                .and_then(|p| p.get("tool").or_else(|| p.get("name")))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
}

fn tool_input<'a>(payload: &'a Value) -> Option<&'a Value> {
    payload
        .get("output")
        .and_then(|output| output.get("args").or_else(|| output.get("arguments")))
        .or_else(|| {
            payload.get("toolCall").and_then(|call| {
                call.get("args")
                    .or_else(|| call.get("arguments"))
                    .or_else(|| call.get("input"))
            })
        })
        .or_else(|| payload.get("tool_input"))
        .or_else(|| payload.get("toolInput"))
        .or_else(|| payload.get("arguments"))
        .or_else(|| payload.get("properties"))
        .or_else(|| {
            let input = payload.get("input")?;
            if input.get("tool").is_some()
                && input.get("command").is_none()
                && input.get("path").is_none()
            {
                return None;
            }
            Some(input)
        })
}

fn tool_detail(payload: &Value, project_path: Option<&str>) -> String {
    let input = tool_input(payload);
    const KEYS: &[&str] = &[
        "file_path",
        "notebook_path",
        "command",
        "pattern",
        "url",
        "query",
        "prompt",
        "path",
        "filePath",
        "target_file",
        "TargetFile",
        "CommandLine",
    ];
    if let Some(input) = input {
        for key in KEYS {
            if let Some(s) = input.get(*key).and_then(|v| v.as_str()) {
                return truncate(&relativize(s, project_path), DETAIL_CHARS);
            }
        }
    }
    for key in KEYS {
        if let Some(s) = payload.get(*key).and_then(|v| v.as_str()) {
            return truncate(&relativize(s, project_path), DETAIL_CHARS);
        }
    }
    String::new()
}

fn file_from_payload(payload: &Value, project_path: Option<&str>) -> Option<String> {
    let input = tool_input(payload);
    const KEYS: &[&str] = &[
        "file_path",
        "notebook_path",
        "path",
        "filePath",
        "target_file",
    ];
    for src in [input, Some(payload)].into_iter().flatten() {
        for key in KEYS {
            if let Some(s) = src.get(*key).and_then(|v| v.as_str()) {
                return Some(relativize(s, project_path));
            }
        }
    }
    None
}

fn tool_line(payload: &Value, project_path: Option<&str>, now: &str, state: &str) -> AgentToolLine {
    AgentToolLine {
        name: tool_name(payload).unwrap_or_else(|| "tool".to_string()),
        detail: tool_detail(payload, project_path),
        state: state.to_string(),
        started_at: now.to_string(),
        ended_at: if state == "pending" {
            None
        } else {
            Some(now.to_string())
        },
        duration_ms: None,
        repeat: 1,
    }
}

fn is_todo_write(payload: &Value) -> bool {
    tool_name(payload)
        .map(|n| n.eq_ignore_ascii_case("TodoWrite") || n.eq_ignore_ascii_case("todo_write"))
        .unwrap_or(false)
        || payload.get("todos").and_then(|v| v.as_array()).is_some()
        || tool_input(payload)
            .and_then(|i| i.get("todos"))
            .and_then(|v| v.as_array())
            .is_some()
}

fn extract_todos(payload: &Value) -> Option<Vec<AgentTodoItem>> {
    let arr = payload
        .get("todos")
        .or_else(|| tool_input(payload).and_then(|i| i.get("todos")))
        .and_then(|v| v.as_array())?;
    let mut out = Vec::new();
    for item in arr {
        let content = item
            .get("content")
            .or_else(|| item.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if content.is_empty() {
            continue;
        }
        let status = item
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("pending")
            .to_string();
        out.push(AgentTodoItem { content, status });
        if out.len() >= TODO_WIRE {
            break;
        }
    }
    Some(out)
}

fn child_name(payload: &Value) -> Option<String> {
    payload
        .get("subagent_type")
        .or_else(|| payload.get("agent_type"))
        .or_else(|| payload.get("description"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn relativize(path: &str, project_path: Option<&str>) -> String {
    let Some(root) = project_path.filter(|p| !p.is_empty()) else {
        return path.to_string();
    };
    let trimmed_root = root.trim_end_matches('/');
    if let Some(rest) = path.strip_prefix(trimmed_root) {
        rest.trim_start_matches('/').to_string()
    } else {
        path.to_string()
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_hooks::AtmosContext;

    fn pane_ctx(pane: &str) -> AtmosContext {
        AtmosContext {
            pane_id: Some(pane.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AtmosContext::default()
        }
    }

    #[test]
    fn prompt_opens_turn_tools_attach_idle_keeps_record_second_prompt_appends() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:agent");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "fix the footer",
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Edit",
                "tool_input": { "file_path": "/tmp/repo/Footer.tsx" },
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "fix the footer");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Edit");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "Footer.tsx");
        assert_eq!(activity.current_tool.as_ref().unwrap().state, "pending");

        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_input": { "file_path": "/tmp/repo/Footer.tsx" },
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "Stop",
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert!(activity.turns[0].ended_at.is_some());
        assert_eq!(activity.turns[0].tools[0].name, "Edit");
        assert_eq!(activity.turns[0].tools[0].state, "ok");
        assert!(activity.current_tool.is_none());
        assert_eq!(activity.last_state, AgentHookState::Idle);

        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "also add tests",
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 2);
        assert_eq!(activity.turns[0].prompt, "fix the footer");
        assert_eq!(activity.turns[1].prompt, "also add tests");
        assert_eq!(activity.current_turn_id, Some(2));
    }

    #[test]
    fn consecutive_bash_aggregates_repeat() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:bash");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "run",
            }),
            &ctx,
        );
        for _ in 0..3 {
            service.handle_claude_code_event(
                &serde_json::json!({
                    "hook_event_name": "PostToolUse",
                    "tool_name": "Bash",
                    "tool_input": { "command": "ls" },
                }),
                &ctx,
            );
        }
        let tools = &service.get_all_activity()[0].turns[0].tools;
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "Bash");
        assert_eq!(tools[0].repeat, 3);
    }

    #[test]
    fn idle_sweep_keeps_activity_explicit_clear_drops() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:keep");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "keep me",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        service.test_backdate_session("ws-1:keep", "2000-01-01T00:00:00+00:00");
        service.clear_idle_older_than(1);
        assert!(service.get_all_sessions().is_empty());
        assert_eq!(service.get_all_activity().len(), 1);
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "keep me");

        let cleared = service.clear_idle_sessions();
        assert!(cleared.is_empty(), "session row already swept");
        service.drop_activity(&["ws-1:keep".to_string()]);
        assert!(service.get_all_activity().is_empty());
    }

    #[test]
    fn pane_focus_style_remove_keeps_activity() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:keep2");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "stay",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert!(service.remove_session_keep_activity("ws-1:keep2"));
        assert!(service.get_all_sessions().is_empty());
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "stay");
    }

    #[test]
    fn explicit_clear_idle_drops_activity() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:clear");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "bye",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert_eq!(service.get_all_activity().len(), 1);
        let cleared = service.clear_idle_sessions();
        assert_eq!(cleared, vec!["ws-1:clear".to_string()]);
        assert!(service.get_all_activity().is_empty());
    }

    #[test]
    fn cursor_prompt_and_tool_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:cursor");
        service.handle_cursor_event(
            &serde_json::json!({
                "hook_event_name": "beforeSubmitPrompt",
                "prompt": "refactor hooks",
                "cwd": "/tmp/c",
            }),
            &ctx,
        );
        service.handle_cursor_event(
            &serde_json::json!({
                "hook_event_name": "preToolUse",
                "tool_name": "Read",
                "tool_input": { "path": "/tmp/c/a.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "refactor hooks");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn gemini_before_agent_and_before_tool() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:gemini");
        service.handle_gemini_event(
            &serde_json::json!({
                "hook_event_name": "BeforeAgent",
                "prompt": "scan repo",
                "cwd": "/tmp/g",
            }),
            &ctx,
        );
        service.handle_gemini_event(
            &serde_json::json!({
                "hook_event_name": "BeforeTool",
                "tool_name": "run_shell_command",
                "tool_input": { "command": "ls" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "scan repo");
        assert_eq!(
            activity.current_tool.as_ref().unwrap().name,
            "run_shell_command"
        );
    }

    #[test]
    fn opencode_chat_message_and_tool_execute_vendor_shape() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:oc");
        service.handle_opencode_event(
            &serde_json::json!({
                "type": "session.created",
                "cwd": "/tmp/oc",
            }),
            &ctx,
        );
        service.handle_opencode_event(
            &serde_json::json!({
                "type": "chat.message",
                "input": { "sessionID": "sess-1" },
                "output": {
                    "message": { "role": "user" },
                    "parts": [{ "type": "text", "text": "oc prompt" }]
                }
            }),
            &ctx,
        );
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "oc prompt");
        service.handle_opencode_event(
            &serde_json::json!({
                "type": "tool.execute.before",
                "input": { "tool": "bash", "sessionID": "sess-1", "callID": "c1" },
                "output": { "args": { "command": "pwd" } }
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "bash");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "pwd");
        service.handle_opencode_event(
            &serde_json::json!({
                "type": "tool.execute.after",
                "input": { "tool": "bash", "sessionID": "sess-1", "callID": "c1" },
                "output": { "args": { "command": "pwd" } }
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
        assert_eq!(activity.turns[0].tools[0].name, "bash");
        assert_eq!(activity.turns[0].tools[0].state, "ok");
        assert_eq!(activity.turns.len(), 1);
    }

    #[test]
    fn codex_prompt_opens_turn() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:codex");
        service.handle_codex_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "write tests",
                "cwd": "/tmp/x",
            }),
            &ctx,
        );
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "write tests");
    }

    #[test]
    fn pi_before_agent_start_prompt_then_agent_start_does_not_open_second_turn() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:pi");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "BeforeAgentStart",
                "prompt": "pi prompt",
            }),
            &ctx,
        );
        assert_eq!(service.get_all_activity()[0].turns.len(), 1);
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "pi prompt");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "AgentStart",
            }),
            &ctx,
        );
        assert_eq!(service.get_all_activity()[0].turns.len(), 1);
        assert_eq!(service.get_all_activity()[0].turns[0].prompt, "pi prompt");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "ToolCall",
                "tool": "read",
                "arguments": { "path": "a.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "read");
    }

    #[test]
    fn ampcode_agent_start_and_tool_call_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:amp");
        service.handle_ampcode_event(
            &serde_json::json!({
                "hook_event_name": "AgentStart",
                "prompt": "amp prompt",
            }),
            &ctx,
        );
        service.handle_ampcode_event(
            &serde_json::json!({
                "hook_event_name": "ToolCall",
                "tool": "edit",
                "arguments": { "path": "b.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "amp prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "edit");
    }

    #[test]
    fn hermes_pre_tool_call_folds_tool_without_inventing_prompt() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:hermes");
        service.handle_hermes_event(
            &serde_json::json!({
                "hook_event_name": "pre_tool_call",
                "tool": "bash",
                "arguments": { "command": "ls" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "bash");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "ls");
    }

    #[test]
    fn kiro_prompt_and_tool_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:kiro");
        service.handle_kiro_event(
            &serde_json::json!({
                "hook_event_name": "userPromptSubmit",
                "prompt": "kiro prompt",
            }),
            &ctx,
        );
        service.handle_kiro_event(
            &serde_json::json!({
                "hook_event_name": "preToolUse",
                "tool_name": "Read",
                "tool_input": { "path": "k.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "kiro prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn factory_droid_prompt_and_tool_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:droid");
        service.handle_factory_droid_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "droid prompt",
            }),
            &ctx,
        );
        service.handle_factory_droid_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Edit",
                "tool_input": { "file_path": "d.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "droid prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Edit");
    }

    #[test]
    fn grok_prompt_and_tool_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:grok");
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "grok prompt",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": { "command": "pwd" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "grok prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Bash");
    }

    #[test]
    fn antigravity_preinvocation_and_tool_fold() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:agy");
        service.handle_antigravity_event(
            &serde_json::json!({
                "invocationNum": 0,
                "prompt": "agy prompt",
            }),
            &ctx,
        );
        service.handle_antigravity_event(
            &serde_json::json!({
                "invocationNum": 1,
            }),
            &ctx,
        );
        service.handle_antigravity_event(
            &serde_json::json!({
                "toolCall": {
                    "name": "Read",
                    "args": { "TargetFile": "g.ts" }
                }
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "agy prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "g.ts");
    }

    #[test]
    fn antigravity_omits_prompt_when_payload_has_none() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:agy-empty");
        service.handle_antigravity_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Read",
                "tool_input": { "path": "g.ts" },
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn pane_destroy_after_idle_sweep_drops_activity() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:keep");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "keep me",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        service.test_backdate_session("ws-1:keep", "2000-01-01T00:00:00+00:00");
        service.clear_idle_older_than(1);
        assert!(service.get_all_sessions().is_empty());
        assert_eq!(service.get_all_activity().len(), 1);
        service.clear_sessions_for_stable_pane("ws-1:keep");
        assert!(service.get_all_activity().is_empty());
    }

    #[test]
    fn idle_tool_takeover_replaces_turns() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:take");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "old tool",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert_eq!(
            service.get_all_activity()[0].tool,
            AgentToolType::ClaudeCode
        );
        service.handle_codex_event(
            &serde_json::json!({
                "hook_event_name": "SessionStart",
                "cwd": "/tmp/x",
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.tool, AgentToolType::Codex);
        assert!(activity.turns.is_empty());
    }

    #[test]
    fn todos_replace_on_todowrite() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:todo");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "plan",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "TodoWrite",
                "tool_input": {
                    "todos": [
                        { "content": "a", "status": "completed" },
                        { "content": "b", "status": "pending" }
                    ]
                }
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert_eq!(activity.todos.len(), 2);
        assert_eq!(activity.todos[0].content, "a");
        assert_eq!(activity.turns[0].todos.len(), 2);
    }

    #[test]
    fn child_lifecycle_records_spawn_and_drops_live_child() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:lead");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "delegate",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "agent_id": "c1",
                "subagent_type": "Explore",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "agent_id": "c1",
                "tool_name": "Read",
                "tool_input": { "file_path": "/tmp/a.rs" },
            }),
            &ctx,
        );
        {
            let activity = &service.get_all_activity()[0];
            assert_eq!(activity.children.len(), 1);
            assert_eq!(activity.children[0].child_id, "c1");
            assert_eq!(
                activity.children[0].current_tool.as_ref().unwrap().name,
                "Read"
            );
            assert_eq!(activity.turns[0].spawned_child_ids, vec!["c1"]);
        }
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStop",
                "agent_id": "c1",
            }),
            &ctx,
        );
        let activity = &service.get_all_activity()[0];
        assert!(activity.children.is_empty());
        assert_eq!(activity.turns[0].spawned_child_ids, vec!["c1"]);
    }

    #[test]
    fn late_post_after_idle_does_not_force_running() {
        let service = AgentHooksService::new();
        let ctx = pane_ctx("ws-1:late");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "x",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": { "command": "echo" },
            }),
            &ctx,
        );
        let sessions = service.get_all_sessions();
        assert_eq!(sessions[0].state, AgentHookState::Idle);
        let activity = &service.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
    }
}
