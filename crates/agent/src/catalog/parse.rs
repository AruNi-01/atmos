use serde_json::Value;

use crate::domain::{AgentModel, AgentThinkingSupport};

pub fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

struct ModelLineFlags {
    is_default: bool,
    is_current: bool,
}

pub fn strip_default_model_suffix(value: &str) -> (String, bool) {
    let (text, flags) = strip_model_line_flags(value);
    (text, flags.is_default)
}

fn strip_model_line_flags(value: &str) -> (String, ModelLineFlags) {
    let mut text = value.trim().to_string();
    let mut flags = ModelLineFlags {
        is_default: false,
        is_current: false,
    };
    loop {
        let lower = text.to_ascii_lowercase();
        if let Some(prefix) = lower.strip_suffix(" (current)") {
            text = text[..prefix.len()].trim_end().to_string();
            flags.is_current = true;
            continue;
        }
        if let Some(prefix) = lower.strip_suffix(" (default)") {
            text = text[..prefix.len()].trim_end().to_string();
            flags.is_default = true;
            continue;
        }
        break;
    }
    (text, flags)
}

fn split_id_and_label(line: &str) -> (String, String) {
    match line.split_once(" - ") {
        Some((id, label)) => {
            let id = id.trim();
            let label = label.trim();
            if id.is_empty() {
                (line.to_string(), line.to_string())
            } else if label.is_empty() {
                (id.to_string(), id.to_string())
            } else {
                (id.to_string(), label.to_string())
            }
        }
        None => (line.to_string(), line.to_string()),
    }
}

pub fn parse_line_list(output: &str) -> Vec<AgentModel> {
    let mut parsed: Vec<(AgentModel, bool)> = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("tip:") {
            break;
        }
        if lower.contains("available model") || lower == "models" || lower == "model" {
            continue;
        }
        let normalized = trimmed.trim_start_matches(['-', '*', '•', ' ']).trim();
        if normalized.is_empty() || normalized.ends_with(':') {
            continue;
        }
        let (raw_id, raw_label) = split_id_and_label(normalized);
        let (id, id_flags) = strip_model_line_flags(&raw_id);
        let (label, label_flags) = strip_model_line_flags(&raw_label);
        if id.is_empty() {
            continue;
        }
        let is_current = id_flags.is_current || label_flags.is_current;
        parsed.push((
            AgentModel {
                label: if label.is_empty() { id.clone() } else { label },
                id,
                group: None,
                is_default: is_current || id_flags.is_default || label_flags.is_default,
                thinking: None,
            },
            is_current,
        ));
    }
    if parsed.iter().any(|(_, is_current)| *is_current) {
        for (model, is_current) in &mut parsed {
            model.is_default = *is_current;
        }
    }
    parsed.into_iter().map(|(model, _)| model).collect()
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
        Value::Object(map) => {
            for key in ["models", "items", "data"] {
                if let Some(nested) = map.get(key) {
                    let parsed = match nested {
                        Value::Object(inner) => inner
                            .iter()
                            .filter_map(|(id, item)| model_from_map_entry(id, item))
                            .collect(),
                        other => parse_json_models_value(other),
                    };
                    if !parsed.is_empty() {
                        return parsed;
                    }
                }
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn model_from_map_entry(key: &str, value: &Value) -> Option<AgentModel> {
    match value {
        Value::String(model) => non_empty(model)
            .or_else(|| non_empty(key))
            .map(|id| AgentModel {
                label: id.clone(),
                id,
                group: None,
                is_default: false,
                thinking: None,
            }),
        Value::Object(_) => {
            let mut model = model_from_json(value).or_else(|| {
                non_empty(key).map(|id| AgentModel {
                    label: id.clone(),
                    id,
                    group: None,
                    is_default: false,
                    thinking: None,
                })
            })?;
            if model.id.is_empty() {
                model.id = key.to_string();
            }
            if model.label.is_empty() {
                model.label = key.to_string();
            }
            Some(model)
        }
        _ => non_empty(key).map(|id| AgentModel {
            label: id.clone(),
            id,
            group: None,
            is_default: false,
            thinking: None,
        }),
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

    #[test]
    fn line_list_keeps_id_only_rows_and_default_suffix() {
        let models = parse_line_list(
            "Available models:\n* grok-4.5 (default)\n- grok-composer-2.5-fast\n\n",
        );
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "grok-4.5");
        assert_eq!(models[0].label, "grok-4.5");
        assert!(models[0].is_default);
        assert_eq!(models[1].id, "grok-composer-2.5-fast");
        assert!(!models[1].is_default);
    }

    #[test]
    fn line_list_parses_cursor_id_label_pairs_and_prefers_current() {
        let models = parse_line_list(
            "Available models\n\n\
             auto - Auto (default)\n\
             gpt-5.6-luna-high - GPT-5.6 Luna 1M High\n\
             claude-fable-5-high - Claude Fable 5 1M (NO ZDR)\n\
             gemini-3.5-flash - Gemini 3.5 Flash (current)\n\
             kimi-k3-max - Kimi K3\n\n\
             Tip: use --model <id> (or /model <id> in interactive mode) to switch.\n\
             should-not-parse - Should Not Parse\n",
        );
        assert_eq!(
            models
                .iter()
                .map(|model| (model.id.as_str(), model.label.as_str(), model.is_default))
                .collect::<Vec<_>>(),
            vec![
                ("auto", "Auto", false),
                ("gpt-5.6-luna-high", "GPT-5.6 Luna 1M High", false),
                ("claude-fable-5-high", "Claude Fable 5 1M (NO ZDR)", false),
                ("gemini-3.5-flash", "Gemini 3.5 Flash", true),
                ("kimi-k3-max", "Kimi K3", false),
            ]
        );
    }

    #[test]
    fn json_parser_reads_kimi_provider_list_models_map() {
        let models = parse_json_models(
            r#"{
              "providers": { "kimi-for-coding": { "type": "kimi" } },
              "models": {
                "kimi-for-coding": {
                  "provider": "kimi-for-coding",
                  "model": "kimi-k2.5",
                  "display_name": "Kimi for Coding"
                },
                "kimi-k3": { "model": "kimi-k3" }
              }
            }"#,
        )
        .unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "kimi-k2.5");
        assert_eq!(models[0].label, "Kimi for Coding");
        assert_eq!(models[1].id, "kimi-k3");
    }
}
