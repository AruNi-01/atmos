use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    #[serde(rename = "openai-compatible", alias = "open-ai-compatible")]
    OpenAiCompatible,
    AnthropicCompatible,
    /// A locally managed llama-server sidecar.  The `base_url` and `api_key`
    /// fields in `LlmProviderEntry` are ignored; the runtime fills them in at
    /// call time once the server is running.  `local_model_id` identifies which
    /// model manifest entry to load.
    #[serde(rename = "local-managed")]
    LocalManaged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmFeature {
    SessionTitle,
    GitCommit,
    WorkspaceIssueTodo,
}

impl LlmFeature {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SessionTitle => "session_title",
            Self::GitCommit => "git_commit",
            Self::WorkspaceIssueTodo => "workspace_issue_todo",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionTitleFormatConfig {
    #[serde(default)]
    pub include_agent_name: bool,
    #[serde(default)]
    pub include_project_name: bool,
    #[serde(default)]
    pub include_intent_emoji: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LlmFeatureBindings {
    #[serde(default)]
    pub session_title: Option<String>,
    #[serde(default)]
    pub git_commit: Option<String>,
    #[serde(default)]
    pub git_commit_language: Option<String>,
    #[serde(default)]
    pub workspace_issue_todo: Option<String>,
    #[serde(default)]
    pub workspace_issue_todo_language: Option<String>,
    #[serde(default)]
    pub session_title_format: SessionTitleFormatConfig,
}

impl LlmFeatureBindings {
    pub fn provider_for(&self, feature: LlmFeature) -> Option<&str> {
        match feature {
            LlmFeature::SessionTitle => self.session_title.as_deref(),
            LlmFeature::GitCommit => self.git_commit.as_deref(),
            LlmFeature::WorkspaceIssueTodo => self.workspace_issue_todo.as_deref(),
        }
    }

    pub fn language_for(&self, feature: LlmFeature) -> Option<&str> {
        match feature {
            LlmFeature::SessionTitle => None,
            LlmFeature::GitCommit => self.git_commit_language.as_deref(),
            LlmFeature::WorkspaceIssueTodo => self.workspace_issue_todo_language.as_deref(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProviderEntry {
    pub enabled: bool,
    #[serde(default, rename = "displayName")]
    pub display_name: Option<String>,
    pub kind: ProviderKind,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub max_output_tokens: Option<u32>,
    /// Only used when `kind == LocalManaged`.  Identifies the model manifest
    /// entry (e.g. "qwen2.5-0.5b-instruct").
    #[serde(default)]
    pub local_model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProvidersFile {
    pub version: u32,
    #[serde(default)]
    pub default_provider: Option<String>,
    #[serde(default)]
    pub features: LlmFeatureBindings,
    #[serde(default)]
    pub providers: HashMap<String, LlmProviderEntry>,
}

impl Default for LlmProvidersFile {
    fn default() -> Self {
        Self {
            version: 1,
            default_provider: None,
            features: LlmFeatureBindings::default(),
            providers: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedLlmProvider {
    pub id: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub timeout: Duration,
    pub max_output_tokens: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum ResponseFormat {
    Text,
    JsonObject,
}

#[derive(Debug, Clone)]
pub struct GenerateTextRequest {
    pub system: Option<String>,
    pub prompt: String,
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub response_format: ResponseFormat,
}

#[derive(Debug, Clone)]
pub struct GenerateTextResponse {
    pub text: String,
    pub finish_reason: Option<String>,
}
