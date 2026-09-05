use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Fetch,
    Skill,
    Subagent,
    McpList,
    McpCall,
    #[default]
    Other,
}

/// How a vendor tool name should fold into an `AgentPart`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassifiedTool {
    Thinking,
    Plan,
    /// Mode sync tools fold into session config change parts (not tool cards).
    SyncMode,
    /// Only BashOutput / TaskOutput — frontend merges into the parent live card.
    Hide,
    Call(AgentToolKind),
}

pub fn classify_tool(
    name: &str,
    title: Option<&str>,
    input: Option<&serde_json::Value>,
) -> ClassifiedTool {
    let name = normalize_label(name);
    let title = title.map(normalize_label).unwrap_or_default();
    let input_type = envelope_type(input);

    if is_background_poll_label(&name)
        || is_background_poll_label(&title)
        || is_background_poll_label(&input_type)
    {
        return ClassifiedTool::Hide;
    }
    if matches!(
        name.as_str(),
        "think" | "thought" | "thinking" | "reasoning" | "reason"
    ) {
        return ClassifiedTool::Thinking;
    }
    if is_exit_plan_label(&name)
        || is_exit_plan_label(&title)
        || ((name == "switchmode" || name == "switch_mode" || name == "syncmode" || name == "sync_mode")
            && (title.contains("ready to code") || has_plan_markdown(input)))
    {
        return ClassifiedTool::Plan;
    }
    if is_todo_label(&name)
        || is_todo_label(&title)
        || title.contains("todo list updated")
        || plan_from_tool_input(input).is_some()
    {
        return ClassifiedTool::Plan;
    }
    // Claude Task with plan/todos folds to Plan; otherwise Subagent.
    if name == "task" && (has_plan_markdown(input) || plan_from_tool_input(input).is_some()) {
        return ClassifiedTool::Plan;
    }
    if is_sync_mode_label(&name) || is_sync_mode_label(&title) {
        return ClassifiedTool::SyncMode;
    }
    if is_mcp_list_label(&name) || is_mcp_list_label(&title) || is_mcp_list_label(&input_type) {
        return ClassifiedTool::Call(AgentToolKind::McpList);
    }
    if is_mcp_call_label(&name) || is_mcp_call_label(&title) || is_mcp_call_label(&input_type) {
        return ClassifiedTool::Call(AgentToolKind::McpCall);
    }
    if name == "task" || name == "agent" || name == "subagent" || has_subagent_input(input) {
        return ClassifiedTool::Call(AgentToolKind::Subagent);
    }
    if name.contains("skill") || has_skill_input(input) {
        return ClassifiedTool::Call(AgentToolKind::Skill);
    }

    ClassifiedTool::Call(match name.as_str() {
        "read" | "readfile" | "read_file" | "view" | "view_file" | "listdir" | "list_dir"
        | "list_directory" | "ls" => AgentToolKind::Read,
        "edit" | "write" | "write_file" | "searchreplace" | "search_replace" | "str_replace"
        | "strreplace" => AgentToolKind::Edit,
        "delete" => AgentToolKind::Delete,
        "move" => AgentToolKind::Move,
        "search" | "glob" | "grep" | "grepsearch" | "grep_search" | "web_search" | "websearch" => {
            AgentToolKind::Search
        }
        "execute" | "bash" | "shell" | "terminal" | "run_command" | "command"
        | "run_terminal_cmd" | "powershell" | "cmd" => AgentToolKind::Execute,
        "fetch" | "web_fetch" | "webfetch" => AgentToolKind::Fetch,
        _ if name.contains("web_search") => AgentToolKind::Search,
        _ if name.ends_with("_bash") || name.ends_with("_shell") => AgentToolKind::Execute,
        _ if name.ends_with("_fetch") || name.contains("web_fetch") => AgentToolKind::Fetch,
        _ => AgentToolKind::Other,
    })
}

pub fn tool_kind_from_label(label: &str) -> AgentToolKind {
    match classify_tool(label, None, None) {
        ClassifiedTool::Call(kind) => kind,
        _ => AgentToolKind::Other,
    }
}

pub fn deserialize_tool_kind<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<AgentToolKind, D::Error> {
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value {
        None | Some(serde_json::Value::Null) => AgentToolKind::Other,
        Some(serde_json::Value::String(label)) => match classify_tool(&label, None, None) {
            ClassifiedTool::Call(kind) => kind,
            _ => tool_kind_from_label(&label),
        },
        Some(_) => AgentToolKind::Other,
    })
}

pub fn thinking_text(
    title: Option<&str>,
    input: Option<&serde_json::Value>,
    output: Option<&serde_json::Value>,
) -> String {
    if let Some(text) = value_text(output) {
        return text;
    }
    if let Some(text) = value_text(input) {
        return text;
    }
    title.unwrap_or("").trim().to_string()
}

pub fn plan_from_tool_input(input: Option<&serde_json::Value>) -> Option<serde_json::Value> {
    let value = input?;
    if value
        .get("entries")
        .and_then(|item| item.as_array())
        .is_some()
    {
        return Some(value.clone());
    }
    let todos = value
        .get("todos")
        .and_then(|item| item.as_array())
        .or_else(|| value.as_array())?;
    let entries: Vec<serde_json::Value> = todos
        .iter()
        .filter_map(|item| {
            let content = item
                .get("content")
                .or_else(|| item.get("activeForm"))
                .or_else(|| item.get("text"))
                .and_then(|value| value.as_str())
                .filter(|text| !text.trim().is_empty())?;
            Some(serde_json::json!({
                "content": content,
                "priority": item.get("priority").and_then(|value| value.as_str()).unwrap_or("medium"),
                "status": item.get("status").and_then(|value| value.as_str()).unwrap_or("pending"),
            }))
        })
        .collect();
    if entries.is_empty() {
        if let Some(plan) = value.get("plan").and_then(|item| item.as_str()) {
            if !plan.trim().is_empty() {
                return Some(serde_json::json!({
                    "entries": [{ "content": plan, "priority": "medium", "status": "pending" }]
                }));
            }
        }
        return None;
    }
    Some(serde_json::json!({ "entries": entries }))
}

/// Mode value carried by SwitchMode / SyncMode tool input.
pub fn mode_from_sync_input(input: Option<&serde_json::Value>) -> Option<String> {
    let value = input?;
    for key in ["mode", "target_mode_id", "targetModeId", "to", "value"] {
        if let Some(mode) = value
            .get(key)
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return Some(mode.to_string());
        }
    }
    None
}

/// True when a permission / tool name is an AskUser-family clarifying question tool.
pub fn is_ask_user_tool(name: &str) -> bool {
    matches!(
        normalize_label(name).as_str(),
        "askuserquestion"
            | "ask_user_question"
            | "askuser"
            | "ask_user"
            | "askquestion"
            | "ask_question"
            | "request_user_input"
            | "requestuserinput"
            | "questions"
    )
}

/// True when a permission / tool name is ExitPlanMode (plan approve).
pub fn is_exit_plan_tool(name: &str) -> bool {
    is_exit_plan_label(&normalize_label(name))
}

/// Extract `questions` array from AskUser-family tool input (any agent shape).
pub fn questions_from_tool_input(input: Option<&serde_json::Value>) -> Option<serde_json::Value> {
    let value = input?;
    if let Some(questions) = value.get("questions").filter(|item| item.is_array()) {
        return Some(questions.clone());
    }
    // Codex / Pi sometimes nest under `args` / `input` / `parameters`.
    for key in ["args", "input", "parameters", "payload"] {
        if let Some(questions) = value
            .get(key)
            .and_then(|item| item.get("questions"))
            .filter(|item| item.is_array())
        {
            return Some(questions.clone());
        }
    }
    None
}

fn normalize_label(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

fn envelope_type(input: Option<&serde_json::Value>) -> String {
    let Some(value) = input else {
        return String::new();
    };
    value
        .get("type")
        .or_else(|| value.get("variant"))
        .and_then(|item| item.as_str())
        .map(normalize_label)
        .unwrap_or_default()
}

fn is_todo_label(value: &str) -> bool {
    matches!(value, "todowrite" | "todo_write" | "todo" | "todos")
}

fn is_background_poll_label(value: &str) -> bool {
    matches!(
        value,
        "bashoutput"
            | "bash_output"
            | "taskoutput"
            | "task_output"
            | "get_task_output"
            | "gettaskoutput"
    )
}

fn is_exit_plan_label(value: &str) -> bool {
    matches!(
        value,
        "exitplanmode" | "exit_plan_mode" | "exit_plan" | "exitplan"
    )
}

fn is_sync_mode_label(value: &str) -> bool {
    matches!(
        value,
        "switchmode" | "switch_mode" | "syncmode" | "sync_mode" | "set_mode" | "setmode"
    )
}

fn is_mcp_list_label(value: &str) -> bool {
    matches!(
        value,
        "listmcpresources"
            | "list_mcp_resources"
            | "listmcpresourcetemplates"
            | "list_mcp_resource_templates"
            | "listmcptools"
            | "list_mcp_tools"
            | "mcp_list"
            | "mcplist"
            | "mcp_list_tools"
            | "mcp_list_resources"
    ) || value.starts_with("list_mcp")
        || value.starts_with("listmcp")
}

fn is_mcp_call_label(value: &str) -> bool {
    // Claude / Cursor style: mcp__server__tool
    if value.starts_with("mcp__") {
        return true;
    }
    matches!(
        value,
        "callmcptool"
            | "call_mcp_tool"
            | "callmcp"
            | "call_mcp"
            | "use_tool"
            | "usetool"
            | "mcp_call"
            | "mcpcall"
            | "mcp_call_tool"
            | "run_mcp_tool"
            | "runmcptool"
    ) || value.starts_with("call_mcp")
        || value.starts_with("callmcp")
}

/// ACP `kind` titles and empty labels. These must not hide path/command/query.
pub fn is_generic_tool_label(value: &str) -> bool {
    matches!(
        normalize_label(value).as_str(),
        "" | "tool"
            | "other"
            | "unknown"
            | "read"
            | "search"
            | "execute"
            | "edit"
            | "fetch"
            | "delete"
            | "move"
            | "run_script"
            | "run_command"
            | "bash"
            | "shell"
            | "command"
    )
}

fn has_plan_markdown(input: Option<&serde_json::Value>) -> bool {
    input
        .and_then(|value| value.get("plan"))
        .and_then(|value| value.as_str())
        .is_some_and(|plan| !plan.trim().is_empty())
}

fn has_subagent_input(input: Option<&serde_json::Value>) -> bool {
    let Some(value) = input else {
        return false;
    };
    if value
        .get("subagent_type")
        .and_then(|item| item.as_str())
        .is_some()
    {
        return true;
    }
    value
        .get("_toolName")
        .and_then(|item| item.as_str())
        .is_some_and(|name| normalize_label(name) == "task")
}

fn has_skill_input(input: Option<&serde_json::Value>) -> bool {
    input
        .and_then(|value| value.get("skill"))
        .and_then(|value| value.as_str())
        .is_some_and(|skill| !skill.is_empty())
}

fn value_text(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str().filter(|text| !text.trim().is_empty()) {
        return Some(text.to_string());
    }
    for key in ["thought", "text", "content", "prompt"] {
        if let Some(text) = value
            .get(key)
            .and_then(|item| item.as_str())
            .filter(|text| !text.trim().is_empty())
        {
            return Some(text.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_tools() {
        assert_eq!(
            classify_tool("Read", None, None),
            ClassifiedTool::Call(AgentToolKind::Read)
        );
        assert_eq!(
            classify_tool("Bash", None, None),
            ClassifiedTool::Call(AgentToolKind::Execute)
        );
        assert_eq!(classify_tool("think", None, None), ClassifiedTool::Thinking);
        assert_eq!(classify_tool("TodoWrite", None, None), ClassifiedTool::Plan);
        assert_eq!(
            classify_tool(
                "Tool",
                Some("todo_write"),
                Some(&serde_json::json!({"merge": true}))
            ),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool(
                "Tool",
                None,
                Some(&serde_json::json!({"todos": [{"content": "Inspect", "status": "pending"}]}))
            ),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool("SwitchMode", None, None),
            ClassifiedTool::SyncMode
        );
        assert_eq!(
            classify_tool("SyncMode", None, Some(&serde_json::json!({"mode": "plan"}))),
            ClassifiedTool::SyncMode
        );
        assert_eq!(
            classify_tool(
                "SwitchMode",
                Some("Ready to code?"),
                Some(&serde_json::json!({"plan": "# Ship it"}))
            ),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool("ExitPlanMode", None, Some(&serde_json::json!({"plan": "Go"}))),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool(
                "Task",
                None,
                Some(&serde_json::json!({"subagent_type": "explore"}))
            ),
            ClassifiedTool::Call(AgentToolKind::Subagent)
        );
        assert_eq!(
            classify_tool(
                "Task",
                None,
                Some(&serde_json::json!({"plan": "# Implement auth"}))
            ),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool("Web search", None, None),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(
            classify_tool("WebFetch", None, None),
            ClassifiedTool::Call(AgentToolKind::Fetch)
        );
    }

    #[test]
    fn hide_only_for_bash_and_task_output() {
        assert_eq!(
            classify_tool("BashOutput", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("TaskOutput", None, Some(&serde_json::json!({"variant": "TaskOutput"}))),
            ClassifiedTool::Hide
        );
        assert_ne!(
            classify_tool("SwitchMode", None, None),
            ClassifiedTool::Hide
        );
    }

    #[test]
    fn classifies_mcp_list_and_call() {
        assert_eq!(
            classify_tool("ListMcpResources", None, None),
            ClassifiedTool::Call(AgentToolKind::McpList)
        );
        assert_eq!(
            classify_tool("list_mcp_tools", None, None),
            ClassifiedTool::Call(AgentToolKind::McpList)
        );
        assert_eq!(
            classify_tool("CallMcpTool", None, None),
            ClassifiedTool::Call(AgentToolKind::McpCall)
        );
        assert_eq!(
            classify_tool("use_tool", None, None),
            ClassifiedTool::Call(AgentToolKind::McpCall)
        );
        assert_eq!(
            classify_tool("mcp__filesystem__read_file", None, None),
            ClassifiedTool::Call(AgentToolKind::McpCall)
        );
        assert_eq!(
            classify_tool("mcp_call_tool", None, None),
            ClassifiedTool::Call(AgentToolKind::McpCall)
        );
    }

    #[test]
    fn ask_user_and_questions_helpers() {
        assert!(is_ask_user_tool("AskUserQuestion"));
        assert!(is_ask_user_tool("AskUser"));
        assert!(is_ask_user_tool("request_user_input"));
        assert!(is_ask_user_tool("AskQuestion"));
        assert!(is_exit_plan_tool("ExitPlanMode"));
        let questions = questions_from_tool_input(Some(&serde_json::json!({
            "questions": [{ "question": "Format?", "options": [{"label": "A"}] }]
        })));
        assert!(questions.unwrap().as_array().unwrap().len() == 1);
        let nested = questions_from_tool_input(Some(&serde_json::json!({
            "args": { "questions": [{ "question": "Nested?" }] }
        })));
        assert!(nested.is_some());
    }
}
