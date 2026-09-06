use serde::{Deserialize, Serialize};

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
