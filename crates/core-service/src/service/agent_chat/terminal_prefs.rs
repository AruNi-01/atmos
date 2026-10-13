use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, ServiceError};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalAgentFavoriteModel {
    pub agent_id: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub label: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalAgentLastPick {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TerminalAgentPrefs {
    #[serde(default)]
    pub favorite_models: Vec<TerminalAgentFavoriteModel>,
    #[serde(default)]
    pub agents: HashMap<String, TerminalAgentLastPick>,
}

/// Partial write. Omitted keys leave the stored value alone.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct TerminalAgentPrefsPatch {
    #[serde(default)]
    pub favorite_models: Option<Vec<TerminalAgentFavoriteModel>>,
    #[serde(default)]
    pub agents: Option<HashMap<String, TerminalAgentLastPick>>,
}

pub fn terminal_agent_prefs_path() -> PathBuf {
    let config_dir = std::env::var("ATMOS_AGENT_CONFIG_DIR").ok();
    terminal_agent_prefs_path_from_env(
        config_dir.as_deref(),
        &super::prefs::agent_chat_prefs_path(),
    )
}

/// `config_dir` is the `ATMOS_AGENT_CONFIG_DIR` value. When it is missing or blank,
/// the file sits beside `chat_prefs_path` under the name `terminal_prefs.json`.
pub fn terminal_agent_prefs_path_from_env(
    config_dir: Option<&str>,
    chat_prefs_path: &Path,
) -> PathBuf {
    if let Some(dir) = config_dir.map(str::trim).filter(|value| !value.is_empty()) {
        return PathBuf::from(dir).join("terminal_prefs.json");
    }
    chat_prefs_path.with_file_name("terminal_prefs.json")
}

pub fn load_terminal_agent_prefs() -> Result<TerminalAgentPrefs> {
    load_terminal_agent_prefs_from(&terminal_agent_prefs_path())
}

pub fn load_terminal_agent_prefs_from(path: &Path) -> Result<TerminalAgentPrefs> {
    if !path.exists() {
        return Ok(TerminalAgentPrefs::default());
    }
    let content = fs::read_to_string(path).map_err(|error| {
        ServiceError::Validation(format!("Failed to read terminal agent prefs: {error}"))
    })?;
    let parsed: TerminalAgentPrefs = serde_json::from_str(&content).map_err(|error| {
        ServiceError::Validation(format!("Failed to parse terminal agent prefs: {error}"))
    })?;
    Ok(normalize_prefs(parsed))
}

pub fn apply_terminal_agent_prefs_patch(
    patch: &TerminalAgentPrefsPatch,
) -> Result<TerminalAgentPrefs> {
    apply_terminal_agent_prefs_patch_at(&terminal_agent_prefs_path(), patch)
}

pub fn apply_terminal_agent_prefs_patch_at(
    path: &Path,
    patch: &TerminalAgentPrefsPatch,
) -> Result<TerminalAgentPrefs> {
    let mut prefs = load_terminal_agent_prefs_from(path)?;
    if let Some(favorites) = &patch.favorite_models {
        prefs.favorite_models = normalize_favorites(favorites.clone());
    }
    if let Some(agents) = &patch.agents {
        for (agent_id, pick) in agents {
            let agent_id = agent_id.trim();
            if agent_id.is_empty() {
                continue;
            }
            let normalized = normalize_last_pick(pick);
            if normalized.model.is_none() && normalized.effort.is_none() {
                prefs.agents.remove(agent_id);
            } else {
                prefs.agents.insert(agent_id.to_string(), normalized);
            }
        }
    }
    write_prefs(path, &prefs)?;
    Ok(prefs)
}

fn write_prefs(path: &Path, prefs: &TerminalAgentPrefs) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ServiceError::Validation(format!("Failed to create agent config dir: {error}"))
        })?;
    }
    let pretty = serde_json::to_string_pretty(prefs).map_err(|error| {
        ServiceError::Validation(format!("Failed to serialize terminal agent prefs: {error}"))
    })?;
    fs::write(path, pretty).map_err(|error| {
        ServiceError::Validation(format!("Failed to write terminal agent prefs: {error}"))
    })?;
    Ok(())
}

fn normalize_prefs(prefs: TerminalAgentPrefs) -> TerminalAgentPrefs {
    let mut agents = HashMap::new();
    for (agent_id, pick) in prefs.agents {
        let agent_id = agent_id.trim();
        if agent_id.is_empty() {
            continue;
        }
        let normalized = normalize_last_pick(&pick);
        if normalized.model.is_none() && normalized.effort.is_none() {
            continue;
        }
        agents.insert(agent_id.to_string(), normalized);
    }
    TerminalAgentPrefs {
        favorite_models: normalize_favorites(prefs.favorite_models),
        agents,
    }
}

fn normalize_favorites(items: Vec<TerminalAgentFavoriteModel>) -> Vec<TerminalAgentFavoriteModel> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for item in items {
        let agent_id = item.agent_id.trim().to_string();
        let model = item.model.trim().to_string();
        if agent_id.is_empty() || model.is_empty() {
            continue;
        }
        let key = format!("{agent_id}\u{1f}{model}");
        if !seen.insert(key) {
            continue;
        }
        let trimmed = item.label.trim();
        let label = if trimmed.is_empty() {
            model.clone()
        } else {
            trimmed.to_string()
        };
        out.push(TerminalAgentFavoriteModel {
            agent_id,
            model,
            label,
        });
    }
    out
}

fn normalize_last_pick(pick: &TerminalAgentLastPick) -> TerminalAgentLastPick {
    TerminalAgentLastPick {
        model: trim_option(pick.model.as_deref()),
        effort: trim_option(pick.effort.as_deref()),
    }
}

fn trim_option(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agent_chat::prefs::load_agent_chat_prefs_from;

    #[test]
    fn app080_terminal_prefs_path_follows_config_dir() {
        let chat = Path::new("/virtual/agent/chat_prefs.json");
        assert_eq!(
            terminal_agent_prefs_path_from_env(None, chat),
            PathBuf::from("/virtual/agent/terminal_prefs.json")
        );
        assert_eq!(
            terminal_agent_prefs_path_from_env(Some("  "), chat),
            PathBuf::from("/virtual/agent/terminal_prefs.json")
        );
        assert_eq!(
            terminal_agent_prefs_path_from_env(Some("/override"), chat),
            PathBuf::from("/override/terminal_prefs.json")
        );
    }

    #[test]
    fn app080_terminal_prefs_leave_chat_prefs_bytes_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let chat_path = dir.path().join("chat_prefs.json");
        let original = b"{\n  \"favorite_models\": [\n    {\n      \"agent_id\": \"claude\",\n      \"model\": \"opus\",\n      \"label\": \"Opus\"\n    }\n  ]\n}\n";
        fs::write(&chat_path, original).unwrap();
        let terminal_path =
            terminal_agent_prefs_path_from_env(Some(dir.path().to_str().unwrap()), &chat_path);
        assert_eq!(terminal_path, dir.path().join("terminal_prefs.json"));

        let saved = apply_terminal_agent_prefs_patch_at(
            &terminal_path,
            &TerminalAgentPrefsPatch {
                favorite_models: Some(vec![
                    TerminalAgentFavoriteModel {
                        agent_id: String::new(),
                        model: "skip".to_string(),
                        label: String::new(),
                    },
                    TerminalAgentFavoriteModel {
                        agent_id: " codex ".to_string(),
                        model: " gpt-5.4 ".to_string(),
                        label: "  ".to_string(),
                    },
                    TerminalAgentFavoriteModel {
                        agent_id: "codex".to_string(),
                        model: "gpt-5.4".to_string(),
                        label: "duplicate".to_string(),
                    },
                ]),
                agents: Some(HashMap::from([(
                    "claude".to_string(),
                    TerminalAgentLastPick {
                        model: None,
                        effort: Some(" high ".to_string()),
                    },
                )])),
            },
        )
        .unwrap();

        assert_eq!(fs::read(&chat_path).unwrap(), original);
        let chat =
            load_agent_chat_prefs_from(&chat_path, &dir.path().join("missing.json")).unwrap();
        assert_eq!(chat.favorite_models.len(), 1);
        assert_eq!(chat.favorite_models[0].model, "opus");
        assert_eq!(saved.favorite_models.len(), 1);
        assert_eq!(saved.favorite_models[0].agent_id, "codex");
        assert_eq!(saved.favorite_models[0].model, "gpt-5.4");
        assert_eq!(saved.favorite_models[0].label, "gpt-5.4");
        assert_eq!(
            saved.agents.get("claude").unwrap().effort.as_deref(),
            Some("high")
        );

        let saved = apply_terminal_agent_prefs_patch_at(
            &terminal_path,
            &TerminalAgentPrefsPatch {
                favorite_models: None,
                agents: Some(HashMap::from([(
                    "codex".to_string(),
                    TerminalAgentLastPick {
                        model: Some("gpt-5.4".to_string()),
                        effort: Some("medium".to_string()),
                    },
                )])),
            },
        )
        .unwrap();
        assert_eq!(fs::read(&chat_path).unwrap(), original);
        assert_eq!(saved.favorite_models[0].model, "gpt-5.4");
        assert_eq!(
            saved.agents.get("claude").unwrap().effort.as_deref(),
            Some("high")
        );
        assert_eq!(
            saved.agents.get("codex").unwrap().model.as_deref(),
            Some("gpt-5.4")
        );
        assert_eq!(
            saved.agents.get("codex").unwrap().effort.as_deref(),
            Some("medium")
        );

        let saved = apply_terminal_agent_prefs_patch_at(
            &terminal_path,
            &TerminalAgentPrefsPatch {
                favorite_models: Some(vec![TerminalAgentFavoriteModel {
                    agent_id: "pi".to_string(),
                    model: "pi-model".to_string(),
                    label: "Pi".to_string(),
                }]),
                agents: None,
            },
        )
        .unwrap();
        assert_eq!(fs::read(&chat_path).unwrap(), original);
        assert_eq!(saved.favorite_models[0].agent_id, "pi");
        assert_eq!(saved.agents.len(), 2);
        assert!(terminal_path.exists());
        assert!(!fs::read_to_string(&terminal_path).unwrap().contains("opus"));
    }
}
