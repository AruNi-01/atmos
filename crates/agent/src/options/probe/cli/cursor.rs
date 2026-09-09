//! Cursor ACP model wire values use `base[param=value,...]`.
//! CLI `--list-models` uses encoded ids like `gpt-5.3-codex-fast`.
//! Chat ACP must only set advertised bracket values.

use crate::contract::{AgentMode, AgentModel, AgentThinkingSupport};
use crate::options::effort::sort_thinking_levels;
use std::collections::BTreeMap;

/// True when any model id looks like Cursor ACP bracket wire (`base[...]`).
pub fn models_look_like_cursor_acp<I, S>(models: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    models
        .into_iter()
        .any(|id| cursor_model_has_brackets(id.as_ref()))
}

pub fn cursor_model_has_brackets(id: &str) -> bool {
    let trimmed = id.trim();
    // Cursor: `base[param=...]`. Reject JSON-array wire ids like
    // `["deepseek-official","deepseek-v4-flash"]` (DeepSeek Harness).
    let Some(open) = trimmed.find('[') else {
        return false;
    };
    open > 0 && trimmed.ends_with(']')
}

/// Strip ACP brackets or CLI effort/fast suffixes down to the base model name.
///
/// Examples:
/// - `gpt-5.3-codex[reasoning=medium,fast=false]` → `gpt-5.3-codex`
/// - `gpt-5.3-codex-fast` → `gpt-5.3-codex`
/// - `composer-2.5-fast` → `composer-2.5`
/// - `claude-opus-5-thinking-high-fast` → `claude-opus-5`
pub fn cursor_model_base(id: &str) -> String {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let without_brackets = match trimmed.find('[') {
        Some(index) => &trimmed[..index],
        None => trimmed,
    };
    strip_cli_suffixes(without_brackets.trim_end_matches(['-', '_', ' '])).0
}

/// Match key for CLI ↔ ACP model ids.
///
/// Strips `cursor-` (CLI lists `cursor-grok-4.6-*`, ACP advertises `grok-4.6`)
/// and maps `auto` ↔ `default`.
pub fn cursor_alias_key(id: &str) -> String {
    let base = cursor_model_base(id);
    let stripped = base
        .strip_prefix("cursor-")
        .unwrap_or(base.as_str())
        .to_string();
    match stripped.as_str() {
        "auto" | "default" => "auto".into(),
        _ => stripped,
    }
}

/// Token multiset used when ACP renames models (`claude-sonnet-4-6` vs
/// `claude-4.6-sonnet`). Only used as a unique-match fallback.
fn cursor_token_key(id: &str) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for token in cursor_alias_key(id)
        .split(['-', '.', '_'])
        .filter(|token| !token.is_empty())
    {
        *counts.entry(token.to_ascii_lowercase()).or_insert(0) += 1;
    }
    counts
}

/// Collapse Cursor CLI encoded variants into bare models + per-model effort.
///
/// `gpt-5.3-codex-low` / `gpt-5.3-codex-high-fast` → one `gpt-5.3-codex` with
/// `thinking: enum [low, high, …]`. Models with only plain/`-fast` ids get
/// `thinking: none` (no Effort slider).
pub fn collapse_cursor_cli_models(models: Vec<AgentModel>) -> Vec<AgentModel> {
    if models.is_empty() {
        return models;
    }
    // Only collapse when the list still looks CLI-encoded (suffix variants).
    let looks_encoded = models.iter().any(|model| {
        let (base, effort, fast) = strip_cli_suffixes(model.id.trim());
        effort.is_some() || fast || base != model.id.trim()
    });
    if !looks_encoded {
        return models;
    }

    #[derive(Default)]
    struct Group {
        label: String,
        is_default: bool,
        efforts: Vec<String>,
        has_1m: bool,
        has_fast: bool,
        order: usize,
    }

    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    let mut order = 0usize;
    for model in models {
        let id = model.id.trim();
        if id.is_empty() {
            continue;
        }
        let (base, effort, fast) = strip_cli_suffixes(id);
        let base = if base.is_empty() {
            id.to_string()
        } else {
            base
        };
        let entry = groups.entry(base.clone()).or_insert_with(|| {
            let next = order;
            order += 1;
            Group {
                label: {
                    let cleaned = cursor_clean_display_label(&model.label);
                    if cleaned.is_empty() {
                        cursor_clean_display_label(&base)
                    } else {
                        cleaned
                    }
                },
                is_default: false,
                efforts: Vec::new(),
                has_1m: false,
                has_fast: false,
                order: next,
            }
        });
        if model.is_default {
            entry.is_default = true;
        }
        if let Some(level) = effort {
            if !entry.efforts.iter().any(|item| item == &level) {
                entry.efforts.push(level);
            }
        }
        if fast {
            entry.has_fast = true;
        }
        if cursor_label_has_1m(&model.label) {
            entry.has_1m = true;
        }
    }

    let mut collapsed: Vec<(usize, AgentModel)> = groups
        .into_iter()
        .map(|(id, group)| {
            let mut efforts = group.efforts;
            sort_thinking_levels(&mut efforts);
            let thinking = if efforts.is_empty() {
                Some(AgentThinkingSupport::None)
            } else {
                Some(AgentThinkingSupport::Enum {
                    arg: Some("effort".into()),
                    options: efforts,
                })
            };
            (
                group.order,
                AgentModel {
                    id: id.clone(),
                    label: if group.label.is_empty() {
                        id.clone()
                    } else {
                        group.label
                    },
                    group: None,
                    is_default: group.is_default,
                    thinking,
                    context: if group.has_1m {
                        cursor_inferred_context_options(&id)
                    } else {
                        Vec::new()
                    },
                    fast: group.has_fast,
                },
            )
        })
        .collect();
    collapsed.sort_by_key(|(index, _)| *index);
    collapsed.into_iter().map(|(_, model)| model).collect()
}

/// Copy per-model thinking (and pretty labels) from CLI-collapsed rows onto
/// ACP bare/bracket ids.
///
/// CLI collapse is authoritative for Cursor: overwrite ACP's session-scoped
/// stamp on the current model so every matched id gets its real ladder.
/// ACP often stamps `label == id` (slug); prefer the CLI human label.
pub fn fill_cursor_thinking_by_base(target: &mut [AgentModel], source: &[AgentModel]) {
    for model in target.iter_mut() {
        let Some(source_model) = find_cursor_thinking_source(model, source) else {
            continue;
        };
        if let Some(thinking) = source_model.thinking.clone() {
            model.thinking = Some(thinking);
        }
        if model.context.is_empty() && !source_model.context.is_empty() {
            model.context = source_model.context.clone();
        }
        if source_model.fast {
            model.fast = true;
        }
        if cursor_label_needs_upgrade(&model.label, &model.id)
            && !cursor_label_needs_upgrade(&source_model.label, &source_model.id)
        {
            model.label = source_model.label.clone();
        }
    }
}

fn cursor_label_needs_upgrade(label: &str, id: &str) -> bool {
    let label = label.trim();
    let id = id.trim();
    if label.is_empty() {
        return true;
    }
    if cursor_clean_display_label(label) != label {
        return true;
    }
    if cursor_label_looks_like_display_name(label) {
        return false;
    }
    if label.eq_ignore_ascii_case(id) {
        return true;
    }
    let base = cursor_model_base(id);
    let alias = cursor_alias_key(id);
    label.eq_ignore_ascii_case(&base) || label.eq_ignore_ascii_case(&alias)
}

fn cursor_label_looks_like_display_name(label: &str) -> bool {
    label.contains(' ') || label.chars().any(|ch| ch.is_ascii_uppercase())
}

/// Strip effort / Fast / Thinking / 1M tokens from Cursor CLI display names.
///
/// `--list-models` bakes those into the first variant (`GPT-5.4 1M Low`).
/// PMP already has separate Effort / Context / Fast controls.
pub fn cursor_clean_display_label(label: &str) -> String {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let (body, suffix) = split_trailing_parens(trimmed);
    let mut words: Vec<&str> = body.split_whitespace().collect();
    while let Some(word) = words.last() {
        if is_cursor_param_word(word) {
            words.pop();
            continue;
        }
        if words.len() >= 2 {
            let pair = format!("{} {}", words[words.len() - 2], word);
            if is_cursor_param_word(&pair) {
                words.pop();
                words.pop();
                continue;
            }
        }
        break;
    }
    words.retain(|word| !is_cursor_context_token(word));
    let mut cleaned = words.join(" ");
    if let Some(suffix) = suffix {
        if !cleaned.is_empty() {
            cleaned.push(' ');
        }
        cleaned.push_str(&suffix);
    }
    cleaned
}

fn split_trailing_parens(label: &str) -> (&str, Option<String>) {
    let trimmed = label.trim_end();
    if !trimmed.ends_with(')') {
        return (trimmed, None);
    }
    let Some(start) = trimmed.rfind('(') else {
        return (trimmed, None);
    };
    if start == 0 {
        return (trimmed, None);
    }
    let inner = &trimmed[start + 1..trimmed.len() - 1];
    if inner.eq_ignore_ascii_case("current") || inner.eq_ignore_ascii_case("no zdr") {
        return (
            trimmed[..start].trim_end(),
            Some(trimmed[start..].to_string()),
        );
    }
    (trimmed, None)
}

fn is_cursor_param_word(word: &str) -> bool {
    let compact = word
        .trim()
        .trim_matches(|ch: char| ch == ',' || ch == ';')
        .to_ascii_lowercase()
        .replace(['-', '_'], "");
    matches!(
        compact.as_str(),
        "fast"
            | "thinking"
            | "none"
            | "minimal"
            | "low"
            | "medium"
            | "med"
            | "high"
            | "xhigh"
            | "extrahigh"
            | "extra high"
            | "max"
            | "maximum"
    ) || is_cursor_context_token(word)
}

fn is_cursor_context_token(word: &str) -> bool {
    matches!(
        word.trim().to_ascii_lowercase().as_str(),
        "1m" | "1M" | "272k" | "300k" | "200k"
    )
}

fn cursor_label_has_1m(label: &str) -> bool {
    label
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| token.eq_ignore_ascii_case("1m"))
}

/// Live Cursor PMP (2026-09): GPT 1M models advertise `272k` + `1m`;
/// Claude / Muse 1M models advertise `300k` + `1m`. Default is the smaller window.
pub fn cursor_inferred_context_options(model_id: &str) -> Vec<AgentMode> {
    let (default_id, default_label) = cursor_default_context_for_model(model_id);
    vec![
        AgentMode {
            id: default_id.into(),
            label: default_label.into(),
            is_default: true,
        },
        AgentMode {
            id: "1m".into(),
            label: "1M".into(),
            is_default: false,
        },
    ]
}

fn cursor_default_context_for_model(model_id: &str) -> (&'static str, &'static str) {
    let alias = cursor_alias_key(model_id);
    if alias.starts_with("claude") || alias.starts_with("muse") {
        ("300k", "300K")
    } else {
        ("272k", "272K")
    }
}

fn find_cursor_thinking_source<'a>(
    model: &AgentModel,
    source: &'a [AgentModel],
) -> Option<&'a AgentModel> {
    if let Some(exact) = source.iter().find(|item| item.id == model.id) {
        return Some(exact);
    }
    let target_alias = cursor_alias_key(&model.id);
    if target_alias.is_empty() {
        return None;
    }
    let alias_matches: Vec<_> = source
        .iter()
        .filter(|item| cursor_alias_key(&item.id) == target_alias)
        .collect();
    if alias_matches.len() == 1 {
        return Some(alias_matches[0]);
    }
    if !alias_matches.is_empty() {
        // Prefer a source row that actually carries an effort ladder.
        if let Some(with_effort) = alias_matches.iter().find(|item| {
            item.thinking
                .as_ref()
                .is_some_and(|thinking| !thinking.is_none())
        }) {
            return Some(*with_effort);
        }
        return Some(alias_matches[0]);
    }
    let target_tokens = cursor_token_key(&model.id);
    if target_tokens.is_empty() {
        return None;
    }
    let token_matches: Vec<_> = source
        .iter()
        .filter(|item| cursor_token_key(&item.id) == target_tokens)
        .collect();
    if token_matches.len() == 1 {
        return Some(token_matches[0]);
    }
    token_matches.into_iter().find(|item| {
        item.thinking
            .as_ref()
            .is_some_and(|thinking| !thinking.is_none())
    })
}

/// Returns `(base, effort_level, has_fast)`.
fn strip_cli_suffixes(id: &str) -> (String, Option<String>, bool) {
    let mut base = id.to_string();
    let mut fast = false;
    let mut effort = None::<String>;
    loop {
        let before = base.clone();
        if let Some(stripped) = base.strip_suffix("-fast") {
            if !stripped.is_empty() {
                base = stripped.to_string();
                fast = true;
                continue;
            }
        }
        let mut matched = false;
        for (suffix, level) in [
            ("-thinking-max", "max"),
            ("-thinking-xhigh", "xhigh"),
            ("-thinking-high", "high"),
            ("-thinking-medium", "medium"),
            ("-thinking-low", "low"),
            ("-thinking", "high"),
            ("-xhigh", "xhigh"),
            ("-high", "high"),
            ("-medium", "medium"),
            ("-low", "low"),
            ("-max", "max"),
            ("-none", "none"),
        ] {
            if let Some(stripped) = base.strip_suffix(suffix) {
                if !stripped.is_empty() {
                    base = stripped.to_string();
                    if effort.is_none() {
                        effort = Some(level.to_string());
                    }
                    matched = true;
                    break;
                }
            }
        }
        if !matched && base == before {
            break;
        }
        if base == before {
            break;
        }
    }
    (base, effort, fast)
}

/// Prefer exact advertised value; otherwise unique base-name match.
pub fn map_to_advertised_cursor_model<'a>(
    requested: &str,
    advertised: impl IntoIterator<Item = &'a str>,
) -> Option<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return None;
    }
    let listed: Vec<&str> = advertised
        .into_iter()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect();
    if listed.is_empty() {
        return None;
    }
    if let Some(exact) = listed.iter().find(|item| **item == requested) {
        return Some((*exact).to_string());
    }
    let requested_base = cursor_alias_key(requested);
    if requested_base.is_empty() {
        return None;
    }
    let matches: Vec<&str> = listed
        .iter()
        .copied()
        .filter(|item| cursor_alias_key(item) == requested_base)
        .collect();
    if matches.len() == 1 {
        return Some(matches[0].to_string());
    }
    let requested_tokens = cursor_token_key(requested);
    if requested_tokens.is_empty() {
        return None;
    }
    let token_matches: Vec<&str> = listed
        .iter()
        .copied()
        .filter(|item| cursor_token_key(item) == requested_tokens)
        .collect();
    (token_matches.len() == 1).then(|| token_matches[0].to_string())
}

/// Human label: prefer ACP name, append non-empty bracket params when useful.
pub fn cursor_model_display_label(wire_value: &str, name: Option<&str>) -> String {
    let raw = name
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| cursor_model_base(wire_value));
    let base_name = {
        let cleaned = cursor_clean_display_label(&raw);
        if cleaned.is_empty() {
            raw
        } else {
            cleaned
        }
    };
    let Some(params) = cursor_model_params(wire_value) else {
        return base_name;
    };
    let interesting: Vec<&str> = params
        .split(',')
        .map(str::trim)
        .filter(|part| {
            if part.is_empty() {
                return false;
            }
            let lower = part.to_ascii_lowercase();
            !lower.ends_with("=false") && !lower.ends_with("=off") && lower != "fast=false"
        })
        .collect();
    // Skip noisy default-ish empty params; keep effort/fast/thinking when present.
    if interesting.is_empty() {
        return base_name;
    }
    format!("{base_name} ({})", interesting.join(", "))
}

fn cursor_model_params(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    let start = trimmed.find('[')?;
    if start == 0 {
        // JSON-array ACP ids (DeepSeek Harness), not Cursor `base[...]`.
        return None;
    }
    let inner = trimmed.get(start + 1..)?.strip_suffix(']')?;
    Some(inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_strips_brackets_and_cli_suffixes() {
        assert_eq!(
            cursor_model_base("gpt-5.3-codex[reasoning=medium,fast=false]"),
            "gpt-5.3-codex"
        );
        assert_eq!(cursor_model_base("gpt-5.3-codex-fast"), "gpt-5.3-codex");
        assert_eq!(
            cursor_model_base("gpt-5.3-codex-high-fast"),
            "gpt-5.3-codex"
        );
        assert_eq!(cursor_model_base("composer-2.5-fast"), "composer-2.5");
        assert_eq!(
            cursor_model_base("claude-opus-5-thinking-high-fast"),
            "claude-opus-5"
        );
        assert_eq!(cursor_model_base("gemini-3.5-flash[]"), "gemini-3.5-flash");
    }

    #[test]
    fn collapse_cli_variants_into_per_model_effort() {
        let collapsed = collapse_cursor_cli_models(vec![
            AgentModel {
                id: "gpt-5.3-codex-low".into(),
                label: "Codex 5.3 Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "gpt-5.3-codex-high-fast".into(),
                label: "Codex 5.3 High Fast".into(),
                group: None,
                is_default: true,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "gpt-5.3-codex-xhigh".into(),
                label: "Codex 5.3 Extra High".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "composer-2.5".into(),
                label: "Composer 2.5".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "composer-2.5-fast".into(),
                label: "Composer 2.5 Fast".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "auto".into(),
                label: "Auto".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ]);
        assert_eq!(
            collapsed
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["gpt-5.3-codex", "composer-2.5", "auto"]
        );
        let codex = collapsed
            .iter()
            .find(|item| item.id == "gpt-5.3-codex")
            .unwrap();
        assert!(codex.is_default);
        match &codex.thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high", "xhigh"]);
            }
            other => panic!("expected codex effort, got {other:?}"),
        }
        let composer = collapsed
            .iter()
            .find(|item| item.id == "composer-2.5")
            .unwrap();
        assert!(matches!(
            composer.thinking,
            Some(AgentThinkingSupport::None)
        ));
        let auto = collapsed.iter().find(|item| item.id == "auto").unwrap();
        assert!(matches!(auto.thinking, Some(AgentThinkingSupport::None)));
        assert!(codex.context.is_empty());
        assert!(composer.context.is_empty());
        assert!(codex.fast);
        assert!(composer.fast);
        assert!(!auto.fast);
    }

    #[test]
    fn collapse_strips_1m_and_effort_from_display_names() {
        let collapsed = collapse_cursor_cli_models(vec![
            AgentModel {
                id: "gpt-5.4-low".into(),
                label: "GPT-5.4 1M Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "gpt-5.4-medium".into(),
                label: "GPT-5.4 1M".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "claude-opus-4-8-low".into(),
                label: "Claude Opus 4.8 1M Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "gpt-5.4-mini-low".into(),
                label: "GPT-5.4 Mini Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ]);
        let gpt = collapsed.iter().find(|item| item.id == "gpt-5.4").unwrap();
        assert_eq!(gpt.label, "GPT-5.4");
        assert_eq!(
            gpt.context
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["272k", "1m"]
        );
        assert!(gpt.context[0].is_default);
        let claude = collapsed
            .iter()
            .find(|item| item.id == "claude-opus-4-8")
            .unwrap();
        assert_eq!(claude.label, "Claude Opus 4.8");
        assert_eq!(
            claude
                .context
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["300k", "1m"]
        );
        let mini = collapsed
            .iter()
            .find(|item| item.id == "gpt-5.4-mini")
            .unwrap();
        assert_eq!(mini.label, "GPT-5.4 Mini");
        assert!(mini.context.is_empty());
    }

    #[test]
    fn clean_display_label_keeps_current_and_no_zdr() {
        assert_eq!(
            cursor_clean_display_label("Composer 2.5 (current)"),
            "Composer 2.5 (current)"
        );
        assert_eq!(
            cursor_clean_display_label("Claude Fable 5 1M Low Thinking (NO ZDR)"),
            "Claude Fable 5 (NO ZDR)"
        );
        assert_eq!(cursor_clean_display_label("GPT-5.4 1M None"), "GPT-5.4");
        assert_eq!(cursor_clean_display_label("GPT-5.4 1M Low"), "GPT-5.4");
        assert_eq!(
            cursor_model_display_label("gpt-5.4", Some("GPT-5.4 1M None")),
            "GPT-5.4"
        );
    }

    #[test]
    fn fill_thinking_matches_acp_bracket_ids_to_cli_base() {
        let mut acp = vec![AgentModel {
            id: "gpt-5.3-codex[reasoning=medium,fast=false]".into(),
            label: "gpt-5.3-codex".into(),
            group: None,
            is_default: true,
            thinking: None,
            context: Vec::new(),
            fast: false,
        }];
        let cli = collapse_cursor_cli_models(vec![
            AgentModel {
                id: "gpt-5.3-codex-low".into(),
                label: "Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "gpt-5.3-codex-high".into(),
                label: "High".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ]);
        fill_cursor_thinking_by_base(&mut acp, &cli);
        match &acp[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high"]);
            }
            other => panic!("expected filled effort, got {other:?}"),
        }
    }

    #[test]
    fn fill_thinking_also_upgrades_slug_labels_from_cli() {
        let mut acp = vec![AgentModel {
            id: "claude-opus-4-8".into(),
            label: "claude-opus-4-8".into(),
            group: None,
            is_default: false,
            thinking: None,
            context: Vec::new(),
            fast: false,
        }];
        let cli = collapse_cursor_cli_models(vec![
            AgentModel {
                id: "claude-opus-4-8-low".into(),
                label: "Claude Opus 4.8".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "claude-opus-4-8-high".into(),
                label: "Claude Opus 4.8".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ]);
        fill_cursor_thinking_by_base(&mut acp, &cli);
        assert_eq!(acp[0].label, "Claude Opus 4.8");
        match &acp[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high"]);
            }
            other => panic!("expected filled effort, got {other:?}"),
        }
    }

    #[test]
    fn fill_thinking_matches_cursor_prefix_and_reordered_claude_ids() {
        let cli = collapse_cursor_cli_models(vec![
            AgentModel {
                id: "cursor-grok-4.6-low".into(),
                label: "Grok Low".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "cursor-grok-4.6-high".into(),
                label: "Grok High".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "claude-4.6-sonnet-medium".into(),
                label: "Sonnet Medium".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "claude-4.6-sonnet-high".into(),
                label: "Sonnet High".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "auto".into(),
                label: "Auto".into(),
                group: None,
                is_default: true,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ]);
        let mut acp = vec![
            AgentModel {
                id: "grok-4.6".into(),
                label: "grok-4.6".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "claude-sonnet-4-6".into(),
                label: "claude-sonnet-4-6".into(),
                group: None,
                is_default: false,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
            AgentModel {
                id: "default".into(),
                label: "Default".into(),
                group: None,
                is_default: true,
                thinking: None,
                context: Vec::new(),
                fast: false,
            },
        ];
        fill_cursor_thinking_by_base(&mut acp, &cli);
        match &acp[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high"]);
            }
            other => panic!("expected grok effort, got {other:?}"),
        }
        match &acp[1].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["medium", "high"]);
            }
            other => panic!("expected sonnet effort, got {other:?}"),
        }
        assert!(matches!(acp[2].thinking, Some(AgentThinkingSupport::None)));
    }

    #[test]
    fn deepseek_json_array_ids_are_not_cursor_brackets() {
        let id = r#"["deepseek-official","deepseek-v4-flash-vision-exp"]"#;
        assert!(!cursor_model_has_brackets(id));
        assert_eq!(cursor_model_params(id), None);
        assert_eq!(
            cursor_model_display_label(id, Some("DeepSeek-V4-Flash-Vision-Exp")),
            "DeepSeek-V4-Flash-Vision-Exp"
        );
    }

    #[test]
    fn map_prefers_exact_then_unique_base() {
        let listed = [
            "composer-2.5[fast=true]",
            "gpt-5.3-codex[reasoning=medium,fast=false]",
        ];
        assert_eq!(
            map_to_advertised_cursor_model("gpt-5.3-codex[reasoning=medium,fast=false]", listed)
                .as_deref(),
            Some("gpt-5.3-codex[reasoning=medium,fast=false]")
        );
        assert_eq!(
            map_to_advertised_cursor_model("gpt-5.3-codex-fast", listed).as_deref(),
            Some("gpt-5.3-codex[reasoning=medium,fast=false]")
        );
        assert_eq!(
            map_to_advertised_cursor_model("gpt-5.3-codex", listed).as_deref(),
            Some("gpt-5.3-codex[reasoning=medium,fast=false]")
        );
        assert_eq!(
            map_to_advertised_cursor_model("composer-2.5-fast", listed).as_deref(),
            Some("composer-2.5[fast=true]")
        );
        assert_eq!(
            map_to_advertised_cursor_model("unknown-model", listed),
            None
        );
    }

    #[test]
    fn display_label_keeps_interesting_params() {
        assert_eq!(
            cursor_model_display_label(
                "gpt-5.3-codex[reasoning=medium,fast=false]",
                Some("gpt-5.3-codex")
            ),
            "gpt-5.3-codex (reasoning=medium)"
        );
        assert_eq!(
            cursor_model_display_label("composer-2.5[fast=true]", Some("composer-2.5")),
            "composer-2.5 (fast=true)"
        );
        assert_eq!(
            cursor_model_display_label("gemini-3.5-flash[]", Some("gemini-3.5-flash")),
            "gemini-3.5-flash"
        );
    }
}
