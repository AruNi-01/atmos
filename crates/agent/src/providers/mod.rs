pub mod acp;
pub mod claude;
pub mod codex;
pub mod grok;
pub mod opencode;
pub mod pi;

#[cfg(test)]
mod ask_user_live_probe_test;
#[cfg(test)]
mod claude_live_tool_ui_test;
#[cfg(test)]
mod codex_live_tool_ui_test;
#[cfg(test)]
mod cursor_live_tool_ui_test;
#[cfg(test)]
mod grok_live_tool_ui_test;
#[cfg(test)]
mod image_live_probe_test;
#[cfg(test)]
mod live_chat_tests;
#[cfg(test)]
mod opencode_live_tool_ui_test;
#[cfg(test)]
mod pi_live_tool_ui_test;

use crate::policy::canonicalize_chat_provider_id;

/// Chat spawn class after native-only canonicalize. Exact id only — not argv or parser.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatProviderKind {
    NativeClaude,
    NativeCodex,
    NativeOpenCode,
    NativePi,
    NativeGrok,
    Acp,
}

/// Route Chat spawn: five native hosts (plus `claude-code` synonyms), everyone else ACP.
pub fn chat_provider_kind(provider_id: &str) -> ChatProviderKind {
    match canonicalize_chat_provider_id(provider_id) {
        "claude" => ChatProviderKind::NativeClaude,
        "codex" => ChatProviderKind::NativeCodex,
        "opencode" => ChatProviderKind::NativeOpenCode,
        "pi" => ChatProviderKind::NativePi,
        "grok" => ChatProviderKind::NativeGrok,
        _ => ChatProviderKind::Acp,
    }
}

#[cfg(test)]
mod tests {
    use super::{chat_provider_kind, ChatProviderKind};

    #[test]
    fn s24_chat_provider_kind_exact_ids() {
        assert_eq!(chat_provider_kind("claude"), ChatProviderKind::NativeClaude);
        assert_eq!(chat_provider_kind("codex"), ChatProviderKind::NativeCodex);
        assert_eq!(
            chat_provider_kind("opencode"),
            ChatProviderKind::NativeOpenCode
        );
        assert_eq!(chat_provider_kind("pi"), ChatProviderKind::NativePi);
        assert_eq!(chat_provider_kind("grok"), ChatProviderKind::NativeGrok);
        assert_eq!(chat_provider_kind("my-claude"), ChatProviderKind::Acp);
        assert_eq!(chat_provider_kind("grok-build"), ChatProviderKind::Acp);
    }

    #[test]
    fn app069_s3_native_grok_is_native_acp_registry_stays_acp() {
        assert_eq!(chat_provider_kind("grok"), ChatProviderKind::NativeGrok);
        assert_eq!(chat_provider_kind("grok-build"), ChatProviderKind::Acp);
        assert_eq!(chat_provider_kind("grok-acp"), ChatProviderKind::Acp);
        assert_eq!(chat_provider_kind("codex-acp"), ChatProviderKind::Acp);
    }

    #[test]
    fn s24_native_synonyms_fold_acp_registry_does_not() {
        for id in ["claude-code", "claude_code"] {
            assert_eq!(
                chat_provider_kind(id),
                ChatProviderKind::NativeClaude,
                "{id}"
            );
        }
        for id in [
            "claude-acp",
            "claude-code-acp",
            "claude-agent-acp",
            "codex-acp",
            "pi-acp",
            "grok-build",
            "grok-acp",
            "gemini",
            "cursor",
            "custom",
            "deepseek-harness",
        ] {
            assert_eq!(chat_provider_kind(id), ChatProviderKind::Acp, "{id}");
        }
    }

    #[test]
    fn s24_does_not_route_by_fuzzy_or_binary_name() {
        assert_eq!(chat_provider_kind("Claude"), ChatProviderKind::Acp);
        assert_eq!(chat_provider_kind("npx"), ChatProviderKind::Acp);
        assert_eq!(
            chat_provider_kind("claude-agent-acp-extra"),
            ChatProviderKind::Acp
        );
    }
}
