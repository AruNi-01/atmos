use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::contract::{AgentAvailableCommand, AgentMode, AgentModel, AgentThinkingSupport};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptionsStatus {
    Ok,
    Unsupported,
    AuthRequired,
    Error,
    Probing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptionsSource {
    Cache,
    Live,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptionsProbeStrategy {
    Config,
    Cli,
    Acp,
    Native,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AgentOptionsSnapshot {
    pub agent_id: String,
    pub status: OptionsStatus,
    pub models: Vec<AgentModel>,
    #[serde(default)]
    pub modes: Vec<AgentMode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub permission_modes: Vec<AgentMode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub commands: Vec<AgentAvailableCommand>,
    #[serde(default)]
    pub thinking: AgentThinkingSupport,
    #[serde(default)]
    pub strategies_used: Vec<OptionsProbeStrategy>,
    pub fetched_at: DateTime<Utc>,
    pub source: OptionsSource,
    #[serde(default)]
    pub message: Option<String>,
}

impl AgentOptionsSnapshot {
    pub fn probing(agent_id: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: OptionsStatus::Probing,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: OptionsSource::Live,
            message: None,
        }
    }

    pub fn error(agent_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: OptionsStatus::Error,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: OptionsSource::Live,
            message: Some(message.into()),
        }
    }

    pub fn unsupported(agent_id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            status: OptionsStatus::Unsupported,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: OptionsSource::Live,
            message: Some(message.into()),
        }
    }

    /// ACP `authenticate` returning Ok is the browser-OAuth callback. Drop the
    /// auth overlay so the client can show Authenticated and close, then refresh.
    pub fn after_successful_authenticate(mut self) -> Self {
        self.message = None;
        if self.status == OptionsStatus::AuthRequired {
            let has_pickers =
                !self.models.is_empty() || !self.modes.is_empty() || !self.commands.is_empty();
            self.status = if has_pickers {
                OptionsStatus::Ok
            } else {
                OptionsStatus::Probing
            };
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentModel, AgentThinkingSupport};
    use chrono::Utc;

    #[test]
    fn options_probe_strategy_includes_native() {
        let json = serde_json::to_value(OptionsProbeStrategy::Native).expect("serialize");
        assert_eq!(json, "native");
        let back: OptionsProbeStrategy = serde_json::from_value(json).expect("deserialize");
        assert_eq!(back, OptionsProbeStrategy::Native);
        let kinds = [
            OptionsProbeStrategy::Config,
            OptionsProbeStrategy::Cli,
            OptionsProbeStrategy::Acp,
            OptionsProbeStrategy::Native,
        ];
        let labels: Vec<String> = kinds
            .iter()
            .map(|kind| serde_json::to_value(kind).unwrap().as_str().unwrap().into())
            .collect();
        assert_eq!(labels, vec!["config", "cli", "acp", "native"]);
    }

    #[test]
    fn permission_modes_default_empty_and_omitted_when_empty() {
        let catalog = AgentOptionsSnapshot::probing("claude");
        let json = serde_json::to_value(&catalog).expect("serialize");
        assert!(json.get("permission_modes").is_none());
        let back: AgentOptionsSnapshot = serde_json::from_value(serde_json::json!({
            "agent_id": "claude",
            "status": "ok",
            "models": [],
            "modes": [],
            "thinking": { "type": "none" },
            "strategies_used": [],
            "fetched_at": "2026-01-01T00:00:00Z",
            "source": "live"
        }))
        .expect("deserialize");
        assert!(back.permission_modes.is_empty());
    }

    #[test]
    fn after_successful_authenticate_clears_auth_overlay() {
        let catalog = AgentOptionsSnapshot {
            agent_id: "cursor".into(),
            status: OptionsStatus::AuthRequired,
            models: vec![AgentModel {
                id: "composer-2.5".into(),
                label: "Composer 2.5".into(),
                group: None,
                is_default: true,
                thinking: None,
                context: Vec::new(),
                fast: false,
            }],
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: OptionsSource::Cache,
            message: Some("ACP_AUTH_REQUIRED::{}".into()),
        };
        let next = catalog.after_successful_authenticate();
        assert_eq!(next.status, OptionsStatus::Ok);
        assert!(next.message.is_none());
        assert_eq!(next.models.len(), 1);
    }

    #[test]
    fn after_successful_authenticate_without_pickers_is_probing() {
        let next = AgentOptionsSnapshot::error("cursor", "Authentication required by agent")
            .after_successful_authenticate();
        assert_eq!(next.status, OptionsStatus::Error);
        assert!(next.message.is_none());

        let next = AgentOptionsSnapshot {
            agent_id: "cursor".into(),
            status: OptionsStatus::AuthRequired,
            models: Vec::new(),
            modes: Vec::new(),
            permission_modes: Vec::new(),
            commands: Vec::new(),
            thinking: AgentThinkingSupport::None,
            strategies_used: Vec::new(),
            fetched_at: Utc::now(),
            source: OptionsSource::Live,
            message: Some("sign in".into()),
        }
        .after_successful_authenticate();
        assert_eq!(next.status, OptionsStatus::Probing);
        assert!(next.message.is_none());
    }
}
