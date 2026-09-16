//! Shared subagent spawn / dispatch-ack / result extractors.
//!
//! Host maps apply vendor envelopes; this module owns the field names and
//! notice shapes taken from vendor schemas (Claude AgentOutput, Grok
//! `format_subagent_started_background`, Codex collab, OpenCode task, Pi spawn).

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::contract::{
    AgentTool, AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus,
};
use crate::map::extract::first_string;

/// Wire names that spawn a child agent (after `normalize_label`).
pub fn is_subagent_spawn_name(name: &str) -> bool {
    matches!(
        name,
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

pub fn coerce_subagent_payload(value: &Value) -> Value {
    if value
        .get("status")
        .or_else(|| value.get("agentId"))
        .or_else(|| value.get("subagent_id"))
        .is_some()
    {
        return value.clone();
    }
    if let Some(text) = joined_text_blocks(value) {
        if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
            if parsed.is_object()
                && (parsed.get("status").is_some()
                    || parsed.get("agentId").is_some()
                    || parsed.get("subagent_id").is_some()
                    || parsed.get("content").is_some())
            {
                return parsed;
            }
        }
    }
    value.clone()
}

fn joined_text_blocks(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let text = text.trim();
        return (!text.is_empty()).then(|| text.to_string());
    }
    if let Some(items) = value.as_array() {
        let joined = items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("text").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
        return (!joined.trim().is_empty()).then_some(joined);
    }
    first_string(value, &["output", "text", "content"])
}

pub fn parse_subagent_status(value: &Value) -> Option<AgentToolStatus> {
    let payload = coerce_subagent_payload(value);
    let status = first_string(&payload, &["status", "state"])?.to_ascii_lowercase();
    Some(match status.as_str() {
        "completed" | "complete" | "done" | "success" => AgentToolStatus::Completed,
        "failed" | "error" | "cancelled" | "canceled" | "killed" | "terminated" | "not_found" => {
            AgentToolStatus::Failed
        }
        "running" | "in_progress" | "inprogress" | "pending" | "async_launched"
        | "remote_launched" => AgentToolStatus::Running,
        _ => return None,
    })
}

/// True when the payload is only a background/dispatch ack, not the child's answer.
pub fn is_subagent_dispatch_ack(value: &Value) -> bool {
    let payload = coerce_subagent_payload(value);
    match parse_subagent_status(&payload) {
        Some(AgentToolStatus::Completed | AgentToolStatus::Failed) => return false,
        Some(AgentToolStatus::Running | AgentToolStatus::Pending) => return true,
        None => {}
    }
    let text = raw_subagent_text(&payload);
    is_background_spawn_notice(&text) || is_resume_only_notice(&text)
}

pub fn is_background_spawn_notice(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with("Subagent started in background.")
        || trimmed.contains("moved to the background to keep the conversation responsive")
        || trimmed.starts_with("The task is working in the background.")
        || trimmed.starts_with("Async agent launched successfully.")
        || trimmed.contains("This tool result is internal metadata")
        || trimmed.contains("The agent is working in the background.")
}

fn is_resume_only_notice(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if !lower.contains("agentid:") && !lower.contains("subagent_id:") {
        return false;
    }
    let mut remainder = String::new();
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("agentid:")
            || lower.starts_with("subagent_id:")
            || lower.starts_with("type:")
            || lower.starts_with("description:")
            || lower.contains("sendmessage")
            || lower.contains("resume")
            || lower.contains("taskoutput")
            || lower.contains("agentoutput")
            || lower.contains("get_command_or_subagent")
            || lower.contains("timeout_ms")
        {
            continue;
        }
        remainder.push_str(line);
    }
    remainder.is_empty()
}

fn raw_subagent_text(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    if let Some(items) = value.as_array() {
        return items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("text").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
    }
    if let Some(items) = value.get("content").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("text").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
        if !joined.trim().is_empty() {
            return joined;
        }
    }
    first_string(value, &["output", "text", "content", "body"]).unwrap_or_default()
}

/// Child answer text for a completed spawn (not dispatch chrome).
pub fn subagent_result_text(value: &Value) -> String {
    let payload = coerce_subagent_payload(value);
    let raw = if let Some(items) = payload.get("content").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("text").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
        if !joined.trim().is_empty() {
            joined
        } else {
            raw_subagent_text(&payload)
        }
    } else if let Some(output) = payload.get("output").and_then(Value::as_str) {
        if !output.trim().is_empty() {
            output.to_string()
        } else {
            raw_subagent_text(&payload)
        }
    } else {
        raw_subagent_text(&payload)
    };
    strip_subagent_footers(&raw)
}

pub fn strip_subagent_footers(text: &str) -> String {
    let mut out = text;
    if let Some(idx) = out.find("<subagent_meta>") {
        out = out[..idx].trim_end();
    }
    if let Some(idx) = out.find("<subagent_result>") {
        out = out[..idx].trim_end();
    }
    out.trim().to_string()
}

pub fn hold_subagent_open(input: Option<&Value>, output: Option<&Value>) -> bool {
    if output.is_some_and(is_subagent_dispatch_ack) {
        return true;
    }
    if input.is_some_and(is_subagent_dispatch_ack) {
        return true;
    }
    if let Some(output) = output {
        match parse_subagent_status(output) {
            Some(AgentToolStatus::Completed | AgentToolStatus::Failed) => return false,
            Some(AgentToolStatus::Running | AgentToolStatus::Pending) => return true,
            None => {}
        }
        if let Some(text) = output.as_str() {
            if is_background_spawn_notice(text) || is_resume_only_notice(text) {
                return true;
            }
        }
    }
    input.is_some_and(|value| {
        first_string(value, &["run_in_background", "background"]).as_deref() != Some("false")
            && crate::map::extract::extract_background(value)
    })
}

/// Grok `_x.ai/session_notification` / `_x.ai/session/update` child lifecycle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum XaiSubagentNotice {
    Spawned {
        subagent_id: String,
        child_session_id: String,
        description: String,
        subagent_type: Option<String>,
    },
    Progress {
        subagent_id: String,
        child_session_id: String,
        tools_used: Vec<String>,
        turn_count: u32,
    },
    Finished {
        subagent_id: String,
        child_session_id: String,
        status: AgentToolStatus,
        output: Option<String>,
        error: Option<String>,
    },
}

pub fn is_xai_session_notification_method(method: &str) -> bool {
    let method = method.strip_prefix('_').unwrap_or(method);
    method == "x.ai/session_notification" || method == "x.ai/session/update"
}

pub fn parse_xai_subagent_notification(method: &str, params: &Value) -> Option<XaiSubagentNotice> {
    if !is_xai_session_notification_method(method) {
        return None;
    }
    let update = params.get("update").unwrap_or(params);
    let tag = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or("");
    let subagent_id = first_string(update, &["subagent_id"])?;
    let child_session_id =
        first_string(update, &["child_session_id"]).unwrap_or_else(|| subagent_id.clone());
    match tag {
        "subagent_spawned" => Some(XaiSubagentNotice::Spawned {
            description: first_string(update, &["description"]).unwrap_or_default(),
            subagent_type: first_string(update, &["subagent_type"]),
            subagent_id,
            child_session_id,
        }),
        "subagent_progress" => Some(XaiSubagentNotice::Progress {
            tools_used: update
                .get("tools_used")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            turn_count: update
                .get("turn_count")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32,
            subagent_id,
            child_session_id,
        }),
        "subagent_finished" => {
            let status = parse_subagent_status(update).unwrap_or_else(|| {
                if update.get("error").is_some() {
                    AgentToolStatus::Failed
                } else {
                    AgentToolStatus::Completed
                }
            });
            Some(XaiSubagentNotice::Finished {
                output: first_string(update, &["output"]).map(|text| strip_subagent_footers(&text)),
                error: first_string(update, &["error"]),
                status,
                subagent_id,
                child_session_id,
            })
        }
        _ => None,
    }
}

pub fn store_subagent_tool(tools: &mut HashMap<String, AgentTool>, tool: &AgentTool) {
    tools.insert(tool.tool_call_id.clone(), tool.clone());
    if let AgentToolParams::Subagent {
        task_id: Some(task_id),
        ..
    } = &tool.params
    {
        tools.insert(task_id.clone(), tool.clone());
    }
}

pub fn find_subagent_by_ids(tools: &HashMap<String, AgentTool>, ids: &[&str]) -> Option<AgentTool> {
    for id in ids {
        if id.is_empty() {
            continue;
        }
        if let Some(tool) = tools.get(*id) {
            if tool.kind == AgentToolKind::Subagent {
                return Some(tool.clone());
            }
        }
    }
    None
}

fn unique_subagents(tools: &HashMap<String, AgentTool>) -> Vec<AgentTool> {
    let mut seen = HashSet::new();
    tools
        .values()
        .filter(|tool| {
            tool.kind == AgentToolKind::Subagent && seen.insert(tool.tool_call_id.clone())
        })
        .cloned()
        .collect()
}

fn match_spawn_without_id(
    tools: &HashMap<String, AgentTool>,
    description: &str,
) -> Option<AgentTool> {
    let unmatched: Vec<AgentTool> = unique_subagents(tools)
        .into_iter()
        .filter(|tool| {
            tool.status == AgentToolStatus::Running
                && matches!(
                    &tool.params,
                    AgentToolParams::Subagent { task_id: None, .. }
                )
        })
        .collect();
    if unmatched.len() == 1 {
        return unmatched.into_iter().next();
    }
    unmatched.into_iter().find(|tool| match &tool.params {
        AgentToolParams::Subagent {
            description: stored,
            ..
        } => !description.is_empty() && stored == description,
        _ => false,
    })
}

pub fn apply_xai_subagent_notice(
    tools: &mut HashMap<String, AgentTool>,
    notice: &XaiSubagentNotice,
) -> Option<AgentTool> {
    match notice {
        XaiSubagentNotice::Spawned {
            subagent_id,
            child_session_id,
            description,
            subagent_type,
        } => {
            let mut tool = find_subagent_by_ids(tools, &[subagent_id, child_session_id])
                .or_else(|| match_spawn_without_id(tools, description))?;
            if let AgentToolParams::Subagent {
                task_id,
                agent_type,
                description: stored_description,
                ..
            } = &mut tool.params
            {
                if task_id.is_none() {
                    *task_id = Some(subagent_id.clone());
                }
                if agent_type.is_none() {
                    *agent_type = subagent_type.clone();
                }
                if stored_description.is_empty() && !description.is_empty() {
                    *stored_description = description.clone();
                }
            }
            tool.status = AgentToolStatus::Running;
            tool.result = None;
            store_subagent_tool(tools, &tool);
            tools.insert(child_session_id.clone(), tool.clone());
            tools.insert(subagent_id.clone(), tool.clone());
            Some(tool)
        }
        XaiSubagentNotice::Progress {
            subagent_id,
            child_session_id,
            ..
        } => {
            let tool = find_subagent_by_ids(tools, &[subagent_id, child_session_id])?;
            store_subagent_tool(tools, &tool);
            tools.insert(child_session_id.clone(), tool.clone());
            Some(tool)
        }
        XaiSubagentNotice::Finished {
            subagent_id,
            child_session_id,
            status,
            output,
            error,
        } => {
            let mut tool = find_subagent_by_ids(tools, &[subagent_id, child_session_id])?;
            tool.status = *status;
            if *status == AgentToolStatus::Failed {
                tool.result = Some(AgentToolResult::Error {
                    message: error
                        .clone()
                        .or_else(|| output.clone())
                        .unwrap_or_else(|| "subagent failed".into()),
                });
            } else {
                tool.result = Some(AgentToolResult::Text {
                    text: output.clone().unwrap_or_default(),
                });
            }
            if let AgentToolParams::Subagent { task_id, .. } = &mut tool.params {
                if task_id.is_none() {
                    *task_id = Some(subagent_id.clone());
                }
            }
            store_subagent_tool(tools, &tool);
            tools.insert(child_session_id.clone(), tool.clone());
            Some(tool)
        }
    }
}

#[cfg(test)]
fn extract_task_id_from_output(value: &Value) -> Option<String> {
    use crate::map::extract::{extract_task_id, labeled_id_from_text};
    extract_task_id(value).or_else(|| labeled_id_from_text(&raw_subagent_text(value)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map::extract::labeled_id_from_text;
    use serde_json::json;

    #[test]
    fn spawn_names_cover_vendor_tools() {
        for name in [
            "task",
            "agent",
            "subagent",
            "spawn_subagent",
            "spawn_agent",
            "agent_spawn",
        ] {
            assert!(is_subagent_spawn_name(name), "{name}");
        }
    }

    #[test]
    fn grok_background_notice_is_dispatch_ack() {
        let text = include_str!("../providers/grok/testdata/subagent_started_background.txt");
        assert!(is_background_spawn_notice(text));
        assert!(is_subagent_dispatch_ack(&json!(text)));
        assert_eq!(labeled_id_from_text(text).as_deref(), Some("sa-1"));
    }

    #[test]
    fn claude_agent_output_completed_is_terminal() {
        let value: Value = serde_json::from_str(include_str!(
            "../providers/claude/testdata/subagent_agent_output_completed.json"
        ))
        .unwrap();
        assert!(!is_subagent_dispatch_ack(&value));
        assert_eq!(
            parse_subagent_status(&value),
            Some(AgentToolStatus::Completed)
        );
        assert_eq!(subagent_result_text(&value), "All tests pass.");
        assert_eq!(
            extract_task_id_from_output(&value).as_deref(),
            Some("child1")
        );
    }

    #[test]
    fn claude_agent_output_json_in_text_is_terminal() {
        let value = json!([{
            "type": "text",
            "text": include_str!("../providers/claude/testdata/subagent_agent_output_completed.json")
        }]);
        assert!(!is_subagent_dispatch_ack(&value));
        assert_eq!(
            parse_subagent_status(&value),
            Some(AgentToolStatus::Completed)
        );
        assert_eq!(subagent_result_text(&value), "All tests pass.");
    }

    #[test]
    fn claude_resume_notice_is_dispatch_ack() {
        let value = json!([{
            "type": "text",
            "text": "agentId: child1 (use SendMessage to resume)"
        }]);
        assert!(is_subagent_dispatch_ack(&value));
        assert_eq!(
            extract_task_id_from_output(&value).as_deref(),
            Some("child1")
        );
    }

    #[test]
    fn claude_async_launch_notice_is_dispatch_ack() {
        let text = "Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.) agentId: a827867c2504be0f1 (internal ID - do not mention to user. Use SendMessage with to: 'a827867c2504be0f1', summary: '<5-10 word recap>' to continue this agent.) The agent is working in the background. You will be notified automatically when it completes.";
        assert!(is_background_spawn_notice(text));
        assert!(is_subagent_dispatch_ack(
            &json!([{ "type": "text", "text": text }])
        ));
        assert!(is_subagent_dispatch_ack(&json!(text)));
        assert_eq!(
            extract_task_id_from_output(&json!(text)).as_deref(),
            Some("a827867c2504be0f1")
        );
    }

    #[test]
    fn oneshot_prose_with_agent_id_trailer_is_terminal() {
        let value = json!([{
            "type": "text",
            "text": "All tests pass.\n\nAgent completed successfully.\nagentId: child1"
        }]);
        assert!(!is_subagent_dispatch_ack(&value));
        assert_eq!(
            subagent_result_text(&value),
            "All tests pass.\n\nAgent completed successfully.\nagentId: child1"
        );
    }

    #[test]
    fn xai_session_notification_parses_spawn_progress_finished() {
        let spawned: Value = serde_json::from_str(include_str!(
            "../providers/grok/testdata/subagent_spawned.json"
        ))
        .unwrap();
        let notice = parse_xai_subagent_notification("_x.ai/session_notification", &spawned)
            .expect("spawned");
        assert!(matches!(
            notice,
            XaiSubagentNotice::Spawned { ref subagent_id, ref child_session_id, .. }
                if subagent_id == "sa-1" && child_session_id == "sa-1"
        ));

        let finished: Value = serde_json::from_str(include_str!(
            "../providers/grok/testdata/subagent_finished.json"
        ))
        .unwrap();
        let notice = parse_xai_subagent_notification("x.ai/session_notification", &finished)
            .expect("finished");
        assert!(matches!(
            notice,
            XaiSubagentNotice::Finished {
                status: AgentToolStatus::Completed,
                output: Some(ref output),
                ..
            } if output.contains("hello from child")
        ));
    }

    #[test]
    fn apply_notice_completes_the_matching_spawn_only() {
        let mut tools = HashMap::new();
        let first = AgentTool {
            tool_call_id: "tc_a".into(),
            parent_tool_call_id: None,
            name: "spawn_subagent".into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: AgentToolStatus::Running,
            params: AgentToolParams::Subagent {
                description: "Read a".into(),
                agent_type: Some("explore".into()),
                task_id: None,
                prompt: None,
            },
            result: None,
        };
        let second = AgentTool {
            tool_call_id: "tc_b".into(),
            parent_tool_call_id: None,
            name: "spawn_subagent".into(),
            title: None,
            kind: AgentToolKind::Subagent,
            status: AgentToolStatus::Running,
            params: AgentToolParams::Subagent {
                description: "Read b".into(),
                agent_type: Some("explore".into()),
                task_id: None,
                prompt: None,
            },
            result: None,
        };
        store_subagent_tool(&mut tools, &first);
        store_subagent_tool(&mut tools, &second);

        let spawned = apply_xai_subagent_notice(
            &mut tools,
            &XaiSubagentNotice::Spawned {
                subagent_id: "sa-a".into(),
                child_session_id: "sa-a".into(),
                description: "Read a".into(),
                subagent_type: Some("explore".into()),
            },
        )
        .unwrap();
        assert_eq!(spawned.tool_call_id, "tc_a");

        let done = apply_xai_subagent_notice(
            &mut tools,
            &XaiSubagentNotice::Finished {
                subagent_id: "sa-a".into(),
                child_session_id: "sa-a".into(),
                status: AgentToolStatus::Completed,
                output: Some("alpha".into()),
                error: None,
            },
        )
        .unwrap();
        assert_eq!(done.tool_call_id, "tc_a");
        assert_eq!(done.status, AgentToolStatus::Completed);
        assert_eq!(
            tools.get("tc_b").map(|tool| tool.status),
            Some(AgentToolStatus::Running)
        );
    }
}
