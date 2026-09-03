//! Server-request approvals → Atmos permission chrome, and option_id → wire result.

use serde_json::{json, Value};

use crate::contract::{AgentPermissionOption, AgentPermissionRequest};

const MAX_MARKDOWN: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDialect {
    Decision,
    Permissions,
}

pub fn dialect_for_method(method: &str) -> Option<ApprovalDialect> {
    if method == "item/permissions/requestApproval" {
        Some(ApprovalDialect::Permissions)
    } else if method.ends_with("/requestApproval")
        && (method.contains("commandExecution") || method.contains("fileChange"))
    {
        Some(ApprovalDialect::Decision)
    } else {
        None
    }
}

pub fn permission_request(
    request_id: String,
    method: &str,
    params: &Value,
) -> AgentPermissionRequest {
    let (tool, description, content_markdown) = card_copy(method, params);
    AgentPermissionRequest {
        request_id,
        tool,
        description,
        content_markdown,
        options: permission_options(method, params),
    }
}

pub fn permission_options(method: &str, params: &Value) -> Vec<AgentPermissionOption> {
    let dialect = dialect_for_method(method).unwrap_or(ApprovalDialect::Decision);
    let wanted = available_decisions(params);
    let mut all = match dialect {
        ApprovalDialect::Decision => vec![
            option("accept", "Accept", "allow_once"),
            option("acceptForSession", "Accept for session", "allow_always"),
            option("decline", "Decline", "reject_once"),
            option("cancel", "Cancel", "reject_once"),
        ],
        ApprovalDialect::Permissions => vec![
            option("accept", "Accept", "allow_once"),
            option("acceptForSession", "Accept for session", "allow_always"),
            option("decline", "Decline", "reject_once"),
            option("cancel", "Cancel", "reject_once"),
        ],
    };
    // 0.152.1 CommandExecutionApprovalDecision also has object variants.
    // Only surface the execpolicy one when the server proposed an amendment.
    if dialect == ApprovalDialect::Decision && !proposed_execpolicy(params).is_empty() {
        all.insert(
            2,
            option(
                "acceptWithExecpolicyAmendment",
                "Accept and remember",
                "allow_always",
            ),
        );
    }
    if wanted.is_empty() {
        return all;
    }
    all.into_iter()
        .filter(|option| wanted.iter().any(|id| id == &option.option_id))
        .collect()
}

pub fn result_json(method: &str, option_id: &str, params: &Value) -> Value {
    match dialect_for_method(method) {
        Some(ApprovalDialect::Permissions) => permissions_result(option_id, params),
        Some(ApprovalDialect::Decision) | None => decision_result(option_id, params),
    }
}

pub fn cancel_result(method: &str, _params: &Value) -> Value {
    match dialect_for_method(method) {
        Some(ApprovalDialect::Permissions) => json!({ "scope": "turn", "permissions": {} }),
        Some(ApprovalDialect::Decision) | None => json!({ "decision": "cancel" }),
    }
}

fn permissions_result(option_id: &str, params: &Value) -> Value {
    let requested = params
        .get("permissions")
        .cloned()
        .unwrap_or_else(|| json!({}));
    match option_id {
        "accept" => json!({ "scope": "turn", "permissions": requested }),
        "acceptForSession" => json!({ "scope": "session", "permissions": requested }),
        _ => json!({ "scope": "turn", "permissions": {} }),
    }
}

fn decision_result(option_id: &str, params: &Value) -> Value {
    if option_id == "acceptWithExecpolicyAmendment" {
        return json!({
            "decision": {
                "acceptWithExecpolicyAmendment": {
                    "execpolicy_amendment": proposed_execpolicy(params)
                }
            }
        });
    }
    json!({ "decision": option_id })
}

fn proposed_execpolicy(params: &Value) -> Vec<String> {
    params
        .get("proposedExecpolicyAmendment")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn available_decisions(params: &Value) -> Vec<String> {
    params
        .get("availableDecisions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn card_copy(method: &str, params: &Value) -> (String, String, Option<String>) {
    if method.contains("commandExecution") {
        let kind = params
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or("command");
        let command = params.get("command").and_then(Value::as_str).unwrap_or("");
        let reason = params
            .get("reason")
            .and_then(Value::as_str)
            .map(str::to_string);
        let description = if !command.is_empty() {
            reason.unwrap_or_else(|| command.to_string())
        } else if kind == "writeStdin" {
            reason.unwrap_or_else(|| "stdin".into())
        } else {
            reason.unwrap_or_else(|| "command".into())
        };
        return (
            "commandExecution".into(),
            description,
            cap_markdown(if command.is_empty() {
                None
            } else {
                Some(command.to_string())
            }),
        );
    }
    if method.contains("fileChange") {
        let path = params
            .get("grantRoot")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| first_change_path(params))
            .unwrap_or_else(|| "file".into());
        let reason = params
            .get("reason")
            .and_then(Value::as_str)
            .map(str::to_string);
        let description = reason.unwrap_or_else(|| path.clone());
        let diff = first_change_diff(params);
        return (
            "fileChange".into(),
            description,
            cap_markdown(diff.or(Some(path))),
        );
    }
    if method.contains("permissions") {
        let reason = params
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or("permissions")
            .to_string();
        return ("permissions".into(), reason, None);
    }
    (
        method.to_string(),
        params
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or(method)
            .to_string(),
        None,
    )
}

fn first_change_path(params: &Value) -> Option<String> {
    params
        .get("changes")
        .and_then(Value::as_array)
        .and_then(|changes| changes.first())
        .and_then(|change| change.get("path"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn first_change_diff(params: &Value) -> Option<String> {
    params
        .get("changes")
        .and_then(Value::as_array)
        .and_then(|changes| changes.first())
        .and_then(|change| change.get("diff"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn cap_markdown(text: Option<String>) -> Option<String> {
    let text = text?.trim().to_string();
    if text.is_empty() || text.len() > MAX_MARKDOWN {
        None
    } else {
        Some(text)
    }
}

fn option(option_id: &str, name: &str, kind: &str) -> AgentPermissionOption {
    AgentPermissionOption {
        option_id: option_id.into(),
        name: name.into(),
        kind: kind.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::codex::codec::{encode_result, RpcId};

    fn fixture_params(index: usize) -> (String, Value) {
        let line = include_str!("testdata/request-approval.jsonl")
            .lines()
            .nth(index)
            .expect("fixture line");
        let value: Value = serde_json::from_str(line).expect("json");
        let method = value
            .get("method")
            .and_then(Value::as_str)
            .expect("method")
            .to_string();
        let params = value.get("params").cloned().unwrap_or(Value::Null);
        (method, params)
    }

    #[test]
    fn command_approval_accept_writes_decision_without_jsonrpc() {
        let (method, params) = fixture_params(0);
        let request = permission_request("61".into(), &method, &params);
        assert_eq!(request.request_id, "61");
        assert_eq!(request.tool, "commandExecution");
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|o| o.option_id.as_str())
            .collect();
        assert_eq!(ids, ["accept", "acceptForSession", "decline", "cancel"]);
        let result = result_json(&method, "accept", &params);
        let line = encode_result(&RpcId::Number(61), result);
        assert_eq!(line.trim(), r#"{"id":61,"result":{"decision":"accept"}}"#);
        assert!(!line.contains("jsonrpc"));
    }

    #[test]
    fn file_and_permissions_dialects_have_goldens() {
        let (file_method, file_params) = fixture_params(1);
        let file_line = encode_result(
            &RpcId::Number(62),
            result_json(&file_method, "accept", &file_params),
        );
        assert_eq!(
            file_line.trim(),
            r#"{"id":62,"result":{"decision":"accept"}}"#
        );

        let (perm_method, perm_params) = fixture_params(2);
        let perm_line = encode_result(
            &RpcId::Number(63),
            result_json(&perm_method, "accept", &perm_params),
        );
        let value: Value = serde_json::from_str(perm_line.trim()).expect("json");
        assert!(value.get("jsonrpc").is_none());
        assert_eq!(value["id"], 63);
        assert_eq!(value["result"]["scope"], "turn");
        assert!(value["result"]["permissions"]["fileSystem"]["write"].is_array());

        let deny = result_json(&perm_method, "decline", &perm_params);
        assert_eq!(deny, json!({ "scope": "turn", "permissions": {} }));
    }

    #[test]
    fn available_decisions_hides_unlisted_options() {
        let params = json!({
            "command": "rm -rf dist",
            "availableDecisions": ["accept", "decline"]
        });
        let options = permission_options("item/commandExecution/requestApproval", &params);
        let ids: Vec<_> = options.iter().map(|o| o.option_id.as_str()).collect();
        assert_eq!(ids, ["accept", "decline"]);
    }

    #[test]
    fn write_stdin_uses_reason_without_command_markdown() {
        let (method, params) = fixture_params(3);
        let request = permission_request("64".into(), &method, &params);
        assert_eq!(request.tool, "commandExecution");
        assert_eq!(request.description, "Write to terminal");
        assert_eq!(request.content_markdown, None);
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|o| o.option_id.as_str())
            .collect();
        assert_eq!(ids, ["accept", "acceptForSession", "decline", "cancel"]);
    }

    #[test]
    fn execpolicy_amendment_writes_object_decision() {
        let (method, params) = fixture_params(4);
        let request = permission_request("65".into(), &method, &params);
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|o| o.option_id.as_str())
            .collect();
        assert_eq!(
            ids,
            [
                "accept",
                "acceptForSession",
                "acceptWithExecpolicyAmendment",
                "decline",
                "cancel"
            ]
        );
        let result = result_json(&method, "acceptWithExecpolicyAmendment", &params);
        let line = encode_result(&RpcId::Number(65), result);
        assert_eq!(
            line.trim(),
            r#"{"id":65,"result":{"decision":{"acceptWithExecpolicyAmendment":{"execpolicy_amendment":["prefix:git"]}}}}"#
        );
        assert!(!line.contains("jsonrpc"));
    }
}
