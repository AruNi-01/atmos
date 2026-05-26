pub const BUILTIN_TERMINAL_AGENTS_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../resources/terminal-agents/builtin_agents.json"
);

pub const BUILTIN_TERMINAL_AGENTS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../resources/terminal-agents/builtin_agents.json"
));
