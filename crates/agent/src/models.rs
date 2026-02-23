use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentId {
    ClaudeCode,
    Codex,
    GeminiCli,
}

impl AgentId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
            Self::GeminiCli => "gemini_cli",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownAgent {
    pub id: AgentId,
    pub registry_id: String,
    pub name: String,
    pub description: String,
    pub npm_package: String,
    pub executable: String,
    pub auth_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub id: AgentId,
    pub registry_id: String,
    pub name: String,
    pub description: String,
    pub npm_package: String,
    pub executable: String,
    pub installed: bool,
    pub executable_path: Option<String>,
    pub auth_detected: bool,
    pub auth_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryAgent {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub repository: Option<String>,
    pub icon: Option<String>,
    pub cli_command: String,
    pub install_method: String,
    pub package: Option<String>,
    pub installed: bool,
    /// The version currently installed (if installed). May differ from `version` which is the latest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

/// Launch spec for an installed ACP registry agent. Use when spawning the agent process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLaunchSpec {
    /// Program to execute (e.g. "npx" or absolute path to binary).
    pub program: String,
    /// Arguments to pass (e.g. ["@zed-industries/claude-code-acp"] or ["acp"]).
    pub args: Vec<String>,
    /// Optional environment variables.
    pub env: Option<std::collections::HashMap<String, String>>,
}

/// A custom ACP agent added manually by the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAgent {
    /// Display name (e.g. "Kiro Agent", "pi").
    pub name: String,
    /// Fixed to "custom".
    #[serde(rename = "type")]
    pub agent_type: String,
    /// Program to execute (e.g. "npx", "~/.local/bin/kiro-cli").
    pub command: String,
    /// Arguments (e.g. ["acp"], ["-y", "pi-acp"]).
    #[serde(default)]
    pub args: Vec<String>,
    /// Environment variables.
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_config: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryInstallResult {
    pub registry_id: String,
    pub installed: bool,
    pub install_method: String,
    pub message: String,
    /// When true, agent exists locally; install was skipped. Call again with force_overwrite.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_confirmation: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overwrite_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstallResult {
    pub id: AgentId,
    pub installed: bool,
    pub install_method: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfigState {
    pub id: AgentId,
    pub has_stored_api_key: bool,
    pub auth_detected: bool,
    pub auth_source: Option<String>,
}
