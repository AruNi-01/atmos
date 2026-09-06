pub mod acp_factory;
mod apply_event;
pub mod new_chat_configs;
pub mod options;
pub mod prefs;
mod queue;
pub mod service;
pub mod store;
pub mod types;

#[cfg(test)]
mod tests;

pub use acp_factory::{AgentServiceOptionsResolver, DefaultAgentProviderFactory};
pub use new_chat_configs::{
    load_new_chat_configs, new_chat_configs_path, snapshot_from_create_fields,
    upsert_agent_new_chat_config, NewChatConfigsFile,
};
pub use options::{
    builtin_options_probe_plans, options_probe_plan_for, parse_followup_policy,
    terminal_options_from, FollowupPolicy, OptionsPrefetchWorker, OptionsUpdated, PREFETCH_POLL,
};
pub use prefs::{
    agent_chat_prefs_path, load_agent_chat_prefs, save_agent_chat_prefs, save_last_registry_id,
    AgentChatPrefs,
};
pub use service::AgentChatService;
pub use store::AgentChatStore;
pub use types::{
    AgentChatEvent, AgentChatIndexEntry, AgentChatMeta, AgentChatOrigin, AgentChatPayload,
    AgentChatSnapshot, CreateAgentChatRequest, MessagePart, QueueItem, QueueItemStatus,
    RuntimeStatus, SessionUsage, TurnStatus, TurnUsage,
};

pub fn default_agent_data_dir() -> std::path::PathBuf {
    if let Ok(raw) = std::env::var("ATMOS_AGENT_DATA_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return std::path::PathBuf::from(trimmed);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("data")
        .join("agent")
}

pub fn default_chats_dir() -> std::path::PathBuf {
    default_agent_data_dir().join("chats")
}

pub fn options_probe_dir() -> std::path::PathBuf {
    default_agent_data_dir().join("options-probe")
}
