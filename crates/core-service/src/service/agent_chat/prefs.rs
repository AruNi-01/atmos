use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, ServiceError};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentChatPrefs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_registry_id: Option<String>,
}

pub fn agent_chat_prefs_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("chat_prefs.json")
}

pub fn load_agent_chat_prefs() -> Result<AgentChatPrefs> {
    load_agent_chat_prefs_from(&agent_chat_prefs_path())
}

pub fn save_agent_chat_prefs(prefs: &AgentChatPrefs) -> Result<()> {
    save_agent_chat_prefs_to(&agent_chat_prefs_path(), prefs)
}

pub fn load_agent_chat_prefs_from(path: &Path) -> Result<AgentChatPrefs> {
    if !path.exists() {
        return Ok(AgentChatPrefs::default());
    }
    let content = fs::read_to_string(path).map_err(|error| {
        ServiceError::Validation(format!("Failed to read agent chat prefs: {error}"))
    })?;
    let parsed: AgentChatPrefs = serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse agent chat prefs: {error}"))
    })?;
    Ok(normalize_agent_chat_prefs(&parsed))
}

pub fn save_agent_chat_prefs_to(path: &Path, prefs: &AgentChatPrefs) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ServiceError::Validation(format!("Failed to create agent config dir: {error}"))
        })?;
    }
    let next = normalize_agent_chat_prefs(prefs);
    let pretty = serde_json::to_string_pretty(&next).map_err(|error| {
        ServiceError::Validation(format!("Failed to serialize agent chat prefs: {error}"))
    })?;
    fs::write(path, pretty).map_err(|error| {
        ServiceError::Validation(format!("Failed to write agent chat prefs: {error}"))
    })?;
    Ok(())
}

fn normalize_agent_chat_prefs(prefs: &AgentChatPrefs) -> AgentChatPrefs {
    AgentChatPrefs {
        last_registry_id: prefs
            .last_registry_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_is_empty_prefs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("chat_prefs.json");
        assert_eq!(
            load_agent_chat_prefs_from(&path).unwrap(),
            AgentChatPrefs::default()
        );
    }

    #[test]
    fn round_trips_last_registry_id() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("chat_prefs.json");
        save_agent_chat_prefs_to(
            &path,
            &AgentChatPrefs {
                last_registry_id: Some(" claude ".into()),
            },
        )
        .unwrap();
        let loaded = load_agent_chat_prefs_from(&path).unwrap();
        assert_eq!(loaded.last_registry_id.as_deref(), Some("claude"));
        assert!(path.exists());
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"last_registry_id\": \"claude\""));

        save_agent_chat_prefs_to(
            &path,
            &AgentChatPrefs {
                last_registry_id: Some("   ".into()),
            },
        )
        .unwrap();
        let cleared = load_agent_chat_prefs_from(&path).unwrap();
        assert_eq!(cleared.last_registry_id, None);
        let cleared_raw = fs::read_to_string(&path).unwrap();
        assert!(!cleared_raw.contains("last_registry_id"));
    }
}
