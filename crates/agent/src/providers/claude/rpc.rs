//! Host ↔ CLI control envelopes (Agent SDK schema).

use serde_json::{json, Value};

use crate::contract::{AgentPermissionOption, AgentPermissionRequest};

const DENY_MESSAGE: &str = "User denied";

#[derive(Debug, Clone)]
pub(crate) struct PendingPermission {
    pub request_id: String,
    pub tool_name: String,
    pub input: Value,
    pub suggestions: Option<Value>,
}

pub(crate) fn next_request_id(n: u64, hex: &str) -> String {
    format!("req_{n}_{hex}")
}

pub(crate) fn host_control_request(request_id: &str, request: Value) -> Value {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": request,
    })
}

pub(crate) fn initialize_request(request_id: &str) -> Value {
    host_control_request(request_id, json!({ "subtype": "initialize" }))
}

pub(crate) fn interrupt_request(request_id: &str) -> Value {
    host_control_request(request_id, json!({ "subtype": "interrupt" }))
}

pub(crate) fn set_model_request(request_id: &str, model: Option<&str>) -> Value {
    let mut request = json!({ "subtype": "set_model" });
    match model {
        Some(model) => {
            request["model"] = Value::String(model.to_string());
        }
        None => {
            request["model"] = Value::Null;
        }
    }
    host_control_request(request_id, request)
}

pub(crate) fn set_max_thinking_tokens_request(request_id: &str, tokens: Option<i64>) -> Value {
    json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {
            "subtype": "set_max_thinking_tokens",
            "max_thinking_tokens": tokens,
        }
    })
}

pub(crate) fn apply_flag_settings_request(request_id: &str, settings: Value) -> Value {
    host_control_request(
        request_id,
        json!({
            "subtype": "apply_flag_settings",
            "settings": settings,
        }),
    )
}

pub(crate) fn set_permission_mode_request(request_id: &str, mode: &str) -> Value {
    host_control_request(
        request_id,
        json!({
            "subtype": "set_permission_mode",
            "mode": mode,
        }),
    )
}

pub(crate) fn user_message(text: &str, session_id: Option<&str>, attachments: &[Value]) -> Value {
    let mut content = vec![json!({ "type": "text", "text": text })];
    content.extend(attachments.iter().cloned());
    let mut message = json!({
        "type": "user",
        "parent_tool_use_id": Value::Null,
        "message": {
            "role": "user",
            "content": content,
        }
    });
    if let Some(session_id) = session_id.filter(|id| !id.is_empty()) {
        message["session_id"] = Value::String(session_id.to_string());
    }
    message
}

pub(crate) fn control_response_request_id(frame: &Value) -> Option<&str> {
    frame.get("response")?.get("request_id")?.as_str()
}

pub(crate) fn control_response_is_error(frame: &Value) -> bool {
    frame
        .get("response")
        .and_then(|response| response.get("subtype"))
        .and_then(Value::as_str)
        == Some("error")
}

pub(crate) fn control_response_error(frame: &Value) -> Option<&str> {
    frame
        .get("response")
        .and_then(|response| response.get("error"))
        .and_then(Value::as_str)
}

pub(crate) fn control_response_payload(frame: &Value) -> Option<&Value> {
    frame.get("response")?.get("response")
}

pub(crate) fn rewind_files_request(
    request_id: &str,
    user_message_id: &str,
    dry_run: bool,
) -> Value {
    host_control_request(
        request_id,
        json!({
            "subtype": "rewind_files",
            "user_message_id": user_message_id,
            "dry_run": dry_run,
        }),
    )
}

pub(crate) fn rewind_conversation_request(request_id: &str, target_message_uuid: &str) -> Value {
    host_control_request(
        request_id,
        json!({
            "subtype": "rewind_conversation",
            "target_message_uuid": target_message_uuid,
            "interrupt_if_running": false,
        }),
    )
}

pub(crate) fn rewind_conversation_succeeded(payload: &Value) -> bool {
    payload.get("rewound").and_then(Value::as_bool) == Some(true)
}

pub(crate) fn rewind_files_has_changes(payload: &Value) -> bool {
    payload
        .get("filesChanged")
        .and_then(Value::as_array)
        .is_some_and(|files| !files.is_empty())
}

/// Host protocol rejects a target that still has later user messages.
/// Walk last user → target: one `rewind_conversation` per predecessor, keeping `target`.
pub(crate) fn rewind_conversation_steps(
    ordered_uuids: &[String],
    target: &str,
) -> Result<Vec<String>, String> {
    let Some(target_idx) = ordered_uuids.iter().position(|id| id == target) else {
        return Err(format!("checkpoint {target} not found"));
    };
    Ok(
        ordered_uuids[target_idx..ordered_uuids.len().saturating_sub(1)]
            .iter()
            .rev()
            .cloned()
            .collect(),
    )
}

pub(crate) fn user_prompt_uuid(frame: &Value) -> Option<&str> {
    if frame.get("type").and_then(Value::as_str) != Some("user") {
        return None;
    }
    let uuid = frame
        .get("uuid")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?;
    if user_frame_is_tool_result_only(frame) {
        return None;
    }
    Some(uuid)
}

fn user_frame_is_tool_result_only(frame: &Value) -> bool {
    let Some(content) = frame
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_array)
    else {
        return false;
    };
    !content.is_empty()
        && content
            .iter()
            .all(|block| block.get("type").and_then(Value::as_str) == Some("tool_result"))
}

pub(crate) fn inbound_control_request_id(frame: &Value) -> Option<&str> {
    frame.get("request_id")?.as_str()
}

pub(crate) fn error_control_response(request_id: &str, error: &str) -> Value {
    json!({
        "type": "control_response",
        "response": {
            "subtype": "error",
            "request_id": request_id,
            "error": error,
        }
    })
}

pub(crate) fn permission_control_response(pending: &PendingPermission, option_id: &str) -> Value {
    let inner = permission_inner(pending, option_id);
    json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": pending.request_id,
            "response": inner,
        }
    })
}

pub(crate) fn deny_control_response(request_id: &str, message: &str) -> Value {
    json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": request_id,
            "response": {
                "behavior": "deny",
                "message": message,
            }
        }
    })
}

fn permission_inner(pending: &PendingPermission, option_id: &str) -> Value {
    match option_id {
        "allow_once" => json!({
            "behavior": "allow",
            "updatedInput": pending.input,
        }),
        "allow_always" => {
            let mut inner = json!({
                "behavior": "allow",
                "updatedInput": pending.input,
            });
            if let Some(suggestions) = &pending.suggestions {
                inner["updatedPermissions"] = suggestions.clone();
            }
            inner
        }
        "reject_once" | "reject_always" => json!({
            "behavior": "deny",
            "message": DENY_MESSAGE,
        }),
        other if pending.tool_name == "AskUserQuestion" => {
            json!({
                "behavior": "allow",
                "updatedInput": ask_user_updated_input(&pending.input, other),
            })
        }
        _ => json!({
            "behavior": "deny",
            "message": DENY_MESSAGE,
        }),
    }
}

fn ask_user_updated_input(input: &Value, option_id: &str) -> Value {
    let mut updated = input.clone();
    if !updated.is_object() {
        updated = json!({ "questions": [] });
    }
    let answers = updated
        .as_object_mut()
        .map(|object| object.entry("answers").or_insert_with(|| json!({})))
        .and_then(Value::as_object_mut);
    let Some(answers) = answers else {
        return updated;
    };
    let Some((index, label)) = parse_ask_option_id(option_id) else {
        return updated;
    };
    let Some(question) = input
        .get("questions")
        .and_then(Value::as_array)
        .and_then(|questions| questions.get(index))
    else {
        return updated;
    };
    let key = question
        .get("question")
        .and_then(Value::as_str)
        .unwrap_or(label)
        .to_string();
    answers.insert(key, Value::String(label.to_string()));
    updated
}

fn parse_ask_option_id(option_id: &str) -> Option<(usize, &str)> {
    let (index, label) = option_id.split_once(':')?;
    Some((index.parse().ok()?, label))
}

pub(crate) fn pending_from_can_use_tool(frame: &Value) -> Option<PendingPermission> {
    let request_id = inbound_control_request_id(frame)?.to_string();
    let request = frame.get("request")?;
    if request.get("subtype").and_then(Value::as_str) != Some("can_use_tool") {
        return None;
    }
    let tool_name = request.get("tool_name")?.as_str()?.to_string();
    let input = request.get("input").cloned().unwrap_or_else(|| json!({}));
    let suggestions = request.get("permission_suggestions").cloned();
    Some(PendingPermission {
        request_id,
        tool_name,
        input,
        suggestions,
    })
}

pub(crate) fn permission_request_event(pending: &PendingPermission) -> AgentPermissionRequest {
    let description = one_line_input_summary(&pending.input);
    let options = if pending.tool_name == "AskUserQuestion" {
        ask_user_options(&pending.input)
    } else {
        default_permission_options()
    };
    AgentPermissionRequest {
        request_id: pending.request_id.clone(),
        tool: pending.tool_name.clone(),
        description,
        content_markdown: None,
        options,
    }
}

fn default_permission_options() -> Vec<AgentPermissionOption> {
    vec![
        option("allow_once", "Allow once"),
        option("allow_always", "Allow always"),
        option("reject_once", "Reject once"),
        option("reject_always", "Reject always"),
    ]
}

fn option(id: &str, name: &str) -> AgentPermissionOption {
    AgentPermissionOption {
        option_id: id.to_string(),
        name: name.to_string(),
        kind: id.to_string(),
    }
}

fn ask_user_options(input: &Value) -> Vec<AgentPermissionOption> {
    let mut options = Vec::new();
    let Some(questions) = input.get("questions").and_then(Value::as_array) else {
        return default_permission_options();
    };
    for (index, question) in questions.iter().enumerate() {
        let Some(choices) = question.get("options").and_then(Value::as_array) else {
            continue;
        };
        for choice in choices {
            let Some(label) = choice.get("label").and_then(Value::as_str) else {
                continue;
            };
            let description = choice
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or(label);
            options.push(AgentPermissionOption {
                option_id: format!("{index}:{label}"),
                name: description.to_string(),
                kind: "other".into(),
            });
        }
    }
    if options.is_empty() {
        default_permission_options()
    } else {
        options
    }
}

fn one_line_input_summary(input: &Value) -> String {
    crate::map::extract_command(input)
        .or_else(|| crate::map::extract_path(input))
        .or_else(|| crate::map::extract_url(input))
        .or_else(|| crate::map::extract_query(input))
        .unwrap_or_else(|| {
            let raw = input.to_string();
            if raw.chars().count() > 120 {
                format!("{}…", raw.chars().take(120).collect::<String>())
            } else {
                raw
            }
        })
}

#[cfg(test)]
pub(crate) fn wire_has_forbidden_permission_fields(value: &Value) -> bool {
    contains_key(value, "allowed") || contains_key(value, "approved")
}

#[cfg(test)]
fn contains_key(value: &Value, key: &str) -> bool {
    match value {
        Value::Object(map) => {
            map.contains_key(key) || map.values().any(|child| contains_key(child, key))
        }
        Value::Array(items) => items.iter().any(|child| contains_key(child, key)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn testdata(name: &str) -> Value {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/providers/claude/testdata")
            .join(name);
        serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
    }

    #[test]
    fn apply_flag_settings_carries_effort_and_fast_mode() {
        let effort = apply_flag_settings_request("req_1", json!({ "effortLevel": "high" }));
        assert_eq!(effort["request"]["subtype"], "apply_flag_settings");
        assert_eq!(effort["request"]["settings"]["effortLevel"], "high");
        let fast = apply_flag_settings_request("req_2", json!({ "fastMode": true }));
        assert_eq!(fast["request"]["settings"]["fastMode"], true);
    }

    #[test]
    fn request_id_shape_matches_sdk() {
        assert_eq!(next_request_id(1, "deadbeef"), "req_1_deadbeef");
        let init = initialize_request("req_1_deadbeef");
        assert_eq!(init["type"], "control_request");
        assert_eq!(init["request_id"], "req_1_deadbeef");
        assert_eq!(init["request"]["subtype"], "initialize");
        assert!(init["request"].get("hooks").is_none());
        assert!(init.get("request").unwrap().get("mcpServers").is_none());
    }

    #[test]
    fn permission_allow_matches_golden_and_rejects_allowed() {
        let request = testdata("can_use_tool.json");
        let pending = pending_from_can_use_tool(&request).expect("pending");
        let encoded = permission_control_response(&pending, "allow_once");
        let golden = testdata("permission_allow.stdin.json");
        assert_eq!(encoded, golden);
        assert!(!wire_has_forbidden_permission_fields(&encoded));
        assert_eq!(encoded["response"]["request_id"], "req_p");
        assert!(encoded.get("request_id").is_none());
        assert_eq!(encoded["response"]["response"]["behavior"], "allow");
        assert_eq!(
            encoded["response"]["response"]["updatedInput"],
            json!({ "command": "ls" })
        );

        assert!(wire_has_forbidden_permission_fields(
            &json!({ "allowed": true })
        ));
        assert!(wire_has_forbidden_permission_fields(
            &json!({ "approved": true })
        ));
        assert!(control_response_request_id(&json!({
            "type": "control_response",
            "request_id": "req_1"
        }))
        .is_none());
        assert_eq!(
            control_response_request_id(&json!({
                "type": "control_response",
                "response": { "subtype": "success", "request_id": "req_1", "response": {} }
            })),
            Some("req_1")
        );
    }

    #[test]
    fn deny_uses_behavior_not_allowed() {
        let deny = deny_control_response("req_p", DENY_MESSAGE);
        assert_eq!(deny["response"]["response"]["behavior"], "deny");
        assert!(deny["response"]["response"]["message"]
            .as_str()
            .is_some_and(|message| !message.is_empty()));
        assert!(!wire_has_forbidden_permission_fields(&deny));
    }

    #[test]
    fn allow_always_echoes_input_and_suggestions() {
        let pending = PendingPermission {
            request_id: "req_p".into(),
            tool_name: "Bash".into(),
            input: json!({ "command": "ls" }),
            suggestions: Some(json!([{ "type": "addRules", "rules": [] }])),
        };
        let encoded = permission_control_response(&pending, "allow_always");
        assert_eq!(encoded["response"]["response"]["behavior"], "allow");
        assert_eq!(
            encoded["response"]["response"]["updatedInput"],
            json!({ "command": "ls" })
        );
        assert!(encoded["response"]["response"]
            .get("updatedPermissions")
            .is_some());
    }

    #[test]
    fn app069_s11_rewind_control_frames_match_sdk_subtypes() {
        let files = rewind_files_request("req_rw_f", "uu-user-2", false);
        let files_fixture: Value =
            serde_json::from_str(include_str!("testdata/rewind_files.stdin.json")).expect("files");
        assert_eq!(files, files_fixture);

        let conversation = rewind_conversation_request("req_rw_c", "uu-user-2");
        let conversation_fixture: Value =
            serde_json::from_str(include_str!("testdata/rewind_conversation.stdin.json"))
                .expect("conversation");
        assert_eq!(conversation, conversation_fixture);
        assert_eq!(files["request"]["subtype"], "rewind_files");
        assert_eq!(conversation["request"]["subtype"], "rewind_conversation");
        assert_ne!(files["request"]["subtype"], "rewind");
        assert_ne!(conversation["request"]["subtype"], "rewind");
        assert!(conversation["request"].get("summarize").is_none());
        assert!(files["request"].get("summarize").is_none());
        assert!(!format!("{files}{conversation}").contains("Summarize"));
    }

    #[test]
    fn rewind_conversation_requires_rewound_payload() {
        assert!(!rewind_conversation_succeeded(&json!({})));
        assert!(!rewind_conversation_succeeded(&json!({ "ok": true })));
        assert!(rewind_conversation_succeeded(&json!({ "rewound": true })));
        assert!(!rewind_conversation_succeeded(&json!({ "rewound": false })));
    }

    #[test]
    fn rewind_walks_last_user_to_target_one_step() {
        let uuids = vec!["u1".into(), "u2".into(), "u3".into(), "u4".into()];
        assert_eq!(
            rewind_conversation_steps(&uuids, "u2").unwrap(),
            vec!["u3".to_string(), "u2".to_string()]
        );
        assert!(rewind_conversation_steps(&uuids, "u4").unwrap().is_empty());
        assert!(rewind_conversation_steps(&uuids, "missing").is_err());
    }

    #[test]
    fn permission_summary_truncates_multibyte_without_panic() {
        let input = json!({ "payload": "你".repeat(200) });
        let summary = one_line_input_summary(&input);
        assert!(summary.ends_with('…'));
        assert!(summary.chars().count() <= 121);
    }

    #[test]
    fn live_rewind_payloads_from_cli_2_1_252() {
        let files = testdata("rewind_files.stdout.json");
        let files_inner = control_response_payload(&files).expect("payload").clone();
        assert_eq!(files_inner["canRewind"], true);
        assert!(!rewind_files_has_changes(&files_inner));
        let mut with_changes = files_inner;
        with_changes["filesChanged"] = json!(["src/lib.rs"]);
        assert!(rewind_files_has_changes(&with_changes));

        let conversation = testdata("rewind_conversation.stdout.json");
        let conversation_inner = control_response_payload(&conversation).expect("payload");
        assert!(rewind_conversation_succeeded(conversation_inner));
        assert_eq!(conversation_inner["targetMessageUuid"], "uu-user-2");

        let rejected = testdata("rewind_rejected.stdout.json");
        assert!(control_response_is_error(&rejected));
        assert_eq!(
            control_response_error(&rejected),
            Some("Unsupported control request subtype: rewind")
        );
    }

    #[test]
    fn empty_updated_input_is_not_used_for_allow_once() {
        let pending = PendingPermission {
            request_id: "req_p".into(),
            tool_name: "Bash".into(),
            input: json!({ "command": "ls" }),
            suggestions: None,
        };
        let encoded = permission_control_response(&pending, "allow_once");
        assert_ne!(encoded["response"]["response"]["updatedInput"], json!({}));
    }
}
