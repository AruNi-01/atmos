pub const BUILTIN_TERMINAL_AGENTS_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../resources/terminal-agents/builtin_agents.json"
);

pub const BUILTIN_TERMINAL_AGENTS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../resources/terminal-agents/builtin_agents.json"
));

pub const BUILTIN_TERMINAL_AGENTS_META_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../resources/terminal-agents/builtin_agents.meta.json"
));

/// Ship-time version of `builtin_agents.json`. Bump `builtin_agents.meta.json`
/// whenever default launch flags/commands change so clients can smart-upgrade
/// non-customized user entries.
pub fn builtin_terminal_agents_manifest_version() -> u64 {
    #[derive(serde::Deserialize)]
    struct Meta {
        version: u64,
    }
    serde_json::from_str::<Meta>(BUILTIN_TERMINAL_AGENTS_META_JSON)
        .map(|meta| meta.version)
        .unwrap_or(0)
}
