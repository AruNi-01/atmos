use crate::models::{ProviderManualSetup, ProviderManualSetupOption};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ProviderConfigFile {
    #[serde(default)]
    providers: BTreeMap<String, ProviderConfigEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ProviderConfigEntry {
    #[serde(default)]
    region: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
}

fn provider_config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| {
        home.join(".atmos")
            .join("ai-usage")
            .join("provider_config.json")
    })
}

fn load_provider_config_file() -> ProviderConfigFile {
    let Some(path) = provider_config_path() else {
        return ProviderConfigFile::default();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return ProviderConfigFile::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

fn save_provider_config_file(state: &ProviderConfigFile) {
    let Some(path) = provider_config_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string_pretty(state) {
        let _ = fs::write(path, contents);
    }
}

fn provider_entry(provider_id: &str) -> Option<ProviderConfigEntry> {
    load_provider_config_file()
        .providers
        .get(provider_id)
        .cloned()
}

fn region_options(provider_id: &str) -> Vec<ProviderManualSetupOption> {
    match provider_id {
        "zai" => vec![
            ProviderManualSetupOption {
                value: "auto".to_string(),
                label: "Auto".to_string(),
            },
            ProviderManualSetupOption {
                value: "global".to_string(),
                label: "Global".to_string(),
            },
            ProviderManualSetupOption {
                value: "china".to_string(),
                label: "China".to_string(),
            },
        ],
        "minimax" => vec![
            ProviderManualSetupOption {
                value: "auto".to_string(),
                label: "Auto".to_string(),
            },
            ProviderManualSetupOption {
                value: "global".to_string(),
                label: "Global".to_string(),
            },
            ProviderManualSetupOption {
                value: "china".to_string(),
                label: "China".to_string(),
            },
        ],
        _ => Vec::new(),
    }
}

pub(crate) fn provider_manual_setup(provider_id: &str) -> Option<ProviderManualSetup> {
    let options = region_options(provider_id);
    if options.is_empty() {
        return None;
    }
    let entry = provider_entry(provider_id);
    Some(ProviderManualSetup {
        selected_region: entry
            .as_ref()
            .and_then(|value| value.region.clone())
            .or_else(|| Some("auto".to_string())),
        region_options: options,
        api_key_configured: entry
            .as_ref()
            .and_then(|value| value.api_key.as_ref())
            .is_some_and(|value| !value.trim().is_empty()),
    })
}

pub(crate) fn provider_config_api_key(provider_id: &str) -> Option<String> {
    provider_entry(provider_id)?
        .api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn provider_config_region(provider_id: &str) -> Option<String> {
    provider_entry(provider_id)?
        .region
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
}

pub(crate) fn provider_config_source_label() -> Option<String> {
    provider_config_path().map(|path| path.display().to_string())
}

pub(crate) fn persist_provider_manual_setup(
    provider_id: &str,
    region: Option<String>,
    api_key: Option<String>,
) {
    let mut state = load_provider_config_file();
    let entry = state.providers.entry(provider_id.to_string()).or_default();

    if let Some(region) = region {
        let cleaned = region.trim().to_lowercase();
        entry.region = if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        };
    }

    if let Some(api_key) = api_key {
        let cleaned = api_key.trim().to_string();
        entry.api_key = if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        };
    }

    save_provider_config_file(&state);
}
