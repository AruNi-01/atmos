//! Fine-grained Agent Observer activity (turns, tools, todos, children).
//!
//! Coarse `idle` / `running` / `permission_request` stays on the session map.
//! This module is the only writer of turn history.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use agent::{
    is_grok_chrome_subagent_name, AgentEvent, AgentTool, AgentToolKind, AgentToolParams,
    AgentToolStatus, GrokGoal, GrokWorkflow, UserMessageKind,
};

use super::{
    AgentOccupancy, AgentStatusContext, AgentStatusEvent, AgentStatusRecord, AgentStatusService,
    AgentSurface, AgentToolType,
};

const TURNS_MAX: usize = 50;
const TOOLS_PER_TURN: usize = 32;
const RECENT_TOOLS_CHILD: usize = 8;
const DETAIL_CHARS: usize = 120;
const PROMPT_CHARS: usize = 240;
const TODO_WIRE: usize = 40;
const CHILD_PROMPT_STEAL_CHARS: usize = 40;
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
    pub state: AgentOccupancy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_tool: Option<AgentToolLine>,
    pub recent_tools: Vec<AgentToolLine>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    pub started_at: String,
    pub last_event_at: String,
    #[serde(default, skip)]
    chrome: bool,
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
    #[serde(default)]
    pub surface: AgentSurface,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub space_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    pub last_state: AgentOccupancy,
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
    #[serde(skip)]
    grok_goal_child_ids: Vec<String>,
    #[serde(skip)]
    grok_workflow_child_ids: Vec<String>,
    #[serde(default, skip)]
    child_aliases: HashMap<String, String>,
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

impl AgentStatusService {
    pub fn get_all_activity(&self) -> Vec<AgentActivity> {
        self.activity.read().values().cloned().collect()
    }

    pub(crate) fn observe_host(
        &self,
        session_id: &str,
        tool: AgentToolType,
        event: &AgentEvent,
        ctx: &AgentStatusContext,
    ) {
        let Some(fold) = host_fold(event) else {
            return;
        };
        let session = {
            let sessions = self.sessions.read();
            match sessions.get(session_id) {
                Some(s) if s.tool == tool => s.clone(),
                Some(s) if s.state != AgentOccupancy::Idle => return,
                _ => occupancy_bind(session_id, tool, ctx),
            }
        };
        if matches!(fold, HostFold::CloseTurn) && !self.activity.read().contains_key(session_id) {
            return;
        }

        let now = Utc::now().to_rfc3339();
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
        // Terminal idle suppress drops leftover PostToolUse. Chat occupancy can
        // stay Idle across a suppressed Progress window while tools still stream.
        let session_idle =
            session.state == AgentOccupancy::Idle && session.surface != AgentSurface::Chat;
        apply_host_fold(
            &mut next,
            fold,
            &now,
            session_idle,
            session.project_path.as_deref(),
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
            if let Err(error) = self
                .event_tx
                .send(AgentStatusEvent::ActivityUpdated(Box::new(next)))
            {
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
        activity.last_state = AgentOccupancy::Idle;
        activity.last_event_at = now;
        if activity.visible_clone() != before {
            let snapshot = activity.clone();
            drop(map);
            let _ = self
                .event_tx
                .send(AgentStatusEvent::ActivityUpdated(Box::new(snapshot)));
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
        let _ = self.event_tx.send(AgentStatusEvent::ActivityCleared {
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
}

fn occupancy_bind(
    session_id: &str,
    tool: AgentToolType,
    ctx: &AgentStatusContext,
) -> AgentStatusRecord {
    AgentStatusRecord {
        session_id: session_id.to_string(),
        tool,
        state: AgentOccupancy::Running,
        timestamp: Utc::now().to_rfc3339(),
        project_path: None,
        context_id: ctx.context_id.clone(),
        pane_id: ctx.pane_id.clone().or_else(|| Some(session_id.to_string())),
        terminal_kind: ctx.terminal_kind.clone(),
        side_chat_id: ctx.side_chat_id.clone(),
        source_pane_id: ctx.source_pane_id.clone(),
        hook_version: ctx.hook_version,
        surface: ctx.surface,
        surface_id: ctx.surface_id.clone(),
        space_id: ctx.space_id.clone(),
        provider_id: ctx.provider_id.clone(),
    }
}

fn new_activity(session: &AgentStatusRecord, ctx: &AgentStatusContext, now: &str) -> AgentActivity {
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
        surface: session.surface,
        surface_id: session
            .surface_id
            .clone()
            .or_else(|| ctx.surface_id.clone()),
        space_id: session.space_id.clone().or_else(|| ctx.space_id.clone()),
        provider_id: session
            .provider_id
            .clone()
            .or_else(|| ctx.provider_id.clone()),
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
        grok_goal_child_ids: Vec::new(),
        grok_workflow_child_ids: Vec::new(),
        child_aliases: HashMap::new(),
    }
}

fn copy_bind(activity: &mut AgentActivity, session: &AgentStatusRecord, ctx: &AgentStatusContext) {
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
    activity.surface = session.surface;
    activity.surface_id = session
        .surface_id
        .clone()
        .or_else(|| ctx.surface_id.clone())
        .or_else(|| activity.surface_id.clone());
    activity.space_id = session
        .space_id
        .clone()
        .or_else(|| ctx.space_id.clone())
        .or_else(|| activity.space_id.clone());
    activity.provider_id = session
        .provider_id
        .clone()
        .or_else(|| ctx.provider_id.clone())
        .or_else(|| activity.provider_id.clone());
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

enum HostFold {
    OpenTurn,
    Prompt { text: String },
    ToolPending { tool: AgentTool },
    ToolOk { tool: AgentTool },
    ToolError { tool: AgentTool },
    Todos { todos: Vec<AgentTodoItem> },
    Permission,
    CloseTurn,
    Bind,
    GrokGoal { goal: Option<GrokGoal> },
    GrokWorkflow { workflow: Option<GrokWorkflow> },
}

fn host_fold(event: &AgentEvent) -> Option<HostFold> {
    match event {
        AgentEvent::TurnStarted { .. } => Some(HostFold::OpenTurn),
        AgentEvent::UserMessage {
            kind: UserMessageKind::Steer,
            ..
        } => None,
        AgentEvent::UserMessage { text, .. } => Some(HostFold::Prompt { text: text.clone() }),
        AgentEvent::ToolCallStarted { tool_call } => Some(HostFold::ToolPending {
            tool: tool_call.clone(),
        }),
        AgentEvent::ToolCallUpdated { tool_call } => match tool_call.status {
            AgentToolStatus::Completed => Some(HostFold::ToolOk {
                tool: tool_call.clone(),
            }),
            AgentToolStatus::Failed => Some(HostFold::ToolError {
                tool: tool_call.clone(),
            }),
            AgentToolStatus::Pending | AgentToolStatus::Running => Some(HostFold::ToolPending {
                tool: tool_call.clone(),
            }),
        },
        AgentEvent::ToolCallCompleted { tool_call } => Some(HostFold::ToolOk {
            tool: tool_call.clone(),
        }),
        AgentEvent::ToolCallFailed { tool_call, .. } => Some(HostFold::ToolError {
            tool: tool_call.clone(),
        }),
        AgentEvent::PlanUpdated { plan } => {
            extract_plan_todos(plan).map(|todos| HostFold::Todos { todos })
        }
        AgentEvent::PermissionRequested { .. } => Some(HostFold::Permission),
        AgentEvent::TurnCompleted { .. }
        | AgentEvent::TurnFailed { .. }
        | AgentEvent::TurnCanceled { .. }
        | AgentEvent::SessionClosed => Some(HostFold::CloseTurn),
        AgentEvent::SessionStarted { .. } => Some(HostFold::Bind),
        AgentEvent::GrokGoalUpdated { goal } => Some(HostFold::GrokGoal { goal: goal.clone() }),
        AgentEvent::GrokWorkflowUpdated { workflow } => Some(HostFold::GrokWorkflow {
            workflow: workflow.clone(),
        }),
        _ => None,
    }
}

fn apply_host_fold(
    activity: &mut AgentActivity,
    fold: HostFold,
    now: &str,
    session_idle: bool,
    project_path: Option<&str>,
) {
    match fold {
        HostFold::OpenTurn => {
            if activity.current_turn_id.is_none() {
                open_turn(activity, String::new(), now);
            }
        }
        HostFold::Prompt { text } => apply_prompt(activity, &text, now),
        HostFold::ToolPending { tool } => apply_host_tool(
            activity,
            &tool,
            now,
            session_idle,
            project_path,
            true,
            false,
        ),
        HostFold::ToolOk { tool } => {
            apply_host_tool(
                activity,
                &tool,
                now,
                session_idle,
                project_path,
                false,
                false,
            );
            if let Some(todos) = host_tool_todos(&tool) {
                activity.todos = todos.clone();
                if let Some(turn) = current_turn_mut(activity) {
                    turn.todos = todos;
                }
            }
        }
        HostFold::ToolError { tool } => apply_host_tool(
            activity,
            &tool,
            now,
            session_idle,
            project_path,
            false,
            true,
        ),
        HostFold::Todos { todos } => {
            activity.todos = todos.clone();
            if let Some(turn) = current_turn_mut(activity) {
                turn.todos = todos;
            }
        }
        HostFold::Permission => {
            if let Some(child) = activity.children.last_mut() {
                if child.current_tool.is_some() {
                    child.state = AgentOccupancy::PermissionRequest;
                    child.last_event_at = now.to_string();
                }
            }
        }
        HostFold::CloseTurn => {
            close_open_turn(activity, now);
            activity.current_tool = None;
            activity.current_turn_id = None;
        }
        HostFold::Bind => {}
        HostFold::GrokGoal { goal } => {
            apply_grok_roster(
                activity,
                GrokRosterKind::Goal,
                grok_goal_roster(goal.as_ref()),
                now,
            );
        }
        HostFold::GrokWorkflow { workflow } => {
            apply_grok_roster(
                activity,
                GrokRosterKind::Workflow,
                grok_workflow_roster(workflow.as_ref()),
                now,
            );
        }
    }
}

fn apply_prompt(activity: &mut AgentActivity, text: &str, now: &str) {
    if steal_prompt_for_child(activity, text, now) {
        return;
    }
    if let Some(turn) = current_turn_mut(activity) {
        if turn.ended_at.is_none() && turn.prompt.is_empty() {
            turn.prompt = truncate(text, PROMPT_CHARS);
            activity.current_tool = None;
            return;
        }
    }
    close_open_turn(activity, now);
    open_turn(activity, text.to_string(), now);
    activity.current_tool = None;
}

fn apply_host_tool(
    activity: &mut AgentActivity,
    tool: &AgentTool,
    now: &str,
    session_idle: bool,
    project_path: Option<&str>,
    pending: bool,
    error: bool,
) {
    if is_wait_poll_name(&tool.name) {
        return;
    }
    if is_host_subagent(tool) {
        apply_host_subagent(activity, tool, now, pending);
        return;
    }
    if let Some(child_id) = resolve_nested_child_id(activity, tool) {
        apply_child_tool(activity, &child_id, tool, now, project_path, pending, error);
        return;
    }
    if pending {
        if session_idle {
            activity.current_tool = None;
            return;
        }
        ensure_open_turn(activity, now);
        if let Some(path) = host_tool_path(tool, project_path) {
            activity.last_file = Some(path);
        }
        activity.current_tool = Some(host_tool_line(tool, project_path, now, "pending"));
        return;
    }
    let state = if error { "error" } else { "ok" };
    if session_idle {
        complete_late_host_tool(activity, tool, project_path, now, state);
        activity.current_tool = None;
        return;
    }
    ensure_open_turn(activity, now);
    complete_lead_host_tool(activity, tool, project_path, now, state);
}

fn apply_host_subagent(activity: &mut AgentActivity, tool: &AgentTool, now: &str, pending: bool) {
    let ids = host_subagent_ids(tool);
    if ids.is_empty() {
        return;
    }
    let canonical = pick_canonical_child(activity, &ids);
    for id in &ids {
        register_child_alias(activity, id, &canonical);
        if id != &canonical {
            merge_child(activity, id, &canonical);
        }
    }
    let chrome = is_grok_chrome_subagent_name(&tool.name);
    upsert_host_child(activity, &canonical, host_child_name(tool), now, chrome);
    if let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == canonical)
    {
        if let Some(prompt) = host_child_prompt(tool) {
            if child.prompt.as_deref().unwrap_or("").is_empty() {
                child.prompt = Some(truncate(&prompt, PROMPT_CHARS));
            }
        }
        if pending {
            child.state = AgentOccupancy::Running;
        } else if !chrome && !is_dispatch_ack_name(&tool.name) {
            child.state = AgentOccupancy::Idle;
            if let Some(line) = child.current_tool.take() {
                push_aggregated_tool(&mut child.recent_tools, line, now, RECENT_TOOLS_CHILD);
            }
        }
    }
    if pending {
        if let Some(turn) = current_turn_mut(activity) {
            if !turn.spawned_child_ids.iter().any(|id| id == &canonical) {
                turn.spawned_child_ids.push(canonical.clone());
            }
        }
    }
    strip_chrome_tools_from_turns(activity);
    rehome_child_prompt_turns(activity);
}

fn apply_child_tool(
    activity: &mut AgentActivity,
    child_id: &str,
    tool: &AgentTool,
    now: &str,
    project_path: Option<&str>,
    pending: bool,
    error: bool,
) {
    upsert_host_child(activity, child_id, host_child_name(tool), now, false);
    let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == child_id)
    else {
        return;
    };
    child.last_event_at = now.to_string();
    child.state = AgentOccupancy::Running;
    if pending {
        child.current_tool = Some(host_tool_line(tool, project_path, now, "pending"));
        return;
    }
    let state = if error { "error" } else { "ok" };
    let mut line = child
        .current_tool
        .take()
        .unwrap_or_else(|| host_tool_line(tool, project_path, now, state));
    finish_tool_line(&mut line, now, state, host_tool_detail(tool, project_path));
    push_aggregated_tool(&mut child.recent_tools, line, now, RECENT_TOOLS_CHILD);
}

fn complete_lead_host_tool(
    activity: &mut AgentActivity,
    tool: &AgentTool,
    project_path: Option<&str>,
    now: &str,
    state: &str,
) {
    let mut line = activity
        .current_tool
        .take()
        .unwrap_or_else(|| host_tool_line(tool, project_path, now, state));
    finish_tool_line(&mut line, now, state, host_tool_detail(tool, project_path));
    if let Some(path) = host_tool_path(tool, project_path) {
        activity.last_file = Some(path);
    }
    if let Some(turn) = current_turn_mut(activity) {
        push_aggregated_tool(&mut turn.tools, line, now, TOOLS_PER_TURN);
    }
}

fn complete_late_host_tool(
    activity: &mut AgentActivity,
    tool: &AgentTool,
    project_path: Option<&str>,
    now: &str,
    state: &str,
) {
    let Some(turn) = last_turn_mut(activity) else {
        return;
    };
    let name = host_tool_name(tool);
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
    let line = host_tool_line(tool, project_path, now, state);
    push_aggregated_tool(&mut turn.tools, line, now, TOOLS_PER_TURN);
}

fn finish_tool_line(line: &mut AgentToolLine, now: &str, state: &str, detail: String) {
    line.state = state.to_string();
    line.ended_at = Some(now.to_string());
    if let Ok(start) = DateTime::parse_from_rfc3339(&line.started_at) {
        if let Ok(end) = DateTime::parse_from_rfc3339(now) {
            line.duration_ms = Some((end - start).num_milliseconds().max(0));
        }
    }
    if line.detail.is_empty() {
        line.detail = detail;
    }
}

fn upsert_host_child(
    activity: &mut AgentActivity,
    child_id: &str,
    name: Option<String>,
    now: &str,
    chrome: bool,
) {
    if let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == child_id)
    {
        child.state = AgentOccupancy::Running;
        child.last_event_at = now.to_string();
        child.chrome = child.chrome || chrome;
        if child.name.is_none() {
            child.name = name;
        }
        return;
    }
    activity.children.push(AgentChildActivity {
        child_id: child_id.to_string(),
        name,
        state: AgentOccupancy::Running,
        current_tool: None,
        recent_tools: Vec::new(),
        prompt: None,
        started_at: now.to_string(),
        last_event_at: now.to_string(),
        chrome,
    });
}

fn is_spawn_tool_name(name: &str) -> bool {
    matches!(
        normalize_tool_label(name).as_str(),
        "task"
            | "agent"
            | "subagent"
            | "spawn_subagent"
            | "spawn_agent"
            | "agent_spawn"
            | "collabtoolcall"
            | "collab_tool_call"
            | "collabagenttoolcall"
            | "collab_agent_tool_call"
    )
}

fn is_dispatch_ack_name(name: &str) -> bool {
    matches!(
        normalize_tool_label(name).as_str(),
        "spawn_subagent" | "spawn_agent" | "agent_spawn"
    )
}

fn is_wait_poll_name(name: &str) -> bool {
    let n = normalize_tool_label(name);
    n.contains("get_command_or_subagent")
        || n.contains("subagent_output")
        || n.contains("task_output")
        || n.contains("agent_output")
        || n.contains("taskoutput")
        || n.contains("agentoutput")
}

fn normalize_tool_label(name: &str) -> String {
    name.trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn is_host_subagent(tool: &AgentTool) -> bool {
    tool.kind == AgentToolKind::Subagent || is_spawn_tool_name(&tool.name)
}

fn looks_like_child_prompt(text: &str) -> bool {
    text.trim().chars().count() >= CHILD_PROMPT_STEAL_CHARS
}

fn host_subagent_ids(tool: &AgentTool) -> Vec<String> {
    let mut ids = Vec::new();
    let mut push = |value: &str| {
        let trimmed = value.trim();
        if !trimmed.is_empty() && !ids.iter().any(|existing| existing == trimmed) {
            ids.push(trimmed.to_string());
        }
    };
    if let AgentToolParams::Subagent { task_id, .. } = &tool.params {
        if let Some(id) = task_id {
            push(id);
        }
    }
    push(&tool.tool_call_id);
    ids
}

fn host_child_prompt(tool: &AgentTool) -> Option<String> {
    match &tool.params {
        AgentToolParams::Subagent {
            prompt,
            description,
            ..
        } => prompt
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| {
                let text = description.trim();
                looks_like_child_prompt(text).then(|| text.to_string())
            }),
        _ => None,
    }
}

fn register_child_alias(activity: &mut AgentActivity, alias: &str, canonical: &str) {
    let alias = alias.trim();
    let canonical = canonical.trim();
    if alias.is_empty() || canonical.is_empty() || alias == canonical {
        return;
    }
    activity
        .child_aliases
        .insert(alias.to_string(), canonical.to_string());
}

fn canonical_child_id(activity: &AgentActivity, raw: &str) -> String {
    let mut id = raw.trim().to_string();
    let mut seen = HashSet::new();
    while let Some(next) = activity.child_aliases.get(&id) {
        if !seen.insert(id.clone()) {
            break;
        }
        if next == &id {
            break;
        }
        id = next.clone();
    }
    id
}

fn pick_canonical_child(activity: &AgentActivity, ids: &[String]) -> String {
    for id in ids {
        let resolved = canonical_child_id(activity, id);
        if activity
            .children
            .iter()
            .any(|child| child.child_id == resolved && child.chrome)
        {
            return resolved;
        }
    }
    for id in ids {
        let resolved = canonical_child_id(activity, id);
        if activity
            .children
            .iter()
            .any(|child| child.child_id == resolved)
        {
            return resolved;
        }
    }
    canonical_child_id(activity, ids.first().map(String::as_str).unwrap_or(""))
}

fn merge_child(activity: &mut AgentActivity, from_id: &str, into_id: &str) {
    if from_id == into_id {
        return;
    }
    register_child_alias(activity, from_id, into_id);
    let remapped: Vec<String> = activity
        .child_aliases
        .iter()
        .filter(|(_, value)| *value == from_id)
        .map(|(key, _)| key.clone())
        .collect();
    for key in remapped {
        activity.child_aliases.insert(key, into_id.to_string());
    }
    let Some(index) = activity
        .children
        .iter()
        .position(|child| child.child_id == from_id)
    else {
        return;
    };
    let from = activity.children.remove(index);
    if let Some(into) = activity
        .children
        .iter_mut()
        .find(|child| child.child_id == into_id)
    {
        into.chrome = into.chrome || from.chrome;
        if into.name.is_none() {
            into.name = from.name;
        }
        if into.prompt.as_deref().unwrap_or("").is_empty() {
            into.prompt = from.prompt;
        }
        match (&into.current_tool, from.current_tool) {
            (None, Some(tool)) => into.current_tool = Some(tool),
            (Some(existing), Some(tool))
                if existing.state != "pending" && tool.state == "pending" =>
            {
                into.current_tool = Some(tool);
            }
            (_, Some(tool)) => {
                push_aggregated_tool(
                    &mut into.recent_tools,
                    tool,
                    &from.last_event_at,
                    RECENT_TOOLS_CHILD,
                );
            }
            _ => {}
        }
        for line in from.recent_tools {
            push_aggregated_tool(
                &mut into.recent_tools,
                line,
                &from.last_event_at,
                RECENT_TOOLS_CHILD,
            );
        }
        if from.state == AgentOccupancy::Running {
            into.state = AgentOccupancy::Running;
        }
        into.last_event_at = from.last_event_at;
        return;
    }
    let mut renamed = from;
    renamed.child_id = into_id.to_string();
    activity.children.push(renamed);
}

fn resolve_nested_child_id(activity: &AgentActivity, tool: &AgentTool) -> Option<String> {
    if let Some(parent) = tool
        .parent_tool_call_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(canonical_child_id(activity, parent));
    }
    guess_child_for_orphan_tool(activity)
}

fn guess_child_for_orphan_tool(activity: &AgentActivity) -> Option<String> {
    let running: Vec<&AgentChildActivity> = activity
        .children
        .iter()
        .filter(|child| child.state == AgentOccupancy::Running)
        .collect();
    if running.is_empty() {
        return None;
    }
    if running.len() == 1 {
        return Some(running[0].child_id.clone());
    }
    if let Some(idle) = running.iter().find(|child| child.current_tool.is_none()) {
        return Some(idle.child_id.clone());
    }
    running
        .iter()
        .max_by_key(|child| child.last_event_at.as_str())
        .map(|child| child.child_id.clone())
}

fn steal_prompt_for_child(activity: &mut AgentActivity, text: &str, now: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || activity.children.is_empty() {
        return false;
    }
    let truncated = truncate(trimmed, PROMPT_CHARS);
    let already = activity.children.iter().any(|child| {
        child.prompt.as_deref().is_some_and(|prompt| {
            prompt == truncated || prompt.starts_with(trimmed) || trimmed.starts_with(prompt)
        })
    });
    let has_user_prompt = activity.turns.iter().any(|turn| !turn.prompt.is_empty());
    if !has_user_prompt {
        return false;
    }
    if already {
        return true;
    }
    if !looks_like_child_prompt(trimmed) {
        return false;
    }
    if let Some(child) = activity.children.iter_mut().find(|child| {
        child.state == AgentOccupancy::Running && child.prompt.as_deref().unwrap_or("").is_empty()
    }) {
        child.prompt = Some(truncated);
        child.last_event_at = now.to_string();
    }
    true
}

fn strip_chrome_tools_from_turns(activity: &mut AgentActivity) {
    for turn in &mut activity.turns {
        turn.tools
            .retain(|tool| !is_spawn_tool_name(&tool.name) && !is_wait_poll_name(&tool.name));
    }
    if activity
        .current_tool
        .as_ref()
        .is_some_and(|tool| is_spawn_tool_name(&tool.name) || is_wait_poll_name(&tool.name))
    {
        activity.current_tool = None;
    }
}

fn rehome_child_prompt_turns(activity: &mut AgentActivity) {
    if activity.children.is_empty() || activity.turns.len() < 2 {
        return;
    }
    let mut kept = Vec::new();
    let mut extras = Vec::new();
    let mut seen_user = false;
    for mut turn in activity.turns.drain(..) {
        turn.tools
            .retain(|tool| !is_spawn_tool_name(&tool.name) && !is_wait_poll_name(&tool.name));
        let is_user = !seen_user && !turn.prompt.is_empty();
        if is_user {
            seen_user = true;
            kept.push(turn);
            continue;
        }
        if looks_like_child_prompt(&turn.prompt) && turn.tools.is_empty() {
            extras.push(turn.prompt);
            continue;
        }
        kept.push(turn);
    }
    activity.turns = kept;
    activity.current_turn_id = activity
        .turns
        .iter()
        .rev()
        .find(|turn| turn.ended_at.is_none())
        .map(|turn| turn.turn_id);
    let mut extras = extras.into_iter();
    for child in &mut activity.children {
        if child.prompt.as_deref().unwrap_or("").is_empty() {
            if let Some(prompt) = extras.next() {
                child.prompt = Some(prompt);
            }
        }
    }
}

fn host_child_name(tool: &AgentTool) -> Option<String> {
    match &tool.params {
        AgentToolParams::Subagent {
            description,
            agent_type,
            ..
        } => agent_type
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| {
                let text = description.trim();
                if text.is_empty() {
                    None
                } else {
                    Some(truncate(text, DETAIL_CHARS))
                }
            }),
        _ => tool
            .title
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
    }
}

fn host_tool_name(tool: &AgentTool) -> String {
    let name = tool.name.trim();
    if !name.is_empty() {
        return name.to_string();
    }
    tool.title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("tool")
        .to_string()
}

fn host_tool_line(
    tool: &AgentTool,
    project_path: Option<&str>,
    now: &str,
    state: &str,
) -> AgentToolLine {
    AgentToolLine {
        name: host_tool_name(tool),
        detail: host_tool_detail(tool, project_path),
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

fn host_tool_detail(tool: &AgentTool, project_path: Option<&str>) -> String {
    let raw = match &tool.params {
        AgentToolParams::Read { path, .. }
        | AgentToolParams::Edit { path }
        | AgentToolParams::Delete { path } => path.clone(),
        AgentToolParams::Move { to, .. } => to.clone(),
        AgentToolParams::Search { query, path, .. } => path
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| query.clone()),
        AgentToolParams::WebSearch { query } => query.clone(),
        AgentToolParams::Execute { command, .. } => command.clone(),
        AgentToolParams::Fetch { url } => url.clone(),
        AgentToolParams::Skill { skill } => skill.clone(),
        AgentToolParams::Subagent { description, .. } => description.clone(),
        AgentToolParams::McpList { server } => server.clone().unwrap_or_default(),
        AgentToolParams::McpCall { tool, server } => {
            tool.clone().or_else(|| server.clone()).unwrap_or_default()
        }
        AgentToolParams::ImageGen { prompt, path, .. } => path
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| prompt.clone()),
        AgentToolParams::PlanDocument { name, overview, .. } => name
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| overview.clone())
            .unwrap_or_default(),
        AgentToolParams::Other { value } => [
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
        ]
        .iter()
        .find_map(|key| value.get(*key).and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string(),
    };
    truncate(&relativize(&raw, project_path), DETAIL_CHARS)
}

fn host_tool_path(tool: &AgentTool, project_path: Option<&str>) -> Option<String> {
    let path = match &tool.params {
        AgentToolParams::Read { path, .. }
        | AgentToolParams::Edit { path }
        | AgentToolParams::Delete { path } => path.as_str(),
        AgentToolParams::Move { to, .. } => to.as_str(),
        AgentToolParams::Search { path, .. } => path.as_deref().unwrap_or(""),
        AgentToolParams::ImageGen { path, .. } => path.as_deref().unwrap_or(""),
        AgentToolParams::Other { value } => [
            "file_path",
            "notebook_path",
            "path",
            "filePath",
            "target_file",
            "TargetFile",
        ]
        .iter()
        .find_map(|key| value.get(*key).and_then(|v| v.as_str()))
        .unwrap_or(""),
        _ => "",
    };
    let path = path.trim();
    if path.is_empty() {
        None
    } else {
        Some(relativize(path, project_path))
    }
}

fn host_tool_todos(tool: &AgentTool) -> Option<Vec<AgentTodoItem>> {
    match &tool.params {
        AgentToolParams::PlanDocument { todos, .. } if !todos.is_empty() => Some(
            todos
                .iter()
                .take(TODO_WIRE)
                .map(|item| AgentTodoItem {
                    content: truncate(&item.content, DETAIL_CHARS),
                    status: item.status.clone(),
                })
                .collect(),
        ),
        AgentToolParams::Other { value } => extract_plan_todos(value),
        _ => None,
    }
}

fn extract_plan_todos(plan: &Value) -> Option<Vec<AgentTodoItem>> {
    extract_todos(plan)
}

fn extract_todos(payload: &Value) -> Option<Vec<AgentTodoItem>> {
    let arr = payload
        .get("todos")
        .or_else(|| payload.get("tool_input").and_then(|i| i.get("todos")))
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

enum GrokRosterKind {
    Goal,
    Workflow,
}

fn grok_goal_roster(goal: Option<&GrokGoal>) -> Vec<(String, Option<String>)> {
    let Some(goal) = goal.filter(|g| !g.status.eq_ignore_ascii_case("cleared")) else {
        return Vec::new();
    };
    goal.children
        .iter()
        .filter(|child| !child.id.trim().is_empty())
        .map(|child| {
            let name = if child.label.trim().is_empty() {
                child.agent_type.clone()
            } else {
                Some(child.label.clone())
            };
            (child.id.clone(), name)
        })
        .collect()
}

fn grok_workflow_roster(workflow: Option<&GrokWorkflow>) -> Vec<(String, Option<String>)> {
    let Some(workflow) = workflow.filter(|w| !w.status.eq_ignore_ascii_case("cleared")) else {
        return Vec::new();
    };
    workflow
        .agents
        .iter()
        .filter(|agent| !agent.id.trim().is_empty())
        .map(|agent| {
            let name = if agent.label.trim().is_empty() {
                agent.agent_type.clone()
            } else {
                Some(agent.label.clone())
            };
            (agent.id.clone(), name)
        })
        .collect()
}

fn apply_grok_roster(
    activity: &mut AgentActivity,
    kind: GrokRosterKind,
    incoming: Vec<(String, Option<String>)>,
    now: &str,
) {
    let ids: Vec<String> = incoming.iter().map(|(id, _)| id.clone()).collect();
    match kind {
        GrokRosterKind::Goal => activity.grok_goal_child_ids = ids,
        GrokRosterKind::Workflow => activity.grok_workflow_child_ids = ids,
    }
    for (id, name) in &incoming {
        upsert_host_child(activity, id, name.clone(), now, true);
        if let Some(turn) = current_turn_mut(activity) {
            if !turn.spawned_child_ids.iter().any(|existing| existing == id) {
                turn.spawned_child_ids.push(id.clone());
            }
        }
    }
    merge_spawn_children_into_roster(activity, &incoming);
    let keep: HashSet<String> = activity
        .grok_goal_child_ids
        .iter()
        .chain(activity.grok_workflow_child_ids.iter())
        .cloned()
        .collect();
    activity
        .children
        .retain(|child| !child.chrome || keep.contains(&child.child_id));
    rehome_child_prompt_turns(activity);
}

fn merge_spawn_children_into_roster(
    activity: &mut AgentActivity,
    incoming: &[(String, Option<String>)],
) {
    if incoming.is_empty() {
        return;
    }
    let spawn: Vec<String> = activity
        .children
        .iter()
        .filter(|child| !child.chrome)
        .map(|child| child.child_id.clone())
        .collect();
    let roster: Vec<String> = incoming.iter().map(|(id, _)| id.clone()).collect();
    let mut used_spawn = HashSet::new();
    let mut used_roster = HashSet::new();
    for spawn_id in &spawn {
        let resolved = canonical_child_id(activity, spawn_id);
        if let Some(dest) = roster.iter().find(|id| {
            *id == spawn_id || *id == &resolved || canonical_child_id(activity, id) == resolved
        }) {
            merge_child(activity, spawn_id, dest);
            used_spawn.insert(spawn_id.clone());
            used_roster.insert(dest.clone());
        }
    }
    let leftover_spawn: Vec<String> = spawn
        .into_iter()
        .filter(|id| !used_spawn.contains(id))
        .collect();
    let leftover_roster: Vec<String> = roster
        .into_iter()
        .filter(|id| !used_roster.contains(id))
        .collect();
    for (spawn_id, roster_id) in leftover_spawn.iter().zip(leftover_roster.iter()) {
        merge_child(activity, spawn_id, roster_id);
    }
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
    use std::sync::Arc;

    use crate::service::agent_hooks::{terminal_hook_context, AgentHooksService};

    fn pane_ctx(pane: &str) -> AgentStatusContext {
        terminal_hook_context(AgentStatusContext {
            pane_id: Some(pane.to_string()),
            context_id: Some("ws-1".to_string()),
            ..AgentStatusContext::default()
        })
    }

    #[test]
    fn prompt_opens_turn_tools_attach_idle_keeps_record_second_prompt_appends() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert!(activity.turns[0].ended_at.is_some());
        assert_eq!(activity.turns[0].tools[0].name, "Edit");
        assert_eq!(activity.turns[0].tools[0].state, "ok");
        assert!(activity.current_tool.is_none());
        assert_eq!(activity.last_state, AgentOccupancy::Idle);

        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "also add tests",
                "cwd": "/tmp/repo",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 2);
        assert_eq!(activity.turns[0].prompt, "fix the footer");
        assert_eq!(activity.turns[1].prompt, "also add tests");
        assert_eq!(activity.current_turn_id, Some(2));
    }

    #[test]
    fn consecutive_bash_aggregates_repeat() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let tools = &status.get_all_activity()[0].turns[0].tools;
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "Bash");
        assert_eq!(tools[0].repeat, 3);
    }

    #[test]
    fn idle_sweep_keeps_activity_explicit_clear_drops() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:keep");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "keep me",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        status.test_backdate_session("ws-1:keep", "2000-01-01T00:00:00+00:00");
        status.clear_idle_older_than(1);
        assert!(status.get_all_sessions().is_empty());
        assert_eq!(status.get_all_activity().len(), 1);
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "keep me");

        let cleared = status.clear_idle_sessions();
        assert!(cleared.is_empty(), "session row already swept");
        status.drop_activity(&["ws-1:keep".to_string()]);
        assert!(status.get_all_activity().is_empty());
    }

    #[test]
    fn pane_focus_style_remove_keeps_activity() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:keep2");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "stay",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert!(status.remove_session_keep_activity("ws-1:keep2"));
        assert!(status.get_all_sessions().is_empty());
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "stay");
    }

    #[test]
    fn explicit_clear_idle_drops_activity() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:clear");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "bye",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert_eq!(status.get_all_activity().len(), 1);
        let cleared = status.clear_idle_sessions();
        assert_eq!(cleared, vec!["ws-1:clear".to_string()]);
        assert!(status.get_all_activity().is_empty());
    }

    #[test]
    fn cursor_prompt_and_tool_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "refactor hooks");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn gemini_before_agent_and_before_tool() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "scan repo");
        assert_eq!(
            activity.current_tool.as_ref().unwrap().name,
            "run_shell_command"
        );
    }

    #[test]
    fn opencode_chat_message_and_tool_execute_vendor_shape() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "oc prompt");
        service.handle_opencode_event(
            &serde_json::json!({
                "type": "tool.execute.before",
                "input": { "tool": "bash", "sessionID": "sess-1", "callID": "c1" },
                "output": { "args": { "command": "pwd" } }
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
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
        let activity = &status.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
        assert_eq!(activity.turns[0].tools[0].name, "bash");
        assert_eq!(activity.turns[0].tools[0].state, "ok");
        assert_eq!(activity.turns.len(), 1);
    }

    #[test]
    fn codex_prompt_opens_turn() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:codex");
        service.handle_codex_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "write tests",
                "cwd": "/tmp/x",
            }),
            &ctx,
        );
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "write tests");
    }

    #[test]
    fn pi_before_agent_start_prompt_then_agent_start_does_not_open_second_turn() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:pi");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "BeforeAgentStart",
                "prompt": "pi prompt",
            }),
            &ctx,
        );
        assert_eq!(status.get_all_activity()[0].turns.len(), 1);
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "pi prompt");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "AgentStart",
            }),
            &ctx,
        );
        assert_eq!(status.get_all_activity()[0].turns.len(), 1);
        assert_eq!(status.get_all_activity()[0].turns[0].prompt, "pi prompt");
        service.handle_pi_event(
            &serde_json::json!({
                "hook_event_name": "ToolCall",
                "tool": "read",
                "arguments": { "path": "a.ts" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "read");
    }

    #[test]
    fn ampcode_agent_start_and_tool_call_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "amp prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "edit");
    }

    #[test]
    fn hermes_pre_tool_call_folds_tool_without_inventing_prompt() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:hermes");
        service.handle_hermes_event(
            &serde_json::json!({
                "hook_event_name": "pre_tool_call",
                "tool": "bash",
                "arguments": { "command": "ls" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "bash");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "ls");
    }

    #[test]
    fn kiro_prompt_and_tool_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "kiro prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn factory_droid_prompt_and_tool_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "droid prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Edit");
    }

    #[test]
    fn grok_prompt_and_tool_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "grok prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Bash");
    }

    #[test]
    fn grok_subagent_id_records_live_child() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:grok-child");
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "explore",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "subagent_id": "sa-plan",
                "subagent_type": "Explore",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].child_id, "sa-plan");
        assert_eq!(activity.children[0].name.as_deref(), Some("Explore"));
        assert_eq!(activity.turns[0].spawned_child_ids, vec!["sa-plan"]);
    }

    #[test]
    fn antigravity_preinvocation_and_tool_fold() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "agy prompt");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
        assert_eq!(activity.current_tool.as_ref().unwrap().detail, "g.ts");
    }

    #[test]
    fn antigravity_omits_prompt_when_payload_has_none() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:agy-empty");
        service.handle_antigravity_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Read",
                "tool_input": { "path": "g.ts" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "");
        assert_eq!(activity.current_tool.as_ref().unwrap().name, "Read");
    }

    #[test]
    fn pane_destroy_after_idle_sweep_drops_activity() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:keep");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "keep me",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        status.test_backdate_session("ws-1:keep", "2000-01-01T00:00:00+00:00");
        status.clear_idle_older_than(1);
        assert!(status.get_all_sessions().is_empty());
        assert_eq!(status.get_all_activity().len(), 1);
        status.clear_sessions_for_stable_pane("ws-1:keep");
        assert!(status.get_all_activity().is_empty());
    }

    #[test]
    fn idle_tool_takeover_replaces_turns() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:take");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "old tool",
            }),
            &ctx,
        );
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        assert_eq!(status.get_all_activity()[0].tool, AgentToolType::ClaudeCode);
        service.handle_codex_event(
            &serde_json::json!({
                "hook_event_name": "SessionStart",
                "cwd": "/tmp/x",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.tool, AgentToolType::Codex);
        assert!(activity.turns.is_empty());
    }

    #[test]
    fn todos_replace_on_todowrite() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.todos.len(), 2);
        assert_eq!(activity.todos[0].content, "a");
        assert_eq!(activity.turns[0].todos.len(), 2);
    }

    #[test]
    fn child_lifecycle_records_spawn_and_drops_live_child() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
            let activity = &status.get_all_activity()[0];
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
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].state, AgentOccupancy::Idle);
        assert!(activity.children[0].current_tool.is_none());
        assert_eq!(
            activity.children[0]
                .recent_tools
                .last()
                .map(|t| t.name.as_str()),
            Some("Read")
        );
        assert_eq!(activity.turns[0].spawned_child_ids, vec!["c1"]);
    }

    #[test]
    fn late_post_after_idle_does_not_force_running() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
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
        let sessions = status.get_all_sessions();
        assert_eq!(sessions[0].state, AgentOccupancy::Idle);
        let activity = &status.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
    }

    fn chat_meta(id: &str) -> crate::service::agent_chat::AgentChatMeta {
        use crate::service::agent_chat::types::{
            chat_descriptor, AgentChatMeta, AgentChatOrigin, RuntimeStatus,
        };
        AgentChatMeta {
            id: id.into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted: false,
            title: None,
            cwd: "/tmp/ws".into(),
            workspace_id: Some("ws-1".into()),
            project_id: None,
            space_id: Some("main".into()),
            origin: AgentChatOrigin::Normal,
            provider_id: "claude".into(),
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::RunningTurn,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            applied_permission_mode: None,
            applied_fast: None,
            applied_context: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: chat_descriptor("claude", agent::AgentCurrentConfig::default()),
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
            source: None,
            automation_run_guid: None,
            grok_goal: None,
            grok_workflow: None,
        }
    }

    fn edit_tool(id: &str, pending: bool) -> AgentTool {
        AgentTool {
            tool_call_id: id.into(),
            parent_tool_call_id: None,
            name: "Edit".into(),
            title: None,
            kind: AgentToolKind::Edit,
            status: if pending {
                agent::AgentToolStatus::Pending
            } else {
                agent::AgentToolStatus::Completed
            },
            params: AgentToolParams::Edit {
                path: "/tmp/ws/Footer.tsx".into(),
            },
            result: None,
        }
    }

    #[test]
    fn chat_host_folds_prompt_tools_surface_and_second_turn() {
        use crate::service::agent_status::{apply_host_event, chat_status_session_id};

        let status = AgentStatusService::new();
        let meta = chat_meta("abc");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TurnStarted {
                turn_id: "t1".into(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "fix the footer".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: edit_tool("tc1", true),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.session_id, chat_status_session_id("abc"));
        assert_eq!(activity.surface, AgentSurface::Chat);
        assert_eq!(activity.surface_id.as_deref(), Some("abc"));
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "fix the footer");
        assert_eq!(
            activity.current_tool.as_ref().map(|t| t.name.as_str()),
            Some("Edit")
        );
        assert_eq!(
            activity.current_tool.as_ref().map(|t| t.detail.as_str()),
            Some("Footer.tsx")
        );

        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallCompleted {
                tool_call: edit_tool("tc1", false),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TurnCompleted {
                turn_id: "t1".into(),
                stop: agent::TurnStop::Completed,
            },
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
        assert_eq!(activity.turns[0].tools.len(), 1);
        assert_eq!(activity.turns[0].tools[0].state, "ok");
        assert!(activity.turns[0].ended_at.is_some());
        assert_eq!(activity.last_state, AgentOccupancy::Idle);

        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TurnStarted {
                turn_id: "t2".into(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t2".into(),
                message_id: "m2".into(),
                kind: UserMessageKind::Normal,
                text: "and tests".into(),
                attachments: Vec::new(),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 2);
        assert_eq!(activity.turns[0].prompt, "fix the footer");
        assert_eq!(activity.turns[1].prompt, "and tests");
    }

    #[test]
    fn chat_steer_does_not_open_a_new_turn() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("steer");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "write it".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m2".into(),
                kind: UserMessageKind::Steer,
                text: "shorter".into(),
                attachments: Vec::new(),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "write it");
    }

    #[test]
    fn chat_host_folds_grok_goal_children() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("grok-chat");
        meta.provider_id = "grok".into();
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TurnStarted {
                turn_id: "t1".into(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::GrokGoalUpdated {
                goal: Some(agent::GrokGoal {
                    goal_id: "g1".into(),
                    objective: "ship observer".into(),
                    status: "active".into(),
                    phase: "planning".into(),
                    planning: true,
                    verifying_completion: false,
                    last_event: None,
                    tokens_used: 0,
                    elapsed_ms: 0,
                    children: vec![agent::GrokGoalChild {
                        id: "sa-plan".into(),
                        label: "plan writer".into(),
                        role: "planning".into(),
                        agent_type: Some("general-purpose".into()),
                    }],
                }),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].child_id, "sa-plan");
        assert_eq!(activity.children[0].name.as_deref(), Some("plan writer"));

        apply_host_event(&status, &meta, &AgentEvent::GrokGoalUpdated { goal: None });
        let activity = &status.get_all_activity()[0];
        assert!(activity.children.is_empty());
    }

    #[test]
    fn chat_tool_update_refreshes_current_tool_detail() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("upd");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "edit footer".into(),
                attachments: Vec::new(),
            },
        );
        let mut started = edit_tool("tc1", true);
        started.params = AgentToolParams::Edit {
            path: String::new(),
        };
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted { tool_call: started },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallUpdated {
                tool_call: edit_tool("tc1", true),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(
            activity.current_tool.as_ref().map(|t| t.detail.as_str()),
            Some("Footer.tsx")
        );
    }

    #[test]
    fn chat_folds_tools_while_occupancy_is_idle() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("idle-tools");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "fix it".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TurnCompleted {
                turn_id: "t1".into(),
                stop: agent::TurnStop::Completed,
            },
        );
        assert_eq!(status.get_all_sessions()[0].state, AgentOccupancy::Idle);
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: edit_tool("late", true),
            },
        );
        assert_eq!(status.get_all_sessions()[0].state, AgentOccupancy::Idle);
        let activity = &status.get_all_activity()[0];
        assert_eq!(
            activity.current_tool.as_ref().map(|t| t.name.as_str()),
            Some("Edit")
        );
    }

    #[test]
    fn observe_host_without_occupancy_records_current_tool() {
        let status = AgentStatusService::new();
        let ctx = AgentStatusContext {
            surface: AgentSurface::Chat,
            surface_id: Some("orphan".into()),
            ..AgentStatusContext::default()
        };
        status.observe_host(
            "chat:orphan",
            AgentToolType::GrokBuild,
            &AgentEvent::ToolCallStarted {
                tool_call: edit_tool("tc1", true),
            },
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.session_id, "chat:orphan");
        assert_eq!(
            activity.current_tool.as_ref().map(|t| t.name.as_str()),
            Some("Edit")
        );
    }

    #[test]
    fn chat_subagent_update_creates_live_child() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("sa");
        meta.provider_id = "grok".into();
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "plan it".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallUpdated {
                tool_call: AgentTool {
                    tool_call_id: "sa-1".into(),
                    parent_tool_call_id: None,
                    name: "Task".into(),
                    title: Some("Explore".into()),
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "scan the tree".into(),
                        agent_type: Some("Explore".into()),
                        task_id: Some("sa-1".into()),
                        prompt: None,
                    },
                    result: None,
                },
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].child_id, "sa-1");
        assert_eq!(activity.children[0].name.as_deref(), Some("Explore"));
    }

    fn spawn_tool(call_id: &str, task_id: Option<&str>, pending: bool) -> AgentTool {
        AgentTool {
            tool_call_id: call_id.into(),
            parent_tool_call_id: None,
            name: "spawn_subagent".into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: if pending {
                agent::AgentToolStatus::Running
            } else {
                agent::AgentToolStatus::Completed
            },
            params: AgentToolParams::Subagent {
                description: "Explore".into(),
                agent_type: Some("general-purpose".into()),
                task_id: task_id.map(str::to_string),
                prompt: Some(
                    "You are exploring the Atmos monorepo at /tmp for architecture notes.".into(),
                ),
            },
            result: None,
        }
    }

    fn nested_read(id: &str, parent: &str, pending: bool) -> AgentTool {
        AgentTool {
            tool_call_id: id.into(),
            parent_tool_call_id: Some(parent.into()),
            name: "read_file".into(),
            title: None,
            kind: AgentToolKind::Read,
            status: if pending {
                agent::AgentToolStatus::Running
            } else {
                agent::AgentToolStatus::Completed
            },
            params: AgentToolParams::Read {
                path: "crates/runtime-manager/src/lib.rs".into(),
                offset: None,
                limit: None,
            },
            result: None,
        }
    }

    #[test]
    fn nested_tools_stay_on_child_not_parent_current() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("nested");
        meta.provider_id = "grok".into();
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "启动多个 subagent 探索一下这个项目".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: spawn_tool("tc_sub", None, true),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallCompleted {
                tool_call: spawn_tool("tc_sub", None, false),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: nested_read("child_read", "tc_sub", true),
            },
        );

        let activity = &status.get_all_activity()[0];
        assert!(
            activity.current_tool.is_none(),
            "child tool leaked onto parent"
        );
        assert_eq!(activity.children.len(), 1);
        assert_eq!(
            activity.children[0]
                .current_tool
                .as_ref()
                .map(|t| t.name.as_str()),
            Some("read_file")
        );
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(
            activity.turns[0].prompt,
            "启动多个 subagent 探索一下这个项目"
        );
        assert!(activity.turns[0].tools.is_empty());
    }

    #[test]
    fn spawn_aliases_onto_goal_roster_child() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("alias");
        meta.provider_id = "grok".into();
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "explore".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: spawn_tool("tc_sub", None, true),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: nested_read("child_read", "tc_sub", true),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::GrokGoalUpdated {
                goal: Some(agent::GrokGoal {
                    goal_id: "g1".into(),
                    objective: "Explore".into(),
                    status: "active".into(),
                    phase: "executing".into(),
                    planning: true,
                    verifying_completion: false,
                    last_event: None,
                    tokens_used: 0,
                    elapsed_ms: 0,
                    children: vec![agent::GrokGoalChild {
                        id: "goal-1".into(),
                        label: "general-purpose".into(),
                        role: "explore".into(),
                        agent_type: Some("general-purpose".into()),
                    }],
                }),
            },
        );

        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].child_id, "goal-1");
        assert_eq!(
            activity.children[0]
                .current_tool
                .as_ref()
                .map(|t| t.name.as_str()),
            Some("read_file")
        );
        assert!(activity.current_tool.is_none());
    }

    #[test]
    fn child_prompt_does_not_open_parent_turn() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("child-prompt");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "启动多个 subagent".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: spawn_tool("tc_sub", Some("sa-1"), true),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t2".into(),
                message_id: "m2".into(),
                kind: UserMessageKind::Normal,
                text: "You are exploring the Atmos monorepo at /tmp for architecture notes and report back.".into(),
                attachments: Vec::new(),
            },
        );

        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "启动多个 subagent");
        assert!(activity.children[0]
            .prompt
            .as_deref()
            .unwrap()
            .contains("exploring"));
    }

    #[test]
    fn grok_hook_nested_tool_with_subagent_id_stays_on_child() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:hook-child");
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "explore the repo",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "spawn_subagent",
                "tool_input": {
                    "subagent_type": "general-purpose",
                    "prompt": "You are exploring the Atmos monorepo at /tmp for architecture notes."
                },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "subagent_id": "sa-plan",
                "tool_name": "read_file",
                "tool_input": { "path": "crates/runtime-manager/src/lib.rs" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.current_tool.as_ref().map(|t| t.name.as_str()) != Some("read_file"));
        let child = activity
            .children
            .iter()
            .find(|c| {
                c.current_tool
                    .as_ref()
                    .is_some_and(|t| t.name == "read_file")
                    || c.child_id == "sa-plan"
            })
            .expect("nested read should land on a child");
        assert_eq!(
            child.current_tool.as_ref().map(|t| t.name.as_str()),
            Some("read_file")
        );
    }

    #[test]
    fn wait_poll_does_not_become_parent_current_tool() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("wait");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "go".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: spawn_tool("tc_sub", Some("sa-1"), true),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "wait".into(),
                    parent_tool_call_id: None,
                    name: "get_command_or_subagent_output".into(),
                    title: None,
                    kind: AgentToolKind::Other,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Other {
                        value: serde_json::json!({}),
                    },
                    result: None,
                },
            },
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.current_tool.is_none());
        assert!(activity.turns[0].tools.is_empty());
    }
}
