//! Map vendor terminal-hook JSON onto Atmos `AgentEvent`.
//!
//! Occupancy adapters stay per-vendor (idle suppress, child lifecycle). Activity
//! and Observer fold only `AgentEvent`, same as Agent Chat.

use serde_json::{json, Value};

use super::{
    extract_child_agent_id, is_child_start_event, is_child_stop_event, nested_subagent_session_id,
};
use agent::{
    classify_tool, extract_background, extract_command, extract_cwd, extract_path, extract_query,
    extract_skill, extract_subagent, extract_subagent_prompt, extract_task_id, extract_url,
    is_ask_user_tool, AgentAskQuestion, AgentEvent, AgentPermissionRequest, AgentPlanDocumentTodo,
    AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus, ClassifiedTool,
    TextKind, TurnStop, UserMessageKind,
};

use crate::service::agent_status::{AgentToolType, CHILD_STOP_TITLE};

pub(crate) fn hook_payload_is_permission(payload: &Value) -> bool {
    matches!(classify_hook(None, payload), HookKind::Permission)
}

pub(crate) fn hook_event_key(payload: &Value) -> String {
    collapse_event(&event_name(payload))
}

/// Stable id for one approval. The same payload must produce the same id
/// when the hook is observed and when the HTTP handler arms the wait.
pub(crate) fn hook_permission_request_id(payload: &Value) -> String {
    if let Some(id) = extracted_tool_call_id(payload) {
        return id;
    }
    let tool = tool_name(payload).unwrap_or_else(|| "tool".to_string());
    let input = tool_input(payload).cloned().unwrap_or(Value::Null);
    let questions = questions_from_input(&input);
    let detail = permission_description(&tool, &input, &questions);
    format!("{tool}:{detail}")
}

/// Codex already has a reviewer. An empty body hands the decision back.
pub(crate) fn codex_defers_permission(payload: &Value) -> bool {
    let reviewer = payload
        .get("approvals_reviewer")
        .or_else(|| payload.get("approvalsReviewer"))
        .or_else(|| payload.get("_approvals_reviewer"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    reviewer == "auto_review" || reviewer == "guardian_subagent"
}

pub(crate) fn hook_tool_input(payload: &Value) -> Value {
    tool_input(payload).cloned().unwrap_or(Value::Null)
}

pub(crate) fn hook_payload_to_events(payload: &Value) -> Vec<AgentEvent> {
    hook_payload_to_events_for(None, payload)
}

pub(crate) fn hook_payload_to_events_for(
    tool: Option<AgentToolType>,
    payload: &Value,
) -> Vec<AgentEvent> {
    match classify_hook(tool, payload) {
        HookKind::Ignore => Vec::new(),
        HookKind::PromptSubmit => {
            if let Some(id) = extract_child_agent_id(payload) {
                vec![AgentEvent::ToolCallUpdated {
                    tool_call: subagent_tool(payload, id, AgentToolStatus::Running, false),
                }]
            } else {
                vec![AgentEvent::UserMessage {
                    turn_id: new_id(),
                    message_id: new_id(),
                    kind: UserMessageKind::Normal,
                    text: extract_prompt(payload).unwrap_or_default(),
                    attachments: Vec::new(),
                }]
            }
        }
        HookKind::ToolPending => tool_hook_events(payload, AgentToolStatus::Running),
        HookKind::ToolOk => tool_hook_events(payload, AgentToolStatus::Completed),
        HookKind::ToolError => tool_hook_events(payload, AgentToolStatus::Failed),
        HookKind::Permission => vec![AgentEvent::PermissionRequested {
            request: permission_request_from_hook(payload),
        }],
        HookKind::CloseTurn => close_turn_events(payload),
        HookKind::ChildStart => extract_child_agent_id(payload)
            .map(|id| AgentEvent::ToolCallStarted {
                tool_call: subagent_tool(payload, id, AgentToolStatus::Running, false),
            })
            .into_iter()
            .collect(),
        HookKind::ChildStop => child_stop_events(payload),
        HookKind::SessionStart => vec![AgentEvent::SessionStarted {
            persistence_handle: None,
        }],
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HookKind {
    Ignore,
    PromptSubmit,
    ToolPending,
    ToolOk,
    ToolError,
    Permission,
    CloseTurn,
    ChildStart,
    ChildStop,
    SessionStart,
}

fn classify_hook(tool: Option<AgentToolType>, payload: &Value) -> HookKind {
    let raw = event_name(payload);
    if is_child_start_event(&raw) {
        return HookKind::ChildStart;
    }
    if is_child_stop_event(&raw) {
        return HookKind::ChildStop;
    }
    let key = collapse_event(&raw);
    match key.as_str() {
        "userpromptsubmit" | "beforeagent" | "beforesubmitprompt" | "beforeagentstart"
        | "chatmessage" => HookKind::PromptSubmit,
        "prellmcall" => {
            if extract_prompt(payload).is_some() {
                HookKind::PromptSubmit
            } else {
                HookKind::Ignore
            }
        }
        "preinvocation" => {
            let invocation = payload
                .get("invocationNum")
                .or_else(|| payload.get("invocation_num"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            if invocation == 0 && extract_prompt(payload).is_some() {
                HookKind::PromptSubmit
            } else {
                HookKind::Ignore
            }
        }
        "agentstart" => {
            if extract_prompt(payload).is_some() {
                HookKind::PromptSubmit
            } else {
                HookKind::Ignore
            }
        }
        "pretooluse"
        | "beforetool"
        | "toolexecutebefore"
        | "toolcall"
        | "pretoolcall"
        | "beforeshellexecution" => HookKind::ToolPending,
        "beforetoolselection" | "postinvocation" => {
            if tool_name(payload).is_some() {
                if key == "beforetoolselection" {
                    HookKind::ToolPending
                } else {
                    HookKind::ToolOk
                }
            } else {
                HookKind::Ignore
            }
        }
        "posttooluse" | "aftertool" | "toolexecuteafter" | "toolresult" | "posttoolcall" => {
            HookKind::ToolOk
        }
        "posttoolusefailure" => HookKind::ToolError,
        "permissionrequest" | "permissionasked" | "questionasked" | "permissionupdated" => {
            HookKind::Permission
        }
        // OpenCode deny ends the turn (occupancy TerminalIdle). A grant stays running.
        "permissionreplied" => {
            if permission_reply_denies(payload) {
                HookKind::CloseTurn
            } else {
                HookKind::Ignore
            }
        }
        "sessionstart" | "onsessionstart" | "agentspawn" | "sessioncreated" => {
            HookKind::SessionStart
        }
        "stop" | "stopfailure" | "sessionend" | "agentend" | "afteragent" | "sessionidle"
        | "sessionerror" | "sessionshutdown" | "onsessionend" | "afteragentresponse"
        | "precompress" | "postllmcall" => HookKind::CloseTurn,
        "notification" => classify_notification(tool, payload),
        _ => {
            if payload.get("type").and_then(|v| v.as_str()) == Some("tool.execute.before") {
                HookKind::ToolPending
            } else if payload.get("type").and_then(|v| v.as_str()) == Some("tool.execute.after") {
                HookKind::ToolOk
            } else {
                HookKind::Ignore
            }
        }
    }
}

fn tool_hook_events(payload: &Value, status: AgentToolStatus) -> Vec<AgentEvent> {
    let name = resolved_tool_name(payload);
    if is_ask_user_tool(&name) {
        return vec![AgentEvent::PermissionRequested {
            request: permission_request_from_hook(payload),
        }];
    }
    let input = classification_input(payload);
    match classify_tool(&name, None, Some(&input)) {
        ClassifiedTool::Hide | ClassifiedTool::Thinking => return Vec::new(),
        _ => {}
    }
    let tool_call = hook_tool(payload, status);
    vec![match status {
        AgentToolStatus::Failed => AgentEvent::ToolCallFailed {
            tool_call,
            error: None,
        },
        AgentToolStatus::Completed => AgentEvent::ToolCallCompleted { tool_call },
        AgentToolStatus::Pending | AgentToolStatus::Running => {
            AgentEvent::ToolCallStarted { tool_call }
        }
    }]
}

fn hook_tool(payload: &Value, status: AgentToolStatus) -> AgentTool {
    let name = resolved_tool_name(payload);
    let actor_id = top_level_child_id(payload);
    if is_spawn_tool_name(&name)
        || matches!(
            classify_tool(&name, None, Some(&classification_input(payload))),
            ClassifiedTool::Call(AgentToolKind::Subagent)
        )
    {
        return spawn_hook_tool(payload, &name, actor_id, status);
    }
    let input = classification_input(payload);
    let kind = match classify_tool(&name, None, Some(&input)) {
        ClassifiedTool::Call(kind) => kind,
        _ => AgentToolKind::Other,
    };
    let params = if kind == AgentToolKind::Other {
        raw_tool_params(payload)
    } else {
        typed_tool_params(kind, &name, &input)
    };
    let parent = actor_id.or_else(|| {
        tool_input(payload).and_then(|value| {
            non_empty_field(
                value,
                &[
                    "agent_id",
                    "agentId",
                    "subagent_id",
                    "subagentId",
                    "child_session_id",
                    "childSessionId",
                    "child_id",
                    "childId",
                ],
            )
        })
    });
    AgentTool {
        tool_call_id: tool_call_id(payload),
        parent_tool_call_id: parent,
        name,
        title: None,
        kind,
        status,
        params,
        result: hook_tool_result(payload, kind),
    }
}

fn spawn_hook_tool(
    payload: &Value,
    name: &str,
    actor_id: Option<String>,
    status: AgentToolStatus,
) -> AgentTool {
    let input = tool_input(payload);
    let (mut agent_type, mut description) = subagent_labels(payload);
    if agent_type.is_none() {
        agent_type = input.and_then(subagent_type_of);
    }
    if description.is_none() {
        description = input.and_then(|value| non_empty_field(value, &["description", "label"]));
    }
    let description = description
        .or_else(|| agent_type.clone())
        .unwrap_or_else(|| name.to_string());
    let prompt = input
        .and_then(|value| non_empty_field(value, &["prompt"]))
        .or_else(|| extract_prompt(payload));
    // On a spawn tool the payload child id is the actor (parent), not the new child.
    // The new id comes from the tool input when it differs from that actor.
    let task_from_input = input.and_then(input_task_id);
    let parent = parent_agent_id(payload).or_else(|| match (&actor_id, &task_from_input) {
        (Some(actor), Some(task)) if actor != task => Some(actor.clone()),
        (Some(actor), None) => Some(actor.clone()),
        _ => None,
    });
    let task_id = task_from_input.filter(|id| parent.as_deref() != Some(id.as_str()));
    let call_id = extracted_tool_call_id(payload)
        .or_else(|| task_id.clone())
        .unwrap_or_default();
    AgentTool {
        tool_call_id: call_id,
        parent_tool_call_id: parent.filter(|id| !id.is_empty()),
        name: name.to_string(),
        title: agent_type.clone(),
        kind: AgentToolKind::Subagent,
        status,
        params: AgentToolParams::Subagent {
            description,
            agent_type,
            task_id,
            prompt,
        },
        result: None,
    }
}

fn is_spawn_tool_name(name: &str) -> bool {
    matches!(
        name.trim()
            .to_ascii_lowercase()
            .replace(['-', ' '], "_")
            .as_str(),
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

fn subagent_tool(
    payload: &Value,
    child_id: &str,
    status: AgentToolStatus,
    stop: bool,
) -> AgentTool {
    let (agent_type, description) = subagent_labels(payload);
    let description = description
        .or_else(|| agent_type.clone())
        .unwrap_or_default();
    let name = agent_type
        .clone()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let text = description.trim();
            (!text.is_empty()).then(|| text.to_string())
        })
        .unwrap_or_else(|| "subagent".to_string());
    AgentTool {
        tool_call_id: child_id.to_string(),
        parent_tool_call_id: parent_agent_id(payload).filter(|id| id != child_id),
        name,
        title: stop.then(|| CHILD_STOP_TITLE.to_string()),
        kind: AgentToolKind::Subagent,
        status,
        params: AgentToolParams::Subagent {
            description,
            agent_type,
            task_id: Some(child_id.to_string()),
            prompt: extract_prompt(payload),
        },
        result: None,
    }
}

fn raw_tool_params(payload: &Value) -> AgentToolParams {
    let mut value = tool_input(payload).cloned().unwrap_or_else(|| json!({}));
    if value.get("todos").is_none() {
        if let Some(todos) = payload.get("todos") {
            match value.as_object_mut() {
                Some(obj) => {
                    obj.insert("todos".into(), todos.clone());
                }
                None => value = json!({ "todos": todos }),
            }
        }
    }
    AgentToolParams::Other { value }
}

fn permission_reply_denies(payload: &Value) -> bool {
    let response = payload
        .get("properties")
        .and_then(|value| value.as_object())
        .and_then(|properties| {
            properties
                .get("response")
                .or_else(|| properties.get("decision"))
                .or_else(|| properties.get("outcome"))
        })
        .and_then(|value| value.as_str())
        .unwrap_or("");
    matches!(
        response,
        "reject" | "reject_once" | "reject_always" | "denied" | "deny"
    )
}

fn classify_notification(tool: Option<AgentToolType>, payload: &Value) -> HookKind {
    let kind = payload
        .get("notification_type")
        .or_else(|| payload.get("notificationType"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if kind.contains("permission") || kind.contains("elicitation") {
        return HookKind::Permission;
    }
    if !kind.is_empty() {
        return HookKind::Ignore;
    }
    let message = payload
        .get("message")
        .or_else(|| payload.get("notificationMessage"))
        .or_else(|| payload.get("text"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("waiting for your input") || lower.contains("waiting for input") {
        return HookKind::CloseTurn;
    }
    if message.is_empty()
        || lower.contains("permission")
        || lower.contains("approve")
        || lower.contains("approval")
    {
        return HookKind::Permission;
    }
    // Gemini and Antigravity treat every Notification as a permission, including
    // a status line that is not itself the word "permission".
    if matches!(
        tool,
        Some(AgentToolType::Gemini) | Some(AgentToolType::Antigravity)
    ) {
        return HookKind::Permission;
    }
    HookKind::Ignore
}

fn resolved_tool_name(payload: &Value) -> String {
    if let Some(name) = tool_name(payload) {
        return name;
    }
    if collapse_event(&event_name(payload)) == "beforeshellexecution" {
        return "Shell".to_string();
    }
    "tool".to_string()
}

fn classification_input(payload: &Value) -> Value {
    let mut input = tool_input(payload).cloned().unwrap_or_else(|| json!({}));
    if let (Some(obj), Some(root)) = (input.as_object_mut(), payload.as_object()) {
        for key in [
            "command",
            "cmd",
            "file_path",
            "filePath",
            "path",
            "diff",
            "patch",
        ] {
            if !obj.contains_key(key) {
                if let Some(value) = root.get(key) {
                    obj.insert(key.to_string(), value.clone());
                }
            }
        }
    }
    input
}

fn typed_tool_params(kind: AgentToolKind, _name: &str, input: &Value) -> AgentToolParams {
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
        AgentToolKind::Edit | AgentToolKind::Delete => extract_path(input)
            .map(|path| {
                if kind == AgentToolKind::Delete {
                    AgentToolParams::Delete { path }
                } else {
                    AgentToolParams::Edit { path }
                }
            })
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
        AgentToolKind::Search => extract_query(input)
            .map(|query| AgentToolParams::Search {
                path: extract_path(input),
                glob: non_empty_field(input, &["glob", "glob_pattern"]),
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
                    non_empty_field(input, &["description", "prompt", "task"]).unwrap_or_default(),
                    subagent_type_of(input),
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
        AgentToolKind::Move => match (
            non_empty_field(input, &["from", "old_path", "source"]),
            non_empty_field(input, &["to", "new_path", "destination"]),
        ) {
            (Some(from), Some(to)) => AgentToolParams::Move { from, to },
            _ => AgentToolParams::Other {
                value: input.clone(),
            },
        },
        AgentToolKind::McpList
        | AgentToolKind::McpCall
        | AgentToolKind::ImageGen
        | AgentToolKind::PlanDocument
        | AgentToolKind::Other => AgentToolParams::Other {
            value: input.clone(),
        },
    }
}

fn json_i64(input: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|key| {
        input.get(*key).and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().map(|n| n as i64))
                .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))
        })
    })
}

fn hook_tool_result(payload: &Value, kind: AgentToolKind) -> Option<AgentToolResult> {
    if let Some((old_content, new_content)) = diff_pair(payload) {
        return Some(AgentToolResult::Diff {
            path: extract_path(&classification_input(payload)).unwrap_or_default(),
            old_content,
            new_content,
        });
    }
    if let Some(text) = diff_text(payload) {
        return Some(AgentToolResult::Text { text });
    }
    let output = output_text(payload)?;
    if kind == AgentToolKind::Execute {
        Some(AgentToolResult::Execute {
            output,
            exit_code: exit_code(payload),
        })
    } else {
        Some(AgentToolResult::Text { text: output })
    }
}

fn diff_pair(payload: &Value) -> Option<(Option<String>, String)> {
    for source in response_sources(payload) {
        if let Some(new_content) = body_field(
            source,
            &["new_string", "new_content", "newString", "newContent"],
        ) {
            let old_content = body_field(
                source,
                &["old_string", "old_content", "oldString", "oldContent"],
            );
            return Some((old_content, new_content));
        }
    }
    None
}

fn diff_text(payload: &Value) -> Option<String> {
    for source in response_sources(payload) {
        if let Some(text) = body_field(source, &["diff", "patch", "unified_diff", "unifiedDiff"]) {
            return Some(text);
        }
    }
    None
}

fn output_text(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "tool_response",
        "toolResponse",
        "tool_output",
        "toolOutput",
        "stdout",
        "result",
        "output",
    ];
    for key in KEYS {
        if let Some(value) = payload.get(*key) {
            if let Some(text) = response_text(value) {
                return Some(text);
            }
        }
    }
    None
}

fn response_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => body_text(text),
        Value::Array(_) => text_from_parts(Some(value)),
        Value::Object(_) => {
            if value.get("args").is_some() || value.get("arguments").is_some() {
                return value
                    .get("output")
                    .or_else(|| value.get("stdout"))
                    .or_else(|| value.get("text"))
                    .and_then(response_text);
            }
            for key in [
                "output", "stdout", "text", "content", "diff", "patch", "result",
            ] {
                if let Some(text) = value.get(key).and_then(response_text) {
                    return Some(text);
                }
            }
            text_from_parts(value.get("parts"))
        }
        _ => None,
    }
}

fn exit_code(payload: &Value) -> Option<i32> {
    for source in response_sources(payload) {
        for key in ["exit_code", "exitCode"] {
            if let Some(code) = source.get(key).and_then(|value| {
                value
                    .as_i64()
                    .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))
            }) {
                return Some(code as i32);
            }
        }
    }
    None
}

fn response_sources(payload: &Value) -> Vec<&Value> {
    let mut sources = vec![payload];
    for key in [
        "tool_response",
        "toolResponse",
        "tool_output",
        "toolOutput",
        "tool_input",
        "toolInput",
    ] {
        if let Some(value) = payload.get(key) {
            sources.push(value);
        }
    }
    sources
}

fn top_level_child_id(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "agent_id",
        "agentId",
        "subagent_id",
        "subagentId",
        "child_session_id",
        "childSessionId",
        "child_id",
        "childId",
    ];
    non_empty_field(payload, KEYS)
        .or_else(|| nested_subagent_session_id(payload).map(str::to_string))
}

fn parent_agent_id(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "parent_agent_id",
        "parentAgentId",
        "parent_subagent_id",
        "parentSubagentId",
        "parent_id",
        "parentId",
    ];
    non_empty_field(payload, KEYS)
        .or_else(|| tool_input(payload).and_then(|input| non_empty_field(input, KEYS)))
}

fn subagent_labels(payload: &Value) -> (Option<String>, Option<String>) {
    let agent_type =
        subagent_type_of(payload).or_else(|| tool_input(payload).and_then(subagent_type_of));
    let description = non_empty_field(payload, &["description", "label"]).or_else(|| {
        tool_input(payload).and_then(|input| non_empty_field(input, &["description", "label"]))
    });
    (agent_type, description)
}

fn subagent_type_of(value: &Value) -> Option<String> {
    non_empty_field(
        value,
        &["subagent_type", "subagentType", "agent_type", "agentType"],
    )
}

fn input_task_id(input: &Value) -> Option<String> {
    non_empty_field(
        input,
        &[
            "task_id",
            "taskId",
            "subagent_id",
            "subagentId",
            "agent_id",
            "agentId",
        ],
    )
}

fn body_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|item| item.as_str())
            .and_then(body_text)
    })
}

fn body_text(text: &str) -> Option<String> {
    if text.trim().is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn non_empty_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

fn extracted_tool_call_id(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "tool_use_id",
        "toolUseId",
        "tool_call_id",
        "toolCallId",
        "call_id",
        "callId",
    ];
    for source in [
        payload,
        payload.get("tool_input").unwrap_or(&Value::Null),
        payload.get("toolInput").unwrap_or(&Value::Null),
        payload.get("toolCall").unwrap_or(&Value::Null),
        payload.get("tool_call").unwrap_or(&Value::Null),
    ] {
        for key in KEYS {
            if let Some(id) = source
                .get(*key)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return Some(id.to_string());
            }
        }
    }
    None
}

fn tool_call_id(payload: &Value) -> String {
    extracted_tool_call_id(payload).unwrap_or_else(new_id)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
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

fn close_turn_events(payload: &Value) -> Vec<AgentEvent> {
    let mut events = Vec::new();
    if let Some(text) = extract_assistant_reply(payload) {
        events.push(reply_text_event(None, text));
    }
    events.push(AgentEvent::TurnCompleted {
        turn_id: new_id(),
        stop: TurnStop::Completed,
    });
    events
}

fn child_stop_events(payload: &Value) -> Vec<AgentEvent> {
    let Some(id) = extract_child_agent_id(payload) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    if let Some(text) = extract_assistant_reply(payload) {
        events.push(reply_text_event(Some(id.to_string()), text));
    }
    events.push(AgentEvent::ToolCallCompleted {
        tool_call: subagent_tool(payload, id, AgentToolStatus::Completed, true),
    });
    events
}

fn reply_text_event(parent_part_id: Option<String>, text: String) -> AgentEvent {
    AgentEvent::TextChunk {
        part_id: "atmos.reply".into(),
        message_id: new_id(),
        parent_part_id,
        ordinal: 0,
        kind: TextKind::Answer,
        offset: 0,
        text,
    }
}

/// Assistant text a close hook actually carried.
/// User prompts and notification bodies are not replies. Thinking text is not either.
fn extract_assistant_reply(payload: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "last_assistant_message",
        "lastAssistantMessage",
        "assistant_message",
        "assistantMessage",
    ];
    if let Some(text) = non_empty_field(payload, KEYS) {
        return Some(text);
    }
    // Cursor afterAgentResponse puts the assistant string in `text`.
    // afterAgentThought uses the same key for reasoning, and that event is not a close.
    if collapse_event(&event_name(payload)) == "afteragentresponse" {
        return payload
            .get("text")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string);
    }
    None
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

pub(crate) fn permission_request_from_hook(payload: &Value) -> AgentPermissionRequest {
    let tool = tool_name(payload).unwrap_or_else(|| "agent".to_string());
    let input = tool_input(payload).cloned().unwrap_or(Value::Null);
    let questions = questions_from_input(&input);
    let markdown = markdown_from_input(&input);
    let plan_todos = plan_todos_from_input(&input);
    let description = permission_description(&tool, &input, &questions);
    AgentPermissionRequest {
        request_id: hook_permission_request_id(payload),
        tool,
        description,
        content_markdown: markdown,
        options: Vec::new(),
        questions,
        plan_todos,
    }
}

fn questions_from_input(input: &Value) -> Vec<AgentAskQuestion> {
    let Some(items) = input.get("questions").and_then(|value| value.as_array()) else {
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let prompt = item
                .get("question")
                .or_else(|| item.get("prompt"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|text| !text.is_empty())?;
            let id = item
                .get("id")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| index.to_string());
            let options = item
                .get("options")
                .and_then(|value| value.as_array())
                .map(|options| {
                    options
                        .iter()
                        .filter_map(|option| {
                            option.as_str().map(str::to_string).or_else(|| {
                                option
                                    .get("label")
                                    .and_then(|value| value.as_str())
                                    .map(str::to_string)
                            })
                        })
                        .map(|label| label.trim().to_string())
                        .filter(|label| !label.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            Some(AgentAskQuestion {
                id,
                prompt: prompt.to_string(),
                options,
            })
        })
        .collect()
}

fn markdown_from_input(input: &Value) -> Option<String> {
    for key in [
        "plan",
        "plan_markdown",
        "planMarkdown",
        "content_markdown",
        "markdown",
    ] {
        if let Some(text) = input.get(key).and_then(|value| value.as_str()) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn plan_todos_from_input(input: &Value) -> Vec<AgentPlanDocumentTodo> {
    let Some(items) = input
        .get("plan_todos")
        .or_else(|| input.get("todos"))
        .and_then(|value| value.as_array())
    else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let content = item
                .get("content")
                .or_else(|| item.get("title"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|text| !text.is_empty())?;
            Some(AgentPlanDocumentTodo {
                id: item
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                content: content.to_string(),
                status: item
                    .get("status")
                    .and_then(|value| value.as_str())
                    .unwrap_or("pending")
                    .to_string(),
            })
        })
        .collect()
}

fn permission_description(tool: &str, input: &Value, questions: &[AgentAskQuestion]) -> String {
    if let Some(question) = questions.first() {
        return clip(&question.prompt, 160);
    }
    for key in [
        "command",
        "cmd",
        "description",
        "file_path",
        "filePath",
        "path",
        "prompt",
    ] {
        if let Some(text) = input.get(key).and_then(|value| value.as_str()) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return clip(trimmed, 160);
            }
        }
    }
    tool.to_string()
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    text.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
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

fn tool_input(payload: &Value) -> Option<&Value> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_subagent_start_becomes_subagent_tool() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "SubagentStart",
            "subagent_id": "sa-plan",
            "subagent_type": "Explore",
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert_eq!(tool_call.kind, AgentToolKind::Subagent);
        assert_eq!(tool_call.tool_call_id, "sa-plan");
        let AgentToolParams::Subagent {
            agent_type,
            task_id,
            ..
        } = &tool_call.params
        else {
            panic!("expected subagent params");
        };
        assert_eq!(agent_type.as_deref(), Some("Explore"));
        assert_eq!(task_id.as_deref(), Some("sa-plan"));
    }

    #[test]
    fn prompt_and_tool_become_user_message_and_tool_call() {
        let prompt = hook_payload_to_events(&json!({
            "hook_event_name": "UserPromptSubmit",
            "prompt": "fix footer",
        }));
        assert!(matches!(
            &prompt[0],
            AgentEvent::UserMessage { text, .. } if text == "fix footer"
        ));
        let tool = hook_payload_to_events(&json!({
            "hook_event_name": "PreToolUse",
            "tool_name": "Edit",
            "tool_input": { "file_path": "Footer.tsx" },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &tool[0] else {
            panic!("expected tool start");
        };
        assert_eq!(tool_call.name, "Edit");
        assert_eq!(tool_call.kind, AgentToolKind::Edit);
        let AgentToolParams::Edit { path } = &tool_call.params else {
            panic!("expected edit params");
        };
        assert_eq!(path, "Footer.tsx");
    }

    #[test]
    fn child_origin_tool_sets_parent_id() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "PreToolUse",
            "agent_id": "c1",
            "tool_name": "Read",
            "tool_input": { "file_path": "a.rs" },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert_eq!(tool_call.parent_tool_call_id.as_deref(), Some("c1"));
        assert_eq!(tool_call.kind, AgentToolKind::Read);
    }

    #[test]
    fn spawn_subagent_pre_tool_is_subagent_kind() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "PreToolUse",
            "tool_name": "spawn_subagent",
            "tool_input": {
                "subagent_type": "general-purpose",
                "prompt": "You are exploring the tree"
            },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert_eq!(tool_call.kind, AgentToolKind::Subagent);
        let AgentToolParams::Subagent {
            agent_type, prompt, ..
        } = &tool_call.params
        else {
            panic!("expected subagent params");
        };
        assert_eq!(agent_type.as_deref(), Some("general-purpose"));
        assert_eq!(prompt.as_deref(), Some("You are exploring the tree"));
        assert!(tool_call.tool_call_id.is_empty());
    }

    #[test]
    fn child_prompt_submit_updates_subagent_instead_of_user_message() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "UserPromptSubmit",
            "subagent_id": "sa-1",
            "prompt": "You are exploring the Atmos monorepo",
        }));
        let AgentEvent::ToolCallUpdated { tool_call } = &events[0] else {
            panic!("expected subagent update, got {:?}", events[0]);
        };
        assert_eq!(tool_call.kind, AgentToolKind::Subagent);
        assert_eq!(tool_call.tool_call_id, "sa-1");
        let AgentToolParams::Subagent { prompt, .. } = &tool_call.params else {
            panic!("expected subagent params");
        };
        assert_eq!(
            prompt.as_deref(),
            Some("You are exploring the Atmos monorepo")
        );
    }

    #[test]
    fn nested_tool_input_subagent_id_sets_parent() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "PreToolUse",
            "tool_name": "read_file",
            "tool_input": { "path": "a.rs", "subagent_id": "sa-1" },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert_eq!(tool_call.parent_tool_call_id.as_deref(), Some("sa-1"));
    }

    #[test]
    fn grok_child_session_id_sets_parent_when_subagent_type_is_present() {
        let events = hook_payload_to_events(&json!({
            "hookEventName": "PreToolUse",
            "sessionId": "01a10069-972b-77a0-b2dd-451ebcb390d2",
            "subagentType": "general-purpose",
            "toolName": "read_file",
            "toolInput": { "path": "agents/references/runtime/atmos-home-layout.md" },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert_eq!(
            tool_call.parent_tool_call_id.as_deref(),
            Some("01a10069-972b-77a0-b2dd-451ebcb390d2")
        );
        assert_eq!(tool_call.name, "read_file");
        assert!(tool_call.title.is_none());
    }

    #[test]
    fn lead_session_id_without_subagent_type_is_not_a_child() {
        let events = hook_payload_to_events(&json!({
            "hookEventName": "PreToolUse",
            "sessionId": "01a10069-282b-7ae0-95f7-8ee0b55e9d2a",
            "toolName": "Bash",
            "toolInput": { "command": "ls" },
        }));
        let AgentEvent::ToolCallStarted { tool_call } = &events[0] else {
            panic!("expected tool start");
        };
        assert!(tool_call.parent_tool_call_id.is_none());
        assert_eq!(tool_call.name, "Bash");
    }

    #[test]
    fn claude_stop_keeps_last_assistant_message() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "Stop",
            "last_assistant_message": "The footer now matches.",
        }));
        assert!(matches!(
            &events[0],
            AgentEvent::TextChunk {
                kind: TextKind::Answer,
                parent_part_id: None,
                text,
                ..
            } if text == "The footer now matches."
        ));
        assert!(matches!(events[1], AgentEvent::TurnCompleted { .. }));
    }

    #[test]
    fn stop_without_assistant_text_does_not_invent_a_reply() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "Stop",
            "session_id": "s1",
            "transcript_path": "/tmp/transcript.jsonl",
            "message": "waiting for your input",
        }));
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], AgentEvent::TurnCompleted { .. }));
    }

    #[test]
    fn cursor_after_agent_response_uses_text() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "afterAgentResponse",
            "text": "Renamed the card.",
        }));
        assert!(matches!(
            &events[0],
            AgentEvent::TextChunk { text, .. } if text == "Renamed the card."
        ));
    }

    #[test]
    fn cursor_thought_text_is_not_a_reply() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "afterAgentThought",
            "text": "I should read the drawer first.",
        }));
        assert!(events.is_empty());
    }

    #[test]
    fn subagent_stop_reply_stays_on_the_child() {
        let events = hook_payload_to_events(&json!({
            "hook_event_name": "SubagentStop",
            "agent_id": "sa-1",
            "last_assistant_message": "Specs live under specs/.",
        }));
        assert!(matches!(
            &events[0],
            AgentEvent::TextChunk {
                parent_part_id: Some(parent),
                text,
                ..
            } if parent == "sa-1" && text == "Specs live under specs/."
        ));
        assert!(matches!(events[1], AgentEvent::ToolCallCompleted { .. }));
    }

    #[test]
    fn grok_child_prompt_uses_session_id_when_subagent_type_is_present() {
        let events = hook_payload_to_events(&json!({
            "hookEventName": "UserPromptSubmit",
            "sessionId": "sa-plan",
            "subagentType": "general-purpose",
            "prompt": "You are exploring the Atmos monorepo",
        }));
        let AgentEvent::ToolCallUpdated { tool_call } = &events[0] else {
            panic!("expected subagent update, got {:?}", events[0]);
        };
        assert_eq!(tool_call.kind, AgentToolKind::Subagent);
        assert_eq!(tool_call.tool_call_id, "sa-plan");
    }
}
