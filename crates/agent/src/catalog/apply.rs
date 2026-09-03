use crate::catalog::types::{AgentModelCatalog, CatalogStatus};
use crate::contract::{
    AgentCurrentConfig, AgentDescriptor, AgentIdentity, AgentMode, AgentSupportedOptions,
    AgentThinkingSupport,
};

pub fn supported_options_from_catalog(catalog: &AgentModelCatalog) -> AgentSupportedOptions {
    AgentSupportedOptions {
        models: catalog.models.clone(),
        thinking: catalog.thinking.clone(),
        modes: catalog.modes.clone(),
        permission_modes: catalog.permission_modes.clone(),
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

fn thinking_options_for_catalog(catalog: &AgentModelCatalog, model_id: &str) -> Vec<String> {
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

fn default_model_id(catalog: &AgentModelCatalog, requested: Option<&str>) -> Option<String> {
    if catalog.models.is_empty() {
        return requested
            .filter(|id| model_id_usable(id))
            .map(str::to_string);
    }
    if let Some(id) = requested {
        if model_id_usable(id) && catalog.models.iter().any(|item| item.id == id) {
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

pub fn apply_catalog_defaults_to_current_config(
    config: &mut AgentCurrentConfig,
    catalog: &AgentModelCatalog,
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
pub fn apply_catalog_to_descriptor(descriptor: &mut AgentDescriptor, catalog: &AgentModelCatalog) {
    if catalog.status != CatalogStatus::Ok {
        return;
    }
    descriptor.supported_options = supported_options_from_catalog(catalog);
    apply_catalog_defaults_to_current_config(&mut descriptor.current_config, catalog);
}

pub fn rebuild_descriptor_for_provider(
    provider_id: &str,
    current_config: AgentCurrentConfig,
    catalog: Option<&AgentModelCatalog>,
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
        apply_catalog_to_descriptor(&mut descriptor, catalog);
    }
    descriptor
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::types::{AgentModelCatalog, CatalogSource, CatalogStatus};
    use crate::contract::{AgentCurrentConfig, AgentMode, AgentModel, AgentThinkingSupport};

    #[test]
    fn supported_options_from_catalog_copies_lists() {
        let catalog = AgentModelCatalog {
            agent_id: "claude".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
            message: None,
        };
        let options = supported_options_from_catalog(&catalog);
        assert_eq!(options.models.len(), 1);
        assert!(options.thinking.is_none());
        assert!(options.modes.is_empty());
        assert_eq!(options.permission_modes.len(), 1);
        assert_eq!(options.permission_modes[0].id, "default");
    }

    #[test]
    fn apply_catalog_to_descriptor_fills_options_and_defaults() {
        let catalog = AgentModelCatalog {
            agent_id: "factory-droid".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
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

        apply_catalog_to_descriptor(
            &mut descriptor,
            &AgentModelCatalog {
                status: CatalogStatus::Probing,
                ..catalog.clone()
            },
        );
        assert_eq!(descriptor.current_config.model.as_deref(), Some("opus"));
    }

    #[test]
    fn default_model_id_skips_list_models_table_header() {
        let catalog = AgentModelCatalog {
            agent_id: "pi".into(),
            status: CatalogStatus::Ok,
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
            source: CatalogSource::Live,
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
