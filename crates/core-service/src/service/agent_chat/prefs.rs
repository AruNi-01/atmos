use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::new_chat_configs::{
    load_new_chat_configs_from, new_chat_configs_path, NewChatConfigsFile,
};
use crate::error::{Result, ServiceError};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentChatPrefs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_registry_id: Option<String>,
    /// Last New Chat composer snapshot per agent id (`cursor`, `claude`, …).
    /// Backed by `~/.atmos/config/agent/new_chat_configs.json` (landing chrome).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub last_new_chat_configs: HashMap<String, HashMap<String, String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
struct ChatPrefsDisk {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_registry_id: Option<String>,
}

pub fn agent_chat_prefs_path() -> PathBuf {
    if let Ok(raw) = std::env::var("ATMOS_AGENT_CONFIG_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("chat_prefs.json");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("chat_prefs.json")
}

pub fn load_agent_chat_prefs() -> Result<AgentChatPrefs> {
    load_agent_chat_prefs_from(&agent_chat_prefs_path(), &new_chat_configs_path())
}

pub fn save_agent_chat_prefs(prefs: &AgentChatPrefs) -> Result<()> {
    save_last_registry_id_to(&agent_chat_prefs_path(), prefs.last_registry_id.clone())
}

pub fn load_agent_chat_prefs_from(
    prefs_path: &Path,
    new_chat_path: &Path,
) -> Result<AgentChatPrefs> {
    let disk = load_chat_prefs_disk(prefs_path)?;
    let configs = load_new_chat_configs_from(new_chat_path)?;
    Ok(AgentChatPrefs {
        last_registry_id: normalize_registry_id(disk.last_registry_id),
        last_new_chat_configs: configs.agents,
    })
}

pub fn save_last_registry_id(last_registry_id: Option<String>) -> Result<()> {
    save_last_registry_id_to(&agent_chat_prefs_path(), last_registry_id)
}

pub fn save_last_registry_id_to(path: &Path, last_registry_id: Option<String>) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ServiceError::Validation(format!("Failed to create agent config dir: {error}"))
        })?;
    }
    let next = ChatPrefsDisk {
        last_registry_id: normalize_registry_id(last_registry_id),
    };
    let pretty = serde_json::to_string_pretty(&next).map_err(|error| {
        ServiceError::Validation(format!("Failed to serialize agent chat prefs: {error}"))
    })?;
    fs::write(path, pretty).map_err(|error| {
        ServiceError::Validation(format!("Failed to write agent chat prefs: {error}"))
    })?;
    Ok(())
}

fn load_chat_prefs_disk(path: &Path) -> Result<ChatPrefsDisk> {
    if !path.exists() {
        return Ok(ChatPrefsDisk::default());
    }
    let content = fs::read_to_string(path).map_err(|error| {
        ServiceError::Validation(format!("Failed to read agent chat prefs: {error}"))
    })?;
    let parsed: ChatPrefsDisk = serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse agent chat prefs: {error}"))
    })?;
    Ok(parsed)
}

fn normalize_registry_id(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

/// Test helper: aggregate view used by prefs_get.
#[allow(dead_code)]
pub fn prefs_with_new_chat_configs(
    last_registry_id: Option<String>,
    configs: NewChatConfigsFile,
) -> AgentChatPrefs {
    AgentChatPrefs {
        last_registry_id: normalize_registry_id(last_registry_id),
        last_new_chat_configs: configs.agents,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_chat::new_chat_configs::{
        snapshot_from_create_fields, upsert_agent_new_chat_config_at,
    };

    #[test]
    fn missing_file_is_empty_prefs() {
        let dir = tempfile::tempdir().unwrap();
        let prefs_path = dir.path().join("chat_prefs.json");
        let configs_path = dir.path().join("new_chat_configs.json");
        assert_eq!(
            load_agent_chat_prefs_from(&prefs_path, &configs_path).unwrap(),
            AgentChatPrefs::default()
        );
    }

    #[test]
    fn round_trips_last_registry_id_without_touching_new_chat_file() {
        let dir = tempfile::tempdir().unwrap();
        let prefs_path = dir.path().join("chat_prefs.json");
        let configs_path = dir.path().join("new_chat_configs.json");
        save_last_registry_id_to(&prefs_path, Some(" claude ".into())).unwrap();
        let loaded = load_agent_chat_prefs_from(&prefs_path, &configs_path).unwrap();
        assert_eq!(loaded.last_registry_id.as_deref(), Some("claude"));
        assert!(prefs_path.exists());
        assert!(!configs_path.exists());
        let raw = fs::read_to_string(&prefs_path).unwrap();
        assert!(raw.contains("\"last_registry_id\": \"claude\""));
        assert!(!raw.contains("last_new_chat_configs"));

        save_last_registry_id_to(&prefs_path, Some("   ".into())).unwrap();
        let cleared = load_agent_chat_prefs_from(&prefs_path, &configs_path).unwrap();
        assert_eq!(cleared.last_registry_id, None);
        let cleared_raw = fs::read_to_string(&prefs_path).unwrap();
        assert!(!cleared_raw.contains("last_registry_id"));
    }

    #[test]
    fn prefs_get_merges_new_chat_configs_from_dedicated_file() {
        let dir = tempfile::tempdir().unwrap();
        let prefs_path = dir.path().join("chat_prefs.json");
        let configs_path = dir.path().join("new_chat_configs.json");
        save_last_registry_id_to(&prefs_path, Some("cursor".into())).unwrap();
        upsert_agent_new_chat_config_at(
            &configs_path,
            "cursor",
            snapshot_from_create_fields(
                Some("gpt-5"),
                Some("low"),
                Some("agent"),
                None,
                Some("true"),
            ),
        )
        .unwrap();
        let loaded = load_agent_chat_prefs_from(&prefs_path, &configs_path).unwrap();
        assert_eq!(loaded.last_registry_id.as_deref(), Some("cursor"));
        assert_eq!(
            loaded
                .last_new_chat_configs
                .get("cursor")
                .and_then(|c| c.get("model"))
                .map(String::as_str),
            Some("gpt-5")
        );
        // Saving registry alone must not wipe new-chat snapshots.
        save_last_registry_id_to(&prefs_path, Some("claude".into())).unwrap();
        let after = load_agent_chat_prefs_from(&prefs_path, &configs_path).unwrap();
        assert_eq!(after.last_registry_id.as_deref(), Some("claude"));
        assert!(after.last_new_chat_configs.contains_key("cursor"));
    }
}
