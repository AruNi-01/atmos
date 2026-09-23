//! Grok lists Fast as a sibling model id (`grok-4.7-build-fast` /
//! `Grok 4.7 Fast`) instead of a session `fast` config option.
//! Collapse those pairs into one picker row + per-model Fast, then encode
//! Fast back onto `{base}-build-fast` when talking to Grok.
//!
//! Do not reuse Droid `-fast` stripping: that would turn
//! `grok-4.7-build-fast` into `grok-4.7-build`.

use std::collections::{BTreeMap, HashSet};

use crate::contract::{AgentCurrentConfig, AgentMode, AgentModel, AgentThinkingSupport};
use crate::policy::{boolean_fast_modes, is_fast_on};

const FAST_ID_SUFFIX: &str = "-build-fast";

/// Strip a trailing `-build-fast` model id. Does not match `-fast` alone.
pub fn grok_fast_base(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    trimmed
        .strip_suffix(FAST_ID_SUFFIX)
        .filter(|base| !base.is_empty())
}

pub fn grok_fast_wire_id(base: &str) -> String {
    format!("{base}{FAST_ID_SUFFIX}")
}

/// Strip trailing " Fast" / " Fast Mode" from Grok display names.
pub fn grok_clean_display_label(label: &str) -> String {
    let trimmed = label.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let (body, suffix) = split_trailing_parens(trimmed);
    let mut body = body.trim_end().to_string();
    let lower = body.to_ascii_lowercase();
    for ending in [" fast mode", " fast"] {
        if let Some(stripped) = lower.strip_suffix(ending) {
            body = body[..stripped.len()].trim_end().to_string();
            break;
        }
    }
    if body.eq_ignore_ascii_case("fast") {
        body.clear();
    }
    if let Some(suffix) = suffix {
        if body.is_empty() {
            suffix
        } else {
            format!("{body} {suffix}")
        }
    } else {
        body
    }
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
    (
        trimmed[..start].trim_end(),
        Some(trimmed[start..].to_string()),
    )
}

/// Collapse `base` + `base-build-fast` into one `base` row with `fast: true`.
///
/// Lone `-build-fast` ids (no sibling) stay as-is so we never invent a base
/// Grok does not advertise.
pub fn collapse_grok_fast_models(models: Vec<AgentModel>) -> Vec<AgentModel> {
    if models.len() < 2 {
        return models;
    }
    let ids: HashSet<String> = models.iter().map(|model| model.id.clone()).collect();
    let has_pair = models.iter().any(|model| {
        grok_fast_base(&model.id).is_some_and(|base| ids.contains(base))
            || ids.contains(&grok_fast_wire_id(&model.id))
    });
    if !has_pair {
        return models;
    }

    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    let mut order = 0usize;
    let mut unpaired_fast: Vec<AgentModel> = Vec::new();
    for model in models {
        let id = model.id.trim();
        if id.is_empty() {
            continue;
        }
        if let Some(base) = grok_fast_base(id) {
            if !ids.contains(base) {
                unpaired_fast.push(model);
                continue;
            }
            let entry = groups.entry(base.to_string()).or_insert_with(|| {
                let next = order;
                order += 1;
                Group {
                    order: next,
                    ..Group::default()
                }
            });
            entry.has_fast = true;
            merge_group(entry, model, true);
            continue;
        }
        let entry = groups.entry(id.to_string()).or_insert_with(|| {
            let next = order;
            order += 1;
            Group {
                order: next,
                ..Group::default()
            }
        });
        if ids.contains(&grok_fast_wire_id(id)) {
            entry.has_fast = true;
        }
        merge_group(entry, model, false);
    }

    let mut collapsed: Vec<(usize, AgentModel)> = groups
        .into_iter()
        .map(|(id, group)| {
            (
                group.order,
                AgentModel {
                    id: id.clone(),
                    label: if group.label.is_empty() {
                        id
                    } else {
                        group.label
                    },
                    group: group.group,
                    is_default: group.is_default,
                    thinking: group.thinking,
                    context: group.context,
                    fast: group.has_fast,
                    multiplier: None,
                    fast_multiplier: None,
                },
            )
        })
        .collect();
    collapsed.sort_by_key(|(index, _)| *index);
    let mut out: Vec<AgentModel> = collapsed.into_iter().map(|(_, model)| model).collect();
    out.extend(unpaired_fast);
    out
}

#[derive(Default)]
struct Group {
    label: String,
    is_default: bool,
    thinking: Option<AgentThinkingSupport>,
    context: Vec<crate::contract::AgentMode>,
    group: Option<String>,
    has_fast: bool,
    order: usize,
}

fn merge_group(entry: &mut Group, model: AgentModel, from_fast: bool) {
    if model.is_default {
        entry.is_default = true;
    }
    if entry.group.is_none() {
        entry.group = model.group.clone();
    }
    if model.context.len() >= 2 && entry.context.len() < 2 {
        entry.context = model.context;
    }
    if thinking_is_usable(&model.thinking) && !thinking_is_usable(&entry.thinking) {
        entry.thinking = model.thinking;
    }
    let cleaned = if from_fast || entry.has_fast {
        grok_clean_display_label(&model.label)
    } else {
        model.label.trim().to_string()
    };
    if cleaned.is_empty() {
        return;
    }
    if entry.label.is_empty() || !from_fast {
        entry.label = cleaned;
    }
}

fn thinking_is_usable(thinking: &Option<AgentThinkingSupport>) -> bool {
    thinking.as_ref().is_some_and(|item| !item.is_none())
}

/// Map Atmos picker `(base, fast)` onto the Grok-advertised model id.
pub fn encode_grok_fast_model(model: &str, fast: Option<&str>, models: &[AgentModel]) -> String {
    let model = model.trim();
    if model.is_empty() {
        return String::new();
    }
    let (base, from_id) = match grok_fast_base(model) {
        Some(base) => (base.to_string(), true),
        None => (model.to_string(), false),
    };
    let on = from_id || is_fast_on(fast);
    if on && model_supports_grok_fast(&base, models) {
        grok_fast_wire_id(&base)
    } else {
        base
    }
}

fn model_supports_grok_fast(base: &str, models: &[AgentModel]) -> bool {
    if models.is_empty() {
        return true;
    }
    let wire = grok_fast_wire_id(base);
    models
        .iter()
        .any(|item| (item.id == base && item.fast) || item.id == wire)
}

/// If `current_config.model` is a `*-build-fast` sibling, fold it into the
/// base id and `fast=true` so the picker matches collapsed rows.
pub fn apply_grok_fast_current_config(config: &mut AgentCurrentConfig, models: &[AgentModel]) {
    let Some(model) = config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
    else {
        return;
    };
    let Some(base) = grok_fast_base(&model) else {
        return;
    };
    if !models.is_empty() && !models.iter().any(|item| item.id == base) {
        return;
    }
    config.model = Some(base.to_string());
    config.fast = Some("true".into());
}

/// Collapse advertised models, fold current Fast, and stamp boolean Fast
/// modes when any collapsed row supports it.
pub fn apply_grok_fast_options(
    models: &mut Vec<AgentModel>,
    config: &mut AgentCurrentConfig,
    fast: &mut Vec<AgentMode>,
) {
    if !models.is_empty() {
        *models = collapse_grok_fast_models(std::mem::take(models));
    }
    apply_grok_fast_current_config(config, models);
    if fast.is_empty() && models.iter().any(|model| model.fast) {
        *fast = boolean_fast_modes(is_fast_on(config.fast.as_deref()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentThinkingSupport;

    fn model(id: &str, label: &str, is_default: bool) -> AgentModel {
        AgentModel {
            id: id.into(),
            label: label.into(),
            group: None,
            is_default,
            thinking: None,
            context: Vec::new(),
            fast: false,
            multiplier: None,
            fast_multiplier: None,
        }
    }

    #[test]
    fn collapse_pairs_build_fast_siblings_and_cleans_labels() {
        let collapsed = collapse_grok_fast_models(vec![
            model("grok-4.7", "Grok 4.7", true),
            model("grok-4.7-build-fast", "Grok 4.7 Fast", false),
            model("grok-4.6", "Grok 4.6", false),
            model("grok-4.5", "Grok 4.5", false),
            model("grok-composer-2.5-fast", "Composer 2.5 Fast", false),
        ]);
        let by_id: Vec<_> = collapsed
            .iter()
            .map(|item| {
                (
                    item.id.as_str(),
                    item.label.as_str(),
                    item.fast,
                    item.is_default,
                )
            })
            .collect();
        assert_eq!(
            by_id,
            vec![
                ("grok-4.7", "Grok 4.7", true, true),
                ("grok-4.6", "Grok 4.6", false, false),
                ("grok-4.5", "Grok 4.5", false, false),
                ("grok-composer-2.5-fast", "Composer 2.5 Fast", false, false),
            ]
        );
        assert!(!collapsed
            .iter()
            .any(|item| item.id.ends_with("-build-fast")));
        assert_eq!(grok_clean_display_label("Grok 4.7 Fast"), "Grok 4.7");
        assert_eq!(grok_clean_display_label("Fast"), "");
    }

    #[test]
    fn collapse_keeps_unpaired_build_fast_and_does_not_strip_plain_fast() {
        let collapsed = collapse_grok_fast_models(vec![
            model("grok-composer-2.5-fast", "Composer 2.5 Fast", false),
            model("only-build-fast", "Only Fast", false),
        ]);
        assert_eq!(collapsed.len(), 2);
        assert!(!collapsed[0].fast);
        assert_eq!(collapsed[0].id, "grok-composer-2.5-fast");
        assert_eq!(collapsed[1].id, "only-build-fast");
    }

    #[test]
    fn collapse_does_not_pair_composer_fast_with_a_non_build_fast_suffix() {
        let collapsed = collapse_grok_fast_models(vec![
            model("grok-composer-2.5", "Composer 2.5", false),
            model("grok-composer-2.5-fast", "Composer 2.5 Fast", false),
        ]);
        assert_eq!(collapsed.len(), 2);
        assert!(!collapsed.iter().any(|item| item.fast));
        assert_eq!(collapsed[0].id, "grok-composer-2.5");
        assert_eq!(collapsed[1].id, "grok-composer-2.5-fast");
    }

    #[test]
    fn collapse_merges_thinking_from_either_sibling() {
        let mut base = model("grok-4.7", "Grok 4.7", false);
        base.thinking = Some(AgentThinkingSupport::Enum {
            arg: Some("thinking".into()),
            options: vec!["low".into(), "high".into(), "xhigh".into()],
        });
        let fast = model("grok-4.7-build-fast", "Grok 4.7 Fast", false);
        let collapsed = collapse_grok_fast_models(vec![base, fast]);
        assert_eq!(collapsed.len(), 1);
        assert!(collapsed[0].fast);
        match &collapsed[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high", "xhigh"]);
            }
            other => panic!("expected merged thinking, got {other:?}"),
        }
    }

    #[test]
    fn encode_appends_build_fast_when_the_collapsed_row_supports_it() {
        let models = collapse_grok_fast_models(vec![
            model("grok-4.7", "Grok 4.7", true),
            model("grok-4.7-build-fast", "Grok 4.7 Fast", false),
            model("grok-4.6", "Grok 4.6", false),
        ]);
        assert_eq!(
            encode_grok_fast_model("grok-4.7", Some("true"), &models),
            "grok-4.7-build-fast"
        );
        assert_eq!(
            encode_grok_fast_model("grok-4.7", Some("false"), &models),
            "grok-4.7"
        );
        assert_eq!(
            encode_grok_fast_model("grok-4.7-build-fast", None, &models),
            "grok-4.7-build-fast"
        );
        assert_eq!(
            encode_grok_fast_model("grok-4.6", Some("true"), &models),
            "grok-4.6"
        );
    }

    #[test]
    fn apply_current_config_folds_build_fast_wire_id() {
        let models = collapse_grok_fast_models(vec![
            model("grok-4.7", "Grok 4.7", false),
            model("grok-4.7-build-fast", "Grok 4.7 Fast", false),
        ]);
        let mut config = AgentCurrentConfig {
            model: Some("grok-4.7-build-fast".into()),
            ..AgentCurrentConfig::default()
        };
        apply_grok_fast_current_config(&mut config, &models);
        assert_eq!(config.model.as_deref(), Some("grok-4.7"));
        assert_eq!(config.fast.as_deref(), Some("true"));
    }
}
