use crate::models::{ConfiguredApiKey, ProviderManualSetup, ProviderManualSetupOption};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
    // Legacy single-key fields (read-only for backward compat)
    #[serde(default)]
    region: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
    // Multi-key list (new format)
    #[serde(default)]
    keys: Vec<NamedApiKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct NamedApiKey {
    pub id: String,
    pub region: Option<String>,
    pub api_key: String,
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

/// Returns all named API keys for a provider, including migration from the legacy single-key format.
pub(crate) fn provider_config_api_keys(provider_id: &str) -> Vec<NamedApiKey> {
    let Some(entry) = provider_entry(provider_id) else {
        return Vec::new();
    };
    if !entry.keys.is_empty() {
        return entry.keys;
    }
    // Migrate legacy single-key entry
    if let Some(api_key) = entry
        .api_key
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
    {
        return vec![NamedApiKey {
            id: derive_key_id(provider_id, &api_key),
            region: entry.region,
            api_key,
        }];
    }
    Vec::new()
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

/// Providers that support manual API key input without region selection.
fn supports_api_key_only(_provider_id: &str) -> bool {
    false
}

pub(crate) fn provider_manual_setup(provider_id: &str) -> Option<ProviderManualSetup> {
    let options = region_options(provider_id);
    if options.is_empty() && !supports_api_key_only(provider_id) {
        return None;
    }
    let keys = provider_config_api_keys(provider_id);
    let api_key_configured = !keys.is_empty();
    let configured_keys = keys
        .iter()
        .map(|k| ConfiguredApiKey {
            id: k.id.clone(),
            region: k.region.clone(),
        })
        .collect();
    Some(ProviderManualSetup {
        selected_region: if options.is_empty() {
            None
        } else {
            Some("auto".to_string())
        },
        region_options: options,
        api_key_configured,
        configured_keys,
    })
}

pub(crate) fn provider_config_api_key(provider_id: &str) -> Option<String> {
    provider_config_api_keys(provider_id)
        .into_iter()
        .next()
        .map(|k| k.api_key)
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

fn derive_key_id(provider_id: &str, api_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(provider_id.as_bytes());
    hasher.update(b":");
    hasher.update(api_key.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8])
}

/// Add a new API key entry. Returns the ID of the new key, or the existing ID if duplicate.
pub(crate) fn add_provider_api_key(
    provider_id: &str,
    region: Option<String>,
    api_key: String,
) -> String {
    let api_key = api_key.trim().to_string();
    let id = derive_key_id(provider_id, &api_key);
    let mut state = load_provider_config_file();
    let entry = state.providers.entry(provider_id.to_string()).or_default();

    // Migrate legacy key if needed
    if entry.keys.is_empty() {
        if let Some(legacy_key) = entry
            .api_key
            .take()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
        {
            let legacy_id = derive_key_id(provider_id, &legacy_key);
            let legacy_region = entry.region.take();
            entry.keys.push(NamedApiKey {
                id: legacy_id,
                region: legacy_region,
                api_key: legacy_key,
            });
        }
        entry.region = None;
    }

    // Update if already present, otherwise append
    let region_cleaned = region
        .map(|r| r.trim().to_lowercase())
        .filter(|r| !r.is_empty());
    if let Some(existing) = entry.keys.iter_mut().find(|k| k.id == id) {
        existing.region = region_cleaned;
    } else {
        entry.keys.push(NamedApiKey {
            id: id.clone(),
            region: region_cleaned,
            api_key,
        });
    }

    save_provider_config_file(&state);
    id
}

/// Delete an API key entry by ID.
pub(crate) fn delete_provider_api_key(provider_id: &str, key_id: &str) {
    let mut state = load_provider_config_file();
    let entry = state.providers.entry(provider_id.to_string()).or_default();

    // Migrate legacy key first so we can match by ID
    if entry.keys.is_empty() {
        if let Some(legacy_key) = entry
            .api_key
            .take()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
        {
            let legacy_id = derive_key_id(provider_id, &legacy_key);
            let legacy_region = entry.region.take();
            entry.keys.push(NamedApiKey {
                id: legacy_id,
                region: legacy_region,
                api_key: legacy_key,
            });
        }
        entry.region = None;
    }

    entry.keys.retain(|k| k.id != key_id);

    save_provider_config_file(&state);
}

/// After auto-detecting a region for a key stored as "auto", write back the
/// concrete region so it won't be re-probed on every fetch.
pub(crate) fn update_provider_api_key_region(provider_id: &str, key_id: &str, region: &str) {
    let mut state = load_provider_config_file();
    if let Some(entry) = state.providers.get_mut(provider_id) {
        if let Some(key) = entry.keys.iter_mut().find(|k| k.id == key_id) {
            let current = key.region.as_deref().unwrap_or("auto");
            if current == "auto" || current.is_empty() {
                key.region = Some(region.to_string());
                save_provider_config_file(&state);
            }
        }
    }
}

pub(crate) fn persist_provider_manual_setup(
    provider_id: &str,
    region: Option<String>,
    api_key: Option<String>,
) {
    if let Some(api_key) = api_key.filter(|k| !k.trim().is_empty()) {
        add_provider_api_key(provider_id, region, api_key);
    }
    // If no api_key provided (region-only update), this is a no-op in the new model
    // since region is now per-key
}
