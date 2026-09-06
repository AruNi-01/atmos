use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentId {
    ClaudeCode,
    Codex,
    GeminiCli,
    AntigravityCli,
}

impl AgentId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude_code",
            Self::Codex => "codex",
            Self::GeminiCli => "gemini_cli",
            Self::AntigravityCli => "antigravity_cli",
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
    /// `native` reuses an official CLI with ACP args. `adapter` is a separate ACP package.
    #[serde(default)]
    pub provision_kind: String,
    /// PATH executable to bind for native agents (e.g. `gemini`, `cursor-agent`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_executable: Option<String>,
    /// Built-in terminal agent id this ACP agent corresponds to, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_agent_id: Option<String>,
    /// When false, Atmos bound an existing CLI and must not uninstall it.
    #[serde(default = "default_can_remove")]
    pub can_remove: bool,
}

fn default_can_remove() -> bool {
    true
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
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    /// UI label; built-ins always set this. User customs omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Shipped with Atmos; not from the public ACP registry.
    #[serde(default)]
    pub builtin: bool,
    /// True when the user has a manifest overlay (env, argv, defaults).
    #[serde(default)]
    pub has_overlay: bool,
    /// Chat picker and catalog only include enabled agents. Built-ins default off.
    #[serde(default)]
    pub enabled: bool,
}

/// Chat native host listed in the Agent Manager Native tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeChatAgent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub executable: String,
    /// Chat picker and catalog only include enabled hosts. Default off.
    #[serde(default)]
    pub enabled: bool,
    /// True when `executable` is on PATH. Does not gate the enable switch.
    #[serde(default)]
    pub cli_present: bool,
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
