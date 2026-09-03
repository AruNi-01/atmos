use regex::Regex;
use serde_json::Value;

use crate::contract::{AgentAvailableCommand, AgentMode, AgentModel, AgentThinkingSupport};

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

fn is_provider_model_table_header(line: &str) -> bool {
    let cols: Vec<&str> = line.split_whitespace().collect();
    cols.len() >= 2
        && cols[0].eq_ignore_ascii_case("provider")
        && cols[1].eq_ignore_ascii_case("model")
}

/// `pi --list-models` rows: `deepseek  deepseek-v4-flash  1M  384K  yes  no`.
fn parse_provider_model_table_row(line: &str) -> Option<AgentModel> {
    if line.contains(" - ") {
        return None;
    }
    let cols: Vec<&str> = line.split_whitespace().collect();
    if cols.len() < 4 {
        return None;
    }
    let provider = cols[0];
    let model = cols[1];
    if provider.contains('/')
        || model.contains('/')
        || !provider
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        || !model
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return None;
    }
    Some(AgentModel {
        id: format!("{provider}/{model}"),
        label: model.to_string(),
        group: Some(provider.to_string()),
        is_default: false,
        thinking: None,
    })
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

/// True for `pi --list-models` header/row leftovers used as a model id
/// (`"provider  model  context ..."`). Those must not become `--model`.
pub fn model_id_is_table_noise(id: &str) -> bool {
    let trimmed = id.trim();
    trimmed.is_empty()
        || trimmed.contains(char::is_whitespace)
        || trimmed.eq_ignore_ascii_case("provider")
        || trimmed.eq_ignore_ascii_case("model")
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
        if is_provider_model_table_header(trimmed) {
            continue;
        }
        let normalized = trimmed.trim_start_matches(['-', '*', '•', ' ']).trim();
        if normalized.is_empty() || normalized.ends_with(':') {
            continue;
        }
        if let Some(model) = parse_provider_model_table_row(normalized) {
            parsed.push((model, false));
            continue;
        }
        let (raw_id, raw_label) = split_id_and_label(normalized);
        let (id, id_flags) = strip_model_line_flags(&raw_id);
        let (label, label_flags) = strip_model_line_flags(&raw_label);
        if id.is_empty() || model_id_is_table_noise(&id) {
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

/// Fallback Grok Chat thinking when `session/new` omitted per-model
/// `reasoningEfforts`. Live 1.0.13 `session/new` matches these sets:
/// 4.6 → low|medium|high|xhigh; 4.5 → low|medium|high; else none.
/// Do not use this to overwrite a probed per-model list.
pub fn grok_thinking_for_model_id(model_id: &str) -> AgentThinkingSupport {
    if model_id.contains("4.6") {
        AgentThinkingSupport::Enum {
            arg: Some("thinking".into()),
            options: vec!["low".into(), "medium".into(), "high".into(), "xhigh".into()],
        }
    } else if model_id.contains("4.5") {
        AgentThinkingSupport::Enum {
            arg: Some("thinking".into()),
            options: vec!["low".into(), "medium".into(), "high".into()],
        }
    } else {
        AgentThinkingSupport::None
    }
}

pub fn apply_grok_thinking_overlay(catalog: &mut crate::catalog::AgentModelCatalog) {
    for model in &mut catalog.models {
        if model
            .thinking
            .as_ref()
            .is_some_and(|thinking| !thinking.is_none())
        {
            continue;
        }
        let thinking = grok_thinking_for_model_id(&model.id);
        model.thinking = if thinking.is_none() {
            None
        } else {
            Some(thinking)
        };
    }
    catalog.thinking = AgentThinkingSupport::None;
}

pub fn agent_modes_from_value(value: &Value) -> Vec<AgentMode> {
    let items = if let Some(array) = value.as_array() {
        array.clone()
    } else if let Some(array) = value.get("options").and_then(Value::as_array) {
        array.clone()
    } else if let Some(array) = value.get("values").and_then(Value::as_array) {
        array.clone()
    } else if let Some(array) = value.get("items").and_then(Value::as_array) {
        array.clone()
    } else {
        return Vec::new();
    };
    let mut modes = Vec::new();
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = item.as_str() {
            if id.is_empty() {
                continue;
            }
            modes.push(AgentMode {
                id: id.to_string(),
                label: id.to_string(),
                is_default: index == 0,
            });
            continue;
        }
        let id = item
            .get("id")
            .or_else(|| item.get("value"))
            .or_else(|| item.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let label = item
            .get("label")
            .or_else(|| item.get("name"))
            .or_else(|| item.get("title"))
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string();
        let is_default = item
            .get("isDefault")
            .or_else(|| item.get("is_default"))
            .and_then(Value::as_bool)
            .unwrap_or(index == 0 && modes.is_empty());
        modes.push(AgentMode {
            id,
            label,
            is_default,
        });
    }
    modes
}

pub fn agent_modes_from_named_keys(root: &Value, keys: &[&str]) -> Vec<AgentMode> {
    for key in keys {
        if let Some(value) = root.get(*key) {
            let modes = agent_modes_from_value(value);
            if !modes.is_empty() {
                return modes;
            }
        }
    }
    if let Some(object) = root.as_object() {
        for key in keys {
            if let Some(value) = object.values().find_map(|item| item.get(*key)) {
                let modes = agent_modes_from_value(value);
                if !modes.is_empty() {
                    return modes;
                }
            }
        }
    }
    Vec::new()
}

pub fn parse_droid_help(output: &str) -> Vec<AgentModel> {
    let mut models = parse_droid_available_models(output);
    if models.is_empty() {
        return models;
    }
    let thinking_re = Regex::new(
        r"(?i)^-\s*(.+):\s*supports reasoning:\s*(Yes|No);\s*supported:\s*\[([^\]]*)\];\s*default:\s*(\S+)",
    )
    .expect("droid reasoning regex");
    for line in output.lines() {
        let Some(caps) = thinking_re.captures(line.trim()) else {
            continue;
        };
        let label = caps.get(1).map(|m| m.as_str().trim()).unwrap_or_default();
        let supports_yes = caps
            .get(2)
            .is_some_and(|m| m.as_str().eq_ignore_ascii_case("yes"));
        let options: Vec<String> = caps
            .get(3)
            .map(|m| m.as_str())
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        let Some(model) = models
            .iter_mut()
            .find(|model| model.label.eq_ignore_ascii_case(label))
        else {
            continue;
        };
        model.thinking = Some(if supports_yes && options.len() > 1 {
            AgentThinkingSupport::Enum {
                arg: Some("--reasoning-effort".into()),
                options,
            }
        } else {
            AgentThinkingSupport::None
        });
    }
    for model in &mut models {
        if model.thinking.is_none() {
            model.thinking = Some(AgentThinkingSupport::None);
        }
    }
    models
}

fn parse_droid_available_models(output: &str) -> Vec<AgentModel> {
    output
        .lines()
        .skip_while(|line| !line.trim().eq_ignore_ascii_case("available models:"))
        .skip(1)
        .take_while(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.to_ascii_lowercase().starts_with("model detail")
        })
        .filter_map(parse_droid_model_row)
        .collect()
}

fn parse_droid_model_row(line: &str) -> Option<AgentModel> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }
    let (id_raw, label_raw) = trimmed
        .split_once("  ")
        .map(|(id, label)| (id.trim(), label.trim()))
        .unwrap_or((trimmed, trimmed));
    let (id, id_flags) = strip_model_line_flags(id_raw);
    let (label, label_flags) = strip_model_line_flags(label_raw);
    if id.is_empty() {
        return None;
    }
    Some(AgentModel {
        id,
        label: if label.is_empty() {
            id_raw.trim().to_string()
        } else {
            label
        },
        group: None,
        is_default: id_flags.is_default || label_flags.is_default,
        thinking: None,
    })
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

/// Slash names are stored without a leading `/`. Composer / intercept add one.
pub fn normalize_command_name(raw: &str) -> Option<String> {
    let name = raw.trim().trim_start_matches('/').trim();
    if name.is_empty() || name.starts_with("__") {
        None
    } else {
        Some(name.to_string())
    }
}

/// Claude initialize `commands[]`, Pi `get_commands`, OpenCode `GET /command`,
/// Amp `skill list --json`, Codex `skills/list`.
pub fn commands_from_value(value: &Value) -> Vec<AgentAvailableCommand> {
    let mut out: Vec<AgentAvailableCommand> = Vec::new();
    for item in command_items(value) {
        push_command(&mut out, &item);
        let Some(aliases) = item.get("aliases").and_then(Value::as_array) else {
            continue;
        };
        for alias in aliases {
            let Some(name) = alias.as_str() else {
                continue;
            };
            let mut aliased = item.clone();
            if let Value::Object(map) = &mut aliased {
                map.insert("name".into(), Value::String(name.to_string()));
            }
            push_command(&mut out, &aliased);
        }
    }
    out
}

fn command_items(value: &Value) -> Vec<Value> {
    if let Some(items) = value.as_array() {
        return flatten_command_entries(items);
    }
    for key in ["commands", "skills"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            return flatten_command_entries(items);
        }
    }
    if let Some(items) = value.get("data").and_then(Value::as_array) {
        return flatten_command_entries(items);
    }
    Vec::new()
}

fn flatten_command_entries(items: &[Value]) -> Vec<Value> {
    let mut out = Vec::new();
    for item in items {
        if let Some(skills) = item.get("skills").and_then(Value::as_array) {
            out.extend(skills.iter().cloned());
            continue;
        }
        out.push(item.clone());
    }
    out
}

fn push_command(out: &mut Vec<AgentAvailableCommand>, item: &Value) {
    let Some(command) = command_from_item(item) else {
        return;
    };
    if out
        .iter()
        .any(|existing| existing.name.eq_ignore_ascii_case(&command.name))
    {
        return;
    }
    out.push(command);
}

fn command_from_item(item: &Value) -> Option<AgentAvailableCommand> {
    if item.get("enabled").and_then(Value::as_bool) == Some(false) {
        return None;
    }
    let raw = item
        .as_str()
        .or_else(|| item.get("name").and_then(Value::as_str))?;
    let name = normalize_command_name(raw)?;
    let description = ["description", "shortDescription", "short_description"]
        .iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .and_then(non_empty)
        .unwrap_or_else(|| name.clone());
    Some(AgentAvailableCommand {
        name,
        description,
        hint: command_hint(item),
    })
}

fn command_hint(item: &Value) -> Option<String> {
    if let Some(hint) = ["argumentHint", "argument_hint", "hint"]
        .iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .and_then(non_empty)
    {
        return Some(hint);
    }
    if let Some(hint) = item
        .get("input")
        .and_then(|input| input.get("hint"))
        .and_then(Value::as_str)
        .and_then(non_empty)
    {
        return Some(hint);
    }
    let hints = item.get("hints").and_then(Value::as_array)?;
    let joined = hints
        .iter()
        .filter_map(|value| value.as_str().and_then(non_empty))
        .collect::<Vec<_>>()
        .join(" ");
    non_empty(&joined)
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
    fn app069_s6_grok_thinking_overlay_is_pinned_per_family() {
        match grok_thinking_for_model_id("grok-4.5") {
            AgentThinkingSupport::Enum { options, arg } => {
                assert_eq!(options, &["low", "medium", "high"]);
                assert_eq!(arg.as_deref(), Some("thinking"));
            }
            other => panic!("expected 4.5 enum, got {other:?}"),
        }
        match grok_thinking_for_model_id("grok-4.6-preview") {
            AgentThinkingSupport::Enum { options, .. } => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected 4.6 enum, got {other:?}"),
        }
        assert!(grok_thinking_for_model_id("grok-composer-2.5-fast").is_none());
        assert!(grok_thinking_for_model_id("grok-4").is_none());

        let mut catalog = crate::catalog::AgentModelCatalog {
            agent_id: "grok".into(),
            status: crate::catalog::CatalogStatus::Ok,
            models: parse_grok(
                "Available models:\n* grok-4.5 (default)\n* grok-4.6-preview\n* grok-composer-2.5-fast",
            ),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::Manual {
                arg: "--reasoning-effort".into(),
                placeholder: Some("e.g. high".into()),
            },
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: crate::catalog::CatalogSource::Live,
            message: None,
        };
        apply_grok_thinking_overlay(&mut catalog);
        assert!(catalog.thinking.is_none());
        let by_id: std::collections::HashMap<_, _> = catalog
            .models
            .iter()
            .map(|model| (model.id.as_str(), model.thinking.clone()))
            .collect();
        match by_id.get("grok-4.5").and_then(|item| item.as_ref()) {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high"]);
            }
            other => panic!("expected 4.5 overlay, got {other:?}"),
        }
        match by_id.get("grok-4.6-preview").and_then(|item| item.as_ref()) {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected 4.6 overlay, got {other:?}"),
        }
        assert!(by_id.get("grok-composer-2.5-fast").unwrap().is_none());
    }

    #[test]
    fn grok_overlay_keeps_probed_per_model_thinking() {
        let mut catalog = crate::catalog::AgentModelCatalog {
            agent_id: "grok".into(),
            status: crate::catalog::CatalogStatus::Ok,
            models: vec![AgentModel {
                id: "grok-4.6".into(),
                label: "Grok 4.6".into(),
                group: None,
                is_default: true,
                thinking: Some(AgentThinkingSupport::Enum {
                    arg: Some("thinking".into()),
                    options: vec!["xhigh".into(), "high".into(), "medium".into(), "low".into()],
                }),
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: crate::catalog::CatalogSource::Live,
            message: None,
        };
        apply_grok_thinking_overlay(&mut catalog);
        match &catalog.models[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["xhigh", "high", "medium", "low"]);
            }
            other => panic!("expected probed order, got {other:?}"),
        }
    }

    #[test]
    fn droid_help_attaches_per_model_reasoning() {
        let models = parse_droid_help(
            r#"
Available Models:
  auto                         Auto Model
  claude-opus-5                Opus 5 (default)
  gpt-5.3-codex                GPT-5.3-Codex
  glm-5.2                      GLM-5.2 (Droid Core)

Model details:
  - Auto Model: supports reasoning: No; supported: [none]; default: none
  - Opus 5: supports reasoning: Yes; supported: [off, low, medium, high, xhigh, max]; default: high
  - GPT-5.3-Codex: supports reasoning: Yes; supported: [low, medium, high, xhigh]; default: medium
  - GLM-5.2 (Droid Core): supports reasoning: Yes; supported: [off, high, max]; default: high
"#,
        );
        assert_eq!(models.len(), 4);
        let opus = models
            .iter()
            .find(|model| model.id == "claude-opus-5")
            .unwrap();
        assert!(opus.is_default);
        match &opus.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["off", "low", "medium", "high", "xhigh", "max"]);
            }
            other => panic!("expected opus enum thinking, got {other:?}"),
        }
        let codex = models
            .iter()
            .find(|model| model.id == "gpt-5.3-codex")
            .unwrap();
        match &codex.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "medium", "high", "xhigh"]);
            }
            other => panic!("expected codex enum thinking, got {other:?}"),
        }
        let auto = models.iter().find(|model| model.id == "auto").unwrap();
        assert!(matches!(auto.thinking, Some(AgentThinkingSupport::None)));
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
    fn line_list_skips_pi_table_header_and_emits_provider_slash_ids() {
        let models = parse_line_list(
            "provider  model                         context  max-out  thinking  images\n\
             deepseek  deepseek-v4-flash             1M       384K     yes       no    \n\
             deepseek  deepseek-v4-pro               1M       384K     yes       no    \n",
        );
        assert_eq!(
            models
                .iter()
                .map(|model| (
                    model.id.as_str(),
                    model.group.as_deref(),
                    model.label.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![
                (
                    "deepseek/deepseek-v4-flash",
                    Some("deepseek"),
                    "deepseek-v4-flash"
                ),
                (
                    "deepseek/deepseek-v4-pro",
                    Some("deepseek"),
                    "deepseek-v4-pro"
                ),
            ]
        );
        assert!(!models
            .iter()
            .any(|model| model_id_is_table_noise(&model.id)));
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

    #[test]
    fn commands_from_initialize_strip_slash_skip_private_and_expand_aliases() {
        let commands = commands_from_value(&serde_json::json!({
            "commands": [
                {"name": "/compact", "description": "Compact history", "argumentHint": "[focus]"},
                {"name": "fast", "description": "Toggle Fast mode"},
                {"name": "code-review", "description": "Review the diff", "aliases": ["review"]},
                {"name": "__remote-workflow", "description": "internal"}
            ]
        }));
        assert_eq!(commands[0].name, "compact");
        assert_eq!(commands[0].hint.as_deref(), Some("[focus]"));
        assert!(commands.iter().any(|command| command.name == "fast"));
        assert!(commands.iter().any(|command| command.name == "review"));
        assert!(commands
            .iter()
            .all(|command| !command.name.starts_with('_') && !command.name.starts_with('/')));
    }

    #[test]
    fn grok_available_commands_read_nested_input_hint() {
        let commands = commands_from_value(&serde_json::json!([
            {
                "name": "compact",
                "description": "Compress conversation history",
                "input": { "hint": "optional context about what to preserve" }
            },
            {
                "name": "context",
                "description": "Show context window usage",
                "input": null
            }
        ]));
        assert_eq!(commands[0].name, "compact");
        assert_eq!(
            commands[0].hint.as_deref(),
            Some("optional context about what to preserve")
        );
        assert_eq!(commands[1].name, "context");
        assert!(commands[1].hint.is_none());
    }

    #[test]
    fn commands_from_opencode_list_and_amp_skills_and_codex_nested() {
        let opencode = commands_from_value(&serde_json::json!([
            {"name": "init", "description": "guided AGENTS.md setup", "source": "command"},
            {"name": "review", "description": "review changes", "hints": ["commit", "branch"]}
        ]));
        assert_eq!(opencode[0].name, "init");
        assert_eq!(opencode[1].hint.as_deref(), Some("commit branch"));

        let amp = commands_from_value(&serde_json::json!({
            "skills": [{"name": "10x", "description": "Superset audit"}]
        }));
        assert_eq!(amp[0].name, "10x");

        let pi = commands_from_value(&serde_json::json!({
            "commands": [{"name": "skill:find-skills", "description": "Find skills", "source": "skill"}]
        }));
        assert_eq!(pi[0].name, "skill:find-skills");

        let codex = commands_from_value(&serde_json::json!({
            "data": [{
                "cwd": "/tmp",
                "skills": [
                    {"name": "gh-cli", "description": "GitHub CLI", "enabled": true},
                    {"name": "off", "description": "disabled", "enabled": false}
                ]
            }]
        }));
        assert_eq!(codex.len(), 1);
        assert_eq!(codex[0].name, "gh-cli");
    }
}
