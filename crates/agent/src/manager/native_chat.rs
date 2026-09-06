//! Chat native hosts listed in the Agent Manager Native tab.
//!
//! These always appear in `list_native_chat_agents`. Chat picker and catalog
//! probe them only after the Native tab switch is on (`enabled`). Overlay lives
//! in the install manifest under the canonical Chat id. This is not ACP
//! install/remove.

use std::collections::HashMap;

use super::manifest::NativeAgentEntry;
use super::provision::which_executable;
use super::{AgentError, Result};
use crate::models::{AgentLaunchSpec, NativeChatAgent};
use crate::policy::canonicalize_chat_provider_id;

struct NativeChatSpec {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    executable: &'static str,
}

const HOSTS: &[NativeChatSpec] = &[
    NativeChatSpec {
        id: "claude",
        name: "Claude",
        description: "Official Claude Code CLI for Chat.",
        executable: "claude",
    },
    NativeChatSpec {
        id: "codex",
        name: "Codex",
        description: "Official Codex CLI for Chat.",
        executable: "codex",
    },
    NativeChatSpec {
        id: "opencode",
        name: "OpenCode",
        description: "Official OpenCode CLI for Chat.",
        executable: "opencode",
    },
    NativeChatSpec {
        id: "pi",
        name: "Pi",
        description: "Official Pi CLI for Chat.",
        executable: "pi",
    },
    NativeChatSpec {
        id: "grok",
        name: "Grok",
        description: "Official Grok CLI for Chat.",
        executable: "grok",
    },
];

pub fn is_native_chat_agent_id(id: &str) -> bool {
    HOSTS.iter().any(|spec| spec.id == id)
}

/// Native hosts are off until the overlay records `enabled: true`.
pub fn is_native_chat_agent_enabled(overlay: Option<&NativeAgentEntry>) -> bool {
    overlay.and_then(|entry| entry.enabled).unwrap_or(false)
}

pub fn list_native_chat_agents(
    overlay: &HashMap<String, NativeAgentEntry>,
) -> Vec<NativeChatAgent> {
    HOSTS
        .iter()
        .map(|spec| spec.to_agent(overlay.get(spec.id)))
        .collect()
}

pub fn native_chat_launch_spec(id: &str) -> Option<AgentLaunchSpec> {
    let folded = canonicalize_chat_provider_id(id);
    let spec = HOSTS.iter().find(|host| host.id == folded)?;
    let program = which_executable(spec.executable)?;
    Some(AgentLaunchSpec {
        program,
        args: Vec::new(),
        env: None,
    })
}

impl NativeChatSpec {
    fn to_agent(&self, overlay: Option<&NativeAgentEntry>) -> NativeChatAgent {
        NativeChatAgent {
            id: self.id.to_string(),
            name: self.name.to_string(),
            description: self.description.to_string(),
            executable: self.executable.to_string(),
            enabled: is_native_chat_agent_enabled(overlay),
            cli_present: which_executable(self.executable).is_some(),
        }
    }
}

pub fn require_native_chat_agent_id(id: &str) -> Result<()> {
    if is_native_chat_agent_id(id) {
        Ok(())
    } else {
        Err(AgentError::NotFound(format!("native chat agent: {id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_five_hosts_disabled_by_default() {
        let agents = list_native_chat_agents(&HashMap::new());
        assert_eq!(
            agents
                .iter()
                .map(|agent| agent.id.as_str())
                .collect::<Vec<_>>(),
            ["claude", "codex", "opencode", "pi", "grok"]
        );
        assert!(agents.iter().all(|agent| !agent.enabled));
        assert!(agents.iter().all(|agent| agent.executable == agent.id));
    }

    #[test]
    fn overlay_enables_only_that_host() {
        let overlay = HashMap::from([(
            "codex".to_string(),
            NativeAgentEntry {
                enabled: Some(true),
            },
        )]);
        let agents = list_native_chat_agents(&overlay);
        let enabled: Vec<&str> = agents
            .iter()
            .filter(|agent| agent.enabled)
            .map(|agent| agent.id.as_str())
            .collect();
        assert_eq!(enabled, ["codex"]);
    }

    #[test]
    fn launch_spec_does_not_fold_acp_registry_ids() {
        assert!(native_chat_launch_spec("codex-acp").is_none());
        assert!(native_chat_launch_spec("claude-acp").is_none());
        assert!(native_chat_launch_spec("grok-build").is_none());
        assert!(native_chat_launch_spec("pi-acp").is_none());
    }

    #[test]
    fn ids_are_canonical_hosts_not_acp_aliases() {
        assert!(is_native_chat_agent_id("codex"));
        assert!(is_native_chat_agent_id("claude"));
        assert!(!is_native_chat_agent_id("codex-acp"));
        assert!(!is_native_chat_agent_id("claude-acp"));
        assert!(!is_native_chat_agent_id("grok-build"));
        assert!(!is_native_chat_agent_id("deepseek-harness"));
        assert!(require_native_chat_agent_id("pi").is_ok());
        assert!(require_native_chat_agent_id("codex-acp").is_err());
    }
}
