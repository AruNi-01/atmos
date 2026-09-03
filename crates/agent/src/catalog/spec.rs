use serde::Deserialize;

use crate::catalog::CatalogStrategyKind;
use crate::contract::AgentThinkingSupport;
use crate::policy::canonicalize_chat_provider_id;

use super::parse::thinking_from_reasoning_mode;

/// Chat native hosts after native-only canonicalize. ACP registry ids stay ACP.
pub fn is_native_chat_catalog_id(agent_id: &str) -> bool {
    matches!(
        canonicalize_chat_provider_id(agent_id),
        "claude" | "codex" | "opencode" | "pi" | "grok"
    )
}

/// Config + Cli (if present) + Native. Never generic ACP `session/new`.
pub fn apply_native_chat_catalog_spec(spec: &mut AgentCatalogSpec) {
    if !is_native_chat_catalog_id(&spec.agent_id) {
        return;
    }
    spec.acp = false;
    let mut strategies = vec![CatalogStrategyKind::Config];
    if !spec.cli_command.is_empty() {
        strategies.push(CatalogStrategyKind::Cli);
    }
    strategies.push(CatalogStrategyKind::Native);
    spec.strategies = strategies;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CatalogParserKind {
    #[default]
    LineList,
    GrokLineList,
    KiroJson,
    Json,
    DroidHelp,
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
    pub static_models: Vec<crate::contract::AgentModel>,
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
            if is_native_chat_catalog_id(&self.agent_id) {
                out.push(CatalogStrategyKind::Native);
            } else if self.acp {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app069_s5_native_ids_skip_acp_in_default_strategies() {
        let spec = AgentCatalogSpec {
            agent_id: "claude".into(),
            acp: true,
            ..Default::default()
        };
        assert_eq!(
            spec.default_strategies(),
            vec![CatalogStrategyKind::Config, CatalogStrategyKind::Native]
        );
        let gemini = AgentCatalogSpec {
            agent_id: "gemini".into(),
            acp: true,
            ..Default::default()
        };
        assert_eq!(
            gemini.default_strategies(),
            vec![CatalogStrategyKind::Config, CatalogStrategyKind::Acp]
        );
        assert!(!is_native_chat_catalog_id("grok-build"));
        assert!(!is_native_chat_catalog_id("claude-acp"));
        assert!(is_native_chat_catalog_id("claude-code"));
        assert!(is_native_chat_catalog_id("grok"));
    }

    #[test]
    fn app069_s5_apply_native_chat_catalog_spec_drops_acp() {
        let mut spec = AgentCatalogSpec {
            agent_id: "opencode".into(),
            acp: true,
            cli_command: vec!["opencode".into(), "models".into()],
            strategies: vec![
                CatalogStrategyKind::Config,
                CatalogStrategyKind::Cli,
                CatalogStrategyKind::Acp,
            ],
            ..Default::default()
        };
        apply_native_chat_catalog_spec(&mut spec);
        assert!(!spec.acp);
        assert_eq!(
            spec.strategies,
            vec![
                CatalogStrategyKind::Config,
                CatalogStrategyKind::Cli,
                CatalogStrategyKind::Native,
            ]
        );
        let mut custom = AgentCatalogSpec {
            agent_id: "grok-build".into(),
            acp: true,
            strategies: vec![CatalogStrategyKind::Acp],
            ..Default::default()
        };
        apply_native_chat_catalog_spec(&mut custom);
        assert!(custom.acp);
        assert_eq!(custom.strategies, vec![CatalogStrategyKind::Acp]);
    }
}
