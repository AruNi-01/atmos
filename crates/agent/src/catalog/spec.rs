use serde::Deserialize;

use crate::domain::{AgentThinkingSupport, CatalogStrategyKind};

use super::parse::thinking_from_reasoning_mode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CatalogParserKind {
    #[default]
    LineList,
    GrokLineList,
    KiroJson,
    Json,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AgentCatalogSpec {
    pub agent_id: String,
    #[serde(default)]
    pub strategies: Vec<CatalogStrategyKind>,
    #[serde(default)]
    pub cli_command: Vec<String>,
    #[serde(default)]
    pub parser: CatalogParserKind,
    #[serde(default)]
    pub thinking: AgentThinkingSupport,
    #[serde(default)]
    pub static_models: Vec<crate::domain::AgentModel>,
    #[serde(default)]
    pub acp: bool,
}

impl AgentCatalogSpec {
    pub fn default_strategies(&self) -> Vec<CatalogStrategyKind> {
        if self.strategies.is_empty() {
            let mut out = vec![CatalogStrategyKind::Config];
            if !self.cli_command.is_empty() {
                out.push(CatalogStrategyKind::Cli);
            }
            if self.acp {
                out.push(CatalogStrategyKind::Acp);
            }
            out
        } else {
            self.strategies.clone()
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ReasoningSupportFile {
    #[serde(default)]
    mode: String,
    #[serde(default)]
    arg: Option<String>,
    #[serde(default)]
    options: Vec<String>,
    #[serde(default)]
    placeholder: Option<String>,
}

pub fn thinking_from_builtin(value: &serde_json::Value) -> AgentThinkingSupport {
    let Some(obj) = value.get("reasoningSupport") else {
        return AgentThinkingSupport::None;
    };
    let parsed: ReasoningSupportFile = match serde_json::from_value(obj.clone()) {
        Ok(parsed) => parsed,
        Err(_) => return AgentThinkingSupport::None,
    };
    thinking_from_reasoning_mode(&parsed.mode, parsed.arg, parsed.options, parsed.placeholder)
}
