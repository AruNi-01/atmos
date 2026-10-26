pub mod acp_factory;
mod apply_event;
mod coalesce;
pub mod new_chat_configs;
pub mod options;
pub mod prefs;
mod queue;
pub mod service;
pub mod store;
pub mod terminal_prefs;
mod transcript_page;
pub mod transcript_view;
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
    agent_chat_prefs_path, load_agent_chat_prefs, save_agent_chat_prefs, save_favorite_models,
    save_last_registry_id, AgentChatFavoriteModel, AgentChatPrefs,
};
pub use service::{chat_resource_session_id, AgentChatResourceRoot, AgentChatService};
pub use store::AgentChatStore;
pub use terminal_prefs::{
    apply_terminal_agent_prefs_patch, load_terminal_agent_prefs, terminal_agent_prefs_path,
    TerminalAgentFavoriteModel, TerminalAgentLastPick, TerminalAgentPrefs, TerminalAgentPrefsPatch,
};
pub use transcript_view::{
    clamp_message_limit, clamp_tool_get_ids, collect_tool_parts, mark_tool_details_omitted,
    page_messages, strip_event_tool_details, strip_message_tool_details,
    AGENT_CHAT_MESSAGE_PAGE_DEFAULT, AGENT_CHAT_MESSAGE_PAGE_MAX, AGENT_CHAT_TOOL_GET_MAX,
};
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
