use agent::AgentId;
use llm::{FileLlmConfigStore, LlmProviderEntry, ProviderKind};
use serde_json::Value;

use core_service::{Result, ServiceError};

pub(super) fn upsert_local_managed_provider(
    model_id: &str,
    display_name: &str,
    endpoint: &str,
) -> Result<()> {
    let store = FileLlmConfigStore::new()
        .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
    let mut config = store
        .load()
        .map_err(|e| ServiceError::Validation(format!("Failed to read llm providers: {}", e)))?;
    let provider_id = format!("local-managed-{model_id}");
    config.providers.insert(
        provider_id,
        LlmProviderEntry {
            enabled: true,
            display_name: Some(display_name.to_string()),
            kind: ProviderKind::LocalManaged,
            base_url: endpoint.to_string(),
            api_key: String::new(),
            model: model_id.to_string(),
            timeout_ms: None,
            max_output_tokens: None,
            local_model_id: Some(model_id.to_string()),
            context_window: None,
        },
    );
    store
        .save(&config)
        .map_err(|e| ServiceError::Validation(format!("Failed to save llm providers: {}", e)))?;
    Ok(())
}

pub(super) fn delete_local_managed_provider(model_id: &str) -> Result<()> {
    let store = FileLlmConfigStore::new()
        .map_err(|e| ServiceError::Validation(format!("Failed to locate llm config: {}", e)))?;
    let mut config = store
        .load()
        .map_err(|e| ServiceError::Validation(format!("Failed to read llm providers: {}", e)))?;
    let provider_id = format!("local-managed-{model_id}");
    config.providers.remove(&provider_id);
    store
        .save(&config)
        .map_err(|e| ServiceError::Validation(format!("Failed to save llm providers: {}", e)))?;
    Ok(())
}

pub(super) fn function_settings_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("function_settings.json")
}

/// Workspace deletion settings read from function_settings.json.
pub(super) struct WorkspaceDeleteSettings {
    pub(super) close_pr_on_delete: bool,
    pub(super) close_issue_on_delete: bool,
    pub(super) delete_remote_branch: bool,
}

impl Default for WorkspaceDeleteSettings {
    fn default() -> Self {
        Self {
            close_pr_on_delete: false,
            close_issue_on_delete: false,
            delete_remote_branch: false,
        }
    }
}

impl WorkspaceDeleteSettings {
    pub(super) fn load() -> Self {
        let path = function_settings_path();
        let Ok(content) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            return Self::default();
        };
        let ws = value.get("workspace_settings");
        Self {
            close_pr_on_delete: ws
                .and_then(|v| v.get("close_pr_on_delete"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            close_issue_on_delete: ws
                .and_then(|v| v.get("close_issue_on_delete"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            delete_remote_branch: ws
                .and_then(|v| v.get("delete_remote_branch"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        }
    }
}

/// Workspace archive settings read from function_settings.json.
pub(super) struct WorkspaceArchiveSettings {
    pub(super) kill_tmux_on_archive: bool,
    pub(super) close_acp_on_archive: bool,
}

impl Default for WorkspaceArchiveSettings {
    fn default() -> Self {
        Self {
            kill_tmux_on_archive: true,
            close_acp_on_archive: true,
        }
    }
}

impl WorkspaceArchiveSettings {
    pub(super) fn load() -> Self {
        let path = function_settings_path();
        let Ok(content) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            return Self::default();
        };
        let ws = value.get("workspace_settings");
        Self {
            kill_tmux_on_archive: ws
                .and_then(|v| v.get("kill_tmux_on_archive"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
            close_acp_on_archive: ws
                .and_then(|v| v.get("close_acp_on_archive"))
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
        }
    }
}

pub(super) fn terminal_code_agent_path() -> std::path::PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("agent")
        .join("terminal_code_agent.json")
}

/// Parse request data from JSON Value.
pub(super) fn parse_request<T: serde::de::DeserializeOwned>(data: Value) -> Result<T> {
    serde_json::from_value(data)
        .map_err(|e| ServiceError::Validation(format!("Invalid request: {}", e)))
}

pub(super) fn parse_agent_id(raw: &str) -> Result<AgentId> {
    match raw {
        "claude_code" => Ok(AgentId::ClaudeCode),
        "codex" => Ok(AgentId::Codex),
        "gemini_cli" => Ok(AgentId::GeminiCli),
        other => Err(ServiceError::Validation(format!(
            "Unsupported agent id: {}",
            other
        ))),
    }
}
