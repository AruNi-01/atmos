use crate::contract::{AgentCapabilities, AgentOptionSupport, Capability};

use super::aliases::canonicalize_chat_provider_id;

/// Native / ACP-default capability honesty (locked). Send / cancel / subscribe are not flags.
pub fn capabilities_for_provider(provider_id: &str) -> AgentCapabilities {
    let provider_id = canonicalize_chat_provider_id(provider_id);
    match provider_id {
        "claude" | "codex" | "opencode" | "grok" => AgentCapabilities {
            steer: Capability::Supported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Supported,
        },
        "pi" => AgentCapabilities {
            steer: Capability::Supported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Unsupported,
        },
        _ => AgentCapabilities {
            steer: Capability::Unsupported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Unsupported,
            rewind: Capability::Unsupported,
        },
    }
}

pub fn option_support_for_provider(provider_id: &str) -> AgentOptionSupport {
    let provider_id = canonicalize_chat_provider_id(provider_id);
    match provider_id {
        "claude" => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Supported,
            permission_modes: Capability::Supported,
        },
        "codex" => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Supported,
            permission_modes: Capability::Supported,
        },
        "pi" => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Unsupported,
            permission_modes: Capability::Unsupported,
        },
        "grok" => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Supported,
            permission_modes: Capability::Supported,
        },
        "opencode" => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Supported,
            permission_modes: Capability::Supported,
        },
        _ => AgentOptionSupport {
            models: Capability::Supported,
            thinking: Capability::Supported,
            modes: Capability::Supported,
            permission_modes: Capability::Supported,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{AgentCapabilities, Capability};

    fn supported() -> AgentCapabilities {
        AgentCapabilities {
            steer: Capability::Supported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Supported,
        }
    }

    fn acp_default() -> AgentCapabilities {
        AgentCapabilities {
            steer: Capability::Unsupported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Unsupported,
            rewind: Capability::Unsupported,
        }
    }

    fn pi_caps() -> AgentCapabilities {
        AgentCapabilities {
            steer: Capability::Supported,
            resume: Capability::Supported,
            permission: Capability::Supported,
            configure: Capability::Supported,
            fork: Capability::Supported,
            rewind: Capability::Unsupported,
        }
    }

    #[test]
    fn capabilities_for_provider_matches_honesty_matrix() {
        assert_eq!(capabilities_for_provider("claude"), supported());
        assert_eq!(capabilities_for_provider("codex"), supported());
        assert_eq!(capabilities_for_provider("opencode"), supported());
        assert_eq!(capabilities_for_provider("pi"), pi_caps());
        assert_eq!(capabilities_for_provider("grok"), supported());
        assert_eq!(capabilities_for_provider("gemini"), acp_default());
    }

    #[test]
    fn capabilities_native_synonyms_do_not_fold_acp_registry() {
        assert_eq!(
            capabilities_for_provider("claude-code"),
            capabilities_for_provider("claude")
        );
        assert_eq!(capabilities_for_provider("codex-acp"), acp_default());
        assert_eq!(capabilities_for_provider("pi-acp"), acp_default());
        assert_eq!(capabilities_for_provider("grok-build"), acp_default());
        assert_eq!(capabilities_for_provider("grok-acp"), acp_default());
        assert_eq!(capabilities_for_provider("my-claude"), acp_default());
        assert_eq!(capabilities_for_provider("grok"), supported());
    }

    #[test]
    fn app069_s7_option_support_for_provider_matches_honesty_matrix() {
        let claude = option_support_for_provider("claude");
        assert_eq!(claude.models, Capability::Supported);
        assert_eq!(claude.thinking, Capability::Supported);
        assert_eq!(claude.modes, Capability::Supported);
        assert_eq!(claude.permission_modes, Capability::Supported);

        let codex = option_support_for_provider("codex");
        assert_eq!(codex.models, Capability::Supported);
        assert_eq!(codex.thinking, Capability::Supported);
        assert_eq!(codex.modes, Capability::Supported);
        assert_eq!(codex.permission_modes, Capability::Supported);

        let opencode = option_support_for_provider("opencode");
        assert_eq!(opencode.models, Capability::Supported);
        assert_eq!(opencode.thinking, Capability::Supported);
        assert_eq!(opencode.modes, Capability::Supported);
        assert_eq!(opencode.permission_modes, Capability::Supported);

        let pi = option_support_for_provider("pi");
        assert_eq!(pi.models, Capability::Supported);
        assert_eq!(pi.thinking, Capability::Supported);
        assert_eq!(pi.modes, Capability::Unsupported);
        assert_eq!(pi.permission_modes, Capability::Unsupported);

        let grok = option_support_for_provider("grok");
        assert_eq!(grok.models, Capability::Supported);
        assert_eq!(grok.thinking, Capability::Supported);
        assert_eq!(grok.modes, Capability::Supported);
        assert_eq!(grok.permission_modes, Capability::Supported);

        let acp = option_support_for_provider("grok-build");
        assert_eq!(acp.models, Capability::Supported);
        assert_eq!(acp.thinking, Capability::Supported);
        assert_eq!(acp.modes, Capability::Supported);
        assert_eq!(acp.permission_modes, Capability::Supported);
    }
}
