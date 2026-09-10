//! Factory Droid lists Fast as sibling model ids (`gpt-5.6-sol-fast` /
//! `GPT-5.6 Sol Fast Mode`) instead of a session `fast` config option.
//! Collapse those pairs into one picker row + per-model Fast, then encode
//! Fast back onto `{base}-fast` when talking to Droid.

use std::collections::{BTreeMap, HashSet};

use crate::contract::{AgentCurrentConfig, AgentMode, AgentModel, AgentThinkingSupport};
use crate::policy::is_fast_on;
use crate::policy::permission::{advertised_permission_modes, classify, AtmosPermission};

const FAST_ID_SUFFIX: &str = "-fast";

/// Strip a trailing `-fast` model id. Does not match `-flash`.
pub fn droid_fast_base(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    trimmed
        .strip_suffix(FAST_ID_SUFFIX)
        .filter(|base| !base.is_empty())
}

pub fn droid_fast_wire_id(base: &str) -> String {
    format!("{base}{FAST_ID_SUFFIX}")
}

/// Strip " Fast Mode" / trailing " Fast" from Droid display names.
///
/// Keeps parenthetical suffixes such as `(Droid Core)`.
pub fn droid_clean_display_label(label: &str) -> String {
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

/// Collapse `base` + `base-fast` into one `base` row with `fast: true`.
///
/// Lone `-fast` ids (no sibling) stay as-is so we never invent a base Droid
/// does not advertise.
pub fn collapse_droid_fast_models(models: Vec<AgentModel>) -> Vec<AgentModel> {
    if models.len() < 2 {
        return models;
    }
    let ids: HashSet<String> = models.iter().map(|model| model.id.clone()).collect();
    let has_pair = models.iter().any(|model| {
        droid_fast_base(&model.id).is_some_and(|base| ids.contains(base))
            || ids.contains(&droid_fast_wire_id(&model.id))
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
        if let Some(base) = droid_fast_base(id) {
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
        if ids.contains(&droid_fast_wire_id(id)) {
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
    let cleaned = droid_clean_display_label(&model.label);
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

/// Map Atmos picker `(base, fast)` onto the Droid-advertised model id.
pub fn encode_droid_fast_model(model: &str, fast: Option<&str>, models: &[AgentModel]) -> String {
    let model = model.trim();
    if model.is_empty() {
        return String::new();
    }
    let (base, from_id) = match droid_fast_base(model) {
        Some(base) => (base.to_string(), true),
        None => (model.to_string(), false),
    };
    let on = from_id || is_fast_on(fast);
    if on && model_supports_droid_fast(&base, models) {
        droid_fast_wire_id(&base)
    } else {
        base
    }
}

fn model_supports_droid_fast(base: &str, models: &[AgentModel]) -> bool {
    if models.is_empty() {
        return true;
    }
    let wire = droid_fast_wire_id(base);
    models
        .iter()
        .any(|item| (item.id == base && item.fast) || item.id == wire)
}

/// If `current_config.model` is a `*-fast` sibling, fold it into the base id
/// and `fast=true` so the picker matches collapsed rows.
pub fn apply_droid_fast_current_config(config: &mut AgentCurrentConfig, models: &[AgentModel]) {
    let Some(model) = config
        .model
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
    else {
        return;
    };
    let Some(base) = droid_fast_base(&model) else {
        return;
    };
    if !models.is_empty() && !models.iter().any(|item| item.id == base) {
        return;
    }
    config.model = Some(base.to_string());
    config.fast = Some("true".into());
}

fn compact_droid_token(raw: &str) -> String {
    raw.trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

/// Droid interaction mode: Normal (`auto`) vs Spec. Combined labels such as
/// `Auto (Low)` still count as `auto`.
pub fn droid_interaction_wire(raw: &str) -> &'static str {
    match compact_droid_token(raw).as_str() {
        "spec" | "specmode" | "specification" | "usespec" | "plan" => "spec",
        _ => "auto",
    }
}

/// Autonomy only — not interaction-mode `auto`. High collapses into Atmos Auto.
pub fn classify_droid_autonomy(raw: &str) -> Option<AtmosPermission> {
    match compact_droid_token(raw).as_str() {
        "skippermissionsunsafe" | "skippermissions" => Some(AtmosPermission::Yolo),
        "low" | "autolow" => Some(AtmosPermission::AcceptEdits),
        "medium" | "automedium" | "high" | "autohigh" => Some(AtmosPermission::Auto),
        "off" | "readonly" | "autooff" => Some(AtmosPermission::AskAlways),
        _ => classify(raw).filter(|item| *item != AtmosPermission::Auto),
    }
}

/// Stamp Atmos Mode (`auto` / `spec`) and the four permission rows. Peel
/// autonomy levels out of ACP `mode` lists so they do not appear as Mode.
pub fn fold_droid_composer_options(
    modes: Vec<AgentMode>,
    permission_modes: Vec<AgentMode>,
) -> (Vec<AgentMode>, Vec<AgentMode>) {
    let mut spec_default = false;
    let mut default_permission = None;
    for item in &modes {
        let spec = droid_interaction_wire(&item.id) == "spec"
            || droid_interaction_wire(&item.label) == "spec";
        if spec && item.is_default {
            spec_default = true;
        }
        if item.is_default {
            if let Some(permission) =
                classify_droid_autonomy(&item.id).or_else(|| classify_droid_autonomy(&item.label))
            {
                default_permission = Some(permission);
            }
        }
    }
    for item in &permission_modes {
        if item.is_default {
            if let Some(permission) =
                classify_droid_autonomy(&item.id).or_else(|| classify(&item.id))
            {
                default_permission = Some(permission);
            }
        }
    }
    let modes = vec![
        AgentMode {
            id: "auto".into(),
            label: "Auto".into(),
            is_default: !spec_default,
        },
        AgentMode {
            id: "spec".into(),
            label: "Spec".into(),
            is_default: spec_default,
        },
    ];
    let mut permission_modes = advertised_permission_modes("factory-droid");
    if let Some(default_permission) = default_permission {
        for item in &mut permission_modes {
            item.is_default = classify(&item.id) == Some(default_permission);
        }
    }
    (modes, permission_modes)
}

pub fn apply_droid_mode_permission_current_config(config: &mut AgentCurrentConfig) {
    if let Some(raw) = config
        .mode
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
    {
        if let Some(permission) = classify_droid_autonomy(&raw) {
            if config.permission_mode.as_deref().is_none_or(|value| {
                classify_droid_autonomy(value).is_none() && classify(value).is_none()
            }) {
                config.permission_mode = Some(permission.as_str().into());
            }
        }
        config.mode = Some(droid_interaction_wire(&raw).into());
    }
    if let Some(raw) = config
        .permission_mode
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
    {
        if droid_interaction_wire(&raw) == "spec"
            && classify_droid_autonomy(&raw).is_none()
            && classify(&raw).is_none()
        {
            config.mode = Some("spec".into());
            config.permission_mode = None;
        } else if let Some(permission) = classify_droid_autonomy(&raw).or_else(|| classify(&raw)) {
            config.permission_mode = Some(permission.as_str().into());
        }
    }
}

pub fn droid_spawn_flags(mode: Option<&str>, permission: Option<&str>) -> Vec<String> {
    let mut flags = Vec::new();
    if mode.is_some_and(|value| droid_interaction_wire(value) == "spec") {
        flags.push("--use-spec".into());
    }
    match permission
        .and_then(classify_droid_autonomy)
        .or_else(|| permission.and_then(classify))
    {
        Some(AtmosPermission::Yolo) => flags.push("--skip-permissions-unsafe".into()),
        Some(AtmosPermission::AcceptEdits) => {
            flags.push("--auto".into());
            flags.push("low".into());
        }
        Some(AtmosPermission::Auto) => {
            flags.push("--auto".into());
            flags.push("medium".into());
        }
        _ => {}
    }
    flags
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentMode, AgentThinkingSupport};
    use crate::policy::permission::AtmosPermission;

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
    fn collapse_pairs_fast_mode_siblings_and_cleans_labels() {
        let collapsed = collapse_droid_fast_models(vec![
            model("gpt-5.6-sol", "GPT-5.6 Sol (default)", true),
            model("gpt-5.6-sol-fast", "GPT-5.6 Sol Fast Mode", false),
            model("gpt-5.5", "GPT-5.5", false),
            model("gpt-5.5-fast", "GPT-5.5 Fast Mode", false),
            model("gpt-5.5-pro", "GPT-5.5 Pro", false),
            model("glm-5.2", "GLM-5.2 (Droid Core)", false),
            model("glm-5.2-fast", "GLM-5.2 Fast (Droid Core)", false),
            model("gemini-3.8-flash", "Gemini 3.8 Flash", false),
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
                ("gpt-5.6-sol", "GPT-5.6 Sol (default)", true, true),
                ("gpt-5.5", "GPT-5.5", true, false),
                ("gpt-5.5-pro", "GPT-5.5 Pro", false, false),
                ("glm-5.2", "GLM-5.2 (Droid Core)", true, false),
                ("gemini-3.8-flash", "Gemini 3.8 Flash", false, false),
            ]
        );
        assert!(!collapsed.iter().any(|item| item.id.ends_with("-fast")));
    }

    #[test]
    fn collapse_keeps_unpaired_fast_and_does_not_touch_flash() {
        let collapsed = collapse_droid_fast_models(vec![
            model("gemini-3.8-flash", "Gemini 3.8 Flash", false),
            model("only-fast", "Only Fast Mode", false),
        ]);
        assert_eq!(collapsed.len(), 2);
        assert!(!collapsed[0].fast);
        assert_eq!(collapsed[1].id, "only-fast");
    }

    #[test]
    fn collapse_merges_thinking_from_either_sibling() {
        let mut base = model("gpt-5.5", "GPT-5.5", false);
        base.thinking = Some(AgentThinkingSupport::Enum {
            arg: Some("--reasoning-effort".into()),
            options: vec!["low".into(), "high".into()],
        });
        let fast = model("gpt-5.5-fast", "GPT-5.5 Fast Mode", false);
        let collapsed = collapse_droid_fast_models(vec![base, fast]);
        assert_eq!(collapsed.len(), 1);
        assert!(collapsed[0].fast);
        match &collapsed[0].thinking {
            Some(AgentThinkingSupport::Enum { options, .. }) => {
                assert_eq!(options, &["low", "high"]);
            }
            other => panic!("expected merged thinking, got {other:?}"),
        }
    }

    #[test]
    fn encode_appends_fast_when_the_collapsed_row_supports_it() {
        let models = collapse_droid_fast_models(vec![
            model("gpt-5.6-sol", "GPT-5.6 Sol", true),
            model("gpt-5.6-sol-fast", "GPT-5.6 Sol Fast Mode", false),
            model("gpt-6-astra", "GPT-6 Astra", false),
        ]);
        assert_eq!(
            encode_droid_fast_model("gpt-5.6-sol", Some("true"), &models),
            "gpt-5.6-sol-fast"
        );
        assert_eq!(
            encode_droid_fast_model("gpt-5.6-sol", Some("false"), &models),
            "gpt-5.6-sol"
        );
        assert_eq!(
            encode_droid_fast_model("gpt-5.6-sol-fast", None, &models),
            "gpt-5.6-sol-fast"
        );
        assert_eq!(
            encode_droid_fast_model("gpt-6-astra", Some("true"), &models),
            "gpt-6-astra"
        );
    }

    #[test]
    fn apply_current_config_folds_fast_wire_id() {
        let models = collapse_droid_fast_models(vec![
            model("gpt-5.5", "GPT-5.5", false),
            model("gpt-5.5-fast", "GPT-5.5 Fast Mode", false),
        ]);
        let mut config = AgentCurrentConfig {
            model: Some("gpt-5.5-fast".into()),
            ..AgentCurrentConfig::default()
        };
        apply_droid_fast_current_config(&mut config, &models);
        assert_eq!(config.model.as_deref(), Some("gpt-5.5"));
        assert_eq!(config.fast.as_deref(), Some("true"));
    }

    fn mode(id: &str, label: &str, is_default: bool) -> AgentMode {
        AgentMode {
            id: id.into(),
            label: label.into(),
            is_default,
        }
    }

    #[test]
    fn folds_autonomy_out_of_mode_into_atmos_permission() {
        let (modes, permission) = fold_droid_composer_options(
            vec![
                mode("auto", "Auto", true),
                mode("spec", "Spec", false),
                mode("Auto (Low)", "Auto (Low)", false),
                mode("Auto (Medium)", "Auto (Medium)", false),
                mode("Auto (High)", "Auto (High)", false),
            ],
            Vec::new(),
        );
        assert_eq!(
            modes
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["auto", "spec"]
        );
        assert!(modes
            .iter()
            .any(|item| item.id == "auto" && item.is_default));
        assert_eq!(
            permission
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "accept_edits", "auto", "ask_always"]
        );
        assert_eq!(droid_interaction_wire("plan"), "spec");
        assert_eq!(droid_interaction_wire("Auto (Low)"), "auto");
        assert_eq!(
            classify_droid_autonomy("Auto (Low)"),
            Some(AtmosPermission::AcceptEdits)
        );
        assert_eq!(
            classify_droid_autonomy("medium"),
            Some(AtmosPermission::Auto)
        );
        assert_eq!(classify_droid_autonomy("auto"), None);
        assert_eq!(
            droid_spawn_flags(Some("spec"), Some("accept_edits")),
            ["--use-spec", "--auto", "low"]
        );
        assert_eq!(
            droid_spawn_flags(Some("auto"), Some("yolo")),
            ["--skip-permissions-unsafe"]
        );
        assert!(droid_spawn_flags(Some("auto"), Some("ask_always")).is_empty());

        let mut config = AgentCurrentConfig {
            mode: Some("Auto (Medium)".into()),
            ..AgentCurrentConfig::default()
        };
        apply_droid_mode_permission_current_config(&mut config);
        assert_eq!(config.mode.as_deref(), Some("auto"));
        assert_eq!(config.permission_mode.as_deref(), Some("auto"));
    }
}
