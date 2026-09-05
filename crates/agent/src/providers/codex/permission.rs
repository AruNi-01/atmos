//! Server-request approvals → Atmos permission chrome, and option_id → wire result.

use serde_json::{json, Map, Value};

use crate::contract::{AgentPermissionOption, AgentPermissionRequest};
use crate::map::{ask_questions_from_input, is_ask_reject_option, labels_from_ask_option_id};

const MAX_MARKDOWN: usize = 16 * 1024;
const METHOD_REQUEST_USER_INPUT: &str = "item/tool/requestUserInput";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDialect {
    Decision,
    Permissions,
    /// Plan-mode Ask: experimental `item/tool/requestUserInput` (`request_user_input` tool).
    UserInput,
}

pub fn dialect_for_method(method: &str) -> Option<ApprovalDialect> {
    if method == METHOD_REQUEST_USER_INPUT {
        Some(ApprovalDialect::UserInput)
    } else if method == "item/permissions/requestApproval" {
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
    let mut questions = ask_questions_from_input(params);
    if dialect_for_method(method) == Some(ApprovalDialect::UserInput) {
        // ApprovalCard options are label-only; fold Codex option descriptions into
        // the displayed choice so Plan-mode copy is visible. Submit path strips
        // back to the wire `label`.
        enrich_user_input_option_labels(params, &mut questions);
    }
    AgentPermissionRequest {
        request_id,
        tool,
        description,
        content_markdown,
        options: permission_options(method, params),
        questions,
    }
}

pub fn permission_options(method: &str, params: &Value) -> Vec<AgentPermissionOption> {
    let dialect = dialect_for_method(method).unwrap_or(ApprovalDialect::Decision);
    if dialect == ApprovalDialect::UserInput {
        // ApprovalCard questions variant uses Continue/Skip; option_ids still
        // matter for cancel / auto-respond paths.
        return vec![
            option("accept", "Continue", "allow_once"),
            option("decline", "Skip", "reject_once"),
        ];
    }
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
        ApprovalDialect::UserInput => unreachable!(),
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
        Some(ApprovalDialect::UserInput) => user_input_result(option_id, params),
        Some(ApprovalDialect::Decision) | None => decision_result(option_id, params),
    }
}

pub fn cancel_result(method: &str, _params: &Value) -> Value {
    match dialect_for_method(method) {
        Some(ApprovalDialect::Permissions) => json!({ "scope": "turn", "permissions": {} }),
        // Plan docs: empty answers → continue with best judgment (not a hard fail).
        Some(ApprovalDialect::UserInput) => json!({ "answers": {} }),
        Some(ApprovalDialect::Decision) | None => json!({ "decision": "cancel" }),
    }
}

fn user_input_result(option_id: &str, params: &Value) -> Value {
    // Skip / decline / cancel / bare Continue → empty answers (Plan docs: continue
    // with best judgment when the tool returns no answers).
    if is_ask_reject_option(option_id)
        || matches!(
            option_id,
            "decline" | "cancel" | "accept" | "acceptForSession"
        )
    {
        return json!({ "answers": {} });
    }

    let questions = ask_questions_from_input(params);
    let mut by_id: Map<String, Value> = Map::new();
    if let Some(raw) = option_id.strip_prefix("answers:") {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) {
            by_id = map;
        }
    } else {
        let labels = labels_from_ask_option_id(option_id);
        if let Some(first) = questions.first() {
            if let Some(label) = labels.first() {
                by_id.insert(first.id.clone(), Value::String(label.clone()));
            }
        }
    }

    let mut answers = Map::new();
    for question in &questions {
        let Some(answer) = by_id
            .get(&question.id)
            .cloned()
            .or_else(|| by_id.get(&question.prompt).cloned())
        else {
            continue;
        };
        let labels: Vec<String> = answer_labels(&answer)
            .into_iter()
            .map(|label| wire_label_for_answer(params, &question.id, &label))
            .filter(|label| !label.is_empty())
            .collect();
        if labels.is_empty() {
            continue;
        }
        answers.insert(question.id.clone(), json!({ "answers": labels }));
    }

    json!({ "answers": answers })
}

fn enrich_user_input_option_labels(
    params: &Value,
    questions: &mut [crate::contract::AgentAskQuestion],
) {
    let Some(raw_questions) = params.get("questions").and_then(Value::as_array) else {
        return;
    };
    for question in questions.iter_mut() {
        let Some(raw) = raw_questions
            .iter()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(question.id.as_str()))
        else {
            continue;
        };
        let Some(choices) = raw.get("options").and_then(Value::as_array) else {
            continue;
        };
        question.options = choices
            .iter()
            .filter_map(|choice| {
                let label = choice
                    .get("label")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|text| !text.is_empty())?;
                let description = choice
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|text| !text.is_empty() && *text != label);
                Some(match description {
                    Some(description) => format!("{label} — {description}"),
                    None => label.to_string(),
                })
            })
            .collect();
    }
}

fn wire_label_for_answer(params: &Value, question_id: &str, answered: &str) -> String {
    let answered = answered.trim();
    if answered.is_empty() {
        return String::new();
    }
    let Some(raw_questions) = params.get("questions").and_then(Value::as_array) else {
        return answered.to_string();
    };
    let Some(raw) = raw_questions
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(question_id))
    else {
        return answered.to_string();
    };
    let Some(choices) = raw.get("options").and_then(Value::as_array) else {
        return answered.to_string();
    };
    for choice in choices {
        let Some(label) = choice
            .get("label")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
        else {
            continue;
        };
        if answered == label {
            return label.to_string();
        }
        let description = choice
            .get("description")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty());
        if let Some(description) = description {
            let folded = format!("{label} — {description}");
            if answered == folded {
                return label.to_string();
            }
        }
    }
    // Free-form / "Other" answers pass through unchanged.
    answered.to_string()
}

fn answer_labels(value: &Value) -> Vec<String> {
    match value {
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                Vec::new()
            } else {
                vec![text.to_string()]
            }
        }
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
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
    if method == METHOD_REQUEST_USER_INPUT {
        let questions = ask_questions_from_input(params);
        let description = if questions.is_empty() {
            "Question".into()
        } else {
            questions
                .iter()
                .map(|question| question.prompt.as_str())
                .collect::<Vec<_>>()
                .join(" · ")
        };
        return (
            "request_user_input".into(),
            description,
            user_input_option_markdown(params),
        );
    }
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

/// When Codex options carry `description`, surface them as markdown so ApprovalCard
/// (label-only options) still shows the full Plan-mode copy.
fn user_input_option_markdown(params: &Value) -> Option<String> {
    let questions = params.get("questions").and_then(Value::as_array)?;
    let mut lines: Vec<String> = Vec::new();
    for question in questions {
        let prompt = question
            .get("question")
            .or_else(|| question.get("header"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty());
        let Some(choices) = question.get("options").and_then(Value::as_array) else {
            continue;
        };
        let mut described = false;
        let mut block = Vec::new();
        for choice in choices {
            let label = choice
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty());
            let Some(label) = label else { continue };
            let description = choice
                .get("description")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty());
            if let Some(description) = description {
                described = true;
                block.push(format!("- **{label}**: {description}"));
            } else {
                block.push(format!("- {label}"));
            }
        }
        if !described {
            continue;
        }
        if let Some(prompt) = prompt {
            lines.push(format!("### {prompt}"));
        }
        lines.extend(block);
        lines.push(String::new());
    }
    let text = lines.join("\n").trim().to_string();
    cap_markdown((!text.is_empty()).then_some(text))
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

    fn user_input_fixture() -> (String, Value) {
        let line = include_str!("testdata/request-user-input.jsonl")
            .lines()
            .next()
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

    #[test]
    fn asks_and_plan_fields_pass_through_on_permissions_request() {
        let params = json!({
            "reason": "Need a choice",
            "questions": [
                {"question": "Color?", "options": [{"label": "Blue"}, {"label": "Red"}]}
            ]
        });
        let request = permission_request("70".into(), "item/permissions/requestApproval", &params);
        assert_eq!(request.questions.len(), 1);
        assert_eq!(request.questions[0].prompt, "Color?");
        assert_eq!(request.questions[0].options, ["Blue", "Red"]);
    }

    #[test]
    fn request_user_input_maps_questions_and_answer_payload() {
        let (method, params) = user_input_fixture();
        assert_eq!(
            dialect_for_method(&method),
            Some(ApprovalDialect::UserInput)
        );
        let request = permission_request("81".into(), &method, &params);
        assert_eq!(request.tool, "request_user_input");
        assert_eq!(request.questions.len(), 3);
        assert_eq!(request.questions[0].id, "q1");
        assert_eq!(
            request.questions[0].prompt,
            "你现在最想让我帮你处理哪类事情？"
        );
        assert_eq!(
            request.questions[0].options,
            [
                "写代码 — 一起实现功能、修复问题或优化项目。",
                "学习探索 — 解释概念、研究资料或制定学习路线。",
                "内容创作 — 撰写、修改或构思各类内容。"
            ]
        );
        assert!(request
            .content_markdown
            .as_deref()
            .unwrap_or("")
            .contains("一起实现功能"));
        let ids: Vec<_> = request
            .options
            .iter()
            .map(|o| o.option_id.as_str())
            .collect();
        assert_eq!(ids, ["accept", "decline"]);

        let accepted = result_json(
            &method,
            r#"answers:{"q1":"写代码 — 一起实现功能、修复问题或优化项目。","q2":"今天 — 立刻推进。","q3":"简短 — 要点即可。"}"#,
            &params,
        );
        assert_eq!(
            accepted,
            json!({
                "answers": {
                    "q1": { "answers": ["写代码"] },
                    "q2": { "answers": ["今天"] },
                    "q3": { "answers": ["简短"] }
                }
            })
        );
        let line = encode_result(&RpcId::Number(81), accepted);
        assert!(!line.contains("jsonrpc"));
        assert!(line.contains(r#""q1":{"answers":["写代码"]}"#));

        let skipped = result_json(&method, "reject_once", &params);
        assert_eq!(skipped, json!({ "answers": {} }));
        assert_eq!(cancel_result(&method, &params), json!({ "answers": {} }));
    }
}
