/// Native Chat synonyms only. ACP registry ids (`claude-acp`, `codex-acp`,
/// `grok-build`, `grok-acp`, `pi-acp`) stay unchanged so spawn stays ACP.
/// Web UI kinship / picker chips live in apps/web (`canonicalizeChatProviderId`).
pub fn canonicalize_chat_provider_id(provider_id: &str) -> &str {
    match provider_id {
        "claude" | "claude-code" | "claude_code" => "claude",
        "codex" => "codex",
        "opencode" => "opencode",
        "pi" => "pi",
        "grok" => "grok",
        other => other,
    }
}
