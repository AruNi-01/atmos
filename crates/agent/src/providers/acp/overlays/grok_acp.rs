use std::collections::HashMap;

use serde_json::Value;

use crate::acp_client::types::{ToolCallStatus, ToolCallUpdate};
use crate::contract::{AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus};
use crate::map::extract_task_id;
use crate::map::is_generic_tool_label;

use super::{envelope_type, unwrap_envelope};

pub(super) fn prepare(update: &ToolCallUpdate) -> ToolCallUpdate {
    let mut next = update.clone();
    let input_ty = envelope_type(next.raw_input.as_ref());
    let output_ty = envelope_type(next.raw_output.as_ref());
    let ty = input_ty.clone().or(output_ty.clone());
    if is_generic_tool_label(&next.tool) {
        if let Some(ty) = ty.clone().filter(|value| !is_generic_tool_label(value)) {
            next.tool = ty;
        }
    }
    if let Some(ty) = ty.as_deref() {
        if matches!(ty, "execute" | "bash" | "shell" | "backgroundtaskstarted") {
            next.acp_kind = Some("execute".into());
        } else if matches!(ty, "readfile" | "read_file" | "listdir" | "list_dir") {
            next.acp_kind = Some("read".into());
        }
    }
    next.raw_input = unwrap_envelope(next.raw_input);
    next.raw_output = unwrap_envelope(next.raw_output);
    next
}

pub(super) fn task_replace(
    update: &ToolCallUpdate,
    grok_tasks: &mut HashMap<String, AgentTool>,
) -> Option<(String, AgentTool)> {
    if !is_task_output(update) {
        return None;
    }
    let output = unwrap_envelope(update.raw_output.clone())
        .or_else(|| unwrap_envelope(update.raw_input.clone()));
    let task_id = output
        .as_ref()
        .and_then(extract_task_id)
        .or_else(|| extract_task_id_nested(update.raw_output.as_ref()))?;
    let mut original = grok_tasks.get(&task_id).cloned()?;
    original.status =
        grok_task_status(output.as_ref()).unwrap_or_else(|| map_status(&update.status));
    original.result = Some(execute_result(output.as_ref(), update));
    if let AgentToolParams::Execute {
        task_id: stored_task,
        ..
    } = &mut original.params
    {
        if stored_task.is_none() {
            *stored_task = Some(task_id.clone());
        }
    }
    grok_tasks.insert(task_id, original.clone());
    Some((original.tool_call_id.clone(), original))
}

pub(super) fn remember(tool: &AgentTool, grok_tasks: &mut HashMap<String, AgentTool>) {
    let AgentToolParams::Execute {
        background,
        task_id,
        ..
    } = &tool.params
    else {
        return;
    };
    if let Some(task_id) = task_id {
        grok_tasks.insert(task_id.clone(), tool.clone());
    } else if *background {
        grok_tasks.insert(tool.tool_call_id.clone(), tool.clone());
    }
}

pub(super) fn strip_execute_footer(tool: &mut AgentTool) {
    if let Some(AgentToolResult::Execute { output, .. }) = &mut tool.result {
        *output = strip_grok_poll_footer(output);
    }
}

fn is_task_output(update: &ToolCallUpdate) -> bool {
    matches!(
        update.tool.trim().to_ascii_lowercase().as_str(),
        "taskoutput" | "task_output"
    ) || envelope_type(update.raw_input.as_ref())
        .or_else(|| envelope_type(update.raw_output.as_ref()))
        .is_some_and(|ty| ty == "taskoutput" || ty == "task_output")
}

fn extract_task_id_nested(value: Option<&Value>) -> Option<String> {
    let value = value?;
    extract_task_id(value)
        .or_else(|| value.get("Result").and_then(extract_task_id))
        .or_else(|| value.get("FileContent").and_then(extract_task_id))
}

fn grok_task_status(output: Option<&Value>) -> Option<AgentToolStatus> {
    let status = super::first_string(output?, &["status"])
        .or_else(|| {
            output?
                .get("Result")
                .and_then(|value| super::first_string(value, &["status"]))
        })?
        .to_ascii_lowercase();
    Some(match status.as_str() {
        "completed" => AgentToolStatus::Completed,
        "failed" | "not_found" => AgentToolStatus::Failed,
        "running" => AgentToolStatus::Running,
        _ => return None,
    })
}

fn map_status(status: &ToolCallStatus) -> AgentToolStatus {
    match status {
        ToolCallStatus::Running => AgentToolStatus::Running,
        ToolCallStatus::Completed => AgentToolStatus::Completed,
        ToolCallStatus::Failed => AgentToolStatus::Failed,
    }
}

fn execute_result(output: Option<&Value>, update: &ToolCallUpdate) -> AgentToolResult {
    let mut text = value_text(output)
        .or_else(|| content_text(update))
        .unwrap_or_default();
    text = strip_grok_poll_footer(&text);
    let exit_code = output.and_then(extract_exit_code);
    AgentToolResult::Execute {
        output: text,
        exit_code,
    }
}

fn extract_exit_code(value: &Value) -> Option<i32> {
    super::first_string(value, &["exit_code", "exitCode", "status_code"])
        .and_then(|text| text.parse().ok())
        .or_else(|| {
            value
                .get("exit_code")
                .or_else(|| value.get("exitCode"))
                .and_then(Value::as_i64)
                .map(|value| value as i32)
        })
        .or_else(|| {
            value
                .get("Result")
                .and_then(|nested| nested.get("exit_code").and_then(Value::as_i64))
                .map(|value| value as i32)
        })
}

fn value_text(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }
    super::first_string(value, &["output", "text", "content", "body", "raw_output"]).or_else(|| {
        value
            .get("Result")
            .and_then(|nested| super::first_string(nested, &["output", "text", "content"]))
    })
}

fn content_text(update: &ToolCallUpdate) -> Option<String> {
    let chunks: Vec<&str> = update
        .content
        .iter()
        .filter_map(|item| match item {
            crate::acp_client::types::AgentToolCallContentItem::Text { text }
                if !text.trim().is_empty() =>
            {
                Some(text.as_str())
            }
            _ => None,
        })
        .collect();
    if chunks.is_empty() {
        None
    } else {
        Some(chunks.join("\n"))
    }
}

fn strip_grok_poll_footer(text: &str) -> String {
    match text.find("Use timeout_ms to wait") {
        Some(index) => text[..index].trim_end().to_string(),
        None => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::tool_map::{map_tool_call, ToolMapOut};
    use super::super::OverlayState;
    use super::*;
    use crate::contract::AgentToolKind;

    fn update(
        name: &str,
        status: ToolCallStatus,
        input: Value,
        output: Option<Value>,
    ) -> ToolCallUpdate {
        ToolCallUpdate {
            tool_call_id: "tc_1".into(),
            parent_tool_call_id: None,
            tool: name.into(),
            description: String::new(),
            acp_kind: Some("other".into()),
            status,
            raw_input: Some(input),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: output,
            detail: None,
        }
    }

    fn mapped(id: &str, update: ToolCallUpdate, state: &mut OverlayState) -> AgentTool {
        match map_tool_call(id, &update, state) {
            ToolMapOut::Tool(tool) => tool,
            other => panic!("expected tool, got {other:?}"),
        }
    }

    #[test]
    fn grok_acp_unwraps_bash_envelope() {
        let tool = mapped(
            "grok-build",
            update(
                "Tool",
                ToolCallStatus::Completed,
                serde_json::json!({"type": "Bash", "command": "ls -la"}),
                Some(serde_json::json!({"output": "README.md\n", "exit_code": 0})),
            ),
            &mut OverlayState::default(),
        );
        assert_eq!(tool.kind, AgentToolKind::Execute);
        match tool.params {
            AgentToolParams::Execute { command, .. } => assert_eq!(command, "ls -la"),
            other => panic!("expected execute, got {other:?}"),
        }
    }

    #[test]
    fn grok_acp_unwraps_file_content_envelope() {
        let tool = mapped(
            "grok-build",
            update(
                "Tool",
                ToolCallStatus::Completed,
                serde_json::json!({
                    "type": "ReadFile",
                    "FileContent": {
                        "absolute_path": "/tmp/app/README.md",
                        "raw_output": "# hi\n"
                    }
                }),
                None,
            ),
            &mut OverlayState::default(),
        );
        assert_eq!(tool.kind, AgentToolKind::Read);
        match tool.params {
            AgentToolParams::Read { path, .. } => assert_eq!(path, "/tmp/app/README.md"),
            other => panic!("expected read, got {other:?}"),
        }
    }

    #[test]
    fn gemini_does_not_unwrap_grok_envelope() {
        let tool = mapped(
            "gemini",
            update(
                "Tool",
                ToolCallStatus::Completed,
                serde_json::json!({
                    "type": "ReadFile",
                    "FileContent": {
                        "absolute_path": "/tmp/app/README.md",
                        "raw_output": "# hi\n"
                    }
                }),
                None,
            ),
            &mut OverlayState::default(),
        );
        assert_eq!(tool.kind, AgentToolKind::Other);
    }

    #[test]
    fn background_execute_and_taskoutput_replace() {
        let mut state = OverlayState::default();
        let fixture: Value = serde_json::from_str(include_str!("../testdata/grok_background.json"))
            .expect("fixture");
        let started = ToolCallUpdate {
            tool_call_id: fixture["started"]["tool_call_id"].as_str().unwrap().into(),
            parent_tool_call_id: None,
            tool: fixture["started"]["name"].as_str().unwrap().into(),
            description: String::new(),
            acp_kind: Some("other".into()),
            status: ToolCallStatus::Running,
            raw_input: Some(fixture["started"]["raw_input"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: Some(fixture["started"]["raw_output"].clone()),
            detail: None,
        };
        let tool = mapped("grok-build", started, &mut state);
        assert_eq!(tool.kind, AgentToolKind::Execute);
        match &tool.params {
            AgentToolParams::Execute {
                background: true,
                task_id: Some(task_id),
                ..
            } => assert_eq!(task_id, "t1"),
            other => panic!("expected background execute, got {other:?}"),
        }

        let poll = ToolCallUpdate {
            tool_call_id: fixture["taskoutput"]["tool_call_id"]
                .as_str()
                .unwrap()
                .into(),
            parent_tool_call_id: None,
            tool: fixture["taskoutput"]["name"].as_str().unwrap().into(),
            description: String::new(),
            acp_kind: Some("other".into()),
            status: ToolCallStatus::Completed,
            raw_input: Some(fixture["taskoutput"]["raw_input"].clone()),
            content: Vec::new(),
            locations: Vec::new(),
            raw_output: Some(fixture["taskoutput"]["raw_output"].clone()),
            detail: None,
        };
        let ToolMapOut::Replace { tool_call_id, tool } =
            map_tool_call("grok-build", &poll, &mut state)
        else {
            panic!("expected replace");
        };
        assert_eq!(tool_call_id, "tc_1");
        match tool.result {
            Some(AgentToolResult::Execute { output, .. }) => {
                assert_eq!(output, "hello");
                assert!(!output.contains("timeout_ms"));
            }
            other => panic!("expected execute result, got {other:?}"),
        }
    }
}
