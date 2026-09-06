use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, ServiceError};

/// Per-agent composer snapshot from the last New Chat landing chrome
/// (picker change or first send). Eager tab `agent_chat_create` must not
/// write this file — that path still has catalog defaults (Cursor Auto).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewChatConfigsFile {
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub agents: HashMap<String, HashMap<String, String>>,
}

pub fn new_chat_configs_path() -> PathBuf {
    if let Ok(raw) = std::env::var("ATMOS_AGENT_CONFIG_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("new_chat_configs.json");
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".atmos")
        .join("config")
        .join("agent")
        .join("new_chat_configs.json")
}

pub fn load_new_chat_configs() -> Result<NewChatConfigsFile> {
    load_new_chat_configs_from(&new_chat_configs_path())
}

pub fn load_new_chat_configs_from(path: &Path) -> Result<NewChatConfigsFile> {
    if !path.exists() {
        return Ok(NewChatConfigsFile::default());
    }
    let content = fs::read_to_string(path).map_err(|error| {
        ServiceError::Validation(format!("Failed to read new chat configs: {error}"))
    })?;
    let parsed: NewChatConfigsFile = serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse new chat configs: {error}"))
    })?;
    Ok(normalize_new_chat_configs(&parsed))
}

pub fn save_new_chat_configs(file: &NewChatConfigsFile) -> Result<()> {
    save_new_chat_configs_to(&new_chat_configs_path(), file)
}

pub fn save_new_chat_configs_to(path: &Path, file: &NewChatConfigsFile) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ServiceError::Validation(format!("Failed to create agent config dir: {error}"))
        })?;
    }
    let next = normalize_new_chat_configs(file);
    let pretty = serde_json::to_string_pretty(&next).map_err(|error| {
        ServiceError::Validation(format!("Failed to serialize new chat configs: {error}"))
    })?;
    fs::write(path, pretty).map_err(|error| {
        ServiceError::Validation(format!("Failed to write new chat configs: {error}"))
    })?;
    Ok(())
}

/// Replace one agent's last New Chat snapshot. Does not touch other agents.
pub fn upsert_agent_new_chat_config(
    agent_id: &str,
    config: HashMap<String, String>,
) -> Result<NewChatConfigsFile> {
    upsert_agent_new_chat_config_at(&new_chat_configs_path(), agent_id, config)
}

pub fn upsert_agent_new_chat_config_at(
    path: &Path,
    agent_id: &str,
    config: HashMap<String, String>,
) -> Result<NewChatConfigsFile> {
    let agent_id = agent_id.trim();
    if agent_id.is_empty() {
        return Err(ServiceError::Validation(
            "agent_id is required for new chat config".into(),
        ));
    }
    let mut file = load_new_chat_configs_from(path)?;
    let normalized = normalize_config_map(config);
    if normalized.is_empty() {
        file.agents.remove(agent_id);
    } else {
        file.agents.insert(agent_id.to_string(), normalized);
    }
    save_new_chat_configs_to(path, &file)?;
    Ok(file)
}

pub fn snapshot_from_create_fields(
    model: Option<&str>,
    thinking: Option<&str>,
    mode: Option<&str>,
    permission_mode: Option<&str>,
    fast: Option<&str>,
) -> HashMap<String, String> {
    let mut map = HashMap::new();
    insert_opt(&mut map, "model", model);
    insert_opt(&mut map, "thinking", thinking);
    insert_opt(&mut map, "mode", mode);
    insert_opt(&mut map, "permission_mode", permission_mode);
    insert_opt(&mut map, "fast", fast);
    map
}

fn insert_opt(map: &mut HashMap<String, String>, key: &str, value: Option<&str>) {
    if let Some(raw) = value.map(str::trim).filter(|value| !value.is_empty()) {
        map.insert(key.to_string(), raw.to_string());
    }
}

fn normalize_new_chat_configs(file: &NewChatConfigsFile) -> NewChatConfigsFile {
    let mut agents = HashMap::new();
    for (agent_id, config) in &file.agents {
        let id = agent_id.trim();
        if id.is_empty() {
            continue;
        }
        let normalized = normalize_config_map(config.clone());
        if !normalized.is_empty() {
            agents.insert(id.to_string(), normalized);
        }
    }
    NewChatConfigsFile { agents }
}

fn normalize_config_map(config: HashMap<String, String>) -> HashMap<String, String> {
    let mut next = HashMap::new();
    for (key, value) in config {
        let id = key.trim();
        let val = value.trim();
        if id.is_empty() || val.is_empty() {
            continue;
        }
        next.insert(id.to_string(), val.to_string());
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new_chat_configs.json");
        assert_eq!(
            load_new_chat_configs_from(&path).unwrap(),
            NewChatConfigsFile::default()
        );
    }

    #[test]
    fn save_on_new_chat_and_restore_next() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new_chat_configs.json");
        let first = snapshot_from_create_fields(
            Some("gpt-5"),
            Some("low"),
            Some("agent"),
            Some("yolo"),
            Some("true"),
        );
        upsert_agent_new_chat_config_at(&path, "cursor", first.clone()).unwrap();

        let loaded = load_new_chat_configs_from(&path).unwrap();
        assert_eq!(loaded.agents.get("cursor"), Some(&first));

        let second = snapshot_from_create_fields(
            Some("opus"),
            Some("high"),
            Some("plan"),
            Some("ask_always"),
            None,
        );
        upsert_agent_new_chat_config_at(&path, "claude", second.clone()).unwrap();
        let both = load_new_chat_configs_from(&path).unwrap();
        assert_eq!(both.agents.get("cursor"), Some(&first));
        assert_eq!(both.agents.get("claude"), Some(&second));
    }

    #[test]
    fn mid_session_upsert_is_not_implied_by_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new_chat_configs.json");
        upsert_agent_new_chat_config_at(
            &path,
            "cursor",
            snapshot_from_create_fields(Some("a"), None, None, None, None),
        )
        .unwrap();
        // Loading alone must not rewrite the snapshot (mid-session configure path).
        let before = fs::read_to_string(&path).unwrap();
        let _ = load_new_chat_configs_from(&path).unwrap();
        let after = fs::read_to_string(&path).unwrap();
        assert_eq!(before, after);
        assert_eq!(
            load_new_chat_configs_from(&path)
                .unwrap()
                .agents
                .get("cursor")
                .and_then(|c| c.get("model"))
                .map(String::as_str),
            Some("a")
        );
    }

    #[test]
    fn replace_same_agent_keeps_others() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new_chat_configs.json");
        upsert_agent_new_chat_config_at(
            &path,
            "cursor",
            snapshot_from_create_fields(Some("old"), Some("low"), None, None, None),
        )
        .unwrap();
        upsert_agent_new_chat_config_at(
            &path,
            "claude",
            snapshot_from_create_fields(Some("opus"), None, None, None, None),
        )
        .unwrap();
        upsert_agent_new_chat_config_at(
            &path,
            "cursor",
            snapshot_from_create_fields(Some("new"), Some("high"), Some("plan"), None, None),
        )
        .unwrap();
        let loaded = load_new_chat_configs_from(&path).unwrap();
        assert_eq!(
            loaded
                .agents
                .get("cursor")
                .and_then(|c| c.get("model"))
                .map(String::as_str),
            Some("new")
        );
        assert_eq!(
            loaded
                .agents
                .get("cursor")
                .and_then(|c| c.get("thinking"))
                .map(String::as_str),
            Some("high")
        );
        assert_eq!(
            loaded
                .agents
                .get("claude")
                .and_then(|c| c.get("model"))
                .map(String::as_str),
            Some("opus")
        );
    }
}
