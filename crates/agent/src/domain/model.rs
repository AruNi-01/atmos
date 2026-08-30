use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogStatus {
    Ok,
    Unsupported,
    AuthRequired,
    Error,
    Probing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogSource {
    Cache,
    Live,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogStrategyKind {
    Config,
    Cli,
    Acp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentThinkingSupport {
    #[default]
    None,
    Enum {
        #[serde(default)]
        arg: Option<String>,
        options: Vec<String>,
    },
    Manual {
        arg: String,
        #[serde(default)]
        placeholder: Option<String>,
    },
    EncodedInModel,
    FlagOnly {
        arg: String,
    },
}

impl AgentThinkingSupport {
    pub fn is_none(&self) -> bool {
        matches!(self, Self::None)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentModel {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub thinking: Option<AgentThinkingSupport>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentMode {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentModelCatalog {
    pub agent_id: String,
    pub status: CatalogStatus,
    pub models: Vec<AgentModel>,
    #[serde(default)]
    pub modes: Vec<AgentMode>,
    #[serde(default)]
    pub thinking: AgentThinkingSupport,
    #[serde(default)]
    pub strategies_used: Vec<CatalogStrategyKind>,
    pub fetched_at: DateTime<Utc>,
    pub source: CatalogSource,
    #[serde(default)]
    pub message: Option<String>,
}

impl AgentModelCatalog {
    pub fn probing(agent_id: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: CatalogStatus::Probing,
            models: Vec::new(),
            modes: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: CatalogSource::Live,
            message: None,
        }
    }

    pub fn error(agent_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: CatalogStatus::Error,
            models: Vec::new(),
            modes: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: CatalogSource::Live,
            message: Some(message.into()),
        }
    }

    pub fn unsupported(agent_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: CatalogStatus::Unsupported,
            models: Vec::new(),
            modes: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: CatalogSource::Live,
            message: Some(message.into()),
        }
    }
}
