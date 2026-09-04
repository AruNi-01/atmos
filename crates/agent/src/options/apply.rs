use crate::contract::{
    AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentMode, AgentSupportedOptions,
    AgentThinkingSupport,
};
use crate::options::types::{AgentOptionsSnapshot, OptionsStatus};

pub fn supported_options_from_snapshot(catalog: &AgentOptionsSnapshot) -> AgentSupportedOptions {
    AgentSupportedOptions {
        models: catalog.models.clone(),
        thinking: catalog.thinking.clone(),
        modes: catalog.modes.clone(),
        permission_modes: catalog.permission_modes.clone(),
        fast: crate::policy::native_fast_modes_for_provider(&catalog.agent_id).unwrap_or_default(),
    }
}

fn listed_thinking_options(thinking: &AgentThinkingSupport) -> Vec<String> {
    match thinking {
        AgentThinkingSupport::Enum { options, .. } => options
            .iter()
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn thinking_options_for_catalog(catalog: &AgentOptionsSnapshot, model_id: &str) -> Vec<String> {
    if let Some(model) = catalog.models.iter().find(|item| item.id == model_id) {
        if matches!(model.thinking.as_ref(), Some(AgentThinkingSupport::None)) {
            return Vec::new();
        }
        if let Some(thinking) = &model.thinking {
            let listed = listed_thinking_options(thinking);
            if !listed.is_empty() {
                return listed;
            }
        }
    }
    listed_thinking_options(&catalog.thinking)
}

fn model_ids_match(left: &str, right: &str) -> bool {
    let normalize = |value: &str| {
        value
            .trim()
            .to_ascii_lowercase()
            .replace(['.', '_', ' '], "-")
    };
    let left = normalize(left);
    let right = normalize(right);
    !left.is_empty()
        && (left == right
            || left.starts_with(&format!("{right}-"))
            || right.starts_with(&format!("{left}-"))
            || left.ends_with(&format!("-{right}"))
            || right.ends_with(&format!("-{left}")))
}

fn default_model_id(catalog: &AgentOptionsSnapshot, requested: Option<&str>) -> Option<String> {
    if catalog.models.is_empty() {
        return requested
            .filter(|id| model_id_usable(id))
            .map(str::to_string);
    }
    if let Some(id) = requested.filter(|id| model_id_usable(id)) {
        if let Some(exact) = catalog.models.iter().find(|item| item.id == id) {
            return Some(exact.id.clone());
        }
        if let Some(mapped) = crate::options::probe::cli::cursor::map_to_advertised_cursor_model(
            id,
            catalog.models.iter().map(|item| item.id.as_str()),
        ) {
            // Cursor-only CLI→bracket mapping; other agents keep fuzzy/exact below.
            if crate::policy::canonicalize_chat_provider_id(&catalog.agent_id) == "cursor" {
                return Some(mapped);
            }
        }
        let fuzzy: Vec<_> = catalog
            .models
            .iter()
            .filter(|item| model_id_usable(&item.id) && model_ids_match(&item.id, id))
            .collect();
        if fuzzy.len() == 1 {
            return Some(fuzzy[0].id.clone());
        }
        if catalog.models.is_empty() {
            // Host options not loaded yet — keep explicit create/configure request.
            return Some(id.to_string());
        }
    }
    catalog
        .models
        .iter()
        .find(|item| item.is_default && model_id_usable(&item.id))
        .or_else(|| catalog.models.iter().find(|item| model_id_usable(&item.id)))
        .map(|item| item.id.clone())
}

fn model_id_usable(id: &str) -> bool {
    let trimmed = id.trim();
    !trimmed.is_empty() && !trimmed.contains(char::is_whitespace)
}

fn default_mode_id(items: &[AgentMode], requested: Option<&str>) -> Option<String> {
    if items.is_empty() {
        return requested.map(str::to_string);
    }
    if let Some(id) = requested {
        if items.iter().any(|item| item.id == id) {
            return Some(id.to_string());
        }
    }
    items
        .iter()
        .find(|item| item.is_default)
        .or_else(|| items.first())
        .map(|item| item.id.clone())
}

pub fn apply_options_defaults_to_current_config(
    config: &mut AgentCurrentConfig,
    catalog: &AgentOptionsSnapshot,
) {
    config.model = default_model_id(catalog, config.model.as_deref());
    if let Some(model_id) = &config.model {
        let thinking = thinking_options_for_catalog(catalog, model_id);
        if !thinking.is_empty()
            && config
                .thinking
                .as_ref()
                .is_none_or(|value| !thinking.iter().any(|item| item == value))
        {
            config.thinking = thinking.first().cloned();
        }
    }
    if crate::policy::is_plan_mode(config.permission_mode.as_deref()) {
        if config.mode.is_none() {
            config.mode = Some("plan".into());
        }
        config.permission_mode = None;
    }
    if !catalog.modes.is_empty() {
        config.mode = default_mode_id(&catalog.modes, config.mode.as_deref());
    }
    if !catalog.permission_modes.is_empty() {
        if let Some(raw) = config.permission_mode.as_deref() {
            if let Some(normalized) = crate::policy::normalize_stored_permission(raw) {
                config.permission_mode = Some(normalized);
            }
        }
        config.permission_mode =
            default_mode_id(&catalog.permission_modes, config.permission_mode.as_deref());
    }
}

/// Copy a ready catalog into `supported_options` and fill missing `current_config`.
/// Live session overlays still replace these lists later; do not call this with a probing catalog.
pub fn apply_options_to_descriptor(
    descriptor: &mut AgentDescriptor,
    catalog: &AgentOptionsSnapshot,
) {
    if catalog.status != OptionsStatus::Ok {
        return;
    }
    descriptor.supported_options = supported_options_from_snapshot(catalog);
    apply_options_defaults_to_current_config(&mut descriptor.current_config, catalog);
}

pub fn rebuild_descriptor_for_provider(
    provider_id: &str,
    current_config: AgentCurrentConfig,
    catalog: Option<&AgentOptionsSnapshot>,
) -> AgentDescriptor {
    let mut descriptor = AgentDescriptor {
        identity: AgentIdentity {
            id: provider_id.to_string(),
            name: provider_id.to_string(),
            version: None,
        },
        capabilities: crate::policy::capabilities_for_provider(provider_id),
        support: crate::policy::option_support_for_provider(provider_id),
        supported_options: AgentSupportedOptions::default(),
        current_config,
    };
    if let Some(catalog) = catalog {
        apply_options_to_descriptor(&mut descriptor, catalog);
    }
    descriptor
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentCurrentConfig, AgentMode, AgentModel, AgentThinkingSupport};
    use crate::options::types::{AgentOptionsSnapshot, OptionsSource, OptionsStatus};

    #[test]
    fn supported_options_from_snapshot_copies_lists() {
        let catalog = AgentOptionsSnapshot {
            agent_id: "claude".into(),
            status: OptionsStatus::Ok,
            models: vec![AgentModel {
                id: "opus".into(),
                label: "Opus".into(),
                group: None,
                is_default: true,
                thinking: None,
            }],
            modes: Vec::new(),
            permission_modes: vec![AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: OptionsSource::Live,
            message: None,
        };
        let options = supported_options_from_snapshot(&catalog);
        assert_eq!(options.models.len(), 1);
        assert!(options.thinking.is_none());
        assert!(options.modes.is_empty());
        assert_eq!(options.permission_modes.len(), 1);
        assert_eq!(options.permission_modes[0].id, "default");
        assert_eq!(options.fast.len(), 2);
        assert_eq!(options.fast[0].id, "false");
        assert_eq!(options.fast[1].id, "true");
    }

    #[test]
    fn apply_catalog_keeps_explicit_model_when_catalog_lists_are_empty() {
        let catalog = AgentOptionsSnapshot {
            agent_id: "grok".into(),
            status: OptionsStatus::Ok,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: OptionsSource::Live,
            message: None,
        };
        let mut config = AgentCurrentConfig {
            model: Some("grok-composer-2.5-fast".into()),
            ..AgentCurrentConfig::default()
        };
        apply_options_defaults_to_current_config(&mut config, &catalog);
        assert_eq!(config.model.as_deref(), Some("grok-composer-2.5-fast"));
    }

    #[test]
    fn apply_options_to_descriptor_fills_options_and_defaults() {
        let catalog = AgentOptionsSnapshot {
            agent_id: "factory-droid".into(),
            status: OptionsStatus::Ok,
            models: vec![
                AgentModel {
                    id: "glm-5".into(),
                    label: "GLM 5".into(),
                    group: None,
                    is_default: false,
                    thinking: None,
                },
                AgentModel {
                    id: "opus".into(),
                    label: "Opus".into(),
                    group: None,
                    is_default: true,
                    thinking: Some(AgentThinkingSupport::Enum {
                        arg: None,
                        options: vec!["low".into(), "high".into()],
                    }),
                },
            ],
            modes: vec![AgentMode {
                id: "code".into(),
                label: "Code".into(),
                is_default: true,
            }],
            permission_modes: vec![AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            }],
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: OptionsSource::Live,
            message: None,
        };
        let mut descriptor = rebuild_descriptor_for_provider(
            "factory-droid",
            AgentCurrentConfig {
                model: Some("missing".into()),
                ..AgentCurrentConfig::default()
            },
            Some(&catalog),
        );
        assert_eq!(descriptor.supported_options.models.len(), 2);
        assert_eq!(descriptor.current_config.model.as_deref(), Some("opus"));
        assert_eq!(descriptor.current_config.thinking.as_deref(), Some("low"));
        assert_eq!(descriptor.current_config.mode.as_deref(), Some("code"));
        assert_eq!(
            descriptor.current_config.permission_mode.as_deref(),
            Some("default")
        );

        apply_options_to_descriptor(
            &mut descriptor,
            &AgentOptionsSnapshot {
                status: OptionsStatus::Probing,
                ..catalog.clone()
            },
        );
        assert_eq!(descriptor.current_config.model.as_deref(), Some("opus"));
    }

    #[test]
    fn default_model_id_skips_list_models_table_header() {
        let catalog = AgentOptionsSnapshot {
            agent_id: "pi".into(),
            status: OptionsStatus::Ok,
            models: vec![
                AgentModel {
                    id:
                        "provider  model                         context  max-out  thinking  images"
                            .into(),
                    label: "header".into(),
                    group: None,
                    is_default: true,
                    thinking: None,
                },
                AgentModel {
                    id: "deepseek/deepseek-v4-flash".into(),
                    label: "deepseek-v4-flash".into(),
                    group: Some("deepseek".into()),
                    is_default: false,
                    thinking: None,
                },
            ],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: chrono::Utc::now(),
            source: OptionsSource::Live,
            message: None,
        };
        let descriptor =
            rebuild_descriptor_for_provider("pi", AgentCurrentConfig::default(), Some(&catalog));
        assert_eq!(
            descriptor.current_config.model.as_deref(),
            Some("deepseek/deepseek-v4-flash")
        );
    }
}
