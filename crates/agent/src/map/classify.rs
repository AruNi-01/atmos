use crate::contract::AgentToolKind;
use crate::map::ask::{is_ask_user_tool, is_exit_plan_tool};

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
    let title_raw = title.unwrap_or("").trim();
    let title = normalize_label(title_raw);
    // When ACP reports a generic name ("Tool") Cursor/Codex still put the real
    // verb in `_toolName` or the human title ("Find …", "Glob …", "Update TODOs").
    let name = normalize_label(&effective_tool_label(name, title_raw, input));

    if matches!(
        name.as_str(),
        "think" | "thought" | "thinking" | "reasoning" | "reason"
    ) {
        return ClassifiedTool::Thinking;
    }
    // AskUser chrome is PermissionRequested; never emit a tool card (ACP/Cursor).
    if is_ask_user_tool(&name) || (!title.is_empty() && is_ask_user_tool(&title)) {
        return ClassifiedTool::Hide;
    }
    // ExitPlanMode approval is PermissionRequested + ApprovalCard plan; hide the raw tool
    // card. Claude native still SyncModes via classify_claude_name before this helper.
    if is_exit_plan_tool(&name) || (!title.is_empty() && is_exit_plan_tool(&title)) {
        return ClassifiedTool::Hide;
    }
    if is_todo_label(&name)
        || is_todo_label(&title)
        || title.contains("todo_list_updated")
        || title.starts_with("update_todos")
        || title.contains("update_todos")
        || is_task_tool_label(&name)
        || plan_from_tool_input(input).is_some()
    {
        return ClassifiedTool::Plan;
    }
    if is_mcp_list_label(&name) || is_mcp_list_label(&title) {
        return ClassifiedTool::Call(AgentToolKind::McpList);
    }
    if (is_mcp_call_label(&name)
        || is_mcp_call_label(&title)
        || name.starts_with("mcp__")
        || name.starts_with("mcp_"))
        && !is_mcp_list_label(&name)
        && !is_mcp_list_label(&title)
    {
        return ClassifiedTool::Call(AgentToolKind::McpCall);
    }
    if name == "switchmode" || name == "switch_mode" {
        if title.contains("ready_to_code") || has_plan_markdown(input) {
            return ClassifiedTool::Plan;
        }
        // Mode enter/exit must sync Mode UI (ConfigChanged) and stay visible —
        // never Hide. Providers emit ConfigChanged; the tool card is Other.
        return ClassifiedTool::Call(AgentToolKind::Other);
    }
    if is_poll_output_label(&name) {
        return ClassifiedTool::Hide;
    }
    if name == "task" || name == "agent" || name == "subagent" || has_subagent_input(input) {
        return ClassifiedTool::Call(AgentToolKind::Subagent);
    }
    if name.contains("skill") || has_skill_input(input) {
        return ClassifiedTool::Call(AgentToolKind::Skill);
    }
    if is_workspace_search_label(&name) || is_workspace_search_label(&title) {
        return ClassifiedTool::Call(AgentToolKind::Search);
    }
    if is_web_search_label(&name) || is_web_search_label(&title) {
        return ClassifiedTool::Call(AgentToolKind::WebSearch);
    }
    if is_image_gen_label(&name) || is_image_gen_label(&title) {
        return ClassifiedTool::Call(AgentToolKind::ImageGen);
    }

    ClassifiedTool::Call(match name.as_str() {
        "read" | "readfile" | "read_file" | "view" | "view_file" | "viewimage" | "view_image"
        | "imageview" | "image_view" | "listdir" | "list_dir" | "list_directory" | "ls" => {
            AgentToolKind::Read
        }
        // Cursor ACP titles use "Find …" for workspace glob/search, not filesystem read.
        "find" => AgentToolKind::Search,
        "edit" | "write" | "write_file" | "searchreplace" | "search_replace" | "str_replace"
        | "strreplace" | "applypatch" | "apply_patch" | "editnotebook" | "edit_notebook" => {
            AgentToolKind::Edit
        }
        "delete" => AgentToolKind::Delete,
        "move" => AgentToolKind::Move,
        "search" => AgentToolKind::Search,
        "execute" | "bash" | "shell" | "terminal" | "run_command" | "command"
        | "run_terminal_cmd" | "powershell" | "cmd" | "awaitshell" | "await_shell" => {
            AgentToolKind::Execute
        }
        "fetch" | "web_fetch" | "webfetch" | "fetchurl" | "fetch_url" => AgentToolKind::Fetch,
        _ if name.ends_with("_bash") || name.ends_with("_shell") => AgentToolKind::Execute,
        _ if name.ends_with("_fetch") || name.contains("web_fetch") => AgentToolKind::Fetch,
        // Generic ACP "Tool" + typed fields (Cursor often omits a real name).
        _ if input_looks_like_execute(input) => AgentToolKind::Execute,
        _ if input_looks_like_search(input) => AgentToolKind::Search,
        _ if input_looks_like_read(input) => AgentToolKind::Read,
        _ if input_looks_like_edit(input) => AgentToolKind::Edit,
        _ => AgentToolKind::Other,
    })
}

/// Prefer a non-generic vendor verb when ACP's `tool` field is just `Tool`/`Other`.
pub fn effective_tool_label(name: &str, title: &str, input: Option<&serde_json::Value>) -> String {
    if !is_generic_tool_label(name) {
        return name.trim().to_string();
    }
    if let Some(meta_name) = input
        .and_then(|value| value.get("_toolName").or_else(|| value.get("toolName")))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty() && !is_generic_tool_label(value))
    {
        return meta_name.to_string();
    }
    if let Some(token) = title_verb_token(title) {
        return token;
    }
    name.trim().to_string()
}

fn title_verb_token(title: &str) -> Option<String> {
    let trimmed = title.trim().trim_matches('`');
    if trimmed.is_empty() {
        return None;
    }
    let first = trimmed
        .split(|c: char| c.is_whitespace() || c == ':' || c == '[' || c == '(')
        .find(|part| !part.is_empty())?;
    let token = first.trim_matches('`').trim_matches('"').trim_matches('\'');
    if token.is_empty() || is_generic_tool_label(token) {
        return None;
    }
    // Shell one-liners in titles (`mkdir -p …`) are not tool verbs.
    if token.contains('/') || token.contains('\\') || token.contains('=') {
        return None;
    }
    Some(token.to_string())
}

fn input_looks_like_execute(input: Option<&serde_json::Value>) -> bool {
    input.is_some_and(|value| {
        value
            .get("command")
            .and_then(|item| item.as_str())
            .is_some_and(|command| !command.trim().is_empty())
    })
}

fn input_looks_like_search(input: Option<&serde_json::Value>) -> bool {
    input.is_some_and(|value| {
        ["pattern", "query", "glob", "patterns"].iter().any(|key| {
            value
                .get(*key)
                .and_then(|item| item.as_str())
                .is_some_and(|text| !text.trim().is_empty())
        })
    })
}

fn input_looks_like_read(input: Option<&serde_json::Value>) -> bool {
    input.is_some_and(|value| {
        [
            "path",
            "file_path",
            "filePath",
            "target_file",
            "absolute_path",
            "absolute_root_path",
            "target_directory",
            "targetDirectory",
            "directory",
            "dir",
            "dir_path",
        ]
        .iter()
        .any(|key| {
            value
                .get(*key)
                .and_then(|item| item.as_str())
                .is_some_and(|text| !text.trim().is_empty())
        }) && value.get("old_string").is_none()
            && value.get("contents").is_none()
            && value.get("content").is_none()
            && value.get("new_string").is_none()
    })
}

fn input_looks_like_edit(input: Option<&serde_json::Value>) -> bool {
    input.is_some_and(|value| {
        value.get("old_string").is_some()
            || value.get("new_string").is_some()
            || value.get("contents").is_some()
            || (value.get("path").is_some() && value.get("content").is_some())
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
    // Claude TaskCreate: { subject, description?, activeForm? }
    if let Some(subject) = value
        .get("subject")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        let status = value
            .get("status")
            .and_then(|item| item.as_str())
            .unwrap_or("pending");
        return Some(serde_json::json!({
            "entries": [{
                "content": subject,
                "priority": "medium",
                "status": normalize_task_status(status),
            }]
        }));
    }
    // Claude TaskUpdate without subject still folds to a plan stub via status/taskId.
    if value.get("taskId").is_some() || value.get("task_id").is_some() {
        let content = value
            .get("subject")
            .or_else(|| value.get("description"))
            .and_then(|item| item.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| text.to_string())
            .or_else(|| {
                value
                    .get("taskId")
                    .or_else(|| value.get("task_id"))
                    .and_then(|item| item.as_str())
                    .map(|id| format!("Task {id}"))
            })
            .unwrap_or_else(|| "Task update".into());
        let status = value
            .get("status")
            .and_then(|item| item.as_str())
            .unwrap_or("pending");
        return Some(serde_json::json!({
            "entries": [{
                "content": content,
                "priority": "medium",
                "status": normalize_task_status(status),
            }]
        }));
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
                .or_else(|| item.get("subject"))
                .or_else(|| item.get("activeForm"))
                .or_else(|| item.get("text"))
                .and_then(|value| value.as_str())
                .filter(|text| !text.trim().is_empty())?;
            Some(serde_json::json!({
                "content": content,
                "priority": item.get("priority").and_then(|value| value.as_str()).unwrap_or("medium"),
                "status": normalize_task_status(
                    item.get("status").and_then(|value| value.as_str()).unwrap_or("pending"),
                ),
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

/// Always produce a Plan payload when classification says Plan (no failure→Hide).
pub fn plan_from_tool_input_or_stub(
    name: &str,
    title: Option<&str>,
    input: Option<&serde_json::Value>,
) -> serde_json::Value {
    if let Some(plan) = plan_from_tool_input(input) {
        return plan;
    }
    let content = title
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or(name)
        .to_string();
    serde_json::json!({
        "entries": [{
            "content": content,
            "priority": "medium",
            "status": "pending",
        }]
    })
}

fn normalize_task_status(raw: &str) -> &'static str {
    match normalize_label(raw).as_str() {
        "completed" | "complete" | "done" | "todo_status_completed" => "completed",
        "in_progress" | "inprogress" | "running" | "todo_status_in_progress" | "active" => {
            "in_progress"
        }
        "deleted" | "cancelled" | "canceled" => "completed",
        _ => "pending",
    }
}

fn normalize_label(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

fn is_todo_label(value: &str) -> bool {
    matches!(
        value,
        "todowrite"
            | "todo_write"
            | "todo"
            | "todos"
            | "updatetodos"
            | "update_todos"
            | "todolist"
            | "todo_list"
    )
}

fn is_task_tool_label(value: &str) -> bool {
    matches!(
        value,
        "taskcreate"
            | "task_create"
            | "taskupdate"
            | "task_update"
            | "taskget"
            | "task_get"
            | "tasklist"
            | "task_list"
    )
}

fn is_mcp_list_label(value: &str) -> bool {
    matches!(
        value,
        "listmcpresources"
            | "list_mcp_resources"
            | "listmcpresourcestool"
            | "list_mcp_resources_tool"
            | "listmcpresourcetemplates"
            | "list_mcp_resource_templates"
            | "listmcptools"
            | "list_mcp_tools"
            | "listmcp"
            | "list_mcp"
            | "mcplist"
            | "mcp_list"
            | "mcp_list_tools"
            | "mcp_list_resources"
    ) || value.starts_with("list_mcp")
        || value.starts_with("listmcp")
        || value.contains("list_mcp")
        || (value.contains("mcp") && value.contains("list") && !value.contains("call"))
}

fn is_mcp_call_label(value: &str) -> bool {
    if value.starts_with("mcp__") {
        return true;
    }
    matches!(
        value,
        "mcp"
            | "mcpcall"
            | "mcp_call"
            | "mcp_call_tool"
            | "mcptool"
            | "mcp_tool"
            | "mcptoolcall"
            | "mcp_tool_call"
            | "callmcp"
            | "call_mcp"
            | "callmcptool"
            | "call_mcp_tool"
            | "use_tool"
            | "run_mcp_tool"
            | "runmcptool"
    ) || value.starts_with("call_mcp")
        || value.starts_with("callmcp")
        || (value.contains("mcp") && value.contains("call"))
}

/// Parse `mcp__server__tool` / `mcp_server_tool` naming into a ref.
pub fn mcp_ref_from_name(name: &str) -> Option<crate::contract::AgentMcpRef> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(rest) = trimmed.strip_prefix("mcp__") {
        let mut parts = rest.splitn(2, "__");
        let server = parts.next()?.trim();
        let tool = parts.next().unwrap_or("").trim();
        if server.is_empty() {
            return None;
        }
        return Some(crate::contract::AgentMcpRef {
            server: Some(server.to_string()),
            tool: if tool.is_empty() {
                None
            } else {
                Some(tool.to_string())
            },
        });
    }
    if is_mcp_list_label(&normalize_label(trimmed)) {
        return Some(crate::contract::AgentMcpRef {
            server: None,
            tool: Some(trimmed.to_string()),
        });
    }
    if is_mcp_call_label(&normalize_label(trimmed)) {
        return Some(crate::contract::AgentMcpRef {
            server: None,
            tool: Some(trimmed.to_string()),
        });
    }
    None
}

fn is_poll_output_label(value: &str) -> bool {
    matches!(
        value,
        "bashoutput"
            | "bash_output"
            | "taskoutput"
            | "task_output"
            | "get_command_or_subagent_output"
    )
}

fn is_workspace_search_label(value: &str) -> bool {
    matches!(
        value,
        "glob" | "grep" | "grepsearch" | "grep_search" | "find"
    ) || value.starts_with("glob_")
        || value.starts_with("grep_")
        || value.starts_with("find_")
}

fn is_web_search_label(value: &str) -> bool {
    value == "web_search" || value == "websearch" || value.contains("web_search")
}

/// Still-image generation/edit tools. Video (`image_to_video`) and view (`image_view`) stay out.
fn is_image_gen_label(value: &str) -> bool {
    if value.contains("image_to_video")
        || value.contains("reference_to_video")
        || value.contains("view_image")
        || value == "imageview"
        || value == "image_view"
    {
        return false;
    }
    matches!(
        value,
        "generateimage"
            | "generate_image"
            | "imagegen"
            | "image_gen"
            | "imageedit"
            | "image_edit"
            | "imagine"
    ) || value.contains("generate_image")
        || value.contains("generateimage")
        || value.contains("image_gen")
        || value.contains("image_edit")
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
            ClassifiedTool::Call(AgentToolKind::Other)
        );
        assert_eq!(
            classify_tool("AskUserQuestion", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("Tool", Some("AskQuestion: pick a color"), None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("ExitPlanMode", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("Tool", Some("Exit plan mode"), None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("ListMcpResources", None, None),
            ClassifiedTool::Call(AgentToolKind::McpList)
        );
        assert_eq!(
            classify_tool("mcp__filesystem__read_file", None, None),
            ClassifiedTool::Call(AgentToolKind::McpCall)
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
            classify_tool(
                "Task",
                None,
                Some(&serde_json::json!({"subagent_type": "explore"}))
            ),
            ClassifiedTool::Call(AgentToolKind::Subagent)
        );
        assert_eq!(
            classify_tool("Web search", None, None),
            ClassifiedTool::Call(AgentToolKind::WebSearch)
        );
        assert_eq!(
            classify_tool("web_search", None, None),
            ClassifiedTool::Call(AgentToolKind::WebSearch)
        );
        assert_eq!(
            classify_tool("generateImage", None, None),
            ClassifiedTool::Call(AgentToolKind::ImageGen)
        );
        assert_eq!(
            classify_tool("image_gen", None, None),
            ClassifiedTool::Call(AgentToolKind::ImageGen)
        );
        assert_eq!(
            classify_tool("image_edit", None, None),
            ClassifiedTool::Call(AgentToolKind::ImageGen)
        );
        assert_eq!(
            classify_tool("image_to_video", None, None),
            ClassifiedTool::Call(AgentToolKind::Other)
        );
        assert_eq!(
            classify_tool("view_image", None, None),
            ClassifiedTool::Call(AgentToolKind::Read)
        );
        assert_eq!(
            classify_tool("imageView", None, None),
            ClassifiedTool::Call(AgentToolKind::Read)
        );
        assert_eq!(
            classify_tool("websearch", None, None),
            ClassifiedTool::Call(AgentToolKind::WebSearch)
        );
        assert_eq!(
            classify_tool("search", None, None),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(
            classify_tool("Grep", None, None),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(
            classify_tool("glob", None, None),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(
            classify_tool("WebFetch", None, None),
            ClassifiedTool::Call(AgentToolKind::Fetch)
        );
        assert_eq!(
            classify_tool("fetch", None, None),
            ClassifiedTool::Call(AgentToolKind::Fetch)
        );
        assert_eq!(
            classify_tool("web_fetch", None, None),
            ClassifiedTool::Call(AgentToolKind::Fetch)
        );
        assert_eq!(
            classify_tool("BashOutput", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool("TaskOutput", None, None),
            ClassifiedTool::Hide
        );
        assert_eq!(
            classify_tool(
                "Tool",
                Some("Update TODOs: Glob, Write"),
                Some(&serde_json::json!({
                    "_toolName": "updateTodos",
                    "todos": [{"content": "a", "status": "TODO_STATUS_PENDING"}]
                }))
            ),
            ClassifiedTool::Plan
        );
        assert_eq!(
            classify_tool(
                "Tool",
                Some("Find `*.md`"),
                Some(&serde_json::json!({"pattern": "*.md"}))
            ),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(
            classify_tool(
                "Tool",
                Some("Glob [\"**/a*\"]"),
                Some(&serde_json::json!({"patterns": "[\"**/a*\"]"}))
            ),
            ClassifiedTool::Call(AgentToolKind::Search)
        );
        assert_eq!(effective_tool_label("Tool", "Find `*.md`", None), "Find");
    }
}
