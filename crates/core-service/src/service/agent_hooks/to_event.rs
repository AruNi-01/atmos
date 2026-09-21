//! Map vendor terminal-hook JSON onto Atmos `AgentEvent`.
//!
//! Occupancy adapters stay per-vendor (idle suppress, child lifecycle). Activity
//! and Observer fold only `AgentEvent`, same as Agent Chat.

use serde_json::{json, Value};

use super::{extract_child_agent_id, is_child_start_event, is_child_stop_event};
use agent::{
    AgentEvent, AgentPermissionRequest, AgentTool, AgentToolKind, AgentToolParams, AgentToolStatus,
    TurnStop, UserMessageKind,
};

pub(crate) fn hook_payload_to_events(payload: &Value) -> Vec<AgentEvent> {
    match classify_hook(payload) {
        HookKind::Ignore => Vec::new(),
        HookKind::PromptSubmit => {
            if let Some(id) = extract_child_agent_id(payload) {
                vec![AgentEvent::ToolCallUpdated {
                    tool_call: subagent_tool(payload, id, AgentToolStatus::Running),
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
        HookKind::ToolPending => vec![AgentEvent::ToolCallStarted {
            tool_call: hook_tool(payload, AgentToolStatus::Running),
        }],
        HookKind::ToolOk => vec![AgentEvent::ToolCallCompleted {
            tool_call: hook_tool(payload, AgentToolStatus::Completed),
        }],
        HookKind::ToolError => vec![AgentEvent::ToolCallFailed {
            tool_call: hook_tool(payload, AgentToolStatus::Failed),
            error: None,
        }],
        HookKind::Permission => vec![AgentEvent::PermissionRequested {
            request: AgentPermissionRequest {
                request_id: new_id(),
                tool: tool_name(payload).unwrap_or_else(|| "agent".to_string()),
                description: String::new(),
                content_markdown: None,
                options: Vec::new(),
                questions: Vec::new(),
                plan_todos: Vec::new(),
            },
        }],
        HookKind::CloseTurn => vec![AgentEvent::TurnCompleted {
            turn_id: new_id(),
            stop: TurnStop::Completed,
        }],
        HookKind::ChildStart => extract_child_agent_id(payload)
            .map(|id| AgentEvent::ToolCallStarted {
                tool_call: subagent_tool(payload, id, AgentToolStatus::Running),
            })
            .into_iter()
            .collect(),
        HookKind::ChildStop => extract_child_agent_id(payload)
            .map(|id| AgentEvent::ToolCallCompleted {
                tool_call: subagent_tool(payload, id, AgentToolStatus::Completed),
            })
            .into_iter()
            .collect(),
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

fn classify_hook(payload: &Value) -> HookKind {
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
        "pretooluse" | "beforetool" | "toolexecutebefore" | "toolcall" | "pretoolcall" => {
            HookKind::ToolPending
        }
        "posttooluse" | "aftertool" | "toolexecuteafter" | "toolresult" | "posttoolcall" => {
            HookKind::ToolOk
        }
        "posttoolusefailure" => HookKind::ToolError,
        "permissionrequest" | "permissionasked" | "questionasked" => HookKind::Permission,
        "sessionstart" => HookKind::SessionStart,
        "stop" | "stopfailure" | "sessionend" | "agentend" | "afteragent" | "sessionidle"
        | "sessionerror" | "sessionshutdown" | "onsessionend" | "afteragentresponse" => {
            HookKind::CloseTurn
        }
        "notification" => {
            let n = payload
                .get("notification_type")
                .or_else(|| payload.get("notificationType"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if n.contains("permission") || n.contains("elicitation") {
                HookKind::Permission
            } else {
                HookKind::Ignore
            }
        }
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

fn hook_tool(payload: &Value, status: AgentToolStatus) -> AgentTool {
    let child_id = extract_child_agent_id(payload).map(str::to_string);
    let name = tool_name(payload).unwrap_or_else(|| "tool".to_string());
    if is_spawn_tool_name(&name) {
        return spawn_hook_tool(payload, &name, child_id, status);
    }
    AgentTool {
        tool_call_id: tool_call_id(payload),
        parent_tool_call_id: child_id,
        name,
        title: None,
        kind: AgentToolKind::Other,
        status,
        params: tool_params(payload),
        result: None,
    }
}

fn spawn_hook_tool(
    payload: &Value,
    name: &str,
    child_id: Option<String>,
    status: AgentToolStatus,
) -> AgentTool {
    let input = tool_input(payload);
    let named = child_name(payload);
    let agent_type = input
        .and_then(|value| {
            value
                .get("subagent_type")
                .or_else(|| value.get("subagentType"))
                .or_else(|| value.get("agent_type"))
                .or_else(|| value.get("agentType"))
                .and_then(|v| v.as_str())
        })
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or(named);
    let description = input
        .and_then(|value| value.get("description").and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| agent_type.clone())
        .unwrap_or_else(|| name.to_string());
    let prompt = input
        .and_then(|value| value.get("prompt").and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| extract_prompt(payload));
    let task_id = child_id.clone().or_else(|| {
        input.and_then(|value| {
            value
                .get("task_id")
                .or_else(|| value.get("taskId"))
                .or_else(|| value.get("subagent_id"))
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
    });
    let call_id = extracted_tool_call_id(payload)
        .or_else(|| task_id.clone())
        .unwrap_or_default();
    AgentTool {
        tool_call_id: call_id,
        parent_tool_call_id: None,
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

fn subagent_tool(payload: &Value, child_id: &str, status: AgentToolStatus) -> AgentTool {
    let name = child_name(payload);
    AgentTool {
        tool_call_id: child_id.to_string(),
        parent_tool_call_id: None,
        name: name.clone().unwrap_or_else(|| "subagent".to_string()),
        title: name.clone(),
        kind: AgentToolKind::Subagent,
        status,
        params: AgentToolParams::Subagent {
            description: name.clone().unwrap_or_default(),
            agent_type: name,
            task_id: Some(child_id.to_string()),
            prompt: extract_prompt(payload),
        },
        result: None,
    }
}

fn tool_params(payload: &Value) -> AgentToolParams {
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

fn child_name(payload: &Value) -> Option<String> {
    payload
        .get("subagent_type")
        .or_else(|| payload.get("subagentType"))
        .or_else(|| payload.get("agent_type"))
        .or_else(|| payload.get("agentType"))
        .or_else(|| payload.get("label"))
        .or_else(|| payload.get("description"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
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
        assert_eq!(tool_call.kind, AgentToolKind::Other);
        let AgentToolParams::Other { value } = &tool_call.params else {
            panic!("expected other params");
        };
        assert_eq!(
            value.get("file_path").and_then(|v| v.as_str()),
            Some("Footer.tsx")
        );
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
        assert_eq!(tool_call.kind, AgentToolKind::Other);
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
}
