//! Shared AskUser question extraction for permission chrome.

use serde_json::Value;

use crate::contract::AgentAskQuestion;

/// Tool names that belong in ApprovalCard `questions` (not command allow/deny).
pub fn is_ask_user_tool(name: &str) -> bool {
    let n = normalize(name);
    matches!(
        n.as_str(),
        "askuserquestion"
            | "ask_user_question"
            | "askquestion"
            | "ask_question"
            | "askuser"
            | "ask_user"
            | "request_user_input"
            | "requestuserinput"
            | "questions"
            | "question"
            | "select"
    ) || n.contains("ask_user")
        || n.contains("askuser")
}

/// ExitPlanMode / plan-approve permission tools.
pub fn is_exit_plan_tool(name: &str) -> bool {
    let n = normalize(name);
    matches!(
        n.as_str(),
        "exitplanmode"
            | "exit_plan_mode"
            | "exit_plan"
            | "exitplan"
            | "approve_plan"
            | "approveplan"
    ) || n.contains("exit_plan")
        || n.contains("exitplan")
        || n.contains("approve_plan")
}

/// Plan markdown for ApprovalCard `plan` (ExitPlanMode / SwitchMode ready_to_code).
pub fn plan_markdown_from_input(input: &Value) -> Option<String> {
    if let Some(plan) = plan_string_field(input) {
        return Some(plan);
    }
    for key in ["args", "input", "parameters", "payload"] {
        if let Some(plan) = input.get(key).and_then(plan_string_field) {
            return Some(plan);
        }
    }
    None
}

fn plan_string_field(value: &Value) -> Option<String> {
    value
        .get("plan")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// Optional on-disk plan path (Claude injects `planFilePath` on ExitPlanMode).
pub fn plan_file_path_from_input(input: &Value) -> Option<String> {
    for object in std::iter::once(input).chain(
        ["args", "input", "parameters", "payload"]
            .iter()
            .filter_map(|key| input.get(*key)),
    ) {
        if let Some(path) = object
            .get("planFilePath")
            .or_else(|| object.get("plan_file_path"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            return Some(path.to_string());
        }
    }
    None
}

pub fn ask_questions_from_input(input: &Value) -> Vec<AgentAskQuestion> {
    if let Some(questions) = input.get("questions").and_then(Value::as_array) {
        return ask_questions_from_array(questions);
    }
    // Codex / Pi / Cursor sometimes nest under args / input / parameters.
    for key in ["args", "input", "parameters", "payload"] {
        if let Some(questions) = input
            .get(key)
            .and_then(|nested| nested.get("questions"))
            .and_then(Value::as_array)
        {
            return ask_questions_from_array(questions);
        }
    }
    Vec::new()
}

pub fn ask_questions_from_array(questions: &[Value]) -> Vec<AgentAskQuestion> {
    questions
        .iter()
        .enumerate()
        .filter_map(|(index, question)| {
            let prompt = question
                .get("question")
                .or_else(|| question.get("header"))
                .or_else(|| question.get("prompt"))
                .or_else(|| question.get("text"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())?
                .to_string();
            let id = question
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| index.to_string());
            let options = question
                .get("options")
                .and_then(Value::as_array)
                .map(|choices| {
                    choices
                        .iter()
                        .filter_map(|choice| {
                            if let Some(label) = choice.as_str() {
                                let label = label.trim();
                                return (!label.is_empty()).then(|| label.to_string());
                            }
                            choice
                                .get("label")
                                .or_else(|| choice.get("name"))
                                .or_else(|| choice.get("value"))
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|text| !text.is_empty())
                                .map(str::to_string)
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            Some(AgentAskQuestion {
                id,
                prompt,
                options,
            })
        })
        .collect()
}

/// Build a single-question card from a title + choice labels.
pub fn ask_question_from_choices(prompt: &str, options: &[String]) -> Vec<AgentAskQuestion> {
    let prompt = prompt.trim();
    if prompt.is_empty() || options.is_empty() {
        return Vec::new();
    }
    vec![AgentAskQuestion {
        id: "0".into(),
        prompt: prompt.to_string(),
        options: options.to_vec(),
    }]
}

/// Unwrap ApprovalCard `answers:{json}` (or legacy `index:label`) into ordered labels.
pub fn labels_from_ask_option_id(option_id: &str) -> Vec<String> {
    if let Some(raw) = option_id.strip_prefix("answers:") {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) {
            let mut items: Vec<(usize, String)> = map
                .into_iter()
                .filter_map(|(key, value)| {
                    let label = value.as_str()?.trim();
                    if label.is_empty() {
                        return None;
                    }
                    let index = key.parse::<usize>().unwrap_or(usize::MAX);
                    Some((index, label.to_string()))
                })
                .collect();
            items.sort_by_key(|(index, _)| *index);
            return items.into_iter().map(|(_, label)| label).collect();
        }
    }
    if let Some((_, label)) = option_id.split_once(':') {
        if !label.is_empty() && option_id.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return vec![label.to_string()];
        }
    }
    if !option_id.trim().is_empty()
        && !matches!(
            option_id,
            "reject_once"
                | "reject_always"
                | "reject"
                | "deny"
                | "cancel"
                | "decline"
                | "allow_once"
                | "allow_always"
                | "allow"
                | "accept"
        )
    {
        return vec![option_id.to_string()];
    }
    Vec::new()
}

pub fn is_ask_reject_option(option_id: &str) -> bool {
    matches!(
        option_id,
        "reject_once" | "reject_always" | "reject" | "deny" | "cancel" | "decline" | "skip"
    )
}

/// Grok `_x.ai/ask_user_question` JSON-RPC result (internally tagged on `outcome`).
///
/// Live CLI (`AskUserQuestionExtResponse`) deserializes with serde
/// `#[serde(tag = "outcome")]`: `accepted` | `skip_interview` | `cancelled` |
/// `chat_about_this`. A bare `{ "type": "accepted", … }` fails with
/// `missing field \`outcome\`` and the tool card shows Failed.
///
/// `accepted.answers` is keyed by **question text** (not index); values are
/// string or string[]. `annotations` may be `{}`.
pub fn ask_user_ext_response(questions: &[AgentAskQuestion], option_id: &str) -> serde_json::Value {
    use serde_json::{json, Map, Value};

    if is_ask_reject_option(option_id) {
        return json!({ "outcome": "skip_interview" });
    }

    let mut by_id: Map<String, Value> = Map::new();
    if let Some(raw) = option_id.strip_prefix("answers:") {
        if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) {
            by_id = map;
        }
    } else {
        let labels = labels_from_ask_option_id(option_id);
        if let Some(first) = questions.first() {
            if labels.len() == 1 {
                by_id.insert(first.id.clone(), Value::String(labels[0].clone()));
            } else if !labels.is_empty() {
                by_id.insert(
                    first.id.clone(),
                    Value::Array(labels.into_iter().map(Value::String).collect()),
                );
            }
        }
    }

    let mut answers = Map::new();
    for question in questions {
        let Some(answer) = by_id.get(&question.id).cloned().or_else(|| {
            // Tolerate UIs that key by prompt text.
            by_id.get(&question.prompt).cloned()
        }) else {
            continue;
        };
        if answer_is_empty(&answer) {
            continue;
        }
        answers.insert(question.prompt.clone(), answer);
    }

    json!({
        "outcome": "accepted",
        "answers": answers,
        "annotations": {},
    })
}

fn answer_is_empty(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Null => true,
        serde_json::Value::String(text) => text.trim().is_empty(),
        serde_json::Value::Array(items) => items.is_empty(),
        _ => false,
    }
}

fn normalize(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_multi_questions() {
        let input = json!({
            "questions": [
                {"question": "Color?", "options": [{"label": "Blue"}, {"label": "Red"}]},
                {"id": "q2", "header": "Size?", "options": ["S", "L"]}
            ]
        });
        let qs = ask_questions_from_input(&input);
        assert_eq!(qs.len(), 2);
        assert_eq!(qs[0].id, "0");
        assert_eq!(qs[0].prompt, "Color?");
        assert_eq!(qs[0].options, ["Blue", "Red"]);
        assert_eq!(qs[1].id, "q2");
        assert_eq!(qs[1].options, ["S", "L"]);
    }

    #[test]
    fn answers_prefix_orders_by_index() {
        let labels = labels_from_ask_option_id(r#"answers:{"1":"B","0":"A"}"#);
        assert_eq!(labels, ["A", "B"]);
    }

    #[test]
    fn extracts_nested_questions_under_args() {
        let input = json!({
            "args": {
                "questions": [
                    {"prompt": "Pick?", "options": ["A", "B"]}
                ]
            }
        });
        let qs = ask_questions_from_input(&input);
        assert_eq!(qs.len(), 1);
        assert_eq!(qs[0].prompt, "Pick?");
        assert_eq!(qs[0].options, ["A", "B"]);
    }

    #[test]
    fn detects_request_user_input_and_exit_plan() {
        assert!(is_ask_user_tool("request_user_input"));
        assert!(is_exit_plan_tool("ExitPlanMode"));
        assert!(is_exit_plan_tool("exit_plan_mode"));
        assert!(!is_exit_plan_tool("EnterPlanMode"));
    }

    #[test]
    fn extracts_plan_markdown_and_file_path() {
        let input = json!({
            "plan": "# Ship\n\n- step one",
            "planFilePath": "/tmp/plans/plan.md"
        });
        assert_eq!(
            plan_markdown_from_input(&input).as_deref(),
            Some("# Ship\n\n- step one")
        );
        assert_eq!(
            plan_file_path_from_input(&input).as_deref(),
            Some("/tmp/plans/plan.md")
        );
        let nested = json!({ "args": { "plan": "do it" } });
        assert_eq!(plan_markdown_from_input(&nested).as_deref(), Some("do it"));
    }

    #[test]
    fn ask_user_ext_response_keys_by_question_text() {
        let questions = vec![
            AgentAskQuestion {
                id: "0".into(),
                prompt: "Color?".into(),
                options: vec!["Blue".into(), "Red".into()],
            },
            AgentAskQuestion {
                id: "1".into(),
                prompt: "Size?".into(),
                options: vec!["S".into(), "L".into()],
            },
        ];
        let accepted = ask_user_ext_response(&questions, r#"answers:{"0":"Blue","1":"L"}"#);
        assert_eq!(accepted["outcome"], "accepted");
        assert_eq!(accepted["answers"]["Color?"], "Blue");
        assert_eq!(accepted["answers"]["Size?"], "L");
        assert_eq!(accepted["annotations"], json!({}));
        assert!(accepted.get("type").is_none());
        assert!(accepted.get("partial_answers").is_none());

        let skipped = ask_user_ext_response(&questions, "reject_once");
        assert_eq!(skipped, json!({ "outcome": "skip_interview" }));
    }
}
