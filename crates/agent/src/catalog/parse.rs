use serde_json::Value;

use crate::domain::{AgentModel, AgentThinkingSupport};

pub fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub fn strip_default_model_suffix(value: &str) -> (String, bool) {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    if let Some(prefix) = lower.strip_suffix(" (default)") {
        let end = prefix.len();
        return (trimmed[..end].trim_end().to_string(), true);
    }
    (trimmed.to_string(), false)
}

pub fn parse_line_list(output: &str) -> Vec<AgentModel> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            let lower = trimmed.to_ascii_lowercase();
            if lower.contains("available model") || lower == "models" || lower == "model" {
                return None;
            }
            let normalized = trimmed.trim_start_matches(['-', '*', '•', ' ']).trim();
            if normalized.is_empty() || normalized.ends_with(':') {
                return None;
            }
            let (id, is_default) = strip_default_model_suffix(normalized);
            if id.is_empty() {
                return None;
            }
            Some(AgentModel {
                label: id.clone(),
                id,
                group: None,
                is_default,
                thinking: None,
            })
        })
        .collect()
}

pub fn parse_grok(output: &str) -> Vec<AgentModel> {
    output
        .lines()
        .skip_while(|line| !line.trim().eq_ignore_ascii_case("available models:"))
        .skip(1)
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with(['-', '*', '•']) {
                return None;
            }
            let normalized = trimmed.trim_start_matches(['-', '*', '•', ' ']).trim();
            let (id, is_default) = strip_default_model_suffix(normalized);
            (!id.is_empty()).then_some(AgentModel {
                label: id.clone(),
                id,
                group: None,
                is_default,
                thinking: None,
            })
        })
        .collect()
}

pub fn parse_json_models(output: &str) -> Result<Vec<AgentModel>, String> {
    let value: Value = serde_json::from_str(output)
        .map_err(|error| format!("Failed to parse model catalog JSON: {error}"))?;
    Ok(parse_json_models_value(&value))
}

pub fn parse_json_models_value(value: &Value) -> Vec<AgentModel> {
    match value {
        Value::Array(items) => items.iter().filter_map(model_from_json).collect(),
        Value::Object(map) => ["models", "items", "data"]
            .iter()
            .find_map(|key| map.get(*key))
            .map(parse_json_models_value)
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn model_from_json(value: &Value) -> Option<AgentModel> {
    match value {
        Value::String(model) => non_empty(model).map(|id| AgentModel {
            label: id.clone(),
            id,
            group: None,
            is_default: false,
            thinking: None,
        }),
        Value::Object(map) => {
            let id = ["id", "name", "model", "value"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty)?;
            let label = ["display_name", "label", "name", "id", "model"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty)
                .unwrap_or_else(|| id.clone());
            let group = ["group", "provider"]
                .iter()
                .find_map(|key| map.get(*key)?.as_str())
                .and_then(non_empty);
            let is_default = ["is_default", "default"]
                .iter()
                .find_map(|key| map.get(*key)?.as_bool())
                .unwrap_or(false);
            Some(AgentModel {
                id,
                label,
                group,
                is_default,
                thinking: None,
            })
        }
        _ => None,
    }
}

pub fn thinking_from_reasoning_mode(
    mode: &str,
    arg: Option<String>,
    options: Vec<String>,
    placeholder: Option<String>,
) -> AgentThinkingSupport {
    match mode {
        "enum" => AgentThinkingSupport::Enum { arg, options },
        "manual" => AgentThinkingSupport::Manual {
            arg: arg.unwrap_or_else(|| "--effort".to_string()),
            placeholder,
        },
        "encoded_in_model" => AgentThinkingSupport::EncodedInModel,
        "flag_only" => AgentThinkingSupport::FlagOnly {
            arg: arg.unwrap_or_else(|| "--thinking".to_string()),
        },
        _ => AgentThinkingSupport::None,
    }
}

pub fn looks_like_auth_required(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "auth",
        "login",
        "sign in",
        "sign-in",
        "unauthorized",
        "forbidden",
        "api key",
    ]
    .iter()
    .any(|pattern| lower.contains(pattern))
}

pub fn dedupe_models(models: Vec<AgentModel>) -> Vec<AgentModel> {
    let mut deduped: Vec<AgentModel> = Vec::with_capacity(models.len());
    for model in models {
        if !deduped.iter().any(|existing| existing.id == model.id) {
            deduped.push(model);
        }
    }
    deduped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_parser_marks_default() {
        let models = parse_grok("Available models:\n* grok-4.5 (default)\n* grok-4");
        assert_eq!(models.len(), 2);
        assert!(models[0].is_default);
        assert_eq!(models[0].id, "grok-4.5");
    }
}
