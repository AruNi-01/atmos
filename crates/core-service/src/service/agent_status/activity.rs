//! Fine-grained Agent Observer activity (turns, tools, todos, children).
//!
//! Coarse `idle` / `running` / `permission_request` stays on the session map.
//! This module is the only writer of turn history.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::service::agent_chat::types::apply_text_offset;
use agent::{
    is_grok_chrome_subagent_name, AgentEvent, AgentPermissionRequest, AgentTool, AgentToolKind,
    AgentToolParams, AgentToolStatus, GrokGoal, GrokWorkflow, TextKind, UserMessageKind,
};

use super::{
    AgentOccupancy, AgentStatusContext, AgentStatusEvent, AgentStatusRecord, AgentStatusService,
    AgentSurface, AgentToolType,
};

const TURNS_MAX: usize = 50;
const TOOLS_PER_TURN: usize = 32;
const RECENT_TOOLS_CHILD: usize = 8;
const DETAIL_CHARS: usize = 120;
const OUTPUT_CHARS: usize = 8_000;
/// User and child prompts kept for the drawer. The card clips in CSS, and the
/// bubble expands on click. This only bounds the snapshot.
const PROMPT_CHARS: usize = 32_000;
/// Final assistant text kept on a turn or child. The snapshot is not a transcript.
const REPLY_CHARS: usize = 16_000;
/// Title marker on a terminal child-stop hook. Spawn-tool completion is not a stop.
pub(crate) const CHILD_STOP_TITLE: &str = "atmos.child_stop";
const TODO_WIRE: usize = 40;
const CHILD_PROMPT_STEAL_CHARS: usize = 40;
const RUN_GAP: Duration = Duration::from_secs(8);

fn is_false(value: &bool) -> bool {
    !*value
}

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
    /// Agent Chat tool kind (`edit`, `execute`, …). Missing on older snapshots.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// Tool output text. Short bodies stay intact; very long bodies are clipped.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Edit diff or patch. Present only when the payload carried one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTodoItem {
    pub content: String,
    pub status: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentLiveKind {
    #[default]
    Idle,
    Thinking,
    Streaming,
    Working,
    Tool,
    Permission,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentPendingQuestion {
    pub id: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentPendingOption {
    pub option_id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentPendingPlanTodo {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// Permission or question waiting on this session. The card shows one line;
/// the panel answers it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentPendingPermission {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_markdown: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<AgentPendingOption>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub questions: Vec<AgentPendingQuestion>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plan_todos: Vec<AgentPendingPlanTodo>,
}

#[derive(Debug, Clone, PartialEq)]
struct ReplyPart {
    part_id: String,
    ordinal: u32,
    text: String,
}

#[derive(Debug, Clone, PartialEq)]
struct PendingReply {
    parent_id: String,
    part_id: String,
    ordinal: u32,
    offset: u64,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentChildActivity {
    pub child_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Subagent type from Agent Chat params or the hook payload. Not a merge key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    /// Subagent description. Separate from `agent_type`. Not a merge key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Child that spawned this one. Absent on a direct child of the lead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_child_id: Option<String>,
    pub state: AgentOccupancy,
    #[serde(default)]
    pub live_kind: AgentLiveKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_tool: Option<AgentToolLine>,
    pub recent_tools: Vec<AgentToolLine>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Final answer text. Absent when the source never sent one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
    pub started_at: String,
    pub last_event_at: String,
    /// Grok chrome rows stay hidden after a restart. Absent on ordinary children.
    #[serde(default, skip_serializing_if = "is_false")]
    chrome: bool,
    #[serde(default, skip)]
    reply_parts: Vec<ReplyPart>,
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
    /// Final answer text for this turn. Absent when the source never sent one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
    #[serde(default, skip)]
    reply_parts: Vec<ReplyPart>,
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
    #[serde(default)]
    pub live_kind: AgentLiveKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_permission: Option<AgentPendingPermission>,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    grok_goal_child_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    grok_workflow_child_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    child_aliases: HashMap<String, String>,
    /// Answer chunks whose parent tool call is not a child yet.
    #[serde(default, skip)]
    pending_replies: Vec<PendingReply>,
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
        self.activity_snapshot()
    }

    pub(super) fn activity_snapshot(&self) -> Vec<AgentActivity> {
        self.activity.read().values().cloned().collect()
    }

    pub(super) fn queue_activity_save(&self) {
        if !self
            .persist
            .enabled
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            return;
        }
        let snapshot = self.activity_snapshot();
        if self.persist.sync.load(std::sync::atomic::Ordering::Relaxed) {
            super::activity_store::write_activity_snapshot(&self.persist, &snapshot);
            return;
        }
        *self.persist.pending.lock() = Some(snapshot);
        self.persist.cv.notify_one();
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
            self.queue_activity_save();
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
        activity.pending_permission = None;
        activity.last_event_at = now;
        if children_still_running(activity) {
            activity.live_kind = AgentLiveKind::Working;
            activity.last_state = AgentOccupancy::Running;
        } else {
            activity.live_kind = AgentLiveKind::Idle;
            activity.last_state = AgentOccupancy::Idle;
        }
        if activity.visible_clone() != before {
            let snapshot = activity.clone();
            drop(map);
            let _ = self
                .event_tx
                .send(AgentStatusEvent::ActivityUpdated(Box::new(snapshot)));
            self.queue_activity_save();
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
        self.queue_activity_save();
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

impl Drop for AgentStatusService {
    fn drop(&mut self) {
        if !self
            .persist
            .enabled
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            return;
        }
        super::activity_store::write_activity_final(&self.persist, &self.activity_snapshot());
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
        live_kind: AgentLiveKind::Idle,
        pending_permission: None,
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
        pending_replies: Vec::new(),
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
        reply: None,
        reply_parts: Vec::new(),
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
        let distinct_body = last.output.is_some()
            || line.output.is_some()
            || last.diff.is_some()
            || line.diff.is_some()
            || last.old_content.is_some()
            || line.old_content.is_some()
            || last.new_content.is_some()
            || line.new_content.is_some();
        if !distinct_body && last.name == line.name && last.state != "pending" {
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
    Prompt {
        text: String,
    },
    ToolPending {
        tool: AgentTool,
    },
    ToolOk {
        tool: AgentTool,
    },
    ToolError {
        tool: AgentTool,
    },
    Todos {
        todos: Vec<AgentTodoItem>,
    },
    Permission {
        request: AgentPermissionRequest,
    },
    PermissionResolved,
    Live {
        kind: AgentLiveKind,
    },
    Answer {
        part_id: String,
        parent_part_id: Option<String>,
        ordinal: u32,
        offset: u64,
        text: String,
    },
    CloseTurn,
    Bind,
    GrokGoal {
        goal: Option<GrokGoal>,
    },
    GrokWorkflow {
        workflow: Option<GrokWorkflow>,
    },
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
        AgentEvent::TextChunk {
            kind: TextKind::Thinking,
            parent_part_id,
            ..
        } => {
            if parent_part_id.is_some() {
                None
            } else {
                Some(HostFold::Live {
                    kind: AgentLiveKind::Thinking,
                })
            }
        }
        AgentEvent::TextChunk {
            part_id,
            parent_part_id,
            ordinal,
            offset,
            text,
            kind: TextKind::Answer,
            ..
        } => Some(HostFold::Answer {
            part_id: part_id.clone(),
            parent_part_id: parent_part_id.clone(),
            ordinal: *ordinal,
            offset: *offset,
            text: text.clone(),
        }),
        AgentEvent::PermissionRequested { request } => Some(HostFold::Permission {
            request: request.clone(),
        }),
        AgentEvent::PermissionResolved { .. } => Some(HostFold::PermissionResolved),
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
        HostFold::Permission { request } => {
            activity.pending_permission = Some(pending_from_request(&request));
            activity.live_kind = AgentLiveKind::Permission;
            if let Some(child) = activity.children.last_mut() {
                if child.current_tool.is_some() {
                    child.state = AgentOccupancy::PermissionRequest;
                    child.live_kind = AgentLiveKind::Permission;
                    child.last_event_at = now.to_string();
                }
            }
        }
        HostFold::PermissionResolved => {
            activity.pending_permission = None;
            if activity.current_tool.is_some() {
                activity.live_kind = AgentLiveKind::Tool;
            } else if activity.live_kind == AgentLiveKind::Permission {
                activity.live_kind = AgentLiveKind::Working;
            }
        }
        HostFold::Live { kind } => {
            if activity.pending_permission.is_none() && activity.current_tool.is_none() {
                activity.live_kind = kind;
            }
        }
        HostFold::Answer {
            part_id,
            parent_part_id,
            ordinal,
            offset,
            text,
        } => apply_answer_chunk(
            activity,
            &part_id,
            parent_part_id.as_deref(),
            ordinal,
            offset,
            &text,
            now,
        ),
        HostFold::CloseTurn => {
            close_open_turn(activity, now);
            activity.current_tool = None;
            activity.current_turn_id = None;
            activity.pending_permission = None;
            let child_running = children_still_running(activity);
            activity.live_kind = if child_running {
                AgentLiveKind::Working
            } else {
                AgentLiveKind::Idle
            };
            for child in &mut activity.children {
                if child_is_live(child) {
                    continue;
                }
                if child.live_kind != AgentLiveKind::Idle {
                    child.live_kind = AgentLiveKind::Idle;
                }
            }
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
    flush_pending_replies(activity, now);
    keep_lead_running_while_children(activity);
}

fn child_is_live(child: &AgentChildActivity) -> bool {
    matches!(
        child.state,
        AgentOccupancy::Running | AgentOccupancy::PermissionRequest
    )
}

fn children_still_running(activity: &AgentActivity) -> bool {
    activity.children.iter().any(child_is_live)
}

/// A live child keeps the lead running. Spawn-tool completion does not settle it.
fn keep_lead_running_while_children(activity: &mut AgentActivity) {
    if !children_still_running(activity) {
        return;
    }
    if activity.last_state == AgentOccupancy::Idle {
        activity.last_state = AgentOccupancy::Running;
    }
    if activity.live_kind == AgentLiveKind::Idle {
        activity.live_kind = AgentLiveKind::Working;
    }
}

fn apply_prompt(activity: &mut AgentActivity, text: &str, now: &str) {
    if steal_prompt_for_child(activity, text, now) {
        return;
    }
    let trimmed = text.trim();
    if trimmed.is_empty() {
        if let Some(turn) = current_turn_mut(activity) {
            if turn.ended_at.is_none() && turn.prompt.is_empty() {
                activity.current_tool = None;
                activity.live_kind = AgentLiveKind::Working;
                return;
            }
        }
        if activity.current_turn_id.is_none() {
            open_turn(activity, String::new(), now);
        }
        activity.current_tool = None;
        activity.pending_permission = None;
        activity.live_kind = AgentLiveKind::Working;
        return;
    }
    if should_reset_for_new_prompt(activity) {
        reset_activity_for_new_prompt(activity);
    }
    if let Some(turn) = current_turn_mut(activity) {
        if turn.ended_at.is_none() && turn.prompt.is_empty() {
            turn.prompt = truncate(trimmed, PROMPT_CHARS);
            activity.current_tool = None;
            activity.pending_permission = None;
            activity.live_kind = AgentLiveKind::Working;
            return;
        }
    }
    close_open_turn(activity, now);
    open_turn(activity, trimmed.to_string(), now);
    activity.current_tool = None;
    activity.pending_permission = None;
    activity.live_kind = AgentLiveKind::Working;
}

fn should_reset_for_new_prompt(activity: &AgentActivity) -> bool {
    activity.turns.iter().any(|turn| !turn.prompt.is_empty()) || !activity.children.is_empty()
}

fn reset_activity_for_new_prompt(activity: &mut AgentActivity) {
    activity.turns.clear();
    activity.turns_omitted = 0;
    activity.current_turn_id = None;
    activity.current_tool = None;
    activity.pending_permission = None;
    activity.live_kind = AgentLiveKind::Working;
    activity.children.clear();
    activity.child_aliases.clear();
    activity.pending_replies.clear();
    activity.todos.clear();
    activity.last_file = None;
    activity.grok_goal_child_ids.clear();
    activity.grok_workflow_child_ids.clear();
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
            activity.live_kind = AgentLiveKind::Idle;
            return;
        }
        ensure_open_turn(activity, now);
        if let Some(path) = host_tool_path(tool, project_path) {
            activity.last_file = Some(path);
        }
        activity.current_tool = Some(host_tool_line(tool, project_path, now, "pending"));
        activity.pending_permission = None;
        activity.live_kind = AgentLiveKind::Tool;
        return;
    }
    let state = if error { "error" } else { "ok" };
    if session_idle {
        complete_late_host_tool(activity, tool, project_path, now, state);
        activity.current_tool = None;
        activity.live_kind = AgentLiveKind::Idle;
        return;
    }
    ensure_open_turn(activity, now);
    complete_lead_host_tool(activity, tool, project_path, now, state);
    if activity.pending_permission.is_none() {
        activity.live_kind = AgentLiveKind::Working;
    }
}

fn apply_host_subagent(activity: &mut AgentActivity, tool: &AgentTool, now: &str, pending: bool) {
    let call_id = tool.tool_call_id.trim().to_string();
    // The spawn shell may live under an alias of this call id (`spawn:*` or the
    // call id itself). A later notice uses a different session id; fold that shell in.
    let prior = child_id_for_call(activity, &call_id);
    let mut ids = host_subagent_ids(tool);
    if ids.is_empty() {
        if let Some(existing) = prior.clone() {
            ids.push(existing);
        } else if pending {
            ids.push(next_ephemeral_spawn_id(activity));
        } else if let Some(existing) = latest_ephemeral_spawn_id(activity) {
            ids.push(existing);
        } else {
            return;
        }
    }
    let preferred = ids
        .iter()
        .find(|id| !is_ephemeral_spawn_id(id))
        .cloned()
        .unwrap_or_else(|| pick_canonical_child(activity, &ids));
    let parent_hint = tool
        .parent_tool_call_id
        .as_deref()
        .map(|id| canonical_child_id(activity, id))
        .filter(|id| !id.is_empty());
    let canonical = adopt_child_id(activity, &preferred, parent_hint.as_deref());
    for id in &ids {
        register_child_alias(activity, id, &canonical);
        if id != &canonical {
            merge_child(activity, id, &canonical);
        }
    }
    if let Some(prior) = prior {
        if prior != canonical {
            merge_child(activity, &prior, &canonical);
        }
    }
    if !call_id.is_empty() {
        register_child_alias(activity, &call_id, &canonical);
        if call_id != canonical {
            merge_child(activity, &call_id, &canonical);
        }
    }
    let chrome = is_grok_chrome_subagent_name(&tool.name);
    let parent_child_id = spawning_parent_id(activity, tool);
    let (agent_type, description) = host_child_labels(tool);
    upsert_host_child(
        activity,
        &canonical,
        host_child_name(tool),
        agent_type,
        description,
        parent_child_id,
        now,
        chrome,
    );
    let child_stop = is_child_stop_tool(tool);
    // Chat: the subagent tool completing or failing is that child's stop.
    // Terminal: completing the parent's spawn or task tool is only an ack.
    // A child-stop hook is the terminal stop. Dispatch acks never settle a child.
    let settle = child_stop
        || (activity.surface == AgentSurface::Chat && !chrome && !is_dispatch_ack_name(&tool.name));
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
        if pending || !settle {
            child.state = AgentOccupancy::Running;
            child.live_kind = AgentLiveKind::Working;
        } else {
            child.state = AgentOccupancy::Idle;
            child.live_kind = AgentLiveKind::Idle;
            if let Some(line) = child.current_tool.take() {
                push_aggregated_tool(&mut child.recent_tools, line, now, RECENT_TOOLS_CHILD);
            }
        }
    }
    if pending || !settle {
        if let Some(turn) = current_turn_mut(activity) {
            if !turn.spawned_child_ids.iter().any(|id| id == &canonical) {
                turn.spawned_child_ids.push(canonical.clone());
            }
        }
    }
    strip_chrome_tools_from_turns(activity);
    rehome_child_prompt_turns(activity);
}

fn is_child_stop_tool(tool: &AgentTool) -> bool {
    tool.title.as_deref() == Some(CHILD_STOP_TITLE)
}

fn spawning_parent_id(activity: &AgentActivity, tool: &AgentTool) -> Option<String> {
    let raw = tool.parent_tool_call_id.as_deref()?.trim();
    if raw.is_empty() {
        return None;
    }
    let canonical = canonical_child_id(activity, raw);
    if canonical.is_empty() {
        None
    } else {
        Some(canonical)
    }
}

fn child_id_for_call(activity: &AgentActivity, call_id: &str) -> Option<String> {
    if call_id.is_empty() {
        return None;
    }
    let resolved = canonical_child_id(activity, call_id);
    activity
        .children
        .iter()
        .any(|child| child.child_id == resolved)
        .then_some(resolved)
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
    let child_id = adopt_child_id(activity, child_id, None);
    let (agent_type, description) = host_child_labels(tool);
    // A child tool's title is the live event ("Read path"), not the card name.
    // Only a subagent payload may name the child (type · description).
    let name = match &tool.params {
        AgentToolParams::Subagent { .. } => host_child_name(tool),
        _ => None,
    };
    upsert_host_child(
        activity,
        &child_id,
        name,
        agent_type,
        description,
        None,
        now,
        false,
    );
    let mark_parent_working = {
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
            child.live_kind = AgentLiveKind::Tool;
            true
        } else {
            let state = if error { "error" } else { "ok" };
            let mut line = child
                .current_tool
                .take()
                .unwrap_or_else(|| host_tool_line(tool, project_path, now, state));
            absorb_tool_line(&mut line, tool, project_path);
            finish_tool_line(&mut line, now, state, host_tool_detail(tool, project_path));
            push_aggregated_tool(&mut child.recent_tools, line, now, RECENT_TOOLS_CHILD);
            child.live_kind = AgentLiveKind::Working;
            false
        }
    };
    if mark_parent_working
        && activity.pending_permission.is_none()
        && activity.current_tool.is_none()
    {
        activity.live_kind = AgentLiveKind::Working;
    }
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
    absorb_tool_line(&mut line, tool, project_path);
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
        absorb_tool_line(existing, tool, project_path);
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
    agent_type: Option<String>,
    description: Option<String>,
    parent_child_id: Option<String>,
    now: &str,
    chrome: bool,
) {
    let parent_child_id = parent_child_id.filter(|id| id != child_id);
    if let Some(child) = activity
        .children
        .iter_mut()
        .find(|c| c.child_id == child_id)
    {
        child.state = AgentOccupancy::Running;
        child.last_event_at = now.to_string();
        child.chrome = child.chrome || chrome;
        if child.agent_type.is_none() {
            child.agent_type = agent_type;
        }
        if child.description.is_none() {
            child.description = description;
        }
        if child.parent_child_id.is_none() {
            child.parent_child_id = parent_child_id;
        }
        if let Some(incoming) = name {
            match child.name.as_ref() {
                None => child.name = Some(incoming),
                Some(existing) if incoming.len() > existing.len() => {
                    child.name = Some(incoming);
                }
                Some(_) => {}
            }
        }
        return;
    }
    activity.children.push(AgentChildActivity {
        child_id: child_id.to_string(),
        name,
        agent_type,
        description,
        parent_child_id,
        state: AgentOccupancy::Running,
        live_kind: AgentLiveKind::Working,
        current_tool: None,
        recent_tools: Vec::new(),
        prompt: None,
        reply: None,
        started_at: now.to_string(),
        last_event_at: now.to_string(),
        chrome,
        reply_parts: Vec::new(),
    });
}

fn is_spawn_tool_name(name: &str) -> bool {
    matches!(
        normalize_tool_label(name).as_str(),
        "task"
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
    if let AgentToolParams::Subagent {
        task_id: Some(id), ..
    } = &tool.params
    {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            ids.push(trimmed.to_string());
        }
    }
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

fn is_ephemeral_spawn_id(id: &str) -> bool {
    id.starts_with("spawn:")
}

fn latest_ephemeral_spawn_id(activity: &AgentActivity) -> Option<String> {
    activity
        .children
        .iter()
        .rev()
        .find(|child| is_ephemeral_spawn_id(&child.child_id))
        .map(|child| child.child_id.clone())
}

fn next_ephemeral_spawn_id(activity: &AgentActivity) -> String {
    let turn = activity.current_turn_id.unwrap_or(0);
    let n = activity
        .children
        .iter()
        .filter(|child| is_ephemeral_spawn_id(&child.child_id))
        .count();
    format!("spawn:{turn}:{n}")
}

fn adopt_child_id(activity: &mut AgentActivity, incoming: &str, parent: Option<&str>) -> String {
    let incoming = incoming.trim();
    if incoming.is_empty() {
        return latest_ephemeral_spawn_id(activity)
            .unwrap_or_else(|| next_ephemeral_spawn_id(activity));
    }
    let resolved = canonical_child_id(activity, incoming);
    if activity
        .children
        .iter()
        .any(|child| child.child_id == resolved)
    {
        return resolved;
    }
    if is_ephemeral_spawn_id(&resolved) {
        return resolved;
    }
    // Pair this id with the spawn shell that belongs to the same parent.
    // A different child id is never merged just because the labels match.
    if let Some(ephemeral) = ephemeral_shell_for(activity, parent) {
        merge_child(activity, &ephemeral, &resolved);
        return resolved;
    }
    resolved
}

fn ephemeral_shell_for(activity: &AgentActivity, parent: Option<&str>) -> Option<String> {
    activity
        .children
        .iter()
        .find(|child| {
            if !is_ephemeral_spawn_id(&child.child_id) {
                return false;
            }
            match parent {
                Some(parent) => child.parent_child_id.as_deref() == Some(parent),
                None => child.parent_child_id.is_none(),
            }
        })
        .map(|child| child.child_id.clone())
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
    for turn in &mut activity.turns {
        let mut seen = HashSet::new();
        turn.spawned_child_ids = turn
            .spawned_child_ids
            .drain(..)
            .map(|id| {
                if id == from_id {
                    into_id.to_string()
                } else {
                    id
                }
            })
            .filter(|id| seen.insert(id.clone()))
            .collect();
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
        if into.agent_type.is_none() {
            into.agent_type = from.agent_type;
        }
        if into.description.is_none() {
            into.description = from.description;
        }
        if into.parent_child_id.is_none() {
            into.parent_child_id = from.parent_child_id;
        }
        if into.prompt.as_deref().unwrap_or("").is_empty() {
            into.prompt = from.prompt;
        }
        merge_reply_parts(&mut into.reply_parts, from.reply_parts);
        let published = publish_reply(&into.reply_parts);
        let previous = into.reply.clone();
        into.reply = published.or(from.reply).or(previous);
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
        if from.state == AgentOccupancy::Running || from.state == AgentOccupancy::PermissionRequest
        {
            into.state = from.state;
        }
        if from.live_kind != AgentLiveKind::Idle {
            into.live_kind = from.live_kind;
        }
        into.last_event_at = from.last_event_at;
        return;
    }
    let mut renamed = from;
    renamed.child_id = into_id.to_string();
    activity.children.push(renamed);
}

/// A tool belongs to a child only when the event names that child.
/// A lead tool with no child id stays on the lead, even while children run.
fn resolve_nested_child_id(activity: &AgentActivity, tool: &AgentTool) -> Option<String> {
    let parent = tool
        .parent_tool_call_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(canonical_child_id(activity, parent))
}

fn steal_prompt_for_child(activity: &AgentActivity, text: &str, _now: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || activity.children.is_empty() {
        return false;
    }
    let has_user_prompt = activity.turns.iter().any(|turn| !turn.prompt.is_empty());
    if !has_user_prompt {
        return false;
    }
    // A duplicate of a prompt already stored on a child is a leak of that
    // child's task. Any other text is the lead's next user message, even when
    // a child is still running or its prompt is still empty.
    let truncated = truncate(trimmed, PROMPT_CHARS);
    activity.children.iter().any(|child| {
        child.prompt.as_deref().is_some_and(|prompt| {
            !prompt.is_empty()
                && (prompt == truncated
                    || prompt.starts_with(trimmed)
                    || trimmed.starts_with(prompt))
        })
    })
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
        if activity.live_kind == AgentLiveKind::Tool {
            activity.live_kind = AgentLiveKind::Working;
        }
    }
}

pub(crate) fn pending_from_request(request: &AgentPermissionRequest) -> AgentPendingPermission {
    AgentPendingPermission {
        request_id: request.request_id.clone(),
        tool: request.tool.clone(),
        description: request.description.clone(),
        content_markdown: request.content_markdown.clone(),
        options: request
            .options
            .iter()
            .map(|option| AgentPendingOption {
                option_id: option.option_id.clone(),
                name: option.name.clone(),
                kind: option.kind.clone(),
            })
            .collect(),
        questions: request
            .questions
            .iter()
            .map(|question| AgentPendingQuestion {
                id: question.id.clone(),
                prompt: question.prompt.clone(),
                options: question.options.clone(),
            })
            .collect(),
        plan_todos: request
            .plan_todos
            .iter()
            .map(|todo| AgentPendingPlanTodo {
                id: todo.id.clone(),
                content: todo.content.clone(),
                status: Some(todo.status.clone()),
            })
            .collect(),
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
        } => {
            let kind = agent_type
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty());
            let desc = {
                let text = description.trim();
                if text.is_empty() {
                    None
                } else {
                    Some(truncate(text, DETAIL_CHARS))
                }
            };
            match (kind, desc) {
                (Some(kind), Some(desc)) if !kind.eq_ignore_ascii_case(&desc) => {
                    Some(format!("{kind} · {desc}"))
                }
                (Some(kind), _) => Some(kind.to_string()),
                (_, Some(desc)) => Some(desc),
                _ => None,
            }
        }
        _ => tool
            .title
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != CHILD_STOP_TITLE)
            .map(str::to_string),
    }
}

fn host_child_labels(tool: &AgentTool) -> (Option<String>, Option<String>) {
    match &tool.params {
        AgentToolParams::Subagent {
            description,
            agent_type,
            ..
        } => {
            let kind = agent_type
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            let desc = {
                let text = description.trim();
                if text.is_empty() {
                    None
                } else {
                    Some(truncate(text, DETAIL_CHARS))
                }
            };
            let desc = match (&kind, &desc) {
                (Some(kind), Some(desc)) if kind.eq_ignore_ascii_case(desc) => None,
                _ => desc,
            };
            (kind, desc)
        }
        _ => (None, None),
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
        .filter(|s| !s.is_empty() && *s != CHILD_STOP_TITLE)
        .unwrap_or("tool")
        .to_string()
}

fn host_tool_line(
    tool: &AgentTool,
    project_path: Option<&str>,
    now: &str,
    state: &str,
) -> AgentToolLine {
    let mut line = AgentToolLine {
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
        kind: None,
        output: None,
        diff: None,
        path: None,
        old_content: None,
        new_content: None,
    };
    absorb_tool_line(&mut line, tool, project_path);
    line
}

fn tool_kind_name(kind: AgentToolKind) -> String {
    serde_json::to_value(kind)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "other".to_string())
}

fn absorb_tool_line(line: &mut AgentToolLine, tool: &AgentTool, project_path: Option<&str>) {
    line.kind = Some(tool_kind_name(tool.kind));
    let (output, diff, old_content, new_content) = tool_bodies(tool);
    if let Some(output) = output {
        line.output = Some(truncate(&output, OUTPUT_CHARS));
    }
    if let Some(diff) = diff {
        line.diff = Some(truncate(&diff, OUTPUT_CHARS));
    }
    if let Some(old_content) = old_content {
        line.old_content = Some(truncate(&old_content, OUTPUT_CHARS));
    }
    if let Some(new_content) = new_content {
        line.new_content = Some(truncate(&new_content, OUTPUT_CHARS));
    }
    if let Some(path) = host_tool_path(tool, project_path) {
        line.path = Some(path);
    }
}

fn tool_bodies(
    tool: &AgentTool,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    match &tool.result {
        Some(agent::AgentToolResult::Text { text }) => {
            let diff =
                (tool.kind == AgentToolKind::Edit && looks_like_patch(text)).then(|| text.clone());
            (Some(text.clone()), diff, None, None)
        }
        Some(agent::AgentToolResult::Execute { output, .. }) => {
            (Some(output.clone()), None, None, None)
        }
        Some(agent::AgentToolResult::Error { message }) => {
            (Some(message.clone()), None, None, None)
        }
        Some(agent::AgentToolResult::FileContent { text, .. }) => {
            (Some(text.clone()), None, None, None)
        }
        Some(agent::AgentToolResult::Diff {
            old_content,
            new_content,
            ..
        }) => (None, None, old_content.clone(), Some(new_content.clone())),
        _ => (None, None, None, None),
    }
}

fn looks_like_patch(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("--- ")
        || trimmed.starts_with("diff --git ")
        || trimmed.starts_with("*** ")
        || trimmed.starts_with("@@ ")
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
        upsert_host_child(activity, id, name.clone(), None, None, None, now, true);
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

fn apply_answer_chunk(
    activity: &mut AgentActivity,
    part_id: &str,
    parent_part_id: Option<&str>,
    ordinal: u32,
    offset: u64,
    text: &str,
    now: &str,
) {
    let parent = parent_part_id.map(str::trim).filter(|id| !id.is_empty());
    if let Some(parent) = parent {
        if let Some(child_id) = child_id_for_call(activity, parent) {
            write_child_reply(activity, &child_id, part_id, ordinal, offset, text, now);
            return;
        }
        activity.pending_replies.push(PendingReply {
            parent_id: parent.to_string(),
            part_id: part_id.to_string(),
            ordinal,
            offset,
            text: text.to_string(),
        });
        return;
    }
    // A Stop hook marks the session idle, which closes the turn, before this
    // text is folded. The reply still belongs on that turn.
    let turn_was_open = activity.current_turn_id.is_some();
    if activity.turns.is_empty() {
        ensure_open_turn(activity, now);
    }
    if let Some(turn) = if activity.current_turn_id.is_some() {
        current_turn_mut(activity)
    } else {
        activity.turns.last_mut()
    } {
        turn.reply = absorb_reply_part(&mut turn.reply_parts, part_id, ordinal, offset, text);
    }
    if turn_was_open && activity.pending_permission.is_none() && activity.current_tool.is_none() {
        activity.live_kind = AgentLiveKind::Streaming;
    }
}

fn write_child_reply(
    activity: &mut AgentActivity,
    child_id: &str,
    part_id: &str,
    ordinal: u32,
    offset: u64,
    text: &str,
    now: &str,
) {
    let Some(child) = activity
        .children
        .iter_mut()
        .find(|child| child.child_id == child_id)
    else {
        return;
    };
    child.reply = absorb_reply_part(&mut child.reply_parts, part_id, ordinal, offset, text);
    child.last_event_at = now.to_string();
    if child.live_kind != AgentLiveKind::Permission && child.current_tool.is_none() {
        child.live_kind = AgentLiveKind::Streaming;
    }
}

fn flush_pending_replies(activity: &mut AgentActivity, now: &str) {
    if activity.pending_replies.is_empty() {
        return;
    }
    let pending = std::mem::take(&mut activity.pending_replies);
    for item in pending {
        if let Some(child_id) = child_id_for_call(activity, &item.parent_id) {
            write_child_reply(
                activity,
                &child_id,
                &item.part_id,
                item.ordinal,
                item.offset,
                &item.text,
                now,
            );
        } else {
            activity.pending_replies.push(item);
        }
    }
}

fn merge_reply_parts(into: &mut Vec<ReplyPart>, from: Vec<ReplyPart>) {
    for part in from {
        if let Some(existing) = into.iter_mut().find(|item| item.part_id == part.part_id) {
            if part.text.len() > existing.text.len() {
                *existing = part;
            }
        } else {
            into.push(part);
        }
    }
}

fn absorb_reply_part(
    parts: &mut Vec<ReplyPart>,
    part_id: &str,
    ordinal: u32,
    offset: u64,
    text: &str,
) -> Option<String> {
    if let Some(part) = parts.iter_mut().find(|part| part.part_id == part_id) {
        if part.text.chars().count() < REPLY_CHARS {
            apply_text_offset(&mut part.text, offset, text);
        }
        part.ordinal = ordinal;
    } else {
        let mut body = String::new();
        apply_text_offset(&mut body, offset, text);
        parts.push(ReplyPart {
            part_id: part_id.to_string(),
            ordinal,
            text: body,
        });
    }
    publish_reply(parts)
}

fn publish_reply(parts: &[ReplyPart]) -> Option<String> {
    let mut ordered: Vec<&ReplyPart> = parts.iter().collect();
    ordered.sort_by_key(|part| part.ordinal);
    let mut out = String::new();
    for part in ordered {
        if part.text.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&part.text);
    }
    let trimmed = out.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(truncate(trimmed, REPLY_CHARS))
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
    fn permission_request_is_the_live_step_until_the_tool_starts() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:agent");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PermissionRequest",
                "tool_name": "Bash",
                "tool_use_id": "tool-1",
                "tool_input": { "command": "rm -rf ./tmp" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.live_kind, AgentLiveKind::Permission);
        let pending = activity.pending_permission.as_ref().unwrap();
        assert_eq!(pending.request_id, "tool-1");
        assert_eq!(pending.tool, "Bash");
        assert_eq!(pending.description, "rm -rf ./tmp");

        let crate::service::agent_status::HookPermissionOpen::Wait(wait) = service
            .open_permission_wait(
                &serde_json::json!({
                    "hook_event_name": "PermissionRequest",
                    "tool_name": "Bash",
                    "tool_use_id": "tool-1",
                    "tool_input": { "command": "rm -rf ./tmp" },
                }),
                crate::service::agent_status::AgentToolType::ClaudeCode,
                &ctx,
            )
            .expect("permission wait")
        else {
            panic!("expected a blocking permission wait");
        };
        assert!(status.respond_hook_permission("ws-1:agent", "tool-1", "allow_once"));
        let decision = wait.rx.blocking_recv().expect("decision");
        assert!(decision.allow);
        let activity = &status.get_all_activity()[0];
        assert!(activity.pending_permission.is_none());
        assert_eq!(activity.live_kind, AgentLiveKind::Working);
    }

    #[test]
    fn prompt_opens_turn_tools_attach_idle_keeps_record_second_prompt_resets() {
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
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "also add tests");
        assert_eq!(activity.current_turn_id, Some(1));
        assert!(activity.children.is_empty());
        assert!(activity.todos.is_empty());
        assert!(activity.current_tool.is_none());
    }

    #[test]
    fn second_prompt_drops_previous_children() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:reset-children");
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
        assert_eq!(status.get_all_activity()[0].children.len(), 1);
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "next question",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "next question");
        assert!(activity.children.is_empty());
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
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "and tests");
        assert!(activity.children.is_empty());
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
    fn chat_answer_text_is_the_turn_reply_and_thinking_is_not() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("reply");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "scan the repo".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TextChunk {
                part_id: "think".into(),
                message_id: "m2".into(),
                parent_part_id: None,
                ordinal: 0,
                kind: TextKind::Thinking,
                offset: 0,
                text: "planning".into(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TextChunk {
                part_id: "answer".into(),
                message_id: "m2".into(),
                parent_part_id: None,
                ordinal: 1,
                kind: TextKind::Answer,
                offset: 0,
                text: "Hel".into(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TextChunk {
                part_id: "answer".into(),
                message_id: "m2".into(),
                parent_part_id: None,
                ordinal: 1,
                kind: TextKind::Answer,
                offset: 3,
                text: "lo".into(),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].reply.as_deref(), Some("Hello"));
        assert!(!activity.turns[0]
            .reply
            .as_deref()
            .unwrap()
            .contains("planning"));
    }

    #[test]
    fn child_answer_follows_the_tool_call_alias() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("child-reply");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "explore the repo".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "tc_sub".into(),
                    parent_tool_call_id: None,
                    name: "Task".into(),
                    title: Some("Explore".into()),
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "scan the tree".into(),
                        agent_type: Some("Explore".into()),
                        task_id: Some("child-1".into()),
                        prompt: None,
                    },
                    result: None,
                },
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::TextChunk {
                part_id: "child-answer".into(),
                message_id: "m-child".into(),
                parent_part_id: Some("tc_sub".into()),
                ordinal: 0,
                kind: TextKind::Answer,
                offset: 0,
                text: "hello from child".into(),
            },
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.turns[0].reply.is_none());
        let child = activity
            .children
            .iter()
            .find(|child| child.child_id == "child-1")
            .expect("child");
        assert_eq!(child.reply.as_deref(), Some("hello from child"));
    }

    #[test]
    fn cursor_after_agent_response_shows_on_the_turn() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("cursor-pane");
        service.handle_cursor_event(
            &serde_json::json!({
                "hook_event_name": "beforeSubmitPrompt",
                "prompt": "rename the card",
                "conversation_id": "c1",
            }),
            &ctx,
        );
        service.handle_cursor_event(
            &serde_json::json!({
                "hook_event_name": "afterAgentResponse",
                "conversation_id": "c1",
                "text": "Renamed the card.",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "rename the card");
        assert_eq!(
            activity.turns[0].reply.as_deref(),
            Some("Renamed the card.")
        );
    }

    #[test]
    fn claude_stop_without_assistant_text_leaves_the_reply_empty() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("claude-pane");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "fix the footer",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "Stop",
                "session_id": "s1",
                "transcript_path": "/tmp/transcript.jsonl",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.turns[0].reply.is_none());
        assert!(activity.turns[0].ended_at.is_some());
    }

    #[test]
    fn claude_stop_keeps_last_assistant_message_on_the_turn() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("claude-pane-2");
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "fix the footer",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "Stop",
                "last_assistant_message": "The footer now matches.",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(
            activity.turns[0].reply.as_deref(),
            Some("The footer now matches.")
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
        assert_eq!(
            activity.children[0].name.as_deref(),
            Some("Explore · scan the tree")
        );
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
    fn child_read_title_does_not_replace_subagent_name() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("title-stable");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "explore the repo".into(),
                attachments: Vec::new(),
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "tc-1".into(),
                    parent_tool_call_id: None,
                    name: "spawn_subagent".into(),
                    title: None,
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "Explore Atmos monorepo".into(),
                        agent_type: Some("general-purpose".into()),
                        task_id: Some("sa-plan".into()),
                        prompt: Some("You are exploring the Atmos monorepo".into()),
                    },
                    result: None,
                },
            },
        );
        let read_title =
            "Read /Users/aarynlu/OpenSource/atmos/agents/references/runtime/atmos-home-layout.md";
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "read-1".into(),
                    parent_tool_call_id: Some("sa-plan".into()),
                    name: "Read".into(),
                    title: Some(read_title.into()),
                    kind: AgentToolKind::Read,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Read {
                        path: "/Users/aarynlu/OpenSource/atmos/agents/references/runtime/atmos-home-layout.md"
                            .into(),
                        offset: None,
                        limit: None,
                    },
                    result: None,
                },
            },
        );
        let child = &status.get_all_activity()[0].children[0];
        assert_eq!(
            child.name.as_deref(),
            Some("general-purpose · Explore Atmos monorepo")
        );
        assert_eq!(child.agent_type.as_deref(), Some("general-purpose"));
        assert_eq!(child.description.as_deref(), Some("Explore Atmos monorepo"));
        assert_ne!(child.name.as_deref(), Some(read_title));
        assert_eq!(
            child.current_tool.as_ref().map(|tool| tool.name.as_str()),
            Some("Read")
        );
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
                text: "You are exploring the Atmos monorepo at /tmp for architecture notes.".into(),
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
        assert_eq!(activity.children.len(), 1);
        assert_eq!(child.child_id, "sa-plan");
        assert_eq!(
            child.current_tool.as_ref().map(|t| t.name.as_str()),
            Some("read_file")
        );
    }

    #[test]
    fn grok_child_tools_follow_session_id_when_subagent_type_is_set() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:grok-child-session");
        let child_id = "01a10069-972b-77a0-b2dd-451ebcb390d2";
        let parent_session = "01a10069-282b-7ae0-95f7-8ee0b55e9d2a";
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "UserPromptSubmit",
                "sessionId": parent_session,
                "prompt": "explore the repo",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "PreToolUse",
                "sessionId": parent_session,
                "toolUseId": "11111111-1111-4111-8111-111111111111",
                "toolName": "spawn_subagent",
                "toolInput": {
                    "subagent_type": "general-purpose",
                    "description": "Explore Atmos monorepo",
                    "prompt": "You are exploring the Atmos monorepo at /tmp for architecture notes."
                },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "SubagentStart",
                "sessionId": parent_session,
                "subagentId": child_id,
                "subagentType": "general-purpose",
                "description": "Explore Atmos monorepo",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "PreToolUse",
                "sessionId": child_id,
                "subagentType": "general-purpose",
                "toolName": "read_file",
                "toolUseId": "tool-read-1",
                "toolInput": { "path": "agents/references/runtime/atmos-home-layout.md" },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "PostToolUse",
                "sessionId": child_id,
                "subagentType": "general-purpose",
                "toolName": "read_file",
                "toolUseId": "tool-read-1",
                "toolInput": { "path": "agents/references/runtime/atmos-home-layout.md" },
                "toolResult": "layout notes",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "SubagentStop",
                "subagentId": child_id,
                "subagentType": "general-purpose",
                "sessionId": parent_session,
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        let child = &activity.children[0];
        assert_eq!(child.child_id, child_id);
        assert_eq!(
            child.name.as_deref(),
            Some("general-purpose · Explore Atmos monorepo")
        );
        assert!(
            child
                .recent_tools
                .iter()
                .any(|tool| tool.name == "read_file"),
            "read stays on the child after stop: {:?}",
            child.recent_tools
        );
        assert!(
            activity
                .current_tool
                .as_ref()
                .map(|tool| tool.name.as_str())
                != Some("read_file")
        );
        assert!(activity
            .turns
            .iter()
            .all(|turn| { turn.tools.iter().all(|tool| tool.name != "read_file") }));
    }

    #[test]
    fn hook_spawn_pre_and_post_without_ids_stay_one_child() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:hook-spawn-once");
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
                "tool_input": { "subagent_type": "general-purpose", "prompt": "Look at crates" },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "spawn_subagent",
                "tool_input": { "subagent_type": "general-purpose", "prompt": "Look at crates" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
    }

    #[test]
    fn hook_spawn_tool_use_id_and_subagent_start_stay_one_child() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:hook-spawn-uuid");
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
                "tool_use_id": "11111111-1111-4111-8111-111111111111",
                "tool_name": "spawn_subagent",
                "tool_input": { "subagent_type": "general-purpose", "prompt": "Look at crates" },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_use_id": "11111111-1111-4111-8111-111111111111",
                "tool_name": "spawn_subagent",
                "tool_input": { "subagent_type": "general-purpose", "prompt": "Look at crates" },
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
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "subagent_id": "sa-plan",
                "tool_name": "read_file",
                "tool_input": { "path": "Cargo.toml" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.children.len(), 1);
        assert_eq!(activity.children[0].child_id, "sa-plan");
        assert_eq!(
            activity.children[0]
                .current_tool
                .as_ref()
                .map(|t| t.name.as_str()),
            Some("read_file")
        );
    }

    #[test]
    fn hook_two_spawns_and_starts_are_two_children() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:hook-two-spawns");
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
                "tool_input": { "subagent_type": "Explore", "prompt": "Look at crates" },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "spawn_subagent",
                "tool_input": { "subagent_type": "Explore", "prompt": "Look at apps" },
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "subagent_id": "sa-a",
                "subagent_type": "Explore",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "subagent_id": "sa-b",
                "subagent_type": "Explore",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        let mut ids: Vec<_> = activity
            .children
            .iter()
            .map(|child| child.child_id.as_str())
            .collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["sa-a", "sa-b"]);
    }

    #[test]
    fn bare_type_spawn_and_session_id_stay_one_child() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("bare");
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
                tool_call: AgentTool {
                    tool_call_id: "tc-1".into(),
                    parent_tool_call_id: None,
                    name: "Task".into(),
                    title: None,
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "Explore".into(),
                        agent_type: Some("Explore".into()),
                        task_id: Some("tc-1".into()),
                        prompt: None,
                    },
                    result: None,
                },
            },
        );
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: AgentTool {
                    tool_call_id: "tc-1".into(),
                    parent_tool_call_id: None,
                    name: "Task".into(),
                    title: None,
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Running,
                    params: AgentToolParams::Subagent {
                        description: "Explore".into(),
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
    }

    #[test]
    fn parallel_chat_subagents_with_the_same_label_stay_distinct() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("multi");
        meta.provider_id = "grok".into();
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
        for (call_id, description) in [
            ("tc-specs", "Explore monorepo specs"),
            ("tc-rust", "Explore Rust backend"),
        ] {
            apply_host_event(
                &status,
                &meta,
                &AgentEvent::ToolCallStarted {
                    tool_call: AgentTool {
                        tool_call_id: call_id.into(),
                        parent_tool_call_id: None,
                        name: "spawn_subagent".into(),
                        title: None,
                        kind: AgentToolKind::Subagent,
                        status: agent::AgentToolStatus::Running,
                        params: AgentToolParams::Subagent {
                            description: description.into(),
                            agent_type: None,
                            task_id: Some(call_id.into()),
                            prompt: None,
                        },
                        result: None,
                    },
                },
            );
        }
        for (session_id, description) in [
            ("sa-specs", "Explore monorepo specs"),
            ("sa-rust", "Explore Rust backend"),
        ] {
            apply_host_event(
                &status,
                &meta,
                &AgentEvent::ToolCallStarted {
                    tool_call: AgentTool {
                        tool_call_id: session_id.into(),
                        parent_tool_call_id: None,
                        name: "spawn_subagent".into(),
                        title: None,
                        kind: AgentToolKind::Subagent,
                        status: agent::AgentToolStatus::Running,
                        params: AgentToolParams::Subagent {
                            description: description.into(),
                            agent_type: None,
                            task_id: Some(session_id.into()),
                            prompt: Some(format!("You are exploring {description}")),
                        },
                        result: None,
                    },
                },
            );
        }
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallStarted {
                tool_call: nested_read("read-1", "sa-specs", true),
            },
        );

        let activity = &status.get_all_activity()[0];
        let mut ids: Vec<_> = activity
            .children
            .iter()
            .map(|child| child.child_id.as_str())
            .collect();
        ids.sort_unstable();
        assert_eq!(
            ids,
            vec!["sa-rust", "sa-specs", "tc-rust", "tc-specs"],
            "shared descriptions must not merge distinct child ids"
        );
        let specs = activity
            .children
            .iter()
            .find(|child| child.child_id == "sa-specs")
            .expect("specs child");
        assert_eq!(
            specs.current_tool.as_ref().map(|tool| tool.name.as_str()),
            Some("read_file")
        );
        assert_eq!(specs.description.as_deref(), Some("Explore monorepo specs"));
    }

    #[test]
    fn same_label_with_prompts_on_both_sides_keeps_distinct_ids() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let mut meta = chat_meta("both-prompts");
        meta.provider_id = "grok".into();
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
        let prompt = "You are exploring Atmos at /Users/aarynlu/OpenSource/atmos";
        for (call_id, task_id) in [("tc-specs", "tc-specs"), ("sa-specs", "sa-specs")] {
            apply_host_event(
                &status,
                &meta,
                &AgentEvent::ToolCallStarted {
                    tool_call: AgentTool {
                        tool_call_id: call_id.into(),
                        parent_tool_call_id: None,
                        name: "spawn_subagent".into(),
                        title: None,
                        kind: AgentToolKind::Subagent,
                        status: agent::AgentToolStatus::Running,
                        params: AgentToolParams::Subagent {
                            description: "Explore monorepo specs".into(),
                            agent_type: None,
                            task_id: Some(task_id.into()),
                            prompt: Some(prompt.into()),
                        },
                        result: None,
                    },
                },
            );
        }
        let activity = &status.get_all_activity()[0];
        let mut ids: Vec<_> = activity
            .children
            .iter()
            .map(|child| child.child_id.as_str())
            .collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["sa-specs", "tc-specs"]);
        assert!(activity.children.iter().all(|child| {
            child.name.as_deref() == Some("Explore monorepo specs")
                && child.prompt.as_deref() == Some(prompt)
                && child.description.as_deref() == Some("Explore monorepo specs")
        }));
    }

    #[test]
    fn same_type_children_stay_running_until_their_own_stop_then_clear_on_prompt() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:roster-same-type");
        let spawn = |id: &str| {
            serde_json::json!({
                "tool_name": "Task",
                "tool_use_id": id,
                "tool_input": { "subagent_type": "Explore", "description": "scan" },
            })
        };
        service.handle_claude_code_event(
            &serde_json::json!({ "hook_event_name": "UserPromptSubmit", "prompt": "delegate" }),
            &ctx,
        );
        for id in ["t1", "t2"] {
            let mut pre = spawn(id);
            pre["hook_event_name"] = serde_json::json!("PreToolUse");
            service.handle_claude_code_event(&pre, &ctx);
            let mut post = spawn(id);
            post["hook_event_name"] = serde_json::json!("PostToolUse");
            service.handle_claude_code_event(&post, &ctx);
        }
        {
            let activity = &status.get_all_activity()[0];
            assert_eq!(activity.children.len(), 2);
            assert!(activity
                .children
                .iter()
                .all(|child| child.state == AgentOccupancy::Running));
        }
        for id in ["sa-a", "sa-b"] {
            service.handle_claude_code_event(
                &serde_json::json!({
                    "hook_event_name": "SubagentStart",
                    "agent_id": id,
                    "subagent_type": "Explore",
                    "description": "scan",
                }),
                &ctx,
            );
        }
        {
            let activity = &status.get_all_activity()[0];
            let mut ids: Vec<_> = activity
                .children
                .iter()
                .map(|child| child.child_id.as_str())
                .collect();
            ids.sort_unstable();
            assert_eq!(ids, vec!["sa-a", "sa-b"]);
            assert!(activity.children.iter().all(|child| {
                child.state == AgentOccupancy::Running
                    && child.agent_type.as_deref() == Some("Explore")
                    && child.description.as_deref() == Some("scan")
            }));
            assert_eq!(activity.last_state, AgentOccupancy::Running);
        }
        service.handle_claude_code_event(&serde_json::json!({ "hook_event_name": "Stop" }), &ctx);
        service.handle_claude_code_event(
            &serde_json::json!({ "hook_event_name": "SubagentStop", "agent_id": "sa-a" }),
            &ctx,
        );
        {
            let activity = &status.get_all_activity()[0];
            let stopped = activity
                .children
                .iter()
                .find(|child| child.child_id == "sa-a")
                .expect("stopped child stays visible");
            let running = activity
                .children
                .iter()
                .find(|child| child.child_id == "sa-b")
                .expect("sibling stays");
            assert_eq!(stopped.state, AgentOccupancy::Idle);
            assert_eq!(running.state, AgentOccupancy::Running);
            assert_eq!(activity.last_state, AgentOccupancy::Running);
            assert_eq!(activity.children.len(), 2);
        }
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "next question",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.children.is_empty());
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, "next question");
    }

    #[test]
    fn nested_child_stays_on_its_parent_not_the_lead() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:roster-nested");
        service.handle_claude_code_event(
            &serde_json::json!({ "hook_event_name": "UserPromptSubmit", "prompt": "delegate" }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "agent_id": "parent",
                "subagent_type": "Explore",
                "description": "scan the tree",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "agent_id": "parent",
                "tool_name": "Task",
                "tool_use_id": "nest-1",
                "tool_input": { "subagent_type": "Explore", "description": "read the crate" },
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStart",
                "agent_id": "kid",
                "parent_agent_id": "parent",
                "subagent_type": "Explore",
                "description": "read the crate",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "agent_id": "kid",
                "tool_name": "read_file",
                "tool_input": { "path": "a.rs" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        let kid = activity
            .children
            .iter()
            .find(|child| child.child_id == "kid")
            .expect("nested child");
        assert_eq!(kid.parent_child_id.as_deref(), Some("parent"));
        assert_eq!(kid.agent_type.as_deref(), Some("Explore"));
        assert_eq!(kid.description.as_deref(), Some("read the crate"));
        assert_eq!(
            kid.current_tool.as_ref().map(|tool| tool.name.as_str()),
            Some("read_file")
        );
        assert_eq!(kid.state, AgentOccupancy::Running);
        assert!(activity.turns.iter().all(|turn| turn
            .tools
            .iter()
            .all(|tool| tool.name != "read_file" && tool.name != "Task")));
        assert!(
            activity
                .current_tool
                .as_ref()
                .map(|tool| tool.name.as_str())
                != Some("read_file")
        );
        assert_eq!(activity.last_state, AgentOccupancy::Running);
    }

    #[test]
    fn chat_task_completion_idles_only_that_child() {
        use crate::service::agent_status::apply_host_event;

        let status = AgentStatusService::new();
        let meta = chat_meta("chat-roster");
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::UserMessage {
                turn_id: "t1".into(),
                message_id: "m1".into(),
                kind: UserMessageKind::Normal,
                text: "delegate".into(),
                attachments: Vec::new(),
            },
        );
        for (call_id, task_id) in [("tc-a", "sa-a"), ("tc-b", "sa-b")] {
            apply_host_event(
                &status,
                &meta,
                &AgentEvent::ToolCallStarted {
                    tool_call: AgentTool {
                        tool_call_id: call_id.into(),
                        parent_tool_call_id: None,
                        name: "Task".into(),
                        title: None,
                        kind: AgentToolKind::Subagent,
                        status: agent::AgentToolStatus::Running,
                        params: AgentToolParams::Subagent {
                            description: "scan".into(),
                            agent_type: Some("Explore".into()),
                            task_id: Some(task_id.into()),
                            prompt: None,
                        },
                        result: None,
                    },
                },
            );
        }
        apply_host_event(
            &status,
            &meta,
            &AgentEvent::ToolCallCompleted {
                tool_call: AgentTool {
                    tool_call_id: "tc-a".into(),
                    parent_tool_call_id: None,
                    name: "Task".into(),
                    title: None,
                    kind: AgentToolKind::Subagent,
                    status: agent::AgentToolStatus::Completed,
                    params: AgentToolParams::Subagent {
                        description: "scan".into(),
                        agent_type: Some("Explore".into()),
                        task_id: Some("sa-a".into()),
                        prompt: None,
                    },
                    result: None,
                },
            },
        );
        let activity = &status.get_all_activity()[0];
        let idle = activity
            .children
            .iter()
            .find(|child| child.child_id == "sa-a")
            .expect("completed chat child stays");
        let running = activity
            .children
            .iter()
            .find(|child| child.child_id == "sa-b")
            .expect("other child");
        assert_eq!(activity.children.len(), 2);
        assert_eq!(idle.state, AgentOccupancy::Idle);
        assert_eq!(running.state, AgentOccupancy::Running);
        assert_eq!(idle.agent_type.as_deref(), Some("Explore"));
        assert_eq!(idle.description.as_deref(), Some("scan"));
        assert_eq!(activity.last_state, AgentOccupancy::Running);
    }

    #[test]
    fn hook_tool_output_and_edit_diff_land_on_the_line() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:snapshot-bodies");
        let patch = "--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
        service.handle_claude_code_event(
            &serde_json::json!({ "hook_event_name": "UserPromptSubmit", "prompt": "edit" }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_use_id": "bash-1",
                "tool_input": { "command": "ls" },
                "tool_response": "observer-out",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "Edit",
                "tool_use_id": "edit-1",
                "tool_input": { "file_path": "src/b.ts" },
                "diff": patch,
            }),
            &ctx,
        );
        let tools = &status.get_all_activity()[0].turns[0].tools;
        let bash = tools.iter().find(|tool| tool.name == "Bash").expect("bash");
        let edit = tools.iter().find(|tool| tool.name == "Edit").expect("edit");
        assert_eq!(bash.kind.as_deref(), Some("execute"));
        assert_eq!(bash.output.as_deref(), Some("observer-out"));
        assert_ne!(bash.kind.as_deref(), Some("other"));
        assert_eq!(edit.kind.as_deref(), Some("edit"));
        assert_eq!(edit.diff.as_deref(), Some(patch));
        assert_eq!(edit.path.as_deref(), Some("src/b.ts"));
    }

    #[test]
    fn long_prompt_is_stored_whole_so_the_drawer_can_expand_it() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:long-prompt");
        let prompt = format!(
            "Explore the Atmos monorepo and return a concise orientation.\n\nThe user asked in Chinese: 启动 subagent，探索一下项目 — they want a project exploration, not coding.\n\n{}",
            "Keep the rest of the task. ".repeat(20)
        )
        .trim()
        .to_string();
        assert!(prompt.chars().count() > 240);
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": "delegate",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "spawn_subagent",
                "tool_input": {
                    "subagent_type": "general-purpose",
                    "prompt": prompt,
                },
            }),
            &ctx,
        );
        let child_prompt = status.get_all_activity()[0]
            .children
            .iter()
            .find_map(|child| child.prompt.clone())
            .expect("child prompt");
        assert_eq!(child_prompt, prompt);
        assert!(!child_prompt.contains('…'));

        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": prompt,
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(activity.turns[0].prompt, "delegate");
        assert_eq!(
            activity.children[0].prompt.as_deref(),
            Some(prompt.as_str())
        );

        let follow = "please refactor the observer drawer and keep the cards";
        service.handle_grok_build_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": follow,
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.children.is_empty());
        assert_eq!(activity.turns[0].prompt, follow);
    }

    #[test]
    fn long_follow_up_after_child_stop_clears_children_and_opens_the_turn() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:long-follow-up");
        let prompt = "please refactor the observer drawer and keep the cards";
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
                "agent_id": "child-1",
                "subagent_type": "Explore",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "SubagentStop",
                "agent_id": "child-1",
            }),
            &ctx,
        );
        assert_eq!(status.get_all_activity()[0].children.len(), 1);
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "UserPromptSubmit",
                "prompt": prompt,
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.children.is_empty());
        assert_eq!(activity.turns.len(), 1);
        assert_eq!(activity.turns[0].prompt, prompt);
    }

    #[test]
    fn unmatched_follow_up_while_child_runs_clears_children_and_opens_the_turn() {
        let prompt = "please refactor the observer drawer and keep the cards";
        for (label, start) in [
            (
                "with-prompt",
                serde_json::json!({
                    "hook_event_name": "SubagentStart",
                    "agent_id": "child-1",
                    "prompt": "scan the tree",
                }),
            ),
            (
                "empty-prompt",
                serde_json::json!({
                    "hook_event_name": "SubagentStart",
                    "agent_id": "child-1",
                }),
            ),
        ] {
            let status = Arc::new(AgentStatusService::new());
            let service = AgentHooksService::new(status.clone());
            let ctx = pane_ctx(&format!("ws-1:unmatched-{label}"));
            service.handle_claude_code_event(
                &serde_json::json!({
                    "hook_event_name": "UserPromptSubmit",
                    "prompt": "delegate",
                }),
                &ctx,
            );
            service.handle_claude_code_event(&start, &ctx);
            {
                let activity = &status.get_all_activity()[0];
                let child = activity
                    .children
                    .iter()
                    .find(|child| child.child_id == "child-1")
                    .expect("child stays running");
                assert_eq!(child.state, AgentOccupancy::Running);
                if label == "with-prompt" {
                    assert_eq!(child.prompt.as_deref(), Some("scan the tree"));
                } else {
                    assert!(child.prompt.as_deref().unwrap_or("").is_empty());
                }
            }
            service.handle_claude_code_event(
                &serde_json::json!({
                    "hook_event_name": "UserPromptSubmit",
                    "prompt": prompt,
                }),
                &ctx,
            );
            let activity = &status.get_all_activity()[0];
            assert!(activity.children.is_empty(), "{label} children cleared");
            assert_eq!(activity.turns.len(), 1, "{label} turn");
            assert_eq!(activity.turns[0].prompt, prompt, "{label} prompt");
        }
    }

    #[test]
    fn lead_bash_without_child_id_stays_on_the_lead() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:lead-bash");
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
                "agent_id": "child-1",
            }),
            &ctx,
        );
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": { "command": "ls" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(
            activity
                .current_tool
                .as_ref()
                .map(|tool| tool.name.as_str()),
            Some("Bash")
        );
        let child = activity
            .children
            .iter()
            .find(|child| child.child_id == "child-1")
            .expect("child stays");
        assert!(child.current_tool.is_none());
        assert!(child.recent_tools.iter().all(|tool| tool.name != "Bash"));
        service.handle_claude_code_event(
            &serde_json::json!({
                "hook_event_name": "PostToolUse",
                "tool_name": "Bash",
                "tool_input": { "command": "ls" },
                "tool_response": "ok",
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert!(activity.turns[0]
            .tools
            .iter()
            .any(|tool| tool.name == "Bash"));
        let child = activity
            .children
            .iter()
            .find(|child| child.child_id == "child-1")
            .expect("child stays");
        assert!(child.recent_tools.iter().all(|tool| tool.name != "Bash"));
        assert!(child.current_tool.as_ref().map(|tool| tool.name.as_str()) != Some("Bash"));
    }

    #[test]
    fn lead_bash_with_only_session_id_stays_on_the_lead() {
        let status = Arc::new(AgentStatusService::new());
        let service = AgentHooksService::new(status.clone());
        let ctx = pane_ctx("ws-1:lead-session");
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "UserPromptSubmit",
                "sessionId": "01a10069-282b-7ae0-95f7-8ee0b55e9d2a",
                "prompt": "delegate",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "SubagentStart",
                "subagentId": "child-1",
                "subagentType": "general-purpose",
                "sessionId": "01a10069-282b-7ae0-95f7-8ee0b55e9d2a",
            }),
            &ctx,
        );
        service.handle_grok_build_event(
            &serde_json::json!({
                "hookEventName": "PreToolUse",
                "sessionId": "01a10069-282b-7ae0-95f7-8ee0b55e9d2a",
                "toolName": "Bash",
                "toolInput": { "command": "ls" },
            }),
            &ctx,
        );
        let activity = &status.get_all_activity()[0];
        assert_eq!(
            activity
                .current_tool
                .as_ref()
                .map(|tool| tool.name.as_str()),
            Some("Bash")
        );
        let child = activity
            .children
            .iter()
            .find(|child| child.child_id == "child-1")
            .expect("child stays");
        assert!(child.current_tool.is_none());
        assert!(child.recent_tools.iter().all(|tool| tool.name != "Bash"));
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
