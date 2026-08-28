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
    #[default]
    Other,
}

/// How a vendor tool name should fold into an `AgentPart`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassifiedTool {
    Thinking,
    Plan,
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

    if matches!(
        name.as_str(),
        "think" | "thought" | "thinking" | "reasoning" | "reason"
    ) {
        return ClassifiedTool::Thinking;
    }
    if matches!(name.as_str(), "todowrite" | "todo_write" | "todo" | "todos")
        || title.contains("todo list updated")
    {
        return ClassifiedTool::Plan;
    }
    if name == "switchmode" || name == "switch_mode" {
        if title.contains("ready to code") || has_plan_markdown(input) {
            return ClassifiedTool::Plan;
        }
        return ClassifiedTool::Hide;
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
        "search" | "glob" | "grep" | "grepsearch" | "grep_search" => AgentToolKind::Search,
        "execute" | "bash" | "shell" | "terminal" | "run_command" | "command"
        | "run_terminal_cmd" | "powershell" | "cmd" => AgentToolKind::Execute,
        "fetch" => AgentToolKind::Fetch,
        _ if name.ends_with("_bash") || name.ends_with("_shell") => AgentToolKind::Execute,
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

fn normalize_label(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
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
            classify_tool("SwitchMode", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool(
                "Task",
                None,
                Some(&serde_json::json!({"subagent_type": "explore"}))
            ),
            ClassifiedTool::Call(AgentToolKind::Subagent)
        );
    }
}
